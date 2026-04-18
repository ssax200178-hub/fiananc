import React from 'react';
import type { ExchangeRateHistory } from '../../AppContext';

interface ExchangeRatesTabProps {
    exchangeRates: {
        SAR_TO_OLD_RIAL: number;
        SAR_TO_NEW_RIAL: number;
        updatedAt?: string;
        updatedBy?: string;
    };
    rateForm: {
        SAR_TO_OLD_RIAL: number;
        SAR_TO_NEW_RIAL: number;
    };
    setRateForm: (form: any) => void;
    updateExchangeRates: (form: any) => Promise<void>;
    isSavingRates: boolean;
    loadRateHistory: () => void;
    setShowHistoryModal: (show: boolean) => void;
}

const ExchangeRatesTab: React.FC<ExchangeRatesTabProps> = ({
    exchangeRates,
    rateForm,
    setRateForm,
    updateExchangeRates,
    isSavingRates,
    loadRateHistory,
    setShowHistoryModal
}) => {
    return (
        <div className="space-y-6 max-w-2xl">
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">currency_exchange</span>
                        أسعار صرف العملات
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">تحديد أسعار تحويل الريال السعودي إلى الريال اليمني</p>
                </div>

                <div className="p-6 space-y-6">
                    {/* آخر تحديث */}
                    {exchangeRates.updatedAt && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center justify-between gap-3 text-sm">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-blue-500">schedule</span>
                                <div>
                                    <span className="text-slate-600 dark:text-slate-300">آخر تحديث: </span>
                                    <span className="font-bold text-slate-900 dark:text-white">{new Date(exchangeRates.updatedAt).toLocaleString('ar-SA')}</span>
                                    {exchangeRates.updatedBy && (
                                        <span className="text-slate-500 dark:text-slate-400"> — بواسطة {exchangeRates.updatedBy}</span>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setShowHistoryModal(true);
                                    loadRateHistory();
                                }}
                                className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-xs font-bold underline px-2 py-1 flex items-center gap-1 bg-indigo-100/50 dark:bg-indigo-900/30 rounded-lg transition-colors"
                            >
                                <span className="material-symbols-outlined text-[16px]">history</span> سجل التعديلات
                            </button>
                        </div>
                    )}

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
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">ر.ق</span>
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
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">ر.ج</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">الحالي: {exchangeRates.SAR_TO_NEW_RIAL.toLocaleString()}</p>
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
                        onClick={async () => {
                            if (rateForm.SAR_TO_OLD_RIAL <= 0 || rateForm.SAR_TO_NEW_RIAL <= 0) {
                                alert('يرجى إدخال أسعار صرف صحيحة');
                                return;
                            }
                            try {
                                await updateExchangeRates(rateForm);
                                alert('✅ تم تحديث أسعار الصرف بنجاح');
                            } catch (e: any) {
                                console.error(e);
                                alert('❌ فشل تحديث أسعار الصرف');
                            }
                        }}
                        disabled={isSavingRates}
                        className="w-full py-4 bg-[var(--color-header)] text-white font-black rounded-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 text-lg"
                    >
                        {isSavingRates ? (
                            <><span className="material-symbols-outlined animate-spin">sync</span> جاري الحفظ...</>
                        ) : (
                            <><span className="material-symbols-outlined">save</span> حفظ أسعار الصرف</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExchangeRatesTab;
