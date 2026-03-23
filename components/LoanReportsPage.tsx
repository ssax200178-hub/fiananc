import React, { useState, useMemo } from 'react';
import { useAppContext, LoanRequest } from '../AppContext';
import { getCurrencySymbol } from '../utils';
import * as XLSX from 'xlsx';

const LoanReportsPage: React.FC = () => {
    const { loanRequests, branches, currentUser } = useAppContext();
    const canViewSalary = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('salary_view');

    // Filters
    const [startDate, setStartDate] = useState<string>(
        new Date(new Date().setMonth(new Date().getMonth() - 1)).toLocaleDateString('en-GB').split('/').reverse().join('-')
    );
    const [endDate, setEndDate] = useState<string>(
        new Date().toLocaleDateString('en-GB').split('/').reverse().join('-')
    );
    const [selectedBranch, setSelectedBranch] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending' | 'rejected'>('approved');

    // Derived Data
    const activeBranches = branches.filter(b => b.isActive);

    const filteredRequests = useMemo(() => {
        return loanRequests.filter(req => {
            // Branch filter
            if (selectedBranch !== 'all' && req.branch !== selectedBranch) return false;

            // Status filter
            if (statusFilter === 'approved' && !req.isApproved) return false;
            if (statusFilter === 'pending' && (req.isApproved || req.isRejected)) return false;
            if (statusFilter === 'rejected' && !req.isRejected) return false;

            // Date filter
            if (startDate && req.date < startDate) return false;
            if (endDate && req.date > endDate) return false;

            return true;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [loanRequests, selectedBranch, statusFilter, startDate, endDate]);

    // Totals Grouped by Currency
    const totalsByCurrency = useMemo(() => {
        const totals: Record<string, { currency: string, requestedAmount: number, count: number }> = {};

        filteredRequests.forEach(req => {
            const cur = req.currency || 'old_rial';
            if (!totals[cur]) {
                totals[cur] = { currency: cur, requestedAmount: 0, count: 0 };
            }
            totals[cur].requestedAmount += (req.requestedAmount || 0);
            totals[cur].count += 1;
        });

        return Object.values(totals);
    }, [filteredRequests]);

    const handleExportExcel = () => {
        const exportData = filteredRequests.map(req => ({
            'التاريخ': req.date,
            'الفرع': req.branch,
            'اسم الموظف': req.employeeName,
            'المبلغ': req.requestedAmount,
            'العملة': getCurrencySymbol(req.currency || 'old_rial'),
            'إجمالي الراتب': req.totalSalary,
            'سعر الصرف (وقت الطلب)': req.exchangeRateAtRequest || 1,
            'حالة الطلب': req.isApproved ? 'معتمد' : (req.isRejected ? 'مرفوض' : 'معلق'),
            'بواسطة (الاعتماد/الرفض)': req.approvedByName || req.rejectedByName || '-',
            'سبب الرفض': req.rejectionReason || '-',
            'ملاحظات': req.notes || '-'
        }));

        if (exportData.length === 0) {
            alert('لا توجد بيانات لتصديرها');
            return;
        }

        const ws = XLSX.utils.json_to_sheet(exportData);
        // RTL
        ws['!dir'] = 'rtl';
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "تقارير السلف");
        XLSX.writeFile(wb, `loan_reports_${new Date().getTime()}.xlsx`);
    };

    return (
        <div className="p-4 md:p-8 space-y-6 animate-fade-in" dir="rtl">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-emerald-600">analytics</span>
                        تقارير السلف
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-bold">
                        إصدار وعرض التقارير التحليلية لسلف الموظفين حسب الفروع والعملات
                    </p>
                </div>
                <button
                    onClick={handleExportExcel}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-emerald-200 dark:shadow-none transition-all flex items-center justify-center gap-2"
                >
                    <span className="material-symbols-outlined">download</span>
                    تصدير التقرير (Excel)
                </button>
            </div>

            {/* Filters Area */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-6">
                    <span className="material-symbols-outlined text-slate-400">filter_alt</span>
                    <h3 className="font-bold text-slate-700 dark:text-white">خيارات التصفية</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Branch Filter */}
                    <div className="space-y-2">
                        <label className="text-sm font-black text-slate-500">الفرع</label>
                        <select
                            value={selectedBranch}
                            onChange={(e) => setSelectedBranch(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all appearance-none"
                        >
                            <option value="all">جميع الفروع</option>
                            {activeBranches.map(b => (
                                <option key={b.id} value={b.name}>{b.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div className="space-y-2">
                        <label className="text-sm font-black text-slate-500">حالة الطلب</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as any)}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all appearance-none"
                        >
                            <option value="all">جميع الحالات</option>
                            <option value="approved">معتمد ومرحل</option>
                            <option value="pending">غير معتمد (نشط)</option>
                            <option value="rejected">مرفوض</option>
                        </select>
                    </div>

                    {/* Date Filters */}
                    <div className="space-y-2">
                        <label className="text-sm font-black text-slate-500">من تاريخ</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-black text-slate-500">إلى تاريخ</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            {totalsByCurrency.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {totalsByCurrency.map(total => (
                        <div key={total.currency} className="bg-gradient-to-br from-indigo-50 to-emerald-50 dark:from-indigo-900/20 dark:to-emerald-900/20 p-6 rounded-[2rem] border border-indigo-100 dark:border-slate-700 flex items-center justify-between">
                            <div className="space-y-1">
                                <h4 className="text-sm font-black text-slate-600 dark:text-slate-400">إجمالي السلف المطلوبة</h4>
                                <div className="text-3xl font-black text-slate-800 dark:text-white flex items-baseline gap-2">
                                    {total.requestedAmount.toLocaleString()}
                                    <span className="text-lg text-emerald-600 dark:text-emerald-400">{getCurrencySymbol(total.currency as any)}</span>
                                </div>
                            </div>
                            <div className="text-center bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                                <span className="block text-2xl font-black text-indigo-600 dark:text-indigo-400">{total.count}</span>
                                <span className="text-xs font-bold text-slate-500">طلب</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Main Table */}
            <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50">
                                <th className="px-6 py-5 text-right text-sm font-black text-slate-500">التاريخ</th>
                                <th className="px-6 py-5 text-right text-sm font-black text-slate-500">الفرع</th>
                                <th className="px-6 py-5 text-right text-sm font-black text-slate-500">الموظف</th>
                                <th className="px-6 py-5 text-right text-sm font-black text-slate-500">المبلغ</th>
                                {canViewSalary && (
                                    <th className="px-6 py-5 text-right text-sm font-black text-slate-500">إجمالي الراتب</th>
                                )}
                                <th className="px-6 py-5 text-right text-sm font-black text-slate-500">سعر الصرف (للريال السعودي)</th>
                                <th className="px-6 py-5 text-center text-sm font-black text-slate-500">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredRequests.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <span className="material-symbols-outlined text-6xl text-slate-200 dark:text-slate-700">inbox</span>
                                            <p className="text-slate-400 font-bold">لا توجد بيانات مطابقة لمعايير البحث</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredRequests.map(req => (
                                    <tr key={req.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                                        <td className="px-6 py-4 font-mono font-bold text-slate-500 dark:text-slate-400">{req.date}</td>
                                        <td className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-300">{req.branch}</td>
                                        <td className="px-6 py-4 font-black text-slate-800 dark:text-white">{req.employeeName}</td>
                                        <td className="px-6 py-4 font-mono font-black text-emerald-600 dark:text-emerald-400 text-lg">
                                            {req.requestedAmount.toLocaleString()} {getCurrencySymbol(req.currency || 'old_rial')}
                                        </td>
                                        {canViewSalary && (
                                            <td className="px-6 py-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                                {req.totalSalary.toLocaleString()} {getCurrencySymbol(req.currency || 'old_rial')}
                                            </td>
                                        )}
                                        <td className="px-6 py-4 font-mono text-sm text-slate-500 dark:text-slate-400">
                                            {req.exchangeRateAtRequest === 1 ? '-' : req.exchangeRateAtRequest?.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {req.isApproved ? (
                                                <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-black border border-emerald-200 dark:border-emerald-800">معتمد</span>
                                            ) : req.isRejected ? (
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-xs font-black border border-red-200 dark:border-red-800">مرفوض</span>
                                                    {req.rejectionReason && <span className="text-[10px] text-red-400 truncate max-w-[100px]" title={req.rejectionReason}>{req.rejectionReason}</span>}
                                                </div>
                                            ) : (
                                                <span className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg text-xs font-black border border-amber-200 dark:border-amber-800">معلق</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default LoanReportsPage;
