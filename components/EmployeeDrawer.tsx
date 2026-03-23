import React, { useMemo } from 'react';
import { useAppContext, Deduction, LoanRequest } from '../AppContext';
import { getCurrencySymbol, getBranchColorClasses, calculateEmployeeSalary } from '../utils';
import * as XLSX from 'xlsx';

interface EmployeeDrawerProps {
    employeeId: string | null;
    isOpen: boolean;
    onClose: () => void;
}

const EmployeeDrawer: React.FC<EmployeeDrawerProps> = ({ employeeId, isOpen, onClose }) => {
    const { employees, loanRequests, deductions, phonePayments, exchangeRates } = useAppContext();

    const employee = useMemo(() => employees.find(e => e.id === employeeId), [employees, employeeId]);

    const employeeLoans = useMemo(() =>
        loanRequests.filter(l => l.employeeId === employeeId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        [loanRequests, employeeId]);

    const employeeDeductions = useMemo(() =>
        deductions.filter(d => d.employeeId === employeeId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        [deductions, employeeId]);

    const employeePhonePayments = useMemo(() =>
        phonePayments.filter(p => p.employeeId === employeeId).sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()),
        [phonePayments, employeeId]);

    const stats = useMemo(() => {
        if (!employee) return null;
        const totalLoans = employeeLoans.filter(l => l.isApproved).reduce((sum, l) => sum + l.requestedAmount, 0);
        const totalDeductions = employeeDeductions.filter(d => !d.isExempted).reduce((sum, d) => sum + d.amount, 0);
        const salaryInfo = calculateEmployeeSalary(employee, exchangeRates);

        return {
            totalLoans,
            totalDeductions,
            basicSalary: salaryInfo.basic,
            netSalary: salaryInfo.total - totalDeductions // Approximate
        };
    }, [employee, employeeLoans, employeeDeductions, exchangeRates]);

    const handleExport = () => {
        if (!employee) return;

        const wb = XLSX.utils.book_new();

        // 1. Basic Info
        const infoData = [
            ['البيانات الأساسية للموظف'],
            ['الاسم', employee.name],
            ['الفرع', employee.branch],
            ['رقم الهاتف', employee.phone],
            ['رقم الحساب', employee.systemAccountNumber],
            ['المسمى الوظيفي', employee.position || 'موظف'],
            [''],
            ['الملخص المالي'],
            ['الراتب الأساسي', stats?.basicSalary],
            ['إجمالي السلف المعتمدة', stats?.totalLoans],
            ['إجمالي الخصميات', stats?.totalDeductions],
            ['صافي تقريبي', stats?.netSalary]
        ];
        const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
        XLSX.utils.book_append_sheet(wb, wsInfo, 'الملخص');

        // 2. Loans
        const loansHeader = ['التاريخ', 'المبلغ', 'العملة', 'الحالة', 'بواسطة'];
        const loansData = employeeLoans.map(l => [
            l.date,
            l.requestedAmount,
            getCurrencySymbol(l.currency || 'old_rial'),
            l.isApproved ? 'معتمد' : l.isRejected ? 'مرفوض' : 'معلق',
            l.approvedByName || l.rejectedByName || '-'
        ]);
        const wsLoans = XLSX.utils.aoa_to_sheet([loansHeader, ...loansData]);
        XLSX.utils.book_append_sheet(wb, wsLoans, 'سجل السلف');

        // 3. Deductions
        const deductionsHeader = ['التاريخ', 'الشهر', 'النوع', 'المبلغ', 'الحالة', 'السبب/الملاحظات'];
        const deductionsData = employeeDeductions.map(d => [
            d.date,
            d.month,
            d.type === 'verbal_warning' ? 'إنذار شفهي' : 'خصم مالي',
            d.amount,
            d.isExempted ? 'معفى' : 'مسجل',
            d.isExempted ? d.exemptionReason : d.notes
        ]);
        const wsDeductions = XLSX.utils.aoa_to_sheet([deductionsHeader, ...deductionsData]);
        XLSX.utils.book_append_sheet(wb, wsDeductions, 'سجل الخصميات');

        XLSX.writeFile(wb, `تقرير_مالي_${employee.name}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    if (!isOpen || !employee) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] transition-opacity animate-fade-in"
                onClick={onClose}
            />

            {/* Drawer */}
            <div
                className="fixed inset-y-0 left-0 w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl z-[70] transform transition-transform duration-500 ease-out animate-slide-in-left border-r border-slate-200 dark:border-slate-800 flex flex-col"
                dir="rtl"
            >
                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <div className={`size-12 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-lg transition-all ${!employee.isActive ? 'grayscale opacity-50' : ''} ${getBranchColorClasses(employee.branch)}`}>
                            {employee.name.charAt(0)}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight">{employee.name}</h2>
                                {!employee.isActive && (
                                    <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[9px] font-black rounded uppercase tracking-tighter border border-red-200 dark:border-red-800/50">غير نشط</span>
                                )}
                            </div>
                            <p className="text-xs font-bold text-slate-500">{employee.branch} • {employee.position || 'موظف'}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 thin-scrollbar">
                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-3xl border border-indigo-100 dark:border-indigo-900/30">
                            <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 block mb-1">الراتب الأساسي</span>
                            <div className="text-xl font-black text-slate-800 dark:text-white">
                                {stats?.basicSalary.toLocaleString()}
                                <span className="text-xs mr-1">{getCurrencySymbol(employee.salaryCurrency)}</span>
                            </div>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-3xl border border-emerald-100 dark:border-emerald-900/30">
                            <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 block mb-1">إجمالي السلف (المعتمدة)</span>
                            <div className="text-xl font-black text-slate-800 dark:text-white">
                                {stats?.totalLoans.toLocaleString()}
                                <span className="text-xs mr-1">{getCurrencySymbol(employee.salaryCurrency)}</span>
                            </div>
                        </div>
                        <div className="bg-pink-50 dark:bg-pink-900/20 p-4 rounded-3xl border border-pink-100 dark:border-pink-900/30">
                            <span className="text-[10px] font-black text-pink-600 dark:text-pink-400 block mb-1">إجمالي الخصميات</span>
                            <div className="text-xl font-black text-slate-800 dark:text-white text-pink-600">
                                -{stats?.totalDeductions.toLocaleString()}
                                <span className="text-xs mr-1">{getCurrencySymbol(employee.salaryCurrency)}</span>
                            </div>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-3xl border border-amber-100 dark:border-amber-900/30">
                            <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 block mb-1">صافي تقريبي</span>
                            <div className="text-xl font-black text-slate-800 dark:text-white">
                                {stats?.netSalary.toLocaleString()}
                                <span className="text-xs mr-1">{getCurrencySymbol(employee.salaryCurrency)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Timeline sections */}
                    <div className="space-y-6">
                        {/* Loans Section */}
                        <div className="space-y-3">
                            <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2 px-2">
                                <span className="material-symbols-outlined text-emerald-600">payments</span>
                                سجل السلف
                            </h3>
                            <div className="space-y-2">
                                {employeeLoans.length === 0 ? (
                                    <p className="text-xs text-slate-400 text-center py-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl italic">لا توجد سلف سابقة</p>
                                ) : employeeLoans.map(loan => (
                                    <div key={loan.id} className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-between group hover:border-emerald-200 transition-all">
                                        <div>
                                            <div className="font-bold text-sm text-slate-800 dark:text-white">{loan.requestedAmount.toLocaleString()} {getCurrencySymbol(loan.currency || 'old_rial')}</div>
                                            <div className="text-[10px] text-slate-400 font-bold">{loan.date}</div>
                                        </div>
                                        <div className="text-left">
                                            {loan.isApproved ? (
                                                <span className="text-[9px] font-black bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full uppercase">معتمد</span>
                                            ) : loan.isRejected ? (
                                                <span className="text-[9px] font-black bg-red-100 text-red-600 px-2 py-0.5 rounded-full uppercase" title={loan.rejectionReason}>مرفوض</span>
                                            ) : (
                                                <span className="text-[9px] font-black bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full uppercase">معلق</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Deductions Section */}
                        <div className="space-y-3">
                            <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2 px-2">
                                <span className="material-symbols-outlined text-pink-600">money_off</span>
                                سجل الخصميات
                            </h3>
                            <div className="space-y-2">
                                {employeeDeductions.length === 0 ? (
                                    <p className="text-xs text-slate-400 text-center py-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl italic">لا توجد خصميات أو إنذارات</p>
                                ) : employeeDeductions.map(deduction => (
                                    <div key={deduction.id} className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-between group hover:border-pink-200 transition-all">
                                        <div>
                                            <div className={`font-bold text-sm ${deduction.isExempted ? 'text-emerald-600' : 'text-pink-600'}`}>
                                                {deduction.amount > 0 ? `-${deduction.amount.toLocaleString()}` : deduction.type === 'verbal_warning' ? 'إنذار شفهي' : 'إنذار كامل'}
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-bold">{deduction.date} • {deduction.month}</div>
                                        </div>
                                        <div className="text-left">
                                            {deduction.isExempted ? (
                                                <span className="text-[9px] font-black bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full uppercase" title={deduction.exemptionReason}>معفى</span>
                                            ) : (
                                                <span className="text-[9px] font-black bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full uppercase">مسجل</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <button
                        onClick={handleExport}
                        className="w-full py-4 bg-slate-800 dark:bg-white dark:text-slate-900 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
                    >
                        <span className="material-symbols-outlined">download</span>
                        تصدير التقرير المالي (Excel)
                    </button>
                </div>
            </div>
        </>
    );
};

export default EmployeeDrawer;
