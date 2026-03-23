import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppContext, Employee, TransferAccount } from '../AppContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getBranchColorClasses, safeCompare, calculateEmployeeSalary, getCurrencySymbol } from '../utils';
import * as XLSX from 'xlsx';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';

const EmployeesPage: React.FC = () => {
    const { employees, addEmployee, updateEmployee, deleteEmployee, addLog, currentUser, branches, exchangeRates, deductions, setSelectedEmployeeDrawerId } = useAppContext();
    const canViewSalary = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('salary_view');
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const activeBranches = branches.filter(b => b.isActive);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [branchFilter, setBranchFilter] = useState('الكل');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDataMenuOpen, setIsDataMenuOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'name', direction: 'asc' });

    // Excel Import State
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importPreview, setImportPreview] = useState<any[]>([]);
    const [updateExisting, setUpdateExisting] = useState(true);

    // Form State
    const [formData, setFormData] = useState<Partial<Employee>>({
        name: '',
        phone: '',
        branch: '',
        systemAccountNumber: '',
        basicSalary: 0,
        extraSalary: 0,
        transferAccounts: []
    });

    // Handle initial search from URL
    useEffect(() => {
        const search = searchParams.get('search');
        if (search) {
            setSearchTerm(search);
        }
    }, [searchParams]);

    // Filter & Sort Logic
    const filteredEmployees = useMemo(() => {
        let result = employees.filter(emp => {
            const search = searchTerm.toLowerCase();
            const matchesSearch = (
                emp.name.toLowerCase().includes(search) ||
                emp.phone.includes(search) ||
                (emp.systemAccountNumber || '').includes(search)
            );
            const matchesBranch = branchFilter === 'الكل' || emp.branch === branchFilter;
            return matchesSearch && matchesBranch;
        });

        if (sortConfig) {
            result.sort((a, b) => {
                const aValue = (a as any)[sortConfig.key];
                const bValue = (b as any)[sortConfig.key];
                const comparison = safeCompare(aValue, bValue);
                return sortConfig.direction === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [employees, searchTerm, branchFilter, sortConfig]);

    // Statistics
    const stats = useMemo(() => {
        const total = employees.length;
        const active = employees.filter(e => e.isActive !== false).length;
        const inactive = total - active;
        return { total, active, inactive };
    }, [employees]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (!sortConfig || sortConfig.key !== column) return <span className="material-symbols-outlined text-[14px] opacity-20">sort</span>;
        return (
            <span className="material-symbols-outlined text-[14px] text-[#C62828]">
                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
            </span>
        );
    };

    // Handlers
    const handleOpenModal = (employee?: Employee) => {
        if (employee) {
            setEditingId(employee.id);
            setFormData({ ...employee });
        } else {
            setEditingId(null);
            setFormData({
                name: '',
                phone: '',
                branch: '',
                systemAccountNumber: '',
                transferAccounts: []
            });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingId(null);
        setFormData({
            name: '',
            phone: '',
            branch: '',
            systemAccountNumber: '',
            basicSalary: 0,
            extraSalary: 0,
            transferAccounts: []
        });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (!formData.name || !formData.phone || !formData.branch) {
                alert('يرجى تعبئة الحقول الأساسية (الاسم، الهاتف، الفرع)');
                return;
            }

            if (editingId) {
                await updateEmployee(editingId, formData);
            } else {
                await addEmployee(formData as any); // Cast to ignore id/createdAt/isActive
            }
            handleCloseModal();
        } catch (error) {
            console.error("Error saving employee:", error);
            alert('حدث خطأ أثناء الحفظ');
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('هل أنت متأكد من حذف هذا الموظف؟ لا يمكن التراجع عن هذه العملية.')) {
            await deleteEmployee(id);
        }
    };

    const handleAddTransferAccount = () => {
        const newAccount: TransferAccount = {
            id: Date.now().toString(),
            type: '', // Default to empty string as requested
            accountNumber: '',
            beneficiaryName: '',
            isPrimary: false,
            isActive: true
        };
        setFormData(prev => ({
            ...prev,
            transferAccounts: [...(prev.transferAccounts || []), newAccount]
        }));
    };

    const handleRemoveTransferAccount = (index: number) => {
        setFormData(prev => ({
            ...prev,
            transferAccounts: (prev.transferAccounts || []).filter((_, i) => i !== index)
        }));
    };

    const handleUpdateTransferAccount = (index: number, field: keyof TransferAccount, value: any) => {
        const newAccounts = [...(formData.transferAccounts || [])];
        newAccounts[index] = { ...newAccounts[index], [field]: value };
        setFormData(prev => ({ ...prev, transferAccounts: newAccounts }));
    };

    // Excel functions
    const downloadTemplate = () => {
        const headers = [
            'رقم الحساب', // 0
            'الاسم', // 1
            'الفرع', // 2
            'رقم الهاتف', // 3
            'الراتب الأساسي', // 4
            'الراتب الإضافي', // 5
            'العملة المحلية', // 6
            'مصدر الراتب', // 7
            'الراتب الأساسي بالمصدر', // 8
            'الراتب الإضافي بالمصدر', // 9
            'حالة النشاط', // 10
            'ملاحظات' // 11
        ];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers]);
        ws['!cols'] = headers.map(() => ({ wch: 20 }));
        XLSX.utils.book_append_sheet(wb, ws, 'الموظفين');
        XLSX.writeFile(wb, 'قالب_الموظفين.xlsx');
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportFile(file);

        const reader = new FileReader();
        reader.onload = (evt) => {
            const data = new Uint8Array(evt.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            setImportPreview(rows.slice(0, 6));
            setIsImportModalOpen(true);
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    };

    const executeImport = async () => {
        if (!importFile) return;
        setImporting(true);

        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                const dataRows = rows.slice(1) as any[][];

                let batch = writeBatch(db);
                let count = 0;
                let opsCount = 0;
                let updated = 0;
                let added = 0;
                let errors = 0;

                for (const row of dataRows) {
                    // Skip empty rows or rows missing name/branch
                    if (!row || row.length === 0 || (!row[1] && !row[2])) continue;

                    const accountNumber = row[0]?.toString()?.trim() || '';
                    const name = row[1]?.toString()?.trim() || '';
                    const branch = row[2]?.toString()?.trim() || '';
                    const phone = row[3]?.toString()?.trim() || '';
                    const basicSalary = parseFloat(row[4]) || 0;
                    const extraSalary = parseFloat(row[5]) || 0;
                    const salaryCurrency = row[6] === 'ريال جديد' ? 'new_rial' : 'old_rial';
                    const salarySourceCurrency = (row[7] === 'سعودي' || row[7] === 'SAR') ? 'SAR' : 'YER';
                    const basicSalaryInSource = row[8] ? parseFloat(row[8]) : null;
                    const extraSalaryInSource = row[9] ? parseFloat(row[9]) : null;
                    const isActive = row[10] ? (row[10] === 'نشط' || row[10] === 'Active') : true;

                    if (!name || !branch) {
                        errors++;
                        continue;
                    }

                    // Try to find existing employee
                    let existingEmp = null;
                    if (accountNumber) {
                        existingEmp = employees.find(emp => emp.systemAccountNumber === accountNumber);
                    }
                    if (!existingEmp && name) {
                        existingEmp = employees.find(emp => emp.name.toLowerCase() === name.toLowerCase());
                    }

                    if (existingEmp && !updateExisting) {
                        continue;
                    }

                    const empRefId = existingEmp ? existingEmp.id : (accountNumber || Date.now().toString() + Math.random().toString(36).substr(2, 5));
                    const ref = doc(db, ROOT_COLLECTION, DATA_PATH, 'employees', empRefId);

                    const empData: any = {
                        name,
                        branch,
                        phone,
                        systemAccountNumber: accountNumber,
                        basicSalary,
                        extraSalary,
                        salaryCurrency,
                        salarySourceCurrency,
                        basicSalaryInSource: salarySourceCurrency === 'SAR' ? basicSalaryInSource : null,
                        extraSalaryInSource: salarySourceCurrency === 'SAR' ? extraSalaryInSource : null,
                        isActive,
                        updatedAt: new Date().toISOString()
                    };

                    if (!existingEmp) {
                        empData.id = empRefId;
                        empData.createdAt = new Date().toISOString();
                        empData.transferAccounts = [];
                        added++;
                    } else {
                        updated++;
                    }

                    batch.set(ref, empData, { merge: true });
                    opsCount++;
                    count++;

                    if (opsCount >= 400) {
                        await batch.commit();
                        batch = writeBatch(db);
                        opsCount = 0;
                    }
                }

                if (opsCount > 0) {
                    await batch.commit();
                }

                await addLog('استيراد موظفين', `تم استيراد ${count} موظف من Excel. (إضافة: ${added}، تحديث: ${updated}، أخطاء: ${errors})`, 'users');

                alert(`اكتمل الاستيراد!\nمضافة: ${added}\nمحدثة: ${updated}\nتم تجاهلها أو أخطاء: ${errors}`);
                setIsImportModalOpen(false);
                setImportFile(null);
                setIsDataMenuOpen(false);
            };
            reader.readAsArrayBuffer(importFile);

        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء الاستيراد!');
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="p-4 md:p-8 space-y-8 animate-fade-in RTL" dir="rtl">
            {/* Premium Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-100 dark:border-red-900/50 shadow-sm">
                            <span className="material-symbols-outlined text-4xl text-[#C62828]">badge</span>
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">
                                بيانات الموظفين
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400 font-bold flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                إدارة الكوادر وحسابات المستحقات
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <input
                        type="file"
                        ref={fileInputRef}
                        accept=".xlsx, .xls"
                        className="hidden"
                        onChange={handleFileUpload}
                    />

                    {(currentUser?.role === 'super_admin' || currentUser?.role === 'admin' || currentUser?.permissions?.includes('employees_import')) && (
                        <div className="relative">
                            <button
                                onClick={() => setIsDataMenuOpen(!isDataMenuOpen)}
                                className="px-5 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-white font-black rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-red-200 transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md active:scale-95"
                            >
                                <span className="material-symbols-outlined text-slate-400">database</span>
                                إدارة البيانات
                                <span className={`material-symbols-outlined text-sm transition-transform ${isDataMenuOpen ? 'rotate-180' : ''}`}>expand_more</span>
                            </button>

                            {isDataMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsDataMenuOpen(false)}></div>
                                    <div className="absolute left-0 top-full mt-2 w-64 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-slate-700/30 overflow-hidden z-20 animate-scale-in origin-top-left p-1">
                                        <button
                                            onClick={() => { downloadTemplate(); setIsDataMenuOpen(false); }}
                                            className="w-full px-4 py-3 text-right hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl flex items-center gap-3 text-slate-700 dark:text-slate-300 font-bold transition-all"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                                                <span className="material-symbols-outlined text-red-500 text-lg">download</span>
                                            </div>
                                            تحميل القالب الفارغ
                                        </button>
                                        <button
                                            disabled={importing}
                                            onClick={() => { fileInputRef.current?.click(); }}
                                            className="w-full px-4 py-3 text-right hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl flex items-center gap-3 text-slate-700 dark:text-slate-300 font-bold transition-all disabled:opacity-50"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                                                <span className="material-symbols-outlined text-emerald-600 text-lg">{importing ? 'sync' : 'upload_file'}</span>
                                            </div>
                                            {importing ? 'جاري الاستيراد...' : 'استيراد من إكسل'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {(currentUser?.role === 'super_admin' || currentUser?.role === 'admin' || currentUser?.permissions?.includes('users_add')) && (
                        <button
                            onClick={() => handleOpenModal()}
                            className="px-6 py-3 bg-gradient-to-r from-[#C62828] to-[#D32F2F] text-white rounded-2xl hover:scale-[1.02] active:scale-95 transition-all font-black shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined">person_add</span>
                            إضافة موظف جديد
                        </button>
                    )}
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-6 rounded-[2rem] border border-white dark:border-slate-700/50 shadow-sm flex items-center gap-5 group hover:shadow-xl hover:shadow-red-500/5 transition-all duration-500">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                        <span className="material-symbols-outlined text-3xl text-slate-600 dark:text-slate-300">groups</span>
                    </div>
                    <div>
                        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">إجمالي الموظفين</p>
                        <h4 className="text-3xl font-black text-slate-800 dark:text-white mt-0.5">{stats.total}</h4>
                    </div>
                </div>

                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-6 rounded-[2rem] border border-white dark:border-slate-700/50 shadow-sm flex items-center gap-5 group hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-500">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                        <span className="material-symbols-outlined text-3xl text-emerald-600 dark:text-emerald-400">check_circle</span>
                    </div>
                    <div>
                        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">الموظفون النشطون</p>
                        <h4 className="text-3xl font-black text-slate-800 dark:text-white mt-0.5">{stats.active}</h4>
                    </div>
                </div>

                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-6 rounded-[2rem] border border-white dark:border-slate-700/50 shadow-sm flex items-center gap-5 group hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-500">
                    <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                        <span className="material-symbols-outlined text-3xl text-amber-600 dark:text-amber-400">history_toggle_off</span>
                    </div>
                    <div>
                        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">متوقف / إيقاف مؤقت</p>
                        <h4 className="text-3xl font-black text-slate-800 dark:text-white mt-0.5">{stats.inactive}</h4>
                    </div>
                </div>
            </div>

            {/* Smart Search & Filter */}
            <div className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl p-3 rounded-[2.5rem] border border-white dark:border-slate-700/50 shadow-xl flex flex-col md:flex-row gap-3">
                <div className="relative flex-1 group">
                    <span className="material-symbols-outlined absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#C62828] transition-colors">search</span>
                    <input
                        type="text"
                        placeholder="ابحث بالاسم، الرقم، أو الهاتف..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-[1.8rem] py-4 pr-14 pl-6 focus:ring-4 focus:ring-red-500/10 focus:border-red-500/50 outline-none transition-all dark:text-white font-black text-lg placeholder:text-slate-400 placeholder:font-bold"
                    />
                </div>
                <div className="md:w-72 relative group">
                    <span className="material-symbols-outlined absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#C62828] transition-colors">location_on</span>
                    <select
                        value={branchFilter}
                        onChange={(e) => setBranchFilter(e.target.value)}
                        className="w-full bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-[1.8rem] py-4 pr-14 pl-6 focus:ring-4 focus:ring-red-500/10 focus:border-red-500/50 outline-none transition-all dark:text-white font-black text-lg appearance-none cursor-pointer"
                    >
                        <option value="الكل">جميع الفروع</option>
                        {
                            activeBranches.map(b => (
                                <option key={b.id} value={b.name}>{b.name}</option>
                            ))
                        }
                    </select>
                </div>
            </div>

            {/* Modern Glassmorphism Table */}
            <div className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl rounded-[2.5rem] border border-white dark:border-slate-700/50 shadow-2xl overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200/50 dark:border-slate-700/50">
                                <th onClick={() => handleSort('name')} className="px-8 py-6 text-right text-sm font-black text-slate-500 dark:text-slate-400 cursor-pointer hover:text-[#C62828] transition-colors group">
                                    <div className="flex items-center gap-2">
                                        <span className="group-hover:translate-x-1 transition-transform">الاسم الكامل</span>
                                        <SortIcon column="name" />
                                    </div>
                                </th>
                                <th onClick={() => handleSort('branch')} className="px-6 py-6 text-right text-sm font-black text-slate-500 dark:text-slate-400 cursor-pointer hover:text-[#C62828] transition-colors">
                                    <div className="flex items-center gap-2">
                                        <span>الفرع</span>
                                        <SortIcon column="branch" />
                                    </div>
                                </th>
                                <th className="px-6 py-6 text-right text-sm font-black text-slate-500 dark:text-slate-400">التواصل والحساب</th>
                                {
                                    canViewSalary && (
                                        <>
                                            <th onClick={() => handleSort('basicSalary')} className="px-6 py-6 text-right text-sm font-black text-slate-500 dark:text-slate-400 cursor-pointer hover:text-[#C62828] transition-colors">
                                                <div className="flex items-center gap-2">
                                                    <span>الراتب والمستحقات</span>
                                                    <SortIcon column="basicSalary" />
                                                </div>
                                            </th>
                                        </>
                                    )
                                }
                                <th className="px-6 py-6 text-right text-sm font-black text-slate-500 dark:text-slate-400">حسابات التحويل</th>
                                <th className="px-8 py-6 text-center text-sm font-black text-slate-500 dark:text-slate-400">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/30 dark:divide-slate-700/30">
                            {
                                filteredEmployees.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-24 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="w-20 h-20 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-300">
                                                    <span className="material-symbols-outlined text-5xl">person_search</span>
                                                </div>
                                                <p className="text-slate-400 font-bold text-lg">لم يتم العثور على أي موظفين يطابقون بحثك</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredEmployees.map((emp) => (
                                        <tr key={emp.id} className={`group hover:bg-white/60 dark:hover:bg-slate-700/40 transition-all duration-300 ${!emp.isActive ? 'opacity-60 saturate-50' : ''}`}>
                                            <td className="px-8 py-5">
                                                <div
                                                    className="flex items-center gap-4 cursor-pointer"
                                                    onClick={() => setSelectedEmployeeDrawerId(emp.id)}
                                                >
                                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/10 flex items-center justify-center text-[#C62828] font-black text-xl shadow-inner group-hover:scale-110 transition-transform">
                                                        {emp.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="font-black text-slate-800 dark:text-white text-lg group-hover:text-[#C62828] transition-colors">
                                                            {emp.name}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            {!emp.isActive ? (
                                                                <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-500 text-[10px] font-black rounded-lg">غير نشط</span>
                                                            ) : (
                                                                <span className="flex items-center gap-1 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                                                                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                                                                    نشط الآن
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <span className={`px-4 py-1.5 rounded-2xl text-xs font-black shadow-sm border ${getBranchColorClasses(emp.branch)}`}>
                                                    {emp.branch}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-bold text-sm">
                                                        <span className="material-symbols-outlined text-sm">phone</span>
                                                        <span dir="ltr">{emp.phone}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-500 font-bold text-[11px]">
                                                        <span className="material-symbols-outlined text-sm">account_balance</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <span>{emp.systemAccountNumber || 'لا يوجد رقم حساب'}</span>
                                                            {emp.systemAccountNumber && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        navigate(`/chart-of-accounts?search=${emp.systemAccountNumber}`);
                                                                    }}
                                                                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-md transition-all"
                                                                    title="عرض في دليل الحسابات"
                                                                >
                                                                    <span className="material-symbols-outlined text-[14px]">account_tree</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            {
                                                canViewSalary && (() => {
                                                    const salary = calculateEmployeeSalary(emp, exchangeRates, deductions);
                                                    const sym = getCurrencySymbol(salary.currency);
                                                    return (
                                                        <td className="px-6 py-5">
                                                            <div className="bg-slate-50/50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-700/50 inline-block min-w-[140px]">
                                                                <div className="text-xs text-slate-400 font-bold mb-1 italic">صافي الراتب</div>
                                                                <div className="font-black text-xl text-slate-800 dark:text-white flex items-baseline gap-1">
                                                                    {salary.total.toLocaleString()}
                                                                    <span className="text-xs text-[#C62828]">{sym}</span>
                                                                </div>
                                                                <div className="flex gap-2 mt-1">
                                                                    <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 rounded">ب: {salary.basic.toLocaleString()}</span>
                                                                    {salary.extra > 0 && <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 rounded">إ: {salary.extra.toLocaleString()}</span>}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    );
                                                })()
                                            }
                                            <td className="px-6 py-5">
                                                <div className="flex flex-wrap gap-2 max-w-[200px]">
                                                    {
                                                        emp.transferAccounts && emp.transferAccounts.length > 0 ? (
                                                            emp.transferAccounts.slice(0, 2).map((acc, idx) => (
                                                                <div key={idx} className="px-3 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-start gap-0.5 min-w-[90px]">
                                                                    <span className="text-[9px] font-black text-blue-600 dark:text-blue-400">{acc.type}</span>
                                                                    <span className="text-[10px] font-mono font-bold text-slate-500">{acc.accountNumber}</span>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <span className="text-slate-400 text-xs italic">لم يتم الربط</span>
                                                        )
                                                    }
                                                    {emp.transferAccounts && emp.transferAccounts.length > 2 && (
                                                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-black text-slate-500 border border-slate-200 dark:border-slate-600">
                                                            +{emp.transferAccounts.length - 2}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => updateEmployee(emp.id, { isActive: !emp.isActive })}
                                                        className={`w-10 h-10 flex items-center justify-center transition-all rounded-xl ${emp.isActive ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20' : 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`}
                                                        title={emp.isActive ? 'تعطيل' : 'تنشيط'}
                                                    >
                                                        <span className="material-symbols-outlined text-2xl">{emp.isActive ? 'check_circle' : 'cancel'}</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenModal(emp)}
                                                        className="w-10 h-10 flex items-center justify-center text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all"
                                                        title="تعديل"
                                                    >
                                                        <span className="material-symbols-outlined text-2xl">edit_note</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(emp.id)}
                                                        className="w-10 h-10 flex items-center justify-center text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                                                        title="حذف"
                                                    >
                                                        <span className="material-symbols-outlined text-2xl">delete</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Premium Import Modal */}
            {isImportModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-5xl overflow-hidden max-h-[92vh] flex flex-col border border-white dark:border-slate-700/50">
                        {/* Modal Header */}
                        <div className="p-8 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-md">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg">
                                    <span className="material-symbols-outlined text-2xl">upload_file</span>
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-800 dark:text-white leading-tight">
                                        استيراد الموظفين من Excel
                                    </h3>
                                    <p className="text-slate-500 dark:text-slate-400 font-bold text-sm mt-0.5">سيتم معالجة الملف وإضافة الموظفين الجدد تلقائياً</p>
                                </div>
                            </div>
                            <button onClick={() => { setIsImportModalOpen(false); setImportFile(null); }} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all">
                                <span className="material-symbols-outlined text-2xl">close</span>
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-8">
                            {/* File Info & Options */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-2 bg-blue-50/50 dark:bg-blue-900/10 p-6 rounded-3xl border border-blue-100 dark:border-blue-800/30 flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-800/30 flex items-center justify-center text-blue-600">
                                        <span className="material-symbols-outlined text-3xl">description</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-black text-blue-600/60 uppercase tracking-widest mb-1">الملف المختار</p>
                                        <p className="text-lg font-black text-blue-900 dark:text-blue-300 truncate" dir="ltr">{importFile?.name}</p>
                                        <p className="text-xs font-bold text-blue-500 mt-1">حجم الملف: {(importFile?.size || 0) / 1024 > 1024 ? `${((importFile?.size || 0) / 1024 / 1024).toFixed(2)} MB` : `${((importFile?.size || 0) / 1024).toFixed(2)} KB`}</p>
                                    </div>
                                </div>

                                <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-3xl border border-slate-200/50 dark:border-slate-700/50 flex flex-col justify-center gap-4">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div
                                            onClick={() => setUpdateExisting(!updateExisting)}
                                            className={`w-12 h-6 rounded-full transition-all duration-300 relative p-1 ${updateExisting ? 'bg-blue-500 shadow-lg shadow-blue-500/20' : 'bg-slate-300 dark:bg-slate-700'}`}
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${updateExisting ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                        </div>
                                        <span className={`text-sm font-black transition-colors ${updateExisting ? 'text-blue-600' : 'text-slate-400'}`}>
                                            تحديث البيانات الموجودة
                                        </span>
                                    </label>
                                    <p className="text-[10px] font-bold text-slate-400 leading-relaxed">في حال تفعيل الخيار، سيتم مطابقة الموظفين وتحديث بياناتهم بدلاً من تكرارهم.</p>
                                </div>
                            </div>

                            {/* Data Preview Section */}
                            {importPreview.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <span className="material-symbols-outlined text-sm">visibility</span>
                                        <span className="text-xs font-black uppercase tracking-widest">معاينة البيانات (أول 5 صفوف)</span>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-700/50 overflow-hidden shadow-sm">
                                        <div className="overflow-x-auto custom-scrollbar">
                                            <table className="w-full text-right border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50 dark:bg-slate-800/50">
                                                        {importPreview[0]?.map((header: any, index: number) => (
                                                            <th key={index} className="px-6 py-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700/50 whitespace-nowrap">
                                                                {header || `Column ${index + 1}`}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {importPreview.slice(1, 6).map((row: any, rIndex: number) => (
                                                        <tr key={rIndex} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                            {importPreview[0]?.map((_: any, cIndex: number) => (
                                                                <td key={cIndex} className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-300 border-b border-slate-50 dark:border-slate-700/30 whitespace-nowrap">
                                                                    {row[cIndex] || <span className="text-slate-300 dark:text-slate-600 italic">فارغ</span>}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <p className="text-xs text-center text-slate-400 font-bold italic">إجمالي الصفوف المكتشفة: {importPreview.length - 1} موظف</p>
                                </div>
                            )}

                            {/* Guidelines/Tips */}
                            <div className="bg-amber-50/50 dark:bg-amber-900/10 p-6 rounded-3xl border border-amber-100 dark:border-amber-800/30 flex items-start gap-4">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-800/30 flex items-center justify-center text-amber-600 mt-1 shrink-0">
                                    <span className="material-symbols-outlined">lightbulb</span>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-black text-amber-800 dark:text-amber-300">نصيحة قبل الاستيراد</p>
                                    <p className="text-xs font-bold text-amber-700/70 dark:text-amber-500/70 leading-relaxed">
                                        تأكد من أن أسماء الأعمدة في ملف Excel مطابقة للحقول المطلوبة (الاسم، الهاتف، الفرع، رقم الحساب). سيتم تجاهل الصفوف الفارغة أو غير المكتملة.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-8 border-t border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-md flex justify-end items-center gap-4">
                            <button
                                onClick={() => { setIsImportModalOpen(false); setImportFile(null); }}
                                className="px-8 py-3.5 text-slate-600 dark:text-slate-400 font-black hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all disabled:opacity-50"
                                disabled={importing}
                            >
                                إلغاء
                            </button>
                            <button
                                onClick={executeImport}
                                disabled={importing || !importFile}
                                className="px-12 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-blue-500/20 flex items-center gap-3 disabled:opacity-50"
                            >
                                {importing ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        جاري المعالجة...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined">rocket_launch</span>
                                        تأكيد الاستيراد للنظام
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Premium Add/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden max-h-[92vh] flex flex-col border border-white dark:border-slate-700/50">
                        {/* Modal Header */}
                        <div className="p-8 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-md">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#C62828] to-[#D32F2F] flex items-center justify-center text-white shadow-lg">
                                    <span className="material-symbols-outlined text-2xl">{editingId ? 'edit_note' : 'person_add'}</span>
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-800 dark:text-white leading-tight">
                                        {editingId ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'}
                                    </h3>
                                    <p className="text-slate-500 dark:text-slate-400 font-bold text-sm mt-0.5">يرجى التأكد من دقة البيانات المدخلة</p>
                                </div>
                            </div>
                            <button onClick={handleCloseModal} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all">
                                <span className="material-symbols-outlined text-2xl">close</span>
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-8">
                            {/* Personal Info Section */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-slate-400 mb-2">
                                    <span className="material-symbols-outlined text-sm">person</span>
                                    <span className="text-xs font-black uppercase tracking-widest">المعلومات الشخصية</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-black text-slate-700 dark:text-slate-300 mr-1 flex items-center gap-2">
                                            الاسم الثلاثي واللقب
                                            <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative group">
                                            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#C62828] transition-colors">signature</span>
                                            <input
                                                type="text"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                placeholder="أدخل الاسم الرباعي للموظف..."
                                                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl pr-12 pl-4 py-4 focus:ring-4 focus:ring-red-500/10 focus:border-red-500/50 outline-none transition-all dark:text-white font-bold"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-black text-slate-700 dark:text-slate-300 mr-1 flex items-center gap-2">
                                            الفرع التابع له
                                            <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative group">
                                            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#C62828] transition-colors">location_on</span>
                                            <select
                                                value={formData.branch}
                                                onChange={(e) => {
                                                    const selectedBranch = activeBranches.find(b => b.name === e.target.value);
                                                    setFormData({
                                                        ...formData,
                                                        branch: e.target.value,
                                                        salaryCurrency: selectedBranch?.currencyType || 'old_rial',
                                                        salarySourceCurrency: selectedBranch?.defaultSalarySource || 'YER'
                                                    });
                                                }}
                                                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl pr-12 pl-4 py-4 focus:ring-4 focus:ring-red-500/10 focus:border-red-500/50 outline-none transition-all dark:text-white font-bold appearance-none cursor-pointer"
                                            >
                                                <option value="">اختر الفرع...</option>
                                                {activeBranches.map(b => (
                                                    <option key={b.id} value={b.name}>{b.name} ({getCurrencySymbol(b.currencyType)})</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-black text-slate-700 dark:text-slate-300 mr-1">رقم الهاتف للتواصل</label>
                                        <div className="relative group">
                                            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#C62828] transition-colors">phone_iphone</span>
                                            <input
                                                type="text"
                                                value={formData.phone}
                                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                                placeholder="7XXXXXXXX"
                                                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl pr-12 pl-4 py-4 focus:ring-4 focus:ring-red-500/10 focus:border-red-500/50 outline-none transition-all dark:text-white font-mono dir-ltr text-right font-bold"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-black text-slate-700 dark:text-slate-300 mr-1">رقم الحساب (النظام المحاسبي)</label>
                                        <div className="relative group">
                                            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#C62828] transition-colors">tag</span>
                                            <input
                                                type="text"
                                                value={formData.systemAccountNumber}
                                                onChange={(e) => setFormData({ ...formData, systemAccountNumber: e.target.value })}
                                                placeholder="رقم الحساب التحليلي..."
                                                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl pr-12 pl-4 py-4 focus:ring-4 focus:ring-red-500/10 focus:border-red-500/50 outline-none transition-all dark:text-white font-bold font-mono"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Salary & Financials Section */}
                            {canViewSalary && (
                                <div className="space-y-6 pt-6 border-t border-slate-100 dark:border-slate-700/50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-slate-400">
                                            <span className="material-symbols-outlined text-sm">payments</span>
                                            <span className="text-xs font-black uppercase tracking-widest">تفاصيل الراتب والمستحقات</span>
                                        </div>
                                        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, salarySourceCurrency: 'YER' })}
                                                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${formData.salarySourceCurrency === 'YER' ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                            >
                                                ريال يمني
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, salarySourceCurrency: 'SAR' })}
                                                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${formData.salarySourceCurrency === 'SAR' ? 'bg-white dark:bg-slate-800 text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                            >
                                                ريال سعودي
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50/50 dark:bg-slate-900/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-700/50 space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {formData.salarySourceCurrency === 'SAR' ? (
                                                <>
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase">الأساسي (سعودي)</label>
                                                        <input type="number" value={formData.basicSalaryInSource || ''}
                                                            onChange={(e) => setFormData({ ...formData, basicSalaryInSource: Number(e.target.value) })}
                                                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3.5 focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500/50 outline-none transition-all dark:text-white font-mono font-bold"
                                                            placeholder="0.00" />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase">إضافي / حوافز (سعودي)</label>
                                                        <input type="number" value={formData.extraSalaryInSource || ''}
                                                            onChange={(e) => setFormData({ ...formData, extraSalaryInSource: Number(e.target.value) })}
                                                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3.5 focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500/50 outline-none transition-all dark:text-white font-mono font-bold"
                                                            placeholder="0.00" />
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase">الأساسي ({getCurrencySymbol(formData.salaryCurrency)})</label>
                                                        <input type="number" value={formData.basicSalary || ''}
                                                            onChange={(e) => setFormData({ ...formData, basicSalary: Number(e.target.value) })}
                                                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3.5 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 outline-none transition-all dark:text-white font-mono font-bold"
                                                            placeholder="0.00" />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase">إضافي / حوافز ({getCurrencySymbol(formData.salaryCurrency)})</label>
                                                        <input type="number" value={formData.extraSalary || ''}
                                                            onChange={(e) => setFormData({ ...formData, extraSalary: Number(e.target.value) })}
                                                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3.5 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 outline-none transition-all dark:text-white font-mono font-bold"
                                                            placeholder="0.00" />
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {(formData.salarySourceCurrency === 'SAR' && (formData.basicSalaryInSource || formData.extraSalaryInSource)) && (
                                            <div className="bg-amber-100/50 dark:bg-amber-900/10 p-4 rounded-2xl border border-amber-200 dark:border-amber-800 flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-amber-200 dark:bg-amber-800 flex items-center justify-center">
                                                    <span className="material-symbols-outlined text-amber-700 dark:text-amber-300">currency_exchange</span>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-amber-700 dark:text-amber-500 uppercase">إجمالي الراتب بالعملة المحلية</p>
                                                    <p className="font-black text-amber-900 dark:text-amber-300 text-lg">
                                                        {(((formData.basicSalaryInSource || 0) + (formData.extraSalaryInSource || 0)) * (formData.salaryCurrency === 'old_rial' ? exchangeRates.SAR_TO_OLD_RIAL : exchangeRates.SAR_TO_NEW_RIAL)).toLocaleString()} {getCurrencySymbol(formData.salaryCurrency)}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Transfer Accounts Section */}
                            <div className="space-y-6 pt-6 border-t border-slate-100 dark:border-slate-700/50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
                                        <span className="text-xs font-black uppercase tracking-widest">حسابات التحويل المتاحة</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddTransferAccount}
                                        className="text-xs text-[#C62828] font-black hover:bg-red-50 dark:hover:bg-red-950/20 px-3 py-1.5 rounded-xl transition-all flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-base">add_circle</span>
                                        إضافة حساب جديد
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {formData.transferAccounts?.map((acc, idx) => (
                                        <div key={idx} className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-3xl border border-slate-200/50 dark:border-slate-700/50 relative group hover:shadow-lg transition-all">
                                            <button
                                                onClick={() => handleRemoveTransferAccount(idx)}
                                                className="absolute -left-2 -top-2 w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-800 border border-red-100 dark:border-red-900/50 text-red-500 rounded-full shadow-md hover:scale-110 active:scale-95 transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <span className="material-symbols-outlined text-base">close</span>
                                            </button>

                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">اسم المستفيد</label>
                                                    <input
                                                        type="text"
                                                        value={acc.beneficiaryName}
                                                        onChange={(e) => handleUpdateTransferAccount(idx, 'beneficiaryName', e.target.value)}
                                                        className="w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-red-500 outline-none font-bold"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">رقم الحساب</label>
                                                        <input
                                                            type="text"
                                                            value={acc.accountNumber}
                                                            onChange={(e) => handleUpdateTransferAccount(idx, 'accountNumber', e.target.value)}
                                                            className="w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-red-500 outline-none font-mono font-bold"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">جهة التحويل</label>
                                                        <input
                                                            type="text"
                                                            placeholder="الكريمي، جيب..."
                                                            value={acc.type}
                                                            onChange={(e) => handleUpdateTransferAccount(idx, 'type', e.target.value)}
                                                            className="w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-red-500 outline-none font-bold"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(!formData.transferAccounts || formData.transferAccounts.length === 0) && (
                                        <div className="md:col-span-2 py-10 border-2 border-dashed border-slate-100 dark:border-slate-700/50 rounded-[2rem] flex flex-col items-center gap-3">
                                            <span className="material-symbols-outlined text-4xl text-slate-200">account_balance</span>
                                            <p className="text-slate-400 font-bold text-sm">لم يتم إضافة أي حسابات تحويل لهذا الموظف</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-8 border-t border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-md flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div className="flex items-center gap-4 order-2 sm:order-1 w-full sm:w-auto">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div
                                        onClick={() => setFormData(prev => ({ ...prev, isActive: !prev.isActive }))}
                                        className={`w-14 h-7 rounded-full transition-all duration-300 relative p-1 ${formData.isActive ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-slate-300 dark:bg-slate-700'}`}
                                    >
                                        <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${formData.isActive ? 'translate-x-7' : 'translate-x-0'}`}></div>
                                    </div>
                                    <span className={`text-sm font-black transition-colors ${formData.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {formData.isActive ? 'حساب نشط' : 'حساب موقوف'}
                                    </span>
                                </label>
                            </div>

                            <div className="flex items-center gap-3 order-1 sm:order-2 w-full sm:w-auto">
                                <button
                                    onClick={handleCloseModal}
                                    className="flex-1 sm:flex-none px-8 py-3.5 text-slate-600 dark:text-slate-400 font-black hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all"
                                >
                                    إلغاء
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="flex-1 sm:flex-none px-12 py-3.5 bg-gradient-to-r from-[#C62828] to-[#D32F2F] text-white font-black rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-red-500/20"
                                >
                                    {editingId ? 'حفظ التعديلات' : 'إضافة الموظف للنظام'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmployeesPage;
