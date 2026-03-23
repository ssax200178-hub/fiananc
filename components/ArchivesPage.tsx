import React, { useEffect, useState } from 'react';
import { confirmDialog } from '../utils/confirm';
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
    const [viewMode, setViewMode] = useState<'detailed' | 'grouped'>('grouped');
    const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

    const toggleMonth = (monthYear: string) => {
        setExpandedMonths(prev => ({ ...prev, [monthYear]: !prev[monthYear] }));
    };

    useEffect(() => {
        fetchArchives();
    }, []);

    const groupedArchives = React.useMemo(() => {
        const groups: Record<string, Record<string, ArchiveRecord[]>> = {};
        archives.forEach(archive => {
            const date = archive.archivedAt?.toDate ? archive.archivedAt.toDate() : new Date();
            const monthYear = date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' });
            const day = date.toLocaleDateString('ar-SA', { day: 'numeric', weekday: 'long' });

            if (!groups[monthYear]) groups[monthYear] = {};
            if (!groups[monthYear][day]) groups[monthYear][day] = [];

            groups[monthYear][day].push(archive);
        });
        return groups;
    }, [archives]);

    const calculateTotals = (archive: ArchiveRecord) => {
        let totalNewRiyal = 0;
        let totalOldRiyal = 0;
        archive.restaurants?.forEach(r => {
            if (r.currencyType === 'new_riyal') totalNewRiyal += (r.balance || 0);
            else totalOldRiyal += (r.balance || 0);
        });
        return { totalNewRiyal, totalOldRiyal };
    };

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
        const confirmed = await confirmDialog('هل أنت متأكد من حذف هذا الأرشيف نهائياً؟', { type: 'danger', confirmText: 'حذف', cancelText: 'إلغاء' });
        if (!confirmed) return;

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
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-amber-500">inventory_2</span>
                        أرشيف الكشوفات
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 font-bold">سجل عمليات السداد المؤرشفة</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex items-center">
                        <button
                            onClick={() => setViewMode('detailed')}
                            className={`px-4 py-2 font-black text-sm rounded-lg transition-colors ${viewMode === 'detailed' ? 'bg-white dark:bg-slate-700 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            <span className="material-symbols-outlined text-sm align-middle ml-1">list</span>
                            عرض تفصيلي
                        </button>
                        <button
                            onClick={() => setViewMode('grouped')}
                            className={`px-4 py-2 font-black text-sm rounded-lg transition-colors ${viewMode === 'grouped' ? 'bg-white dark:bg-slate-700 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            <span className="material-symbols-outlined text-sm align-middle ml-1">calendar_view_week</span>
                            تجميعي بالشهر
                        </button>
                    </div>
                    <button
                        onClick={fetchArchives}
                        className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full transition-colors"
                    >
                        <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">refresh</span>
                    </button>
                </div>
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
            ) : viewMode === 'detailed' ? (
                <div className="space-y-10">
                    {Object.entries(groupedArchives).map(([monthYear, days]) => (
                        <div key={monthYear} className="bg-white/50 dark:bg-slate-900/20 p-6 rounded-[2rem]">
                            <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
                                <span className="material-symbols-outlined text-emerald-500">calendar_month</span>
                                {monthYear}
                            </h2>
                            <div className="space-y-8">
                                {Object.entries(days).map(([day, dayArchives]) => (
                                    <div key={day}>
                                        <h3 className="text-xl font-bold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-lg">today</span>
                                            {day}
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {dayArchives.map(archive => {
                                                const { totalNewRiyal, totalOldRiyal } = calculateTotals(archive);
                                                return (
                                                    <div key={archive.id} className="bg-white dark:bg-slate-900 rounded-3xl shadow-lg border border-slate-100 dark:border-slate-800 overflow-hidden hover:shadow-xl transition-shadow">
                                                        <div className="p-6">
                                                            <div className="flex items-start justify-between mb-4">
                                                                <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 px-3 py-1 rounded-lg text-sm font-black">
                                                                    {archive.paymentDateLabel}
                                                                </div>
                                                                <span className="text-xs font-bold text-slate-400">
                                                                    {archive.archivedAt?.toDate ? archive.archivedAt.toDate().toLocaleTimeString('ar-SA') : ''}
                                                                </span>
                                                            </div>

                                                            <div className="space-y-4">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-slate-500 text-sm font-bold">عدد المطاعم</span>
                                                                    <span className="font-black text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg">{archive.restaurantCount}</span>
                                                                </div>
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-slate-500 text-sm font-bold">إجمالي ريال جديد</span>
                                                                    <span className="font-black text-emerald-600">{(totalNewRiyal || 0).toLocaleString()}</span>
                                                                </div>
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-slate-500 text-sm font-bold">إجمالي ريال قديم</span>
                                                                    <span className="font-black text-amber-600">{(totalOldRiyal || 0).toLocaleString()}</span>
                                                                </div>
                                                                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                                                                    <span className="text-slate-500 text-sm font-bold">الفروع</span>
                                                                    <span className="font-bold text-slate-700 dark:text-slate-300 text-xs text-left max-w-[60%] truncate">
                                                                        {archive.branches?.join('، ') || 'الكل'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 flex gap-2 border-t border-slate-100 dark:border-slate-700">
                                                            {(currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('archives_details')) && (
                                                                <button
                                                                    onClick={() => setSelectedArchive(archive)}
                                                                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                                                                >
                                                                    <span className="material-symbols-outlined text-sm">visibility</span>
                                                                    عرض
                                                                </button>
                                                            )}
                                                            {(currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('archives_download')) && (
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
                                                            )}
                                                            {(currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('archives_delete')) && (
                                                                <button
                                                                    onClick={() => handleDelete(archive.id)}
                                                                    disabled={processingId === archive.id}
                                                                    className="px-4 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl font-bold transition-colors disabled:opacity-50"
                                                                >
                                                                    <span className="material-symbols-outlined">delete</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-6">
                    {Object.entries(groupedArchives).map(([monthYear, days]) => {
                        const monthArchives = Object.values(days).flat();
                        const isExpanded = expandedMonths[monthYear];
                        let totalNewRiyalMonth = 0;
                        let totalOldRiyalMonth = 0;
                        let totalRestaurantsMonth = 0;

                        monthArchives.forEach(a => {
                            const { totalNewRiyal, totalOldRiyal } = calculateTotals(a);
                            totalNewRiyalMonth += totalNewRiyal;
                            totalOldRiyalMonth += totalOldRiyal;
                            totalRestaurantsMonth += a.restaurantCount;
                        });

                        return (
                            <div key={monthYear} className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
                                <button
                                    onClick={() => toggleMonth(monthYear)}
                                    className="w-full text-right p-6 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`size-12 rounded-xl flex items-center justify-center transition-colors ${isExpanded ? 'bg-[var(--color-header)] text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                                            <span className="material-symbols-outlined">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                                                <span className="material-symbols-outlined text-emerald-500">calendar_month</span>
                                                {monthYear}
                                            </h2>
                                            <div className="flex items-center gap-4 mt-2 text-sm">
                                                <span className="text-emerald-600 font-bold">جديد: {totalNewRiyalMonth.toLocaleString()}</span>
                                                <span className="text-amber-600 font-bold">قديم: {totalOldRiyalMonth.toLocaleString()}</span>
                                                <span className="text-slate-500 font-bold">مطاعم: {totalRestaurantsMonth}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-slate-400">
                                        <span className="font-bold text-sm">{Object.keys(days).length} أيام مفصلة</span>
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-white/50 dark:bg-slate-900/20">
                                        <div className="space-y-8">
                                            {Object.entries(days).map(([day, dayArchives]) => (
                                                <div key={day}>
                                                    <h3 className="text-lg font-bold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-[16px]">today</span>
                                                        {day}
                                                    </h3>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                        {dayArchives.map(archive => {
                                                            const { totalNewRiyal, totalOldRiyal } = calculateTotals(archive);
                                                            return (
                                                                <div key={archive.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden hover:shadow-md transition-shadow">
                                                                    <div className="p-4">
                                                                        <div className="flex items-start justify-between mb-3">
                                                                            <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 px-2 py-1 rounded-md text-xs font-black">
                                                                                {archive.paymentDateLabel}
                                                                            </div>
                                                                            <span className="text-[10px] font-bold text-slate-400">
                                                                                {archive.archivedAt?.toDate ? archive.archivedAt.toDate().toLocaleTimeString('ar-SA') : ''}
                                                                            </span>
                                                                        </div>

                                                                        <div className="space-y-2">
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="text-slate-500 text-xs font-bold">المطاعم</span>
                                                                                <span className="font-black text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-xs">{archive.restaurantCount}</span>
                                                                            </div>
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="text-slate-500 text-xs font-bold">جديد</span>
                                                                                <span className="font-black text-emerald-600 text-sm">{(totalNewRiyal || 0).toLocaleString()}</span>
                                                                            </div>
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="text-slate-500 text-xs font-bold">قديم</span>
                                                                                <span className="font-black text-amber-600 text-sm">{(totalOldRiyal || 0).toLocaleString()}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="bg-slate-50 dark:bg-slate-800/80 p-3 flex gap-2 border-t border-slate-100 dark:border-slate-700">
                                                                        {(currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('archives_details')) && (
                                                                            <button
                                                                                onClick={() => setSelectedArchive(archive)}
                                                                                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                                                                            >
                                                                                <span className="material-symbols-outlined text-[14px]">visibility</span>
                                                                                عرض
                                                                            </button>
                                                                        )}
                                                                        {(currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('archives_download')) && (
                                                                            <button
                                                                                onClick={() => handleDownload(archive)}
                                                                                disabled={processingId === archive.id}
                                                                                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                                                                            >
                                                                                {processingId === archive.id ? (
                                                                                    <span className="material-symbols-outlined animate-spin text-[14px]">refresh</span>
                                                                                ) : (
                                                                                    <span className="material-symbols-outlined text-[14px]">download</span>
                                                                                )}
                                                                                ZIP
                                                                            </button>
                                                                        )}
                                                                        {(currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('archives_delete')) && (
                                                                            <button
                                                                                onClick={() => handleDelete(archive.id)}
                                                                                disabled={processingId === archive.id}
                                                                                className="px-4 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center"
                                                                            >
                                                                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
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
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                                    <p className="text-slate-500 text-xs font-bold mb-1">عدد المطاعم</p>
                                    <p className="text-2xl font-black text-slate-800 dark:text-white">{selectedArchive.restaurantCount}</p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                                    <p className="text-slate-500 text-xs font-bold mb-1">إجمالي ريال جديد</p>
                                    <p className="text-2xl font-black text-emerald-600">{(calculateTotals(selectedArchive).totalNewRiyal || 0).toLocaleString()}</p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                                    <p className="text-slate-500 text-xs font-bold mb-1">إجمالي ريال قديم</p>
                                    <p className="text-2xl font-black text-amber-600">{(calculateTotals(selectedArchive).totalOldRiyal || 0).toLocaleString()}</p>
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
                                                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">الفرع</th>
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
                                                                <p className="text-[10px] font-bold text-slate-400 mt-1 flex items-center gap-1">
                                                                    #{r.restaurantAccountNumber}
                                                                </p>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className="font-black text-slate-700 dark:text-slate-300 text-sm">{r.branch || 'غير محدد'}</span>
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
