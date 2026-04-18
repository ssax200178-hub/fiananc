import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import * as XLSX from 'xlsx';
import { parseNumber } from '../utils';

type EntryMode = 'simple' | 'compound' | 'batch';
type InputMethod = 'manual' | 'paste' | 'excel';
type CompoundDirection = 'multi-debit' | 'multi-credit';
type EntrySubType = 'restaurant' | 'normal';

interface EntryLine {
    id: string;
    accountNumber: string;
    subAccountNumber: string;
    amount: number;
    description: string;
    currencyId?: number;
    costCenter?: string;
    reference?: string;
}

const genId = () => Math.random().toString(36).slice(2, 10);

const emptyLine = (): EntryLine => ({
    id: genId(), accountNumber: '', subAccountNumber: '', amount: 0, description: '',
});

interface SearchableAccountProps {
    label: string;
    value: string;
    onChange: (v: string) => void;
    accounts: any[];
    placeholder?: string;
}

const SearchableAccount = React.memo(({ label, value, onChange, accounts, placeholder }: SearchableAccountProps) => {
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = useMemo(() => {
        if (!search.trim()) return accounts.slice(0, 50);
        const s = search.trim().toLowerCase();
        return accounts.filter((a: any) => (a.accountNumber || '').includes(s) || (a.accountName || '').toLowerCase().includes(s)).slice(0, 50);
    }, [accounts, search]);

    const selectedAccount = useMemo(() => accounts.find((a: any) => a.accountNumber === value), [accounts, value]);
    const displayText = selectedAccount ? `${selectedAccount.accountNumber} - ${selectedAccount.accountName}` : (value || '');

    return (
        <div ref={ref} className="relative">
            {label && <label className="block text-xs font-black text-slate-600 dark:text-slate-400 mb-1">{label}</label>}
            <div className="relative">
                <input
                    value={open ? search : displayText}
                    onChange={e => { setSearch(e.target.value); if (!open) setOpen(true); }}
                    onFocus={() => { setOpen(true); setSearch(''); }}
                    placeholder={placeholder || 'ابحث بالرقم أو الاسم...'}
                    className="w-full bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/50 rounded-xl py-2.5 px-3 pl-10 font-bold outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all text-slate-900 dark:text-white text-sm shadow-inner"
                />
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">search</span>
                {value && (
                    <button onClick={(e) => { e.stopPropagation(); onChange(''); setSearch(''); }} className="absolute right-10 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                )}
            </div>
            {open && (
                <div className="absolute z-50 mt-2 w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-white/50 dark:border-slate-700/50 rounded-2xl shadow-2xl max-h-60 overflow-y-auto overflow-x-hidden animate-fade-in divide-y divide-slate-100/50 dark:divide-slate-800/50">
                    {filtered.length === 0 ? (
                        <p className="px-4 py-4 text-sm text-slate-400 font-bold text-center">لا توجد نتائج</p>
                    ) : filtered.map((a: any) => (
                        <button key={a.id || a.accountNumber} onClick={() => { onChange(a.accountNumber); setOpen(false); setSearch(''); }}
                            className={`w-full text-right px-4 py-3 text-sm font-bold hover:bg-violet-50/80 dark:hover:bg-violet-500/10 transition-colors flex items-center gap-3 group/item ${value === a.accountNumber ? 'bg-violet-50/80 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-slate-200'}`}>
                            <span className={`font-mono text-xs min-w-[50px] transition-colors ${value === a.accountNumber ? 'text-violet-600 dark:text-violet-400' : 'text-blue-500 group-hover/item:text-violet-500'}`}>{a.accountNumber}</span>
                            <span className="truncate group-hover/item:-translate-x-1 transition-transform">{a.accountName}</span>
                            {a.branch && <span className="mr-auto text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50">{a.branch}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
});

const JournalEntryPage: React.FC = () => {
    const ctx = useAppContext() as any;
    const { currentUser, addLog, restaurants, paymentAccounts, branches, customCurrencies = [] } = ctx;
    const chartAccounts = ctx.chartAccounts || [];
    const journalEntries = ctx.journalEntries || [];
    const addJournalEntry = ctx.addJournalEntry;

    const autoDetectCreditAccount = useCallback((restName: string, parsedSubAccount?: string, descriptionText?: string) => {
        // 1. Text-based detection via Payment Methods (sub-accounts)
        if (descriptionText && paymentAccounts && paymentAccounts.length > 0) {
            const norm = (str: string) => str ? str.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ي/g, 'ى').replace(/\s+/g, ' ').trim() : '';
            const normDesc = norm(descriptionText);

            // Find all payment accounts (main or sub) whose normalized name is mentioned in the normalized description
            // Or if the description is short and the account name contains it
            const matchedPas = paymentAccounts.filter((pa: any) => {
                const normName = norm(pa.accountName);
                if (!normName) return false;
                return normDesc.includes(normName) || (normDesc.length > 3 && normName.includes(normDesc));
            });

            // Prioritize longest match (e.g., "الشبكة الموحدة" over "الشبكة")
            matchedPas.sort((a: any, b: any) => (b.accountName?.length || 0) - (a.accountName?.length || 0));

            for (const matchedPa of matchedPas) {
                let sysAccNum = matchedPa.systemAccountNumber;
                if (!sysAccNum && matchedPa.parentId) {
                    const parentAcc = paymentAccounts.find((p: any) => p.id === matchedPa.parentId);
                    if (parentAcc?.systemAccountNumber) sysAccNum = parentAcc.systemAccountNumber;
                }
                if (sysAccNum) {
                    const foundAcc = chartAccounts.find((a: any) => a.accountNumber === sysAccNum);
                    return {
                        m: '',
                        s: foundAcc && foundAcc.accountType === 'sub' ? foundAcc.accountNumber : sysAccNum
                    };
                }
            }
        }

        // 2. Fallback to Restaurant Directory
        if (!restName && !parsedSubAccount) return { m: '', s: '' };
        if (!restaurants || restaurants.length === 0) return { m: '', s: '' };

        const rest = restaurants.find((r: any) =>
            (restName && r.name && r.name.includes(restName)) ||
            (parsedSubAccount && r.restaurantAccountNumber === parsedSubAccount)
        );

        if (rest && rest.transferAccounts && rest.transferAccounts.length > 0) {
            const primary = rest.transferAccounts.find((a: any) => a.isPrimary) || rest.transferAccounts[0];
            if (primary && primary.type) {
                // 1. Direct match via mapped system account number
                const pAccount = paymentAccounts?.find((pa: any) => pa.accountName === primary.type);

                let sysAccNum = pAccount?.systemAccountNumber;
                if (!sysAccNum && pAccount?.parentId) {
                    const parentAcc = paymentAccounts?.find((pa: any) => pa.id === pAccount.parentId);
                    if (parentAcc && parentAcc.systemAccountNumber) {
                        sysAccNum = parentAcc.systemAccountNumber;
                    }
                }

                if (sysAccNum) {
                    const foundAcc = chartAccounts.find((a: any) => a.accountNumber === sysAccNum);
                    if (foundAcc) {
                        return {
                            m: '',
                            s: foundAcc.accountType === 'sub' ? foundAcc.accountNumber : foundAcc.accountNumber
                        };
                    }
                }

                // 2. Fallback to exact and then fuzzy string matching for retroactive support
                // We check if the chart account name equals the primary type, or includes it
                const exactSub = chartAccounts.find((a: any) => a.accountType === 'sub' && a.accountName === primary.type);
                if (exactSub) return { m: '', s: exactSub.accountNumber };

                const matchedSub = chartAccounts.find((a: any) => a.accountType === 'sub' && (a.accountName.includes(primary.type) || primary.type.includes(a.accountName)));
                if (matchedSub) {
                    return { m: '', s: matchedSub.accountNumber };
                }
            }
        }
        return { m: '', s: '' };
    }, [restaurants, chartAccounts, paymentAccounts]);

    const canManage = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('journal_entries_manage');

    // --- Shared State ---
    const [mode, setMode] = useState<EntryMode>('simple');
    const [entrySubType, setEntrySubType] = useState<EntrySubType>('restaurant');
    const [inputMethod, setInputMethod] = useState<InputMethod>('manual');
    const [title, setTitle] = useState('');
    const [currencyId, setCurrencyId] = useState(() => customCurrencies.find((c: any) => c.isDefault)?.currencyId || customCurrencies.find((c: any) => c.isActive)?.currencyId || 7);
    const [costCenter, setCostCenter] = useState('');
    const [reference, setReference] = useState('');
    const [description, setDescription] = useState('');

    // Simple
    const [simpleDebitAcc, setSimpleDebitAcc] = useState('');
    const [simpleDebitSub, setSimpleDebitSub] = useState('');
    const [simpleCreditAcc, setSimpleCreditAcc] = useState('');
    const [simpleCreditSub, setSimpleCreditSub] = useState('');
    const [simpleAmount, setSimpleAmount] = useState(0);
    const [simpleDebitDescription, setSimpleDebitDescription] = useState('');
    const [simpleCreditDescription, setSimpleCreditDescription] = useState('');

    // Compound
    const [compoundDirection, setCompoundDirection] = useState<CompoundDirection>('multi-debit');
    const [compoundMultiLines, setCompoundMultiLines] = useState<any[]>([]);
    
    // Paste Processing state
    const [isProcessingPaste, setIsProcessingPaste] = useState(false);
    const [pasteProgress, setPasteProgress] = useState(0);
    const [compoundSingleAcc, setCompoundSingleAcc] = useState('');
    const [compoundSingleSub, setCompoundSingleSub] = useState('');
    const [compoundSingleDescription, setCompoundSingleDescription] = useState('');

    // Batch
    const [batchDebits, setBatchDebits] = useState<{ accountNumber: string; subAccountNumber: string; amount: number; branch?: string; description?: string; restaurantName?: string; currencyId?: number; costCenter?: string; reference?: string; creditAccountNumber?: string; creditSubAccountNumber?: string; }[]>([{ accountNumber: '', subAccountNumber: '', amount: 0 }]);
    const [batchCreditAccount, setBatchCreditAccount] = useState('');
    const [batchCreditSub, setBatchCreditSub] = useState('');
    const [batchCreditDescription, setBatchCreditDescription] = useState('');
    const [batchStartNumber, setBatchStartNumber] = useState(1);
    const batchRestaurantMainAccount = '2000';

    // Paste area
    const [pasteText, setPasteText] = useState('');

    // Preview
    const [showPreview, setShowPreview] = useState(false);
    const [previewLines, setPreviewLines] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);

    // History
    const [showHistory, setShowHistory] = useState(false);

    // Unknown Accounts resolution
    const [pendingParsedData, setPendingParsedData] = useState<any[] | null>(null);
    const [resolveMainAccount, setResolveMainAccount] = useState('');

    // Helpers
    const mainAccounts = useMemo(() => chartAccounts.filter((a: any) => a.accountType === 'main'), [chartAccounts]);
    const getSubAccounts = useCallback((parentNum: string) => chartAccounts.filter((a: any) => a.accountType === 'sub' && a.parentAccountNumber === parentNum), [chartAccounts]);
    const getAccountName = useCallback((num: string) => chartAccounts.find((a: any) => a.accountNumber === num)?.accountName || '', [chartAccounts]);
    const getAccountBranch = useCallback((num: string) => chartAccounts.find((a: any) => a.accountNumber === num)?.branch || '', [chartAccounts]);

    // الحسابات البنكية/السداد فقط - مستخرجة من paymentAccounts المربوطة بدليل الحسابات
    const bankAccounts = useMemo(() => {
        if (!paymentAccounts || paymentAccounts.length === 0) return [];
        const mainPaAccounts = paymentAccounts.filter((pa: any) => pa.isMain && pa.systemAccountNumber);
        const bankChartAccounts: any[] = [];
        mainPaAccounts.forEach((pa: any) => {
            const chartAcc = chartAccounts.find((a: any) => a.accountNumber === pa.systemAccountNumber);
            if (chartAcc) bankChartAccounts.push(chartAcc);
        });
        const subPaAccounts = paymentAccounts.filter((pa: any) => !pa.isMain && pa.systemAccountNumber);
        subPaAccounts.forEach((pa: any) => {
            const chartAcc = chartAccounts.find((a: any) => a.accountNumber === pa.systemAccountNumber);
            if (chartAcc && !bankChartAccounts.find((b: any) => b.accountNumber === chartAcc.accountNumber)) {
                bankChartAccounts.push(chartAcc);
            }
        });
        return bankChartAccounts;
    }, [paymentAccounts, chartAccounts]);

    // --- Parse Data Helpers ---
    const getCurrencyIdFromBranch = useCallback((branchName: string) => {
        if (!branchName) return undefined;
        const branch = (branches || []).find((b: any) => b.name === branchName);
        if (!branch) return undefined;
        if (branch.currencyType === 'old_rial') return 8;
        if (branch.currencyType === 'invoice_book' || branch.currencyType === 'SAR') return 12; // 12 is for invoice book process
        return 7; // new_rial default
    }, [branches]);

    const applyParsedData = (parsed: any[]) => {
        if (mode === 'compound') {
            setCompoundMultiLines(parsed.map(p => ({
                id: genId(),
                accountNumber: p.accountNumber,
                subAccountNumber: p.subAccountNumber,
                amount: p.amount,
                description: p.description || '',
                currencyId: p.currencyId ?? getCurrencyIdFromBranch(p.branch) ?? undefined,
                costCenter: p.costCenter || '',
                reference: p.reference || '',
            })));
        } else if (mode === 'batch') {
            setBatchDebits(parsed.map(p => {
                const autoAcc = entrySubType === 'restaurant' ? autoDetectCreditAccount(p.restaurantName || '', p.subAccountNumber || p.accountNumber, p.description || '') : { m: '', s: '' };
                return {
                    accountNumber: p.accountNumber,
                    subAccountNumber: p.subAccountNumber,
                    amount: p.amount,
                    branch: p.branch || '',
                    description: p.description || '',
                    restaurantName: p.restaurantName || '',
                    currencyId: p.currencyId ?? getCurrencyIdFromBranch(p.branch) ?? undefined,
                    costCenter: p.costCenter || '',
                    reference: p.reference || '',
                    creditAccountNumber: autoAcc.m,
                    creditSubAccountNumber: autoAcc.s,
                };
            }));
        }
        setInputMethod('manual');
        setPasteText('');
        setPendingParsedData(null);
        setResolveMainAccount('');
    };

    const processParsedTokens = async (parsed: any[]) => {
        if (entrySubType === 'normal') {
            // In Normal mode, we don't strictly require unknown account resolution immediately via modal
            // User might have pasted sub-accounts without main accounts. Just apply them directly.
            applyParsedData(parsed);
            return;
        }

        if (entrySubType === 'restaurant') {
            const uniqueUnknowns = new Map<string, any>();

            parsed.forEach(p => {
                // Must ensure the matched sub-account actually belongs to the Restaurant main account!
                const foundSub = chartAccounts.find((a: any) => a.accountType === 'sub' && a.accountNumber === p.subAccountNumber && a.parentAccountNumber === batchRestaurantMainAccount);
                if (foundSub) {
                    p.branch = p.branch || foundSub.branch || '';
                } else {
                    if (p.subAccountNumber && !uniqueUnknowns.has(p.subAccountNumber)) {
                        uniqueUnknowns.set(p.subAccountNumber, p);
                    }
                }
            });

            if (uniqueUnknowns.size > 0) {
                const { addChartAccount, addRestaurant } = ctx;

                for (const p of Array.from(uniqueUnknowns.values())) {
                    // Add to chart of accounts
                    if (addChartAccount) {
                        try {
                            await addChartAccount({
                                accountNumber: p.subAccountNumber,
                                accountName: p.restaurantName || `مطعم ${p.subAccountNumber}`,
                                accountType: 'sub',
                                parentAccountNumber: batchRestaurantMainAccount,
                                branch: p.branch || '',
                                description: 'تمت إضافته آلياً عبر القيود الجماعية',
                            });
                        } catch (e) { console.error("Error auto-adding chart account", e); }
                    }
                    // Add to restaurants directory
                    if (addRestaurant) {
                        try {
                            const rFound = restaurants.find((r: any) => r.restaurantAccountNumber === p.subAccountNumber);
                            if (!rFound) {
                                await addRestaurant({
                                    restaurantAccountNumber: p.subAccountNumber,
                                    name: p.restaurantName || `مطعم ${p.subAccountNumber}`,
                                    branch: p.branch || '',
                                    ownerName: 'غير محدد',
                                    phone: '',
                                    transferAccounts: [],
                                    paymentPeriod: 'monthly',
                                    currencyType: 'new_riyal',
                                });
                            }
                        } catch (e) { console.error("Error auto-adding restaurant", e); }
                    }
                }

                // We apply data. It might take a moment for realtime listeners to catch up
                // with the newly added restaurants/accounts, but the user won't be blocked.
            }

            applyParsedData(parsed);
            return;
        }

        // --- Compound Mode Check ---
        let hasUnknown = false;
        parsed.forEach(p => {
            const found = chartAccounts.find((a: any) => a.accountNumber === p.accountNumber);
            if (found) {
                // الحساب موجود — استخدمه كما هو بدون تحويل تلقائي
                p.branch = p.branch || found.branch || '';
            } else {
                p.isUnknown = true;
                hasUnknown = true;
            }
        });

        if (hasUnknown) {
            setPendingParsedData(parsed);
        } else {
            applyParsedData(parsed);
        }
    };

    const handleConfirmUnknowns = () => {
        if (!pendingParsedData || !resolveMainAccount) return alert('يرجى اختيار الحساب الرئيسي');
        const updated = pendingParsedData.map(p => {
            if (p.isUnknown) {
                return { ...p, subAccountNumber: p.accountNumber, accountNumber: resolveMainAccount };
            }
            return p;
        });
        applyParsedData(updated);
    };

    const handleCancelUnknowns = () => {
        setPendingParsedData(null);
        setResolveMainAccount('');
    };

    // --- Parse Paste Data ---
    const handlePasteApply = async () => {
        const lines = pasteText.trim().split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) return alert('لا توجد بيانات');

        setIsProcessingPaste(true);
        setPasteProgress(0);

        const parsed: any[] = [];
        const chunkSize = 200;

        for (let i = 0; i < lines.length; i += chunkSize) {
            await new Promise(res => setTimeout(res, 5));
            const chunk = lines.slice(i, i + chunkSize);

            for (const line of chunk) {
                const parts = line.split(/[\t]/).map(p => p.trim());
                if (entrySubType === 'restaurant') {
                    // Format: الحساب التحليلي \t المبلغ \t اسم المطعم \t البيان \t المسدد/جهة الدفع
                    // Check format dynamically based on columns
                    let rawPayer = '';
                    let tempSubAcc = '';
                    let tempAmount = 0;
                    let tempRestName = '';
                    let tempDesc = '';
                    let tempBranch = '';
                    
                    const isCol0Num = parts[0] && parts[0].match(/^\\d+$/);
                    const isCol1Amount = !isNaN(parseNumber(parts[1]));

                    if (parts.length >= 6 && isCol0Num && isCol1Amount) {
                        // 6 Columns: Account | Amount | Restaurant | Description | Payer | Branch
                        tempSubAcc = parts[0] || '';
                        tempAmount = parseNumber(parts[1]) || 0;
                        tempRestName = parts[2] || '';
                        tempDesc = parts[3] || '';
                        rawPayer = parts[4] || '';
                        tempBranch = parts[5] || '';
                    } else if (!isNaN(parseNumber(parts[3])) && parts[4] && parts[4].match(/^\\d+$/)) {
                        // Alt new format: Branch | Payer | Restaurant | Amount | Analytical
                        tempBranch = parts[0] || '';
                        rawPayer = parts[1] || '';
                        tempRestName = parts[2] || '';
                        tempAmount = parseNumber(parts[3]) || 0;
                        tempSubAcc = parts[4] || '';
                    } else {
                        // Old 5-column format: الحساب التحليلي \\t المبلغ \\t اسم المطعم \\t البيان \\t المسدد/جهة الدفع
                        tempSubAcc = parts[0] || '';
                        tempAmount = parseNumber(parts[1]) || 0;
                        tempRestName = parts[2] || '';
                        tempDesc = parts[3] || '';
                        rawPayer = parts[4] || '';
                    }

                    let creditS = '';
                    const matchedBranch = (branches || []).find((b: any) => tempBranch && (b.name === tempBranch || b.id === tempBranch));
                    
                    if (rawPayer) {
                        const detect = autoDetectCreditAccount('', '', rawPayer);
                        if (detect.s) creditS = detect.s;
                    }
                    if (!creditS) {
                        const detect = autoDetectCreditAccount(tempRestName, tempSubAcc, rawPayer || tempDesc);
                        if (detect.s) creditS = detect.s;
                    }
                    if (!creditS && matchedBranch && matchedBranch.creditSubAccountNumber) {
                        creditS = matchedBranch.creditSubAccountNumber;
                    }

                    parsed.push({
                        accountNumber: batchRestaurantMainAccount,
                        subAccountNumber: tempSubAcc,
                        amount: tempAmount,
                        restaurantName: tempRestName,
                        description: tempDesc,
                        branch: matchedBranch ? matchedBranch.name : (tempBranch || getAccountBranch(tempSubAcc)),
                        creditAccountNumber: '', // Always empty initially
                        creditSubAccountNumber: creditS
                    });
                } else {
                    parsed.push({
                        accountNumber: parts[0] || '',
                        subAccountNumber: parts[1] || '',
                        amount: parseNumber(parts[2]) || 0,
                        currencyId: parseInt(parts[3]) || undefined,
                        description: parts[4] || '',
                        costCenter: parts[5] || '',
                        reference: parts[6] || '',
                        restaurantName: '',
                        branch: '',
                    });
                }
            }
            setPasteProgress(Math.min(100, Math.round(((i + chunkSize) / lines.length) * 100)));
        }

        const filteredParsed = parsed.filter(p => p.accountNumber || p.subAccountNumber);
        await processParsedTokens(filteredParsed);
        
        setIsProcessingPaste(false);
        setPasteText(''); // auto clear
    };

    // --- Handle Excel Upload for entries ---
    const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const wb = XLSX.read(evt.target?.result, { type: 'binary' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const data: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });
                const rows = data.slice(1).filter((r: any[]) => r.some(c => c !== undefined && c !== ''));
                const parsed = rows.map((r: any[]) => {
                    if (entrySubType === 'restaurant') {
                        let rawPayer = '';
                        let tempSubAcc = '';
                        let tempAmount = 0;
                        let tempRestName = '';
                        let tempDesc = '';
                        let tempBranch = '';
                        const c0 = String(r[0] || '').trim();
                        const c1 = String(r[1] || '').trim();
                        const c2 = String(r[2] || '').trim();
                        const c3 = String(r[3] || '').trim();
                        const c4 = String(r[4] || '').trim();
                        const c5 = String(r[5] || '').trim();

                        const isCol0Num = c0 && c0.match(/^\\d+$/);
                        const isCol1Amount = !isNaN(parseNumber(c1));

                        if (r.length >= 6 && isCol0Num && isCol1Amount) {
                            tempSubAcc = c0;
                            tempAmount = parseNumber(c1) || 0;
                            tempRestName = c2;
                            tempDesc = c3;
                            rawPayer = c4;
                            tempBranch = c5;
                        } else if (!isNaN(parseNumber(c3)) && c4 && c4.match(/^\\d+$/)) {
                            tempBranch = c0;
                            rawPayer = c1;
                            tempRestName = c2;
                            tempAmount = parseNumber(c3) || 0;
                            tempSubAcc = c4;
                        } else {
                            tempSubAcc = c0;
                            tempAmount = parseNumber(c1) || 0;
                            tempRestName = c2;
                            tempDesc = c3;
                            rawPayer = c4;
                        }

                        let creditS = '';
                        const matchedBranch = (branches || []).find((b: any) => tempBranch && (b.name === tempBranch || b.id === tempBranch));
                        
                        if (rawPayer) {
                            const detect = autoDetectCreditAccount('', '', rawPayer);
                            if (detect.s) creditS = detect.s;
                        }
                        if (!creditS) {
                            const detect = autoDetectCreditAccount(tempRestName, tempSubAcc, rawPayer || tempDesc);
                            if (detect.s) creditS = detect.s;
                        }
                        if (!creditS && matchedBranch && matchedBranch.creditSubAccountNumber) {
                            creditS = matchedBranch.creditSubAccountNumber;
                        }

                        return {
                            accountNumber: batchRestaurantMainAccount,
                            subAccountNumber: tempSubAcc,
                            amount: tempAmount,
                            restaurantName: tempRestName,
                            description: tempDesc,
                            branch: matchedBranch ? matchedBranch.name : (tempBranch || getAccountBranch(tempSubAcc)),
                            creditAccountNumber: '',
                            creditSubAccountNumber: creditS
                        };
                    } else {
                        return {
                            accountNumber: String(r[0] || '').trim(),
                            subAccountNumber: String(r[1] || '').trim(),
                            amount: parseNumber(r[2]),
                            currencyId: parseInt(r[3]) || undefined,
                            description: String(r[4] || '').trim(),
                            costCenter: String(r[5] || '').trim(),
                            reference: String(r[6] || '').trim(),
                            restaurantName: '',
                            branch: '',
                        };
                    }
                }).filter((p: any) => p.accountNumber || p.subAccountNumber);

                processParsedTokens(parsed);
            } catch (err) { console.error(err); alert('خطأ في قراءة الملف'); }
        };
        reader.readAsBinaryString(file);
        e.target.value = '';
    };

    // --- Build Preview ---
    const buildPreview = () => {
        // costCenter and reference are optional
        const lines: any[] = [];
        const desc = description || title || 'قيد';

        if (mode === 'simple') {
            if (!simpleDebitAcc || !simpleCreditAcc || simpleAmount <= 0) return alert('يرجى تعبئة جميع الحقول');
            lines.push({ entryNumber: 1, accountNumber: simpleDebitAcc, subAccountNumber: simpleDebitSub, debit: simpleAmount, credit: 0, currencyId, description: simpleDebitDescription || description || desc, costCenter, reference, branch: getAccountBranch(simpleDebitSub || simpleDebitAcc) });
            lines.push({ entryNumber: 1, accountNumber: simpleCreditAcc, subAccountNumber: simpleCreditSub, debit: 0, credit: simpleAmount, currencyId, description: simpleCreditDescription || description || desc, costCenter, reference, branch: getAccountBranch(simpleCreditSub || simpleCreditAcc) });
        } else if (mode === 'compound') {
            const validLines = compoundMultiLines.filter(d => d.accountNumber && d.amount > 0);
            if (validLines.length === 0 || !compoundSingleAcc) return alert('يرجى إضافة حسابات ومبالغ');
            const total = validLines.reduce((s, d) => s + d.amount, 0);

            if (compoundDirection === 'multi-debit') {
                validLines.forEach(d => {
                    lines.push({ entryNumber: 1, accountNumber: d.accountNumber, subAccountNumber: d.subAccountNumber, debit: d.amount, credit: 0, currencyId, description: d.description || desc, costCenter, reference, branch: getAccountBranch(d.subAccountNumber || d.accountNumber) });
                });
                lines.push({ entryNumber: 1, accountNumber: compoundSingleAcc, subAccountNumber: compoundSingleSub, debit: 0, credit: total, currencyId, description: compoundSingleDescription || desc, costCenter, reference, branch: getAccountBranch(compoundSingleSub || compoundSingleAcc) });
            } else {
                lines.push({ entryNumber: 1, accountNumber: compoundSingleAcc, subAccountNumber: compoundSingleSub, debit: total, credit: 0, currencyId, description: compoundSingleDescription || desc, costCenter, reference, branch: getAccountBranch(compoundSingleSub || compoundSingleAcc) });
                validLines.forEach(d => {
                    lines.push({ entryNumber: 1, accountNumber: d.accountNumber, subAccountNumber: d.subAccountNumber, debit: 0, credit: d.amount, currencyId, description: d.description || desc, costCenter, reference, branch: getAccountBranch(d.subAccountNumber || d.accountNumber) });
                });
            }
        } else {
            const validBatch = batchDebits.filter(d => d.accountNumber && d.amount > 0);
            if (validBatch.length === 0) return alert('يرجى إضافة حسابات ومبالغ مدينة');

            if (entrySubType === 'restaurant') {
                if (validBatch.some(d => !d.creditSubAccountNumber)) return alert('⚠️ خطأ: يوجد مطاعم لم يُحدد لها "المسدد" (الحساب الدائن). يرجى اختيار جهة السداد لكل مطعم مدخل.');
            } else {
                if (validBatch.some(d => !(d.creditAccountNumber || batchCreditAccount))) return alert('يوجد أسطر لم يحدد لها حساب دائن (المسدد)، يرجى تحديدها للأسطر أو وضع حساب دائن ثابت في الأسفل');
            }

            const getBranchCurrencyId = (branchName: string) => {
                if (!branchName) return null;
                const branchObj = branches?.find((b: any) => b.name === branchName);
                if (!branchObj) return null;
                if (branchObj.currencyId) return branchObj.currencyId;
                if (branchObj.currencyType === 'old_rial') return 8;
                if (branchObj.currencyType === 'new_rial') return 7;
                return null;
            };

            validBatch.forEach((d, i) => {
                const num = batchStartNumber + i;
                const debitDesc = d.description || desc;
                const creditDesc = d.restaurantName ? `لكم سداد مطعم ${d.restaurantName}` : (batchCreditDescription || d.description || desc);
                const cMain = d.creditAccountNumber || batchCreditAccount;
                const cSub = d.creditSubAccountNumber || batchCreditSub;

                const branchCurrency = getBranchCurrencyId(d.branch) || d.currencyId || currencyId;

                lines.push({ entryNumber: num, accountNumber: d.accountNumber, subAccountNumber: d.subAccountNumber, debit: d.amount, credit: 0, currencyId: branchCurrency, description: debitDesc, costCenter: d.costCenter || costCenter, reference: d.reference || reference, branch: d.branch });
                lines.push({ entryNumber: num, accountNumber: cMain, subAccountNumber: cSub, debit: 0, credit: d.amount, currencyId: branchCurrency, description: creditDesc, costCenter: d.costCenter || costCenter, reference: d.reference || reference, branch: d.branch });
            });
        }
        setPreviewLines(lines);
        setShowPreview(true);
    };

    const totalDebit = previewLines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredit = previewLines.reduce((s, l) => s + (l.credit || 0), 0);

    // Group preview lines by branch for batch mode
    const branchGroups = useMemo(() => {
        if (mode !== 'batch') return [];
        const groups: { branch: string; lines: any[] }[] = [];
        previewLines.forEach(l => {
            const br = l.branch || 'غير محدد';
            let group = groups.find(g => g.branch === br);
            if (!group) { group = { branch: br, lines: [] }; groups.push(group); }
            group.lines.push(l);
        });
        return groups;
    }, [previewLines, mode]);

    const getCurrencyNameStr = (cId: any) => {
        const c = customCurrencies?.find((x:any) => x.currencyId === Number(cId));
        if (c) return c.name;
        if (Number(cId) === 7) return 'ريال جديد (7)';
        if (Number(cId) === 8) return 'ريال قديم (8)';
        if (Number(cId) === 12) return 'عملية دفتر فواتير (12)';
        return cId || '';
    };

    const handleCopy = (linesToCopy?: any[]) => {
        const data = linesToCopy || previewLines;
        const header = ['رقم القيد', 'رقم الحساب', 'رقم الحساب التحليلي', 'مدين', 'دائن', 'العملة', 'البيان', 'مركز التكلفة', 'رقم المرجع'].join('\t');
        const rows = data.map(l => [l.entryNumber, l.accountNumber, l.subAccountNumber, l.debit || '', l.credit || '', getCurrencyNameStr(l.currencyId), l.description, l.costCenter, l.reference].join('\t'));
        const td = data.reduce((s: number, l: any) => s + (l.debit || 0), 0);
        const tc = data.reduce((s: number, l: any) => s + (l.credit || 0), 0);
        rows.push(['', '', '', td, tc, '', 'الإجمالي', '', ''].join('\t'));
        navigator.clipboard.writeText([header, ...rows].join('\n'));
        alert('✓ تم نسخ البيانات');
    };

    const handleExportExcel = () => {
        const headers = ['رقم القيد', 'رقم الحساب', 'الحساب التحليلي', 'اسم الحساب', 'مدين', 'دائن', 'العملة', 'البيان', 'مركز التكلفة', 'المرجع', 'الفرع'];
        const rows = previewLines.map(l => [l.entryNumber, l.accountNumber, l.subAccountNumber, getAccountName(l.subAccountNumber || l.accountNumber), l.debit || '', l.credit || '', getCurrencyNameStr(l.currencyId), l.description, l.costCenter, l.reference, l.branch || '']);
        rows.push(['', '', '', '', totalDebit, totalCredit, '', 'الإجمالي', '', '', '']);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws['!cols'] = headers.map(() => ({ wch: 16 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'القيد');
        XLSX.writeFile(wb, `قيد_${new Date().toLocaleDateString('ar-SA').replace(/\//g, '-')}.xlsx`);
    };

    const handleSave = async () => {
        if (previewLines.length === 0) return alert('⚠️ خطأ: لا يوجد قيد للحفظ');
        if (Math.abs(totalDebit - totalCredit) > 0.01) return alert('⚠️ خطأ: القيد غير متزن. المدين لا يساوي الدائن.');
        if (totalDebit <= 0) return alert('⚠️ خطأ: لا يمكن حفظ قيد بقيمة صفرية');

        setSaving(true);
        try {
            const entryLines = previewLines.map(l => ({ id: genId(), entryNumber: l.entryNumber, accountNumber: l.accountNumber, subAccountNumber: l.subAccountNumber, debitAmount: l.debit || 0, creditAmount: l.credit || 0, currencyId: l.currencyId, description: l.description, costCenter: l.costCenter, reference: l.reference }));
            await addJournalEntry({ entryType: mode, title: title || description || 'قيد', lines: entryLines, totalDebit, totalCredit, currencyId, status: 'completed' });
            addLog('إنشاء قيد', `تم إنشاء قيد ${mode === 'simple' ? 'بسيط' : mode === 'compound' ? 'مركب' : 'جماعي'} — المبلغ: ${totalDebit.toLocaleString()}`, 'general');
            alert('✅ تم حفظ القيد بنجاح');
            setShowPreview(false);
        } catch (err) { console.error(err); alert('❌ حدث خطأ أثناء الحفظ'); }
        setSaving(false);
    };

    if (!canManage) {
        return (<div className="p-8 text-center"><span className="material-symbols-outlined text-6xl text-red-300">lock</span><p className="text-xl font-black text-red-500 mt-4">ليس لديك صلاحية</p></div>);
    }

    return (
        <div className="p-4 md:p-8 space-y-6 animate-fade-in" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black bg-gradient-to-l from-violet-600 to-purple-600 bg-clip-text text-transparent drop-shadow-sm flex items-center gap-3">
                        <div className="p-2 bg-violet-100 dark:bg-violet-900/40 rounded-xl flex items-center justify-center text-violet-600 dark:text-violet-400">
                            <span className="material-symbols-outlined text-3xl">edit_note</span>
                        </div>
                        إنشاء القيود المحاسبية
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-bold">إنشاء قيود بسيطة ومركبة وجماعية مع معاينة وتصدير</p>
                </div>
                <button onClick={() => setShowHistory(!showHistory)} className="px-5 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl font-black text-slate-600 dark:text-slate-300 hover:shadow-md transition-all flex items-center gap-2">
                    <span className="material-symbols-outlined">history</span> سجل القيود ({journalEntries.length})
                </button>
            </div>

            {/* Mode Selector */}
            <div className="flex bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl p-1.5 rounded-3xl w-fit mx-auto mb-6 shadow-sm border border-white/60 dark:border-slate-700/50 relative">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 to-fuchsia-500/5 rounded-3xl pointer-events-none"></div>
                {([['simple', 'receipt', 'قيد بسيط'], ['compound', 'receipt_long', 'قيد مركب'], ['batch', 'dynamic_feed', 'قيود جماعية']] as const).map(([m, icon, label]) => (
                    <button key={m} onClick={() => setMode(m)} className={`relative z-10 px-8 py-2.5 rounded-2xl font-black text-sm flex items-center gap-2.5 transition-all duration-300 ${mode === m ? 'bg-white/90 dark:bg-slate-700/90 text-violet-700 dark:text-violet-300 shadow-md scale-100 border border-white/50' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/30 dark:hover:bg-slate-700/30 scale-95 hover:scale-100'}`}>
                        <span className="material-symbols-outlined text-[20px]">{icon}</span>{label}
                    </button>
                ))}
            </div>

            {/* Entry Sub-Type Selector — يظهر فقط للقيد المركب والجماعي */}
            {(mode === 'compound' || mode === 'batch') && (
                <div className="flex items-center justify-center gap-4 mb-6">
                    <span className="text-sm font-black text-slate-500">نوع الإدخال:</span>
                    <div className="flex gap-2">
                        <button onClick={() => setEntrySubType('restaurant')} className={`px-4 py-1.5 rounded-full text-xs font-black transition-all border ${entrySubType === 'restaurant' ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 border-orange-200' : 'bg-transparent text-slate-500 border-slate-200 hover:bg-slate-50'}`}>سداد مطاعم</button>
                        <button onClick={() => setEntrySubType('normal')} className={`px-4 py-1.5 rounded-full text-xs font-black transition-all border ${entrySubType === 'normal' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 border-blue-200' : 'bg-transparent text-slate-500 border-slate-200 hover:bg-slate-50'}`}>قيد طبيعي</button>
                    </div>
                </div>
            )}

            {/* Shared Fields */}
            {mode === 'simple' && (
                <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-3xl p-6 shadow-xl border border-white/50 dark:border-slate-700/50 relative overflow-hidden group transition-all duration-500 hover:shadow-2xl hover:border-violet-500/30">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-violet-400/5 dark:bg-violet-600/10 rounded-full blur-3xl -z-10 transition-transform duration-700 group-hover:scale-150 group-hover:bg-violet-400/10"></div>
                    <div className="flex flex-wrap items-end gap-5">
                        <div className="flex-1 min-w-[200px]"><label className="block text-xs font-black text-slate-600 dark:text-slate-400 mb-1.5 ml-1">عنوان القيد / البيان العام</label><input value={title} onChange={e => { setTitle(e.target.value); setDescription(e.target.value); }} placeholder="البيان إذا لم يحدد للأطراف..." className="w-full bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/50 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all shadow-inner" /></div>
                        <div className="w-44"><label className="block text-xs font-black text-slate-600 dark:text-slate-400 mb-1.5 ml-1">العملة <span className="text-red-400">*</span></label>
                        <select value={currencyId} onChange={e => setCurrencyId(Number(e.target.value))} className="w-full bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/50 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all shadow-inner appearance-none">
                            {customCurrencies.length === 0 && <option value={7}>ريال جديد (7)</option>}
                            {customCurrencies.filter((c: any) => c.isActive).map((c: any) => (
                                <option key={c.currencyId} value={c.currencyId}>{c.name} ({c.currencyId})</option>
                            ))}
                        </select></div>
                        <div className="w-36"><label className="block text-xs font-black text-slate-600 dark:text-slate-400 mb-1.5 ml-1">مركز التكلفة</label><input value={costCenter} onChange={e => setCostCenter(e.target.value)} placeholder="اختياري" className="w-full bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/50 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all shadow-inner" /></div>
                        <div className="w-36"><label className="block text-xs font-black text-slate-600 dark:text-slate-400 mb-1.5 ml-1">رقم المرجع</label><input value={reference} onChange={e => setReference(e.target.value)} placeholder="اختياري" className="w-full bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/50 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all shadow-inner" /></div>
                    </div>
                </div>
            )}

            {/* Input Method Selector (for compound & batch) */}
            {mode !== 'simple' && (
                <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-3xl p-6 shadow-xl border border-white/50 dark:border-slate-700/50 mb-4 animate-fade-in transition-all">
                    <div className="flex gap-2 border-b border-slate-200/50 dark:border-slate-700/50 pb-4">
                        {([['manual', 'edit', 'تعبئة يدوية'], ['paste', 'content_paste', 'لصق بيانات'], ['excel', 'upload_file', 'رفع Excel']] as const).map(([m, icon, label]) => (
                            <button key={m} onClick={() => setInputMethod(m)} className={`px-4 py-2 rounded-lg font-black text-xs flex items-center gap-1.5 transition-all ${inputMethod === m ? 'bg-violet-50 text-violet-600 border border-violet-200' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <span className="material-symbols-outlined text-[16px]">{icon}</span>{label}
                            </button>
                        ))}
                    </div>

                    {/* Paste Area */}
                    {inputMethod === 'paste' && (
                        <div className="mt-4 space-y-3">
                            {entrySubType === 'restaurant' ? (
                                <p className="text-sm text-slate-500 font-bold">الصق البيانات من Excel (كل سطر: <span className="text-orange-500">الحساب التحليلي ← المبلغ ← اسم المطعم ← البيان ← المسدد/جهة التحويل</span>) مفصولة بـ Tab</p>
                            ) : (
                                <p className="text-sm text-slate-500 font-bold">الصق البيانات من Excel (كل سطر: <span className="text-blue-500">الحساب الرئيسي ← الحساب التحليلي ← المبلغ ← العملة ← البيان ← مركز التكلفة ← الرقم المرجعي</span>) مفصولة بـ Tab</p>
                            )}
                            <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={8}
                                placeholder={entrySubType === 'restaurant'
                                    ? "3107\t26208\tجريل اند تشل\tعليكم مقابل تحويل...\tمحفظة نقطة جيب\n3135\t136227\tمطعم السعادة\tعليكم مقابل تحويل...\tصنعاء"
                                    : "1101\t\t50000\t7\tمصاريف إدارية\t6\tREF-001\n1102\t11021\t30000\t7\tمصاريف تشغيلية\t\t"
                                }
                                dir="ltr" className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-dashed border-violet-300 dark:border-violet-700 rounded-2xl p-4 font-mono text-sm outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-slate-900 dark:text-white" />
                            <button onClick={handlePasteApply} disabled={isProcessingPaste} className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl font-black flex items-center gap-2 shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                {isProcessingPaste ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">check</span>}
                                {isProcessingPaste ? `جاري معالجة البيانات (${pasteProgress}%)` : 'تطبيق البيانات'}
                            </button>
                            {isProcessingPaste && (
                                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mt-2 overflow-hidden shadow-inner">
                                  <div className="bg-violet-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${pasteProgress}%` }}></div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Excel Upload */}
                    {inputMethod === 'excel' && (
                        <div className="mt-4">
                            <label className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-emerald-300 dark:border-emerald-700 rounded-2xl cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors">
                                <span className="material-symbols-outlined text-4xl text-emerald-500">cloud_upload</span>
                                {entrySubType === 'restaurant' ? (
                                    <p className="font-bold text-slate-600 dark:text-slate-300">اختر ملف Excel <span className="text-orange-500">(رقم حساب، المبلغ، اسم المطعم، البيان، الفرع)</span></p>
                                ) : (
                                    <p className="font-bold text-slate-600 dark:text-slate-300">اختر ملف Excel <span className="text-blue-500">(الحساب الرئيسي، التحليلي، المبلغ، العملة، البيان، مركز التكلفة، المرجع)</span></p>
                                )}
                                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
                            </label>
                        </div>
                    )}
                </div>
            )}

            {/* Mode-specific form */}
            {renderModeForm()}

            {/* Generate Preview */}
            <button onClick={buildPreview} className="w-full py-5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-3xl font-black text-lg shadow-[0_10px_40px_-10px_rgba(139,92,246,0.6)] transition-all duration-300 flex items-center justify-center gap-3 hover:-translate-y-1 active:scale-[0.98] relative overflow-hidden group">
                <span className="absolute inset-0 w-full h-full -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-shimmer pointer-events-none"></span>
                <span className="material-symbols-outlined text-3xl transition-transform duration-300 group-hover:rotate-12">preview</span> معاينة واعتماد القيد
            </button>

            {/* Unknown Accounts Modal */}
            {pendingParsedData && renderUnknownAccountsModal()}

            {/* Preview Modal */}
            {showPreview && renderPreviewModal()}

            {/* History */}
            {showHistory && renderHistory()}
        </div>
    );

    // ===================== FORM RENDERERS =====================


    function renderAccountSelect(label: string, value: string, onChange: (v: string) => void, subValue: string, onSubChange: (v: string) => void) {
        // إذا كان الحساب دائن/مسدد → نعرض فقط الحسابات البنكية
        const isCreditSelector = label.includes('الدائن') || label.includes('دائن') || label.includes('المسدد');
        const accountsList = isCreditSelector ? (bankAccounts.length > 0 ? bankAccounts.filter((a: any) => a.accountType === 'main') : mainAccounts) : chartAccounts;
        const getFilteredSubs = (parentNum: string) => {
            if (isCreditSelector && bankAccounts.length > 0) {
                // نعرض الحسابات الفرعية البنكية فقط
                return bankAccounts.filter((a: any) => a.accountType === 'sub' && a.parentAccountNumber === parentNum);
            }
            return getSubAccounts(parentNum);
        };
        return (
            <div className="space-y-2">
                <SearchableAccount label={`${label} — الحساب${isCreditSelector ? ' (بنكي)' : ''}`} value={value} onChange={v => { onChange(v); onSubChange(''); }} accounts={accountsList} />
                {value && getFilteredSubs(value).length > 0 && (
                    <SearchableAccount label={`${label} — التحليلي`} value={subValue} onChange={onSubChange} accounts={getFilteredSubs(value)} />
                )}
            </div>
        );
    }

    function renderModeForm() {
        if (mode === 'simple') return (
            <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-3xl p-6 shadow-xl border border-white/50 dark:border-slate-700/50 space-y-5 animate-fade-in relative overflow-hidden group transition-all duration-500 hover:shadow-2xl hover:border-violet-500/30">
                <div className="absolute top-0 right-0 w-64 h-64 bg-violet-400/5 dark:bg-violet-600/10 rounded-full blur-3xl -z-10 transition-transform duration-700 group-hover:scale-150 group-hover:bg-violet-400/10"></div>

                <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3 text-slate-800 dark:text-white font-black text-sm">
                    <span className="material-symbols-outlined text-violet-500 text-[18px]">receipt</span> تفاصيل القيد
                </div>

                <div className="flex flex-col gap-4">
                    {/* الطرف الدائن */}
                    <div className="flex items-center gap-2 p-3 bg-red-50/30 border border-red-100 rounded-xl">
                        <div className="flex-1 flex gap-2 w-full flex-wrap">
                            <div className="flex-1 w-full min-w-[200px]">{renderAccountSelect('دائن', simpleCreditAcc, setSimpleCreditAcc, simpleCreditSub, setSimpleCreditSub)}</div>
                            <div className="flex-1 w-full min-w-[200px]"><label className="block text-xs font-black text-slate-600 mt-2">المبلغ الدائن</label><input type="number" value={simpleAmount || ''} onChange={e => setSimpleAmount(Number(e.target.value))} placeholder="المبلغ الدائن" className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-sm font-bold text-red-600 font-mono outline-none focus:border-red-400" /></div>
                            <div className="flex-1 w-full min-w-[300px]"><label className="block text-xs font-black text-slate-600 mt-2">بيان الدائن</label><input value={simpleCreditDescription} onChange={e => setSimpleCreditDescription(e.target.value)} placeholder="البيان للطرف الدائن..." className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold outline-none" /></div>
                        </div>
                    </div>
                    {/* الطرف المدين */}
                    <div className="flex items-center gap-2 p-3 bg-emerald-50/30 border border-emerald-100 rounded-xl">
                        <div className="flex-1 flex gap-2 w-full flex-wrap">
                            <div className="flex-1 w-full min-w-[200px]">{renderAccountSelect('مدين', simpleDebitAcc, setSimpleDebitAcc, simpleDebitSub, setSimpleDebitSub)}</div>
                            <div className="flex-1 w-full min-w-[200px]"><label className="block text-xs font-black text-slate-600 mt-2">المبلغ المدين</label><input type="number" value={simpleAmount || ''} onChange={e => setSimpleAmount(Number(e.target.value))} placeholder="المبلغ المدين" className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-sm font-bold text-emerald-600 font-mono outline-none focus:border-emerald-400" /></div>
                            <div className="flex-1 w-full min-w-[300px]"><label className="block text-xs font-black text-slate-600 mt-2">بيان المدين</label><input value={simpleDebitDescription} onChange={e => setSimpleDebitDescription(e.target.value)} placeholder="البيان للطرف المدين..." className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold outline-none" /></div>
                        </div>
                    </div>
                </div>
            </div>
        );

        if (mode === 'compound') return (
            <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-3xl p-6 shadow-xl border border-white/50 dark:border-slate-700/50 space-y-6 mt-4 relative overflow-hidden animate-fade-in group transition-all duration-500 hover:shadow-2xl hover:border-amber-500/30">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400/5 dark:bg-amber-600/10 rounded-full blur-3xl -z-10 transition-transform duration-700 group-hover:scale-150 group-hover:bg-amber-400/10"></div>
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
                    <h3 className="font-black text-sm text-slate-800 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-amber-500 text-[18px]">receipt_long</span> تفاصيل القيد المركب
                    </h3>
                    {/* Direction toggle */}
                    <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1">
                        <button onClick={() => setCompoundDirection('multi-debit')} className={`px-4 py-1.5 rounded-md text-xs font-black transition-all ${compoundDirection === 'multi-debit' ? 'bg-white border border-slate-200 shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>عدة مدين ← دائن</button>
                        <button onClick={() => setCompoundDirection('multi-credit')} className={`px-4 py-1.5 rounded-md text-xs font-black transition-all ${compoundDirection === 'multi-credit' ? 'bg-white border border-slate-200 shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>مدين ← عدة دائن</button>
                    </div>
                </div>

                {/* Multi side */}
                <div className={`p-3 rounded-xl border space-y-3 ${compoundDirection === 'multi-debit' ? 'bg-red-50/30 dark:bg-red-900/10 border-red-100 dark:border-red-900/30' : 'bg-emerald-50/30 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30'}`}>
                    <div className="flex items-center justify-between border-b border-black/5 pb-2">
                        <p className={`font-black flex items-center gap-2 text-sm ${compoundDirection === 'multi-debit' ? 'text-red-600' : 'text-emerald-600'}`}>
                            <span className="material-symbols-outlined text-[18px]">{compoundDirection === 'multi-debit' ? 'arrow_circle_up' : 'arrow_circle_down'}</span>
                            {compoundDirection === 'multi-debit' ? 'الأطراف المدينة' : 'الأطراف الدائنة'} ({compoundMultiLines.length})
                        </p>
                        <button onClick={() => setCompoundMultiLines(p => [...p, emptyLine()])} className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 rounded-lg font-bold text-xs hover:shadow-sm transition flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">add</span> إضافة</button>
                    </div>
                    {compoundMultiLines.map((d, i) => (
                        <div key={d.id} className="flex flex-wrap gap-2 items-end bg-white dark:bg-slate-900 p-3 rounded-xl">
                            <div className="flex-1 min-w-[130px]"><SearchableAccount label="" value={d.accountNumber} onChange={v => { const lines = [...compoundMultiLines]; lines[i] = { ...lines[i], accountNumber: v }; setCompoundMultiLines(lines); }} accounts={mainAccounts} placeholder="حساب رئيسي..." /></div>
                            <div className="flex-1 min-w-[130px]">{d.accountNumber && getSubAccounts(d.accountNumber).length > 0 ? <SearchableAccount label="" value={d.subAccountNumber} onChange={v => { const lines = [...compoundMultiLines]; lines[i] = { ...lines[i], subAccountNumber: v }; setCompoundMultiLines(lines); }} accounts={getSubAccounts(d.accountNumber)} placeholder="تحليلي..." /> : <input value={d.subAccountNumber} onChange={e => { const v = [...compoundMultiLines]; v[i] = { ...v[i], subAccountNumber: e.target.value }; setCompoundMultiLines(v); }} placeholder="تحليلي" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-mono font-bold text-sm outline-none text-slate-900 dark:text-white" />}</div>
                            <div className="w-28"><input type="number" value={d.amount || ''} onChange={e => { const v = [...compoundMultiLines]; v[i] = { ...v[i], amount: Number(e.target.value) }; setCompoundMultiLines(v); }} placeholder="المبلغ" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-mono font-bold text-sm outline-none text-slate-900 dark:text-white" /></div>
                            {entrySubType === 'normal' && (
                                <>
                                    <div className="w-20"><input type="number" value={(d as any).currencyId ?? ''} onChange={e => { const v = [...compoundMultiLines]; v[i] = { ...v[i], currencyId: Number(e.target.value) || undefined }; setCompoundMultiLines(v); }} placeholder="عملة" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-mono font-bold text-sm outline-none text-slate-900 dark:text-white" /></div>
                                    <div className="w-32"><input value={d.description || ''} onChange={e => { const v = [...compoundMultiLines]; v[i] = { ...v[i], description: e.target.value }; setCompoundMultiLines(v); }} placeholder="البيان" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-bold text-sm outline-none text-slate-900 dark:text-white" /></div>
                                    <div className="w-24"><input value={(d as any).costCenter || ''} onChange={e => { const v = [...compoundMultiLines]; v[i] = { ...v[i], costCenter: e.target.value }; setCompoundMultiLines(v); }} placeholder="مركز التكلفة" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-bold text-sm outline-none text-slate-900 dark:text-white" /></div>
                                    <div className="w-28"><input value={(d as any).reference || ''} onChange={e => { const v = [...compoundMultiLines]; v[i] = { ...v[i], reference: e.target.value }; setCompoundMultiLines(v); }} placeholder="الرقم المرجعي" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-bold text-sm outline-none text-slate-900 dark:text-white" /></div>
                                </>
                            )}
                            {compoundMultiLines.length > 1 && <button onClick={() => setCompoundMultiLines(p => p.filter((_, j) => j !== i))} className="p-1.5 text-red-400 hover:text-red-600"><span className="material-symbols-outlined text-sm">close</span></button>}
                        </div>
                    ))}
                    <p className="text-left text-sm font-black" style={{ color: compoundDirection === 'multi-debit' ? '#dc2626' : '#059669' }}>المجموع: {compoundMultiLines.reduce((s, d) => s + d.amount, 0).toLocaleString()}</p>
                </div>

                {/* Single side */}
                <div className={`p-3 rounded-xl border space-y-3 ${compoundDirection === 'multi-debit' ? 'bg-emerald-50/30 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30' : 'bg-red-50/30 dark:bg-red-900/10 border-red-100 dark:border-red-900/30'}`}>
                    <p className={`font-black flex items-center gap-2 text-sm ${compoundDirection === 'multi-debit' ? 'text-emerald-600' : 'text-red-600'}`}>
                        <span className="material-symbols-outlined text-[18px]">{compoundDirection === 'multi-debit' ? 'arrow_circle_down' : 'arrow_circle_up'}</span>
                        {compoundDirection === 'multi-debit' ? 'الطرف الدائن (تلقائي = المجموع)' : 'الطرف المدين (تلقائي = المجموع)'}
                    </p>
                    <div className="flex gap-4">
                        <div className="flex-1 w-full max-w-sm">{renderAccountSelect(compoundDirection === 'multi-debit' ? 'الدائن' : 'المدين', compoundSingleAcc, setCompoundSingleAcc, compoundSingleSub, setCompoundSingleSub)}</div>
                        <div className="flex-1 w-full"><label className="block text-xs font-black text-slate-600 dark:text-slate-400 mb-1 mt-2">البيان</label><input value={compoundSingleDescription} onChange={e => setCompoundSingleDescription(e.target.value)} placeholder="البيان..." className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 font-bold text-sm outline-none text-slate-900 dark:text-white" /></div>
                    </div>
                </div>
            </div>
        );

        // Batch
        return (
            <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-3xl p-6 shadow-xl border border-white/50 dark:border-slate-700/50 space-y-6 mt-4 relative overflow-hidden animate-fade-in group transition-all duration-500 hover:shadow-2xl hover:border-emerald-500/30">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-400/5 dark:bg-emerald-600/10 rounded-full blur-3xl -z-10 transition-transform duration-700 group-hover:scale-150 group-hover:bg-emerald-400/10"></div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-200/50 dark:border-slate-700/50">
                    <h3 className="font-black text-lg text-slate-700 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-emerald-500">dynamic_feed</span>
                        قيود جماعية ({batchDebits.length} قيد)
                        {entrySubType === 'restaurant'
                            ? <span className="text-xs font-bold px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-600 rounded-xl">🍽️ سداد مطاعم</span>
                            : <span className="text-xs font-bold px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl">📒 قيد طبيعي</span>
                        }
                    </h3>
                    <button onClick={() => setBatchDebits(p => [...p, { accountNumber: '', subAccountNumber: '', amount: 0 }])} className="px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl font-bold text-sm hover:bg-blue-200 transition flex items-center gap-1"><span className="material-symbols-outlined text-sm">add</span> إضافة</button>
                </div>
                <div className="flex items-center gap-4"><label className="text-sm font-black text-slate-600 dark:text-slate-400">بداية الترقيم:</label><input type="number" value={batchStartNumber} onChange={e => setBatchStartNumber(Number(e.target.value) || 1)} min={1} className="w-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-mono font-bold outline-none text-slate-900 dark:text-white" /></div>

                <div className="p-3 bg-red-50/30 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30 space-y-2">
                    <p className="font-black text-red-600 flex items-center gap-2 pb-2"><span className="material-symbols-outlined text-[18px]">arrow_circle_up</span> الأطراف المدينة</p>

                    {/* رأس الأعمدة */}
                    <div className="flex flex-wrap gap-2 px-3 pb-1">
                        <span className="w-6" />
                        {entrySubType !== 'restaurant' && <span className="flex-1 min-w-[140px] text-[10px] font-black text-slate-400 uppercase">الحساب الرئيسي</span>}
                        <span className="flex-1 min-w-[140px] text-[10px] font-black text-slate-400 uppercase">الحساب التحليلي</span>
                        <span className="w-28 text-[10px] font-black text-slate-400 uppercase">المبلغ</span>
                        {entrySubType === 'restaurant' ? (
                            <>
                                <span className="w-32 text-[10px] font-black text-slate-400 uppercase">اسم المطعم</span>
                                <span className="w-32 text-[10px] font-black text-slate-400 uppercase">البيان / طريقة السداد</span>
                                <span className="flex-1 min-w-[120px] text-[10px] font-black text-slate-400 uppercase">المسدد (الدائن) - تلقائي</span>
                                <span className="w-24 text-[10px] font-black text-slate-400 uppercase">الفرع</span>
                            </>
                        ) : (
                            <>
                                <span className="w-20 text-[10px] font-black text-slate-400 uppercase">العملة</span>
                                <span className="w-32 text-[10px] font-black text-slate-400 uppercase">البيان</span>
                                <span className="w-24 text-[10px] font-black text-slate-400 uppercase">مركز التكلفة</span>
                                <span className="w-28 text-[10px] font-black text-slate-400 uppercase">الرقم المرجعي</span>
                            </>
                        )}
                    </div>

                    {batchDebits.map((d, i) => (
                        <div key={i} className="flex flex-wrap gap-2 items-center bg-white dark:bg-slate-900 p-3 rounded-xl">
                            <span className="text-xs font-mono text-slate-400 w-6">{batchStartNumber + i}</span>
                            {entrySubType !== 'restaurant' && (
                                <div className="flex-1 min-w-[140px]"><SearchableAccount label="" value={d.accountNumber} onChange={v => { const lines = [...batchDebits]; lines[i] = { ...lines[i], accountNumber: v }; setBatchDebits(lines); }} accounts={chartAccounts} placeholder="رقم الحساب..." /></div>
                            )}
                            <div className="flex-1 min-w-[140px]">
                                {(d.accountNumber || (entrySubType === 'restaurant' && batchRestaurantMainAccount)) && getSubAccounts(d.accountNumber || batchRestaurantMainAccount).length > 0 ? (
                                    <SearchableAccount label="" value={d.subAccountNumber} onChange={v => { const lines = [...batchDebits]; lines[i] = { ...lines[i], subAccountNumber: v, accountNumber: entrySubType === 'restaurant' ? batchRestaurantMainAccount : d.accountNumber }; setBatchDebits(lines); }} accounts={getSubAccounts(d.accountNumber || batchRestaurantMainAccount)} placeholder="تحليلي..." />
                                ) : (
                                    <input value={d.subAccountNumber} onChange={e => { const v = [...batchDebits]; v[i] = { ...v[i], subAccountNumber: e.target.value, accountNumber: entrySubType === 'restaurant' ? batchRestaurantMainAccount : d.accountNumber }; setBatchDebits(v); }} placeholder="تحليلي" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-mono font-bold text-sm outline-none text-slate-900 dark:text-white" />
                                )}
                            </div>
                            <div className="w-28"><input type="number" value={d.amount || ''} onChange={e => { const v = [...batchDebits]; v[i] = { ...v[i], amount: Number(e.target.value) }; setBatchDebits(v); }} placeholder="المبلغ" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-mono font-bold text-sm outline-none text-slate-900 dark:text-white" /></div>
                            {entrySubType === 'restaurant' ? (
                                <>
                                    <div className="w-32"><input value={(d as any).restaurantName || ''} onChange={e => {
                                        const val = e.target.value;
                                        const v = [...batchDebits];
                                        const autoAcc = autoDetectCreditAccount(val, d.subAccountNumber, d.description);
                                        v[i] = { ...v[i], restaurantName: val, creditAccountNumber: autoAcc.m || v[i].creditAccountNumber, creditSubAccountNumber: autoAcc.s || v[i].creditSubAccountNumber };
                                        setBatchDebits(v);
                                    }} placeholder="اسم المطعم" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-bold text-sm outline-none text-slate-900 dark:text-white" /></div>
                                    <div className="w-32"><input value={d.description || ''} onChange={e => {
                                        const val = e.target.value;
                                        const v = [...batchDebits];
                                        const autoAcc = autoDetectCreditAccount(d.restaurantName || '', d.subAccountNumber, val);
                                        v[i] = { ...v[i], description: val, creditAccountNumber: autoAcc.m || v[i].creditAccountNumber, creditSubAccountNumber: autoAcc.s || v[i].creditSubAccountNumber };
                                        setBatchDebits(v);
                                    }} placeholder="البيان" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-bold text-sm outline-none text-slate-900 dark:text-white" /></div>
                                    <div className="flex-1 min-w-[120px]">
                                        <select value={d.creditSubAccountNumber || ''} onChange={e => {
                                            const sub = e.target.value;
                                            const main = chartAccounts.find((a: any) => a.accountNumber === sub)?.parentAccountNumber || sub;
                                            const v = [...batchDebits];
                                            v[i] = { ...v[i], creditAccountNumber: sub ? main : '', creditSubAccountNumber: sub };
                                            setBatchDebits(v);
                                        }} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-bold text-sm outline-none text-slate-900 dark:text-white appearance-none">
                                            <option value="">اختر المسدد (البنكي)...</option>
                                            {paymentAccounts && paymentAccounts.length > 0 ? (
                                                paymentAccounts.filter((pa: any) => pa.systemAccountNumber && pa.isActive !== false).map((pa: any) => {
                                                    const chartAcc = chartAccounts.find((a: any) => a.accountNumber === pa.systemAccountNumber);
                                                    return (
                                                        <option key={pa.id} value={pa.systemAccountNumber}>
                                                            {pa.accountName}{chartAcc ? ` (${chartAcc.accountNumber})` : ''}
                                                        </option>
                                                    );
                                                })
                                            ) : (
                                                chartAccounts.filter((a: any) => a.category === 'بنوك' || (a.accountNature && a.accountNature.includes('بنك'))).map((a: any) => (
                                                    <option key={a.accountNumber} value={a.accountNumber}>{a.accountName}</option>
                                                ))
                                            )}
                                        </select>
                                    </div>
                                    <div className="w-24">
                                        <select 
                                            value={(d as any).branch || ''} 
                                            onChange={e => { 
                                                const val = e.target.value;
                                                const branchObj = branches?.find((b: any) => b.name === val);
                                                const v = [...batchDebits]; 
                                                let overridePayer = v[i].creditSubAccountNumber;
                                                if (branchObj && branchObj.creditSubAccountNumber && !v[i].creditSubAccountNumber) {
                                                    overridePayer = branchObj.creditSubAccountNumber;
                                                } else if (branchObj && branchObj.creditSubAccountNumber) {
                                                    // User asked: "وتعرف فرع السداد والعملة اليا" so override if branch changes
                                                    overridePayer = branchObj.creditSubAccountNumber;
                                                }
                                                v[i] = { ...v[i], branch: val, creditSubAccountNumber: overridePayer }; 
                                                setBatchDebits(v); 
                                            }} 
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-bold text-sm outline-none text-slate-900 dark:text-white appearance-none"
                                        >
                                            <option value="">الفرع...</option>
                                            {branches && branches.map((b: any) => <option key={b.id} value={b.name}>{b.name}</option>)}
                                        </select>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="w-20"><input type="number" value={(d as any).currencyId ?? currencyId} onChange={e => { const v = [...batchDebits]; v[i] = { ...v[i], currencyId: Number(e.target.value) }; setBatchDebits(v); }} placeholder="عملة" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-mono font-bold text-sm outline-none text-slate-900 dark:text-white" /></div>
                                    <div className="w-32"><input value={d.description || ''} onChange={e => { const v = [...batchDebits]; v[i] = { ...v[i], description: e.target.value }; setBatchDebits(v); }} placeholder="البيان" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-bold text-sm outline-none text-slate-900 dark:text-white" /></div>
                                    <div className="w-24"><input value={(d as any).costCenter || ''} onChange={e => { const v = [...batchDebits]; v[i] = { ...v[i], costCenter: e.target.value }; setBatchDebits(v); }} placeholder="مركز التكلفة" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-bold text-sm outline-none text-slate-900 dark:text-white" /></div>
                                    <div className="w-28"><input value={(d as any).reference || ''} onChange={e => { const v = [...batchDebits]; v[i] = { ...v[i], reference: e.target.value }; setBatchDebits(v); }} placeholder="الرقم المرجعي" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-bold text-sm outline-none text-slate-900 dark:text-white" /></div>
                                </>
                            )}
                            {batchDebits.length > 1 && <button onClick={() => setBatchDebits(p => p.filter((_, j) => j !== i))} className="p-1 text-red-400 hover:text-red-600"><span className="material-symbols-outlined text-sm">close</span></button>}
                        </div>
                    ))}
                </div>

                {entrySubType !== 'restaurant' && (
                    <div className="p-3 bg-emerald-50/30 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-900/30 space-y-2">
                        <p className="font-black text-emerald-600 flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">arrow_circle_down</span> الطرف الدائن الثابت (في حال لم يتم تحديد مسدد في الأسطر)</p>
                        <div className="flex gap-4">
                            <div className="flex-1 w-full max-w-sm">{renderAccountSelect('الدائن', batchCreditAccount, setBatchCreditAccount, batchCreditSub, setBatchCreditSub)}</div>
                            <div className="flex-1 w-full"><label className="block text-xs font-black text-slate-600 dark:text-slate-400 mb-1 mt-2">بيان الدائن الجماعي</label><input value={batchCreditDescription} onChange={e => setBatchCreditDescription(e.target.value)} placeholder="البيان... (اختياري)" className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 font-bold text-sm outline-none text-slate-900 dark:text-white" /></div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ===================== PREVIEW MODAL =====================

    function renderUnknownAccountsModal() {
        if (!pendingParsedData || pendingParsedData.length === 0) return null;
        const unknownCount = pendingParsedData.filter(p => p.isUnknown).length;

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md" dir="rtl">
                <div className="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-xl shadow-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden flex flex-col scale-100">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <h2 className="text-xl font-black text-red-600 flex items-center gap-2">
                            <span className="material-symbols-outlined">warning</span> حسابات غير مسجلة ({unknownCount})
                        </h2>
                    </div>
                    <div className="p-6 space-y-4">
                        <p className="text-slate-600 dark:text-slate-300 font-bold text-sm">
                            تم العثور على أرقام حسابات غير موجودة في دليل الحسابات. لتتمكن من إنشاء القيد، يرجى تحديد <strong>الحساب الرئيسي</strong> الذي سيتم ربط هذه الأرقام به كحسابات تحليلية.
                        </p>
                        <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-2xl max-h-40 overflow-y-auto">
                            <div className="flex flex-wrap gap-2">
                                {pendingParsedData.filter(p => p.isUnknown).map((p, i) => (
                                    <span key={i} className="px-2 py-1 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 font-mono text-xs rounded-lg font-bold shadow-sm">
                                        {p.accountNumber}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="mt-4">
                            {renderAccountSelect('اختر الحساب الرئيسي الشامل', resolveMainAccount, setResolveMainAccount, '', () => { })}
                        </div>
                    </div>
                    <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex gap-3">
                        <button onClick={handleConfirmUnknowns} className="flex-1 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black shadow-lg transition-transform hover:-translate-y-0.5">تأكيد ومتابعة الإدراج</button>
                        <button onClick={handleCancelUnknowns} className="px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-black transition-colors">إلغاء</button>
                    </div>
                </div>
            </div>
        );
    }

    function renderPreviewModal() {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md" dir="rtl">
                <div className="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-6xl shadow-2xl border border-slate-200 dark:border-slate-700/50 max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
                        <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                            <div className="p-2.5 bg-violet-100 dark:bg-violet-900/40 text-violet-600 rounded-2xl"><span className="material-symbols-outlined">preview</span></div>
                            معاينة القيد — {mode === 'simple' ? 'بسيط' : mode === 'compound' ? 'مركب' : 'جماعي'}
                        </h2>
                        <button onClick={() => setShowPreview(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500"><span className="material-symbols-outlined">close</span></button>
                    </div>
                    <div className="overflow-auto flex-1 p-6">
                        {mode === 'batch' && branchGroups.length > 1 ? (
                            // Batch: grouped by branch
                            branchGroups.map((group, gi) => (
                                <div key={gi} className="mb-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="font-black text-lg text-slate-700 dark:text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-violet-500">domain</span> فرع: {group.branch}
                                            <span className="text-sm font-mono text-slate-400">({group.lines.length / 2} قيد)</span>
                                        </h4>
                                        <button onClick={() => handleCopy(group.lines)} className="px-3 py-1.5 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 rounded-xl font-bold text-xs flex items-center gap-1 hover:bg-cyan-200 transition"><span className="material-symbols-outlined text-sm">content_copy</span> نسخ هذا الفرع</button>
                                    </div>
                                    {renderPreviewTable(group.lines)}
                                </div>
                            ))
                        ) : renderPreviewTable(previewLines)}
                    </div>
                    <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-3 flex-shrink-0">
                        <button onClick={() => handleCopy()} className="flex-1 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg hover:-translate-y-0.5 transition-all"><span className="material-symbols-outlined">content_copy</span> نسخ الكل</button>
                        <button onClick={handleExportExcel} className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg hover:-translate-y-0.5 transition-all"><span className="material-symbols-outlined">download</span> تصدير Excel</button>
                        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 bg-gradient-to-r from-violet-600 to-purple-600 disabled:opacity-50 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg hover:-translate-y-0.5 transition-all"><span className="material-symbols-outlined">{saving ? 'hourglass_top' : 'save'}</span> {saving ? 'جاري الحفظ...' : 'حفظ'}</button>
                        <button onClick={() => setShowPreview(false)} className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-black">تعديل</button>
                    </div>
                </div>
            </div>
        );
    }

    function renderPreviewTable(lines: any[]) {
        const td = lines.reduce((s: number, l: any) => s + (l.debit || 0), 0);
        const tc = lines.reduce((s: number, l: any) => s + (l.credit || 0), 0);
        return (
            <table className="w-full border-collapse text-sm mb-4">
                <thead><tr className="bg-slate-50 dark:bg-slate-800">
                    {['#', 'رقم الحساب', 'التحليلي', 'اسم الحساب', 'مدين', 'دائن', 'العملة', 'البيان', 'م.تكلفة', 'المرجع'].map(h => (
                        <th key={h} className="px-2 py-2 text-right text-xs font-black text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {lines.map((l, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                            <td className="px-2 py-2 font-mono font-black text-violet-600 text-xs">{l.entryNumber}</td>
                            <td className="px-2 py-2 font-mono font-bold text-blue-600 text-xs">{l.accountNumber}</td>
                            <td className="px-2 py-2 font-mono text-slate-500 text-xs">{l.subAccountNumber || '—'}</td>
                            <td className="px-2 py-2 font-bold text-slate-700 dark:text-slate-300 text-xs truncate max-w-[120px]">{getAccountName(l.subAccountNumber || l.accountNumber) || <span className="text-red-500 text-[10px] bg-red-100 dark:bg-red-900/30 px-1 rounded">غير مسجل</span>}</td>
                            <td className="px-2 py-2 font-mono font-bold text-red-600 text-xs">{l.debit ? l.debit.toLocaleString() : ''}</td>
                            <td className="px-2 py-2 font-mono font-bold text-emerald-600 text-xs">{l.credit ? l.credit.toLocaleString() : ''}</td>
                            <td className="px-2 py-2 font-mono text-slate-500 text-xs">{l.currencyId}</td>
                            <td className="px-2 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 max-w-[120px] truncate">{l.description}</td>
                            <td className="px-2 py-2 font-mono text-slate-500 text-xs">{l.costCenter}</td>
                            <td className="px-2 py-2 font-mono text-slate-500 text-xs">{l.reference}</td>
                        </tr>
                    ))}
                    <tr className="bg-slate-100 dark:bg-slate-800 font-black">
                        <td colSpan={4} className="px-2 py-2 text-left text-slate-600 dark:text-slate-300 text-xs">الإجمالي</td>
                        <td className="px-2 py-2 font-mono text-red-700 text-xs">{td.toLocaleString()}</td>
                        <td className="px-2 py-2 font-mono text-emerald-700 text-xs">{tc.toLocaleString()}</td>
                        <td colSpan={4} className="px-2 py-2 text-xs">
                            {td === tc ? <span className="text-emerald-600 flex items-center gap-1"><span className="material-symbols-outlined text-xs">check_circle</span> متوازن</span> : <span className="text-red-600 flex items-center gap-1"><span className="material-symbols-outlined text-xs">error</span> غير متوازن!</span>}
                        </td>
                    </tr>
                </tbody>
            </table>
        );
    }

    function renderHistory() {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 shadow-xl border border-slate-100 dark:border-slate-700">
                <h3 className="font-black text-lg text-slate-700 dark:text-white mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-violet-500">history</span> سجل القيود</h3>
                {journalEntries.length === 0 ? <p className="text-center text-slate-400 py-8">لا توجد قيود محفوظة</p> : (
                    <div className="space-y-3">{journalEntries.slice(0, 20).map((e: any) => (
                        <div key={e.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <span className={`material-symbols-outlined p-2 rounded-xl ${e.entryType === 'simple' ? 'bg-blue-100 text-blue-600' : e.entryType === 'compound' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>{e.entryType === 'simple' ? 'receipt' : e.entryType === 'compound' ? 'receipt_long' : 'dynamic_feed'}</span>
                                <div><p className="font-black text-slate-800 dark:text-white">{e.title}</p><p className="text-xs text-slate-400">{new Date(e.createdAt).toLocaleString('ar-SA')} — {e.createdByName}</p></div>
                            </div>
                            <div className="text-left"><p className="font-mono font-black text-emerald-600">{(e.totalDebit || 0).toLocaleString()}</p><p className="text-xs text-slate-400">{e.entryType === 'simple' ? 'بسيط' : e.entryType === 'compound' ? 'مركب' : 'جماعي'}</p></div>
                        </div>
                    ))}</div>
                )}
            </div>
        );
    }
};

export default JournalEntryPage;
