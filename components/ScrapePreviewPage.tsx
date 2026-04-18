import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAppContext, SystemBalance } from '../AppContext';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';
const WORKER_URL = 'http://localhost:3500';
const API_KEY = 'tawseel_sync_key_2026';

interface PendingMeta {
    createdAt: string;
    status: string;
    counts: Record<string, number>;
    totalCount: number;
    fromDate: string;
    toDate: string;
}

type FilterType = 'all' | 'bank' | 'restaurant';

const ScrapePreviewPage = () => {
    const { automationConfig, systemBalances, updateAutomationConfig } = useAppContext();
    const navigate = useNavigate();

    const [pendingData, setPendingData] = useState<SystemBalance[]>([]);
    const [pendingMeta, setPendingMeta] = useState<PendingMeta | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isApproving, setIsApproving] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);
    const [filterType, setFilterType] = useState<FilterType>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
    const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Check worker health
    useEffect(() => {
        const checkHealth = async () => {
            try {
                const res = await fetch(`${WORKER_URL}/health`, { signal: AbortSignal.timeout(3000) });
                setWorkerOnline(res.ok);
            } catch {
                setWorkerOnline(false);
            }
        };
        checkHealth();
        const interval = setInterval(checkHealth, 15000);
        return () => clearInterval(interval);
    }, []);

    // Listen for pending_balances
    useEffect(() => {
        const pendingRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'pending_balances');
        const unsubscribe = onSnapshot(pendingRef, (snapshot) => {
            const data = snapshot.docs.map(d => d.data() as SystemBalance);
            setPendingData(data);
            setIsLoading(false);
        });

        // Get pending metadata
        const metaRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'sync_metadata', 'pending_sync');
        const unsubMeta = onSnapshot(metaRef, (snapshot) => {
            if (snapshot.exists()) {
                setPendingMeta(snapshot.data() as PendingMeta);
            } else {
                setPendingMeta(null);
            }
        });

        return () => { unsubscribe(); unsubMeta(); };
    }, []);

    // Filter data
    const filteredData = pendingData.filter(item => {
        const matchesType = filterType === 'all' || item.type === filterType;
        const matchesSearch = searchQuery === '' ||
            item.accountName?.includes(searchQuery) ||
            item.accountNumber?.includes(searchQuery) ||
            item.branch?.includes(searchQuery);
        return matchesType && matchesSearch;
    });

    // Stats
    const bankCount = pendingData.filter(d => d.type === 'bank').length;
    const restaurantCount = pendingData.filter(d => d.type === 'restaurant').length;
    const totalBalance = pendingData.reduce((sum, d) => sum + (d.balance || 0), 0);

    // Compare with existing: find changes
    const getExistingBalance = (item: SystemBalance): SystemBalance | undefined => {
        return systemBalances.find(s =>
            s.accountNumber === item.accountNumber && s.type === item.type
        );
    };

    // Handle Approve
    const handleApprove = async () => {
        if (!confirm('هل أنت متأكد من اعتماد جميع البيانات المسحوبة؟ سيتم تحديث أرصدة النظام.')) return;
        setIsApproving(true);
        setActionResult(null);

        try {
            // Try via worker first
            if (workerOnline && automationConfig?.scrapingMethod !== 'cloud') {
                const res = await fetch(`${WORKER_URL}/approve-data`, {
                    method: 'POST',
                    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
                });
                const data = await res.json();
                if (data.success) {
                    setActionResult({ type: 'success', message: `✅ ${data.message}` });
                } else {
                    throw new Error(data.message);
                }
            } else {
                // Approve via Firestore directly using the settingsService pattern
                const { writeBatch } = await import('firebase/firestore');
                let batch = writeBatch(db);
                let count = 0;

                for (const item of pendingData) {
                    const { pendingAt, ...cleanData } = item;
                    cleanData.lastUpdated = new Date().toISOString();
                    cleanData.approvedAt = new Date().toISOString();

                    const targetRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'system_balances', item.id);
                    batch.set(targetRef, cleanData, { merge: true });

                    const pendingRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'pending_balances', item.id);
                    batch.delete(pendingRef);

                    count++;
                    if (count % 200 === 0) {
                        await batch.commit();
                        batch = writeBatch(db);
                    }
                }

                // Delete pending metadata
                const pendingMetaRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'sync_metadata', 'pending_sync');
                batch.delete(pendingMetaRef);

                await batch.commit();

                await updateAutomationConfig({ workerStatus: 'done', previewMode: false });
                setActionResult({ type: 'success', message: `✅ تم اعتماد ${count} سجل بنجاح` });
            }
        } catch (e: any) {
            setActionResult({ type: 'error', message: `❌ فشل الاعتماد: ${e.message}` });
        } finally {
            setIsApproving(false);
        }
    };

    // Handle Reject
    const handleReject = async () => {
        if (!confirm('هل أنت متأكد من رفض البيانات المسحوبة؟ سيتم حذفها نهائياً.')) return;
        setIsRejecting(true);
        setActionResult(null);

        try {
            if (workerOnline && automationConfig?.scrapingMethod !== 'cloud') {
                const res = await fetch(`${WORKER_URL}/reject-data`, {
                    method: 'POST',
                    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
                });
                const data = await res.json();
                if (data.success) {
                    setActionResult({ type: 'success', message: `🗑️ ${data.message}` });
                } else {
                    throw new Error(data.message);
                }
            } else {
                // Delete via Firestore directly
                const { writeBatch } = await import('firebase/firestore');
                let batch = writeBatch(db);
                let count = 0;

                for (const item of pendingData) {
                    const pendingRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'pending_balances', item.id);
                    batch.delete(pendingRef);
                    count++;
                    if (count % 400 === 0) {
                        await batch.commit();
                        batch = writeBatch(db);
                    }
                }

                const pendingMetaRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'sync_metadata', 'pending_sync');
                batch.delete(pendingMetaRef);
                await batch.commit();

                await updateAutomationConfig({ workerStatus: 'idle', previewMode: false });
                setActionResult({ type: 'success', message: `🗑️ تم رفض ومسح ${count} سجل` });
            }
        } catch (e: any) {
            setActionResult({ type: 'error', message: `❌ فشل الرفض: ${e.message}` });
        } finally {
            setIsRejecting(false);
        }
    };

    const formatNumber = (n: number) => {
        if (n === 0) return '0';
        return n.toLocaleString('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    };

    const formatDate = (isoStr: string) => {
        try { return new Date(isoStr).toLocaleString('ar-SA'); } catch { return isoStr; }
    };

    const isPreviewReady = automationConfig?.workerStatus === 'preview_ready';
    const isScraping = automationConfig?.workerStatus === 'running';

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-cyan-600 dark:text-cyan-400">preview</span>
                        معاينة البيانات المسحوبة
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        راجع البيانات المسحوبة من tawseel.app قبل اعتمادها في النظام
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Worker/Cloud Status */}
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border ${
                        automationConfig?.scrapingMethod === 'cloud'
                            ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700'
                            : workerOnline === true
                                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700'
                                : workerOnline === false
                                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700'
                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                        }`}>
                        <span className={`size-2 rounded-full ${automationConfig?.scrapingMethod === 'cloud' ? 'bg-purple-500' : workerOnline === true ? 'bg-emerald-500 animate-pulse' : workerOnline === false ? 'bg-red-500' : 'bg-slate-400'}`} />
                        {automationConfig?.scrapingMethod === 'cloud' ? 'الربط السحابي نشط' : workerOnline === true ? 'الخادم متصل' : workerOnline === false ? 'الخادم غير متصل' : 'جاري الفحص...'}
                    </div>
                    <button
                        onClick={() => navigate('/scraping/hub')}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold transition-all border border-slate-200 dark:border-slate-700"
                    >
                        <span className="material-symbols-outlined text-lg">smart_toy</span>
                        إعدادات الأتمتة
                    </button>
                </div>
            </div>

            {/* Scraping in progress banner */}
            {isScraping && (
                <div className="flex items-center gap-4 p-5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl animate-pulse">
                    <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-3xl animate-spin">sync</span>
                    <div>
                        <p className="font-black text-blue-800 dark:text-blue-200 text-lg">جاري سحب البيانات...</p>
                        <p className="text-blue-600 dark:text-blue-400 text-sm mt-0.5">
                            {automationConfig?.statusMessage || 'يتم استخراج البيانات من الموقع، يرجى الانتظار'}
                        </p>
                    </div>
                </div>
            )}

            {/* Action Result */}
            {actionResult && (
                <div className={`flex items-center gap-3 p-4 rounded-2xl font-bold text-sm border animate-fade-in ${actionResult.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700'
                    }`}>
                    <span className="material-symbols-outlined text-xl">{actionResult.type === 'success' ? 'check_circle' : 'error'}</span>
                    {actionResult.message}
                    <button onClick={() => setActionResult(null)} className="mr-auto opacity-60 hover:opacity-100 transition-opacity">
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>
            )}

            {/* Empty State */}
            {!isLoading && pendingData.length === 0 && !isScraping && (
                <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-16 text-center space-y-6 shadow-sm">
                    <div className="w-24 h-24 mx-auto bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600">inbox</span>
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white">لا توجد بيانات معلقة للمعاينة</h3>
                        <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto">
                            اذهب لصفحة الأتمتة واستخدم زر "سحب مع معاينة" لسحب البيانات الجديدة ومراجعتها هنا قبل اعتمادها.
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/scraping/hub')}
                        className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-2 mx-auto"
                    >
                        <span className="material-symbols-outlined">smart_toy</span>
                        الذهاب لصفحة الأتمتة
                    </button>
                </div>
            )}

            {/* Pending Data View */}
            {pendingData.length > 0 && (
                <>
                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="size-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">database</span>
                                </div>
                                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">إجمالي السجلات</div>
                            </div>
                            <div className="text-3xl font-black text-slate-900 dark:text-white">{pendingData.length}</div>
                        </div>

                        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="size-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400">account_balance</span>
                                </div>
                                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">بنوك</div>
                            </div>
                            <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{bankCount}</div>
                        </div>

                        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="size-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">restaurant</span>
                                </div>
                                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">مطاعم</div>
                            </div>
                            <div className="text-3xl font-black text-amber-600 dark:text-amber-400">{restaurantCount}</div>
                        </div>

                        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="size-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400">schedule</span>
                                </div>
                                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">وقت السحب</div>
                            </div>
                            <div className="text-sm font-black text-slate-700 dark:text-slate-300 mt-1">
                                {pendingMeta ? formatDate(pendingMeta.createdAt) : '—'}
                            </div>
                        </div>
                    </div>

                    {/* Action Bar */}
                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                            <div className="flex items-center gap-3 flex-wrap">
                                {/* Filter */}
                                <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
                                    {([['all', 'الكل', 'apps'] as const, ['bank', 'بنوك', 'account_balance'] as const, ['restaurant', 'مطاعم', 'restaurant'] as const]).map(([val, label, icon]) => (
                                        <button
                                            key={val}
                                            onClick={() => setFilterType(val)}
                                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${filterType === val
                                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                                }`}
                                        >
                                            <span className="material-symbols-outlined text-sm">{icon}</span>
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                {/* Search */}
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="بحث بالاسم أو الرقم..."
                                        className="pr-10 pl-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-cyan-500 text-right w-64 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleReject}
                                    disabled={isRejecting || isApproving}
                                    className="flex items-center gap-2 px-5 py-2.5 border-2 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-bold rounded-xl transition-all disabled:opacity-50 text-sm"
                                >
                                    <span className="material-symbols-outlined text-lg">{isRejecting ? 'hourglass_empty' : 'delete_sweep'}</span>
                                    {isRejecting ? 'جاري الحذف...' : 'رفض ومسح'}
                                </button>
                                <button
                                    onClick={handleApprove}
                                    disabled={isApproving || isRejecting}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 text-sm"
                                >
                                    <span className="material-symbols-outlined text-lg">{isApproving ? 'hourglass_empty' : 'task_alt'}</span>
                                    {isApproving ? 'جاري الاعتماد...' : `اعتماد الكل (${pendingData.length})`}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Data Table */}
                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20">
                            <h2 className="text-lg font-black flex items-center gap-2 text-slate-900 dark:text-white">
                                <span className="material-symbols-outlined text-cyan-600 dark:text-cyan-400">table_chart</span>
                                جدول البيانات المسحوبة
                                <span className="text-xs font-bold bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 px-3 py-1 rounded-full mr-2">
                                    {filteredData.length} سجل
                                </span>
                            </h2>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-right text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase">
                                    <tr>
                                        <th className="px-4 py-3 w-8">#</th>
                                        <th className="px-4 py-3">النوع</th>
                                        <th className="px-4 py-3">اسم الحساب</th>
                                        <th className="px-4 py-3">رقم الحساب</th>
                                        <th className="px-4 py-3">الفرع</th>
                                        <th className="px-4 py-3">مدين</th>
                                        <th className="px-4 py-3">دائن</th>
                                        <th className="px-4 py-3">الرصيد الجديد</th>
                                        <th className="px-4 py-3">الرصيد الحالي</th>
                                        <th className="px-4 py-3">الفرق</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                    {filteredData.map((item, i) => {
                                        const existing = getExistingBalance(item);
                                        const diff = existing ? (item.balance - existing.balance) : null;
                                        const isNew = !existing;
                                        const hasChange = diff !== null && Math.abs(diff) > 0.01;

                                        return (
                                            <tr
                                                key={item.id || i}
                                                className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${isNew ? 'bg-emerald-50/30 dark:bg-emerald-900/10' : hasChange ? 'bg-amber-50/30 dark:bg-amber-900/10' : ''}`}
                                            >
                                                <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black ${item.type === 'bank'
                                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                                        }`}>
                                                        <span className="material-symbols-outlined text-[12px]">{item.type === 'bank' ? 'account_balance' : 'restaurant'}</span>
                                                        {item.type === 'bank' ? 'بنك' : 'مطعم'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-bold text-slate-800 dark:text-white max-w-[200px] truncate" title={item.accountName}>
                                                    {item.accountName}
                                                    {isNew && (
                                                        <span className="inline-block mr-2 px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-[9px] font-black rounded">جديد</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400 text-xs">{item.accountNumber}</td>
                                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{item.branch || '—'}</td>
                                                <td className="px-4 py-3 font-mono text-xs">{formatNumber(item.debit || 0)}</td>
                                                <td className="px-4 py-3 font-mono text-xs">{formatNumber(item.credit || 0)}</td>
                                                <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">{formatNumber(item.balance || 0)}</td>
                                                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                                                    {existing ? formatNumber(existing.balance || 0) : '—'}
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs font-bold">
                                                    {diff !== null ? (
                                                        <span className={`flex items-center gap-1 ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                                            {diff > 0 && <span className="material-symbols-outlined text-[12px]">arrow_upward</span>}
                                                            {diff < 0 && <span className="material-symbols-outlined text-[12px]">arrow_downward</span>}
                                                            {Math.abs(diff) < 0.01 ? '—' : formatNumber(diff)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-emerald-600 font-black text-[10px]">جديد</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {filteredData.length === 0 && pendingData.length > 0 && (
                            <div className="p-12 text-center text-slate-400">
                                <span className="material-symbols-outlined text-4xl mb-3 block">filter_list_off</span>
                                <p className="font-bold">لا توجد نتائج تطابق البحث</p>
                            </div>
                        )}
                    </div>

                    {/* Bottom Action Bar (sticky) */}
                    <div className="sticky bottom-4 bg-white/95 dark:bg-[#1e293b]/95 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-xl flex items-center justify-between">
                        <div className="text-sm text-slate-600 dark:text-slate-400 font-bold">
                            <span className="text-slate-900 dark:text-white text-lg">{pendingData.length}</span> سجل جاهز للاعتماد
                            {pendingMeta && (
                                <span className="text-xs text-slate-400 mr-3">• تم السحب {formatDate(pendingMeta.createdAt)}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleReject}
                                disabled={isRejecting || isApproving}
                                className="flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all disabled:opacity-50 text-sm"
                            >
                                <span className="material-symbols-outlined text-lg">close</span>
                                رفض
                            </button>
                            <button
                                onClick={handleApprove}
                                disabled={isApproving || isRejecting}
                                className="flex items-center gap-2 px-8 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black rounded-xl transition-all shadow-lg disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-lg">check_circle</span>
                                اعتماد جميع البيانات
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Loading State */}
            {isLoading && (
                <div className="flex items-center justify-center p-20">
                    <div className="text-center space-y-4">
                        <span className="material-symbols-outlined text-5xl text-cyan-500 animate-spin block">progress_activity</span>
                        <p className="font-bold text-slate-500">جاري تحميل البيانات...</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScrapePreviewPage;
