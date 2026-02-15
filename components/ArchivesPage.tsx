import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, deleteDoc, doc, orderBy, query } from 'firebase/firestore';
import { generateAndDownloadArchiveZip } from '../utils/exportUtils';
import { useAppContext } from '../AppContext';

interface ArchiveRecord {
    id: string;
    paymentDateLabel: string;
    paymentDateValue: string;
    archivedAt: any;
    totalAmount: number;
    restaurantCount: number;
    branches: string[];
    restaurants: any[];
}

const ArchivesPage: React.FC = () => {
    const { currentUser } = useAppContext();
    const [archives, setArchives] = useState<ArchiveRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [selectedArchive, setSelectedArchive] = useState<ArchiveRecord | null>(null);

    useEffect(() => {
        fetchArchives();
    }, []);

    const fetchArchives = async () => {
        setLoading(true);
        try {
            const archivesRef = collection(db, 'archives');
            // Ensure you have an index for 'archivedAt' descending if you use orderBy
            // For now, client-side sorting might be safer if index is missing, 
            // but let's try strict query first or just get all and sort.
            const q = query(archivesRef);
            const querySnapshot = await getDocs(q);
            const data: ArchiveRecord[] = querySnapshot.docs.map(doc => doc.data() as ArchiveRecord);

            // Sort by archivedAt desc
            data.sort((a, b) => {
                const timeA = a.archivedAt?.seconds || 0;
                const timeB = b.archivedAt?.seconds || 0;
                return timeB - timeA;
            });

            setArchives(data);
        } catch (error) {
            console.error("Error fetching archives:", error);
            alert("حدث خطأ أثناء جلب الأرشيف");
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async (archive: ArchiveRecord) => {
        setProcessingId(archive.id);
        try {
            await generateAndDownloadArchiveZip(archive.paymentDateLabel, archive.restaurants);
        } catch (error) {
            console.error("Download Error:", error);
            alert("حدث خطأ أثناء التنزيل");
        } finally {
            setProcessingId(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("هل أنت متأكد من حذف هذا الأرشيف نهائياً؟")) return;

        setProcessingId(id);
        try {
            await deleteDoc(doc(db, 'archives', id));
            setArchives(prev => prev.filter(a => a.id !== id));
            alert("تم الحذف بنجاح");
        } catch (error) {
            console.error("Delete Error:", error);
            alert("حدث خطأ أثناء الحذف");
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="p-4 md:p-8 space-y-6 RTL" dir="rtl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-amber-500">inventory_2</span>
                        أرشيف الكشوفات
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 font-bold">سجل عمليات السداد المؤرشفة</p>
                </div>
                <button
                    onClick={fetchArchives}
                    className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full transition-colors"
                >
                    <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">refresh</span>
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <span className="material-symbols-outlined text-4xl animate-spin text-slate-400">refresh</span>
                </div>
            ) : archives.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
                    <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">folder_open</span>
                    <p className="text-slate-500 font-bold text-lg">لا توجد سجلات مؤرشفة حالياً</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {archives.map(archive => (
                        <div key={archive.id} className="bg-white dark:bg-slate-900 rounded-3xl shadow-lg border border-slate-100 dark:border-slate-800 overflow-hidden hover:shadow-xl transition-shadow">
                            <div className="p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 px-3 py-1 rounded-lg text-sm font-black">
                                        {archive.paymentDateLabel}
                                    </div>
                                    <span className="text-xs font-bold text-slate-400">
                                        {archive.archivedAt?.toDate ? archive.archivedAt.toDate().toLocaleDateString('ar-SA') : 'تاريخ غير معروف'}
                                    </span>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-500 text-sm font-bold">عدد المطاعم</span>
                                        <span className="font-black text-slate-800 dark:text-white">{archive.restaurantCount}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-500 text-sm font-bold">إجمالي المبلغ</span>
                                        <span className="font-black text-emerald-600">{(archive.totalAmount || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-500 text-sm font-bold">الفروع</span>
                                        <span className="font-bold text-slate-700 dark:text-slate-300 text-xs">
                                            {archive.branches?.join('، ') || 'الكل'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 flex gap-2 border-t border-slate-100 dark:border-slate-700">
                                <button
                                    onClick={() => setSelectedArchive(archive)}
                                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-sm">visibility</span>
                                    عرض
                                </button>
                                <button
                                    onClick={() => handleDownload(archive)}
                                    disabled={processingId === archive.id}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                >
                                    {processingId === archive.id ? (
                                        <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                                    ) : (
                                        <span className="material-symbols-outlined text-sm">download</span>
                                    )}
                                    تنزيل ZIP
                                </button>
                                <button
                                    onClick={() => handleDelete(archive.id)}
                                    disabled={processingId === archive.id}
                                    className="px-4 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl font-bold transition-colors disabled:opacity-50"
                                >
                                    <span className="material-symbols-outlined">delete</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* View Archive Modal */}
            {selectedArchive && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-scale-in" dir="rtl">
                        {/* Header */}
                        <div className="p-6 bg-slate-800 text-white flex items-center justify-between shrink-0">
                            <div>
                                <h2 className="text-2xl font-black flex items-center gap-3">
                                    <span className="material-symbols-outlined">description</span>
                                    تفاصيل الأرشيف: {selectedArchive.paymentDateLabel}
                                </h2>
                                <p className="text-slate-400 text-sm mt-1 font-bold">
                                    تم الأرشفة في: {selectedArchive.archivedAt?.toDate ? selectedArchive.archivedAt.toDate().toLocaleDateString('ar-SA') : 'تاريخ غير معروف'}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedArchive(null)}
                                className="size-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-auto p-6 bg-slate-50 dark:bg-slate-800/50">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                                    <p className="text-slate-500 text-xs font-bold mb-1">عدد المطاعم</p>
                                    <p className="text-2xl font-black text-slate-800 dark:text-white">{selectedArchive.restaurantCount}</p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                                    <p className="text-slate-500 text-xs font-bold mb-1">إجمالي المبلغ</p>
                                    <p className="text-2xl font-black text-emerald-600">{(selectedArchive.totalAmount || 0).toLocaleString()}</p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                                    <p className="text-slate-500 text-xs font-bold mb-1">الفروع</p>
                                    <p className="text-sm font-black text-slate-800 dark:text-white truncate">
                                        {selectedArchive.branches?.join('، ') || 'الكل'}
                                    </p>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-right border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100/50 dark:bg-slate-900/50">
                                                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">المطعم</th>
                                                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">العملة</th>
                                                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">رصيد المطعم</th>
                                                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">حساب التحويل</th>
                                                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">فترة السداد</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                            {selectedArchive.restaurants.map((r, idx) => {
                                                const primaryAcc = r.transferAccounts?.find((a: any) => a.isPrimary) || r.transferAccounts?.[0];
                                                return (
                                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                                        <td className="px-6 py-4">
                                                            <div>
                                                                <p className="font-bold text-slate-800 dark:text-white">{r.name}</p>
                                                                <p className="text-xs text-slate-400">#{r.restaurantAccountNumber}</p>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2 py-1 text-[10px] font-black rounded-lg ${r.currencyType === 'new_riyal'
                                                                    ? 'bg-emerald-100 text-emerald-700'
                                                                    : 'bg-amber-100 text-amber-700'
                                                                }`}>
                                                                {r.currencyType === 'new_riyal' ? 'ريال جديد' : 'ريال قديم'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <p className="font-black text-slate-800 dark:text-white">
                                                                {(r.balance || 0).toLocaleString()}
                                                            </p>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {primaryAcc ? (
                                                                <div className="space-y-0.5">
                                                                    <p className="text-xs font-bold text-slate-800 dark:text-white">{primaryAcc.beneficiaryName}</p>
                                                                    <p className="text-xs font-mono text-slate-500">{primaryAcc.accountNumber}</p>
                                                                    <p className="text-[10px] text-slate-400">{primaryAcc.type}</p>
                                                                </div>
                                                            ) : (
                                                                <span className="text-slate-400 text-xs">--</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2 py-1 text-[10px] font-black rounded-lg ${r.paymentPeriod === 'semi-monthly'
                                                                    ? 'bg-purple-100 text-purple-700'
                                                                    : 'bg-blue-100 text-blue-700'
                                                                }`}>
                                                                {r.paymentPeriod === 'semi-monthly' ? 'نصف شهرية' : 'شهرية'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ArchivesPage;
