import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext, BankDefinition, FundLineItem, FundSnapshot, FundsCurrency } from '../AppContext';
import { generateId } from '../utils';

const FundsPage: React.FC = () => {
    const { currentUser, bankDefinitions, addBankDefinition, deleteBankDefinition, fundSnapshots, saveFundSnapshot, deleteFundSnapshot, editFundSnapshot } = useAppContext();

    // -- State --
    const [lineItems, setLineItems] = useState<FundLineItem[]>([]);
    const [isSessionInitialized, setIsSessionInitialized] = useState(false);

    // Tab State: 'local' or 'foreign'
    const [activeTab, setActiveTab] = useState<'local' | 'foreign'>('local');

    // Admin Modal State
    const [isAddBankModalOpen, setIsAddBankModalOpen] = useState(false);
    const [newBankName, setNewBankName] = useState('');
    const [newBankCurrency, setNewBankCurrency] = useState<FundsCurrency>('old_riyal');
    const [newBankAccountNumber, setNewBankAccountNumber] = useState('');
    const [customCurrencyName, setCustomCurrencyName] = useState('');

    // Report/Snapshot Modal State
    const [reportSnapshot, setReportSnapshot] = useState<FundSnapshot | null>(null);

    // -- Initialization --
    useEffect(() => {
        const savedDraft = localStorage.getItem('funds_draft_v2');

        if (savedDraft) {
            setLineItems(JSON.parse(savedDraft));
        } else {
            const initialItems: FundLineItem[] = bankDefinitions
                .filter(def => def.isActive)
                .map(def => ({
                    id: generateId(),
                    bankDefId: def.id,
                    bankName: def.name,
                    sysBalance: 0,
                    bankBalance: 0,
                    variance: 0,
                    notes: '',
                    isCompleted: false
                }));
            setLineItems(initialItems);
        }
        setIsSessionInitialized(true);
    }, []);

    // Sync active definitions with line items
    useEffect(() => {
        if (!isSessionInitialized) return;

        setLineItems(currentItems => {
            const newItems = [...currentItems];

            bankDefinitions.forEach(def => {
                if (def.isActive && !newItems.find(item => item.bankDefId === def.id)) {
                    newItems.push({
                        id: generateId(),
                        bankDefId: def.id,
                        bankName: def.name,
                        sysBalance: 0,
                        bankBalance: 0,
                        variance: 0,
                        notes: '',
                        isCompleted: false
                    });
                }
            });

            return newItems;
        });
    }, [bankDefinitions, isSessionInitialized]);

    // Auto-save draft
    useEffect(() => {
        if (isSessionInitialized) {
            localStorage.setItem('funds_draft_v2', JSON.stringify(lineItems));
        }
    }, [lineItems, isSessionInitialized]);

    // -- Handlers --
    const handleUpdateItem = (id: string, field: keyof FundLineItem, value: any) => {
        setLineItems(prev => prev.map(item => {
            if (item.id !== id) return item;
            if (item.isCompleted && field !== 'isCompleted') return item;

            const updated = { ...item, [field]: value };

            if (field === 'sysBalance' || field === 'bankBalance') {
                const sys = field === 'sysBalance' ? Number(value) : item.sysBalance;
                const bank = field === 'bankBalance' ? Number(value) : item.bankBalance;
                updated.variance = sys - bank;
            }
            return updated;
        }));
    };

    const toggleRowCompletion = (id: string) => {
        setLineItems(prev => prev.map(item => {
            if (item.id !== id) return item;

            if (item.isCompleted) {
                return { ...item, isCompleted: false, completedAt: undefined };
            } else {
                const timeStr = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                return { ...item, isCompleted: true, completedAt: timeStr };
            }
        }));
    };

    const handleAddBank = () => {
        if (!newBankName.trim()) return;
        addBankDefinition(
            newBankName,
            newBankCurrency,
            newBankAccountNumber || undefined,
            newBankCurrency === 'custom' ? customCurrencyName : undefined
        );
        setNewBankName('');
        setNewBankAccountNumber('');
        setCustomCurrencyName('');
        setIsAddBankModalOpen(false);
    };

    // Final Approval
    const handleFinalApproval = () => {
        const incomplete = lineItems.filter(i => !i.isCompleted);
        if (incomplete.length > 0) {
            alert(`عذراً، يجب إتمام جميع الأسطر أولاً. يوجد ${incomplete.length} حسابات غير مكتملة.`);
            return;
        }

        if (!window.confirm('هل أنت متأكد من اعتماد وإغلاق المطابقة بشكل نهائي؟\n\nتنبيه: لا يمكن التعديل أو الحذف بعد الاعتماد.')) {
            return;
        }

        // Create comprehensive snapshot with all currencies
        const snapshot: FundSnapshot = {
            id: generateId(),
            date: new Date().toLocaleDateString('en-GB'),
            fullTimestamp: new Date().toLocaleString('ar-SA'),
            user: currentUser?.name || currentUser?.username || 'Unknown',

            // Local currencies
            oldRiyalItems: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'old_riyal'),
            newRiyalItems: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'new_riyal'),
            totalVarianceOld: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'old_riyal').reduce((acc, curr) => acc + curr.variance, 0),
            totalVarianceNew: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'new_riyal').reduce((acc, curr) => acc + curr.variance, 0),

            // Foreign currencies
            sarItems: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'sar'),
            blueUsdItems: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'blue_usd'),
            whiteUsdItems: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'white_usd'),
            customCurrencyItems: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'custom'),
            totalVarianceSar: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'sar').reduce((acc, curr) => acc + curr.variance, 0),
            totalVarianceBlueUsd: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'blue_usd').reduce((acc, curr) => acc + curr.variance, 0),
            totalVarianceWhiteUsd: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'white_usd').reduce((acc, curr) => acc + curr.variance, 0),
            totalVarianceCustom: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'custom').reduce((acc, curr) => acc + curr.variance, 0),

            status: 'approved',
            canEdit: false
        };

        saveFundSnapshot(snapshot);
        localStorage.removeItem('funds_draft_v2');
        setLineItems(prev => prev.map(i => ({ ...i, sysBalance: 0, bankBalance: 0, variance: 0, notes: '', isCompleted: false, completedAt: undefined })));

        setReportSnapshot(snapshot);
    };

    // Helpers
    const getCurrencyForDef = (defId: string): FundsCurrency => {
        const def = bankDefinitions.find(d => d.id === defId);
        return def?.currency || 'old_riyal';
    };

    const getAccountNumberForDef = (defId: string): string => {
        const def = bankDefinitions.find(d => d.id === defId);
        return def?.accountNumber || '';
    };

    // Separated Items by Currency
    const oldRiyalItems = lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'old_riyal');
    const newRiyalItems = lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'new_riyal');
    const sarItems = lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'sar');
    const blueUsdItems = lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'blue_usd');
    const whiteUsdItems = lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'white_usd');
    const customItems = lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'custom');

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-32">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b-4 border-slate-900 dark:border-slate-300 pb-6">
                <div>
                    <h1 className="text-4xl font-black text-[#263238] dark:text-white font-display">مطابقة الصناديق اليومية</h1>
                    <p className="text-xl text-[#607D8B] dark:text-slate-400 mt-1">المراجعة اليومية للسيولة النقدية والحسابات البنكية</p>
                </div>
                <div className="text-end">
                    <p className="text-2xl font-black text-[#607D8B] dark:text-slate-500">التاريخ: <span className="text-[#263238] dark:text-white font-mono">{new Date().toLocaleDateString('ar-SA')}</span></p>
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

            {/* Admin Action: Add Bank */}
            {currentUser?.role === 'super_admin' && (
                <div className="flex justify-end">
                    <button
                        onClick={() => setIsAddBankModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-[#4FC3F7] dark:bg-slate-700 text-[#263238] dark:text-white rounded-lg text-xs font-bold hover:bg-[#29B6F6] dark:hover:bg-slate-600 transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm">add_card</span>
                        إضافة حساب بنكي جديد
                    </button>
                </div>
            )}

            {/* LOCAL CURRENCIES TAB */}
            {activeTab === 'local' && (
                <div className="space-y-8">
                    <ReconTable
                        title="مطابقة الريال القديم (Old Riyal)"
                        items={oldRiyalItems}
                        colorClass="green"
                        onUpdate={handleUpdateItem}
                        onToggleComplete={toggleRowCompletion}
                        getAccountNumber={getAccountNumberForDef}
                    />

                    <ReconTable
                        title="مطابقة الريال الجديد (New Riyal)"
                        items={newRiyalItems}
                        colorClass="blue"
                        onUpdate={handleUpdateItem}
                        onToggleComplete={toggleRowCompletion}
                        getAccountNumber={getAccountNumberForDef}
                    />
                </div>
            )}

            {/* FOREIGN CURRENCIES TAB */}
            {activeTab === 'foreign' && (
                <div className="space-y-8">
                    <ReconTable
                        title="مطابقة الريال السعودي (SAR)"
                        items={sarItems}
                        colorClass="yellow"
                        onUpdate={handleUpdateItem}
                        onToggleComplete={toggleRowCompletion}
                        getAccountNumber={getAccountNumberForDef}
                    />

                    <ReconTable
                        title="مطابقة الدولار الأزرق (Blue USD)"
                        items={blueUsdItems}
                        colorClass="indigo"
                        onUpdate={handleUpdateItem}
                        onToggleComplete={toggleRowCompletion}
                        getAccountNumber={getAccountNumberForDef}
                    />

                    <ReconTable
                        title="مطابقة الدولار الأبيض (White USD)"
                        items={whiteUsdItems}
                        colorClass="gray"
                        onUpdate={handleUpdateItem}
                        onToggleComplete={toggleRowCompletion}
                        getAccountNumber={getAccountNumberForDef}
                    />

                    {customItems.length > 0 && (
                        <ReconTable
                            title="مطابقة العملات المخصصة"
                            items={customItems}
                            colorClass="purple"
                            onUpdate={handleUpdateItem}
                            onToggleComplete={toggleRowCompletion}
                            getAccountNumber={getAccountNumberForDef}
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
                    editFundSnapshot={editFundSnapshot}
                    setLineItems={setLineItems}
                />
            )}

            {/* ADD BANK MODAL */}
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
                />
            )}

            {/* REPORT SNAPSHOT MODAL */}
            {reportSnapshot && (
                <ReportModal snapshot={reportSnapshot} setReportSnapshot={setReportSnapshot} />
            )}
        </div>
    );
};

