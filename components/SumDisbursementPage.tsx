import React, { useState, useMemo } from 'react';
import { useAppContext } from '../AppContext';

const SumDisbursementPage: React.FC = () => {
    const { currentUser, featureFlags, phonePayments, invoiceBatches, allInvoiceBatchItems } = useAppContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState<'all' | 'invoices' | 'phones'>('all');

    if (featureFlags.sum_disbursement === false && currentUser?.role !== 'super_admin') {
        return <div className="p-6 text-center text-red-500 font-bold">هذه الميزة غير مفعلة حالياً.</div>;
    }

    if (!currentUser?.permissions?.includes('invoice_manage') && currentUser?.role !== 'super_admin') {
        return <div className="p-6 text-center text-red-500 font-bold">عذراً، لا تملك الصلاحية للوصول إلى هذه الصفحة.</div>;
    }

    const allDisbursements = useMemo(() => {
        const mappedPhones = (phonePayments || []).map(p => ({
            id: `phone_${p.id}`,
            date: p.paymentDate || p.createdAt || new Date().toISOString(),
            type: 'phone' as const,
            title: `سداد هاتف: ${p.branchName || 'فرع غير معروف'} - ${p.phoneNumber}`,
            amount: Number(p.amount) || 0,
            currency: p.currency || 'old_riyal',
            details: p.provider || '',
            notes: p.notes || '',
            searchKey: `${p.branchName} ${p.phoneNumber} ${p.provider}`
        }));

        const mappedInvoices = (allInvoiceBatchItems || []).map(item => ({
            id: `item_${item.id}`,
            date: item.disbursementDate || new Date().toISOString(),
            type: 'invoice' as const,
            title: `صرف دفاتر: ${item.branchName || 'فرع غير معروف'} - ${item.disbursementDescription || ''}`,
            amount: Number(item.amountOld) || 0,
            currency: 'old_riyal' as const,
            details: `بداية: ${item.rangeFrom} - نهاية: ${item.rangeTo} (${item.bookletCount} دفتر)`,
            notes: '',
            searchKey: `${item.branchName} ${item.disbursementDescription} ${item.rangeFrom}`
        }));

        const merged = [...mappedPhones, ...mappedInvoices];

        // Sort by date descending
        return merged.sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return (dateB || 0) - (dateA || 0);
        });
    }, [phonePayments, allInvoiceBatchItems]);

    const filteredDisbursements = useMemo(() => {
        let result = allDisbursements;

        if (filterCategory !== 'all') {
            const catType = filterCategory === 'invoices' ? 'invoice' : 'phone';
            result = result.filter(d => d.type === catType);
        }

        if (searchTerm.trim()) {
            const lowerSearch = searchTerm.toLowerCase();
            result = result.filter(d => d.searchKey.toLowerCase().includes(lowerSearch));
        }

        return result;
    }, [allDisbursements, searchTerm, filterCategory]);

    // Totals
    const totals = useMemo(() => {
        return filteredDisbursements.reduce((acc, item) => {
            if (item.currency === 'new_riyal') acc.newRiyal += item.amount;
            else acc.oldRiyal += item.amount;
            return acc;
        }, { newRiyal: 0, oldRiyal: 0 });
    }, [filteredDisbursements]);

    return (
        <div className="p-4 md:p-8 space-y-6 animate-fade-in" dir="rtl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-teal-600">payments</span>
                        تجميع الصرف
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-bold">
                        تجميع وعرض ملخص لإجمالي الصرف للفواتير ومدفوعات الهواتف معاً.
                    </p>
                </div>
            </div>

            {/* Totals Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-3xl p-6 text-white shadow-lg shadow-teal-200 dark:shadow-none">
                    <p className="text-teal-100 text-sm font-bold">إجمالي المصروفات (ريال قديم)</p>
                    <p className="text-3xl font-black mt-1 font-mono">{totals.oldRiyal.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-3xl p-6 text-white shadow-lg shadow-emerald-200 dark:shadow-none">
                    <p className="text-emerald-100 text-sm font-bold">إجمالي المصروفات (ريال جديد)</p>
                    <p className="text-3xl font-black mt-1 font-mono">{totals.newRiyal.toLocaleString()}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 items-end">
                <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 mr-2">تصفية حسب النوع</label>
                    <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as any)}
                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl px-4 py-3 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-teal-500 transition-all">
                        <option value="all">الكل (فواتير وهواتف)</option>
                        <option value="invoices">دفعات الفواتير فقط</option>
                        <option value="phones">سداد الهواتف فقط</option>
                    </select>
                </div>
                <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-black text-slate-400 mr-2">بحث (في التفاصيل)</label>
                    <input type="text" placeholder="اسم الدفعة، رقم الهاتف، الفرع..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl px-4 py-3 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-teal-500 transition-all" />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50">
                                <th className="px-6 py-5 text-right text-sm font-black text-slate-500">التاريخ</th>
                                <th className="px-6 py-5 text-right text-sm font-black text-slate-500">النوع</th>
                                <th className="px-6 py-5 text-right text-sm font-black text-slate-500">التفاصيل الأساسية</th>
                                <th className="px-6 py-5 text-right text-sm font-black text-slate-500">نوع العملة</th>
                                <th className="px-6 py-5 text-right text-sm font-black text-slate-500">المبلغ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredDisbursements.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <span className="material-symbols-outlined text-6xl text-slate-200 dark:text-slate-700">payments</span>
                                            <p className="text-slate-400 font-bold mt-2">لا توجد حركات صرف مطابقة للفلتر</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredDisbursements.map(item => (
                                <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 font-bold">
                                        {new Date(item.date).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 rounded-lg text-xs font-black inline-flex items-center gap-1 ${item.type === 'invoice' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20' : 'bg-purple-50 text-purple-600 dark:bg-purple-900/20'
                                            }`}>
                                            <span className="material-symbols-outlined text-[14px]">
                                                {item.type === 'invoice' ? 'receipt_long' : 'phone_iphone'}
                                            </span>
                                            {item.type === 'invoice' ? 'فاتورة' : 'هاتف'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-slate-800 dark:text-white">{item.title}</p>
                                        <p className="text-xs text-slate-500 mt-1">{item.details}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 rounded-lg text-xs font-black ${item.currency === 'new_riyal' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                            }`}>
                                            {item.currency === 'new_riyal' ? 'ريال جديد' : 'ريال قديم'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-mono font-black text-xl text-slate-800 dark:text-white">
                                        {item.amount.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SumDisbursementPage;
