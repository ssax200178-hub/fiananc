import React, { useState } from 'react';

interface ExchangeRates {
    SAR_TO_OLD_RIAL: number;
    SAR_TO_NEW_RIAL: number;
}

interface Props {
    exchangeRates: ExchangeRates;
    onUpdate: (rates: ExchangeRates) => Promise<void>;
}

export const ExchangeRateManagementUI: React.FC<Props> = ({ exchangeRates, onUpdate }) => {
    const [rateForm, setRateForm] = useState<ExchangeRates>({ ...exchangeRates });
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (rateForm.SAR_TO_OLD_RIAL <= 0 || rateForm.SAR_TO_NEW_RIAL <= 0) {
            alert('يرجى إدخال أسعار صرف صحيحة');
            return;
        }
        setIsSaving(true);
        try {
            await onUpdate(rateForm);
            alert('✅ تم تحديث أسعار الصرف بنجاح');
        } catch (error) {
            console.error(error);
            alert('❌ فشل تحديث أسعار الصرف');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* SAR → ريال قديم */}
                <div className="space-y-2">
                    <label className="block text-sm font-black text-slate-700 dark:text-slate-300">
                        🇸🇦 ريال سعودي واحد → ريال قديم (ر.ق)
                    </label>
                    <div className="relative">
                        <input
                            type="number"
                            step="0.01"
                            value={rateForm.SAR_TO_OLD_RIAL || ''}
                            onChange={e => setRateForm({ ...rateForm, SAR_TO_OLD_RIAL: Number(e.target.value) })}
                            className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl dark:text-white font-mono text-xl font-black focus:ring-2 focus:ring-[var(--color-active)] outline-none"
                            placeholder="مثال: 150.00"
                        />
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-arabic">ر.ق</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">الحالي: {exchangeRates.SAR_TO_OLD_RIAL.toLocaleString()}</p>
                </div>

                {/* SAR → ريال جديد */}
                <div className="space-y-2">
                    <label className="block text-sm font-black text-slate-700 dark:text-slate-300">
                        🇸🇦 ريال سعودي واحد → ريال جديد (ر.ج)
                    </label>
                    <div className="relative">
                        <input
                            type="number"
                            step="0.01"
                            value={rateForm.SAR_TO_NEW_RIAL || ''}
                            onChange={e => setRateForm({ ...rateForm, SAR_TO_NEW_RIAL: Number(e.target.value) })}
                            className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl dark:text-white font-mono text-xl font-black focus:ring-2 focus:ring-[var(--color-active)] outline-none"
                            placeholder="مثال: 150.00"
                        />
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-arabic">ر.ج</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">الحالي: {exchangeRates.SAR_TO_NEW_RIAL.toLocaleString()}</p>
                </div>
            </div>

            {/* معاينة */}
            <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 rounded-xl border border-amber-200 dark:border-amber-800">
                <h4 className="text-sm font-black text-amber-800 dark:text-amber-300 mb-2">معاينة التحويل (100 ر.س)</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="text-slate-700 dark:text-slate-300">
                        <span className="font-bold">→ ريال قديم:</span> {(100 * rateForm.SAR_TO_OLD_RIAL).toLocaleString()} ر.ق
                    </div>
                    <div className="text-slate-700 dark:text-slate-300">
                        <span className="font-bold">→ ريال جديد:</span> {(100 * rateForm.SAR_TO_NEW_RIAL).toLocaleString()} ر.ج
                    </div>
                </div>
            </div>

            {/* زر الحفظ */}
            <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full py-4 bg-gradient-to-r from-red-600 to-rose-600 text-white font-black rounded-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 text-lg"
            >
                {isSaving ? (
                    <><span className="material-symbols-outlined animate-spin">sync</span> جاري الحفظ...</>
                ) : (
                    <><span className="material-symbols-outlined">save</span> حفظ أسعار الصرف</>
                )}
            </button>
        </div>
    );
};
