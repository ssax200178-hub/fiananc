import React, { useState, useEffect } from 'react';

interface ColumnMappingModalProps {
    isOpen: boolean;
    onClose: () => void;
    headers: string[];
    onConfirm: (mapping: { amount: string; date: string; reference: string }) => void;
}

const ColumnMappingModal: React.FC<ColumnMappingModalProps> = ({ isOpen, onClose, headers, onConfirm }) => {
    const [mapping, setMapping] = useState({
        amount: '',
        date: '',
        reference: ''
    });

    // Reset mapping when modal opens
    useEffect(() => {
        if (isOpen) {
            // Auto-detect if possible
            const lowerHeaders = headers.map(h => h.toLowerCase());
            const newMapping = { amount: '', date: '', reference: '' };

            headers.forEach((h, i) => {
                const lower = h.toLowerCase();
                if (lower.includes('amount') || lower.includes('مبلغ') || lower.includes('balance') || lower.includes('رصيد')) newMapping.amount = h;
                if (lower.includes('date') || lower.includes('تاريخ') || lower.includes('time') || lower.includes('وقت')) newMapping.date = h;
                if (lower.includes('ref') || lower.includes('مرجع') || lower.includes('id') || lower.includes('رقم')) newMapping.reference = h;
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-[#162a1f] w-full max-w-md rounded-2xl shadow-xl border border-slate-200 dark:border-[#223d2d] overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-[#223d2d] bg-slate-50 dark:bg-[#112218]">
                    <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#13ec6d]">table_chart</span>
                        تحديد الأعمدة
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">يرجى ربط أعمدة ملف الإكسل بحقول النظام.</p>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Amount Column */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                            عمود المبلغ *
                        </label>
                        <select
                            value={mapping.amount}
                            onChange={e => setMapping({ ...mapping, amount: e.target.value })}
                            className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1a3124] text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-[#13ec6d]"
                            required
                        >
                            <option value="">-- اختر العمود --</option>
                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    {/* Date Column */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                            عمود التاريخ *
                        </label>
                        <select
                            value={mapping.date}
                            onChange={e => setMapping({ ...mapping, date: e.target.value })}
                            className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1a3124] text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-[#13ec6d]"
                            required
                        >
                            <option value="">-- اختر العمود --</option>
                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    {/* Reference Column */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                            عمود الرقم المرجعي *
                        </label>
                        <select
                            value={mapping.reference}
                            onChange={e => setMapping({ ...mapping, reference: e.target.value })}
                            className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1a3124] text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-[#13ec6d]"
                            required
                        >
                            <option value="">-- اختر العمود --</option>
                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-[#1a3124] transition-colors"
                        >
                            إلغاء
                        </button>
                        <button
                            type="submit"
                            disabled={!mapping.amount || !mapping.date || !mapping.reference}
                            className="flex-1 px-4 py-3 rounded-xl font-bold bg-[#13ec6d] text-[#102218] hover:bg-[#10c95d] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#13ec6d]/20 transition-all"
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
