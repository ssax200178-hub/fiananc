import React, { useState, useMemo } from 'react';
import { useAppContext, Deduction, DeductionType } from '../AppContext';
import { calculateEmployeeSalary, getCurrencySymbol, getBranchColorClasses } from '../utils';
import { promptDialog } from '../utils/confirm';
import * as XLSX from 'xlsx';

const DeductionsPage: React.FC = () => {
    const {
        employees,
        deductions,
        addDeduction,
        deleteDeduction,
        exemptDeduction,
        currentUser,
        branches,
        exchangeRates,
        setSelectedEmployeeDrawerId
    } = useAppContext();

    const canManage = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('deductions_manage');

    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState('الكل');

    const months = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];

    // Form State
    const [formData, setFormData] = useState({
        employeeId: '',
        type: 'verbal_warning' as DeductionType,
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD for input[type="date"]
        month: months[new Date().getMonth()],
        notes: ''
    });

    const deductionTypes: { value: DeductionType; label: string; color: string; factor: number }[] = [
        { value: 'verbal_warning', label: 'إنذار شفهي', color: 'bg-emerald-100 text-emerald-700', factor: 0 },
        { value: 'quarter_day', label: 'خصم ربع يوم', color: 'bg-amber-100 text-amber-700', factor: 0.25 },
        { value: 'half_day', label: 'خصم نصف يوم', color: 'bg-orange-100 text-orange-700', factor: 0.5 },
        { value: 'full_day_warning', label: 'إنذار يوم كامل', color: 'bg-red-100 text-red-700', factor: 1 },
        { value: 'full_day', label: 'خصم يوم كامل', color: 'bg-slate-800 text-white', factor: 1 },
    ];

    // Calculated fields based on selection
    const selectedEmployee = useMemo(() => employees.find(e => e.id === formData.employeeId), [formData.employeeId, employees]);
    const calculatedAmount = useMemo(() => {
        if (!selectedEmployee) return 0;
        const typeInfo = deductionTypes.find(t => t.value === formData.type);
        if (!typeInfo || typeInfo.factor === 0) return 0;

        const salary = calculateEmployeeSalary(selectedEmployee, exchangeRates);
        const dayValue = salary.basic / 30;
        return Math.round(dayValue * typeInfo.factor);
    }, [selectedEmployee, formData.type, exchangeRates]);

    // Filter Logic
    const filteredDeductions = useMemo(() => {
        return deductions.filter(d => {
            const matchesSearch = d.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) || (d.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesMonth = selectedMonth === 'الكل' || d.month === selectedMonth;
            return matchesSearch && matchesMonth;
        });
    }, [deductions, searchTerm, selectedMonth]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.employeeId) return alert('يرجى اختيار الموظف');

        try {
            await addDeduction({
                employeeId: formData.employeeId,
                employeeName: selectedEmployee?.name || '',
                branch: selectedEmployee?.branch || '',
                type: formData.type,
                amount: calculatedAmount,
                date: formData.date.split('-').reverse().join('/'), // Convert YYYY-MM-DD to DD/MM/YYYY for display
                month: formData.month,
                notes: formData.notes
            });
            setIsModalOpen(false);
            setFormData({ ...formData, employeeId: '', notes: '' });
        } catch (error) {
            alert('حدث خطأ أثناء الحفظ');
        }
    };
    const handleExempt = async (id: string) => {
        const reason = await promptDialog('يرجى إدخال سبب الإعفاء:', { cancelText: 'إلغاء الأمر', confirmText: 'موافق' });
        if (reason) {
            await exemptDeduction(id, reason);
        }
    };

    const handleExportExcel = () => {
        const dataToExport = filteredDeductions.map(d => ({
            'الموظف': d.employeeName,
            'الفرع': d.branch,
            'نوع المخالفة': deductionTypes.find(t => t.value === d.type)?.label || d.type,
            'المبلغ': d.isExempted ? 0 : d.amount,
            'التاريخ': d.date,
            'الشهر': d.month,
            'حالة الإعفاء': d.isExempted ? 'معفى' : 'نشط',
            'سبب الإعفاء': d.exemptionReason || '',
            'الملاحظات': d.notes || ''
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "الخصميات");
        XLSX.writeFile(wb, `خصميات_وانذارات_${selectedMonth === 'الكل' ? 'الكل' : selectedMonth}_${new Date().toLocaleDateString('ar-EG')}.xlsx`);
    };

    return (
        <div className="p-4 md:p-8 space-y-6 animate-fade-in" dir="rtl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-pink-600">money_off</span>
                        الخصميات والإنذارات
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 font-bold">إدارة العقوبات الإدارية والخصومات المالية للموظفين</p>
                </div>

                {canManage && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleExportExcel}
                            className="px-6 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-700 transition font-black shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-emerald-500">download</span>
                            تصدير Excel
                        </button>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="px-6 py-3 bg-gradient-to-r from-pink-600 to-rose-600 text-white rounded-2xl hover:from-pink-700 hover:to-rose-700 transition font-black shadow-lg shadow-pink-200 dark:shadow-none flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined">add_circle</span>
                            إضافة خصم / إنذار
                        </button>
                    </div>
                )}
            </div>

            {/* Dashboard Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-all flex items-center gap-5">
                    <div className="p-4 bg-pink-50 dark:bg-pink-900/20 rounded-[1.5rem] text-pink-600 shadow-sm shadow-pink-100 dark:shadow-none">
                        <span className="material-symbols-outlined text-3xl">trending_down</span>
                    </div>
                    <div>
                        <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-1">إجمالي الخصميات {selectedMonth === 'الكل' ? '' : `لشهر ${selectedMonth}`}</div>
                        <div className="text-2xl font-black text-slate-800 dark:text-white flex items-baseline gap-1">
                            {filteredDeductions.reduce((sum, d) => sum + d.amount, 0).toLocaleString()}
                            <span className="text-xs text-slate-400">YER</span>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-all flex items-center gap-5">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[1.5rem] text-blue-600 shadow-sm shadow-blue-100 dark:shadow-none">
                        <span className="material-symbols-outlined text-3xl">groups</span>
                    </div>
                    <div>
                        <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-1">الموظفين المخصوم عليهم</div>
                        <div className="text-2xl font-black text-slate-800 dark:text-white">
                            {new Set(filteredDeductions.map(d => d.employeeId)).size}
                            <span className="text-xs text-slate-400 mr-2">موظف</span>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-all flex items-center gap-5">
                    <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-[1.5rem] text-orange-600 shadow-sm shadow-orange-100 dark:shadow-none">
                        <span className="material-symbols-outlined text-3xl">warning</span>
                    </div>
                    <div>
                        <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-1">إجمالي المخالفات</div>
                        <div className="text-2xl font-black text-slate-800 dark:text-white">
                            {filteredDeductions.length}
                            <span className="text-xs text-slate-400 mr-2">مخالفة</span>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-all flex items-center gap-5">
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-[1.5rem] text-emerald-600 shadow-sm shadow-emerald-100 dark:shadow-none">
                        <span className="material-symbols-outlined text-3xl">verified_user</span>
                    </div>
                    <div>
                        <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-1">حالات الإعفاء</div>
                        <div className="text-2xl font-black text-slate-800 dark:text-white">
                            {filteredDeductions.filter(d => d.isExempted).length}
                            <span className="text-xs text-slate-400 mr-2">حالة</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                    <input
                        type="text"
                        placeholder="بحث باسم الموظف أو الملاحظات..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pr-12 pl-4 focus:ring-2 focus:ring-pink-500 outline-none transition dark:text-white font-bold"
                    />
                </div>
                <div className="md:w-64 relative">
                    <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">calendar_month</span>
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pr-12 pl-4 focus:ring-2 focus:ring-pink-500 outline-none transition dark:text-white font-bold appearance-none"
                    >
                        <option value="الكل">كل الشهور</option>
                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 text-sm font-black border-b border-slate-100 dark:border-slate-700">
                                <th className="px-6 py-4">الموظف</th>
                                <th className="px-6 py-4">نوع الخصم</th>
                                <th className="px-6 py-4">المبلغ المخصوم</th>
                                <th className="px-6 py-4">التاريخ / الفترة</th>
                                <th className="px-6 py-4">الملاحظات</th>
                                {canManage && <th className="px-6 py-4 text-center">الإجراءات</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredDeductions.length === 0 ? (
                                <tr>
                                    <td colSpan={canManage ? 6 : 5} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-4 animate-fade-in">
                                            <div className="w-24 h-24 bg-slate-50 dark:bg-slate-900 rounded-full flex items-center justify-center text-slate-200 dark:text-slate-800 mb-2">
                                                <span className="material-symbols-outlined text-6xl">inventory_2</span>
                                            </div>
                                            <div className="text-slate-400 font-black text-lg italic">لا توجد سجلات خصم أو إنذارات مطابقة...</div>
                                            <p className="text-xs text-slate-300 font-bold max-w-sm mx-auto">
                                                يمكنك محاولة تغيير فلاتر البحث أو اختيار شهر آخر لعرض السجلات التاريخية.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredDeductions.map((d) => (
                                    <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div
                                                className="font-black text-slate-800 dark:text-white cursor-pointer hover:text-blue-600 transition-colors"
                                                onClick={() => setSelectedEmployeeDrawerId(d.employeeId)}
                                            >
                                                {d.employeeName}
                                            </div>
                                            <div className={`text-[10px] inline-block px-1.5 py-0.5 rounded border mt-0.5 ${getBranchColorClasses(d.branch)}`}>{d.branch}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-black shadow-sm ${deductionTypes.find(t => t.value === d.type)?.color}`}>
                                                {deductionTypes.find(t => t.value === d.type)?.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {d.isExempted ? (
                                                <div className="flex flex-col">
                                                    <span className="px-2 py-1 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-lg text-[10px] font-black border border-emerald-100 dark:border-emerald-800 w-fit">
                                                        معفى من الغرامة
                                                    </span>
                                                    <span className="text-[9px] text-slate-400 mt-1 max-w-[120px] truncate" title={d.exemptionReason}>
                                                        السبب: {d.exemptionReason}
                                                    </span>
                                                </div>
                                            ) : d.amount > 0 ? (
                                                <span className="font-mono text-pink-600 dark:text-pink-400 font-black whitespace-nowrap">
                                                    -{d.amount?.toLocaleString()} {getCurrencySymbol(employees.find(e => e.id === d.employeeId)?.salaryCurrency)}
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 text-xs font-bold">بدون خصم مالي</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-700 dark:text-slate-300 text-xs">{d.date}</div>
                                            <div className="text-[10px] text-blue-500 font-black mt-0.5">{d.month}</div>
                                        </td>
                                        <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400 max-w-xs overflow-hidden" title={d.notes}>
                                            {d.notes || '-'}
                                        </td>
                                        {canManage && (
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    {!d.isExempted && d.amount > 0 && (
                                                        <button
                                                            onClick={() => handleExempt(d.id)}
                                                            className="p-2 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-all"
                                                            title="إعفاء من الغرامة"
                                                        >
                                                            <span className="material-symbols-outlined">verified_user</span>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => deleteDeduction(d.id)}
                                                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                                                        title="حذف السجل"
                                                    >
                                                        <span className="material-symbols-outlined">delete</span>
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Addition Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <form onSubmit={handleSave} className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-in">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-pink-600">add_moderator</span>
                                تسجيل عقوبة أو خصم جديد
                            </h3>
                            <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 pr-2">اختر الموظف</label>
                                    <select
                                        required
                                        value={formData.employeeId}
                                        onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3 focus:ring-2 focus:ring-pink-500 outline-none transition font-bold dark:text-white text-sm"
                                    >
                                        <option value="">-- ابحث عن موظف --</option>
                                        {employees.filter(e => e.isActive).map(e => (
                                            <option key={e.id} value={e.id}>{e.name} ({e.branch})</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 pr-2">الشهر / الفترة</label>
                                    <select
                                        required
                                        value={formData.month}
                                        onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3 focus:ring-2 focus:ring-pink-500 outline-none transition font-bold dark:text-white text-sm"
                                    >
                                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 pr-2">تاريخ المخالفة</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.date}
                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3 focus:ring-2 focus:ring-pink-500 outline-none transition font-bold dark:text-white text-sm"
                                    />
                                </div>
                            </div>

                            {/* Duplicate Violation Alert */}
                            {(() => {
                                if (!formData.employeeId || !formData.month) return null;
                                const existingCount = deductions.filter(d =>
                                    d.employeeId === formData.employeeId &&
                                    d.month === formData.month &&
                                    !d.isExempted
                                ).length;

                                if (existingCount >= 1) {
                                    return (
                                        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-3xl flex items-center gap-3 animate-pulse">
                                            <span className="material-symbols-outlined text-red-500">warning</span>
                                            <div>
                                                <div className="text-red-800 dark:text-red-200 text-xs font-black">مخالفة مكررة لهذا الشهر!</div>
                                                <div className="text-red-600 dark:text-red-400 text-[10px] font-bold">
                                                    هذا الموظف لديه {existingCount} مخالفات سابقة مسجلة في شهر {formData.month}.
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-500 pr-2">نوع الخصم / الإنذار</label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {deductionTypes.map(t => (
                                        <button
                                            key={t.value}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, type: t.value })}
                                            className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all gap-1 ${formData.type === t.value
                                                ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
                                                : 'border-transparent bg-slate-50 dark:bg-slate-900 hover:border-slate-200'
                                                }`}
                                        >
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${t.color}`}>{t.label}</span>
                                            <span className="text-[10px] text-slate-400 font-bold">
                                                {t.factor === 0 ? 'بدون خصم' : `خصم ${t.factor} يوم`}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {selectedEmployee && (
                                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                    <div>
                                        <div className="text-[10px] text-slate-500 font-bold">المبلغ المتوقع خصمه:</div>
                                        <div className="text-2xl font-black text-pink-600">
                                            {calculatedAmount.toLocaleString()} {getCurrencySymbol(selectedEmployee.salaryCurrency)}
                                        </div>
                                    </div>
                                    <div className="text-left">
                                        <div className="text-[10px] text-slate-500 font-bold">الراتب الأساسي:</div>
                                        <div className="font-bold dark:text-slate-300">
                                            {calculateEmployeeSalary(selectedEmployee, exchangeRates).basic.toLocaleString()} {getCurrencySymbol(selectedEmployee.salaryCurrency)}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 pr-2">ملاحظات وسبب الخصم</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-pink-500 outline-none transition font-bold dark:text-white h-24"
                                    placeholder="اكتب تفاصيل المخالفة هنا..."
                                />
                            </div>
                        </div>

                        <div className="p-6 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="px-6 py-3 font-bold text-slate-500 hover:text-slate-800 transition"
                            >
                                إلغاء
                            </button>
                            <button
                                type="submit"
                                className="px-8 py-3 bg-pink-600 text-white rounded-xl font-black shadow-lg hover:bg-pink-700 transition"
                            >
                                حفظ العقوبة
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default DeductionsPage;
