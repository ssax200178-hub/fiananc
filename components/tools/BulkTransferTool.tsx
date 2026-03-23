import React, { useState } from 'react';
import { useAppContext } from '../../AppContext';
import { confirmDialog } from '../../utils/confirm';

import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';

const BulkTransferTool: React.FC = () => {
    const { currentUser, activityLogs } = useAppContext();
    const [period, setPeriod] = useState<'monthly' | 'semi-monthly'>('monthly');
    const [isExecuting, setIsExecuting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [total, setTotal] = useState(0);
    const [resultMessage, setResultMessage] = useState<string | null>(null);

    const executeBulkTransfer = async () => {
        const isConfirmed = await confirmDialog(`هل أنت متأكد من تنفيذ تحويل أرصدة المطاعم ذات الدفع ${period === 'monthly' ? 'الشهري' : 'النصف شهري'}؟`, {
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

            const targetRestaurants = snapshot.docs.filter(doc => {
                const data = doc.data();
                return data.isActive && data.paymentPeriod === period && (data.balance || 0) > 0;
            });

            setTotal(targetRestaurants.length);

            if (targetRestaurants.length === 0) {
                setResultMessage('لا توجد مطاعم مطابقة للشروط أو بأرصدة موجبة.');
                setIsExecuting(false);
                return;
            }

            const batchCount = Math.ceil(targetRestaurants.length / 500);
            let processed = 0;

            for (let i = 0; i < batchCount; i++) {
                const batch = writeBatch(db);
                const currentBatchDocs = targetRestaurants.slice(i * 500, (i + 1) * 500);

                for (const restaurantDoc of currentBatchDocs) {
                    const ref = doc(db, 'restaurants', restaurantDoc.id);
                    batch.update(ref, { balance: 0, updatedAt: new Date().toISOString() });
                    // Usually you'd also create an ActivityLog or Payment History record here
                }

                await batch.commit();
                processed += currentBatchDocs.length;
                setProgress(processed);
            }

            setResultMessage(`تم بنجاح تصفير أرصدة ${processed} مطعم.`);
        } catch (error: any) {
            console.error("Bulk transfer error:", error);
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
                        <span className="material-symbols-outlined text-[#C62828] text-3xl">currency_exchange</span>
                        أداة تحويل الأرصدة المجمعة
                    </h1>
                    <p className="text-slate-500 font-bold">قم بتصفير أرصدة المطاعم بناءً على فترة الدفع.</p>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <div className="max-w-md mx-auto space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">فترة الدفع المستهدفة</label>
                        <select
                            value={period}
                            onChange={(e) => setPeriod(e.target.value as any)}
                            className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 font-bold"
                            disabled={isExecuting}
                        >
                            <option value="monthly">شهري</option>
                            <option value="semi-monthly">نصف شهري</option>
                        </select>
                    </div>

                    <button
                        onClick={executeBulkTransfer}
                        disabled={isExecuting}
                        className="w-full bg-[#C62828] hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className="material-symbols-outlined">
                            {isExecuting ? 'hourglass_empty' : 'play_arrow'}
                        </span>
                        {isExecuting ? 'جاري التنفيذ...' : 'بدء التحويل'}
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

export default BulkTransferTool;
