import React, { useState, useMemo } from 'react';
import { useAppContext } from '../AppContext';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { confirmDialog } from '../utils/confirm';

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

// تعريف أنواع الاستيراد الستة
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
    const { currentUser, addLog, employees, restaurants, addEmployee, addRestaurant, getCurrencyByBranch } = useAppContext();
    const { chartAccounts, addChartAccount, addChartAccountsBulk, updateChartAccount, deleteChartAccount } = useAppContext() as any;
    const navigate = useNavigate();

    const isSuperAdmin = currentUser?.role === 'super_admin';
    const canManage = isSuperAdmin || currentUser?.permissions?.includes('journal_entries_manage') || currentUser?.permissions?.includes('chart_of_accounts_manage');

    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'main' | 'sub'>('all');
    const [filterCategory, setFilterCategory] = useState('all');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingAccount, setEditingAccount] = useState<ChartAccount | null>(null);

    // Import states
    const [importType, setImportType] = useState('');
    const [importData, setImportData] = useState<any[]>([]);
    const [showImportPreview, setShowImportPreview] = useState(false);
    const [importing, setImporting] = useState(false);

    // Add/Edit form
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

    const filteredAccounts = useMemo(() => {
        let filtered = accounts;
        if (filterType !== 'all') filtered = filtered.filter(a => a.accountType === filterType);
        if (filterCategory !== 'all') filtered = filtered.filter(a => a.category === filterCategory);
        if (search.trim()) {
            const s = search.trim().toLowerCase();
            filtered = filtered.filter(a =>
                a.accountNumber.includes(s) || a.accountName.toLowerCase().includes(s) ||
                (a.category || '').toLowerCase().includes(s) || (a.branch || '').toLowerCase().includes(s)
            );
        }
        return filtered;
    }, [accounts, filterType, filterCategory, search]);

    const resetForm = () => {
        setFormAccountNumber(''); setFormAccountName(''); setFormAccountType('main');
        setFormParentAccountNumber(''); setFormCategory('عام'); setFormBranch('');
        setFormAccountNature(''); setFormCurrency(''); setEditingAccount(null);
    };

    const handleOpenEdit = (account: ChartAccount) => {
        setFormAccountNumber(account.accountNumber); setFormAccountName(account.accountName);
        setFormAccountType(account.accountType); setFormParentAccountNumber(account.parentAccountNumber || '');
        setFormCategory(account.category || 'عام'); setFormBranch(account.branch || '');
        setFormAccountNature(account.accountNature || ''); setFormCurrency(account.currency || '');
        setEditingAccount(account); setShowAddModal(true);
    };

    const handleSave = async () => {
        if (!formAccountNumber.trim() || !formAccountName.trim()) return alert('يرجى تعبئة رقم الحساب واسم الحساب');
        if (formAccountType === 'sub' && !formParentAccountNumber.trim()) return alert('يرجى تحديد رقم الحساب الرئيسي');
        try {
            const data: any = {
                accountNumber: formAccountNumber.trim(), accountName: formAccountName.trim(),
                accountType: formAccountType, parentAccountNumber: formAccountType === 'sub' ? formParentAccountNumber.trim() : '',
                category: formCategory, branch: formBranch, accountNature: formAccountNature, currency: formCurrency,
            };
            if (editingAccount) {
                await updateChartAccount(editingAccount.id, data);
                addLog('تعديل حساب', `تم تعديل الحساب ${formAccountNumber} - ${formAccountName}`, 'general');
            } else {
                await addChartAccount(data);
                addLog('إضافة حساب', `تم إضافة حساب جديد: ${formAccountNumber} - ${formAccountName}`, 'general');
            }
            setShowAddModal(false); resetForm();
        } catch (err) { console.error(err); alert('حدث خطأ أثناء الحفظ'); }
    };

    const handleDelete = async (account: ChartAccount) => {
        if (!(await confirmDialog(`هل تريد حذف الحساب ${account.accountNumber} - ${account.accountName}؟`, { type: 'danger' }))) return;
        try {
            await deleteChartAccount(account.id);
            addLog('حذف حساب', `تم حذف الحساب ${account.accountNumber} - ${account.accountName}`, 'general');
        } catch (err) { console.error(err); alert('حدث خطأ أثناء الحذف'); }
    };

    // ===== Excel Import Handlers =====

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, importKey: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const config = IMPORT_TYPES.find(t => t.key === importKey)!;
        setImportType(importKey);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const wb = XLSX.read(evt.target?.result, { type: 'binary' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const jsonData: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });

                if (jsonData.length < 2) return alert('الملف فارغ أو لا يحتوي على بيانات كافية');

                const rows = jsonData.slice(1).filter((r: any[]) => r.some(c => c !== undefined && c !== ''));
                let parsed: any[];

                if (importKey === 'main') {
                    // 6 أعمدة: الرقم، الاسم، النوع، العملة، البند الرئيسي، الحساب الرئيسي
                    parsed = rows.map((row: any[]) => {
                        const accountNumber = String(row[0] || '').trim();
                        const accountName = String(row[1] || '').trim();
                        const accountNature = String(row[2] || '').trim();
                        const currency = String(row[3] || '').trim();
                        const mainCategory = String(row[4] || '').trim();
                        const parentAccountName = String(row[5] || '').trim();

                        return {
                            accountNumber, accountName,
                            accountType: parentAccountName ? 'sub' as const : 'main' as const,
                            parentAccountName,
                            accountNature, currency, mainCategory,
                            category: 'عام',
                        };
                    }).filter(a => a.accountNumber && a.accountName);
                } else {
                    // 3 أعمدة: رقم الحساب، الاسم، الفرع
                    parsed = rows.map((row: any[]) => {
                        const accountNumber = String(row[0] || '').trim();
                        const accountName = String(row[1] || '').trim();
                        const branch = String(row[2] || '').trim();
                        return {
                            accountNumber, accountName,
                            accountType: 'sub' as const,
                            parentAccountNumber: config.parentAccount,
                            category: config.category,
                            branch,
                        };
                    }).filter(a => a.accountNumber && a.accountName);
                }

                setImportData(parsed);
                setShowImportPreview(true);
            } catch (err) { console.error(err); alert('خطأ في قراءة الملف'); }
        };
        reader.readAsBinaryString(file);
        e.target.value = '';
    };

    const handleImportConfirm = async () => {
        if (importData.length === 0) return;
        setImporting(true);
        try {
            // لاستيراد الحسابات الرئيسية (6 أعمدة) نحتاج ربط parentAccountName بـ parentAccountNumber
            let dataToImport = importData;
            if (importType === 'main') {
                // بناء خريطة اسم → رقم من البيانات المستوردة + الحسابات الحالية
                const nameToNumber: Record<string, string> = {};
                accounts.forEach(a => { nameToNumber[a.accountName] = a.accountNumber; });
                dataToImport.forEach(a => { nameToNumber[a.accountName] = a.accountNumber; });

                dataToImport = dataToImport.map(a => ({
                    ...a,
                    parentAccountNumber: a.parentAccountName ? (nameToNumber[a.parentAccountName] || '') : '',
                }));
            }

            const count = await addChartAccountsBulk(dataToImport);

            // Auto-sync Employees/Restaurants
            if (importType === 'employees') {
                const newEmps = dataToImport.filter(d => !employees.some(e => e.systemAccountNumber === d.accountNumber));
                for (const emp of newEmps) {
                    await addEmployee({
                        name: emp.accountName,
                        systemAccountNumber: emp.accountNumber,
                        branch: emp.branch || 'غير محدد',
                        phone: '',
                        transferAccounts: [],
                    } as any);
                }
            } else if (importType === 'restaurants') {
                const newRests = dataToImport.filter(d => !restaurants.some(r => r.restaurantAccountNumber === d.accountNumber));
                for (const rest of newRests) {
                    await addRestaurant({
                        name: rest.accountName,
                        restaurantAccountNumber: rest.accountNumber,
                        branch: rest.branch || 'غير محدد',
                        ownerName: '',
                        phone: '',
                        transferAccounts: [],
                        paymentPeriod: 'monthly',
                        currencyType: getCurrencyByBranch(rest.branch),
                    } as any);
                }
            }

            const typeLabel = IMPORT_TYPES.find(t => t.key === importType)?.label || '';
            addLog('استيراد حسابات', `تم استيراد ${count} حساب (${typeLabel}) من ملف Excel`, 'general');
            alert(`✓ تم استيراد ${count} حساب بنجاح`);
            setShowImportPreview(false); setImportData([]);
        } catch (err) { console.error(err); alert('حدث خطأ أثناء الاستيراد'); }
        setImporting(false);
    };

    const handleExportTemplate = (importKey: string) => {
        const config = IMPORT_TYPES.find(t => t.key === importKey)!;
        let headers: string[], exampleRows: any[][];

        if (importKey === 'main') {
            headers = ['الرقم', 'الاسم', 'النوع', 'العملة', 'البند الرئيسي', 'الحساب الرئيسي'];
            exampleRows = [
                ['1000', 'المكتب - رئيسي ايرادات', 'ايرادات', 'ريال قديم', 'ايرادات النشاط', ''],
                ['1001', 'عمولة الطلب', 'ايرادات', 'ريال قديم', 'حسابات مرتبطة بالطلبات', 'المكتب - رئيسي ايرادات'],
                ['5', 'الصندوق', 'اصول', 'ريال قديم', 'الاصول المتداولة', 'الصناديق'],
            ];
        } else {
            headers = ['رقم الحساب', 'الاسم', 'الفرع'];
            exampleRows = importKey === 'restaurants'
                ? [['3146', 'جريل اند تشل', 'عدن'], ['2440', 'الكنافة الملكية', 'عدن'], ['2906', 'كافيه لندن يو', 'المكلا']]
                : importKey === 'employees'
                    ? [['25001', 'أحمد محمد', 'عدن'], ['25002', 'علي سالم', 'المكلا']]
                    : [['30001', 'مبنى المكتب', 'عدن'], ['30002', 'سيارة توصيل', 'المكلا']];
        }

        const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);
        ws['!cols'] = headers.map(() => ({ wch: 22 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, config.label);
        XLSX.writeFile(wb, `قالب_${config.label.replace(/ /g, '_')}.xlsx`);
    };

    if (!canManage) {
        return (<div className="p-8 text-center"><span className="material-symbols-outlined text-6xl text-red-300">lock</span><p className="text-xl font-black text-red-500 mt-4">ليس لديك صلاحية لعرض دليل الحسابات</p></div>);
    }

    return (
        <div className="p-4 md:p-8 space-y-6 animate-fade-in" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black bg-gradient-to-l from-blue-600 to-cyan-600 bg-clip-text text-transparent drop-shadow-sm flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                            <span className="material-symbols-outlined text-3xl">account_tree</span>
                        </div>
                        دليل الحسابات
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-bold">إدارة الحسابات الرئيسية والتحليلية للنظام المحاسبي</p>
                </div>
                <button onClick={() => { resetForm(); setShowAddModal(true); }}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-2xl font-black transition-all flex items-center gap-2 shadow-lg shadow-blue-500/30 hover:-translate-y-0.5">
                    <span className="material-symbols-outlined">add_circle</span>
                    إضافة حساب يدوياً
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                    { label: 'إجمالي', count: accounts.length, icon: 'account_tree', grad: 'from-blue-500 to-indigo-600' },
                    { label: 'رئيسية', count: accounts.filter(a => a.accountType === 'main').length, icon: 'folder', grad: 'from-emerald-500 to-teal-600' },
                    { label: 'تحليلية', count: accounts.filter(a => a.accountType === 'sub').length, icon: 'folder_open', grad: 'from-amber-500 to-orange-600' },
                    { label: 'تصنيفات', count: new Set(accounts.map(a => a.category)).size, icon: 'category', grad: 'from-purple-500 to-pink-600' },
                    { label: 'فروع', count: new Set(accounts.filter(a => a.branch).map(a => a.branch)).size, icon: 'domain', grad: 'from-rose-500 to-red-600' },
                ].map(s => (
                    <div key={s.label} className={`bg-gradient-to-br ${s.grad} rounded-[1.5rem] p-4 text-white relative overflow-hidden shadow-lg`}>
                        <div className="absolute top-0 right-0 p-3 opacity-10"><span className="material-symbols-outlined text-5xl">{s.icon}</span></div>
                        <p className="text-white/70 text-xs font-bold">{s.label}</p>
                        <p className="text-2xl font-black mt-1 font-mono">{s.count}</p>
                    </div>
                ))}
            </div>

            {/* 6 Import Buttons */}
            <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 shadow-xl border border-slate-100 dark:border-slate-700">
                <h3 className="font-black text-lg text-slate-700 dark:text-white mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-500">upload_file</span>
                    استيراد من Excel
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {IMPORT_TYPES.map(type => (
                        <div key={type.key} className="relative">
                            <label className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-dashed cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5
                                border-${type.color}-200 dark:border-${type.color}-800 hover:border-${type.color}-400 bg-${type.color}-50/50 dark:bg-${type.color}-900/10`}>
                                <span className={`material-symbols-outlined text-3xl text-${type.color}-500`}>{type.icon}</span>
                                <span className={`text-xs font-black text-${type.color}-700 dark:text-${type.color}-400 text-center leading-tight`}>{type.label}</span>
                                <span className="text-[10px] text-slate-400 font-bold">{type.columns} أعمدة</span>
                                <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => handleFileUpload(e, type.key)} className="hidden" />
                            </label>
                            <button onClick={() => handleExportTemplate(type.key)}
                                className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-[9px] font-bold text-slate-500 hover:text-blue-600 transition-colors shadow-sm"
                                title="تحميل القالب">
                                قالب ↓
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-5 shadow-xl border border-slate-100 dark:border-slate-700 flex flex-wrap gap-4 items-center">
                <div className="flex-1 min-w-[200px] relative">
                    <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالرقم أو الاسم أو الفرع..."
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 pr-12 pl-4 text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <select value={filterType} onChange={e => setFilterType(e.target.value as any)}
                    className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="all">الكل</option><option value="main">رئيسي</option><option value="sub">تحليلي</option>
                </select>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="all">جميع التصنيفات</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead><tr className="bg-slate-50 dark:bg-slate-900/50">
                            {['رقم الحساب', 'اسم الحساب', 'النوع', 'التصنيف', 'الفرع', 'الحساب الرئيسي', 'رابط البيانات', 'إجراءات'].map(h => (
                                <th key={h} className="px-4 py-3 text-right text-xs font-black text-slate-500">{h}</th>
                            ))}
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredAccounts.length === 0 ? (
                                <tr><td colSpan={7} className="px-6 py-16 text-center text-slate-400 font-bold">
                                    <span className="material-symbols-outlined text-5xl mb-3 block">folder_off</span>
                                    لا توجد حسابات — قم باستيراد ملف Excel أو أضف حسابات يدوياً
                                </td></tr>
                            ) : filteredAccounts.map(account => (
                                <tr key={account.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors ${account.accountType === 'sub' ? 'bg-slate-25 dark:bg-slate-800/50' : ''}`}>
                                    <td className="px-4 py-3">
                                        <span className={`font-mono font-black text-sm ${account.accountType === 'main' ? 'text-blue-600' : 'text-slate-600 pr-4'}`}>
                                            {account.accountType === 'sub' && <span className="text-slate-300 ml-1">└</span>}
                                            {account.accountNumber}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 font-bold text-slate-800 dark:text-white">{account.accountName}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-3 py-1 rounded-lg text-xs font-black ${account.accountType === 'main' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600'}`}>
                                            {account.accountType === 'main' ? 'رئيسي' : 'تحليلي'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3"><span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold">{account.category || 'عام'}</span></td>
                                    <td className="px-4 py-3 text-sm font-bold text-slate-500">{account.branch || '—'}</td>
                                    <td className="px-4 py-3 font-mono text-sm text-slate-500">{account.parentAccountNumber || account.parentAccountName || '—'}</td>
                                    <td className="px-4 py-3 text-center">
                                        {account.category === 'موظفين' && (
                                            <button onClick={() => navigate(`/employees?search=${account.accountNumber}`)}
                                                className="px-3 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-600 rounded-lg text-[10px] font-black hover:bg-rose-100 transition-colors flex items-center gap-1 mx-auto">
                                                <span className="material-symbols-outlined text-xs">badge</span>
                                                بيانات الموظف
                                            </button>
                                        )}
                                        {account.category === 'مطاعم' && (
                                            <button onClick={() => navigate(`/restaurants?search=${account.accountNumber}`)}
                                                className="px-3 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-lg text-[10px] font-black hover:bg-amber-100 transition-colors flex items-center gap-1 mx-auto">
                                                <span className="material-symbols-outlined text-xs">storefront</span>
                                                دليل المطاعم
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <button onClick={() => handleOpenEdit(account)} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 rounded-xl transition-colors" title="تعديل"><span className="material-symbols-outlined text-lg">edit</span></button>
                                            <button onClick={() => handleDelete(account)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-xl transition-colors" title="حذف"><span className="material-symbols-outlined text-lg">delete</span></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filteredAccounts.length > 0 && (
                    <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-700 text-sm font-bold text-slate-400 text-center">
                        عرض {filteredAccounts.length} من أصل {accounts.length} حساب
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" dir="rtl">
                    <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-700/50 max-h-[85vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                                <div className="p-2.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 rounded-2xl"><span className="material-symbols-outlined">{editingAccount ? 'edit' : 'add_circle'}</span></div>
                                {editingAccount ? 'تعديل حساب' : 'إضافة حساب جديد'}
                            </h2>
                            <button onClick={() => { setShowAddModal(false); resetForm(); }} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 transition-colors"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-1">نوع الحساب</label>
                                    <select value={formAccountType} onChange={e => setFormAccountType(e.target.value as any)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 px-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white">
                                        <option value="main">رئيسي</option><option value="sub">تحليلي (فرعي)</option>
                                    </select></div>
                                <div><label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-1">التصنيف</label>
                                    <select value={formCategory} onChange={e => setFormCategory(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 px-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white">
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-1">رقم الحساب</label>
                                    <input type="text" value={formAccountNumber} onChange={e => setFormAccountNumber(e.target.value)} placeholder="مثال: 2000" className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 px-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" /></div>
                                <div><label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-1">الفرع</label>
                                    <input type="text" value={formBranch} onChange={e => setFormBranch(e.target.value)} placeholder="مثال: عدن" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 px-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" /></div>
                            </div>
                            <div><label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-1">اسم الحساب</label>
                                <input type="text" value={formAccountName} onChange={e => setFormAccountName(e.target.value)} placeholder="مثال: المطاعم" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 px-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white" /></div>
                            {formAccountType === 'sub' && (
                                <div><label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-1">رقم الحساب الرئيسي</label>
                                    <select value={formParentAccountNumber} onChange={e => setFormParentAccountNumber(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 px-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white">
                                        <option value="">— اختر —</option>
                                        {mainAccounts.map(a => <option key={a.id} value={a.accountNumber}>{a.accountNumber} - {a.accountName}</option>)}
                                    </select></div>
                            )}
                            <button onClick={handleSave} className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-2xl font-black shadow-lg transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5">
                                <span className="material-symbols-outlined">check_circle</span>
                                {editingAccount ? 'حفظ التعديلات' : 'إضافة الحساب'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Preview Modal */}
            {showImportPreview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" dir="rtl">
                    <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 w-full max-w-4xl shadow-2xl border border-slate-200 dark:border-slate-700/50 max-h-[85vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                                <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 rounded-2xl"><span className="material-symbols-outlined">preview</span></div>
                                معاينة — {IMPORT_TYPES.find(t => t.key === importType)?.label} ({importData.length} حساب)
                            </h2>
                            <button onClick={() => { setShowImportPreview(false); setImportData([]); }} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 transition-colors"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="overflow-x-auto mb-6">
                            <table className="w-full border-collapse text-sm">
                                <thead><tr className="bg-slate-50 dark:bg-slate-800">
                                    <th className="px-3 py-2 text-right font-black text-slate-500">#</th>
                                    <th className="px-3 py-2 text-right font-black text-slate-500">رقم الحساب</th>
                                    <th className="px-3 py-2 text-right font-black text-slate-500">الاسم</th>
                                    <th className="px-3 py-2 text-right font-black text-slate-500">النوع</th>
                                    {importType === 'main' ? (
                                        <><th className="px-3 py-2 text-right font-black text-slate-500">طبيعة</th>
                                            <th className="px-3 py-2 text-right font-black text-slate-500">الحساب الرئيسي</th></>
                                    ) : (
                                        <><th className="px-3 py-2 text-right font-black text-slate-500">الفرع</th>
                                            <th className="px-3 py-2 text-right font-black text-slate-500">التصنيف</th></>
                                    )}
                                </tr></thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {importData.slice(0, 50).map((row, i) => (
                                        <tr key={i}>
                                            <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
                                            <td className="px-3 py-2 font-mono font-bold text-blue-600">{row.accountNumber}</td>
                                            <td className="px-3 py-2 font-bold">{row.accountName}</td>
                                            <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs font-bold ${row.accountType === 'main' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>{row.accountType === 'main' ? 'رئيسي' : 'تحليلي'}</span></td>
                                            {importType === 'main' ? (
                                                <><td className="px-3 py-2 text-xs text-slate-500">{row.accountNature}</td>
                                                    <td className="px-3 py-2 text-xs text-slate-500">{row.parentAccountName || '—'}</td></>
                                            ) : (
                                                <><td className="px-3 py-2 text-sm font-bold text-slate-500">{row.branch || '—'}</td>
                                                    <td className="px-3 py-2 text-xs text-slate-500">{row.category}</td></>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {importData.length > 50 && <p className="text-center text-sm text-slate-400 mt-2 font-bold">... و {importData.length - 50} حساب آخر</p>}
                        </div>
                        <div className="flex gap-3">
                            <button onClick={handleImportConfirm} disabled={importing}
                                className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl font-black shadow-lg transition-all flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined">{importing ? 'hourglass_top' : 'upload'}</span>
                                {importing ? 'جاري الاستيراد...' : `استيراد ${importData.length} حساب`}
                            </button>
                            <button onClick={() => { setShowImportPreview(false); setImportData([]); }} className="px-8 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-black">إلغاء</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChartOfAccountsPage;
