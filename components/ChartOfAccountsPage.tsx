import React, { useState, useMemo } from 'react';
import { useAppContext } from '../AppContext';
import * as XLSX from 'xlsx';
import { confirmDialog } from '../utils/confirm';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, ColDef } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

interface ChartAccount {
    id: string;
    accountNumber: string;
    accountName: string;
    accountType: 'main' | 'sub';
    parentAccountNumber?: string;
    parentAccountName?: string;
    category?: string;
    accountNature?: string;
    currency?: string;
    mainCategory?: string;
    branch?: string;
    isActive: boolean;
    createdAt: string;
    createdBy: string;
}

const IMPORT_TYPES = [
    { key: 'main', label: 'الحسابات الرئيسية والفرعية', icon: 'account_tree', color: 'blue', columns: 6, parentAccount: '', category: 'عام' },
    { key: 'restaurants', label: 'تحليلية المطاعم', icon: 'restaurant', color: 'amber', columns: 3, parentAccount: '2000', category: 'مطاعم' },
    { key: 'drivers', label: 'تحليلية الموصلين', icon: 'delivery_dining', color: 'emerald', columns: 3, parentAccount: '3000', category: 'موصلين' },
    { key: 'customers', label: 'تحليلية العملاء', icon: 'people', color: 'purple', columns: 3, parentAccount: '4000', category: 'عملاء' },
    { key: 'employees', label: 'تحليلية الموظفين', icon: 'badge', color: 'rose', columns: 3, parentAccount: '25000', category: 'موظفين' },
    { key: 'assets', label: 'تحليلية الأصول', icon: 'business', color: 'slate', columns: 3, parentAccount: '30000', category: 'أصول' },
];

const CATEGORIES = ['عام', 'مطاعم', 'موصلين', 'عملاء', 'موظفين', 'أصول', 'بنوك', 'هواتف', 'مصروفات', 'إيرادات', 'أخرى'];

