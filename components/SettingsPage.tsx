import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import type { UserRole, User, TipType, UserPermission, ExchangeRateHistory, AccountMapping, SystemBalance } from '../AppContext';
import { PERMISSION_GROUPS } from '../AppContext';
import { settingsService } from '../src/services/settingsService';
import { confirmDialog } from '../utils/confirm';

const parseNum = (t: string): number => {
    if (!t || t.trim() === '-' || t.trim() === '—' || t.trim() === '') return 0;
    let c = t.trim().replace(/,/g, '').replace(/٬/g, '').replace(/ /g, '');
    let isNegative = false;
    if (c.startsWith('(') && c.endsWith(')')) {
        isNegative = true;
        c = c.slice(1, -1);
    } else if (c.endsWith('-')) {
        isNegative = true;
        c = c.slice(0, -1);
    } else if (c.startsWith('-')) {
        isNegative = true;
        c = c.slice(1);
    }
    return Math.abs(parseFloat(c)) || 0;
};

// Known Arabic column headers for tawseel.app tables
const HEADER_PATTERNS: Record<string, string[]> = {
    accountName: ['اسم الحساب', 'الاسم', 'اسم'],
    accountNumber: ['رقم الحساب', 'رقم', 'الرقم'],
    branch: ['الفرع', 'فرع'],
    currency: ['العملة', 'عملة', 'عملة الحساب'],
    debit: ['مدين', 'المدين'],
    credit: ['دائن', 'الدائن'],
    balance: ['الرصيد', 'رصيد'],
    financialStatement: ['القائمة المالية'],
    costCenter: ['مركز التكلفة'],
    difference: ['الفارق'],
};

// Detect column mapping from header row
const detectColumnMap = (headerCols: string[]): Record<string, number> => {
    const map: Record<string, number> = {};
    headerCols.forEach((col, idx) => {
        const cleaned = col.trim();
        if (!cleaned || cleaned === '#') return;
        for (const [key, patterns] of Object.entries(HEADER_PATTERNS)) {
            if (patterns.some(p => cleaned.includes(p))) {
                if (!(key in map)) map[key] = idx;
                break;
            }
        }
    });
    return map;
};

