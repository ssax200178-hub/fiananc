import React, { useState, useEffect } from 'react';

interface ColumnMappingModalProps {
    isOpen: boolean;
    onClose: () => void;
    headers: string[];
    side: 'company' | 'restaurant' | null;
    onConfirm: (mapping: { amount: string; date: string; reference: string; partyRef: string }) => void;
}

const ColumnMappingModal: React.FC<ColumnMappingModalProps> = ({ isOpen, onClose, headers, side, onConfirm }) => {
    const [mapping, setMapping] = useState({
        amount: '',
        date: '',
        reference: '',
        partyRef: ''
    });

    // Reset mapping when modal opens
    useEffect(() => {
        if (isOpen) {
            // Auto-detect if possible
            const newMapping = { amount: '', date: '', reference: '', partyRef: '' };

            headers.forEach((h) => {
                const lower = h.toLowerCase();
                // Amount: مبلغ, رصيد, القيمة, Amount, Balance, Value, Debit, Credit
                if (lower.includes('amount') || lower.includes('مبلغ') || lower.includes('balance') || lower.includes('رصيد') || lower.includes('قيمة') || lower.includes('value') || lower.includes('مدين') || lower.includes('دائن')) {
                    if (!newMapping.amount) newMapping.amount = h;
                }
                // Date: تاريخ, وقت, يوم, Date, Time, Day, Period
                if (lower.includes('date') || lower.includes('تاريخ') || lower.includes('time') || lower.includes('وقت') || lower.includes('يوم') || lower.includes('day')) {
                    if (!newMapping.date) newMapping.date = h;
                }
                // Reference: مرجع, رقم, قيد, مستند, Ref, ID, No, Doc, Number, Serial
                if (lower.includes('ref') || lower.includes('مرجع') || lower.includes('id') || lower.includes('رقم') || lower.includes('قيد') || lower.includes('مستند') || lower.includes('serial') || lower.includes('number')) {
                    if (!newMapping.reference) newMapping.reference = h;
                }
            });
            setMapping(newMapping);
        }
    }, [isOpen, headers]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm(mapping);
        onClose();
    };

    const sideLabel = side === 'company' ? 'الشركة' : 'المطعم';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-[#1e293b] w-full max-w-md rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-[#0f172a]">
                    <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-500">table_chart</span>
                        تحديد الأعمدة
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">يرجى ربط أعمدة ملف الإكسل بحقول النظام ({sideLabel}).</p>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Amount Column */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm text-amber-500">payments</span>
                            عمود المبلغ *
                        </label>
                        <select
                            value={mapping.amount}
                            onChange={e => setMapping({ ...mapping, amount: e.target.value })}
                            className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-blue-500"
                            required
                        >
                            <option value="">-- اختر العمود --</option>
                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    {/* Date Column */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm text-blue-500">calendar_today</span>
                            عمود التاريخ *
                        </label>
                        <select
                            value={mapping.date}
                            onChange={e => setMapping({ ...mapping, date: e.target.value })}
                            className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-blue-500"
                            required
                        >
                            <option value="">-- اختر العمود --</option>
                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    {/* Reference Column */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm text-indigo-500">tag</span>
                            عمود الرقم المرجعي *
                        </label>
                        <select
                            value={mapping.reference}
                            onChange={e => setMapping({ ...mapping, reference: e.target.value })}
                            className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-blue-500"
                            required
                        >
                            <option value="">-- اختر العمود --</option>
                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    {/* Party-Specific Reference Column (Optional) */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm text-violet-500">description</span>
                            مرجع {sideLabel} (اختياري)
                        </label>
                        <p className="text-[10px] text-slate-400">عمود إضافي خاص بمرجع الطرف (مثل رقم الفاتورة الداخلي)</p>
                        <select
                            value={mapping.partyRef}
                            onChange={e => setMapping({ ...mapping, partyRef: e.target.value })}
                            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">-- لا يوجد --</option>
                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                            إلغاء
                        </button>
                        <button
                            type="submit"
                            disabled={!mapping.amount || !mapping.date || !mapping.reference}
                            className="flex-1 px-4 py-3 rounded-xl font-bold bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 transition-all"
                        >
                            تأكيد واستيراد
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ColumnMappingModal;
