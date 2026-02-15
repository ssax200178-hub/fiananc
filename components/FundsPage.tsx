import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext, BankDefinition, FundLineItem, FundSnapshot, FundsCurrency } from '../AppContext';
import { generateId } from '../utils';

const FundsPage: React.FC = () => {
    const { currentUser, bankDefinitions, addBankDefinition, deleteBankDefinition, toggleBankDefinition, updateBankDefinition, fundSnapshots, saveFundSnapshot, deleteFundSnapshot, editFundSnapshot, isLoading, fundDraftItems, saveFundDraft, clearFundDraft } = useAppContext();

    // -- State --
    const [lineItems, setLineItems] = useState<FundLineItem[]>([]);
    const [isSessionInitialized, setIsSessionInitialized] = useState(false);

    // Tab State: 'local' or 'foreign'
    const [activeTab, setActiveTab] = useState<'local' | 'foreign'>('local');

    // Admin Modal State
    const [isAddBankModalOpen, setIsAddBankModalOpen] = useState(false);
    const [isManageBanksOpen, setIsManageBanksOpen] = useState(false); // New Manage Modal
    const [editingBankId, setEditingBankId] = useState<string | null>(null); // Track if editing

    const [newBankName, setNewBankName] = useState('');
    const [newBankCurrency, setNewBankCurrency] = useState<FundsCurrency>('old_riyal');
    const [newBankAccountNumber, setNewBankAccountNumber] = useState('');
    const [customCurrencyName, setCustomCurrencyName] = useState('');

    // Report/Snapshot Modal State
    const [reportSnapshot, setReportSnapshot] = useState<FundSnapshot | null>(null);

    // -- Initialization --
    useEffect(() => {
        // Priority: 1. Firestore draft, 2. localStorage draft, 3. Generate from bankDefinitions
        if (fundDraftItems && fundDraftItems.length > 0) {
            setLineItems(fundDraftItems);
        } else {
            const savedDraft = localStorage.getItem('funds_draft_v2');
            if (savedDraft) {
                setLineItems(JSON.parse(savedDraft));
            } else {
                // Only initialize if definitions are loaded
                if (bankDefinitions.length > 0) {
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
            }
        }
        setIsSessionInitialized(true);
    }, [bankDefinitions.length, fundDraftItems.length]); // Also re-init when draft loads

    // Sync active definitions with line items
    useEffect(() => {
        if (!isSessionInitialized || isLoading) return;

        setLineItems(currentItems => {
            // 1. Filter out items whose bank definition is deleted or inactive
            // CRITICAL FIX: Do NOT filter if bankDefinitions is empty (e.g. sync error or loading lag) 
            // This prevents wiping local data on a bad reload. Only filter if we have definitions.
            if (bankDefinitions.length === 0) return currentItems;

            const validItems = currentItems.filter(item => {
                const def = bankDefinitions.find(d => d.id === item.bankDefId);
                return def && def.isActive;
            });

            // 2. Add new active definitions
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
            saveFundDraft(lineItems); // Sync to Firebase (debounced)
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

    const handleDeleteLineItem = (id: string) => {
        if (!window.confirm('هل أنت متأكد من حذف هذا السطر من المسودة؟\n\nتنبيه: هذا الإجراء يحذف البيانات المسجلة في هذا السطر فقط.')) return;
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
    const handleFinalApproval = () => {
        // Filter items for the active tab
        const currentTabItems = activeTab === 'local'
            ? lineItems.filter(i => ['old_riyal', 'new_riyal'].includes(getCurrencyForDef(i.bankDefId) as any))
            : lineItems.filter(i => ['sar', 'blue_usd', 'white_usd', 'custom'].includes(getCurrencyForDef(i.bankDefId) as any));

        const incomplete = currentTabItems.filter(i => !i.isCompleted);
        if (incomplete.length > 0) {
            alert(`عذراً، يجب إتمام جميع الأسطر في هذا التبويب أولاً. يوجد ${incomplete.length} حسابات غير مكتملة.`);
            return;
        }

        const tabTitle = activeTab === 'local' ? 'العملات المحلية' : 'العملات الأجنبية';
        if (!window.confirm(`هل أنت متأكد من اعتماد وإغلاق مطابقة (${tabTitle}) بشكل نهائي؟\n\nتنبيه: لا يمكن التعديل بعد الاعتماد.`)) {
            return;
        }

        // Create snapshot for the current tab only
        const snapshot: FundSnapshot = {
            id: generateId(),
            date: new Date().toLocaleDateString('en-GB'),
            fullTimestamp: new Date().toLocaleString('ar-SA'),
            user: currentUser?.name || currentUser?.username || 'Unknown',
            type: activeTab,

            // Values for this tab
            oldRiyalItems: activeTab === 'local' ? lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'old_riyal') : [],
            newRiyalItems: activeTab === 'local' ? lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'new_riyal') : [],
            totalVarianceOld: activeTab === 'local' ? lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'old_riyal').reduce((acc, curr) => acc + curr.variance, 0) : 0,
            totalVarianceNew: activeTab === 'local' ? lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'new_riyal').reduce((acc, curr) => acc + curr.variance, 0) : 0,

            sarItems: activeTab === 'foreign' ? lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'sar') : [],
            blueUsdItems: activeTab === 'foreign' ? lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'blue_usd') : [],
            whiteUsdItems: activeTab === 'foreign' ? lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'white_usd') : [],
            customCurrencyItems: activeTab === 'foreign' ? lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'custom') : [],

            totalVarianceSar: activeTab === 'foreign' ? lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'sar').reduce((acc, curr) => acc + curr.variance, 0) : 0,
            totalVarianceBlueUsd: activeTab === 'foreign' ? lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'blue_usd').reduce((acc, curr) => acc + curr.variance, 0) : 0,
            totalVarianceWhiteUsd: activeTab === 'foreign' ? lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'white_usd').reduce((acc, curr) => acc + curr.variance, 0) : 0,
            totalVarianceCustom: activeTab === 'foreign' ? lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'custom').reduce((acc, curr) => acc + curr.variance, 0) : 0,

            status: 'approved',
            canEdit: false
        };

        saveFundSnapshot(snapshot);

        // Clear only the approved items from the draft
        const remainingItems = lineItems.map(item => {
            const isApproved = currentTabItems.find(ci => ci.id === item.id);
            if (isApproved) {
                // Reset this item
                return { ...item, sysBalance: 0, bankBalance: 0, variance: 0, notes: '', isCompleted: false, completedAt: undefined };
            }
            return item;
        });

        setLineItems(remainingItems);
        saveFundDraft(remainingItems);
        localStorage.setItem('funds_draft_v2', JSON.stringify(remainingItems));

        setReportSnapshot(snapshot);
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

    // Separated Items by Currency
    const unknownItems = lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'unknown');
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

            {/* Admin Actions */}
            {currentUser?.role === 'super_admin' && (
                <div className="flex justify-end gap-3">
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

const ReconRow = ({ item, idx, onUpdate, onToggleComplete, getAccountNumber, onDelete }: any) => {
    // Local string state to handle decimals precisely during typing
    const [sysVal, setSysVal] = useState(item.sysBalance.toString());
    const [bankVal, setBankVal] = useState(item.bankBalance.toString());

    // Sync local state if external item changes (e.g. on load or reset)
    useEffect(() => {
        setSysVal(item.sysBalance.toString());
    }, [item.sysBalance]);

    useEffect(() => {
        setBankVal(item.bankBalance.toString());
    }, [item.bankBalance]);

    const handleSysChange = (val: string) => {
        setSysVal(val);
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) {
            onUpdate(item.id, 'sysBalance', parsed);
        } else if (val === '') {
            onUpdate(item.id, 'sysBalance', 0);
        }
    };

    const handleBankChange = (val: string) => {
        setBankVal(val);
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) {
            onUpdate(item.id, 'bankBalance', parsed);
        } else if (val === '') {
            onUpdate(item.id, 'bankBalance', 0);
        }
    };

    return (
        <tr className={`${idx % 2 === 0 ? 'bg-white dark:bg-[#1e293b]' : 'bg-[#F5F5F5] dark:bg-[#1e293b]/50'} hover:bg-[#ECEFF1] dark:hover:bg-slate-700 transition-colors border-b border-slate-300`}>
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
                    step="any"
                    disabled={item.isCompleted}
                    value={sysVal}
                    onChange={e => handleSysChange(e.target.value)}
                    className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-green-500 outline-none font-mono font-bold disabled:text-slate-400 disabled:cursor-not-allowed"
                    placeholder="0"
                />
            </td>
            {/* Bank */}
            <td className="px-4 py-3 border border-slate-300">
                <input
                    type="number"
                    step="any"
                    disabled={item.isCompleted}
                    value={bankVal}
                    onChange={e => handleBankChange(e.target.value)}
                    className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-green-500 outline-none font-mono font-bold disabled:text-slate-400 disabled:cursor-not-allowed"
                    placeholder="0"
                />
            </td>
            {/* Variance */}
            <td className="px-4 py-3 border border-slate-300">
                <span className={`font-mono font-bold text-lg ${item.variance === 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.variance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
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
                <div className="flex items-center justify-center gap-2">
                    <button
                        onClick={() => onToggleComplete(item.id)}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${item.isCompleted
                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                            : 'bg-slate-800 text-white hover:bg-slate-700'
                            }`}
                    >
                        {item.isCompleted ? 'تعديل' : 'إتمام'}
                    </button>

                    {onDelete && (
                        <button
                            onClick={() => onDelete(item.id)}
                            className="p-1 bg-red-100 text-red-600 hover:bg-red-200 rounded-md transition-colors"
                            title="حذف من المسودة"
                        >
                            <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                    )}
                </div>
            </td>
            {/* Time */}
            <td className="px-4 py-3 text-center text-base font-bold font-mono text-slate-600 dark:text-slate-300 border border-slate-300">
                {item.completedAt || '-'}
            </td>
        </tr>
    );
};

