import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppContext, BankDefinition, FundLineItem, FundSnapshot, FundsCurrency } from '../AppContext';
import { generateId, parseNumber, formatNumber, safeCompare } from '../utils';
import { confirmDialog } from '../utils/confirm';
import * as XLSX from 'xlsx';

const FundsPage: React.FC = () => {
    const { currentUser, bankDefinitions, addBankDefinition, deleteBankDefinition, toggleBankDefinition, updateBankDefinition, fundSnapshots, saveFundSnapshot, deleteFundSnapshot, editFundSnapshot, isLoading, fundDraftItems, saveFundDraft, clearFundDraft, addLog, featureFlags, systemBalances, accountMappings, syncMetadata } = useAppContext();

    // -- State --
    const [lineItems, setLineItems] = useState<FundLineItem[]>([]);
    const [isSessionInitialized, setIsSessionInitialized] = useState(false);

    // Real-time sync: track local edits to prevent overwriting during typing
    const isLocalEditRef = useRef(false);
    const localEditTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastSyncedDraftRef = useRef<string>(''); // JSON string of last synced draft to detect real changes

    // Tab State: 'local' or 'foreign'
    const [activeTab, setActiveTab] = useState<'local' | 'foreign'>('local');

    // Admin Modal State
    const [isAddBankModalOpen, setIsAddBankModalOpen] = useState(false);
    const [isManageBanksOpen, setIsManageBanksOpen] = useState(false); // New Manage Modal
    const [isQuickMatchOpen, setIsQuickMatchOpen] = useState(false); // Quick Match Modal
    const [editingBankId, setEditingBankId] = useState<string | null>(null); // Track if editing

    const [newBankName, setNewBankName] = useState('');
    const [newBankCurrency, setNewBankCurrency] = useState<FundsCurrency>('old_riyal');
    const [newBankAccountNumber, setNewBankAccountNumber] = useState('');
    const [customCurrencyName, setCustomCurrencyName] = useState('');

    // Report/Snapshot Modal State
    const [reportSnapshot, setReportSnapshot] = useState<FundSnapshot | null>(null);

    // -- Feature Flags & Toggles --
    const ENABLE_AUTO_SYNC = false; // Disable for now as requested
    const [isSplitMode, setIsSplitMode] = useState(false); // Toggle for splitting Old/New YER snapshots (Default: Single Image)

    const hasInitializedRef = useRef(false);

    // -- Initialization (runs ONCE) --
    useEffect(() => {
        if (isLoading || hasInitializedRef.current) return;

        // Only initialize when we know we have data (or definitively don't)
        hasInitializedRef.current = true;

        if (fundDraftItems && fundDraftItems.length > 0) {
            setLineItems(fundDraftItems);
            lastSyncedDraftRef.current = JSON.stringify(fundDraftItems);
        } else {
            const savedDraft = localStorage.getItem('funds_draft_v2');
            if (savedDraft) {
                setLineItems(JSON.parse(savedDraft));
            } else if (bankDefinitions.length > 0) {
                const initialItems: FundLineItem[] = bankDefinitions
                    .filter(def => def.isActive)
                    .map(def => ({
                        id: generateId(),
                        bankDefId: def.id,
                        bankName: def.name,
                        sysBalance: 0,
                        bankBalance: 0,
                        variance: 0,
                        draftCount: 0,
                        draftAmount: 0,
                        notes: '',
                        isCompleted: false
                    }));
                setLineItems(initialItems);
            }
        }
        setIsSessionInitialized(true);
    }, [isLoading, bankDefinitions, fundDraftItems]); // Wait until loading finishes

    // -- REAL-TIME SYNC: Listen for remote draft changes --
    useEffect(() => {
        if (!isSessionInitialized) return;
        if (!fundDraftItems || fundDraftItems.length === 0) return;

        // Don't overwrite if user is actively typing (local edit cooldown)
        if (isLocalEditRef.current) return;

        // Compare with last synced version to detect actual remote changes
        const incomingJSON = JSON.stringify(fundDraftItems);
        if (incomingJSON === lastSyncedDraftRef.current) return;

        // This is a genuine remote update — apply it
        console.log('🔄 [SYNC] Received remote draft update, applying...');
        lastSyncedDraftRef.current = incomingJSON;
        setLineItems(fundDraftItems);
    }, [fundDraftItems, isSessionInitialized]);

    // Sync active definitions with line items
    useEffect(() => {
        if (!isSessionInitialized || isLoading) return;

        setLineItems(currentItems => {
            if (bankDefinitions.length === 0) return currentItems;

            const validItems = currentItems.filter(item => {
                const def = bankDefinitions.find(d => d.id === item.bankDefId);
                return def && def.isActive;
            });

            const newItems = [...validItems];
            bankDefinitions.forEach(def => {
                if (def.isActive && !newItems.find(item => item.bankDefId === def.id)) {
                    newItems.push({
                        id: generateId(),
                        bankDefId: def.id,
                        bankName: def.name,
                        sysBalance: 0,
                        bankBalance: 0,
                        variance: 0,
                        draftCount: 0,
                        draftAmount: 0,
                        notes: '',
                        isCompleted: false
                    });
                }
            });

            return newItems;
        });
    }, [bankDefinitions, isSessionInitialized, isLoading]);

    // Auto-save draft to BOTH localStorage AND Firestore
    useEffect(() => {
        if (isSessionInitialized && lineItems.length > 0) {
            localStorage.setItem('funds_draft_v2', JSON.stringify(lineItems));
            lastSyncedDraftRef.current = JSON.stringify(lineItems);
            saveFundDraft(lineItems); // Sync to Firebase (debounced)
        }
    }, [lineItems, isSessionInitialized]);

    // -- Handlers --
    // Mark local edit to pause remote sync for 3 seconds
    const markLocalEdit = () => {
        isLocalEditRef.current = true;
        if (localEditTimerRef.current) clearTimeout(localEditTimerRef.current);
        localEditTimerRef.current = setTimeout(() => {
            isLocalEditRef.current = false;
        }, 3000);
    };

    const handleUpdateItem = (id: string, field: keyof FundLineItem, value: any) => {
        markLocalEdit();
        setLineItems(prev => prev.map(item => {
            if (item.id !== id) return item;
            if (item.isCompleted && field !== 'isCompleted') return item;

            const updated = {
                ...item,
                [field]: value,
                lastModifierName: currentUser?.name || currentUser?.username || 'نظام',
                lastModifiedAt: Date.now()
            };

            if (field === 'sysBalance' || field === 'bankBalance') {
                const sys = field === 'sysBalance' ? Number(value) : item.sysBalance;
                const bank = field === 'bankBalance' ? Number(value) : item.bankBalance;
                updated.variance = sys - bank;
            }
            return updated;
        }));
    };

    const toggleRowCompletion = (id: string) => {
        markLocalEdit();
        setLineItems(prev => prev.map(item => {
            if (item.id !== id) return item;

            const modifierProps = {
                lastModifierName: currentUser?.name || currentUser?.username || 'نظام',
                lastModifiedAt: Date.now()
            };

            if (item.isCompleted) {
                return { ...item, isCompleted: false, completedAt: undefined, ...modifierProps };
            } else {
                const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                return { ...item, isCompleted: true, completedAt: timeStr, ...modifierProps };
            }
        }));
    };

    const handleDeleteLineItem = async (id: string) => {
        const isConfirmed = await confirmDialog('هل أنت متأكد من حذف هذا السطر من المسودة؟\n\nتنبيه: هذا الإجراء يحذف البيانات المسجلة في هذا السطر فقط.', {
            type: 'danger'
        });
        if (!isConfirmed) return;
        setLineItems(prev => prev.filter(item => item.id !== id));
    };

    const handleAddBank = () => {
        if (!newBankName.trim()) return;

        if (editingBankId) {
            // Update existing
            if (updateBankDefinition) {
                updateBankDefinition(editingBankId, {
                    name: newBankName,
                    currency: newBankCurrency,
                    accountNumber: newBankAccountNumber || undefined,
                    customCurrencyName: newBankCurrency === 'custom' ? customCurrencyName : undefined
                });
            }
        } else {
            // Create new
            addBankDefinition(
                newBankName,
                newBankCurrency,
                newBankAccountNumber || undefined,
                newBankCurrency === 'custom' ? customCurrencyName : undefined
            );
        }

        setNewBankName('');
        setNewBankAccountNumber('');
        setCustomCurrencyName('');
        setEditingBankId(null);
        setIsAddBankModalOpen(false);
    };

    const openAddModal = () => {
        setEditingBankId(null);
        setNewBankName('');
        setNewBankAccountNumber('');
        setNewBankCurrency('old_riyal');
        setCustomCurrencyName('');
        setIsAddBankModalOpen(true);
    };

    // Final Approval (Separate for Local/Foreign)
    const handleFinalApproval = async () => {
        // Use the PRE-SORTED items to ensure snapshot order matches table display
        const currentTabItems = activeTab === 'local'
            ? [...filteredAndSortedItems.oldRiyal, ...filteredAndSortedItems.newRiyal]
            : [...filteredAndSortedItems.sar, ...filteredAndSortedItems.blueUsd, ...filteredAndSortedItems.whiteUsd, ...filteredAndSortedItems.custom];

        const incomplete = currentTabItems.filter(i => !i.isCompleted);
        if (incomplete.length > 0) {
            alert(`عذراً، يجب إتمام جميع الأسطر في هذا التبويب أولاً. يوجد ${incomplete.length} حسابات غير مكتملة.`);
            return;
        }

        const tabTitle = activeTab === 'local' ? 'العملات المحلية' : 'العملات الأجنبية';
        const isConfirmed = await confirmDialog(`هل أنت متأكد من اعتماد وإغلاق مطابقة (${tabTitle}) بشكل نهائي؟\n\nتنبيه: لا يمكن التعديل بعد الاعتماد.`, {
            type: 'warning'
        });
        if (!isConfirmed) {
            return;
        }

        // Logic for Split vs Single Snapshot
        const createSnapshot = (items: FundLineItem[], subType?: 'old_riyal' | 'new_riyal') => {
            const snapId = generateId();
            const snapshot: FundSnapshot = {
                id: snapId,
                date: new Date().toLocaleDateString('en-GB'),
                fullTimestamp: new Date().toLocaleString('en-GB'),
                user: currentUser?.name || currentUser?.username || 'Unknown',
                type: activeTab,
                subType: subType, // Optional field to distinguish split records

                // Local values
                oldRiyalItems: items.filter(i => getCurrencyForDef(i.bankDefId) === 'old_riyal'),
                newRiyalItems: items.filter(i => getCurrencyForDef(i.bankDefId) === 'new_riyal'),
                totalVarianceOld: items.filter(i => getCurrencyForDef(i.bankDefId) === 'old_riyal').reduce((acc, curr) => acc + curr.variance, 0),
                totalVarianceNew: items.filter(i => getCurrencyForDef(i.bankDefId) === 'new_riyal').reduce((acc, curr) => acc + curr.variance, 0),

                // Foreign values
                sarItems: items.filter(i => getCurrencyForDef(i.bankDefId) === 'sar'),
                blueUsdItems: items.filter(i => getCurrencyForDef(i.bankDefId) === 'blue_usd'),
                whiteUsdItems: items.filter(i => getCurrencyForDef(i.bankDefId) === 'white_usd'),
                customCurrencyItems: items.filter(i => getCurrencyForDef(i.bankDefId) === 'custom'),

                totalVarianceSar: items.filter(i => getCurrencyForDef(i.bankDefId) === 'sar').reduce((acc, curr) => acc + curr.variance, 0),
                totalVarianceBlueUsd: items.filter(i => getCurrencyForDef(i.bankDefId) === 'blue_usd').reduce((acc, curr) => acc + curr.variance, 0),
                totalVarianceWhiteUsd: items.filter(i => getCurrencyForDef(i.bankDefId) === 'white_usd').reduce((acc, curr) => acc + curr.variance, 0),
                totalVarianceCustom: items.filter(i => getCurrencyForDef(i.bankDefId) === 'custom').reduce((acc, curr) => acc + curr.variance, 0),

                status: 'approved',
                canEdit: false
            };
            saveFundSnapshot(snapshot);
            return snapshot;
        };

        let lastSnapshot: FundSnapshot | null = null;

        if (activeTab === 'local' && isSplitMode) {
            // Split Old and New Riyal into two records
            const oldItems = currentTabItems.filter(i => getCurrencyForDef(i.bankDefId) === 'old_riyal');
            const newItems = currentTabItems.filter(i => getCurrencyForDef(i.bankDefId) === 'new_riyal');

            if (oldItems.length > 0) {
                // Save Old YER silently (or as report if new is empty)
                const snap = createSnapshot(oldItems, 'old_riyal');
                if (newItems.length === 0) lastSnapshot = snap;
            }
            if (newItems.length > 0) {
                // Save New YER and set as lastSnapshot to display report
                lastSnapshot = createSnapshot(newItems, 'new_riyal');
            }
        } else {
            // Single snapshot for the whole tab
            lastSnapshot = createSnapshot(currentTabItems);
        }

        // NO RESET: The user wants to keep the data visible in the table
        addLog('اعتماد مطابقة', `تم اعتماد مطابقة (${tabTitle}) - ${isSplitMode ? 'وضع الفصل' : 'وضع الدمج'}`, 'funds');

        if (lastSnapshot) {
            // Mark as 'latest' to distinguish from archive viewing if needed
            (lastSnapshot as any).isNewApproval = true;
            setReportSnapshot(lastSnapshot);
        }
    };

    // Helpers
    const getCurrencyForDef = (defId: string): FundsCurrency | 'unknown' => {
        const def = bankDefinitions.find(d => d.id === defId);
        return def?.currency || 'unknown';
    };

    const getAccountNumberForDef = (defId: string): string => {
        const def = bankDefinitions.find(d => d.id === defId);
        return def?.accountNumber || '';
    };

    // Helper: حساب رصيد النظام التلقائي لحساب بنكي معين
    const getAutoBalance = (bankDefId: string): number | null => {
        const mapping = accountMappings.find(m => m.bankDefId === bankDefId);
        if (!mapping || !mapping.systemAccountNumber) return null;

        const def = bankDefinitions.find(d => d.id === bankDefId);
        if (!def) return null;

        // تحويل عملة البنك إلى نص مطابق للنظام
        const currencyMap: Record<string, string[]> = {
            'old_riyal': ['ريال قديم'],
            'new_riyal': ['ريال جديد'],
            'sar': ['ريال سعودي'],
        };
        const matchCurrencies = currencyMap[def.currency] || [];

        const balances = systemBalances.filter(sb =>
            sb.accountNumber === mapping.systemAccountNumber &&
            sb.type === 'bank' &&
            (matchCurrencies.length === 0 || matchCurrencies.some(c => sb.currency.includes(c)))
        );

        if (balances.length === 0) return null;

        let total = 0;
        for (const bal of balances) {
            total += bal.debit;
        }
        return total;
    };

    // Memoized sorted items for performance and stability
    const filteredAndSortedItems = useMemo(() => {
        const helper = (currency: FundsCurrency | 'unknown') => {
            const filtered = lineItems.filter(i => getCurrencyForDef(i.bankDefId) === currency);
            return [...filtered].sort((a, b) => {
                const accA = getAccountNumberForDef(a.bankDefId);
                const accB = getAccountNumberForDef(b.bankDefId);

                // Primary sort by account number (numeric-aware)
                const cmp = safeCompare(accA, accB);
                if (cmp !== 0) return cmp;

                // Secondary sort by name if numbers are empty or same
                return a.bankName.localeCompare(b.bankName, 'ar');
            });
        };

        return {
            unknown: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'unknown'), // filter logic repeated to match original structure
            oldRiyal: helper('old_riyal'),
            newRiyal: helper('new_riyal'),
            sar: helper('sar'),
            blueUsd: helper('blue_usd'),
            whiteUsd: helper('white_usd'),
            custom: helper('custom')
        };
    }, [lineItems, bankDefinitions]);

    // Use memoized items
    const {
        unknown: unknownItems,
        oldRiyal: oldRiyalItems,
        newRiyal: newRiyalItems,
        sar: sarItems,
        blueUsd: blueUsdItems,
        whiteUsd: whiteUsdItems,
        custom: customItems
    } = filteredAndSortedItems;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-12" dir="rtl">
            <QuickMatchModal
                isOpen={isQuickMatchOpen}
                onClose={() => setIsQuickMatchOpen(false)}
                bankDefinitions={bankDefinitions}
                onApply={(matches: ParsedQuickMatchEntry[]) => {
                    markLocalEdit();
                    // Update lineItems based on matches
                    const updatedItems = lineItems.map((item: FundLineItem) => {
                        const match = matches.find(m => m.bankDefId === item.bankDefId);
                        if (match) {
                            return {
                                ...item,
                                sysBalance: match.tawseelAmount,
                                bankBalance: match.mahfazaAmount,
                                variance: match.variance,
                                isCompleted: match.variance === 0,
                                completedAt: match.variance === 0 ? new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : undefined
                            };
                        }
                        return item;
                    });

                    const matchCount = matches.filter(m => m.bankDefId).length;
                    setLineItems(updatedItems);
                    setIsQuickMatchOpen(false);
                    addLog('مطابقة سريعة', `تم تحديث وسحب بيانات ${matchCount} حساب بنكي (توصيل ومحفظة)`, 'funds');
                }}
            />
            <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-32">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b-4 border-slate-900 dark:border-slate-300 pb-6">
                    <div>
                        <h1 className="text-4xl font-black text-[#263238] dark:text-white font-display">مطابقة الصناديق اليومية</h1>
                        <p className="text-xl text-[#607D8B] dark:text-slate-400 mt-1">المراجعة اليومية للسيولة النقدية والحسابات البنكية</p>
                    </div>
                    <div className="text-end">
                        <p className="text-2xl font-black text-[#607D8B] dark:text-slate-500">التاريخ: <span className="text-[#263238] dark:text-white font-mono">{new Date().toLocaleDateString('en-GB')}</span></p>
                        <p className="text-xl font-bold text-[#607D8B] dark:text-slate-500">الموظف: <span className="text-[#263238] dark:text-white">{currentUser?.name || currentUser?.username}</span></p>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b-2 border-slate-300 dark:border-slate-700">
                    <button
                        onClick={() => setActiveTab('local')}
                        className={`flex-1 py-4 px-6 text-lg font-bold transition-all ${activeTab === 'local'
                            ? 'bg-[#263238] dark:bg-[#4FC3F7] text-white border-b-4 border-[#C62828]'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                    >
                        <span className="flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined">account_balance</span>
                            مطابقة العملات المحلية
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('foreign')}
                        className={`flex-1 py-4 px-6 text-lg font-bold transition-all ${activeTab === 'foreign'
                            ? 'bg-[#263238] dark:bg-[#4FC3F7] text-white border-b-4 border-[#C62828]'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                    >
                        <span className="flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined">currency_exchange</span>
                            مطابقة العملات الأجنبية
                        </span>
                    </button>
                </div>

                {/* Admin Actions */}
                {currentUser?.role === 'super_admin' && (
                    <div className="flex justify-end gap-3">
                        {featureFlags.quick_match !== false && (
                            <button
                                onClick={() => setIsQuickMatchOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 dark:shadow-none"
                            >
                                <span className="material-symbols-outlined text-sm">flash_on</span>
                                مطابقة سريعة
                            </button>
                        )}
                        <button
                            onClick={() => setIsManageBanksOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                        >
                            <span className="material-symbols-outlined text-sm">settings</span>
                            إدارة الحسابات
                        </button>
                        <button
                            onClick={openAddModal}
                            className="flex items-center gap-2 px-4 py-2 bg-[#4FC3F7] dark:bg-slate-700 text-[#263238] dark:text-white rounded-lg text-xs font-bold hover:bg-[#29B6F6] dark:hover:bg-slate-600 transition-colors"
                        >
                            <span className="material-symbols-outlined text-sm">add_card</span>
                            إضافة حساب بنكي جديد
                        </button>
                    </div>
                )}

                {/* Global Toggles */}
                <div className="flex items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">وضع حفظ صور المطابقة (ريال قديم/جديد):</span>
                        <button
                            onClick={() => setIsSplitMode(!isSplitMode)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${isSplitMode ? 'bg-indigo-600' : 'bg-slate-300'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${isSplitMode ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <span className={`text-xs font-bold ${isSplitMode ? 'text-indigo-600' : 'text-slate-400'}`}>
                            {isSplitMode ? 'فصل (صورتين)' : 'دمج (صورة واحدة)'}
                        </span>
                    </div>
                </div>

                {/* LOCAL CURRENCIES TAB */}
                {activeTab === 'local' && (
                    <div className="space-y-8">
                        {/* Safe guard for loading/unlinked items */}
                        {unknownItems.length > 0 && (
                            <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-2xl p-6 mb-8 animate-pulse">
                                <h3 className="text-xl font-bold text-red-800 dark:text-red-400 flex items-center gap-2 mb-4">
                                    <span className="material-symbols-outlined">link_off</span>
                                    حسابات غير مرتبطة / جاري التحميل
                                </h3>
                                <p className="text-sm text-red-600 dark:text-red-300 mb-4">
                                    هذه الحسابات موجودة في المسودة لكن لا يوجد لها تعريف بنكي مطابق حالياً. قد يكون جاري التحميل أو تم حذف التعريف.
                                </p>
                                <ReconTable
                                    title="حسابات غير معرفة (Unknown)"
                                    items={unknownItems}
                                    colorClass="red"
                                    onUpdate={handleUpdateItem}
                                    onToggleComplete={toggleRowCompletion}
                                    getAccountNumber={getAccountNumberForDef}
                                    onDelete={handleDeleteLineItem}
                                />
                            </div>
                        )}

                        <ReconTable
                            title="مطابقة الريال القديم (Old Riyal)"
                            items={oldRiyalItems}
                            colorClass="green"
                            onUpdate={handleUpdateItem}
                            onToggleComplete={toggleRowCompletion}
                            getAccountNumber={getAccountNumberForDef}
                            getAutoBalance={ENABLE_AUTO_SYNC ? getAutoBalance : undefined}
                            syncMetadata={syncMetadata}
                            showAutoBalance={ENABLE_AUTO_SYNC}
                        />

                        <ReconTable
                            title="مطابقة الريال الجديد (New Riyal)"
                            items={newRiyalItems}
                            colorClass="blue"
                            onUpdate={handleUpdateItem}
                            onToggleComplete={toggleRowCompletion}
                            getAccountNumber={getAccountNumberForDef}
                            getAutoBalance={ENABLE_AUTO_SYNC ? getAutoBalance : undefined}
                            syncMetadata={syncMetadata}
                            showAutoBalance={ENABLE_AUTO_SYNC}
                        />
                    </div>
                )}

                {/* FOREIGN CURRENCIES TAB */}
                {activeTab === 'foreign' && (
                    <div className="space-y-8">
                        {/* Safe guard for loading/unlinked items in foreign tab too if needed */}
                        {unknownItems.length > 0 && activeTab === 'foreign' && (
                            // We show them in local tab primarily, but could show here too if strictly separated. 
                            // For now let's just keep them in logic.
                            <div className="p-4 bg-yellow-50 text-yellow-800 rounded-lg">
                                هناك {unknownItems.length} حسابات غير معرفة تظهر في تبويب العملات المحلية.
                            </div>
                        )}

                        <ReconTable
                            title="مطابقة الريال السعودي (SAR)"
                            items={sarItems}
                            colorClass="yellow"
                            onUpdate={handleUpdateItem}
                            onToggleComplete={toggleRowCompletion}
                            getAccountNumber={getAccountNumberForDef}
                            getAutoBalance={ENABLE_AUTO_SYNC ? getAutoBalance : undefined}
                            syncMetadata={syncMetadata}
                            showAutoBalance={ENABLE_AUTO_SYNC}
                        />

                        <ReconTable
                            title="مطابقة الدولار الأزرق (Blue USD)"
                            items={blueUsdItems}
                            colorClass="indigo"
                            onUpdate={handleUpdateItem}
                            onToggleComplete={toggleRowCompletion}
                            getAccountNumber={getAccountNumberForDef}
                            getAutoBalance={ENABLE_AUTO_SYNC ? getAutoBalance : undefined}
                            syncMetadata={syncMetadata}
                            showAutoBalance={ENABLE_AUTO_SYNC}
                        />

                        <ReconTable
                            title="مطابقة الدولار الأبيض (White USD)"
                            items={whiteUsdItems}
                            colorClass="gray"
                            onUpdate={handleUpdateItem}
                            onToggleComplete={toggleRowCompletion}
                            getAccountNumber={getAccountNumberForDef}
                            getAutoBalance={ENABLE_AUTO_SYNC ? getAutoBalance : undefined}
                            syncMetadata={syncMetadata}
                            showAutoBalance={ENABLE_AUTO_SYNC}
                        />

                        {customItems.length > 0 && (
                            <ReconTable
                                title="مطابقة العملات المخصصة"
                                items={customItems}
                                colorClass="purple"
                                onUpdate={handleUpdateItem}
                                onToggleComplete={toggleRowCompletion}
                                getAccountNumber={getAccountNumberForDef}
                                getAutoBalance={ENABLE_AUTO_SYNC ? getAutoBalance : undefined}
                                syncMetadata={syncMetadata}
                                showAutoBalance={ENABLE_AUTO_SYNC}
                            />
                        )}
                    </div>
                )}

                {/* Final Approval Button */}
                <div className="flex justify-center mt-12 mb-20">
                    <button
                        onClick={handleFinalApproval}
                        className="group relative px-8 py-4 bg-[#C62828] hover:bg-[#b71c1c] text-white rounded-2xl shadow-xl shadow-[#C62828]/20 transform hover:-translate-y-1 transition-all duration-200"
                    >
                        <div className="flex flex-col items-center">
                            <span className="text-xl font-black flex items-center gap-2">
                                <span className="material-symbols-outlined">verified_user</span>
                                اعتماد وإغلاق المطابقة النهائية
                            </span>
                            <span className="text-xs text-red-100 mt-1 opacity-80 group-hover:opacity-100">سيتم ترحيل البيانات للأرشيف وإصدار الشهادة</span>
                        </div>
                    </button>
                </div>

                {/* Archive / History Section */}
                {fundSnapshots.length > 0 && (
                    <ArchiveSection
                        fundSnapshots={fundSnapshots}
                        setReportSnapshot={setReportSnapshot}
                        currentUser={currentUser}
                        deleteFundSnapshot={deleteFundSnapshot}
                    />
                )}

                {/* Add/Edit Bank Modal */}
                {isAddBankModalOpen && (
                    <AddBankModal
                        newBankName={newBankName}
                        setNewBankName={setNewBankName}
                        newBankCurrency={newBankCurrency}
                        setNewBankCurrency={setNewBankCurrency}
                        newBankAccountNumber={newBankAccountNumber}
                        setNewBankAccountNumber={setNewBankAccountNumber}
                        customCurrencyName={customCurrencyName}
                        setCustomCurrencyName={setCustomCurrencyName}
                        handleAddBank={handleAddBank}
                        setIsAddBankModalOpen={setIsAddBankModalOpen}
                        editingBankId={editingBankId}
                    />
                )}

                {/* Manage Banks Modal */}
                {isManageBanksOpen && (
                    <ManageBanksModal
                        bankDefinitions={bankDefinitions}
                        setIsManageBanksOpen={setIsManageBanksOpen}
                        onToggleActive={toggleBankDefinition}
                        onDelete={deleteBankDefinition}
                        onEdit={(bank: BankDefinition) => {
                            setEditingBankId(bank.id);
                            setNewBankName(bank.name);
                            setNewBankCurrency(bank.currency);
                            setNewBankAccountNumber(bank.accountNumber || '');
                            setCustomCurrencyName(bank.customCurrencyName || '');
                            setIsAddBankModalOpen(true);
                            setIsManageBanksOpen(false);
                        }}
                    />
                )}

                {/* REPORT SNAPSHOT MODAL */}
                {reportSnapshot && (
                    <ReportModal snapshot={reportSnapshot} setReportSnapshot={setReportSnapshot} />
                )}
            </div>
        </div>
    );
};

// -- Sub-Components --

// Manage Banks Modal
const ManageBanksModal = ({ bankDefinitions, setIsManageBanksOpen, onToggleActive, onEdit, onDelete }: any) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl w-full max-w-2xl p-6 shadow-2xl h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined">settings_account_box</span>
                        إدارة الحسابات البنكية والصناديق
                    </h3>
                    <button onClick={() => setIsManageBanksOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 space-y-3 p-1">
                    {bankDefinitions.length === 0 ? (
                        <p className="text-center text-slate-400 py-10">لا توجد حسابات مضافة</p>
                    ) : (
                        bankDefinitions.map((bank: BankDefinition) => (
                            <div key={bank.id} className={`p-4 rounded-xl border-2 flex items-center justify-between transition-all ${bank.isActive ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f172a]' : 'border-red-200 bg-red-50 dark:bg-red-900/10 opacity-75'}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-3 h-3 rounded-full ${bank.isActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                    <div>
                                        <h4 className="font-bold text-slate-800 dark:text-white">{bank.name}</h4>
                                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">
                                            <span>{bank.currency}</span>
                                            {bank.accountNumber && <span>• {bank.accountNumber}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => onToggleActive(bank.id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${bank.isActive
                                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                            : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                                    >
                                        {bank.isActive ? 'تعطيل' : 'تنشيط'}
                                    </button>
                                    <button
                                        onClick={() => onEdit(bank)}
                                        className="px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                    >
                                        <span className="material-symbols-outlined text-sm">edit</span>
                                        تعديل
                                    </button>
                                    <button
                                        onClick={() => onDelete && onDelete(bank.id)}
                                        className="px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                        title="حذف نهائي"
                                    >
                                        <span className="material-symbols-outlined text-sm">delete</span>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

const ReconRow = ({ item, idx, onUpdate, onToggleComplete, getAccountNumber, onDelete, getAutoBalance, isLatestModified }: any) => {
    // Normalize Arabic/Persian digits (٠١٢٣٤٥٦٧٨٩ → 0123456789)
    const normalizeDigits = (val: string): string => {
        let result = val
            .replace(/[٠-٩]/g, (d: string) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
            .replace(/[۰-۹]/g, (d: string) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
        // Remove all commas (important for pasted numbers like 2,475)
        return result.replace(/,/g, '');
    };

    // Local string state to handle decimals precisely during typing
    const [sysVal, setSysVal] = useState(item.sysBalance.toString());
    const [bankVal, setBankVal] = useState(item.bankBalance.toString());
    const [draftCountVal, setDraftCountVal] = useState((item.draftCount || 0).toString());
    const [draftAmountVal, setDraftAmountVal] = useState((item.draftAmount || 0).toString());

    // Auto balance from system
    const autoBalance = getAutoBalance ? getAutoBalance(item.bankDefId) : null;

    // Sync local state if external item changes (e.g. on load or reset)
    useEffect(() => {
        setSysVal(item.sysBalance.toString());
    }, [item.sysBalance]);

    useEffect(() => {
        setBankVal(item.bankBalance.toString());
    }, [item.bankBalance]);

    useEffect(() => {
        setDraftCountVal((item.draftCount || 0).toString());
    }, [item.draftCount]);

    useEffect(() => {
        setDraftAmountVal((item.draftAmount || 0).toString());
    }, [item.draftAmount]);

    const handleSysChange = (rawVal: string) => {
        const val = normalizeDigits(rawVal);
        setSysVal(val);
        // Allow trailing dot or minus — don't commit partial values
        if (val === '' || val === '-' || val === '.' || val.endsWith('.')) {
            if (val === '') onUpdate(item.id, 'sysBalance', 0);
            return;
        }
        const parsed = parseNumber(val);
        if (!isNaN(parsed)) {
            onUpdate(item.id, 'sysBalance', parsed);
        }
    };

    const handleBankChange = (rawVal: string) => {
        const val = normalizeDigits(rawVal);
        setBankVal(val);
        if (val === '' || val === '-' || val === '.' || val.endsWith('.')) {
            if (val === '') onUpdate(item.id, 'bankBalance', 0);
            return;
        }
        const parsed = parseNumber(val);
        if (!isNaN(parsed)) {
            onUpdate(item.id, 'bankBalance', parsed);
        }
    };

    const handleDraftCountChange = (rawVal: string) => {
        const val = normalizeDigits(rawVal);
        setDraftCountVal(val);
        if (val === '' || val === '-') {
            if (val === '') onUpdate(item.id, 'draftCount', 0);
            return;
        }
        const parsed = parseInt(val);
        if (!isNaN(parsed)) {
            onUpdate(item.id, 'draftCount', parsed);
        }
    };

    const handleDraftAmountChange = (rawVal: string) => {
        const val = normalizeDigits(rawVal);
        setDraftAmountVal(val);
        if (val === '' || val === '-' || val === '.' || val.endsWith('.')) {
            if (val === '') onUpdate(item.id, 'draftAmount', 0);
            return;
        }
        const parsed = parseNumber(val);
        if (!isNaN(parsed)) {
            onUpdate(item.id, 'draftAmount', parsed);
        }
    };

    const handleManualMatch = () => {
        handleBankChange(sysVal);
    };

    const getBankHighlight = (bankName: string) => {
        if (!bankName) return 'border-r-4 border-r-slate-400';
        if (bankName.includes('كريمي')) return 'border-r-4 border-r-[#8bba33]'; // Kuraimi green
        if (bankName.includes('تضامن') || bankName.includes('محفظتي')) return 'border-r-4 border-r-[#005c97]';
        if (bankName.includes('صراف')) return 'border-r-4 border-r-amber-500';
        if (bankName.includes('توفير')) return 'border-r-4 border-r-blue-600';
        if (bankName.includes('جوالي')) return 'border-r-4 border-r-emerald-500';
        if (bankName.includes('كاش')) return 'border-r-4 border-r-orange-500';
        return 'border-r-4 border-r-slate-400';
    };

    return (
        <tr className={`hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-slate-300 text-slate-800 dark:text-slate-200 ${isLatestModified ? 'bg-indigo-50/80 dark:bg-indigo-900/40 outline outline-2 outline-indigo-500 shadow-md relative z-10' : idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-orange-50/30 dark:bg-slate-800/50'}`}>
            {/* Index */}
            <td className="px-2 py-3 border border-slate-300 text-center font-bold bg-slate-50 dark:bg-slate-900 shadow-[inset_-1px_0_0_#cbd5e1] dark:shadow-[inset_-1px_0_0_#475569]">
                {idx + 1}
            </td>
            {/* Name */}
            <td className="px-3 py-3 font-bold border border-slate-300 bg-[#FFF9C4]/30 dark:bg-yellow-900/10 min-w-[180px]">
                <div className="flex flex-col">
                    <span className="text-sm">{item.bankName}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{getAccountNumber(item.bankDefId) || '-'}</span>
                </div>
            </td>
            {/* Time */}
            <td className="px-2 py-3 text-center text-xs font-mono border border-slate-300 whitespace-nowrap">
                {item.completedAt || '-'}
            </td>
            {/* Bank (Wallet) - الرصيد لدى المحفظة */}
            <td className="px-2 py-3 border border-slate-300 bg-rose-50/40 dark:bg-rose-900/10">
                <input
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    disabled={item.isCompleted}
                    value={bankVal}
                    onChange={e => handleBankChange(e.target.value)}
                    className="w-full bg-transparent border-none outline-none font-mono text-center text-sm font-bold placeholder-slate-300"
                    placeholder="0"
                />
            </td>
            {/* Sys - الرصيد في النظام */}
            <td className="px-2 py-3 border border-slate-300 bg-rose-50/40 dark:bg-rose-900/10">
                <input
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    disabled={item.isCompleted}
                    value={sysVal}
                    onChange={e => handleSysChange(e.target.value)}
                    className="w-full bg-transparent border-none outline-none font-mono text-center text-sm font-bold placeholder-slate-300"
                    placeholder="0"
                />
            </td>
            {/* Auto Sys - رصيد النظام (تلقائي) */}
            {getAutoBalance && (
                <td className={`px-2 py-3 border border-slate-300 text-center font-mono text-sm font-bold ${autoBalance !== null ? 'bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400' : 'bg-slate-50/50 dark:bg-slate-800/50 text-slate-400'}`}>
                    {autoBalance !== null ? autoBalance.toLocaleString('en-US') : <span className="text-[10px] italic">غير مربوط</span>}
                </td>
            )}
            {/* Variance */}
            <td className={`px-2 py-3 border border-slate-300 text-center font-mono font-black text-sm bg-yellow-50/50 dark:bg-yellow-900/20 ${item.variance === 0 ? 'text-green-600' : (item.variance < 0 ? 'text-red-600' : 'text-amber-600')}`}>
                {item.variance.toLocaleString('en-US')}
            </td>
            {/* Draft Count */}
            <td className="px-2 py-3 border border-slate-300">
                <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    disabled={item.isCompleted}
                    value={draftCountVal}
                    onChange={e => handleDraftCountChange(e.target.value)}
                    className="w-full bg-transparent border-none outline-none font-mono text-center text-sm placeholder-slate-300"
                    placeholder="0"
                />
            </td>
            {/* Draft Amount */}
            <td className="px-2 py-3 border border-slate-300">
                <input
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    disabled={item.isCompleted}
                    value={draftAmountVal}
                    onChange={e => handleDraftAmountChange(e.target.value)}
                    className="w-full bg-transparent border-none outline-none font-mono text-center text-sm placeholder-slate-300"
                    placeholder="مبلغ المؤقتة"
                />
            </td>

            {/* Notes */}
            <td className="px-2 py-3 border border-slate-300 min-w-[120px]">
                <input
                    type="text"
                    disabled={item.isCompleted}
                    value={item.notes}
                    onChange={e => onUpdate(item.id, 'notes', e.target.value)}
                    className="w-full bg-transparent text-xs border-none outline-none disabled:text-slate-400 placeholder:italic"
                    placeholder="ملاحظات..."
                />
            </td>
            {/* Last Modifier */}
            <td className="px-2 py-3 border border-slate-300 text-center text-[10px] font-bold text-slate-500 dark:text-slate-400 print:hidden">
                {item.lastModifierName ? (
                    <div className="flex flex-col items-center justify-center">
                        <span className="text-indigo-600 dark:text-indigo-400">{item.lastModifierName}</span>
                        {item.lastModifiedAt && (
                            <span className="text-[8px] opacity-70">
                                {new Date(item.lastModifiedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                        )}
                    </div>
                ) : (
                    <span className="opacity-50">-</span>
                )}
            </td>
            {/* Action */}
            <td className="px-2 py-3 text-center border border-slate-300">
                <div className="flex items-center justify-center gap-1">
                    <button
                        onClick={() => onToggleComplete(item.id)}
                        className={`p-1 rounded-md transition-all ${item.isCompleted
                            ? 'text-amber-600 hover:bg-amber-100'
                            : 'text-indigo-600 hover:bg-indigo-100'
                            }`}
                        title={item.isCompleted ? 'تعديل' : 'إتمام'}
                    >
                        <span className="material-symbols-outlined text-lg">{item.isCompleted ? 'edit_note' : 'check_circle'}</span>
                    </button>

                    {onDelete && !item.isCompleted && (
                        <button
                            onClick={() => onDelete(item.id)}
                            className="p-1 text-slate-300 hover:text-red-500 rounded-md transition-colors"
                            title="حذف"
                        >
                            <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                    )}
                    {!item.isCompleted && item.variance !== 0 && (
                        <button
                            onClick={handleManualMatch}
                            className="p-1 text-indigo-400 hover:text-indigo-600"
                            title="مطابقة سريعة"
                        >
                            <span className="material-symbols-outlined text-lg">bolt</span>
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
};

// ReconTable Component with Enhanced Formatting
const ReconTable = ({ title, items, colorClass, onUpdate, onToggleComplete, getAccountNumber, onDelete, getAutoBalance, syncMetadata, showAutoBalance }: any) => {
    const colorClasses: any = {
        green: { bg: 'bg-[#E8F5E9] dark:bg-emerald-900/20', text: 'text-[#2E7D32] dark:text-emerald-400', body: 'bg-[#F1F8E9] dark:bg-[#0f172a]' },
        blue: { bg: 'bg-[#E3F2FD] dark:bg-blue-900/20', text: 'text-[#1565C0] dark:text-blue-400', body: 'bg-[#E1F5FE] dark:bg-[#0f172a]' },
        yellow: { bg: 'bg-[#FFF9C4] dark:bg-yellow-900/20', text: 'text-[#F57F17] dark:text-yellow-400', body: 'bg-[#FFFDE7] dark:bg-[#0f172a]' },
        indigo: { bg: 'bg-[#E8EAF6] dark:bg-indigo-900/20', text: 'text-[#283593] dark:text-indigo-400', body: 'bg-[#E8EAF6] dark:bg-[#0f172a]' },
        gray: { bg: 'bg-[#ECEFF1] dark:bg-slate-900/20', text: 'text-[#455A64] dark:text-slate-400', body: 'bg-[#FAFAFA] dark:bg-[#0f172a]' },
        purple: { bg: 'bg-[#F3E5F5] dark:bg-purple-900/20', text: 'text-[#6A1B9A] dark:text-purple-400', body: 'bg-[#F3E5F5] dark:bg-[#0f172a]' },
        red: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400', body: 'bg-[#FFEBEE] dark:bg-[#0f172a]' }
    };

    const colors = colorClasses[colorClass] || colorClasses.green;

    //  Calculate totals
    const totalSys = items.reduce((a: number, b: FundLineItem) => a + Number(b.sysBalance || 0), 0);
    const totalBank = items.reduce((a: number, b: FundLineItem) => a + Number(b.bankBalance || 0), 0);
    const totalVariance = items.reduce((a: number, b: FundLineItem) => a + Number(b.variance || 0), 0);
    const totalAutoBalance = getAutoBalance ? items.reduce((acc: number, item: FundLineItem) => {
        const auto = getAutoBalance(item.bankDefId);
        return acc + (auto ?? 0);
    }, 0) : null;
    const hasAnyAutoBalance = getAutoBalance && items.some((item: FundLineItem) => getAutoBalance(item.bankDefId) !== null);

    const latestModifiedItem = items.reduce((latest: FundLineItem, current: FundLineItem) => {
        if (!latest.lastModifiedAt) return current;
        if (!current.lastModifiedAt) return latest;
        return current.lastModifiedAt > latest.lastModifiedAt ? current : latest;
    }, items[0] as FundLineItem);
    const latestModifiedId = latestModifiedItem?.lastModifiedAt ? latestModifiedItem.id : null;

    return (
        <div className={`rounded-2xl shadow-lg border-2 border-slate-900 dark:border-slate-300 overflow-hidden mb-8 ${colors.body}`}>
            <div className={`px-6 py-4 border-b-2 border-slate-900 dark:border-slate-300 ${colors.bg}`}>
                <h2 className={`text-xl font-black flex items-center gap-2 ${colors.text}`}>
                    <span className="material-symbols-outlined">account_balance_wallet</span>
                    {title}
                </h2>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                    <thead>
                        <tr className="bg-slate-500 dark:bg-slate-900/50 text-white font-bold border-b border-slate-600">
                            <th className="px-2 py-2 border border-slate-600 w-[30px] text-center">م</th>
                            <th className="px-3 py-2 border border-slate-600">اسم الحساب</th>
                            <th className="px-2 py-2 border border-slate-600 text-center">الوقت</th>
                            <th className="px-2 py-2 border border-slate-600 text-center bg-rose-600">الرصيد لدى المحفظة</th>
                            <th className="px-2 py-2 border border-slate-600 text-center bg-rose-600">الرصيد في النظام</th>
                            {showAutoBalance && (
                                <th className="px-2 py-2 border border-slate-600 text-center bg-emerald-700">
                                    <div className="flex flex-col items-center">
                                        <span>رصيد النظام (تلقائي)</span>
                                        {syncMetadata && <span className="text-[9px] opacity-70 font-normal">{new Date(syncMetadata.lastSync).toLocaleDateString('en-GB')}</span>}
                                    </div>
                                </th>
                            )}
                            <th className="px-2 py-2 border border-slate-600 text-center">الفارق</th>
                            <th className="px-2 py-2 border border-slate-600 text-center">عدد الحوالات المؤقته</th>
                            <th className="px-2 py-2 border border-slate-600 text-center">إجمالي مبلغ الحوالات المؤقتة</th>
                            <th className="px-2 py-2 border border-slate-600">الملاحظات</th>
                            <th className="px-2 py-2 border border-slate-600 text-center print:hidden">تعديل بواسطة</th>
                            <th className="px-2 py-2 border border-slate-600 text-center w-[80px]">الإجراء</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 && (
                            <tr><td colSpan={8} className="text-center p-8 text-slate-400">لا توجد حسابات مضافة لهذا النوع.</td></tr>
                        )}
                        {items.map((item: FundLineItem, idx: number) => (
                            <ReconRow
                                key={item.id}
                                item={item}
                                idx={idx}
                                onUpdate={onUpdate}
                                onToggleComplete={onToggleComplete}
                                getAccountNumber={getAccountNumber}
                                onDelete={onDelete}
                                getAutoBalance={getAutoBalance}
                                isLatestModified={item.id === latestModifiedId}
                            />
                        ))}
                    </tbody>
                    {/* Enhanced Totals Row */}
                    <tfoot className="bg-slate-200 dark:bg-slate-800 font-bold border-t-2 border-slate-600">
                        <tr>
                            <td colSpan={3} className="px-4 py-3 border border-slate-600 text-left">إجمالي الصندوق / TOTAL</td>
                            <td className="px-2 py-3 font-mono border border-slate-600 text-center text-sm">{totalBank.toLocaleString('en-US')}</td>
                            <td className="px-2 py-3 font-mono border border-slate-600 text-center text-sm">{totalSys.toLocaleString('en-US')}</td>
                            {showAutoBalance && (
                                <td className={`px-2 py-3 font-mono border border-slate-600 text-center text-sm ${hasAnyAutoBalance ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}`}>
                                    {hasAnyAutoBalance ? totalAutoBalance?.toLocaleString('en-US') : '-'}
                                </td>
                            )}
                            <td className={`px-2 py-3 font-mono border border-slate-600 text-center text-sm ${totalVariance === 0 ? 'text-green-700' : 'text-red-700'}`}>
                                {totalVariance.toLocaleString('en-US')}
                            </td>
                            <td className="px-2 py-3 border border-slate-600 text-center font-mono">
                                {items.reduce((acc: number, item: FundLineItem) => acc + (item.draftCount || 0), 0)}
                            </td>
                            <td className="px-2 py-3 border border-slate-600 text-center font-mono">
                                {items.reduce((acc: number, item: FundLineItem) => acc + (item.draftAmount || 0), 0).toLocaleString('en-US')}
                            </td>
                            <td colSpan={3} className="border border-slate-600"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

// Archive Section Component
function ArchiveSection({ fundSnapshots, setReportSnapshot, currentUser, deleteFundSnapshot }: any) {

    // Group snapshots by date
    const groupedSnapshots = useMemo(() => {
        const groups: { [date: string]: FundSnapshot[] } = {};
        fundSnapshots.forEach((snap: FundSnapshot) => {
            if (!groups[snap.date]) {
                groups[snap.date] = [];
            }
            groups[snap.date].push(snap);
        });
        return groups;
    }, [fundSnapshots]);

    // Sort dates descending (newest first)
    const sortedDates = useMemo(() => {
        return Object.keys(groupedSnapshots).sort((a, b) => {
            // Assuming date format is DD/MM/YYYY or similar. 
            // If strictly DD/MM/YYYY:
            const partsA = a.split('/');
            const partsB = b.split('/');
            if (partsA.length === 3 && partsB.length === 3) {
                const d1 = new Date(Number(partsA[2]), Number(partsA[1]) - 1, Number(partsA[0]));
                const d2 = new Date(Number(partsB[2]), Number(partsB[1]) - 1, Number(partsB[0]));
                return d2.getTime() - d1.getTime();
            }
            return new Date(b).getTime() - new Date(a).getTime();
        });
    }, [groupedSnapshots]);

    const [expandedDates, setExpandedDates] = useState<string[]>([]);

    const toggleDate = (date: string) => {
        setExpandedDates((prev: string[]) =>
            prev.includes(date) ? prev.filter((d: string) => d !== date) : [...prev, date]
        );
    };

    return (
        <div className="border-t-4 border-slate-900 dark:border-slate-300 pt-8">
            <h3 className="font-bold text-2xl text-slate-700 dark:text-slate-300 mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined">history_edu</span>
                أرشيف المطابقات السابقة
            </h3>

            <div className="space-y-4">
                {sortedDates.map((date: string) => {
                    const snapshots = groupedSnapshots[date];
                    const isExpanded = expandedDates.includes(date);

                    // Daily Totals
                    const dailyVarianceOld = snapshots.reduce((acc: number, s: FundSnapshot) => acc + (s.totalVarianceOld || 0), 0);
                    const dailyVarianceNew = snapshots.reduce((acc: number, s: FundSnapshot) => acc + (s.totalVarianceNew || 0), 0);
                    const dailyVarianceSar = snapshots.reduce((acc: number, s: FundSnapshot) => acc + (s.totalVarianceSar || 0), 0);

                    return (
                        <div key={date} className="bg-white dark:bg-[#1e293b] rounded-xl border-2 border-slate-300 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                            {/* Header Row */}
                            <div
                                onClick={() => toggleDate(date)}
                                className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                <div className="flex items-center gap-6">
                                    <button className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                        <span className="material-symbols-outlined text-slate-400">expand_more</span>
                                    </button>

                                    <div className="flex items-center gap-3">
                                        <span className="font-mono font-black text-xl text-[#263238] dark:text-white">{date}</span>
                                        <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold px-2.5 py-1 rounded-full">
                                            {snapshots.length} مطابقات
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    {/* Daily Summary Variances */}
                                    {snapshots.length > 0 && (
                                        <div className="hidden sm:flex items-center gap-3 text-sm font-bold opacity-75">
                                            {(dailyVarianceOld !== 0) && (
                                                <span className={`text-xs px-2 py-0.5 rounded bg-slate-100 ${dailyVarianceOld === 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    قديم: {dailyVarianceOld}
                                                </span>
                                            )}
                                            {(dailyVarianceNew !== 0) && (
                                                <span className={`text-xs px-2 py-0.5 rounded bg-slate-100 ${dailyVarianceNew === 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    جديد: {dailyVarianceNew}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Expanded Content */}
                            {isExpanded && (
                                <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-6 animate-fade-in">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {snapshots.map((snap: FundSnapshot) => (
                                            <div
                                                key={snap.id}
                                                className="bg-white dark:bg-[#1e293b] p-6 rounded-xl border border-slate-200 dark:border-slate-600 hover:border-[#C62828] dark:hover:border-[#C62828] transition-all group shadow-sm"
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono font-bold text-lg text-[#263238] dark:text-white">{snap.fullTimestamp.split(' ')[1] || ''} {snap.fullTimestamp.split(' ')[2] || ''}</span>
                                                            {snap.type && (
                                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${snap.type === 'local' ? 'bg-green-100 text-green-700' : snap.type === 'foreign' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                                                    {snap.type === 'local' ? 'محلي' : snap.type === 'foreign' ? 'أجنبي' : 'كامل'}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-[#607D8B] dark:text-slate-400 mt-1">بواسطة: {snap.user}</p>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setReportSnapshot(snap); }}
                                                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-[#263238] dark:hover:text-white transition-colors"
                                                            title="عرض التفاصيل"
                                                        >
                                                            <span className="material-symbols-outlined">visibility</span>
                                                        </button>
                                                        <button
                                                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); deleteFundSnapshot(snap.id); }}
                                                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                                                            title="حذف"
                                                        >
                                                            <span className="material-symbols-outlined">delete</span>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Currency Variances */}
                                                <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold">
                                                    <span className={`px-2 py-1 rounded ${snap.totalVarianceOld === 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        قديم: {snap.totalVarianceOld}
                                                    </span>
                                                    <span className={`px-2 py-1 rounded ${snap.totalVarianceNew === 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                                        جديد: {snap.totalVarianceNew}
                                                    </span>
                                                    {(snap.totalVarianceSar !== undefined && snap.totalVarianceSar !== 0) && (
                                                        <span className={`px-2 py-1 rounded ${snap.totalVarianceSar === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                                            SAR: {snap.totalVarianceSar}
                                                        </span>
                                                    )}
                                                    {(snap.totalVarianceBlueUsd !== undefined && snap.totalVarianceBlueUsd !== 0) && (
                                                        <span className={`px-2 py-1 rounded ${snap.totalVarianceBlueUsd === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-red-100 text-red-700'}`}>
                                                            Blue: {snap.totalVarianceBlueUsd}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- Edit Snapshot Modal ---
const EditSnapshotModal = ({ snapshot, onClose, onSave, currentUser }: any) => {
    const [localSnap, setLocalSnap] = useState<FundSnapshot>({ ...snapshot });

    const handleUpdateItem = (listKey: string, itemId: string, field: string, value: any) => {
        const list = (localSnap as any)[listKey] || [];
        const updatedList = list.map((item: any) => {
            if (item.id === itemId) {
                const updated = { ...item, [field]: value };
                if (field === 'bankBalance' || field === 'sysBalance') {
                    updated.variance = (updated.bankBalance || 0) - (updated.sysBalance || 0);
                }
                return updated;
            }
            return item;
        });

        const updatedSnap = { ...localSnap, [listKey]: updatedList };

        // Recalculate totals
        if (listKey === 'oldRiyalItems') updatedSnap.totalVarianceOld = updatedList.reduce((acc: number, curr: any) => acc + curr.variance, 0);
        if (listKey === 'newRiyalItems') updatedSnap.totalVarianceNew = updatedList.reduce((acc: number, curr: any) => acc + curr.variance, 0);
        if (listKey === 'sarItems') updatedSnap.totalVarianceSar = updatedList.reduce((acc: number, curr: any) => acc + curr.variance, 0);
        if (listKey === 'blueUsdItems') updatedSnap.totalVarianceBlueUsd = updatedList.reduce((acc: number, curr: any) => acc + curr.variance, 0);
        if (listKey === 'whiteUsdItems') updatedSnap.totalVarianceWhiteUsd = updatedList.reduce((acc: number, curr: any) => acc + curr.variance, 0);
        if (listKey === 'customCurrencyItems') updatedSnap.totalVarianceCustom = updatedList.reduce((acc: number, curr: any) => acc + curr.variance, 0);

        setLocalSnap(updatedSnap);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in text-right" dir="rtl">
            <div className="bg-slate-50 dark:bg-slate-900 rounded-3xl w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-slate-700">
                {/* Header */}
                <div className="p-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <div>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                            <span className="material-symbols-outlined text-[#C62828]">history_edu</span>
                            تعديل مطابقة مؤرشفة
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">تاريخ الأرشفة: {localSnap.fullTimestamp} | بواسطة: {localSnap.user}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar text-right">
                    {/* Old Riyal */}
                    {localSnap.oldRiyalItems?.length > 0 && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-lg text-green-700 border-r-4 border-green-600 pr-3">الريال القديم</h4>
                            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-sm text-right">
                                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                                        <tr>
                                            <th className="p-3">الحساب</th>
                                            <th className="p-3">رصيد المحفظة</th>
                                            <th className="p-3">رصيد النظام</th>
                                            <th className="p-3">الفارق</th>
                                            <th className="p-3">ملاحظات</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {localSnap.oldRiyalItems.map((item: any) => (
                                            <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="p-3 font-bold">{item.bankName}</td>
                                                <td className="p-3">
                                                    <input
                                                        type="number"
                                                        value={item.bankBalance}
                                                        onChange={(e) => handleUpdateItem('oldRiyalItems', item.id, 'bankBalance', Number(e.target.value))}
                                                        className="w-32 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-left font-mono"
                                                    />
                                                </td>
                                                <td className="p-3">
                                                    <input
                                                        type="number"
                                                        value={item.sysBalance}
                                                        onChange={(e) => handleUpdateItem('oldRiyalItems', item.id, 'sysBalance', Number(e.target.value))}
                                                        className="w-32 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-left font-mono"
                                                    />
                                                </td>
                                                <td className={`p-3 font-mono font-bold ${item.variance === 0 ? 'text-green-600' : 'text-red-600'}`}>{item.variance.toLocaleString('en-US')}</td>
                                                <td className="p-3">
                                                    <input
                                                        value={item.notes || ''}
                                                        onChange={(e) => handleUpdateItem('oldRiyalItems', item.id, 'notes', e.target.value)}
                                                        className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* New Riyal */}
                    {localSnap.newRiyalItems?.length > 0 && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-lg text-blue-700 border-r-4 border-blue-600 pr-3">الريال الجديد</h4>
                            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-sm text-right">
                                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                                        <tr>
                                            <th className="p-3">الحساب</th>
                                            <th className="p-3">رصيد المحفظة</th>
                                            <th className="p-3">رصيد النظام</th>
                                            <th className="p-3">الفارق</th>
                                            <th className="p-3">ملاحظات</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {localSnap.newRiyalItems.map((item: any) => (
                                            <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="p-3 font-bold">{item.bankName}</td>
                                                <td className="p-3">
                                                    <input
                                                        type="number"
                                                        value={item.bankBalance}
                                                        onChange={(e) => handleUpdateItem('newRiyalItems', item.id, 'bankBalance', Number(e.target.value))}
                                                        className="w-32 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-left font-mono"
                                                    />
                                                </td>
                                                <td className="p-3">
                                                    <input
                                                        type="number"
                                                        value={item.sysBalance}
                                                        onChange={(e) => handleUpdateItem('newRiyalItems', item.id, 'sysBalance', Number(e.target.value))}
                                                        className="w-32 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-left font-mono"
                                                    />
                                                </td>
                                                <td className={`p-3 font-mono font-bold ${item.variance === 0 ? 'text-green-600' : 'text-red-600'}`}>{item.variance.toLocaleString('en-US')}</td>
                                                <td className="p-3">
                                                    <input
                                                        value={item.notes || ''}
                                                        onChange={(e) => handleUpdateItem('newRiyalItems', item.id, 'notes', e.target.value)}
                                                        className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-4">
                    <button onClick={onClose} className="px-6 py-2.5 font-bold text-slate-500 hover:text-slate-700 transition-colors">إلغاء</button>
                    <button onClick={() => onSave(localSnap)} className="px-10 py-2.5 bg-[#C62828] text-white rounded-xl font-black shadow-lg shadow-red-900/20 hover:bg-red-700 transition-all flex items-center gap-2">
                        <span className="material-symbols-outlined">save</span>
                        حفظ التعديلات في الأرشيف
                    </button>
                </div>
            </div>
        </div>
    );
};

// Add/Edit Bank Modal Component
const AddBankModal = ({ newBankName, setNewBankName, newBankCurrency, setNewBankCurrency, newBankAccountNumber, setNewBankAccountNumber, customCurrencyName, setCustomCurrencyName, handleAddBank, setIsAddBankModalOpen, editingBankId }: any) => {
    const currencyOptions: { value: FundsCurrency; label: string; color: string }[] = [
        { value: 'old_riyal', label: 'ريال قديم', color: 'text-green-600' },
        { value: 'new_riyal', label: 'ريال جديد', color: 'text-blue-600' },
        { value: 'sar', label: 'ريال سعودي', color: 'text-yellow-600' },
        { value: 'blue_usd', label: 'دولار أزرق', color: 'text-indigo-600' },
        { value: 'white_usd', label: 'دولار أبيض', color: 'text-gray-600' },
        { value: 'custom', label: 'عملة مخصصة', color: 'text-purple-600' }
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <h3 className="text-xl font-bold mb-4 text-slate-800 dark:text-white">
                    {editingBankId ? 'تعديل بيانات الحساب' : 'إضافة حساب بنكي جديد'}
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-bold text-slate-500 block mb-1">اسم الحساب (مثال: كُريمي، جوالي)</label>
                        <input
                            autoFocus
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent text-slate-900 dark:text-white"
                            value={newBankName}
                            onChange={e => setNewBankName(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-bold text-slate-500 block mb-1">رقم الحساب (اختياري)</label>
                        <input
                            type="text"
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent text-slate-900 dark:text-white font-mono"
                            value={newBankAccountNumber}
                            onChange={e => setNewBankAccountNumber(e.target.value)}
                            placeholder="مثال: 001, 002"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-bold text-slate-500 block mb-1">نوع العملة</label>
                        <div className="grid grid-cols-2 gap-2">
                            {currencyOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setNewBankCurrency(opt.value)}
                                    className={`py-2 px-3 rounded-md text-sm font-bold border-2 transition-all ${newBankCurrency === opt.value
                                        ? `border-current ${opt.color} bg-current/10`
                                        : 'border-slate-300 dark:border-slate-600 text-slate-500'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {newBankCurrency === 'custom' && (
                        <div>
                            <label className="text-sm font-bold text-slate-500 block mb-1">اسم العملة المخصصة</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent text-slate-900 dark:text-white"
                                value={customCurrencyName}
                                onChange={e => setCustomCurrencyName(e.target.value)}
                                placeholder="مثال: درهم إماراتي، دينار كويتي"
                            />
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={() => setIsAddBankModalOpen(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 font-bold">إلغاء</button>
                    <button onClick={handleAddBank} className="px-6 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800">
                        {editingBankId ? 'حفظ التعديلات' : 'حفظ وإضافة'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Quick Match Modal Component ---

interface QuickMatchModalProps {
    isOpen: boolean;
    onClose: () => void;
    bankDefinitions: any[];
    onApply: (matches: ParsedQuickMatchEntry[]) => void;
}

interface ParsedQuickMatchEntry {
    bankDefId: string;
    bankName: string;
    tawseelAmount: number;
    mahfazaAmount: number;
    variance: number;
    status: 'matched' | 'unmatched';
    reference: string;
}

interface UnmatchedEntry {
    id: string;
    originalText: string;
    amount: number;
    source: 'tawseel' | 'mahfaza';
}

const QuickMatchModal: React.FC<QuickMatchModalProps> = ({ isOpen, onClose, bankDefinitions, onApply }) => {
    const [activeTab, setActiveTab] = useState<'paste' | 'upload'>('paste');
    const [pasteMode, setPasteMode] = useState<'amount' | 'amount_ref' | 'amount_ref_date'>('amount_ref');
    const [tawseelText, setTawseelText] = useState('');
    const [mahfazaText, setMahfazaText] = useState('');
    const [parsedEntries, setParsedEntries] = useState<ParsedQuickMatchEntry[]>([]);
    const [unmatchedEntries, setUnmatchedEntries] = useState<UnmatchedEntry[]>([]);

    if (!isOpen) return null;

    const handleParseText = async () => {
        try {
            const parseLines = (text: string) => {
                const lines = text.split('\n').filter(l => l.trim());
                return lines.map(line => {
                    // Split by tab, comma, semicolon, pipe, or multiple spaces
                    const parts = line.split(/[\t,;|]+/).filter(p => p.trim());
                    let amount = 0;
                    let possibleRefs: string[] = [];

                    if (parts.length >= 1) {
                        // Logic: Find all tokens that look like numbers
                        // Clean Arabic letters and commas from the string before parsing
                        const numericCandidates = parts.map(p => {
                            const cleanStr = p.replace(/[^\d.-]/g, '');
                            return {
                                val: parseNumber(cleanStr),
                                raw: p.trim(),
                                isLongDigit: /^\d{7,}$/.test(cleanStr.replace(/[^0-9]/g, ''))
                            };
                        }).filter(c => !isNaN(c.val) && c.val !== 0);

                        if (numericCandidates.length > 0) {
                            // Pick the one that isn't a long digit string, ideally the last one
                            const bestCandidate = [...numericCandidates].reverse().find(c => !c.isLongDigit) || numericCandidates[numericCandidates.length - 1];
                            amount = bestCandidate.val;

                            // Possible refs are everything else
                            possibleRefs = parts.filter(p => p.trim() !== bestCandidate.raw);
                        } else {
                            // Fallback if no clear numeric candidate
                            amount = parseNumber(parts[parts.length - 1]);
                            possibleRefs = parts.slice(0, -1);
                        }
                    }

                    // Extra check: if only one part, try splitting by space
                    if (parts.length === 1 && amount === 0) {
                        const spaceParts = parts[0].trim().split(/\s+/);
                        if (spaceParts.length >= 2) {
                            amount = parseNumber(spaceParts[spaceParts.length - 1]);
                            possibleRefs = spaceParts.slice(0, -1);
                        } else {
                            amount = parseNumber(parts[0]);
                            possibleRefs = [parts[0]];
                        }
                    }

                    console.log(`[QuickMatch] Parsed line: "${line}" -> Amount: ${amount}, Refs:`, possibleRefs);
                    return { amount, possibleRefs, originalText: line };
                });
            };

            if (!tawseelText.trim() || !mahfazaText.trim()) {
                const isConfirmed = await confirmDialog("أحد مربعات الإدخال فارغ. هل تريد الاستمرار في المعالجة؟ لن تظهر مقارنة صحيحة إلا إذا أضفت بيانات في كلا المربعين.", {
                    type: 'warning'
                });
                if (!isConfirmed) {
                    return;
                }
            }

            const tawseelData = parseLines(tawseelText);
            const mahfazaData = parseLines(mahfazaText);

            const filteredBanks = bankDefinitions.filter((bd: any) => {
                const name = bd.name.toLowerCase();
                const isWallet = name.includes('محفظة') ||
                    name.includes('محفظه') ||
                    name.includes('wallet') ||
                    name.includes('ون كاش') ||
                    name.includes('one cash') ||
                    name.includes('onecash') ||
                    name.includes('فلوسك') ||
                    name.includes('m-kuraimi') ||
                    name.includes('ام كريمي') ||
                    name.includes('m-money') ||
                    name.includes('ام فلوس');
                return !isWallet;
            });

            const aggregated: Record<string, ParsedQuickMatchEntry> = {};
            const newUnmatched: UnmatchedEntry[] = [];

            const findBankFromRefs = (refs: string[]) => {
                let bestMatch = null;
                let highestScore = 0;

                for (const ref of refs) {
                    if (!ref) continue;
                    const cleanRef = ref.replace(/[^0-9]/g, '');
                    const refLower = ref.toLowerCase();

                    for (const bd of filteredBanks) {
                        let score = 0;
                        const bdAccNumber = bd.accountNumber?.replace(/[^0-9]/g, '') || '';
                        const bdNameLower = bd.name.toLowerCase();

                        // Account Matches
                        if (cleanRef && bdAccNumber) {
                            if (bdAccNumber === cleanRef) {
                                score += 100; // Exact account match
                            } else if (cleanRef.startsWith(bdAccNumber.substring(0, 4)) || bdAccNumber.startsWith(cleanRef.substring(0, 4))) {
                                score += 50; // Partial account match (first 4 digits)
                            }
                        }

                        // Name matches
                        if (bd.name === ref) {  // Exact literal name match
                            score += 80;
                        } else if (bdNameLower === refLower) { // Exact lowercase name match
                            score += 70;
                        } else if (bdNameLower.length > 2 && refLower.length > 2) {
                            if (bdNameLower.includes(refLower) || refLower.includes(bdNameLower)) {
                                score += 40; // Substring match
                            }
                        }

                        if (score > 0) {
                            console.log(`[QuickMatch] Scoring - Ref: "${ref}", Bank: "${bd.name}", Score: ${score}`);
                        }

                        if (score > highestScore) {
                            highestScore = score;
                            bestMatch = { bank: bd, matchedRef: ref };
                        }
                    }
                }

                if (highestScore >= 50) {
                    console.log(`[QuickMatch] MATCH FOUND: Ref selected: "${bestMatch?.matchedRef}", Bank: "${bestMatch?.bank?.name}", Score: ${highestScore}`);
                    return bestMatch;
                }

                console.log(`[QuickMatch] NO MATCH (Score ${highestScore} < 50) for refs:`, refs);
                return null;
            };

            tawseelData.forEach((d, index) => {
                const match = findBankFromRefs(d.possibleRefs);
                if (match) {
                    const { bank, matchedRef } = match;
                    if (!aggregated[bank.id]) {
                        aggregated[bank.id] = {
                            bankDefId: bank.id,
                            bankName: bank.name,
                            tawseelAmount: 0,
                            mahfazaAmount: 0,
                            variance: 0,
                            status: 'matched',
                            reference: matchedRef
                        };
                    }
                    aggregated[bank.id].tawseelAmount += d.amount;
                } else if (d.amount !== 0) {
                    newUnmatched.push({
                        id: `t_${index}_${Date.now()}`,
                        originalText: d.originalText,
                        amount: d.amount,
                        source: 'tawseel'
                    });
                }
            });

            mahfazaData.forEach((d, index) => {
                const match = findBankFromRefs(d.possibleRefs);
                if (match) {
                    const { bank, matchedRef } = match;
                    if (!aggregated[bank.id]) {
                        aggregated[bank.id] = {
                            bankDefId: bank.id,
                            bankName: bank.name,
                            tawseelAmount: 0,
                            mahfazaAmount: 0,
                            variance: 0,
                            status: 'matched',
                            reference: matchedRef
                        };
                    }
                    aggregated[bank.id].mahfazaAmount += d.amount;
                } else if (d.amount !== 0) {
                    newUnmatched.push({
                        id: `m_${index}_${Date.now()}`,
                        originalText: d.originalText,
                        amount: d.amount,
                        source: 'mahfaza'
                    });
                }
            });

            const entries = Object.values(aggregated).map((e: any) => ({
                ...e,
                variance: Number((e.tawseelAmount - e.mahfazaAmount).toFixed(2))
            }));

            if (entries.length === 0 && newUnmatched.length === 0 && (tawseelText.trim() || mahfazaText.trim())) {
                alert("لم يتم العثور على أي حسابات مبدئياً. التحقق من المبالغ المدخلة.");
            } else if (entries.length > 0 || newUnmatched.length > 0) {
                alert(`✅ اكتملت المعالجة!\n- المطابقات التلقائية الناجحة: ${entries.length}\n- القيود غير المطابقة وتحتاج لربط يدوي: ${newUnmatched.length}`);
            }

            console.log("[QuickMatch] Final Aggregated Entries:", entries);
            console.log("[QuickMatch] Final Unmatched Entries:", newUnmatched);

            setParsedEntries(entries);
            setUnmatchedEntries(newUnmatched);
        } catch (error) {
            console.error("Match error:", error);
            alert("حدث خطأ أثناء معالجة البيانات. يرجى التأكد من التنسيق.");
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'tawseel' | 'mahfaza') => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

                // Convert sheet to text (TSV style)
                const textData = XLSX.utils.sheet_to_csv(firstSheet, { FS: '\t' });
                if (target === 'tawseel') setTawseelText(textData);
                else setMahfazaText(textData);
            };
            reader.readAsArrayBuffer(file);
        } else {
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target?.result as string;
                if (target === 'tawseel') {
                    setTawseelText(text);
                } else {
                    setMahfazaText(text);
                }
            };
            reader.readAsText(file);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600">
                            <span className="material-symbols-outlined">flash_on</span>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">مطابقة سريعة للمبالغ</h2>
                            <p className="text-xs text-slate-500">تحديث مبالغ البنك دفعة واحدة من كشف الحساب</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Tabs */}
                    <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl w-fit">
                        <button
                            onClick={() => setActiveTab('paste')}
                            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'paste' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            لصق نص
                        </button>
                        <button
                            onClick={() => setActiveTab('upload')}
                            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'upload' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            رفع ملف
                        </button>
                    </div>

                    {activeTab === 'paste' ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">بيانات التوصيل (Tawseel)</label>
                                    <textarea
                                        className="w-full h-40 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm shadow-inner transition-all font-mono"
                                        placeholder="ألصق المبالغ هنا... رقم الحساب أو الاسم متبوعاً بالمبلغ"
                                        value={tawseelText}
                                        onChange={(e) => setTawseelText(e.target.value)}
                                        dir="ltr"
                                    />
                                </div>
                                <div className="pt-8">
                                    <button
                                        onClick={() => {
                                            const temp = tawseelText;
                                            setTawseelText(mahfazaText);
                                            setMahfazaText(temp);
                                        }}
                                        className="p-3 bg-slate-100 dark:bg-slate-700 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-slate-400 hover:text-indigo-600 transition-all shadow-sm"
                                        title="تبديل المدخلات"
                                    >
                                        <span className="material-symbols-outlined">swap_horiz</span>
                                    </button>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">بيانات المحفظة (Mahfaza)</label>
                                    <textarea
                                        className="w-full h-40 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm shadow-inner transition-all font-mono"
                                        placeholder="ألصق المبالغ هنا... رقم الحساب أو الاسم متبوعاً بالمبلغ"
                                        value={mahfazaText}
                                        onChange={(e) => setMahfazaText(e.target.value)}
                                        dir="ltr"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button
                                    onClick={handleParseText}
                                    className="flex-1 bg-indigo-600 text-white px-6 py-3 rounded-2xl hover:bg-indigo-700 transition-all font-bold shadow-lg shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined">sync</span>
                                    بدء المعالجة والمطابقة
                                </button>
                                <button
                                    onClick={() => {
                                        setTawseelText('');
                                        setMahfazaText('');
                                        setParsedEntries([]);
                                        setUnmatchedEntries([]);
                                    }}
                                    className="px-6 py-3 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-2xl transition-all font-bold border border-slate-200 dark:border-slate-700"
                                >
                                    مسح الكل
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl p-12 bg-slate-50/50 dark:bg-slate-900/30">
                            <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">upload_file</span>
                            <p className="text-sm text-slate-500 mb-6 text-center">قم برفع كشف حساب التوصيل أو كشف المحفظة لمعالجته</p>

                            <div className="flex gap-4 w-full max-w-md">
                                <input type="file" id="upload-tawseel" className="hidden" accept=".csv,.txt,.xlsx,.xls" onChange={(e) => handleFileUpload(e, 'tawseel')} />
                                <label
                                    htmlFor="upload-tawseel"
                                    className="flex-1 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 rounded-xl text-center text-sm font-bold cursor-pointer hover:bg-indigo-100 transition-colors flex flex-col items-center gap-2"
                                >
                                    <span className="material-symbols-outlined">upload</span>
                                    رفع ملف التوصيل
                                </label>

                                <input type="file" id="upload-mahfaza" className="hidden" accept=".csv,.txt,.xlsx,.xls" onChange={(e) => handleFileUpload(e, 'mahfaza')} />
                                <label
                                    htmlFor="upload-mahfaza"
                                    className="flex-1 px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 rounded-xl text-center text-sm font-bold cursor-pointer hover:bg-amber-100 transition-colors flex flex-col items-center gap-2"
                                >
                                    <span className="material-symbols-outlined">upload</span>
                                    رفع ملف المحفظة
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Preview Table */}
                    {parsedEntries.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm text-indigo-500">visibility</span>
                                    معاينة نتائج المطابقة ({parsedEntries.length})
                                </h3>
                                <div className="text-xs text-slate-400">
                                    * يتم تجاهل المحافظ تلقائياً من النتائج
                                </div>
                            </div>
                            <div className="border border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3 text-right">البنك / الحساب</th>
                                            <th className="px-4 py-3 text-right">مبلغ التوصيل</th>
                                            <th className="px-4 py-3 text-right">مبلغ المحفظة</th>
                                            <th className="px-4 py-3 text-right font-bold">الفارق</th>
                                            <th className="px-4 py-3 text-center">الإجراء</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {parsedEntries.map((entry, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-slate-800 dark:text-white">{entry.bankName}</div>
                                                    <div className="text-[10px] text-slate-400 font-mono">{entry.reference}</div>
                                                </td>
                                                <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300" dir="ltr">{formatNumber(entry.tawseelAmount || 0)}</td>
                                                <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300" dir="ltr">{formatNumber(entry.mahfazaAmount || 0)}</td>
                                                <td className={`px-4 py-3 font-bold ${(entry.variance || 0) === 0 ? 'text-emerald-600' : 'text-rose-600'}`} dir="ltr">
                                                    {formatNumber(entry.variance || 0)}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {(entry.variance || 0) !== 0 ? (
                                                        <button
                                                            onClick={() => {
                                                                const newEntries = [...parsedEntries];
                                                                newEntries[idx] = { ...entry, mahfazaAmount: entry.tawseelAmount, variance: 0 };
                                                                setParsedEntries(newEntries);
                                                            }}
                                                            className="px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg border border-amber-200 dark:border-amber-800 hover:bg-amber-100 transition-colors text-[10px] font-bold"
                                                            title="مساواة مبلغ المحفظة بالتوصيل"
                                                        >
                                                            تسوية
                                                        </button>
                                                    ) : (
                                                        <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Unmatched Entries Table */}
                    {unmatchedEntries.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm text-orange-500">warning</span>
                                    إدخالات غير متطابقة ({unmatchedEntries.length})
                                </h3>
                                <div className="text-xs text-slate-400">
                                    الرجاء اختيار البنك الصحيح يدوياً للربط
                                </div>
                            </div>
                            <div className="border border-orange-200 dark:border-orange-900/50 rounded-2xl overflow-hidden shadow-sm">
                                <table className="w-full text-xs">
                                    <thead className="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400">
                                        <tr>
                                            <th className="px-4 py-3 text-right">المصدر</th>
                                            <th className="px-4 py-3 text-right">النص الأصلي</th>
                                            <th className="px-4 py-3 text-right">المبلغ المستخرج</th>
                                            <th className="px-4 py-3 text-right">الربط اليدوي</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-orange-100 dark:divide-orange-900/30">
                                        {unmatchedEntries.map((entry) => (
                                            <tr key={entry.id} className="hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-colors bg-white dark:bg-slate-900/30">
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-1 rounded inline-block text-[10px] font-bold ${entry.source === 'tawseel' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
                                                        {entry.source === 'tawseel' ? 'توصيل' : 'المحفظة'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-slate-600 dark:text-slate-400 font-mono truncate max-w-[200px]" title={entry.originalText}>
                                                        {entry.originalText}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300" dir="ltr">
                                                    {formatNumber(entry.amount || 0)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <select
                                                        className="w-full px-2 py-1.5 text-xs font-bold border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-indigo-500"
                                                        value=""
                                                        onChange={(e) => {
                                                            const bankId = e.target.value;
                                                            if (!bankId) return;

                                                            const bank = bankDefinitions.find(b => b.id === bankId);
                                                            if (!bank) return;

                                                            const newParsed = [...parsedEntries];
                                                            const existingIdx = newParsed.findIndex(p => p.bankDefId === bank.id);

                                                            if (existingIdx >= 0) {
                                                                if (entry.source === 'tawseel') {
                                                                    newParsed[existingIdx].tawseelAmount += entry.amount;
                                                                } else {
                                                                    newParsed[existingIdx].mahfazaAmount += entry.amount;
                                                                }
                                                                newParsed[existingIdx].variance = Number((newParsed[existingIdx].tawseelAmount - newParsed[existingIdx].mahfazaAmount).toFixed(2));
                                                            } else {
                                                                newParsed.push({
                                                                    bankDefId: bank.id,
                                                                    bankName: bank.name,
                                                                    tawseelAmount: entry.source === 'tawseel' ? entry.amount : 0,
                                                                    mahfazaAmount: entry.source === 'mahfaza' ? entry.amount : 0,
                                                                    variance: entry.source === 'tawseel' ? entry.amount : -entry.amount,
                                                                    status: 'matched', // force matched status for manual links
                                                                    reference: 'ربط يدوي'
                                                                });
                                                            }

                                                            setParsedEntries(newParsed);
                                                            setUnmatchedEntries(curr => curr.filter(u => u.id !== entry.id));
                                                        }}
                                                    >
                                                        <option value="">-- اختر الحساب للربط --</option>
                                                        {bankDefinitions.map(b => (
                                                            <option key={b.id} value={b.id}>{b.name}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                    >
                        إلغاء
                    </button>
                    <button
                        onClick={() => onApply(parsedEntries)}
                        disabled={parsedEntries.length === 0}
                        className="px-8 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-lg shadow-indigo-100 dark:shadow-none"
                    >
                        تطبيق المبالغ
                    </button>
                </div>
            </div>
        </div>
    );
};

// Report Modal Component (Optimized A4 Layout + Image Export)
// ... (Keeping ReportModal as is from previous file content, skipping to save space if irrelevant, but I need to include it for validity)
// I will include the existing ReportModal code to ensure the file is complete.

const ReportModal = ({ snapshot, setReportSnapshot }: any) => {
    const downloadAsImage = async (mode?: string) => {
        const html2canvas = (await import('html2canvas')).default;
        const sourceElement = document.getElementById('snapshot-print-area');
        if (!sourceElement) return;

        // Define all currency sections that may exist
        const sections: { key: string; items: any[]; title: string; totalVariance: number; color: string; label: string }[] = [];

        if (snapshot.oldRiyalItems?.length > 0) sections.push({ key: 'oldRiyal', items: snapshot.oldRiyalItems, title: 'كشف حساب الريال القديم', totalVariance: snapshot.totalVarianceOld, color: 'green', label: 'ريال-قديم' });
        if (snapshot.newRiyalItems?.length > 0) sections.push({ key: 'newRiyal', items: snapshot.newRiyalItems, title: 'كشف حساب الريال الجديد', totalVariance: snapshot.totalVarianceNew, color: 'blue', label: 'ريال-جديد' });
        if (snapshot.sarItems?.length > 0) sections.push({ key: 'sar', items: snapshot.sarItems, title: 'كشف حساب الريال السعودي', totalVariance: snapshot.totalVarianceSar, color: 'yellow', label: 'ريال-سعودي' });
        if (snapshot.blueUsdItems?.length > 0) sections.push({ key: 'blueUsd', items: snapshot.blueUsdItems, title: 'كشف حساب الدولار (أزرق)', totalVariance: snapshot.totalVarianceBlueUsd, color: 'indigo', label: 'دولار-أزرق' });
        if (snapshot.whiteUsdItems?.length > 0) sections.push({ key: 'whiteUsd', items: snapshot.whiteUsdItems, title: 'كشف حساب الدولار (أبيض)', totalVariance: snapshot.totalVarianceWhiteUsd, color: 'gray', label: 'دولار-أبيض' });
        if (snapshot.customCurrencyItems?.length > 0) sections.push({ key: 'custom', items: snapshot.customCurrencyItems, title: 'كشف العملات المخصصة', totalVariance: snapshot.totalVarianceCustom, color: 'purple', label: 'عملات-مخصصة' });

        if (sections.length === 0) {
            alert('لا توجد بيانات للتصدير.');
            return;
        }

        const colorHeaderMap: any = { green: '#059669', blue: '#2563eb', yellow: '#d97706', indigo: '#4f46e5', gray: '#475569', purple: '#9333ea' };

        try {
            // Build all sections HTML first
            const sectionsHtml = sections.map((sec, si) => {
                const rowsHtml = sec.items.map((i: any, idx: number) => `
                        <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom:1px solid #cbd5e1; color:#0f172a;">
                            <td style="padding:6px 8px; border-left:1px solid #cbd5e1; border-right:1px solid #cbd5e1; text-align:center; font-weight:bold;">${idx + 1}</td>
                            <td style="padding:6px 8px; border-left:1px solid #cbd5e1; font-weight:bold;">${i.bankName}</td>
                            <td style="padding:6px 8px; border-left:1px solid #cbd5e1; text-align:center; font-size:11px;">${i.completedAt || '-'}</td>
                            <td style="padding:6px 8px; border-left:1px solid #cbd5e1; text-align:center; font-family:monospace; font-weight:bold;">${i.bankBalance.toLocaleString('en-US')}</td>
                            <td style="padding:6px 8px; border-left:1px solid #cbd5e1; text-align:center; font-family:monospace; font-weight:bold;">${i.sysBalance.toLocaleString('en-US')}</td>
                            <td style="padding:6px 8px; border-left:1px solid #cbd5e1; background:${i.variance === 0 ? 'transparent' : '#fef08a'}; text-align:center; font-family:monospace; font-weight:bold; color:${i.variance === 0 ? '#0f172a' : '#dc2626'}">${i.variance.toLocaleString('en-US')}</td>
                            <td style="padding:6px 8px; border-left:1px solid #cbd5e1; text-align:center; font-family:monospace; font-weight:bold;">${i.draftCount || 0}</td>
                            <td style="padding:6px 8px; border-left:1px solid #cbd5e1; text-align:center; font-family:monospace; font-weight:bold;">${(i.draftAmount || 0).toLocaleString('en-US')}</td>
                            <td style="padding:6px 8px; border-left:1px solid #cbd5e1; font-size:11px;">${i.notes || ''}</td>
                        </tr>
                        `).join('');

                const totalSys = sec.items.reduce((a: number, b: any) => a + (b.sysBalance || 0), 0);
                const totalBank = sec.items.reduce((a: number, b: any) => a + (b.bankBalance || 0), 0);
                const totalVariance = sec.items.reduce((a: number, b: any) => a + (b.variance || 0), 0);
                const totalDraftCount = sec.items.reduce((a: number, b: any) => a + (b.draftCount || 0), 0);
                const totalDraftAmount = sec.items.reduce((a: number, b: any) => a + (b.draftAmount || 0), 0);

                return `
                        <div style="margin-bottom: 25px; page-break-inside: avoid; font-family:'Noto Sans Arabic', sans-serif;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:16px; font-weight:bold; color:#1e293b; padding: 0 5px;">
                                <div>${snapshot.fullTimestamp}</div>
                                <div style="color: #334155;">${sec.title}</div>
                            </div>

                            <table style="width:100%; border-collapse:collapse; border:2px solid #1e293b; font-size:13px; color:#0f172a; table-layout:fixed;">
                                <thead>
                                    <tr style="font-weight:bold; border-bottom:2px solid #1e293b; background:#f8fafc;">
                                        <th style="border:1px solid #cbd5e1; padding:10px 5px; width:4%; text-align:center; color:#334155;">م</th>
                                        <th style="border:1px solid #cbd5e1; padding:10px; width:18%; text-align:right; color:#334155;">اسم الحساب</th>
                                        <th style="border:1px solid #cbd5e1; padding:10px; width:8%; text-align:center; color:#334155;">الوقت</th>
                                        <th style="border:1px solid #cbd5e1; padding:10px; width:12%; text-align:center; color:#b91c1c; background:#fef2f2;">الرصيد لدى<br />المحفظة</th>
                                        <th style="border:1px solid #cbd5e1; padding:10px; width:12%; text-align:center; color:#b91c1c; background:#fef2f2;">الرصيد في<br />النظام</th>
                                        <th style="border:1px solid #cbd5e1; padding:10px; width:10%; text-align:center; color:#334155; background:#fef9c3;">الفارق</th>
                                        <th style="border:1px solid #cbd5e1; padding:10px; width:10%; text-align:center; color:#1d4ed8; background:#eff6ff;">عدد الحوالات<br />المؤقته</th>
                                        <th style="border:1px solid #cbd5e1; padding:10px; width:12%; text-align:center; color:#1d4ed8; background:#eff6ff;">مبلغ الحوالات<br />المؤقتة</th>
                                        <th style="border:1px solid #cbd5e1; padding:10px; width:14%; text-align:right; color:#334155;">الملاحظات</th>
                                    </tr>
                                </thead>
                                <tbody>${rowsHtml}</tbody>
                                <tfoot style="font-weight:bold; border-top:2px solid #1e293b; background:#f8fafc;">
                                    <tr>
                                        <td colspan="3" style="padding:12px; border:1px solid #cbd5e1; text-align:right; font-size:14px; color:#334155;">إجمالي الصندوق / TOTAL</td>
                                        <td style="padding:12px; border:1px solid #cbd5e1; text-align:center; font-size:14px; font-family:monospace; color:#b91c1c;">${totalBank.toLocaleString('en-US')}</td>
                                        <td style="padding:12px; border:1px solid #cbd5e1; text-align:center; font-size:14px; font-family:monospace; color:#b91c1c;">${totalSys.toLocaleString('en-US')}</td>
                                        <td style="padding:12px; border:1px solid #cbd5e1; text-align:center; font-size:14px; font-family:monospace;">${totalVariance.toLocaleString('en-US')}</td>
                                        <td style="padding:12px; border:1px solid #cbd5e1; text-align:center; font-size:14px; font-family:monospace; color:#1d4ed8;">${totalDraftCount}</td>
                                        <td style="padding:12px; border:1px solid #cbd5e1; text-align:center; font-size:14px; font-family:monospace; color:#1d4ed8;">${totalDraftAmount.toLocaleString('en-US')}</td>
                                        <td style="border:1px solid #cbd5e1;"></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        `;
            }).join('');

            // Build full document HTML
            const reportHtml = `
                        <div style="width:1123px; min-height:794px; background:#fff; padding:40px; font-family:'Noto Sans Arabic','Inter',sans-serif; direction:rtl; text-align:right; box-sizing:border-box; border:1px solid #eee;">
                            <!-- Excel Header Title -->
                            <div style="text-align:center; font-size:26px; font-weight:900; border-bottom:4px double #000; padding-bottom:12px; margin-bottom:30px; display:flex; justify-content:center; align-items:center; gap:25px;">
                                <div style="display:flex; flex-direction:column; align-items:flex-start;">
                                    <span>المطابقة اليومية للصناديق</span>
                                    ${snapshot.subType === 'old_riyal' ? '<span style="font-size:12px; color:#059669; border:1px solid #059669; padding:1px 8px; border-radius:10px; margin-top:4px;">ريال قديم</span>' : ''}
                                    ${snapshot.subType === 'new_riyal' ? '<span style="font-size:12px; color:#2563eb; border:1px solid #2563eb; padding:1px 8px; border-radius:10px; margin-top:4px;">ريال جديد</span>' : ''}
                                </div>
                                <div style="height:2px; flex-grow:1; background:#000;"></div>
                                <span style="font-size:20px; border:1px solid #000; padding:2px 15px; border-radius:4px;">${snapshot.user}</span>
                                <span>///</span>
                                <span style="font-size:20px;">${new Date().toLocaleDateString('ar-SA', { weekday: 'long' })} - ${new Date().toLocaleDateString('en-GB')}</span>
                                <span style="font-size:20px; direction:ltr; font-family:monospace;">${snapshot.date}</span>
                            </div>

                            ${sectionsHtml}

                            <!-- Signature Area -->
                            <div style="margin-top:40px; display:flex; justify-content:space-between; border:2px solid #000; padding:25px; background:#fff; align-items:flex-start; page-break-inside: avoid;">
                                <div style="flex:1; text-align:center;">
                                    <p style="margin:0 0 15px 0; font-weight:900; font-size:18px;">الموظف المستلم /</p>
                                    <div style="height:2px; border-bottom:1.5px dashed #000; width:80%; margin:0 auto;"></div>
                                </div>
                                <div style="flex:1; text-align:center;">
                                    <p style="margin:0 0 15px 0; font-weight:900; font-size:18px;">توقيع الموظف المراجع /</p>
                                    <div style="height:2px; border-bottom:1.5px dashed #000; width:80%; margin:0 auto 10px;"></div>
                                    <p style="margin:5px 0 0 0; font-size:13px; font-weight:bold; color:#000;">${snapshot.user}</p>
                                </div>
                            </div>
                        </div>`;

            // Create off-screen container - place it way above the viewport to avoid interfering with UI or opacity issues
            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.top = '-15000px';
            container.style.left = '0';
            container.style.width = '1123px';
            container.style.background = '#fff';
            container.style.zIndex = '99999';
            container.innerHTML = reportHtml;
            document.body.appendChild(container);

            try {
                // Critical: wait for all fonts and layout
                await new Promise(resolve => setTimeout(resolve, 1500));
                if (document.fonts) await document.fonts.ready;

                const canvas = await html2canvas(container, {
                    scale: 2,
                    useCORS: true,
                    allowTaint: true,
                    logging: true,
                    backgroundColor: '#ffffff',
                    width: 1123,
                    windowWidth: 1123,
                    scrollX: 0,
                    scrollY: 0
                });

                const imgData = canvas.toDataURL('image/png');

                if (mode === 'print') {
                    const iframe = document.createElement('iframe');
                    iframe.style.position = 'fixed';
                    iframe.style.right = '0';
                    iframe.style.bottom = '0';
                    iframe.style.width = '0';
                    iframe.style.height = '0';
                    iframe.style.border = '0';
                    document.body.appendChild(iframe);

                    const doc = iframe.contentWindow?.document;
                    if (doc) {
                        doc.open();
                        doc.write(`
                        <html>
                            <head>
                                <title>طباعة المطابقة</title>
                                <style>
                                    @page {size: auto; margin: 5mm; }
                                    body {margin: 0; background: #fff; }
                                    .page {display: flex; justify-content: center; align-items: flex-start; width: 100%; }
                                    img {width: 100%; height: auto; max-width: 100%; }
                                </style>
                            </head>
                            <body>
                                <div class="page"><img src="${imgData}" /></div>
                                <script>
                                        setTimeout(() => {
                                        window.print();
                                        }, 500);
                                </script>
                            </body>
                        </html>
                        `);
                        doc.close();

                        setTimeout(() => {
                            if (iframe.parentNode) document.body.removeChild(iframe);
                        }, 15000);
                    }
                } else {
                    const link = document.createElement('a');
                    link.download = `المطابقة-اليومية-${snapshot.date.replace(/\//g, '-')}.png`;
                    link.href = imgData;
                    link.click();
                }
            } finally {
                if (container && container.parentNode) {
                    container.parentNode.removeChild(container);
                }
            }
        } catch (error: any) {
            console.error('Error generating image:', error);
            alert(`حدث خطأ أثناء إنشاء الصورة: ${error?.message || 'Unknown Error'}`);
        }
    };


    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/95 backdrop-blur-md animate-fade-in" dir="rtl">
            <div className="flex min-h-full items-start justify-center p-4 py-12">
                <div className="bg-white text-slate-900 w-full max-w-4xl rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.5)] flex flex-col print:max-w-none print:my-0 border border-slate-200 relative">

                    {/* Excel Header Area */}
                    <div id="snapshot-print-area" className="bg-white relative mx-auto" style={{ width: '100%', maxWidth: '900px', padding: '25px' }} dir="rtl">
                        <div className="text-center font-black mb-6 border-b-2 border-slate-900 pb-4">
                            <div className="flex items-center justify-center gap-4 text-2xl">
                                <span className="flex flex-col items-center">
                                    <span>المطابقة اليومية للصناديق</span>
                                    {snapshot.isNewApproval ? (
                                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200 mt-1">مطابقة جديدة (الآن)</span>
                                    ) : (
                                        <span className="text-[10px] bg-amber-100 text-amber-700 px-3 py-1 rounded-full border border-amber-200 mt-1">عرض من السجل (الأرشيف)</span>
                                    )}
                                </span>
                                <div className="h-[2px] flex-grow bg-slate-900 mx-4"></div>
                                <span className="text-xl px-4 border border-slate-300 rounded-lg">{snapshot.user}</span>
                                <span className="text-xl">///</span>
                                <span className="text-xl">{new Date().toLocaleDateString('ar-SA', { weekday: 'long' })} - {new Date().toLocaleDateString('en-GB')}</span>
                                <span className="text-xl font-mono" dir="ltr">{snapshot.date}</span>
                            </div>
                        </div>

                        <div className="flex justify-between mb-4 font-bold text-xs">
                            <div className="bg-rose-100 px-4 py-2 border border-slate-300 rounded shadow-sm">{snapshot.fullTimestamp}</div>
                            <div className="bg-amber-50 px-4 py-2 border border-slate-300 rounded shadow-sm">كشف اعتماد المطابقة</div>
                        </div>

                        {/* Reports Sections */}
                        <div className="space-y-10">
                            {snapshot.oldRiyalItems && snapshot.oldRiyalItems.length > 0 && (
                                <SnapshotTable title="كشف حساب الريال القديم" items={snapshot.oldRiyalItems} totalVariance={snapshot.totalVarianceOld} color="green" />
                            )}
                            {snapshot.newRiyalItems && snapshot.newRiyalItems.length > 0 && (
                                <SnapshotTable title="كشف حساب الريال الجديد" items={snapshot.newRiyalItems} totalVariance={snapshot.totalVarianceNew} color="blue" />
                            )}
                            {snapshot.sarItems && snapshot.sarItems.length > 0 && (
                                <SnapshotTable title="كشف حساب الريال السعودي" items={snapshot.sarItems} totalVariance={snapshot.totalVarianceSar} color="yellow" />
                            )}
                            {snapshot.blueUsdItems && snapshot.blueUsdItems.length > 0 && (
                                <SnapshotTable title="كشف حساب الدولار (أزرق)" items={snapshot.blueUsdItems} totalVariance={snapshot.totalVarianceBlueUsd} color="indigo" />
                            )}
                            {snapshot.whiteUsdItems && snapshot.whiteUsdItems.length > 0 && (
                                <SnapshotTable title="كشف حساب الدولار (أبيض)" items={snapshot.whiteUsdItems} totalVariance={snapshot.totalVarianceWhiteUsd} color="gray" />
                            )}
                            {snapshot.customCurrencyItems && snapshot.customCurrencyItems.length > 0 && (
                                <SnapshotTable title="كشف العملات المخصصة" items={snapshot.customCurrencyItems} totalVariance={snapshot.totalVarianceCustom} color="purple" />
                            )}
                        </div>

                        {/* Signature & Authentication Footer */}
                        <div className="mt-8 border-t-2 border-slate-200 pt-8">
                            <div className="grid grid-cols-2 gap-8">
                                <div className="border border-slate-300 p-6 bg-slate-50 rounded-xl">
                                    <p className="font-bold text-slate-700 mb-6 border-b border-slate-200 pb-2">الموظف المستلم /</p>
                                    <div className="h-10 border-b-2 border-dashed border-slate-200 w-3/4"></div>
                                </div>
                                <div className="border border-slate-300 p-6 bg-slate-50 rounded-xl">
                                    <p className="font-bold text-slate-700 mb-2 border-b border-slate-200 pb-2">توقيع الموظف المراجع /</p>
                                    <div className="h-10 border-b-2 border-dashed border-slate-200 w-3/4 mb-4"></div>
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{snapshot.user}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Aesthetic Action Footer */}
                <div className="bg-[#1e293b] p-8 flex flex-col md:flex-row justify-between items-center gap-6 print:hidden">
                    <button
                        onClick={() => setReportSnapshot(null)}
                        className="text-slate-400 hover:text-white font-black text-xs bg-slate-800 hover:bg-slate-700 px-10 py-4 rounded-2xl transition-all border border-slate-700 uppercase tracking-widest">
                        إغلاق وحفظ
                    </button>
                    <div className="flex gap-4 w-full md:w-auto">
                        <button
                            onClick={() => downloadAsImage()}
                            className="flex-1 md:flex-none px-12 py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black flex items-center justify-center gap-4 transition-all transform hover:-translate-y-1 active:scale-95 shadow-[0_15px_40px_rgba(16,185,129,0.3)]">
                            <span className="material-symbols-outlined text-2xl">image</span>
                            حفظ كصورة
                        </button>
                        <button
                            onClick={() => downloadAsImage('print')}
                            className="flex-1 md:flex-none px-12 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black flex items-center justify-center gap-4 transition-all transform hover:-translate-y-1 active:scale-95 shadow-[0_15px_40px_rgba(79,70,229,0.3)]">
                            <span className="material-symbols-outlined text-2xl">print</span>
                            طباعة A4
                        </button>
                    </div>
                </div>
                <div className="bg-slate-900 border-t border-slate-800 text-slate-500 py-4 px-8 text-center text-[10px] print:hidden">
                    <span>Excel Grid Alpha v5.1 - Excel Styled Borders & Colors</span>
                </div>
            </div>
        </div>
    );
};

// Snapshot Table Helper - Premium Design
const SnapshotTable = ({ title, items, totalVariance }: any) => {
    const totalBank = items.reduce((acc: number, item: any) => acc + (item.bankBalance || 0), 0);
    const totalSys = items.reduce((acc: number, item: any) => acc + (item.sysBalance || 0), 0);
    const totalDraftCount = items.reduce((acc: number, item: any) => acc + (item.draftCount || 0), 0);
    const totalDraftAmount = items.reduce((acc: number, item: any) => acc + (item.draftAmount || 0), 0);

    return (
        <div className="mb-8">
            <div className="bg-slate-50 px-4 py-2 border-x-2 border-t-2 border-slate-900 font-bold text-sm text-slate-700 flex justify-between items-center">
                <span>{title}</span>
                <span className="text-[10px] opacity-60">Excel Style Grid v3.0</span>
            </div>
            <div className="border-2 border-slate-900 overflow-hidden rounded-sm">
                <table className="w-full text-right text-[11px] border-collapse">
                    <thead>
                        <tr className="bg-slate-100 border-b border-slate-400 font-bold text-slate-700">
                            <th className="px-2 py-2 border-l border-slate-400 text-center w-[30px]">م</th>
                            <th className="px-3 py-2 border-l border-slate-400">اسم الحساب</th>
                            <th className="px-2 py-2 border-l border-slate-400 text-center">الوقت</th>
                            <th className="px-2 py-2 border-l border-slate-400 text-center bg-rose-50 text-rose-800">الرصيد لدى المحفظة</th>
                            <th className="px-2 py-2 border-l border-slate-400 text-center bg-rose-50 text-rose-800">الرصيد في النظام</th>
                            <th className="px-2 py-2 border-l border-slate-400 text-center bg-yellow-50">الفارق</th>
                            <th className="px-2 py-2 border-l border-slate-400 text-center">عدد الحوالات المؤقته</th>
                            <th className="px-3 py-2 border-l border-slate-400 text-center">مبلغ الحوالات المؤقتة</th>
                            <th className="px-3 py-2">الملاحظات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((i: any, idx: number) => (
                            <tr key={idx} className={`border-b border-slate-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-[#fdf3d7]/30'}`}>
                                <td className="py-1.5 px-2 text-center border-l border-slate-200 font-bold">{idx + 1}</td>
                                <td className="py-1.5 px-3 font-bold bg-[#FFF9C4]/20 border-l border-slate-200">{i.bankName}</td>
                                <td className="py-1.5 px-2 text-center font-mono text-[10px] border-l border-slate-200">{i.completedAt || '-'}</td>
                                <td className="py-1.5 px-2 text-center font-mono font-bold bg-rose-50/50 border-l border-slate-200">{i.bankBalance.toLocaleString('en-US')}</td>
                                <td className="py-1.5 px-2 text-center font-mono font-bold bg-rose-50/50 border-l border-slate-200">{i.sysBalance.toLocaleString('en-US')}</td>
                                <td className={`py-1.5 px-2 text-center font-mono font-black border-l border-slate-200 ${i.variance === 0 ? 'text-slate-800' : 'text-rose-600'}`}>{i.variance.toLocaleString('en-US')}</td>
                                <td className="py-1.5 px-2 text-center font-mono border-l border-slate-200">{i.draftCount || 0}</td>
                                <td className="py-1.5 px-2 text-center font-mono border-l border-slate-200">{(i.draftAmount || 0).toLocaleString('en-US')}</td>
                                <td className="py-1.5 px-3 text-[10px] text-slate-500 italic">{i.notes || ''}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-100 font-black border-t border-slate-400">
                        <tr>
                            <td colSpan={3} className="py-2 px-4 text-left border-l border-slate-400 uppercase text-[9px]">Total / الإجمالي</td>
                            <td className="py-2 px-2 text-center font-mono border-l border-slate-400">{totalBank.toLocaleString('en-US')}</td>
                            <td className="py-2 px-2 text-center font-mono border-l border-slate-400">{totalSys.toLocaleString('en-US')}</td>
                            <td className={`py-2 px-2 text-center font-mono border-l border-slate-400 ${totalVariance === 0 ? 'text-slate-800' : 'text-rose-600'}`}>{totalVariance.toLocaleString('en-US')}</td>
                            <td className="py-2 px-2 text-center font-mono border-l border-slate-400">{totalDraftCount}</td>
                            <td className="py-2 px-2 text-center font-mono border-l border-slate-400">{totalDraftAmount.toLocaleString('en-US')}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default FundsPage;