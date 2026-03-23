import React, { useState } from 'react';
import { useAppContext } from '../../AppContext';
import { confirmDialog } from '../../utils/confirm';

import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';

const CurrencySyncTool: React.FC = () => {
    const { currentUser, activityLogs } = useAppContext();
    const [isExecuting, setIsExecuting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [total, setTotal] = useState(0);
    const [resultMessage, setResultMessage] = useState<string | null>(null);

    const executeCurrencySync = async () => {
        const isConfirmed = await confirmDialog(`هل أنت متأكد من تنفيذ مزامنة عملة الحساب لجميع المطاعم؟\nسيتم تعيين العملة إلى (الريال القديم) للمطاعم في صنعاء، و(الريال الجديد) لبقية الفروع إذا لم تكن محددة.`, {
            type: 'warning'
        });
        if (!isConfirmed) {
            return;
        }

        setIsExecuting(true);
        setResultMessage(null);
        setProgress(0);
        setTotal(0);

        try {
            const restaurantsRef = collection(db, 'restaurants');
            const snapshot = await getDocs(restaurantsRef);

            const targetRestaurants = snapshot.docs;
            setTotal(targetRestaurants.length);

            if (targetRestaurants.length === 0) {
                setResultMessage('لا توجد مطاعم مطابقة للشروط.');
                setIsExecuting(false);
                return;
            }

            const batchCount = Math.ceil(targetRestaurants.length / 500);
            let processed = 0;

            for (let i = 0; i < batchCount; i++) {
                const batch = writeBatch(db);
                const currentBatchDocs = targetRestaurants.slice(i * 500, (i + 1) * 500);

                for (const restaurantDoc of currentBatchDocs) {
                    const data = restaurantDoc.data();
                    let targetCurrency = data.currencyType;

                    if (!targetCurrency) {
                        if (data.branch === 'صنعاء') {
                            targetCurrency = 'old_riyal';
                        } else {
                            targetCurrency = 'new_riyal';
                        }

                        const ref = doc(db, 'restaurants', restaurantDoc.id);
                        batch.update(ref, { currencyType: targetCurrency, updatedAt: new Date().toISOString() });
                    }
                }

                await batch.commit();
                processed += currentBatchDocs.length;
                setProgress(processed);
            }

            setResultMessage(`تم بنجاح فحص/تحديث عملات ${processed} مطعم.`);
        } catch (error: any) {
            console.error("Currency sync error:", error);
            setResultMessage(`حدث خطأ: ${error.message}`);
        } finally {
            setIsExecuting(false);
        }
    };

    if (!currentUser?.permissions?.includes('tools_manage') && currentUser?.role !== 'super_admin') {
        return <div className="p-6 text-center text-red-500 font-bold">عذراً، لا تملك الصلاحية للوصول إلى هذه الأداة.</div>;
    }

    return (
        <div className="space-y-6 animate-fade-in" dir="rtl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 dark:text-white mb-2 flex items-center gap-3">
                        <span className="material-symbols-outlined text-[#C62828] text-3xl">sync</span>
                        أداة مزامنة عملة الحساب
                    </h1>
                    <p className="text-slate-500 font-bold">مزامنة وتصحيح عملة الحساب (ريال قديم/جديد) لجميع المطاعم بناءً على الفروع.</p>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <div className="max-w-md mx-auto space-y-6">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30">
                        <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">info</span>
                            آلية العمل
                        </h3>
                        <ul className="list-disc list-inside text-sm text-blue-700 dark:text-blue-400 space-y-1">
                            <li>فحص جميع المطاعم المسجلة في النظام.</li>
                            <li>المطاعم التي ليس لها عملة محددة ستيم تعيين عملتها بناءً على الفرع.</li>
                            <li>فرع (صنعاء) = ريال قديم. بقية الفروع = ريال جديد.</li>
                        </ul>
                    </div>

                    <button
                        onClick={executeCurrencySync}
                        disabled={isExecuting}
                        className="w-full bg-[#C62828] hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className="material-symbols-outlined">
                            {isExecuting ? 'hourglass_empty' : 'sync'}
                        </span>
                        {isExecuting ? 'جاري التنفيذ...' : 'بدء المزامنة'}
                    </button>

                    {isExecuting && total > 0 && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-bold text-slate-500">
                                <span>التقدم</span>
                                <span>{progress} / {total}</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2.5 dark:bg-slate-700">
                                <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${(progress / total) * 100}%` }}></div>
                            </div>
                        </div>
                    )}

                    {resultMessage && (
                        <div className={`p-4 rounded-xl font-bold text-sm text-center ${resultMessage.includes('خطأ') ? 'bg-red-100 text-red-700 dark:bg-red-900/30' : 'bg-green-100 text-green-700 dark:bg-green-900/30'}`}>
                            {resultMessage}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CurrencySyncTool;