// ReconTable Component with Enhanced Formatting
const ReconTable = ({ title, items, colorClass, onUpdate, onToggleComplete, getAccountNumber, onDelete }: any) => {
    const colorClasses = {
        green: { bg: 'bg-[#E8F5E9] dark:bg-emerald-900/20', text: 'text-[#2E7D32] dark:text-emerald-400' },
        blue: { bg: 'bg-[#E3F2FD] dark:bg-blue-900/20', text: 'text-[#1565C0] dark:text-blue-400' },
        yellow: { bg: 'bg-[#FFF9C4] dark:bg-yellow-900/20', text: 'text-[#F57F17] dark:text-yellow-400' },
        indigo: { bg: 'bg-[#E8EAF6] dark:bg-indigo-900/20', text: 'text-[#283593] dark:text-indigo-400' },
        gray: { bg: 'bg-[#ECEFF1] dark:bg-slate-900/20', text: 'text-[#455A64] dark:text-slate-400' },
        purple: { bg: 'bg-[#F3E5F5] dark:bg-purple-900/20', text: 'text-[#6A1B9A] dark:text-purple-400' },
        red: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400' }
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
                            />
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
                {fundSnapshots.slice(0, 6).map((snap: FundSnapshot) => (
                    <div
                        key={snap.id}
                        className="bg-white dark:bg-[#1e293b] p-6 rounded-xl border-2 border-slate-300 dark:border-slate-700 hover:border-[#C62828] dark:hover:border-[#C62828] transition-all group shadow-lg"
                    >
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono font-black text-xl text-[#263238] dark:text-white">{snap.date}</span>
                                    {snap.type && (
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${snap.type === 'local' ? 'bg-green-100 text-green-700' : snap.type === 'foreign' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {snap.type === 'local' ? 'محلي' : snap.type === 'foreign' ? 'أجنبي' : 'كامل'}
                                        </span>
                                    )}
                                </div>
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

// Report Modal Component (Optimized A4 Layout + Image Export)
// ... (Keeping ReportModal as is from previous file content, skipping to save space if irrelevant, but I need to include it for validity)
// I will include the existing ReportModal code to ensure the file is complete.

const ReportModal = ({ snapshot, setReportSnapshot }: any) => {
    const downloadAsImage = async () => {
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
            for (let si = 0; si < sections.length; si++) {
                const sec = sections[si];

                // Build table rows HTML
                const rowsHtml = sec.items.map((i: any, idx: number) => `
                    <tr style="background:${idx % 2 === 0 ? '#fff' : '#f8fafc'}; border-bottom:1px solid #e2e8f0;">
                        <td style="padding:10px 16px; font-weight:700; color:#1e293b; border-left:1px solid #e2e8f0;">${i.bankName}</td>
                        <td style="padding:10px 16px; font-family:monospace; font-weight:700; color:#475569; border-left:1px solid #e2e8f0;">${i.sysBalance.toLocaleString()}</td>
                        <td style="padding:10px 16px; font-family:monospace; font-weight:700; color:#475569; border-left:1px solid #e2e8f0;">${i.bankBalance.toLocaleString()}</td>
                        <td style="padding:10px 16px; font-family:monospace; font-weight:900; border-left:1px solid #e2e8f0; color:${i.variance !== 0 ? '#dc2626' : '#059669'}; background:${i.variance !== 0 ? '#fef2f2' : '#ecfdf5'};">${i.variance.toLocaleString()}</td>
                        <td style="padding:10px 16px; font-size:10px; color:#94a3b8; font-weight:700; font-style:italic; text-align:center;">${i.notes || '---'}</td>
                    </tr>
                `).join('');

                const totalSys = sec.items.reduce((a: number, b: any) => a + b.sysBalance, 0);
                const totalBank = sec.items.reduce((a: number, b: any) => a + b.bankBalance, 0);
                const bgColor = colorHeaderMap[sec.color] || '#263238';

                // Build each section's full standalone report HTML
                const reportHtml = `
                <div dir="rtl" style="width:1200px; background:#fff; padding:45px; font-family:'Noto Sans Arabic','Inter',sans-serif;">
                    <!-- Header -->
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #f1f5f9; padding-bottom:32px; margin-bottom:32px;">
                        <div style="display:flex; align-items:center; gap:24px;">
                            <div style="width:96px; height:96px; background:#fff; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,0.1); border:1px solid #f1f5f9; display:flex; align-items:center; justify-content:center; padding:12px;">
                                <img src="/logo.png" alt="Logo" style="width:100%; height:100%; object-fit:contain;" />
                            </div>
                            <div>
                                <h1 style="font-size:2.2rem; font-weight:900; color:#263238; margin:0 0 12px 0;">توصيل ون</h1>
                                <div style="display:flex; align-items:center; gap:10px; border-top:1px solid #f8fafc; padding-top:10px; margin-top:6px;">
                                    <span style="width:12px; height:12px; border-radius:50%; background:#C62828; box-shadow:0 0 10px rgba(198,40,40,0.4);"></span>
                                    <p style="font-size:13px; color:#64748b; font-weight:700; text-transform:uppercase; white-space:nowrap; margin:0;">الإدارة المالية | FINANCIAL DEPT</p>
                                </div>
                            </div>
                        </div>
                        <div style="text-align:left; background:#f8fafc; padding:24px; border-radius:24px; border:1px solid #f1f5f9; min-width:140px;">
                            <p style="font-size:10px; font-weight:900; color:#94a3b8; letter-spacing:2px; text-transform:uppercase; margin:0 0 8px 0;">Verification ID</p>
                            <div style="font-size:1.6rem; font-weight:900; color:#263238; font-family:monospace;">#${snapshot.id.slice(-4).toUpperCase()}</div>
                        </div>
                    </div>

                    <!-- Metadata Bar -->
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; margin-bottom:40px; background:#263238; overflow:hidden; border-radius:24px; box-shadow:0 10px 30px rgba(0,0,0,0.2); border:1px solid #1e293b;">
                        <div style="padding:24px; border-left:1px solid rgba(255,255,255,0.05); background:linear-gradient(135deg, rgba(255,255,255,0.1), transparent);">
                            <p style="color:#94a3b8; font-size:10px; font-weight:700; margin:0 0 4px 0; opacity:0.6;">نوع المطابقة / RECON TYPE</p>
                            <p style="color:#fff; font-weight:900; font-size:1.1rem; margin:0;">${snapshot.type === 'local' ? 'عملات محلية' : (snapshot.type === 'foreign' ? 'عملات أجنبية (USD)' : 'مطابقة كاملة')}</p>
                        </div>
                        <div style="padding:24px; border-left:1px solid rgba(255,255,255,0.05); background:linear-gradient(135deg, rgba(255,255,255,0.1), transparent);">
                            <p style="color:#94a3b8; font-size:10px; font-weight:700; margin:0 0 4px 0; opacity:0.6;">الموظف / AUTHORIZED BY</p>
                            <p style="color:#fff; font-weight:900; font-size:1.1rem; margin:0;">${snapshot.user}</p>
                        </div>
                        <div style="padding:24px; background:linear-gradient(135deg, rgba(255,255,255,0.1), transparent);">
                            <p style="color:#94a3b8; font-size:10px; font-weight:700; margin:0 0 4px 0; opacity:0.6;">التاريخ / GENERATED ON</p>
                            <p style="color:#fff; font-weight:900; font-size:1.1rem; margin:0; font-family:monospace; letter-spacing:-1px;">${snapshot.date}</p>
                        </div>
                    </div>

                    <!-- Currency Section Title -->
                    <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px; padding-top:10px;">
                        <div style="width:8px; height:32px; border-radius:8px; background:${bgColor}; box-shadow:0 4px 12px rgba(0,0,0,0.15);"></div>
                        <h4 style="font-weight:900; font-size:18px; color:#1e293b; margin:0;">${sec.title}</h4>
                    </div>

                    <!-- Table -->
                    <div style="overflow:hidden; border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
                        <table style="width:100%; text-align:right; border-collapse:collapse; font-size:12px;">
                            <thead>
                                <tr style="background:${bgColor}; color:#fff;">
                                    <th style="padding:16px; font-weight:900; font-size:11px; line-height:2; border-left:1px solid rgba(255,255,255,0.1);">اسم الحساب / ACCOUNT</th>
                                    <th style="padding:16px; font-weight:900; font-size:11px; line-height:2; border-left:1px solid rgba(255,255,255,0.1);">النظام / SYSTEM</th>
                                    <th style="padding:16px; font-weight:900; font-size:11px; line-height:2; border-left:1px solid rgba(255,255,255,0.1);">البنك / BANK</th>
                                    <th style="padding:16px; font-weight:900; font-size:11px; line-height:2; border-left:1px solid rgba(255,255,255,0.1);">الفارق / VARIANCE</th>
                                    <th style="padding:16px; font-weight:900; font-size:11px; line-height:2; text-align:center;">ملاحظات / NOTES</th>
                                </tr>
                            </thead>
                            <tbody>${rowsHtml}</tbody>
                            <tfoot style="background:#f1f5f9; border-top:2px solid #e2e8f0;">
                                <tr style="font-weight:900;">
                                    <td style="padding:20px 16px; color:#0f172a; border-left:1px solid #e2e8f0; font-size:11px; font-weight:900; line-height:2;">إجمالي الـصـنـدوق / TOTAL</td>
                                    <td style="padding:16px; font-family:monospace; color:#1e293b; background:rgba(255,255,255,0.5); border-left:1px solid #e2e8f0;">${totalSys.toLocaleString()}</td>
                                    <td style="padding:16px; font-family:monospace; color:#1e293b; background:rgba(255,255,255,0.5); border-left:1px solid #e2e8f0;">${totalBank.toLocaleString()}</td>
                                    <td colspan="2" style="padding:16px; font-family:monospace; color:${sec.totalVariance === 0 ? '#047857' : '#b91c1c'}; background:#fff; box-shadow:inset 0 2px 4px rgba(0,0,0,0.06); font-size:1.1rem;">${sec.totalVariance.toLocaleString()}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <!-- Footer -->
                    <div style="margin-top:60px; display:flex; justify-content:space-between; align-items:flex-end; border-top:2px solid #f8fafc; padding-top:40px;">
                        <div style="font-size:9px; color:#94a3b8; font-family:monospace; line-height:1.8;">
                            <p style="color:#1e293b; font-weight:700; font-size:10px; margin:0 0 12px 0;">SYSTEM AUTHENTICATION LOG:</p>
                            <p style="margin:0;">Transaction Node: TawseelOne Cloud Ledger</p>
                            <p style="margin:0;">Authentication Key: ${snapshot.id.toUpperCase()}</p>
                            <p style="margin:0;">Registration Time: ${snapshot.fullTimestamp}</p>
                            <p style="margin:0;">System Ver: 2.1 | Aesthetic Enhancement Patch</p>
                        </div>
                        <div style="text-align:center;">
                            <div style="width:96px; height:96px; border:1px solid #f1f5f9; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 8px; background:#f8fafc; box-shadow:inset 0 2px 4px rgba(0,0,0,0.05);">
                                <span class="material-symbols-outlined" style="color:#cbd5e1; font-size:48px;">verified_user</span>
                            </div>
                            <p style="font-size:9px; font-weight:900; color:#94a3b8; text-transform:uppercase; letter-spacing:3px; margin:0;">Official Seal</p>
                        </div>
                    </div>
                </div>`;

                // Create off-screen container
                const container = document.createElement('div');
                container.style.position = 'absolute';
                container.style.left = '-9999px';
                container.style.top = '0';
                container.style.width = '1200px';
                container.innerHTML = reportHtml;
                document.body.appendChild(container);

                // Wait for fonts and images to load
                await new Promise(resolve => setTimeout(resolve, 300));

                const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
                    scale: 2.5,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff',
                    allowTaint: true,
                    imageTimeout: 15000,
                });

                const link = document.createElement('a');
                link.download = `مطابقة-${sec.label}-${snapshot.date.replace(/\//g, '-')}.png`;
                link.href = canvas.toDataURL('image/png', 0.92);
                link.click();

                document.body.removeChild(container);

                // Small delay between downloads to prevent browser blocking
                if (si < sections.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        } catch (error) {
            console.error('Error generating image:', error);
            alert('حدث خطأ أثناء إنشاء الصورة. يرجى المحاولة مرة أخرى.');
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/95 backdrop-blur-md animate-fade-in" dir="rtl">
            <div className="flex min-h-full items-start justify-center p-4 py-12">
                <div className="bg-white text-slate-900 w-full max-w-4xl rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.5)] flex flex-col print:max-w-none print:my-0 border border-slate-200 relative">

                    {/* Optimized Print Area - Dynamic Width & Premium Branding */}
                    <div id="snapshot-print-area" className="bg-white relative mx-auto" style={{ width: '100%', maxWidth: '820px', padding: '45px' }} dir="rtl">

                        {/* Header: Official Branding */}
                        <div className="flex justify-between items-center border-b-2 border-slate-100 pb-8 mb-8">
                            <div className="flex items-center gap-6">
                                <div className="w-24 h-24 bg-white rounded-2xl shadow-xl border border-slate-100 flex items-center justify-center p-3 animate-fade-in">
                                    <img src="/logo.png" alt="Official Logo" className="w-full h-full object-contain" />
                                </div>
                                <div className="block">
                                    <h1 className="text-4xl font-black text-[#263238] leading-loose pb-4 mb-2">توصيل ون</h1>
                                    <div className="flex items-center gap-3 pt-2 mt-4 border-t border-slate-50">
                                        <span className="w-3 h-3 rounded-full bg-[#C62828] shadow-[0_0_10px_rgba(198,40,40,0.4)]"></span>
                                        <p className="text-[14px] text-slate-500 font-bold uppercase whitespace-nowrap">الإدارة المالية | FINANCIAL DEPT</p>
                                    </div>
                                </div>
                            </div>
                            <div className="text-left bg-slate-50 p-6 rounded-3xl border border-slate-100 min-w-[140px]">
                                <p className="text-[10px] font-black text-slate-400 mb-2 tracking-widest uppercase">Verification ID</p>
                                <div className="text-2xl font-black text-[#263238] font-mono leading-none">#{snapshot.id.slice(-4).toUpperCase()}</div>
                            </div>
                        </div>

                        {/* Premium Metadata Bar */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 mb-10 bg-[#263238] overflow-hidden rounded-3xl shadow-xl border border-slate-800">
                            <div className="p-6 border-b md:border-b-0 md:border-l border-white/5 bg-gradient-to-br from-white/10 to-transparent">
                                <p className="text-slate-400 text-[10px] font-bold mb-1 opacity-60">نوع المطابقة / RECON TYPE</p>
                                <p className="font-black text-white text-lg leading-tight uppercase">
                                    {snapshot.type === 'local' ? 'عملات محلية' : (snapshot.type === 'foreign' ? 'عملات أجنبية (USD)' : 'مطابقة كاملة')}
                                </p>
                            </div>
                            <div className="p-6 border-b md:border-b-0 md:border-l border-white/5 bg-gradient-to-br from-white/10 to-transparent">
                                <p className="text-slate-400 text-[10px] font-bold mb-1 opacity-60">الموظف / AUTHORIZED BY</p>
                                <p className="font-black text-white text-lg leading-tight">{snapshot.user}</p>
                            </div>
                            <div className="p-6 bg-gradient-to-br from-white/10 to-transparent">
                                <p className="text-slate-400 text-[10px] font-bold mb-1 opacity-60">التاريخ / GENERATED ON</p>
                                <p className="font-black text-white text-lg leading-tight font-mono tracking-tighter">{snapshot.date}</p>
                            </div>
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
                        <div className="mt-20 flex justify-between items-end border-t-2 border-slate-50 pt-10">
                            <div className="text-[9px] text-slate-400 font-mono space-y-1">
                                <p className="text-slate-800 font-bold text-[10px] mb-3">SYSTEM AUTHENTICATION LOG:</p>
                                <p>Transaction Node: TawseelOne Cloud Ledger</p>
                                <p>Authentication Key: {snapshot.id.toUpperCase()}</p>
                                <p>Registration Time: {snapshot.fullTimestamp}</p>
                                <p>System Ver: 2.1 | Aesthetic Enhancement Patch</p>
                            </div>
                            <div className="text-center">
                                <div className="w-28 h-28 border border-slate-100 rounded-full flex items-center justify-center mb-2 bg-[#f8fafc] shadow-inner relative group overflow-hidden">
                                    <span className="material-symbols-outlined text-slate-300 text-6xl group-hover:scale-110 transition-transform">verified_user</span>
                                    <div className="absolute inset-0 bg-blue-500 opacity-0 group-hover:opacity-5 transition-opacity"></div>
                                </div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[3px]">Official Seal</p>
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
                                onClick={downloadAsImage}
                                className="flex-1 md:flex-none px-12 py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black flex items-center justify-center gap-4 transition-all transform hover:-translate-y-1 active:scale-95 shadow-[0_15px_40px_rgba(16,185,129,0.3)]">
                                <span className="material-symbols-outlined text-2xl">image</span>
                                حفظ كصورة احترافية
                            </button>
                            <button
                                onClick={() => window.print()}
                                className="flex-1 md:flex-none px-12 py-5 bg-[#4FC3F7] hover:bg-[#29B6F6] text-[#263238] rounded-2xl font-black flex items-center justify-center gap-4 transition-all transform hover:-translate-y-1 active:scale-95 shadow-[0_15px_40px_rgba(79,195,247,0.3)]">
                                <span className="material-symbols-outlined text-2xl">print</span>
                                طباعة التقرير
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Snapshot Table Helper - Premium Design
const SnapshotTable = ({ title, items, totalVariance, color }: any) => {
    const colorMap: any = {
        green: 'border-emerald-600 bg-emerald-50 text-emerald-800',
        blue: 'border-blue-600 bg-blue-50 text-blue-800',
        yellow: 'border-amber-600 bg-amber-50 text-amber-800',
        indigo: 'border-indigo-600 bg-indigo-50 text-indigo-800',
        gray: 'border-slate-400 bg-slate-50 text-slate-800',
        purple: 'border-purple-600 bg-purple-50 text-purple-800'
    };

    const headerTheme: any = {
        green: 'bg-emerald-600',
        blue: 'bg-blue-600',
        yellow: 'bg-amber-600',
        indigo: 'bg-indigo-600',
        gray: 'bg-slate-600',
        purple: 'bg-purple-600'
    };

    return (
        <div className="mb-8 group">
            <div className="flex items-center gap-4 mb-4 pt-6">
                <div className={`w-2 h-8 rounded-full ${headerTheme[color] || 'bg-slate-800'} shadow-lg`}></div>
                <h4 className="font-black text-[18px] text-slate-800 leading-relaxed">{title}</h4>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm transition-shadow hover:shadow-md">
                <table className="w-full text-right border-collapse" style={{ fontSize: '12px' }}>
                    <thead>
                        <tr className={`${headerTheme[color] || 'bg-[#263238]'} text-white`}>
                            <th className="py-4 px-4 font-black text-[11px] leading-loose border-l border-white/10">اسم الحساب / ACCOUNT</th>
                            <th className="py-4 px-4 font-black text-[11px] leading-loose border-l border-white/10">النظام / SYSTEM</th>
                            <th className="py-4 px-4 font-black text-[11px] leading-loose border-l border-white/10">البنك / BANK</th>
                            <th className="py-4 px-4 font-black text-[11px] leading-loose border-l border-white/10">الفارق / VARIANCE</th>
                            <th className="py-4 px-4 font-black text-[11px] leading-loose text-center">ملاحظات / NOTES</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((i: any, idx: number) => (
                            <tr key={i.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} border-b border-slate-100 last:border-0 hover:bg-slate-100/30 transition-colors`}>
                                <td className="py-2.5 px-4 font-bold text-slate-800 border-l border-slate-100">{i.bankName}</td>
                                <td className="py-2.5 px-4 font-mono font-bold text-slate-600 border-l border-slate-100">{i.sysBalance.toLocaleString()}</td>
                                <td className="py-2.5 px-4 font-mono font-bold text-slate-600 border-l border-slate-100">{i.bankBalance.toLocaleString()}</td>
                                <td className={`py-2.5 px-4 font-mono font-black border-l border-slate-100 ${i.variance !== 0 ? 'text-red-600 bg-red-50/30' : 'text-emerald-600 bg-emerald-50/20'}`}>
                                    {i.variance.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-4 text-[10px] text-slate-400 font-bold italic text-center leading-tight">{i.notes || '---'}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-100/80 border-t-2 border-slate-200">
                        <tr className="font-black">
                            <td className="py-5 px-4 text-slate-900 border-l border-slate-200 text-[11px] font-black leading-loose">إجمالي الـصـنـدوق / TOTAL</td>
                            <td className="py-4 px-4 font-mono text-slate-800 bg-white/50 border-l border-slate-200">{items.reduce((a: number, b: any) => a + b.sysBalance, 0).toLocaleString()}</td>
                            <td className="py-4 px-4 font-mono text-slate-800 bg-white/50 border-l border-slate-200">{items.reduce((a: number, b: any) => a + b.bankBalance, 0).toLocaleString()}</td>
                            <td className={`py-4 px-4 font-mono ${totalVariance === 0 ? 'text-emerald-700' : 'text-red-700'} bg-white shadow-inner text-lg`} colSpan={2}>
                                {totalVariance.toLocaleString()}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default FundsPage;