// -- Sub-Components --

// ReconTable Component with Enhanced Formatting
const ReconTable = ({ title, items, colorClass, onUpdate, onToggleComplete, getAccountNumber }: any) => {
    const colorClasses = {
        green: { bg: 'bg-[#E8F5E9] dark:bg-emerald-900/20', text: 'text-[#2E7D32] dark:text-emerald-400' },
        blue: { bg: 'bg-[#E3F2FD] dark:bg-blue-900/20', text: 'text-[#1565C0] dark:text-blue-400' },
        yellow: { bg: 'bg-[#FFF9C4] dark:bg-yellow-900/20', text: 'text-[#F57F17] dark:text-yellow-400' },
        indigo: { bg: 'bg-[#E8EAF6] dark:bg-indigo-900/20', text: 'text-[#283593] dark:text-indigo-400' },
        gray: { bg: 'bg-[#ECEFF1] dark:bg-slate-900/20', text: 'text-[#455A64] dark:text-slate-400' },
        purple: { bg: 'bg-[#F3E5F5] dark:bg-purple-900/20', text: 'text-[#6A1B9A] dark:text-purple-400' }
    };

    const colors = colorClasses[colorClass] || colorClasses.green;

    //  Calculate totals
    const totalSys = items.reduce((a: number, b: FundLineItem) => a + Number(b.sysBalance || 0), 0);
    const totalBank = items.reduce((a: number, b: FundLineItem) => a + Number(b.bankBalance || 0), 0);
    const totalVariance = items.reduce((a: number, b: FundLineItem) => a + Number(b.variance || 0), 0);

    return (
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-lg border-2 border-slate-900 dark:border-slate-300 overflow-hidden mb-8">
            <div className={`px-6 py-4 border-b-2 border-slate-900 dark:border-slate-300 ${colors.bg}`}>
                <h2 className={`text-xl font-black flex items-center gap-2 ${colors.text}`}>
                    <span className="material-symbols-outlined">account_balance_wallet</span>
                    {title}
                </h2>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-right text-sm border-collapse">
                    <thead>
                        <tr className="bg-[#263238] dark:bg-[#0f172a] text-white font-bold border-b-2 border-slate-900">
                            <th className="px-4 py-3 border border-slate-700 w-[10%]">رقم الحساب</th>
                            <th className="px-4 py-3 border border-slate-700 w-[15%]">اسم الحساب</th>
                            <th className="px-4 py-3 border border-slate-700 w-[15%]">مبلغ النظام</th>
                            <th className="px-4 py-3 border border-slate-700 w-[15%]">مبلغ البنك</th>
                            <th className="px-4 py-3 border border-slate-700 w-[10%]">الفارق</th>
                            <th className="px-4 py-3 border border-slate-700 w-[20%]">ملاحظات</th>
                            <th className="px-4 py-3 border border-slate-700 w-[10%] text-center">الإجراء</th>
                            <th className="px-4 py-3 border border-slate-700 w-[10%] text-center">الوقت</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 && (
                            <tr><td colSpan={8} className="text-center p-8 text-slate-400">لا توجد حسابات مضافة.</td></tr>
                        )}
                        {items.map((item: FundLineItem, idx: number) => (
                            <tr key={item.id} className={`${idx % 2 === 0 ? 'bg-white dark:bg-[#1e293b]' : 'bg-[#F5F5F5] dark:bg-[#1e293b]/50'} hover:bg-[#ECEFF1] dark:hover:bg-slate-700 transition-colors border-b border-slate-300`}>
                                {/* Account Number */}
                                <td className="px-4 py-3 font-mono text-sm text-[#607D8B] dark:text-slate-400 border border-slate-300">
                                    {getAccountNumber(item.bankDefId) || '-'}
                                </td>
                                {/* Name */}
                                <td className="px-4 py-3 font-bold text-[#263238] dark:text-slate-200 border border-slate-300">
                                    {item.bankName}
                                </td>
                                {/* Sys */}
                                <td className="px-4 py-3 border border-slate-300">
                                    <input
                                        type="number"
                                        disabled={item.isCompleted}
                                        value={item.sysBalance}
                                        onChange={e => onUpdate(item.id, 'sysBalance', Number(e.target.value))}
                                        className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-green-500 outline-none font-mono font-bold disabled:text-slate-400 disabled:cursor-not-allowed"
                                        placeholder="0"
                                    />
                                </td>
                                {/* Bank */}
                                <td className="px-4 py-3 border border-slate-300">
                                    <input
                                        type="number"
                                        disabled={item.isCompleted}
                                        value={item.bankBalance}
                                        onChange={e => onUpdate(item.id, 'bankBalance', Number(e.target.value))}
                                        className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-green-500 outline-none font-mono font-bold disabled:text-slate-400 disabled:cursor-not-allowed"
                                        placeholder="0"
                                    />
                                </td>
                                {/* Variance */}
                                <td className="px-4 py-3 border border-slate-300">
                                    <span className={`font-mono font-bold text-lg ${item.variance === 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {item.variance.toLocaleString()}
                                    </span>
                                </td>
                                {/* Notes */}
                                <td className="px-4 py-3 border border-slate-300">
                                    <input
                                        type="text"
                                        disabled={item.isCompleted}
                                        value={item.notes}
                                        onChange={e => onUpdate(item.id, 'notes', e.target.value)}
                                        className="w-full bg-transparent text-sm disabled:text-slate-400"
                                        placeholder="..."
                                    />
                                </td>
                                {/* Action */}
                                <td className="px-4 py-3 text-center border border-slate-300">
                                    <button
                                        onClick={() => onToggleComplete(item.id)}
                                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${item.isCompleted
                                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                            : 'bg-slate-800 text-white hover:bg-slate-700'
                                            }`}
                                    >
                                        {item.isCompleted ? 'تعديل' : 'إتمام'}
                                    </button>
                                </td>
                                {/* Time */}
                                <td className="px-4 py-3 text-center text-base font-bold font-mono text-slate-600 dark:text-slate-300 border border-slate-300">
                                    {item.completedAt || '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    {/* Enhanced Totals Row */}
                    <tfoot className="bg-gradient-to-r from-amber-200 to-orange-200 dark:from-amber-900 dark:to-orange-900 font-black text-lg border-t-4 border-slate-900">
                        <tr>
                            <td colSpan={2} className="px-4 py-4 border border-slate-700">الإجمالي</td>
                            <td className="px-4 py-4 font-mono border border-slate-700">{totalSys.toLocaleString()}</td>
                            <td className="px-4 py-4 font-mono border border-slate-700">{totalBank.toLocaleString()}</td>
                            <td className={`px-4 py-4 font-mono border border-slate-700 ${totalVariance === 0 ? 'text-green-700' : 'text-red-700'}`}>
                                {totalVariance.toLocaleString()}
                            </td>
                            <td colSpan={3} className="border border-slate-700"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

// Archive Section Component
const ArchiveSection = ({ fundSnapshots, setReportSnapshot, currentUser, deleteFundSnapshot, editFundSnapshot, setLineItems }: any) => {
    const handleEdit = (id: string) => {
        const items = editFundSnapshot(id);
        if (items.length > 0) {
            setLineItems(items);
            alert('✅ تم تحميل المطابقة للتعديل. قم بإجراء التغييرات ثم اعتمد من جديد.');
        }
    };

    return (
        <div className="border-t-4 border-slate-900 dark:border-slate-300 pt-8">
            <h3 className="font-bold text-2xl text-slate-700 dark:text-slate-300 mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined">history_edu</span>
                أرشيف المطابقات السابقة
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {fundSnapshots.slice(0, 6).map(snap => (
                    <div
                        key={snap.id}
                        className="bg-white dark:bg-[#1e293b] p-6 rounded-xl border-2 border-slate-300 dark:border-slate-700 hover:border-[#C62828] dark:hover:border-[#C62828] transition-all group shadow-lg"
                    >
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <span className="font-mono font-black text-xl text-[#263238] dark:text-white">{snap.date}</span>
                                <p className="text-sm text-[#607D8B] dark:text-slate-400 mt-1">بواسطة: {snap.user}</p>
                            </div>
                            <button
                                onClick={() => setReportSnapshot(snap)}
                                className="material-symbols-outlined text-slate-400 group-hover:text-[#C62828] transition-colors text-3xl"
                            >
                                visibility
                            </button>
                        </div>

                        {/* Currency Variances */}
                        <div className="mt-4 grid grid-cols-2 gap-2 mb-4">
                            <span className={`text-xs px-2 py-1 rounded ${snap.totalVarianceOld === 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} font-bold`}>
                                قديم: {snap.totalVarianceOld}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded ${snap.totalVarianceNew === 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'} font-bold`}>
                                جديد: {snap.totalVarianceNew}
                            </span>
                            {snap.totalVarianceSar !== undefined && snap.totalVarianceSar !== 0 && (
                                <span className={`text-xs px-2 py-1 rounded ${snap.totalVarianceSar === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'} font-bold`}>
                                    SAR: {snap.totalVarianceSar}
                                </span>
                            )}
                            {snap.totalVarianceBlueUsd !== undefined && snap.totalVarianceBlueUsd !== 0 && (
                                <span className={`text-xs px-2 py-1 rounded ${snap.totalVarianceBlueUsd === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-red-100 text-red-700'} font-bold`}>
                                    Blue USD: {snap.totalVarianceBlueUsd}
                                </span>
                            )}
                        </div>

                        {/* Admin Actions */}
                        {currentUser?.role === 'super_admin' && (
                            <div className="flex gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                                <button
                                    onClick={() => handleEdit(snap.id)}
                                    className="flex-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-sm">edit</span>
                                    تعديل
                                </button>
                                <button
                                    onClick={() => deleteFundSnapshot(snap.id)}
                                    className="flex-1 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                    حذف
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

// Add Bank Modal Component
const AddBankModal = ({ newBankName, setNewBankName, newBankCurrency, setNewBankCurrency, newBankAccountNumber, setNewBankAccountNumber, customCurrencyName, setCustomCurrencyName, handleAddBank, setIsAddBankModalOpen }: any) => {
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
                <h3 className="text-xl font-bold mb-4 text-slate-800 dark:text-white">إضافة حساب بنكي جديد</h3>
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
                    <button onClick={handleAddBank} className="px-6 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800">حفظ وإضافة</button>
                </div>
            </div>
        </div>
    );
};

// Report Modal Component (Optimized A4 Layout + Image Export)
const ReportModal = ({ snapshot, setReportSnapshot }: any) => {
    const downloadAsImage = async () => {
        const html2canvas = (await import('html2canvas')).default;
        const element = document.getElementById('snapshot-print-area');
        if (!element) return;

        try {
            const canvas = await html2canvas(element, {
                scale: 2, // High quality
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                width: 794, // A4 width in pixels at 96 DPI
                height: 1123 // A4 height in pixels at 96 DPI
            });

            // Download as PNG
            const link = document.createElement('a');
            link.download = `مطابقة-صناديق-${snapshot.date.replace(/\//g, '-')}.png`;
            link.href = canvas.toDataURL('image/png', 1.0);
            link.click();
        } catch (error) {
            console.error('Error generating image:', error);
            alert('حدث خطأ أثناء إنشاء الصورة. يرجى المحاولة مرة أخرى.');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
            <div className="bg-white text-slate-900 w-full max-w-4xl rounded-none shadow-2xl overflow-hidden flex flex-col my-8 print:max-w-none print:my-0">
                {/* Optimized Print Area - A4 */}
                <div id="snapshot-print-area" className="bg-white relative" style={{ width: '794px', padding: '20px' }}>
                    {/* Compact Header */}
                    <div className="border-b-2 border-[#263238] pb-2 mb-3 flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-black text-[#C62828]">توصيل ون</h1>
                            <p className="text-xs text-[#607D8B] font-bold">مطابقة الصناديق اليومية</p>
                        </div>
                        <div className="text-right">
                            <div className="text-xl font-black text-[#263238]">#{snapshot.id.slice(-4)}</div>
                            <div className="text-sm font-bold text-[#607D8B]">{snapshot.date}</div>
                        </div>
                    </div>

                    {/* Compact Meta */}
                    <div className="grid grid-cols-2 gap-4 mb-3 text-xs">
                        <div>
                            <span className="text-slate-400 font-bold">الموظف: </span>
                            <span className="font-bold text-slate-900">{snapshot.user}</span>
                        </div>
                        <div className="text-right">
                            <span className="text-slate-400 font-bold">الوقت: </span>
                            <span className="font-bold font-mono text-slate-900">{snapshot.fullTimestamp}</span>
                        </div>
                    </div>

                    {/* Compact Currency Tables */}
                    <div className="space-y-3">
                        <SnapshotTable title="ريال قديم" items={snapshot.oldRiyalItems} totalVariance={snapshot.totalVarianceOld} />
                        <SnapshotTable title="ريال جديد" items={snapshot.newRiyalItems} totalVariance={snapshot.totalVarianceNew} />

                        {snapshot.sarItems && snapshot.sarItems.length > 0 && (
                            <SnapshotTable title="ريال سعودي" items={snapshot.sarItems} totalVariance={snapshot.totalVarianceSar} />
                        )}
                        {snapshot.blueUsdItems && snapshot.blueUsdItems.length > 0 && (
                            <SnapshotTable title="دولار أزرق" items={snapshot.blueUsdItems} totalVariance={snapshot.totalVarianceBlueUsd} />
                        )}
                        {snapshot.whiteUsdItems && snapshot.whiteUsdItems.length > 0 && (
                            <SnapshotTable title="دولار أبيض" items={snapshot.whiteUsdItems} totalVariance={snapshot.totalVarianceWhiteUsd} />
                        )}
                    </div>

                    {/* Compact Signature */}
                    <div className="mt-4 pt-2 text-center border-t border-dashed border-slate-300">
                        <p className="text-[8px] text-slate-400">Electronic ID: {snapshot.id} | نظام توصيل ون المالي</p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="bg-[#263238] p-4 flex justify-between items-center print:hidden">
                    <button onClick={() => setReportSnapshot(null)} className="text-slate-400 hover:text-white font-bold text-sm">إغلاق</button>
                    <div className="flex gap-3">
                        <button
                            onClick={downloadAsImage}
                            className="px-5 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold flex items-center gap-2 transition-colors">
                            <span className="material-symbols-outlined text-sm">image</span>
                            تنزيل كصورة عالية الجودة
                        </button>
                        <button
                            onClick={() => window.print()}
                            className="px-5 py-2 bg-[#4FC3F7] text-[#263238] rounded-lg font-bold flex items-center gap-2 hover:bg-[#29B6F6] transition-colors">
                            <span className="material-symbols-outlined text-sm">print</span>
                            طباعة
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Snapshot Table Helper - Compact A4 Optimized
const SnapshotTable = ({ title, items, totalVariance }: any) => (
    <div className="mb-2">
        <h4 className="font-black border-b-2 border-black mb-1 text-xs pb-0.5">{title}</h4>
        <table className="w-full text-right border-collapse" style={{ fontSize: '9px' }}>
            <thead>
                <tr className="bg-slate-900 text-white">
                    <th className="py-1 px-1 border border-slate-700" style={{ width: '5%' }}>#</th>
                    <th className="py-1 px-1 border border-slate-700" style={{ width: '20%' }}>الحساب</th>
                    <th className="py-1 px-1 border border-slate-700" style={{ width: '15%' }}>النظام</th>
                    <th className="py-1 px-1 border border-slate-700" style={{ width: '15%' }}>البنك</th>
                    <th className="py-1 px-1 border border-slate-700" style={{ width: '12%' }}>الفارق</th>
                    <th className="py-1 px-1 border border-slate-700" style={{ width: '23%' }}>ملاحظة</th>
                    <th className="py-1 px-1 border border-slate-700" style={{ width: '10%' }}>الوقت</th>
                </tr>
            </thead>
            <tbody>
                {items.map((i: any, idx: number) => (
                    <tr key={i.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="py-0.5 px-1 font-mono border border-slate-300">{idx + 1}</td>
                        <td className="py-0.5 px-1 font-bold border border-slate-300">{i.bankName}</td>
                        <td className="py-0.5 px-1 font-mono border border-slate-300">{i.sysBalance.toLocaleString()}</td>
                        <td className="py-0.5 px-1 font-mono border border-slate-300">{i.bankBalance.toLocaleString()}</td>
                        <td className={`py-0.5 px-1 font-mono font-bold border border-slate-300 ${i.variance !== 0 ? 'text-red-600' : 'text-green-600'}`}>{i.variance.toLocaleString()}</td>
                        <td className="py-0.5 px-1 border border-slate-300" style={{ fontSize: '8px' }}>{i.notes || '-'}</td>
                        <td className="py-0.5 px-1 font-mono border border-slate-300">{i.completedAt || '-'}</td>
                    </tr>
                ))}
            </tbody>
            <tfoot className="bg-amber-200 border-t-2 border-amber-600">
                <tr>
                    <td colSpan={2} className="py-1 px-1 font-black border border-slate-700">الإجمالي</td>
                    <td className="py-1 px-1 font-mono font-bold border border-slate-700">{items.reduce((a: number, b: any) => a + b.sysBalance, 0).toLocaleString()}</td>
                    <td className="py-1 px-1 font-mono font-bold border border-slate-700">{items.reduce((a: number, b: any) => a + b.bankBalance, 0).toLocaleString()}</td>
                    <td className={`py-1 px-1 font-mono font-black border border-slate-700 ${totalVariance === 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {totalVariance.toLocaleString()}
                    </td>
                    <td colSpan={2} className="border border-slate-700"></td>
                </tr>
            </tfoot>
        </table>
    </div>
);

export default FundsPage;