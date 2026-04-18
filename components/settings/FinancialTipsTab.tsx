import React from 'react';
import { useAppContext } from '../../AppContext';
import type { TipType } from '../../AppContext';

interface FinancialTipsTabProps {
    financialTips: any[];
    addFinancialTip: (text: string, type: TipType, icon: string) => Promise<void>;
    updateFinancialTip: (id: string, updates: any) => Promise<void>;
    deleteFinancialTip: (id: string) => Promise<void>;
    setTipToPreview: (tip: any) => void;
    setIsPreviewModalOpen: (open: boolean) => void;
    currentUser: any;
}

const FinancialTipsTab: React.FC<FinancialTipsTabProps> = ({
    financialTips,
    addFinancialTip,
    updateFinancialTip,
    deleteFinancialTip,
    setTipToPreview,
    setIsPreviewModalOpen,
    currentUser
}) => {
    if (currentUser?.role === 'user') {
        return (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-2xl p-8 text-center">
                <span className="material-symbols-outlined text-6xl text-yellow-600 dark:text-yellow-400">block</span>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-4">صلاحيات محدودة</h3>
                <p className="text-slate-600 dark:text-slate-400 mt-2">ليس لديك صلاحية الوصول لإدارة النصائح</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">tips_and_updates</span>
                            إدارة النصائح المالية والتنبيهات
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">أضف نصائح أو تنبيهات تظهر للموظفين في لوحة التحكم</p>
                    </div>
                </div>

                <div className="p-6">
                    <form onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.target as HTMLFormElement;
                        const text = (form.elements.namedItem('tip-text') as HTMLTextAreaElement).value;
                        const type = (form.elements.namedItem('tip-type') as HTMLSelectElement).value as TipType;

                        let icon = 'lightbulb';
                        if (type === 'alert') icon = 'notifications_active';
                        if (type === 'warning') icon = 'warning';
                        if (type === 'guidance') icon = 'direction';

                        await addFinancialTip(text, type, icon);
                        form.reset();
                        alert('تمت الإضافة بنجاح ✅');
                    }} className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 mb-8 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">نص النصيحة / التنبيه</label>
                                <textarea
                                    id="tip-text"
                                    name="tip-text"
                                    required
                                    placeholder="اكتب النصيحة المالية أو التوجيه هنا..."
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-[var(--color-active)] outline-none min-h-[100px] font-bold"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">نوع الرسالة</label>
                                <select
                                    id="tip-type"
                                    name="tip-type"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-[var(--color-active)] outline-none font-bold"
                                >
                                    <option value="tip">نصيحة مالية</option>
                                    <option value="alert">تنبيه هام</option>
                                    <option value="guidance">توجيه إداري</option>
                                    <option value="warning">تحذير</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-3 justify-end">
                                <button
                                    type="submit"
                                    className="w-full py-3 bg-[var(--color-header)] text-white font-black rounded-xl hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/10"
                                >
                                    <span className="material-symbols-outlined">add_circle</span>
                                    إضافة للوحة
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const form = document.querySelector('form') as HTMLFormElement;
                                        const textInput = form.elements.namedItem('tip-text') as HTMLTextAreaElement;
                                        const typeInput = form.elements.namedItem('tip-type') as HTMLSelectElement;
                                        if (!textInput.value) return alert('الرجاء كتابة نص للمعاينة');

                                        let icon = 'lightbulb';
                                        if (typeInput.value === 'alert') icon = 'notifications_active';
                                        if (typeInput.value === 'warning') icon = 'warning';
                                        if (typeInput.value === 'guidance') icon = 'direction';

                                        setTipToPreview({ text: textInput.value, type: typeInput.value, icon });
                                        setIsPreviewModalOpen(true);
                                    }}
                                    className="w-full py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-white font-black rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined">visibility</span>
                                    معاينة
                                </button>
                            </div>
                        </div>
                    </form>

                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">list</span>
                            الرسائل الحالية
                        </h3>
                        {financialTips?.length === 0 ? (
                            <div className="text-center py-10 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-700">
                                لا توجد نصائح مضافة حالياً.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {financialTips.map((tip: any) => (
                                    <div key={tip.id} className="flex flex-col md:flex-row items-center justify-between p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:shadow-lg transition-all gap-4">
                                        <div className="flex items-center gap-5 flex-1">
                                            <div className={`size-12 rounded-2xl flex items-center justify-center shadow-sm ${tip.type === 'warning' ? 'bg-red-50 text-red-600' :
                                                tip.type === 'alert' ? 'bg-orange-50 text-orange-600' :
                                                    tip.type === 'guidance' ? 'bg-blue-50 text-blue-600' :
                                                        'bg-amber-50 text-amber-600'
                                                }`}>
                                                <span className="material-symbols-outlined text-2xl">{tip.icon}</span>
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-black text-slate-900 dark:text-white leading-relaxed">{tip.text}</p>
                                                <div className="flex gap-2 mt-2">
                                                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-black">
                                                        {tip.type === 'tip' ? '💡 نصيحة' : tip.type === 'alert' ? '🔔 تنبيه' : tip.type === 'warning' ? '⚠️ تحذير' : '📝 توجيه'}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 flex items-center gap-1 font-bold">
                                                        <span className="material-symbols-outlined text-[12px]">calendar_today</span>
                                                        {new Date(tip.createdAt).toLocaleDateString('ar-SA')}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 w-full md:w-auto shrink-0 border-t md:border-t-0 pt-4 md:pt-0 border-slate-100 dark:border-slate-700">
                                            <button
                                                onClick={() => {
                                                    setTipToPreview(tip);
                                                    setIsPreviewModalOpen(true);
                                                }}
                                                className="flex-1 md:flex-none px-4 py-2 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-sm">visibility</span>
                                                معاينة
                                            </button>
                                            <button
                                                onClick={() => updateFinancialTip(tip.id, { isActive: !tip.isActive })}
                                                className={`p-2 rounded-xl transition-all ${tip.isActive ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-400 opacity-50'}`}
                                                title={tip.isActive ? "نشطة" : "معطلة"}
                                            >
                                                <span className="material-symbols-outlined">{tip.isActive ? 'visibility' : 'visibility_off'}</span>
                                            </button>
                                            <button
                                                onClick={() => deleteFinancialTip(tip.id)}
                                                className="px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-red-100 transition-colors"
                                                title="حذف"
                                            >
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                                حذف
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FinancialTipsTab;
