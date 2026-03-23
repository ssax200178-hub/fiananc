import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs, query } from 'firebase/firestore';

interface HistoricPayment {
    archiveId: string;
    paymentDateLabel: string;
    archivedAt: any;
    balance: number;
    currencyType: string;
    branch: string;
    accountNumber: string;
}

const RestaurantPaymentHistoryPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const restaurantName = searchParams.get('restaurant');

    const [payments, setPayments] = useState<HistoricPayment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!restaurantName) return;
        fetchHistory();
    }, [restaurantName]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const archivesRef = collection(db, 'archives');
            const q = query(archivesRef);
            const querySnapshot = await getDocs(q);

            const fetchedPayments: HistoricPayment[] = [];

            querySnapshot.docs.forEach(doc => {
                const archive = doc.data();
                if (archive.restaurants && Array.isArray(archive.restaurants)) {
                    // Find the restaurant in this archive (try ID first, then Name)
                    const matchedRestaurant = archive.restaurants.find((r: any) => {
                        // If we have an ID to match against (not currently passed but prepared for future)
                        // const matchesId = r.id === restaurantId; 

                        // Robust Name Matching
                        if (!r.name || !restaurantName) return false;
                        const cleanRName = r.name.toString().trim().toLowerCase();
                        const cleanSearchName = restaurantName.toString().trim().toLowerCase();
                        return cleanRName === cleanSearchName;
                    });

                    if (matchedRestaurant) {
                        fetchedPayments.push({
                            archiveId: doc.id,
                            paymentDateLabel: archive.paymentDateLabel || 'فترة غير محددة',
                            archivedAt: archive.archivedAt,
                            balance: matchedRestaurant.balance || 0,
                            currencyType: matchedRestaurant.currencyType || 'old_riyal',
                            branch: matchedRestaurant.branch || '',
                            accountNumber: matchedRestaurant.restaurantAccountNumber || ''
                        });
                    }
                }
            });

            // Sort by archivedAt descending (newest first)
            fetchedPayments.sort((a, b) => {
                const getTime = (at: any) => {
                    if (!at) return 0;
                    if (at.seconds) return at.seconds * 1000 + (at.nanoseconds / 1000000);
                    if (at instanceof Date) return at.getTime();
                    if (typeof at === 'string') return new Date(at).getTime();
                    if (at._seconds) return at._seconds * 1000; // Handle common serialization
                    return 0;
                };
                return getTime(b.archivedAt) - getTime(a.archivedAt);
            });

            setPayments(fetchedPayments);
        } catch (error) {
            console.error("Error fetching restaurant payment history:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 md:p-8 space-y-6 RTL animate-fade-in" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-amber-500">history</span>
                        سجل الدفعات السابقة
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 font-bold">
                        تاريخ الدفعات والمطابقات لمطعم: <span className="text-[var(--color-header)]">{restaurantName || 'غير محدد'}</span>
                    </p>
                </div>
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition font-bold"
                >
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    رجوع
                </button>
            </div>

            {/* List */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <span className="material-symbols-outlined text-4xl animate-spin text-slate-400">refresh</span>
                </div>
            ) : payments.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
                    <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">receipt_long</span>
                    <p className="text-slate-500 font-bold text-lg">لا يوجد سجل دفعات مسبق لهذا المطعم</p>
                    <p className="text-slate-400 text-sm mt-2">الكشوفات المؤرشفة فقط تظهر هنا.</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-lg border border-slate-100 dark:border-slate-800 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-right border-collapse">
                            <thead>
                                <tr className="bg-slate-100/50 dark:bg-slate-900/50">
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">تاريخ الأرشفة</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">فترة السداد</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">الرصيد المدفوع</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">العملة</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">تفاصيل إضافية</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {payments.map((payment, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm text-slate-400">calendar_today</span>
                                                <span className="font-bold text-slate-700 dark:text-slate-300">
                                                    {payment.archivedAt?.toDate ? payment.archivedAt.toDate().toLocaleDateString('ar-SA') : 'غير معروف'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 px-3 py-1 rounded-lg text-sm font-black">
                                                {payment.paymentDateLabel}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-black text-[var(--color-header)] text-lg">
                                                {payment.balance.toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 text-xs font-black rounded-lg ${payment.currencyType === 'new_riyal'
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                                }`}>
                                                {payment.currencyType === 'new_riyal' ? 'ريال جديد' : 'ريال قديم'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm">
                                                <p className="text-slate-500">الفرع: <span className="font-bold text-slate-700 dark:text-slate-300">{payment.branch}</span></p>
                                                <p className="text-slate-500 truncate max-w-[150px]">الحساب: <span className="font-mono text-xs">{payment.accountNumber}</span></p>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RestaurantPaymentHistoryPage;