const ChartOfAccountsPage: React.FC = () => {
    const { currentUser, addLog } = useAppContext();
    const { chartAccounts, addChartAccount, addChartAccountsBulk, updateChartAccount, deleteChartAccount, deleteChartAccountsBulk } = useAppContext() as any;

    const isSuperAdmin = currentUser?.role === 'super_admin';
    const canManage = isSuperAdmin || currentUser?.permissions?.includes('journal_entries_manage') || currentUser?.permissions?.includes('chart_of_accounts_manage');

    // UI States
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'main' | 'sub'>('all');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterBranch, setFilterBranch] = useState('all');
    const [filterParent, setFilterParent] = useState('all');
    const [filterNature, setFilterNature] = useState('all');
    const [filterCurrency, setFilterCurrency] = useState('all');
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

    const [showAddModal, setShowAddModal] = useState(false);
    const [editingAccount, setEditingAccount] = useState<ChartAccount | null>(null);
    const [selectedAccount, setSelectedAccount] = useState<ChartAccount | null>(null);

    // Grid States
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [gridApi, setGridApi] = useState<any>(null);

    // Import states
    const [importData, setImportData] = useState<any[]>([]);
    const [showImportPreview, setShowImportPreview] = useState(false);
    const [importing, setImporting] = useState(false);

    // Form states
    const [formAccountNumber, setFormAccountNumber] = useState('');
    const [formAccountName, setFormAccountName] = useState('');
    const [formAccountType, setFormAccountType] = useState<'main' | 'sub'>('main');
    const [formParentAccountNumber, setFormParentAccountNumber] = useState('');
    const [formCategory, setFormCategory] = useState('عام');
    const [formBranch, setFormBranch] = useState('');
    const [formAccountNature, setFormAccountNature] = useState('');
    const [formCurrency, setFormCurrency] = useState('');

    const accounts: ChartAccount[] = chartAccounts || [];
    const mainAccounts = useMemo(() => accounts.filter(a => a.accountType === 'main'), [accounts]);
    const branches = useMemo(() => Array.from(new Set(accounts.filter(a => a.branch).map(a => a.branch!))), [accounts]);
    const natures = useMemo(() => Array.from(new Set(accounts.filter(a => a.accountNature).map(a => a.accountNature!))), [accounts]);
    const currencies = useMemo(() => Array.from(new Set(accounts.filter(a => a.currency).map(a => a.currency!))), [accounts]);

    const activeFilterCount = useMemo(() => {
        let c = 0;
        if (filterType !== 'all') c++;
        if (filterCategory !== 'all') c++;
        if (filterBranch !== 'all') c++;
        if (filterParent !== 'all') c++;
        if (filterNature !== 'all') c++;
        if (filterCurrency !== 'all') c++;
        if (filterStatus !== 'all') c++;
        if (search.trim()) c++;
        return c;
    }, [filterType, filterCategory, filterBranch, filterParent, filterNature, filterCurrency, filterStatus, search]);

    const resetFilters = () => {
        setSearch(''); setFilterType('all'); setFilterCategory('all');
        setFilterBranch('all'); setFilterParent('all'); setFilterNature('all');
        setFilterCurrency('all'); setFilterStatus('all');
    };

    const filteredAccounts = useMemo(() => {
        let filtered = accounts;
        if (filterType !== 'all') filtered = filtered.filter(a => a.accountType === filterType);
        if (filterCategory !== 'all') filtered = filtered.filter(a => a.category === filterCategory);
        if (filterBranch !== 'all') filtered = filtered.filter(a => a.branch === filterBranch);
        if (filterParent !== 'all') filtered = filtered.filter(a => a.parentAccountNumber === filterParent);
        if (filterNature !== 'all') filtered = filtered.filter(a => a.accountNature === filterNature);
        if (filterCurrency !== 'all') filtered = filtered.filter(a => a.currency === filterCurrency);
        if (filterStatus !== 'all') filtered = filtered.filter(a => filterStatus === 'active' ? a.isActive : !a.isActive);
        if (search.trim()) {
            const s = search.trim().toLowerCase();
            filtered = filtered.filter(a =>
                a.accountNumber.includes(s) || a.accountName.toLowerCase().includes(s) ||
                (a.category || '').toLowerCase().includes(s) || (a.branch || '').toLowerCase().includes(s)
            );
        }
        return filtered.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
    }, [accounts, filterType, filterCategory, filterBranch, filterParent, filterNature, filterCurrency, filterStatus, search]);

    const resetForm = () => {
        setFormAccountNumber(''); setFormAccountName(''); setFormAccountType('main');
        setFormParentAccountNumber(''); setFormCategory('عام'); setFormBranch('');
        setFormAccountNature(''); setFormCurrency(''); setEditingAccount(null);
    };

    const handleSave = async () => {
        if (!formAccountNumber.trim() || !formAccountName.trim()) return alert('يرجى تعبئة رقم الحساب واسم الحساب');
        try {
            const data: any = {
                accountNumber: formAccountNumber.trim(), accountName: formAccountName.trim(),
                accountType: formAccountType, parentAccountNumber: formAccountType === 'sub' ? formParentAccountNumber.trim() : '',
                category: formCategory, branch: formBranch, accountNature: formAccountNature, currency: formCurrency,
            };
            if (editingAccount) {
                await updateChartAccount(editingAccount.id, data);
            } else {
                await addChartAccount(data);
            }
            setShowAddModal(false); resetForm();
        } catch (err) { console.error(err); alert('حدث خطأ أثناء الحفظ'); }
    };

    const handleDeleteBulk = async () => {
        if (selectedIds.length === 0) return;
        if (!(await confirmDialog(`هل أنت متأكد من حذف ${selectedIds.length} حساب؟`, { type: 'danger' }))) return;
        try {
            await deleteChartAccountsBulk(selectedIds);
            addLog('حذف جماعي', `تم حذف ${selectedIds.length} حساب من دليل الحسابات`, 'general');
            setSelectedIds([]);
        } catch (err) { console.error(err); alert('حدث خطأ أثناء الحذف'); }
    };

    const columnDefs: ColDef[] = [
        { 
            field: 'accountNumber', 
            headerName: 'رقم الحساب', 
            minWidth: 140,
            cellRenderer: (p: any) => (
                <div className="flex items-center h-full">
                    <span className="font-mono text-sm font-black text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200/60 dark:border-slate-700/60">{p.value}</span>
                </div>
            )
        },
        { 
            field: 'accountName', 
            headerName: 'اسم الحساب', 
            flex: 2, 
            minWidth: 200,
            cellRenderer: (p: any) => (
                <div className="flex items-center h-full">
                    <span className="font-bold text-slate-800 dark:text-slate-100">{p.value}</span>
                </div>
            )
        },
        { 
            field: 'accountType', 
            headerName: 'النوع',
            minWidth: 120,
            cellRenderer: (p: any) => (
                <div className="flex items-center h-full">
                    <span className={`px-3 py-1.5 rounded-lg text-[11px] font-black tracking-wide ${
                        p.value === 'main' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800/50' : 'bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/50'
                    }`}>
                        {p.value === 'main' ? 'رئيسي' : 'تحليلي'}
                    </span>
                </div>
            )
        },
        { field: 'category', headerName: 'التصنيف', minWidth: 120, cellRenderer: (p: any) => <span className="text-slate-600 dark:text-slate-400 font-bold text-sm flex items-center h-full">{p.value || '-'}</span> },
        { field: 'branch', headerName: 'الفرع', minWidth: 120, cellRenderer: (p: any) => <span className="text-slate-600 dark:text-slate-400 font-bold text-sm flex items-center h-full">{p.value || '-'}</span> },
        { field: 'parentAccountNumber', headerName: 'الرئيسي', minWidth: 130, cellRenderer: (p: any) => <span className="font-mono text-sm font-bold text-slate-500 dark:text-slate-400 flex items-center h-full">{p.value || '-'}</span> },
        {
            headerName: 'إجراءات',
            width: 130,
            sortable: false,
            filter: false,
            pinned: 'left',
            cellRenderer: (params: any) => (
                <div className="flex items-center gap-1.5 h-full">
                    <button onClick={() => setSelectedAccount(params.data)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-all" title="عرض التفاصيل">
                        <span className="material-symbols-outlined text-[18px]">visibility</span>
                    </button>
                    <button onClick={() => { setEditingAccount(params.data); handleOpenEdit(params.data); }} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl transition-all" title="تعديل">
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button onClick={() => handleDelete(params.data)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all" title="حذف">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
            )
        }
    ];

    const handleOpenEdit = (account: ChartAccount) => {
        setFormAccountNumber(account.accountNumber); setFormAccountName(account.accountName);
        setFormAccountType(account.accountType); setFormParentAccountNumber(account.parentAccountNumber || '');
        setFormCategory(account.category || 'عام'); setFormBranch(account.branch || '');
        setFormAccountNature(account.accountNature || ''); setFormCurrency(account.currency || '');
        setEditingAccount(account); setShowAddModal(true);
    };

    const handleDelete = async (account: ChartAccount) => {
        if (!(await confirmDialog(`حذف ${account.accountName}؟`, { type: 'danger' }))) return;
        await deleteChartAccount(account.id);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, importKey: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const config = IMPORT_TYPES.find(t => t.key === importKey)!;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const wb = XLSX.read(evt.target?.result, { type: 'binary' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const jsonData: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });
            const rows = jsonData.slice(1).filter((r: any[]) => r.some(c => c !== undefined && c !== ''));
            let parsed: any[];
            if (importKey === 'main') {
                parsed = rows.map(row => ({
                    accountNumber: String(row[0] || '').trim(), accountName: String(row[1] || '').trim(),
                    accountType: String(row[5] || '').trim() ? 'sub' : 'main', parentAccountName: String(row[5] || '').trim(),
                    accountNature: String(row[2] || '').trim(), currency: String(row[3] || '').trim(),
                    mainCategory: String(row[4] || '').trim(), category: 'عام'
                }));
            } else {
                parsed = rows.map(row => ({
                    accountNumber: String(row[0] || '').trim(), accountName: String(row[1] || '').trim(),
                    branch: String(row[2] || '').trim(), accountType: 'sub', parentAccountNumber: config.parentAccount, category: config.category
                }));
            }
            setImportData(parsed.filter(p => p.accountName));
            setShowImportPreview(true);
        };
        reader.readAsBinaryString(file);
        e.target.value = '';
    };

    const handleImportConfirm = async () => {
        setImporting(true);
        const nameMap: any = {};
        accounts.forEach(a => nameMap[a.accountName] = a.accountNumber);
        importData.forEach(a => nameMap[a.accountName] = a.accountNumber);
        
        const final = importData.map(a => ({
            ...a,
            parentAccountNumber: a.parentAccountName ? (nameMap[a.parentAccountName] || '') : a.parentAccountNumber
        }));
        await addChartAccountsBulk(final);
        setShowImportPreview(false);
        setImporting(false);
    };

    if (!canManage) return (
        <div className="flex items-center justify-center min-h-[60vh] p-8">
            <div className="text-center space-y-4">
                <span className="material-symbols-outlined text-6xl text-slate-300">lock</span>
                <h2 className="text-xl font-bold text-slate-600">عذراً، صلاحياتك غير كافية للوصول إلى هذه الصفحة</h2>
            </div>
        </div>
    );

    return (
        <div className="p-4 md:p-8 md:pt-6 space-y-6 max-w-7xl mx-auto animate-fade-in" dir="rtl">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 w-full relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 dark:bg-indigo-900/10 rounded-full blur-3xl -z-10 -translate-y-1/2 translate-x-1/2"></div>
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none text-white relative">
                        <span className="material-symbols-outlined text-3xl font-light">account_tree</span>
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/20 to-transparent rounded-b-2xl"></div>
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">دليل الحسابات</h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-bold mt-1">مركز الإدارة الشاملة للحسابات والتقارير المالية</p>
                    </div>
                </div>
                <div className="w-full md:w-auto">
                    <button 
                        onClick={() => { resetForm(); setShowAddModal(true); }} 
                        className="w-full md:w-auto px-6 py-3.5 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-slate-300 dark:shadow-indigo-900/20 active:scale-95 transition-all"
                    >
                        <span className="material-symbols-outlined text-[20px]">add</span>
                        إضافة حساب جديد
                    </button>
                </div>
            </div>

            {/* Category Quick Filters & Import Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {IMPORT_TYPES.map(t => {
                    const isActive = filterCategory === t.category;
                    return (
                        <div 
                            key={t.key} 
                            onClick={() => setFilterCategory(isActive ? 'all' : t.category)}
                            className={`p-3 rounded-2xl cursor-pointer flex justify-between items-center transition-all group shadow-sm hover:shadow-md border ${isActive ? `bg-${t.color}-50 dark:bg-${t.color}-900/20 border-${t.color}-300 dark:border-${t.color}-700 ring-1 ring-${t.color}-400/50` : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80'}`}
                        >
                            <div className="flex gap-2.5 items-center">
                                <div className={`w-10 h-10 rounded-xl bg-${t.color}-50 dark:bg-${t.color}-900/20 text-${t.color}-600 dark:text-${t.color}-400 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform ${isActive ? 'shadow-sm' : ''}`}>
                                    <span className="material-symbols-outlined text-[20px]">{t.icon}</span>
                                </div>
                                <span className={`text-xs ml-1 md:ml-0 font-black leading-tight select-none ${isActive ? `text-${t.color}-800 dark:text-${t.color}-200` : 'text-slate-700 dark:text-slate-300'}`}>{t.label}</span>
                            </div>
                            
                            <label className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer transition-colors" title={`استيراد ${t.label}`} onClick={e => e.stopPropagation()}>
                                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                                <input type="file" className="hidden" onClick={e => e.stopPropagation()} onChange={e => { e.stopPropagation(); handleFileUpload(e, t.key); }} />
                            </label>
                        </div>
                    );
                })}
            </div>

            {/* Standard Filters */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 space-y-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[18px]">filter_list</span>
                        </div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">تصفية وبحث متقدم</h3>
                    </div>
                    {activeFilterCount > 0 && (
                        <button onClick={resetFilters} className="text-[11px] font-black text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 active:scale-95">
                            <span className="material-symbols-outlined text-[14px]">close</span> مسح الفلاتر ({activeFilterCount})
                        </button>
                    )}
                </div>
                
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[280px]">
                        <div className="relative">
                            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                <span className="material-symbols-outlined text-slate-400">search</span>
                            </div>
                            <input 
                                value={search} onChange={e => setSearch(e.target.value)} 
                                placeholder="بحث بالرقم أو الاسم أو الفرع..." 
                                className="w-full pl-4 pr-11 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:text-white transition-shadow outline-none placeholder:text-slate-400 placeholder:font-medium" 
                            />
                        </div>
                    </div>
                    
                    <div className="w-32">
                        <select value={filterType} onChange={e => setFilterType(e.target.value as any)} className="w-full py-3 px-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
                            <option value="all">النوع: الكل</option>
                            <option value="main">رئيسي</option>
                            <option value="sub">تحليلي</option>
                        </select>
                    </div>
                    <div className="w-32">
                        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full py-3 px-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
                            <option value="all">التصنيف: الكل</option>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="w-32">
                        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="w-full py-3 px-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
                            <option value="all">الفرع: الكل</option>
                            {branches.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </div>
                    <div className="w-32">
                        <select value={filterParent} onChange={e => setFilterParent(e.target.value)} className="w-full py-3 px-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
                            <option value="all">الرئيسي: الكل</option>
                            {mainAccounts.map(a => <option key={a.id} value={a.accountNumber}>{a.accountNumber}</option>)}
                        </select>
                    </div>
                    <div className="w-32">
                        <select value={filterNature} onChange={e => setFilterNature(e.target.value)} className="w-full py-3 px-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
                            <option value="all">الطبيعة: الكل</option>
                            {natures.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                    <div className="w-32">
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="w-full py-3 px-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
                            <option value="all">الحالة: الكل</option>
                            <option value="active">فعال</option>
                            <option value="inactive">غير فعال</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Data Grid Container */}
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col relative z-0">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-transparent">
                    <h3 className="font-black text-slate-800 dark:text-slate-200 text-base">سجل الحسابات</h3>
                    <div className="px-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-500 dark:text-slate-400">
                        يعرض {filteredAccounts.length} حساب
                    </div>
                </div>
                <div className="h-[650px] w-full ag-theme-quartz" dir="rtl">
                    <AgGridReact
                        rowData={filteredAccounts}
                        columnDefs={columnDefs}
                        rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true }}
                        selectionColumnDef={{ pinned: 'right', width: 50 }}
                        onSelectionChanged={e => setSelectedIds(e.api.getSelectedRows().map((r: any) => r.id))}
                        onGridReady={p => {
                            setGridApi(p.api);
                            p.api.sizeColumnsToFit();
                        }}
                        animateRows={true}
                        pagination={true}
                        paginationPageSize={100}
                        enableRtl={true}
                        rowHeight={55}
                        headerHeight={48}
                        defaultColDef={{
                            sortable: true,
                            filter: true,
                            resizable: true,
                        }}
                    />
                </div>
            </div>

            {/* Floating Bulk Action Bar */}
            {selectedIds.length > 0 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[80] px-6 py-3.5 bg-slate-900 dark:bg-slate-800 rounded-2xl flex items-center gap-4 shadow-2xl border border-white/10 animate-slide-up">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white">
                            <span className="material-symbols-outlined text-[16px]">check</span>
                        </div>
                        <span className="font-black text-sm text-white">
                            {selectedIds.length} حساب محدد
                        </span>
                    </div>
                    
                    <div className="w-px h-6 bg-slate-700 mx-2"></div>
                    
                    <button onClick={() => { setSelectedIds([]); gridApi?.deselectAll(); }} className="text-xs font-bold text-slate-400 hover:text-white transition-colors">
                        إلغاء التحديد
                    </button>
                    
                    <button onClick={handleDeleteBulk} className="px-5 py-2.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all ml-2 shadow-lg shadow-red-500/20 active:scale-95">
                        <span className="material-symbols-outlined text-[16px]">delete_sweep</span> 
                        حذف المحدد
                    </button>
                </div>
            )}

            {/* Sidebar Details Drawer */}
            {selectedAccount && (<>
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[99] animate-fade-in" onClick={() => setSelectedAccount(null)}></div>
                <div className="fixed inset-y-0 left-0 w-[420px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl shadow-2xl z-[100] flex flex-col drawer-animate border-r border-slate-200/50 dark:border-slate-700/50">
                    
                    {/* Drawer Header */}
                    <div className="px-6 py-5 border-b border-slate-200/50 dark:border-slate-700/50 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 backdrop-blur-md">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                                <span className="material-symbols-outlined">receipt_long</span>
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-slate-800">تفاصيل الحساب</h2>
                                <p className="text-xs text-slate-500 font-medium">بطاقة معلومات الحساب المالية</p>
                            </div>
                        </div>
                        <button onClick={() => setSelectedAccount(null)} className="p-2 hover:bg-slate-200 text-slate-500 rounded-full transition-colors">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* Drawer Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                        {/* Highlights */}
                        <div className="p-5 bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-24 h-24 bg-white/40 blur-2xl rounded-full -translate-x-1/2 -translate-y-1/2"></div>
                            <div className="relative z-10 flex flex-col gap-1">
                                <p className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">رقم الحساب</p>
                                <p className="text-3xl font-black text-indigo-700 font-mono tracking-wider">{selectedAccount.accountNumber}</p>
                                <p className="text-lg font-bold text-slate-800 mt-2">{selectedAccount.accountName}</p>
                            </div>
                        </div>

                        {/* Details Grid */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <span className="material-symbols-outlined text-slate-400 text-sm">info</span> المعلومات الأساسية
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                                    <p className="text-[10px] font-bold text-slate-400 mb-1">النوع</p>
                                    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold ${selectedAccount.accountType === 'main' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {selectedAccount.accountType === 'main' ? 'رئيسي' : 'تحليلي'}
                                    </span>
                                </div>
                                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                                    <p className="text-[10px] font-bold text-slate-400 mb-1">التصنيف</p>
                                    <p className="font-bold text-sm text-slate-700">{selectedAccount.category || 'عام'}</p>
                                </div>
                                
                                {selectedAccount.accountNature && (
                                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                                        <p className="text-[10px] font-bold text-slate-400 mb-1">طبيعة الحساب</p>
                                        <p className="font-bold text-sm text-slate-700">{selectedAccount.accountNature}</p>
                                    </div>
                                )}
                                
                                {selectedAccount.currency && (
                                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                                        <p className="text-[10px] font-bold text-slate-400 mb-1">العملة</p>
                                        <p className="font-bold text-sm text-slate-700">{selectedAccount.currency}</p>
                                    </div>
                                )}
                                
                                {selectedAccount.branch && (
                                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                                        <p className="text-[10px] font-bold text-slate-400 mb-1">الفرع</p>
                                        <p className="font-bold text-sm text-slate-700">{selectedAccount.branch}</p>
                                    </div>
                                )}
                                
                                {selectedAccount.parentAccountNumber && (
                                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl col-span-2 flex justify-between items-center">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 mb-1">يتبع للحساب الرئيسي</p>
                                            <p className="font-bold text-sm text-slate-700">{selectedAccount.parentAccountName || 'غير متوفر'}</p>
                                        </div>
                                        <span className="font-mono text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                                            {selectedAccount.parentAccountNumber}
                                        </span>
                                    </div>
                                )}
                                
                                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                                    <p className="text-[10px] font-bold text-slate-400 mb-1">الحالة</p>
                                    <div className="flex items-center gap-1.5">
                                        <div className={`w-2 h-2 rounded-full ${selectedAccount.isActive !== false ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                        <p className="font-bold text-sm text-slate-700">{selectedAccount.isActive !== false ? 'نشط وفعال' : 'غير فعال'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sub Accounts List */}
                        {selectedAccount.accountType === 'main' && (
                            <div className="space-y-3 pt-2">
                                <h3 className="text-sm font-bold text-slate-800 flex justify-between items-center border-b border-slate-100 pb-2">
                                    <span className="flex items-center gap-2"><span className="material-symbols-outlined text-slate-400 text-sm">subdirectory_arrow_left</span> الحسابات التحليلية التابعة</span>
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs">{accounts.filter(a => a.parentAccountNumber === selectedAccount.accountNumber).length}</span>
                                </h3>
                                <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                                    {accounts.filter(a => a.parentAccountNumber === selectedAccount.accountNumber).map(sub => (
                                        <div key={sub.id} className="flex justify-between items-center p-3 bg-white border border-slate-100 hover:border-indigo-200 hover:shadow-md rounded-xl cursor-pointer group transition-all" onClick={() => setSelectedAccount(sub)}>
                                            <span className="text-sm font-bold text-slate-700 group-hover:text-indigo-700 transition-colors">{sub.accountName}</span>
                                            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded opacity-60 group-hover:opacity-100 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">{sub.accountNumber}</span>
                                        </div>
                                    ))}
                                    {accounts.filter(a => a.parentAccountNumber === selectedAccount.accountNumber).length === 0 && (
                                        <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl">
                                            <span className="material-symbols-outlined text-3xl text-slate-300 mb-2">account_tree</span>
                                            <p className="text-sm text-slate-500 font-medium">لا توجد حسابات فرعية مسجلة</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Drawer Footer Actions */}
                    <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
                        <button onClick={() => { handleOpenEdit(selectedAccount); setSelectedAccount(null); }} className="flex-1 py-3 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 shadow-sm rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all">
                            <span className="material-symbols-outlined text-sm">edit</span> تعديل البيانات
                        </button>
                        <button onClick={async () => { await handleDelete(selectedAccount); setSelectedAccount(null); }} className="py-3 px-5 bg-white border border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-sm">
                            <span className="material-symbols-outlined text-sm">delete</span> حذف
                        </button>
                    </div>
                </div>
            </>)}

            {/* Premium Add/Edit Modal */}
            {showAddModal && (
                 <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" dir="rtl">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl modal-animate border border-slate-100">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                            <div>
                                <h2 className="text-xl font-black text-slate-800">{editingAccount ? 'تعديل بيانات الحساب' : 'إضافة حساب جديد'}</h2>
                                <p className="text-xs text-slate-500 mt-1">قم بتعبئة التفاصيل المطلوبة لإدراج الحساب بالدليل</p>
                            </div>
                            <button onClick={() => setShowAddModal(false)} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors flex items-center justify-center">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                        
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 ml-1">رقم الحساب <span className="text-red-500">*</span></label>
                                    <input value={formAccountNumber} onChange={e => setFormAccountNumber(e.target.value)} placeholder="مثال: 101" className="premium-input w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm font-mono" />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 ml-1">نوع الحساب <span className="text-red-500">*</span></label>
                                    <select value={formAccountType} onChange={e => setFormAccountType(e.target.value as any)} className="premium-input w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm">
                                        <option value="main">رئيسي (تجميعي)</option>
                                        <option value="sub">تحليلي (فرعي)</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 mb-1.5 ml-1">اسم الحساب <span className="text-red-500">*</span></label>
                                <input value={formAccountName} onChange={e => setFormAccountName(e.target.value)} placeholder="أدخل اسم الحساب كاملاً" className="premium-input w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm" />
                            </div>

                            {formAccountType === 'sub' && (
                                <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                                    <label className="block text-[11px] font-bold text-indigo-700 mb-1.5 ml-1">الحساب الرئيسي المرتبط <span className="text-red-500">*</span></label>
                                    <select value={formParentAccountNumber} onChange={e => setFormParentAccountNumber(e.target.value)} className="premium-input w-full p-3 bg-white border border-indigo-200 rounded-xl font-bold text-sm text-indigo-900">
                                        <option value="">-- يرجى اختيار الحساب الأب --</option>
                                        {mainAccounts.map(a => <option key={a.id} value={a.accountNumber}>{a.accountNumber} - {a.accountName}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 ml-1">تصنيف القائمة</label>
                                    <select value={formCategory} onChange={e => setFormCategory(e.target.value)} className="premium-input w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm">
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 ml-1">ارتباط بفرع</label>
                                    <select value={formBranch} onChange={e => setFormBranch(e.target.value)} className="premium-input w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm">
                                        <option value="">عام (كل الفروع)</option>
                                        {branches.filter(b=>b).map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 flex gap-3">
                            <button onClick={() => setShowAddModal(false)} className="px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-colors">إلغاء</button>
                            <button onClick={handleSave} className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-indigo-200 transition-all flex justify-center items-center gap-2">
                                <span className="material-symbols-outlined text-sm">save</span> حـفـظ التعديلات
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Premium Import Preview Modal */}
            {showImportPreview && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" dir="rtl">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-4xl shadow-2xl modal-animate flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-emerald-500">upload_file</span>
                                    معاينة البيانات المستوردة
                                </h2>
                                <p className="text-sm mt-1 font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full inline-block">
                                    تم استخراج <span className="font-black">{importData.length}</span> حساب بنجاح
                                </p>
                            </div>
                            <button onClick={() => setShowImportPreview(false)} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors flex items-center justify-center">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-auto border border-slate-200 rounded-2xl bg-slate-50 p-1 mb-6 thin-scrollbar">
                            <table className="w-full text-sm text-right">
                                <thead className="bg-white sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="p-3.5 text-xs font-black text-slate-500 uppercase tracking-wider rounded-tr-xl">رقم الحساب</th>
                                        <th className="p-3.5 text-xs font-black text-slate-500 uppercase tracking-wider">اسم الحساب</th>
                                        <th className="p-3.5 text-xs font-black text-slate-500 uppercase tracking-wider text-center">النوع</th>
                                        <th className="p-3.5 text-xs font-black text-slate-500 uppercase tracking-wider rounded-tl-xl">المرجع/الرئيسي</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {importData.slice(0, 50).map((r, i) => (
                                        <tr key={i} className="border-b border-slate-100 hover:bg-indigo-50/50 transition-colors bg-white">
                                            <td className="p-3 font-mono font-bold text-slate-700">{r.accountNumber}</td>
                                            <td className="p-3 font-bold text-slate-900">{r.accountName}</td>
                                            <td className="p-3 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.accountType === 'main' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {r.accountType === 'main' ? 'رئيسي' : 'تحليلي'}
                                                </span>
                                            </td>
                                            <td className="p-3 font-mono text-xs text-slate-500">{r.parentAccountName || r.parentAccountNumber || '-'}</td>
                                        </tr>
                                    ))}
                                    {importData.length > 50 && (
                                        <tr>
                                            <td colSpan={4} className="p-4 text-center text-sm font-bold text-slate-500 bg-slate-100/50">
                                                ... بالإضافة إلى {importData.length - 50} صف آخر
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        
                        <div className="flex gap-3 mt-auto">
                             <button onClick={() => setShowImportPreview(false)} className="px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors">
                                 إلغاء وتراجع
                             </button>
                             <button 
                                onClick={handleImportConfirm} 
                                disabled={importing} 
                                className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-lg shadow-emerald-200 transition-all flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                             >
                                 {importing ? (
                                     <><span className="material-symbols-outlined animate-spin">sync</span> جاري معالجة الاستيراد...</>
                                 ) : (
                                     <><span className="material-symbols-outlined">save_alt</span> تأكيد استيراد كافة البيانات</>
                                 )}
                             </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChartOfAccountsPage;