// Component: Paste data extractor for tawseel.app tables
const PasteExtractorSection = ({ onSaved, syncMetadata: syncMeta }: { onSaved: () => void, syncMetadata: any }) => {
    const [pasteType, setPasteType] = useState<'bank' | 'restaurant'>('bank');
    const [pasteText, setPasteText] = useState('');
    const [parsedData, setParsedData] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveResult, setSaveResult] = useState('');
    const [detectedCols, setDetectedCols] = useState('');

    const handleParse = () => {
        setSaveResult('');
        setDetectedCols('');
        const parsed: any[] = [];

        // Tab-separated text parsing with header detection
        const lines = pasteText.split('\n').filter(l => l.trim());
        if (lines.length < 2) {
            setParsedData([]);
            setSaveResult('⚠️ لم يتم العثور على بيانات كافية.');
            return;
        }

        let colMap: Record<string, number> = {};
        let dataStartIdx = 0;

        // Detect header row in first 3 lines
        for (let i = 0; i < Math.min(3, lines.length); i++) {
            const cols = lines[i].split('\t');
            const testMap = detectColumnMap(cols);
            if (Object.keys(testMap).length >= 2) {
                colMap = testMap;
                dataStartIdx = i + 1;
                const colNames: Record<string, string> = {
                    accountName: 'اسم الحساب',
                    accountNumber: 'رقم الحساب',
                    branch: 'الفرع',
                    currency: 'العملة',
                    debit: 'مدين',
                    credit: 'دائن',
                    balance: 'الرصيد'
                };
                const detected = Object.entries(testMap)
                    .filter(([k]) => k in colNames)
                    .map(([k, v]) => `${(colNames as any)[k]}: عمود ${v + 1}`)
                    .join(' | ');
                setDetectedCols('✅ تم اكتشاف الأعمدة: ' + detected);
                break;
            }
        }

        // Parse data lines
        for (let i = dataStartIdx; i < lines.length; i++) {
            const cols = lines[i].split('\t');
            if (cols.length < 3) continue;

            let accountName = '';
            let accountNumber = '';
            let branch = '';
            let currency = '';
            let debit = 0;
            let credit = 0;
            let balance = 0;

            let extractedBalance: number | null = null;

            if (Object.keys(colMap).length >= 2) {
                // Use detected column mapping
                accountName = colMap.accountName !== undefined ? (cols[colMap.accountName]?.trim() || '') : '';
                accountNumber = colMap.accountNumber !== undefined ? (cols[colMap.accountNumber]?.trim() || '') : '';
                branch = colMap.branch !== undefined ? (cols[colMap.branch]?.trim() || '') : '';
                currency = colMap.currency !== undefined ? (cols[colMap.currency]?.trim() || '') : '';
                debit = colMap.debit !== undefined ? parseNum(cols[colMap.debit] || '0') : 0;
                credit = colMap.credit !== undefined ? parseNum(cols[colMap.credit] || '0') : 0;
                extractedBalance = colMap.balance !== undefined ? parseNum(cols[colMap.balance] || '0') : null;
            } else {
                // Fallback: heuristic
                const numCol = cols.findIndex(c => /^\d{3,6}$/.test(c.trim()));
                if (numCol < 0) continue;
                accountNumber = cols[numCol].trim();
                const textCols = cols.map((c: string, idx: number) => ({ text: c.trim(), idx }))
                    .filter((x: any) => x.text.length > 2 && !/^[\d,.\-()]+$/.test(x.text) && x.idx !== numCol);
                accountName = textCols.length > 0 ? textCols[0].text : '';
                if (textCols.length > 1) branch = textCols[1].text;
                const numericCols = cols.map((c: string, idx: number) => ({ val: parseNum(c), idx }))
                    .filter((x: any) => x.idx > numCol && (x.val !== 0 || /^0(\.0+)?$/.test(cols[x.idx]?.trim())));
                debit = numericCols[0]?.val || 0;
                credit = numericCols[1]?.val || 0;
                extractedBalance = numericCols[2] !== undefined ? numericCols[2].val : null;
            }

            // Calculate operational magnitude and correct sign based on type
            const baseBalance = extractedBalance !== null ? Math.abs(extractedBalance) : Math.abs(debit + credit);

            if (pasteType === 'restaurant') {
                // For restaurants (Creditors): positive means we owe them (Payable)
                balance = debit > credit ? -baseBalance : baseBalance;
            } else {
                // For banks (Debtors/Assets): positive means they have our money
                balance = credit > debit ? -baseBalance : baseBalance;
            }

            // Skip header/total rows
            if (!accountNumber || /^(#|رقم|رقم الحساب)$/.test(accountNumber)) continue;
            if (accountName.includes('إجمالي') || accountName.includes('الإجمالي')) continue;

            parsed.push({
                accountNumber, accountName, name: accountName, branch, currency,
                debit, credit, balance, difference: debit - credit,
                type: pasteType, lastUpdated: new Date().toISOString()
            });
        }

        setParsedData(parsed);
        if (parsed.length === 0) {
            setSaveResult('⚠️ لم يتم العثور على بيانات. تأكد من نسخ الجدول بالكامل.');
        } else {
            setSaveResult(`✅ تم استخراج ${parsed.length} حساب. راجع البيانات ثم اضغط حفظ.`);
        }
    };

    const handleSave = async () => {
        if (parsedData.length === 0) return;
        setIsSaving(true);
        setSaveResult('⏳ جاري الحفظ...');
        try {
            const count = await settingsService.saveSystemBalancesBatch(parsedData);
            const bankCount = parsedData.filter((d: any) => d.type === 'bank').length;
            const restCount = parsedData.filter((d: any) => d.type === 'restaurant').length;
            await settingsService.updateSyncMetadata({
                lastSync: new Date().toISOString(),
                status: 'success',
                bankCount: (syncMeta?.bankCount || 0) + (pasteType === 'bank' ? bankCount : 0),
                restaurantCount: (syncMeta?.restaurantCount || 0) + (pasteType === 'restaurant' ? restCount : 0),
            });
            setSaveResult(`✅ تم حفظ ${count} حساب بنجاح!`);
            setPasteText('');
            setParsedData([]);
            onSaved();
        } catch (e: any) {
            setSaveResult(`❌ فشل الحفظ: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                    <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">content_paste</span>
                    استخراج الأرصدة من tawseel.app
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">افتح صفحة التقرير في tawseel.app ← حدد الجدول (Ctrl+A) ← انسخ (Ctrl+C) ← الصق هنا</p>
            </div>
            <div className="p-6 space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-blue-500 mt-0.5">info</span>
                        <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                            <p className="font-bold">طريقة الاستخدام:</p>
                            <ol className="list-decimal mr-5 space-y-1">
                                <li>افتح صفحة التقرير في <a href="https://tawseel.app/admin/accounting/report/monthly?branch%5B%5D=tenant.*&accounting_types=0&financial_statement=0&currency=-1&clause=-1&entry_type=-1&account=6000&all_branch=0&cost_center=-1" target="_blank" className="underline font-bold hover:text-blue-600">tawseel.app (بنوك)</a> أو <a href="https://tawseel.app/admin/accounting/report/monthly?branch%5B%5D=tenant.*&accounting_types=0&financial_statement=0&currency=-1&clause=-1&entry_type=-1&account=2000&all_branch=0&cost_center=-1" target="_blank" className="underline font-bold hover:text-blue-600">tawseel.app (مطاعم)</a></li>
                                <li>حدد كل الجدول بالماوس أو Ctrl+A ثم Ctrl+C</li>
                                <li>اختر النوع (بنوك/مطاعم) والصق بالأسفل</li>
                            </ol>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 items-center">
                    <label className="text-sm font-bold text-slate-600 dark:text-slate-300">نوع البيانات:</label>
                    <div className="flex gap-2">
                        <button onClick={() => setPasteType('bank')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${pasteType === 'bank' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>
                            🏦 بنوك (6000)
                        </button>
                        <button onClick={() => setPasteType('restaurant')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${pasteType === 'restaurant' ? 'bg-amber-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>
                            🍽️ مطاعم (2000)
                        </button>
                    </div>
                </div>

                <textarea
                    value={pasteText}
                    onChange={e => { setPasteText(e.target.value); setParsedData([]); setSaveResult(''); setDetectedCols(''); }}
                    placeholder="الصق الجدول هنا (Ctrl+V)..."
                    className="w-full h-40 p-4 bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-sm font-mono outline-none focus:border-blue-500 resize-y transition-all"
                    dir="ltr"
                />

                <div className="flex gap-3 flex-wrap">
                    <button onClick={handleParse} disabled={!pasteText.trim()} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg">
                        <span className="material-symbols-outlined">search</span>
                        تحليل البيانات
                    </button>
                    {parsedData.length > 0 && (
                        <button onClick={handleSave} disabled={isSaving} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg">
                            <span className="material-symbols-outlined">{isSaving ? 'hourglass_empty' : 'cloud_upload'}</span>
                            {isSaving ? 'جاري الحفظ...' : `حفظ ${parsedData.length} حساب في Firestore`}
                        </button>
                    )}
                </div>

                {detectedCols && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold bg-slate-50 dark:bg-slate-800 p-2 rounded-lg">{detectedCols}</p>
                )}

                {saveResult && (
                    <p className={`text-sm font-bold p-3 rounded-lg ${saveResult.includes('❌') ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : saveResult.includes('✅') ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'}`}>{saveResult}</p>
                )}

                {parsedData.length > 0 && (
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                        <table className="w-full text-right text-sm">
                            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs font-bold">
                                <tr>
                                    <th className="px-3 py-2">#</th>
                                    <th className="px-3 py-2">اسم الحساب</th>
                                    <th className="px-3 py-2">رقم الحساب</th>
                                    <th className="px-3 py-2">الفرع</th>
                                    <th className="px-3 py-2">مدين</th>
                                    <th className="px-3 py-2">دائن</th>
                                    <th className="px-3 py-2">الرصيد</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {parsedData.map((d: any, i: number) => (
                                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td>
                                        <td className="px-3 py-2 font-bold text-slate-800 dark:text-white">{d.accountName}</td>
                                        <td className="px-3 py-2 font-mono text-slate-500">{d.accountNumber}</td>
                                        <td className="px-3 py-2 text-slate-500">{d.branch || '—'}</td>
                                        <td className="px-3 py-2 font-mono">{d.debit.toLocaleString()}</td>
                                        <td className="px-3 py-2 font-mono">{d.credit.toLocaleString()}</td>
                                        <td className="px-3 py-2 font-mono font-bold text-emerald-600">{d.balance.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

const SettingsPage = () => {
    const {
        currentUser,
        users,
        addUser,
        toggleUserStatus,
        deleteUser,
        updateUser,
        changePassword,
        financialTips,
        addFinancialTip,
        updateFinancialTip,
        deleteFinancialTip,
        exchangeRates,
        updateExchangeRates,
        getExchangeRateHistory,
        devFeedbackSettings,
        updateDevFeedbackSettings,
        featureFlags,
        updateFeatureFlags,
        phoneProviders,
        addPhoneProvider,
        updatePhoneProvider,
        deletePhoneProvider,
        bankDefinitions,
        accountMappings,
        saveAccountMapping,
        deleteAccountMapping,
        systemBalances,
        syncMetadata
    } = useAppContext();

    const canManageSettings = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('settings_manage');
    const [activeTab, setActiveTab] = useState<'users' | 'tips' | 'account' | 'exchange' | 'feedback' | 'experiments' | 'advanced' | 'providers' | 'mapping'>(
        currentUser?.role === 'user' ? 'account' : 'users'
    );

    // Feedback settings local state
    const [fbSettingsForm, setFbSettingsForm] = useState({
        allowImageAttachments: true,
        allowAudioRecordings: true
    });
    const [isSavingFbSettings, setIsSavingFbSettings] = useState(false);
    useEffect(() => {
        setFbSettingsForm({
            allowImageAttachments: devFeedbackSettings?.allowImageAttachments !== false,
            allowAudioRecordings: devFeedbackSettings?.allowAudioRecordings !== false
        });
    }, [devFeedbackSettings]);

    // Exchange rates local state
    const [rateForm, setRateForm] = useState({ SAR_TO_OLD_RIAL: 0, SAR_TO_NEW_RIAL: 0 });
    const [isSavingRates, setIsSavingRates] = useState(false);
    const canManageRates = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('exchange_rates_manage');

    // Exchange Rate History State
    const [rateHistory, setRateHistory] = useState<ExchangeRateHistory[]>([]);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // Advanced Settings State
    const exportOptions = [
        { id: 'restaurants', label: 'المطاعم' },
        { id: 'transfer_requests', label: 'طلبات التحويل' },
        { id: 'history_records', label: 'أرشيف الكشوفات' },
        { id: 'activity_logs', label: 'سجل النشاط' },
        { id: 'phone_payments', label: 'دفعات الاتصالات' },
        { id: 'invoice_batches', label: 'دفاتر الفواتير' }
    ];
    const [exportSelection, setExportSelection] = useState<string[]>(['restaurants', 'transfer_requests', 'history_records', 'activity_logs', 'phone_payments', 'invoice_batches']);
    const [isExporting, setIsExporting] = useState(false);

    const [cleanupTarget, setCleanupTarget] = useState('activity_logs');
    const [cleanupTimeframe, setCleanupTimeframe] = useState('6');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [cleanupStats, setCleanupStats] = useState<{ count: number, estimatedSizeKB: number, docs: any[] } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadRateHistory = async () => {
        setIsLoadingHistory(true);
        const history = await getExchangeRateHistory();
        setRateHistory(history);
        setIsLoadingHistory(false);
    };

    useEffect(() => {
        setRateForm({ SAR_TO_OLD_RIAL: exchangeRates.SAR_TO_OLD_RIAL, SAR_TO_NEW_RIAL: exchangeRates.SAR_TO_NEW_RIAL });
    }, [exchangeRates]);

    const location = useLocation();

    useEffect(() => {
        if (currentUser?.role === 'user' || location.state?.openAccount) {
            setActiveTab('account');
        }
    }, [currentUser, location.state]);

    const availablePermissions = PERMISSION_GROUPS;


    // --- User Management State ---
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [newUserForm, setNewUserForm] = useState({
        username: '',
        password: '',
        name: '',
        role: 'user' as UserRole
    });

    // --- Tip Preview State ---
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [tipToPreview, setTipToPreview] = useState<any>(null);

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await addUser(newUserForm.username, newUserForm.password, newUserForm.name, newUserForm.role);
            setIsAddUserModalOpen(false);
            setNewUserForm({ username: '', password: '', name: '', role: 'user' });
            alert('تم إضافة المستخدم بنجاح');
        } catch (error) {
            console.error(error);
        }
    };

    const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
    const [userForPermissions, setUserForPermissions] = useState<User | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
    // Batch permissions: accumulate changes locally, save all at once
    const [pendingPermissions, setPendingPermissions] = useState<UserPermission[] | null>(null);
    const [isSavingPermissions, setIsSavingPermissions] = useState(false);

    const handleOpenPermissionsModal = (user: User) => {
        setUserForPermissions(user);
        setPendingPermissions(user.permissions ? [...user.permissions] : []);
        setIsPermissionsModalOpen(true);
    };

    const handleTogglePermission = (perm: UserPermission) => {
        if (!pendingPermissions) return;
        const newPerms = pendingPermissions.includes(perm)
            ? pendingPermissions.filter(p => p !== perm)
            : [...pendingPermissions, perm];
        setPendingPermissions(newPerms);
    };

    const handleSavePermissions = async () => {
        if (!userForPermissions || !pendingPermissions) return;
        setIsSavingPermissions(true);
        try {
            await updateUser(userForPermissions.id, { permissions: pendingPermissions });
            setUserForPermissions({ ...userForPermissions, permissions: pendingPermissions });
            alert('✅ تم حفظ الصلاحيات بنجاح');
        } catch (error) {
            console.error(error);
            alert('❌ فشل حفظ الصلاحيات');
        } finally {
            setIsSavingPermissions(false);
        }
    };

    const handleClosePermissionsModal = () => {
        setIsPermissionsModalOpen(false);
        setPendingPermissions(null);
    };

    // --- Edit User State ---
    const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [editUserForm, setEditUserForm] = useState({
        username: '',
        name: '',
        password: ''
    });

    const handleOpenEditModal = (user: User) => {
        setEditingUser(user);
        setEditUserForm({
            username: user.username,
            name: user.name || '',
            password: '' // Always start empty for security
        });
        setIsEditUserModalOpen(true);
    };

    const handleEditUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;

        try {
            const success = await updateUser(editingUser.id, {
                username: editUserForm.username,
                name: editUserForm.name,
                password: editUserForm.password || undefined
            });
            if (success) {
                setIsEditUserModalOpen(false);
                setEditingUser(null);
                alert('✅ تم تحديث بيانات المستخدم بنجاح');
            }
        } catch (error) {
            console.error(error);
            alert('❌ فشل تحديث البيانات');
        }
    };

    // --- Password Change State ---
    const [passwordForm, setPasswordForm] = useState({
        newPassword: '',
        confirmPassword: ''
    });
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    const handleChangePassword = async (e: any) => {
        e.preventDefault();
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            alert('❌ كلمات المرور غير متطابقة!');
            return;
        }
        if (passwordForm.newPassword.length < 6) {
            alert('❌ يجب أن تكون كلمة المرور 6 أحرف على الأقل');
            return;
        }

        setIsChangingPassword(true);
        try {
            await changePassword(passwordForm.newPassword);
            alert('✅ تم تغيير كلمة المرور بنجاح');
            setPasswordForm({ newPassword: '', confirmPassword: '' });
        } catch (error: any) {
            alert(error.message || '❌ فشل تغيير كلمة المرور');
        } finally {
            setIsChangingPassword(false);
        }
    };


    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white font-display">الإعدادات</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        {currentUser?.role === 'user' ? 'إعدادات الإدارة' : 'إدارة المستخدمين'}
                    </p>
                </div>
                <span className="material-symbols-outlined text-6xl text-slate-200 dark:text-slate-700">settings</span>
            </div>

            {/* Tabs Navigation */}
            <div className="flex bg-white dark:bg-[#1e293b] p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm w-fit">
                {/* Only show Users tab for admin and super_admin */}
                {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'users'
                            ? 'bg-[var(--color-active)] text-white shadow-md'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                    >
                        <span className="material-symbols-outlined">group</span>
                        إدارة المستخدمين
                    </button>
                )}
                {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
                    <button
                        onClick={() => setActiveTab('tips')}
                        className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'tips'
                            ? 'bg-[var(--color-active)] text-white shadow-md'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                    >
                        <span className="material-symbols-outlined">lightbulb</span>
                        النصائح والتوجيهات
                    </button>
                )}
                <button
                    onClick={() => setActiveTab('account')}
                    className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'account'
                        ? 'bg-[var(--color-active)] text-white shadow-md'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                >
                    <span className="material-symbols-outlined">shield_person</span>
                    حسابي وأماني
                </button>
                {canManageRates && (
                    <button
                        onClick={() => setActiveTab('exchange')}
                        className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'exchange'
                            ? 'bg-[var(--color-active)] text-white shadow-md'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                    >
                        <span className="material-symbols-outlined">currency_exchange</span>
                        أسعار الصرف
                    </button>
                )}
                {currentUser?.role === 'super_admin' && (
                    <button
                        onClick={() => setActiveTab('experiments')}
                        className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'experiments'
                            ? 'bg-[var(--color-active)] text-white shadow-md'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                    >
                        <span className="material-symbols-outlined">science</span>
                        الميزات التجريبية
                    </button>
                )}
                {currentUser?.role === 'super_admin' && (
                    <button
                        onClick={() => setActiveTab('advanced')}
                        className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'advanced'
                            ? 'bg-[var(--color-active)] text-white shadow-md'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                    >
                        <span className="material-symbols-outlined">database</span>
                        إعدادات متقدمة
                    </button>
                )}
                {(currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('phone_providers_manage')) && (
                    <button
                        onClick={() => setActiveTab('providers')}
                        className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'providers'
                            ? 'bg-[var(--color-active)] text-white shadow-md'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                    >
                        <span className="material-symbols-outlined">settings_remote</span>
                        مزودي الاتصالات
                    </button>
                )}
                {(currentUser?.role === 'super_admin' || currentUser?.role === 'admin') && (
                    <button
                        onClick={() => setActiveTab('mapping')}
                        className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'mapping'
                            ? 'bg-[var(--color-active)] text-white shadow-md'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                    >
                        <span className="material-symbols-outlined">link</span>
                        ربط الحسابات
                    </button>
                )}
            </div>

            {/* Content Area */}
            {activeTab === 'users' ? (
                <div className="space-y-6">
                    {/* Users Management Section */}
                    {currentUser?.role === 'user' ? (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-2xl p-8 text-center">
                            <span className="material-symbols-outlined text-6xl text-yellow-600 dark:text-yellow-400">block</span>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-4">صلاحيات محدودة</h3>
                            <p className="text-slate-600 dark:text-slate-400 mt-2">ليس لديك صلاحية الوصول لإدارة المستخدمين</p>
                        </div>
                    ) : (
                        <>
                            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 flex justify-between items-center">
                                    <div>
                                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                            <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">manage_accounts</span>
                                            قائمة المستخدمين
                                        </h2>
                                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">إدارة حسابات الموظفين والصلاحيات</p>
                                    </div>
                                    {/* Only super_admin can add users */}
                                    {currentUser?.role === 'super_admin' && (
                                        <button
                                            onClick={() => setIsAddUserModalOpen(true)}
                                            className="px-4 py-2 bg-[var(--color-header)] hover:brightness-110 text-white rounded-lg font-bold flex items-center gap-2 transition-all shadow-sm"
                                        >
                                            <span className="material-symbols-outlined">person_add</span>
                                            إضافة مستخدم
                                        </button>
                                    )}
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-right">
                                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-sm">
                                            <tr>
                                                <th className="px-6 py-4">المستخدم</th>
                                                <th className="px-6 py-4">الاسم الكامل</th>
                                                <th className="px-6 py-4">الدور</th>
                                                <th className="px-6 py-4">آخر ظهور</th>
                                                <th className="px-6 py-4">الحالة</th>
                                                <th className="px-6 py-4">الإجراءات</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                            {users.map((user) => (
                                                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`size-8 rounded-full flex items-center justify-center font-bold text-white text-xs ${user.role === 'super_admin' ? 'bg-purple-500' : user.role === 'admin' ? 'bg-blue-500' : 'bg-slate-500'
                                                                }`}>
                                                                {user.username.charAt(0).toUpperCase()}
                                                            </div>
                                                            <button
                                                                onClick={() => handleOpenPermissionsModal(user)}
                                                                className="font-bold text-[var(--color-header)] hover:underline text-right"
                                                            >
                                                                {user.username}
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                                                        {user.name || '-'}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${user.role === 'super_admin'
                                                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                                            : user.role === 'admin'
                                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                                                : 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300'
                                                            }`}>
                                                            {user.role === 'super_admin' ? 'مهندس النظام' : user.role === 'admin' ? 'مسؤول' : 'موظف'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                                                        {user.lastSeenAt ? (() => {
                                                            const diff = Date.now() - new Date(user.lastSeenAt).getTime();
                                                            const mins = Math.floor(diff / 60000);
                                                            const hours = Math.floor(diff / 3600000);
                                                            const days = Math.floor(diff / 86400000);
                                                            if (mins < 1) return <span className="text-green-600 dark:text-green-400 font-bold">متصل الآن</span>;
                                                            if (mins < 60) return <span>منذ {mins} دقيقة</span>;
                                                            if (hours < 24) return <span>منذ {hours} ساعة</span>;
                                                            if (days < 7) return <span>منذ {days} يوم</span>;
                                                            return <span>{new Date(user.lastSeenAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>;
                                                        })() : <span className="text-slate-400">—</span>}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <button
                                                            onClick={() => toggleUserStatus(user.id)}
                                                            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 transition-colors ${user.isActive
                                                                ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300'
                                                                : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300'
                                                                }`}
                                                            title="تغيير الحالة"
                                                            disabled={user.role === 'super_admin' || (currentUser?.role !== 'super_admin' && user.role === 'admin')}
                                                        >
                                                            <span className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                                            {user.isActive ? 'نشط' : 'موقف'}
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            {/* Edit Button */}
                                                            {user.id !== '0' && user.id !== '1' && user.id !== '2' && (
                                                                <button
                                                                    onClick={() => handleOpenEditModal(user)}
                                                                    className="text-blue-500 hover:text-blue-700 p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                                                    title="تعديل"
                                                                >
                                                                    <span className="material-symbols-outlined">edit</span>
                                                                </button>
                                                            )}
                                                            {/* Delete Button */}
                                                            {user.id !== '0' && user.id !== currentUser?.id && (
                                                                <button
                                                                    onClick={() => deleteUser(user.id)}
                                                                    className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                                    title="حذف"
                                                                    disabled={user.id === '0'}
                                                                >
                                                                    <span className="material-symbols-outlined">delete</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Add User Modal */}
                            {isAddUserModalOpen && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">إضافة مستخدم جديد</h3>
                                            <button onClick={() => setIsAddUserModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                                                <span className="material-symbols-outlined">close</span>
                                            </button>
                                        </div>
                                        <form onSubmit={handleAddUser} className="p-6 space-y-4">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">اسم المستخدم (بالإنجيزية فقط)</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={newUserForm.username}
                                                    onChange={e => setNewUserForm({ ...newUserForm, username: e.target.value })}
                                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">الاسم الكامل (الموظف)</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={newUserForm.name}
                                                    onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })}
                                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">كلمة المرور</label>
                                                <input
                                                    type="password"
                                                    required
                                                    value={newUserForm.password}
                                                    onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">الدور (الصلاحية)</label>
                                                <select
                                                    value={newUserForm.role}
                                                    onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value as UserRole })}
                                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                                >
                                                    <option value="user">موظف (مشاهدة فقط)</option>
                                                    <option value="admin">مسؤول (تحرير ومطابقة)</option>
                                                    <option value="super_admin">مهندس النظام (كامل الصلاحيات)</option>
                                                </select>
                                            </div>
                                            <div className="pt-4 flex gap-3">
                                                <button
                                                    type="submit"
                                                    className="flex-1 py-2 bg-[var(--color-header)] text-white font-bold rounded-lg hover:brightness-110 transition-all"
                                                >
                                                    إضافة
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsAddUserModalOpen(false)}
                                                    className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                                                >
                                                    إلغاء
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}

                            {/* Edit User Modal */}
                            {isEditUserModalOpen && editingUser && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">تعديل بيانات المستخدم</h3>
                                            <button onClick={() => setIsEditUserModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                                                <span className="material-symbols-outlined">close</span>
                                            </button>
                                        </div>
                                        <form onSubmit={handleEditUser} className="p-6 space-y-4">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">اسم المستخدم (للدخول)</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={editUserForm.username}
                                                    onChange={e => setEditUserForm({ ...editUserForm, username: e.target.value })}
                                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">الاسم الكامل</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={editUserForm.name}
                                                    onChange={e => setEditUserForm({ ...editUserForm, name: e.target.value })}
                                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">كلمة المرور الجديدة (اختياري)</label>
                                                <input
                                                    type="password"
                                                    placeholder="اتركه فارغاً لعدم التغيير"
                                                    value={editUserForm.password}
                                                    onChange={e => setEditUserForm({ ...editUserForm, password: e.target.value })}
                                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                                />
                                            </div>
                                            <div className="pt-4 flex gap-3">
                                                <button
                                                    type="submit"
                                                    className="flex-1 py-2 bg-[var(--color-header)] text-white font-bold rounded-lg hover:brightness-110 transition-all"
                                                >
                                                    حفظ التغييرات
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditUserModalOpen(false)}
                                                    className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                                                >
                                                    إلغاء
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}
                            {/* Permissions Management Modal — Hierarchical Accordion */}
                            {isPermissionsModalOpen && userForPermissions && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-in">
                                        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-red-50 to-white dark:from-red-900/10 dark:to-[#1e293b] flex justify-between items-center">
                                            <div>
                                                <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-red-600">admin_panel_settings</span>
                                                    إدارة صلاحيات: {userForPermissions.name || userForPermissions.username}
                                                </h3>
                                                <p className="text-xs text-slate-500 mt-1">تحكم دقيق في الإجراءات التي يمكن للموظف القيام بها</p>
                                            </div>
                                            <button
                                                onClick={handleClosePermissionsModal}
                                                className="size-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center text-slate-400"
                                            >
                                                <span className="material-symbols-outlined">close</span>
                                            </button>
                                        </div>

                                        <div className="p-6">
                                            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-200 dark:border-amber-700/50 mb-6 flex gap-3">
                                                <span className="material-symbols-outlined text-amber-600">info</span>
                                                <p className="text-xs text-amber-800 dark:text-amber-300 font-bold leading-relaxed">
                                                    ملاحظة: قم بتعديل الصلاحيات ثم اضغط "حفظ الصلاحيات" لتطبيق التغييرات. الموظفين برتبة "مدير النظام" يمتلكون كافة الصلاحيات تلقائياً ولا يمكن تقييدهم.
                                                </p>
                                            </div>

                                            <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                                                {availablePermissions.map((group) => {
                                                    const isExpanded = expandedGroups.includes(group.id);
                                                    const groupPerms = group.permissions.map(p => p.key);
                                                    const grantedCount = groupPerms.filter(k => pendingPermissions?.includes(k) || userForPermissions.role === 'super_admin').length;
                                                    const allGranted = grantedCount === groupPerms.length;
                                                    const isDisabled = userForPermissions.role === 'super_admin';

                                                    const colorMap: Record<string, string> = {
                                                        blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                                                        orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
                                                        green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
                                                        purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
                                                        teal: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
                                                        indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
                                                        slate: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
                                                        red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                                                        cyan: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
                                                        amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                                                    };

                                                    const handleToggleAll = () => {
                                                        if (isDisabled || !pendingPermissions) return;
                                                        let newPerms: UserPermission[];
                                                        if (allGranted) {
                                                            newPerms = pendingPermissions.filter(p => !groupPerms.includes(p));
                                                        } else {
                                                            const added = groupPerms.filter(p => !pendingPermissions.includes(p));
                                                            newPerms = [...pendingPermissions, ...added];
                                                        }
                                                        setPendingPermissions(newPerms);
                                                    };

                                                    return (
                                                        <div key={group.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                                            {/* Group Header — clickable to expand */}
                                                            <button
                                                                onClick={() => setExpandedGroups(prev => prev.includes(group.id) ? prev.filter(g => g !== group.id) : [...prev, group.id])}
                                                                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-right"
                                                            >
                                                                <div className={`size-9 rounded-lg flex items-center justify-center ${colorMap[group.color] || colorMap.slate}`}>
                                                                    <span className="material-symbols-outlined text-lg">{group.icon}</span>
                                                                </div>
                                                                <div className="flex-1">
                                                                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">{group.label}</h4>
                                                                </div>
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${allGranted ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : grantedCount > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                                                                    {grantedCount}/{groupPerms.length}
                                                                </span>
                                                                <span className={`material-symbols-outlined text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                                            </button>

                                                            {/* Sub-permissions (accordion body) */}
                                                            {isExpanded && (
                                                                <div className="border-t border-slate-100 dark:border-slate-700">
                                                                    {/* Select All button */}
                                                                    <div className="px-4 py-2 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between border-b border-slate-100 dark:border-slate-700">
                                                                        <span className="text-[11px] font-bold text-slate-500">تحديد الكل</span>
                                                                        <button
                                                                            disabled={isDisabled}
                                                                            onClick={handleToggleAll}
                                                                            className={`relative w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${allGranted ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                                                        >
                                                                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${allGranted ? 'translate-x-5' : 'translate-x-0'}`} />
                                                                        </button>
                                                                    </div>

                                                                    {group.permissions.map((perm) => {
                                                                        const isGranted = pendingPermissions?.includes(perm.key) || userForPermissions.role === 'super_admin';
                                                                        return (
                                                                            <div key={perm.key} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                                                <span className={`material-symbols-outlined text-base ${isGranted ? 'text-green-600' : 'text-slate-400'}`}>{perm.icon}</span>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{perm.label}</p>
                                                                                    <p className="text-[10px] text-slate-400 truncate">{perm.description}</p>
                                                                                </div>
                                                                                <button
                                                                                    disabled={isDisabled}
                                                                                    onClick={() => handleTogglePermission(perm.key)}
                                                                                    className={`relative w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${isGranted ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                                                                >
                                                                                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isGranted ? 'translate-x-5' : 'translate-x-0'}`} />
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                                            <button
                                                onClick={handleClosePermissionsModal}
                                                className="px-6 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg hover:brightness-110 transition-all"
                                            >
                                                إلغاء
                                            </button>
                                            <button
                                                onClick={handleSavePermissions}
                                                disabled={isSavingPermissions || userForPermissions.role === 'super_admin'}
                                                className="px-8 py-2 bg-[var(--color-header)] text-white font-bold rounded-lg hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
                                            >
                                                {isSavingPermissions ? (
                                                    <><span className="material-symbols-outlined animate-spin text-sm">sync</span> جاري الحفظ...</>
                                                ) : (
                                                    <><span className="material-symbols-outlined text-sm">save</span> حفظ الصلاحيات</>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            ) : activeTab === 'tips' ? (
                <div className="space-y-6">
                    {currentUser?.role === 'user' ? (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-2xl p-8 text-center">
                            <span className="material-symbols-outlined text-6xl text-yellow-600 dark:text-yellow-400">block</span>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-4">صلاحيات محدودة</h3>
                            <p className="text-slate-600 dark:text-slate-400 mt-2">ليس لديك صلاحية الوصول لإدارة النصائح</p>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">tips_and_updates</span>
                                        إدارة النصائح المالية والتنبيهات
                                    </h2>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">أضف نصائح أو تنبيهات تظهر للموظفين في لوحة التحكم</p>
                                </div>
                            </div>

                            <div className="p-6">
                                <form onSubmit={async (e) => {
                                    e.preventDefault();
                                    const form = e.target as HTMLFormElement;
                                    const text = (form.elements.namedItem('tip-text') as HTMLTextAreaElement).value;
                                    const type = (form.elements.namedItem('tip-type') as HTMLSelectElement).value as TipType;

                                    let icon = 'lightbulb';
                                    if (type === 'alert') icon = 'notifications_active';
                                    if (type === 'warning') icon = 'warning';
                                    if (type === 'guidance') icon = 'direction';

                                    await addFinancialTip(text, type, icon);
                                    form.reset();
                                    alert('تمت الإضافة بنجاح ✅');
                                }} className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 mb-8 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">نص النصيحة / التنبيه</label>
                                            <textarea
                                                id="tip-text"
                                                name="tip-text"
                                                required
                                                placeholder="اكتب النصيحة المالية أو التوجيه هنا..."
                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-[var(--color-active)] outline-none min-h-[100px] font-bold"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">نوع الرسالة</label>
                                            <select
                                                id="tip-type"
                                                name="tip-type"
                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-[var(--color-active)] outline-none font-bold"
                                            >
                                                <option value="tip">نصيحة مالية</option>
                                                <option value="alert">تنبيه هام</option>
                                                <option value="guidance">توجيه إداري</option>
                                                <option value="warning">تحذير</option>
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-3 justify-end">
                                            <button
                                                type="submit"
                                                className="w-full py-3 bg-[var(--color-header)] text-white font-black rounded-xl hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/10"
                                            >
                                                <span className="material-symbols-outlined">add_circle</span>
                                                إضافة للوحة
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const form = document.querySelector('form') as HTMLFormElement;
                                                    const text = (form.elements.namedItem('tip-text') as HTMLTextAreaElement).value;
                                                    const type = (form.elements.namedItem('tip-type') as HTMLSelectElement).value;
                                                    if (!text) return alert('الرجاء كتابة نص للمعاينة');

                                                    let icon = 'lightbulb';
                                                    if (type === 'alert') icon = 'notifications_active';
                                                    if (type === 'warning') icon = 'warning';
                                                    if (type === 'guidance') icon = 'direction';

                                                    setTipToPreview({ text, type, icon });
                                                    setIsPreviewModalOpen(true);
                                                }}
                                                className="w-full py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-white font-black rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined">visibility</span>
                                                معاينة
                                            </button>
                                        </div>
                                    </div>
                                </form>

                                <div className="space-y-4">
                                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm">list</span>
                                        الرسائل الحالية
                                    </h3>
                                    {(useAppContext() as any).financialTips?.length === 0 ? (
                                        <div className="text-center py-10 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-700">
                                            لا توجد نصائح مضافة حالياً.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-3">
                                            {financialTips.map((tip: any) => (
                                                <div key={tip.id} className="flex flex-col md:flex-row items-center justify-between p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:shadow-lg transition-all gap-4">
                                                    <div className="flex items-center gap-5 flex-1">
                                                        <div className={`size-12 rounded-2xl flex items-center justify-center shadow-sm ${tip.type === 'warning' ? 'bg-red-50 text-red-600' :
                                                            tip.type === 'alert' ? 'bg-orange-50 text-orange-600' :
                                                                tip.type === 'guidance' ? 'bg-blue-50 text-blue-600' :
                                                                    'bg-amber-50 text-amber-600'
                                                            }`}>
                                                            <span className="material-symbols-outlined text-2xl">{tip.icon}</span>
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="font-black text-slate-900 dark:text-white leading-relaxed">{tip.text}</p>
                                                            <div className="flex gap-2 mt-2">
                                                                <span className="text-[10px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-black">
                                                                    {tip.type === 'tip' ? '💡 نصيحة' : tip.type === 'alert' ? '🔔 تنبيه' : tip.type === 'warning' ? '⚠️ تحذير' : '📝 توجيه'}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400 flex items-center gap-1 font-bold">
                                                                    <span className="material-symbols-outlined text-[12px]">calendar_today</span>
                                                                    {new Date(tip.createdAt).toLocaleDateString('ar-SA')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 w-full md:w-auto shrink-0 border-t md:border-t-0 pt-4 md:pt-0 border-slate-100 dark:border-slate-700">
                                                        <button
                                                            onClick={() => {
                                                                setTipToPreview(tip);
                                                                setIsPreviewModalOpen(true);
                                                            }}
                                                            className="flex-1 md:flex-none px-4 py-2 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">visibility</span>
                                                            معاينة
                                                        </button>
                                                        <button
                                                            onClick={() => updateFinancialTip(tip.id, { isActive: !tip.isActive })}
                                                            className={`p-2 rounded-xl transition-all ${tip.isActive ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-400 opacity-50'}`}
                                                            title={tip.isActive ? "نشطة" : "معطلة"}
                                                        >
                                                            <span className="material-symbols-outlined">{tip.isActive ? 'visibility' : 'visibility_off'}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => deleteFinancialTip(tip.id)}
                                                            className="px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-red-100 transition-colors"
                                                            title="حذف"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">delete</span>
                                                            حذف
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : activeTab === 'account' ? (
                <div className="space-y-6 max-w-2xl">
                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                    <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">lock_reset</span>
                                    تغيير كلمة المرور
                                </h2>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">قم بتحديث كلمة المرور الخاصة بك لتأمين حسابك</p>
                            </div>
                        </div>

                        <div className="p-8">
                            <form onSubmit={handleChangePassword} className="space-y-6">
                                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 flex gap-3 mb-6">
                                    <span className="material-symbols-outlined text-blue-600">info</span>
                                    <div className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
                                        <p className="font-bold">نصيحة أمان:</p>
                                        <p>استخدم كلمة مرور قوية تحتوي على أحرف وأرقام لضمان حماية بياناتك المالية.</p>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">كلمة المرور الجديدة</label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">lock</span>
                                        <input
                                            type="password"
                                            required
                                            value={passwordForm.newPassword}
                                            onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                            className="w-full pr-12 pl-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-[var(--color-active)] outline-none font-bold transition-all"
                                            placeholder="أدخل كلمة مرور جديدة (6 أحرف على الأقل)"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">تأكيد كلمة المرور الجديدة</label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">check_circle</span>
                                        <input
                                            type="password"
                                            required
                                            value={passwordForm.confirmPassword}
                                            onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                            className="w-full pr-12 pl-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-[var(--color-active)] outline-none font-bold transition-all"
                                            placeholder="أعد إدخال كلمة المرور للتأكيد"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isChangingPassword}
                                    className="w-full py-4 bg-[var(--color-header)] text-white font-black rounded-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 text-lg"
                                >
                                    {isChangingPassword ? (
                                        <>
                                            <span className="material-symbols-outlined animate-spin">sync</span>
                                            جاري التحديث...
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined">save</span>
                                            حفظ كلمة المرور الجديدة
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'exchange' ? (
                <div className="space-y-6 max-w-2xl">
                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">currency_exchange</span>
                                أسعار صرف العملات
                            </h2>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">تحديد أسعار تحويل الريال السعودي إلى الريال اليمني</p>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* آخر تحديث */}
                            {exchangeRates.updatedAt && (
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center justify-between gap-3 text-sm">
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-blue-500">schedule</span>
                                        <div>
                                            <span className="text-slate-600 dark:text-slate-300">آخر تحديث: </span>
                                            <span className="font-bold text-slate-900 dark:text-white">{new Date(exchangeRates.updatedAt).toLocaleString('ar-SA')}</span>
                                            {exchangeRates.updatedBy && (
                                                <span className="text-slate-500 dark:text-slate-400"> — بواسطة {exchangeRates.updatedBy}</span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setShowHistoryModal(true);
                                            loadRateHistory();
                                        }}
                                        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-xs font-bold underline px-2 py-1 flex items-center gap-1 bg-indigo-100/50 dark:bg-indigo-900/30 rounded-lg transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">history</span> سجل التعديلات
                                    </button>
                                </div>
                            )}

                            {/* SAR → ريال قديم */}
                            <div className="space-y-2">
                                <label className="block text-sm font-black text-slate-700 dark:text-slate-300">
                                    🇸🇦 ريال سعودي واحد → ريال قديم (ر.ق)
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={rateForm.SAR_TO_OLD_RIAL || ''}
                                        onChange={e => setRateForm({ ...rateForm, SAR_TO_OLD_RIAL: Number(e.target.value) })}
                                        className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl dark:text-white font-mono text-xl font-black focus:ring-2 focus:ring-[var(--color-active)] outline-none"
                                        placeholder="مثال: 150.00"
                                    />
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">ر.ق</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-1">الحالي: {exchangeRates.SAR_TO_OLD_RIAL.toLocaleString()}</p>
                            </div>

                            {/* SAR → ريال جديد */}
                            <div className="space-y-2">
                                <label className="block text-sm font-black text-slate-700 dark:text-slate-300">
                                    🇸🇦 ريال سعودي واحد → ريال جديد (ر.ج)
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={rateForm.SAR_TO_NEW_RIAL || ''}
                                        onChange={e => setRateForm({ ...rateForm, SAR_TO_NEW_RIAL: Number(e.target.value) })}
                                        className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl dark:text-white font-mono text-xl font-black focus:ring-2 focus:ring-[var(--color-active)] outline-none"
                                        placeholder="مثال: 150.00"
                                    />
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">ر.ج</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-1">الحالي: {exchangeRates.SAR_TO_NEW_RIAL.toLocaleString()}</p>
                            </div>

                            {/* معاينة */}
                            <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 rounded-xl border border-amber-200 dark:border-amber-800">
                                <h4 className="text-sm font-black text-amber-800 dark:text-amber-300 mb-2">معاينة التحويل (100 ر.س)</h4>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="text-slate-700 dark:text-slate-300">
                                        <span className="font-bold">→ ريال قديم:</span> {(100 * rateForm.SAR_TO_OLD_RIAL).toLocaleString()} ر.ق
                                    </div>
                                    <div className="text-slate-700 dark:text-slate-300">
                                        <span className="font-bold">→ ريال جديد:</span> {(100 * rateForm.SAR_TO_NEW_RIAL).toLocaleString()} ر.ج
                                    </div>
                                </div>
                            </div>

                            {/* زر الحفظ */}
                            <button
                                onClick={async () => {
                                    if (rateForm.SAR_TO_OLD_RIAL <= 0 || rateForm.SAR_TO_NEW_RIAL <= 0) {
                                        alert('يرجى إدخال أسعار صرف صحيحة');
                                        return;
                                    }
                                    setIsSavingRates(true);
                                    try {
                                        await updateExchangeRates(rateForm);
                                        alert('✅ تم تحديث أسعار الصرف بنجاح');
                                    } finally {
                                        setIsSavingRates(false);
                                    }
                                }}
                                disabled={isSavingRates}
                                className="w-full py-4 bg-[var(--color-header)] text-white font-black rounded-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 text-lg"
                            >
                                {isSavingRates ? (
                                    <><span className="material-symbols-outlined animate-spin">sync</span> جاري الحفظ...</>
                                ) : (
                                    <><span className="material-symbols-outlined">save</span> حفظ أسعار الصرف</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'experiments' && currentUser?.role === 'super_admin' ? (
                <div className="space-y-5 max-w-3xl">
                    {/* Header Card */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-lg">
                        <div className="px-6 py-5 bg-gradient-to-l from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-900/20 dark:via-teal-900/15 dark:to-cyan-900/10">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                    <span className="material-symbols-outlined text-white text-2xl">tune</span>
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-900 dark:text-white">إدارة الميزات</h2>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">تفعيل أو تعطيل الميزات والأدوات على مستوى النظام</p>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center gap-3 bg-amber-50/50 dark:bg-amber-900/10">
                            <span className="material-symbols-outlined text-amber-500 text-lg">warning</span>
                            <p className="text-xs text-amber-700 dark:text-amber-300 font-bold">تغيير هذه الإعدادات سيؤثر على جميع المستخدمين فوراً.</p>
                        </div>
                    </div>

                    {/* Categorized Sections */}
                    {[
                        {
                            title: 'العمليات المالية',
                            icon: 'account_balance',
                            color: '#3b82f6',
                            flags: [
                                { key: 'invoice_disbursement', label: 'صرف الفواتير (طيف)', desc: 'واجهة صرف الفواتير ومطابقتها', icon: 'receipt_long', color: '#3b82f6' },
                                { key: 'sum_disbursement', label: 'تجميع الصرف', desc: 'واجهة تجمع بين فواتير الصرف وسداد الهواتف', icon: 'summarize', color: '#10b981' },
                                { key: 'restaurant_payments', label: 'سداد المطاعم', desc: 'واجهة سداد المطاعم وإدارة الدفعات', icon: 'payments', color: '#14b8a6' },
                                { key: 'payment_history', label: 'سجل دفعات المطاعم', desc: 'صفحة سجل الدفعات التاريخية', icon: 'history', color: '#0ea5e9' },
                                { key: 'transfer_accounts', label: 'إدخال حسابات المطاعم', desc: 'واجهة إدارة حسابات التحويل للمطاعم', icon: 'move_up', color: '#f97316' },
                            ]
                        },
                        {
                            title: 'شؤون الموظفين',
                            icon: 'badge',
                            color: '#f59e0b',
                            flags: [
                                { key: 'loan_requests', label: 'طلبات السلف', desc: 'صفحة إدارة طلبات السلف والقروض', icon: 'savings', color: '#f59e0b' },
                                { key: 'phone_payments', label: 'سداد الجوالات والدراجات', desc: 'واجهة سداد الجوالات والدراجات النارية', icon: 'phone_iphone', color: '#a855f7' },
                                { key: 'loan_reports', label: 'تقارير السلف', desc: 'صفحة تقارير وتحليلات السلف', icon: 'analytics', color: '#ec4899' },
                            ]
                        },
                        {
                            title: 'الأدوات والميزات',
                            icon: 'build',
                            color: '#22c55e',
                            flags: [
                                { key: 'pdf_splitter', label: 'تقسيم وتسمية PDF', desc: 'أداة تقسيم ملفات PDF وتسميتها تلقائيًا', icon: 'picture_as_pdf', color: '#ef4444' },
                                { key: 'operations_grid', label: 'العمليات (Excel)', desc: 'صفحة إدارة العمليات بتنسيق Excel', icon: 'grid_on', color: '#22c55e' },
                                { key: 'bulk_transfer_tool', label: 'تحويل الأرصدة المجمعة', desc: 'أداة تحويل الأرصدة دفعة واحدة', icon: 'currency_exchange', color: '#8b5cf6' },
                                { key: 'currency_sync_tool', label: 'مزامنة عملة الحساب', desc: 'أداة مزامنة العملات مع الحسابات', icon: 'sync', color: '#06b6d4' },
                                { key: 'quick_match', label: 'المطابقة السريعة', desc: 'أداة المطابقة التلقائية في مطابقة الصناديق', icon: 'bolt', color: '#eab308' },
                            ]
                        },
                        {
                            title: 'واجهة العرض',
                            icon: 'dashboard_customize',
                            color: '#6366f1',
                            flags: [
                                { key: 'wallet_liquidity', label: 'مراجعة السيولة', desc: 'واجهة مراجعة سيولة المحافظ', icon: 'account_balance_wallet', color: '#06b6d4' },
                                { key: 'dashboard_charts', label: 'الرسوم البيانية', desc: 'الرسوم البيانية في لوحة المتابعة الرئيسية', icon: 'bar_chart', color: '#8b5cf6' },
                                { key: 'dashboard_tips', label: 'النصائح المالية', desc: 'شريط النصائح والتوجيهات في الرئيسية', icon: 'lightbulb', color: '#f59e0b' },
                                { key: 'developer_feedback', label: 'ملاحظات المطورين', desc: 'واجهة عرض وإدارة ملاحظات المطورين', icon: 'bug_report', color: '#6366f1' },
                            ]
                        },
                    ].map(section => (
                        <div key={section.title} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                            {/* Section Header */}
                            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700/50 flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${section.color}15`, color: section.color }}>
                                    <span className="material-symbols-outlined text-lg">{section.icon}</span>
                                </div>
                                <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200">{section.title}</h3>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mr-auto">
                                    {section.flags.filter(f => featureFlags[f.key] !== false).length}/{section.flags.length}
                                </span>
                            </div>

                            {/* Flags */}
                            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {section.flags.map(flag => {
                                    const isEnabled = featureFlags[flag.key] !== false;
                                    return (
                                        <div
                                            key={flag.key}
                                            className={`flex items-center justify-between px-5 py-3 transition-all duration-200 ${!isEnabled ? 'opacity-50' : ''
                                                }`}
                                        >
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <div
                                                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                                                    style={{ background: isEnabled ? `${flag.color}12` : '#94a3b815', color: isEnabled ? flag.color : '#94a3b8' }}
                                                >
                                                    <span className="material-symbols-outlined text-lg">{flag.icon}</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="font-bold text-[13px] text-slate-800 dark:text-white truncate">{flag.label}</h4>
                                                    <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{flag.desc}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => updateFeatureFlags({ [flag.key]: !isEnabled })}
                                                className="relative flex-shrink-0 mr-2 focus:outline-none"
                                                style={{ width: '48px', height: '26px' }}
                                                aria-label={`${isEnabled ? 'تعطيل' : 'تفعيل'} ${flag.label}`}
                                            >
                                                <div className="absolute inset-0 rounded-full transition-colors duration-200" style={{ background: isEnabled ? '#22c55e' : '#cbd5e1' }} />
                                                <div className="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow-md transition-all duration-200" style={{ right: isEnabled ? '2px' : 'auto', left: isEnabled ? 'auto' : '2px' }} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Summary */}
                    <div className="text-center py-2">
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-bold">
                            {Object.values(featureFlags).filter(v => v !== false).length} ميزة مفعّلة من أصل 17 • التغييرات تُطبّق فوراً
                        </span>
                    </div>
                </div>

            ) : activeTab === 'advanced' && currentUser?.role === 'super_admin' ? (
                <div className="space-y-6 max-w-4xl">
                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                <span className="material-symbols-outlined text-red-600 dark:text-red-400">database</span>
                                إعدادات متقدمة وإدارة البيانات
                            </h2>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">أدوات تصدير واستيراد البيانات وصيانة قاعدة البيانات</p>
                        </div>

                        <div className="p-6 space-y-8">
                            {/* Export Section */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-blue-500">file_download</span>
                                    تصدير البيانات
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">حدد الجداول التي ترغب بتصديرها كنسخة احتياطية (JSON).</p>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-4">
                                    {exportOptions.map((opt) => (
                                        <label key={opt.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={exportSelection.includes(opt.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setExportSelection(prev => [...prev, opt.id]);
                                                    } else {
                                                        setExportSelection(prev => prev.filter(id => id !== opt.id));
                                                    }
                                                }}
                                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-slate-800 dark:bg-slate-700 dark:border-slate-600"
                                            />
                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{opt.label}</span>
                                        </label>
                                    ))}
                                </div>

                                <div className="flex flex-wrap gap-3">
                                    <button
                                        disabled={exportSelection.length === 0 || isExporting}
                                        onClick={async () => {
                                            setIsExporting(true);
                                            try {
                                                const { collection, getDocs } = await import('firebase/firestore');
                                                const { db } = await import('../firebase');
                                                const exportData: any = {};

                                                for (const colName of exportSelection) {
                                                    const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
                                                    const q = collection(db, ROOT_COLLECTION, 'v1_data', colName);
                                                    const snap = await getDocs(q);
                                                    exportData[colName] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                                                }

                                                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `tawseel_backup_${new Date().toISOString().split('T')[0]}.json`;
                                                a.click();
                                                URL.revokeObjectURL(url);
                                            } catch (error) {
                                                console.error("Export failed", error);
                                                alert("حدث خطأ أثناء التصدير");
                                            } finally {
                                                setIsExporting(false);
                                            }
                                        }}
                                        className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span className="material-symbols-outlined">{isExporting ? 'hourglass_empty' : 'download'}</span>
                                        {isExporting ? 'جاري التصدير...' : `تصدير المحدد (${exportSelection.length})`}
                                    </button>
                                </div>
                            </div>

                            <hr className="border-slate-100 dark:border-slate-700" />

                            {/* Import Section */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-emerald-500">file_upload</span>
                                    استيراد البيانات
                                </h3>
                                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 flex gap-3">
                                    <span className="material-symbols-outlined text-amber-500">warning</span>
                                    <p className="text-xs text-amber-700 dark:text-amber-300 font-bold leading-relaxed">
                                        تحذير: استيراد البيانات قد يؤدي إلى تكرار السجلات أو استبدالها. يرجى التأكد من صحة الملف المرفوع.
                                    </p>
                                </div>
                                <input
                                    type="file"
                                    accept=".json"
                                    id="import-file"
                                    className="hidden"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;

                                        const confirmed = await confirmDialog('هل أنت متأكد من رغبتك في استيراد البيانات؟ هذا الإجراء قد يغير البيانات الحالية.', {
                                            title: 'تأكيد استيراد البيانات',
                                            type: 'warning',
                                            confirmText: 'استيراد',
                                            cancelText: 'إلغاء'
                                        });

                                        if (!confirmed) {
                                            e.target.value = '';
                                            return;
                                        }

                                        const reader = new FileReader();
                                        reader.onload = async (event) => {
                                            try {
                                                const data = JSON.parse(event.target?.result as string);
                                                const { doc, setDoc } = await import('firebase/firestore');
                                                const { db } = await import('../firebase');
                                                const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';

                                                alert('جاري الاستيراد... يرجى عدم إغلاق الصفحة');

                                                let count = 0;
                                                for (const colName in data) {
                                                    const items = data[colName];
                                                    if (Array.isArray(items)) {
                                                        for (const item of items) {
                                                            const id = item.id;
                                                            delete item.id;
                                                            await setDoc(doc(db, ROOT_COLLECTION, 'v1_data', colName, id), item);
                                                            count++;
                                                        }
                                                    }
                                                }

                                                alert(`تم استيراد ${count} سجل بنجاح!`);
                                                window.location.reload();
                                            } catch (err) {
                                                console.error(err);
                                                alert('حدث خطأ أثناء قراءة الملف أو استيراد البيانات');
                                            }
                                        };
                                        reader.readAsText(file);
                                    }}
                                />
                                <button
                                    onClick={() => document.getElementById('import-file')?.click()}
                                    className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined">upload</span>
                                    اختيار ملف للاستيراد
                                </button>
                            </div>

                            <hr className="border-slate-100 dark:border-slate-700" />

                            {/* Maintenance Section */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-rose-500">mop</span>
                                    صيانة وتنظيف البيانات
                                </h3>
                                <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 max-w-2xl">
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">نوع السجلات</label>
                                                <select
                                                    value={cleanupTarget}
                                                    onChange={(e) => setCleanupTarget(e.target.value)}
                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-rose-500"
                                                >
                                                    <option value="activity_logs">سجل النشاط (Logs)</option>
                                                    <option value="history_records">أرشيف الكشوفات (Archives)</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">الفترة الزمنية</label>
                                                <select
                                                    value={cleanupTimeframe}
                                                    onChange={(e) => setCleanupTimeframe(e.target.value)}
                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-rose-500"
                                                >
                                                    <option value="3">أقدم من 3 أشهر</option>
                                                    <option value="6">أقدم من 6 أشهر</option>
                                                    <option value="12">أقدم من سنة</option>
                                                    <option value="all">الكل (تفريغ كامل)</option>
                                                </select>
                                            </div>
                                        </div>

                                        <button
                                            onClick={async () => {
                                                setIsAnalyzing(true);
                                                setCleanupStats(null);
                                                try {
                                                    const { collection, query, where, getDocs } = await import('firebase/firestore');
                                                    const { db } = await import('../firebase');
                                                    const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';

                                                    let q = collection(db, ROOT_COLLECTION, 'v1_data', cleanupTarget);

                                                    if (cleanupTimeframe !== 'all') {
                                                        const targetDate = new Date();
                                                        targetDate.setMonth(targetDate.getMonth() - parseInt(cleanupTimeframe));
                                                        const tsField = cleanupTarget === 'activity_logs' ? 'timestamp' : 'date';
                                                        q = query(q, where(tsField, '<', targetDate.toISOString())) as any;
                                                    }

                                                    const snap = await getDocs(q);
                                                    setCleanupStats({
                                                        count: snap.size,
                                                        estimatedSizeKB: Math.round(snap.size * 1.2), // Rough estimate: 1.2KB per doc
                                                        docs: snap.docs
                                                    });
                                                } catch (error) {
                                                    console.error("Analysis failed", error);
                                                    alert("فشل تحليل البيانات.");
                                                } finally {
                                                    setIsAnalyzing(false);
                                                }
                                            }}
                                            disabled={isAnalyzing}
                                            className="w-full py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold text-sm hover:bg-slate-300 dark:hover:bg-slate-600 transition-all flex items-center justify-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-sm">{isAnalyzing ? 'sync' : 'search'}</span>
                                            {isAnalyzing ? 'جاري التحليل...' : 'تحليل السجلات المستهدفة'}
                                        </button>

                                        {cleanupStats && (
                                            <div className="mt-4 p-4 border border-rose-200 bg-rose-50 dark:bg-rose-900/10 dark:border-rose-800 rounded-xl space-y-3 animate-fade-in">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">نتيجة التحليل:</span>
                                                    <span className="px-2.5 py-1 bg-white dark:bg-slate-800 rounded-md text-xs font-bold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                                        الحجم التقديري: ~{cleanupStats.estimatedSizeKB} KB
                                                    </span>
                                                </div>
                                                <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
                                                    {cleanupStats.count} <span className="text-sm font-bold text-rose-500/70">سجل متطابق</span>
                                                </div>

                                                {cleanupStats.count > 0 && (
                                                    <button
                                                        onClick={async () => {
                                                            const confirmed = await confirmDialog(`هل أنت متأكد نهائياً من حذف ${cleanupStats.count} سجل؟ هذا الإجراء لا يمكن التراجع عنه.`, {
                                                                title: 'تأكيد الحذف النهائي',
                                                                type: 'danger',
                                                                confirmText: 'حذف نهائي',
                                                                cancelText: 'إلغاء'
                                                            });
                                                            if (!confirmed) return;
                                                            setIsDeleting(true);
                                                            try {
                                                                const { deleteDoc, doc } = await import('firebase/firestore');
                                                                const { db } = await import('../firebase');
                                                                const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';

                                                                let deleted = 0;
                                                                for (const d of cleanupStats.docs) {
                                                                    await deleteDoc(doc(db, ROOT_COLLECTION, 'v1_data', cleanupTarget, d.id));
                                                                    deleted++;
                                                                }
                                                                alert(`تم حذف ${deleted} سجل بنجاح.`);
                                                                setCleanupStats(null);
                                                            } catch (error) {
                                                                console.error("Delete failed", error);
                                                                alert("حدث خطأ أثناء الحذف.");
                                                            } finally {
                                                                setIsDeleting(false);
                                                            }
                                                        }}
                                                        disabled={isDeleting}
                                                        className="w-full py-2.5 bg-rose-600 text-white rounded-lg font-bold text-sm hover:bg-rose-700 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">{isDeleting ? 'hourglass_empty' : 'delete_forever'}</span>
                                                        {isDeleting ? 'جاري الحذف...' : 'تأكيد الحذف النهائي'}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            ) : activeTab === 'providers' ? (
                <div className="space-y-6 max-w-4xl">
                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                    <span className="material-symbols-outlined text-purple-600 dark:text-purple-400">settings_remote</span>
                                    إدارة مزودي الاتصالات
                                </h2>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">تحديد الشركات المزودة لخدمات الاتصالات في النظام</p>
                            </div>
                        </div>

                        <div className="p-6">
                            {phoneProviders && (
                                <ProviderManagementUI
                                    providers={phoneProviders}
                                    onAdd={addPhoneProvider}
                                    onUpdate={updatePhoneProvider}
                                    onDelete={deletePhoneProvider}
                                />
                            )}
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Mapping Tab Content */}
            {activeTab === 'mapping' && (
                <div className="space-y-6 max-w-5xl">
                    {/* === استخراج الأرصدة === */}
                    <PasteExtractorSection onSaved={() => { }} syncMetadata={syncMetadata} />

                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400">link</span>
                                ربط الحسابات بالنظام الأساسي
                            </h2>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">ربط حسابات الصناديق في النظام بأرقام الحسابات في tawseel.app لاستخراج الأرصدة تلقائياً</p>
                            {syncMetadata && (
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-bold flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">sync</span>
                                    آخر مزامنة: {new Date(syncMetadata.lastSync).toLocaleString('ar-SA')}
                                    {syncMetadata.bankCount > 0 && ` | بنوك: ${syncMetadata.bankCount}`}
                                    {syncMetadata.restaurantCount > 0 && ` | مطاعم: ${syncMetadata.restaurantCount}`}
                                </p>
                            )}
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Add New Mapping Form */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600">
                                <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-emerald-500">add_link</span>
                                    إضافة ربط جديد
                                </h3>
                                <form onSubmit={async (e) => {
                                    e.preventDefault();
                                    const form = e.target as HTMLFormElement;
                                    const bankDefId = (form.elements.namedItem('mapping-bankDef') as HTMLSelectElement).value;
                                    const systemAccountNumber = (form.elements.namedItem('mapping-sysAccount') as HTMLInputElement).value.trim();
                                    if (!bankDefId || !systemAccountNumber) { alert('يرجى تعبئة جميع الحقول'); return; }
                                    try {
                                        const bankDef = bankDefinitions.find(b => b.id === bankDefId);
                                        await saveAccountMapping({
                                            id: bankDefId,
                                            bankDefId,
                                            bankDefName: bankDef?.name || bankDefId,
                                            systemAccountNumber,
                                            type: 'bank'
                                        });
                                        form.reset();
                                        alert('✅ تم حفظ الربط بنجاح');
                                    } catch (error) {
                                        console.error(error);
                                        alert('❌ فشل حفظ الربط');
                                    }
                                }} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500">الصندوق / البنك في النظام</label>
                                        <select name="mapping-bankDef" required className="w-full p-3 bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:border-emerald-500 font-bold text-sm appearance-none">
                                            <option value="">اختر الصندوق...</option>
                                            {bankDefinitions.filter(bd => !accountMappings.find(m => m.bankDefId === bd.id)).map(bd => (
                                                <option key={bd.id} value={bd.id}>{bd.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500">رقم الحساب في tawseel.app</label>
                                        <input name="mapping-sysAccount" type="text" required placeholder="مثل: 6001" className="w-full p-3 bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:border-emerald-500 font-bold text-sm" />
                                    </div>
                                    <button type="submit" className="p-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                                        <span className="material-symbols-outlined">save</span>
                                        حفظ
                                    </button>
                                </form>
                            </div>

                            {/* Existing Mappings */}
                            <div>
                                <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-3">الربط الحالي ({accountMappings.length})</h3>
                                {accountMappings.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400">
                                        <span className="material-symbols-outlined text-4xl block mb-2 opacity-50">link_off</span>
                                        <p className="font-bold">لا يوجد ربط حالياً. أضف ربط جديد أعلاه.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {accountMappings.map((mapping: AccountMapping) => {
                                            const matchedBalance = systemBalances.find(sb => sb.accountNumber === mapping.systemAccountNumber && sb.type === 'bank');
                                            return (
                                                <div key={mapping.id || mapping.bankDefId} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all">
                                                    <div className="size-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-emerald-600">account_balance</span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-slate-800 dark:text-white">{mapping.bankDefName}</p>
                                                        <p className="text-xs text-slate-400 font-mono">حساب النظام: {mapping.systemAccountNumber}</p>
                                                    </div>
                                                    {matchedBalance && (
                                                        <div className="text-left">
                                                            <p className="text-xs text-slate-400">الرصيد</p>
                                                            <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{matchedBalance.debit.toLocaleString()}</p>
                                                        </div>
                                                    )}
                                                    <button
                                                        onClick={async () => {
                                                            const confirmed = await confirmDialog(`حذف ربط "${mapping.bankDefName}"?`, { type: 'danger', confirmText: 'حذف', cancelText: 'إلغاء' });
                                                            if (confirmed) {
                                                                await deleteAccountMapping(mapping.id || mapping.bankDefId);
                                                            }
                                                        }}
                                                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                                        title="حذف"
                                                    >
                                                        <span className="material-symbols-outlined">delete</span>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* System Balances Preview */}
                            {systemBalances.length > 0 && (
                                <div>
                                    <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-blue-500">monitoring</span>
                                        أرصدة النظام المستخرجة ({systemBalances.length})
                                    </h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-right text-sm">
                                            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 text-xs font-bold">
                                                <tr>
                                                    <th className="px-4 py-2">اسم الحساب</th>
                                                    <th className="px-4 py-2">رقم الحساب</th>
                                                    <th className="px-4 py-2">مدين</th>
                                                    <th className="px-4 py-2">دائن</th>
                                                    <th className="px-4 py-2">الرصيد</th>
                                                    <th className="px-4 py-2">النوع</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                {systemBalances.map((sb, i) => (
                                                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                        <td className="px-4 py-2 font-bold">{sb.accountName}</td>
                                                        <td className="px-4 py-2 font-mono text-slate-500">{sb.accountNumber}</td>
                                                        <td className="px-4 py-2 font-mono">{sb.debit.toLocaleString()}</td>
                                                        <td className="px-4 py-2 font-mono">{sb.credit.toLocaleString()}</td>
                                                        <td className="px-4 py-2 font-mono font-bold text-emerald-600 dark:text-emerald-400">{sb.balance.toLocaleString()}</td>
                                                        <td className="px-4 py-2">
                                                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${sb.type === 'bank' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                                                                {sb.type === 'bank' ? 'بنك' : 'مطعم'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* Exchange Rate History Modal */}
            {showHistoryModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
                            <h3 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-indigo-600">history</span>
                                سجل تعديلات أسعار الصرف
                            </h3>
                            <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 bg-slate-50 dark:bg-slate-900/50">
                            {isLoadingHistory ? (
                                <div className="flex flex-col items-center justify-center p-12 text-slate-500">
                                    <span className="material-symbols-outlined animate-spin text-4xl mb-4 text-indigo-500">sync</span>
                                    <span className="font-bold">جاري تحميل السجل...</span>
                                </div>
                            ) : rateHistory.length > 0 ? (
                                <div className="space-y-3">
                                    {rateHistory.map(record => (
                                        <div key={record.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                                                        {new Date(record.updatedAt).toLocaleString('ar-SA')}
                                                    </span>
                                                    <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[14px]">person</span>
                                                        {record.updatedBy || 'مجهول'}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">SAR → ر.ق (Real Qadeem)</p>
                                                        <p className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{record.SAR_TO_OLD_RIAL}</p>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">SAR → ر.ج (Real Jadeed)</p>
                                                        <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{record.SAR_TO_NEW_RIAL}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center p-8 text-slate-500 dark:text-slate-400">
                                    <span className="material-symbols-outlined text-4xl block mb-2 opacity-50">history_toggle_off</span>
                                    لا توجد سجلات سابقة لأسعار الصرف
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


interface ProviderManagementUIProps {
    providers: any[];
    onAdd: (provider: any) => Promise<string>;
    onUpdate: (id: string, updates: any) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

const ProviderManagementUI: React.FC<ProviderManagementUIProps> = ({ providers, onAdd, onUpdate, onDelete }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProvider, setEditingProvider] = useState<any>(null);
    const [name, setName] = useState('');
    const [isActive, setIsActive] = useState(true);

    const handleOpenAdd = () => {
        setEditingProvider(null);
        setName('');
        setIsActive(true);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (p: any) => {
        setEditingProvider(p);
        setName(p.name);
        setIsActive(p.isActive);
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingProvider) {
                await onUpdate(editingProvider.id, { name, isActive });
            } else {
                await onAdd({ name, isActive });
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء الحفظ');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <button
                    onClick={handleOpenAdd}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-purple-700 transition-all shadow-sm"
                >
                    <span className="material-symbols-outlined">add_circle</span>
                    إضافة مزود جديد
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {providers.map(provider => (
                    <div key={provider.id} className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between font-display">
                        <div className="flex items-center gap-3 text-right">
                            <div className={`size-10 rounded-lg flex items-center justify-center ${provider.isActive ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                                <span className="material-symbols-outlined">{provider.isActive ? 'check_circle' : 'cancel'}</span>
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800 dark:text-white">{provider.name}</h4>
                                <p className={`text-[11px] ${provider.isActive ? 'text-green-500' : 'text-slate-400'}`}>
                                    {provider.isActive ? 'نشط' : 'معطل'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleOpenEdit(provider)}
                                className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            >
                                <span className="material-symbols-outlined">edit</span>
                            </button>
                            <button
                                onClick={async () => {
                                    const confirmed = await confirmDialog('هل أنت متأكد من حذف هذا المزود؟', {
                                        title: 'حذف المزود',
                                        type: 'danger',
                                        confirmText: 'حذف',
                                        cancelText: 'إلغاء'
                                    });
                                    if (confirmed) {
                                        onDelete(provider.id);
                                    }
                                }}
                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            >
                                <span className="material-symbols-outlined">delete</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in font-display">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                {editingProvider ? 'تعديل مزود' : 'إضافة مزود جديد'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-right">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">اسم المزود</label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 text-right"
                                    placeholder="مثال: يمن موبايل، سبأفون..."
                                />
                            </div>
                            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                                <span className="text-sm font-bold text-slate-600 dark:text-slate-400">الحالة: {isActive ? 'نشط' : 'معطل'}</span>
                                <button type="button" onClick={() => setIsActive(!isActive)}
                                    className={`relative w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${isActive ? 'bg-green-500' : 'bg-slate-300'}`}>
                                    <div className={`size-4 rounded-full bg-white transition-transform ${isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>
                            <div className="pt-4 flex gap-4">
                                <button type="submit" className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-black transition-all">حفظ</button>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold transition-all">إلغاء</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsPage;
