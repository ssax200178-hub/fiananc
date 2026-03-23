import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, limit, where, startAfter, getDocs, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import { useAppContext, Feedback, FeedbackType } from '../AppContext';
import { confirmDialog } from '../utils/confirm';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';
const PAGE_SIZE = 20;

const TYPE_CONFIG: Record<string, { label: string; emoji: string; icon: string; bg: string; text: string }> = {
    bug: { label: 'خطأ برمجي', emoji: '🔴', icon: 'bug_report', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
    suggestion: { label: 'اقتراح', emoji: '💡', icon: 'lightbulb', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    improvement: { label: 'تحسين', emoji: '⚡', icon: 'trending_up', bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
    new: { label: 'جديد', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
    'in-progress': { label: 'قيد المعالجة', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    resolved: { label: 'تم الحل', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300' },
    closed: { label: 'مغلق', bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-700 dark:text-slate-300' },
};

const DeveloperFeedbackPage: React.FC = () => {
    const { currentUser, addLog, devFeedbackSettings, updateDevFeedbackSettings } = useAppContext();

    // Settings state
    const [fbSettingsForm, setFbSettingsForm] = useState({
        allowImageAttachments: true,
        allowAudioRecordings: true,
        whatsappNumber: '',
        supportPhone: ''
    });
    const [isSavingFbSettings, setIsSavingFbSettings] = useState(false);

    useEffect(() => {
        if (devFeedbackSettings) {
            setFbSettingsForm({
                allowImageAttachments: devFeedbackSettings.allowImageAttachments ?? true,
                allowAudioRecordings: devFeedbackSettings.allowAudioRecordings ?? true,
                whatsappNumber: devFeedbackSettings.whatsappNumber || '',
                supportPhone: devFeedbackSettings.supportPhone || ''
            });
        }
    }, [devFeedbackSettings]);
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
    const [filterStatus, setFilterStatus] = useState<Feedback['status'] | 'all'>('all');
    const [filterType, setFilterType] = useState<FeedbackType | 'all'>('all');
    const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
    const [adminNote, setAdminNote] = useState('');

    const feedbackRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'feedback');

    // Build query based on filters
    const loadFeedbacks = useCallback(async (reset = true) => {
        if (!currentUser?.permissions?.includes('developer_access') && currentUser?.role !== 'super_admin') {
            setLoading(false);
            return;
        }

        if (reset) {
            setLoading(true);
            setLastDoc(null);
            setHasMore(true);
        } else {
            setLoadingMore(true);
        }

        try {
            const constraints: any[] = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE)];

            if (filterType !== 'all') {
                constraints.unshift(where('type', '==', filterType));
            }
            if (filterStatus !== 'all') {
                constraints.unshift(where('status', '==', filterStatus));
            }

            if (!reset && lastDoc) {
                constraints.push(startAfter(lastDoc));
            }

            const q = query(feedbackRef, ...constraints);
            const snapshot = await getDocs(q);

            const data = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data(),
                createdAt: d.data().createdAt?.toDate()?.toISOString() || new Date().toISOString(),
            })) as Feedback[];

            if (reset) {
                setFeedbacks(data);
            } else {
                setFeedbacks(prev => [...prev, ...data]);
            }

            setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
            setHasMore(snapshot.docs.length === PAGE_SIZE);
        } catch (error) {
            console.error("Error loading feedbacks:", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [currentUser, filterStatus, filterType, lastDoc]);

    // Initial load & reload on filter change
    useEffect(() => {
        loadFeedbacks(true);
    }, [filterStatus, filterType, currentUser]);

    // Also subscribe to real-time updates for the current view (new items appear)
    useEffect(() => {
        if (!currentUser?.permissions?.includes('developer_access') && currentUser?.role !== 'super_admin') return;

        const constraints: any[] = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE)];
        if (filterType !== 'all') constraints.unshift(where('type', '==', filterType));
        if (filterStatus !== 'all') constraints.unshift(where('status', '==', filterStatus));

        const q = query(feedbackRef, ...constraints);
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data(),
                createdAt: d.data().createdAt?.toDate()?.toISOString() || new Date().toISOString(),
            })) as Feedback[];
            setFeedbacks(data);
            setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser, filterStatus, filterType]);

    const handleUpdateStatus = async (id: string, newStatus: Feedback['status']) => {
        try {
            const fbRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'feedback', id);
            await updateDoc(fbRef, {
                status: newStatus,
                ...(newStatus === 'resolved' ? {
                    resolvedAt: new Date().toISOString(),
                    resolvedBy: currentUser?.name || currentUser?.username
                } : {})
            });
            // Update selected feedback locally
            if (selectedFeedback?.id === id) {
                setSelectedFeedback(prev => prev ? { ...prev, status: newStatus } : null);
            }
            addLog('تحديث حالة الملاحظة', `تم تغيير حالة الملاحظة إلى: ${STATUS_CONFIG[newStatus]?.label || newStatus}`, 'settings');
        } catch (error) {
            console.error("Error updating status:", error);
            alert("حدث خطأ أثناء تحديث الحالة.");
        }
    };

    const handleSaveAdminNote = async () => {
        if (!selectedFeedback) return;
        try {
            const fbRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'feedback', selectedFeedback.id);
            await updateDoc(fbRef, { adminNotes: adminNote });
            setSelectedFeedback(prev => prev ? { ...prev, adminNotes: adminNote } : null);
            alert("تم حفظ الملاحظة الإدارية بنجاح.");
        } catch (error) {
            console.error("Error saving note:", error);
            alert("فشل حفظ الملاحظة الإدارية.");
        }
    };

    const handleDelete = async (id: string) => {
        const isConfirmed = await confirmDialog('هل أنت متأكد من حذف هذه الملاحظة نهائياً؟', {
            title: 'تأكيد الحذف',
            type: 'danger',
            confirmText: 'حذف',
            cancelText: 'إلغاء'
        });
        if (!isConfirmed) return;
        try {
            await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'feedback', id));
            setSelectedFeedback(null);
            addLog('حذف ملاحظة', 'تم حذف ملاحظة من قبل المطور', 'settings');
        } catch (error) {
            console.error("Error deleting feedback:", error);
            alert("حدث خطأ أثناء الحذف.");
        }
    };

    if (!currentUser?.permissions?.includes('developer_access') && currentUser?.role !== 'super_admin') {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center RTL" dir="rtl">
                <span className="material-symbols-outlined text-6xl text-red-500 mb-4 block animate-bounce">lock</span>
                <p className="text-xl font-bold font-cairo text-gray-700 capitalize">غير مصرح لك بالوصول - يجب أن تكون مطور أدمن</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 space-y-6 animate-fade-in RTL" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-indigo-600">bug_report</span>
                        ملاحظات النظام
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 font-bold">إدارة بلاغات الموظفين ومقترحاتهم وإعدادات التواصل</p>
                </div>
            </div>

            {/* Developer Settings Section */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                        <span className="material-symbols-outlined text-indigo-600">settings</span>
                        إعدادات الملاحظات والتواصل
                    </h2>
                    <button
                        onClick={async () => {
                            setIsSavingFbSettings(true);
                            try {
                                await updateDevFeedbackSettings(fbSettingsForm);
                                alert('✅ تم حفظ الإعدادات بنجاح');
                            } catch (e) {
                                console.error(e);
                                alert('❌ حدث خطأ أثناء الحفظ');
                            } finally {
                                setIsSavingFbSettings(false);
                            }
                        }}
                        disabled={isSavingFbSettings}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 w-full md:w-auto"
                    >
                        {isSavingFbSettings ? (
                            <><span className="material-symbols-outlined animate-spin text-sm">sync</span> جاري الحفظ...</>
                        ) : (
                            <><span className="material-symbols-outlined text-sm">save</span> حفظ التغييرات</>
                        )}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Toggle: Allow Image Attachments */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div>
                            <h4 className="font-bold text-slate-800 dark:text-white text-sm">إرفاق الصور</h4>
                            <p className="text-[11px] text-slate-500">تفعيل/تعطيل رفع الصور</p>
                        </div>
                        <button
                            onClick={() => setFbSettingsForm(prev => ({ ...prev, allowImageAttachments: !prev.allowImageAttachments }))}
                            className={`relative w-12 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${fbSettingsForm.allowImageAttachments ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                        >
                            <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${fbSettingsForm.allowImageAttachments ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {/* Toggle: Allow Audio Recordings */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div>
                            <h4 className="font-bold text-slate-800 dark:text-white text-sm">التسجيل الصوتي</h4>
                            <p className="text-[11px] text-slate-500">تفعيل/تعطيل إرسال صوتيات</p>
                        </div>
                        <button
                            onClick={() => setFbSettingsForm(prev => ({ ...prev, allowAudioRecordings: !prev.allowAudioRecordings }))}
                            className={`relative w-12 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${fbSettingsForm.allowAudioRecordings ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                        >
                            <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${fbSettingsForm.allowAudioRecordings ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {/* WhatsApp Number */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                        <label className="block text-sm font-bold text-slate-800 dark:text-white mb-2">رقم الواتساب</label>
                        <input
                            type="text"
                            dir="ltr"
                            placeholder="+967..."
                            value={fbSettingsForm.whatsappNumber}
                            onChange={(e) => setFbSettingsForm(prev => ({ ...prev, whatsappNumber: e.target.value }))}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-indigo-500"
                        />
                    </div>

                    {/* Phone Number */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                        <label className="block text-sm font-bold text-slate-800 dark:text-white mb-2">رقم الاتصال</label>
                        <input
                            type="text"
                            dir="ltr"
                            placeholder="77..."
                            value={fbSettingsForm.supportPhone}
                            onChange={(e) => setFbSettingsForm(prev => ({ ...prev, supportPhone: e.target.value }))}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-indigo-500"
                        />
                    </div>
                </div>
            </div>

            {/* Filter Bars */}
            <div className="space-y-3">
                {/* Status Filter */}
                <div className="flex flex-wrap gap-2">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 self-center ml-2">الحالة:</span>
                    {(['all', 'new', 'in-progress', 'resolved', 'closed'] as const).map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-4 py-1.5 font-bold text-xs rounded-lg whitespace-nowrap transition-all ${filterStatus === status ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50'}`}
                        >
                            {status === 'all' ? 'الكل' : STATUS_CONFIG[status]?.label || status}
                        </button>
                    ))}
                </div>

                {/* Type Filter */}
                <div className="flex flex-wrap gap-2">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 self-center ml-2">التصنيف:</span>
                    <button
                        onClick={() => setFilterType('all')}
                        className={`px-4 py-1.5 font-bold text-xs rounded-lg whitespace-nowrap transition-all ${filterType === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50'}`}
                    >
                        الكل
                    </button>
                    {(Object.entries(TYPE_CONFIG) as [string, typeof TYPE_CONFIG[string]][]).map(([key, config]) => (
                        <button
                            key={key}
                            onClick={() => setFilterType(key as FeedbackType)}
                            className={`px-4 py-1.5 font-bold text-xs rounded-lg whitespace-nowrap transition-all flex items-center gap-1 ${filterType === key ? `${config.bg} ${config.text} shadow-sm ring-1 ring-current` : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50'}`}
                        >
                            {config.emoji} {config.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* List View */}
                <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-[calc(100vh-300px)]">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                        <h3 className="font-bold text-slate-700 dark:text-slate-300">قائمة الملاحظات ({feedbacks.length})</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto thin-scrollbar p-2 space-y-2">
                        {feedbacks.length === 0 ? (
                            <p className="text-center text-slate-500 mt-10 font-bold">لا توجد ملاحظات بهذه الحالة.</p>
                        ) : (
                            <>
                                {feedbacks.map(fb => {
                                    const typeInfo = fb.type ? TYPE_CONFIG[fb.type] : null;
                                    const statusInfo = STATUS_CONFIG[fb.status] || STATUS_CONFIG['new'];
                                    return (
                                        <div
                                            key={fb.id}
                                            onClick={() => {
                                                setSelectedFeedback(fb);
                                                setAdminNote(fb.adminNotes || '');
                                            }}
                                            className={`p-4 rounded-xl cursor-pointer border transition-all ${selectedFeedback?.id === fb.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-100 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50'}`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="font-bold text-slate-800 dark:text-white line-clamp-1">{fb.userName}</div>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statusInfo.bg} ${statusInfo.text}`}>
                                                    {statusInfo.label}
                                                </span>
                                            </div>
                                            {/* Type Badge */}
                                            {typeInfo && (
                                                <div className="mb-2">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1 ${typeInfo.bg} ${typeInfo.text}`}>
                                                        <span className="material-symbols-outlined text-[12px]">{typeInfo.icon}</span>
                                                        {typeInfo.emoji} {typeInfo.label}
                                                    </span>
                                                </div>
                                            )}
                                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">{fb.message}</p>
                                            <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
                                                <div className="flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                                                    {new Date(fb.createdAt).toLocaleDateString('ar-SA')}
                                                </div>
                                                {fb.attachments?.imageUrl && <span className="material-symbols-outlined text-[14px]" title="يوجد صورة">image</span>}
                                                {fb.attachments?.audioUrl && <span className="material-symbols-outlined text-[14px]" title="يوجد تسجيل">mic</span>}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Load More Button */}
                                {hasMore && (
                                    <button
                                        onClick={() => loadFeedbacks(false)}
                                        disabled={loadingMore}
                                        className="w-full py-3 mt-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {loadingMore ? (
                                            <>
                                                <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                                                جاري التحميل...
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-sm">expand_more</span>
                                                تحميل المزيد
                                            </>
                                        )}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Detail View */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-[calc(100vh-300px)]">
                    {selectedFeedback ? (
                        <div className="flex flex-col h-full">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-start bg-slate-50 dark:bg-slate-900/30">
                                <div>
                                    <h2 className="text-xl font-black text-slate-800 dark:text-white mb-1">تفاصيل الملاحظة</h2>
                                    <p className="text-sm text-slate-500 font-bold flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm">person</span> {selectedFeedback.userName}
                                        <span className="text-slate-300">|</span>
                                        <span className="material-symbols-outlined text-sm">schedule</span> {new Date(selectedFeedback.createdAt).toLocaleString('ar-SA')}
                                    </p>
                                    {/* Type Badge in detail */}
                                    {selectedFeedback.type && TYPE_CONFIG[selectedFeedback.type] && (
                                        <div className="mt-2">
                                            <span className={`text-xs px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5 ${TYPE_CONFIG[selectedFeedback.type].bg} ${TYPE_CONFIG[selectedFeedback.type].text}`}>
                                                <span className="material-symbols-outlined text-sm">{TYPE_CONFIG[selectedFeedback.type].icon}</span>
                                                {TYPE_CONFIG[selectedFeedback.type].emoji} {TYPE_CONFIG[selectedFeedback.type].label}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <select
                                        value={selectedFeedback.status}
                                        onChange={(e) => handleUpdateStatus(selectedFeedback.id, e.target.value as Feedback['status'])}
                                        className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-700 dark:text-slate-300 outline-none"
                                    >
                                        <option value="new">تحديد كـ جديد</option>
                                        <option value="in-progress">تحديد كـ قيد المعالجة</option>
                                        <option value="resolved">تحديد كـ تم الحل</option>
                                        <option value="closed">تحديد كـ مغلق</option>
                                    </select>
                                    {currentUser?.role === 'super_admin' && (
                                        <button onClick={() => handleDelete(selectedFeedback.id)} className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition" title="حذف نهائي">
                                            <span className="material-symbols-outlined text-lg">delete</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {/* Message */}
                                <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800/50">
                                    <h3 className="text-sm font-bold text-indigo-800 dark:text-indigo-400 mb-2 flex items-center gap-2"><span className="material-symbols-outlined text-lg">description</span> نص الملاحظة</h3>
                                    <p className="text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap">{selectedFeedback.message || <span className="italic text-slate-400">لا يوجد نص.</span>}</p>
                                </div>

                                {/* Attachments */}
                                {(selectedFeedback.attachments?.imageUrl || selectedFeedback.attachments?.audioUrl) && (
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700 pb-2">المرفقات</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {selectedFeedback.attachments.imageUrl && (
                                                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900 max-h-64 flex items-center justify-center">
                                                    <a href={selectedFeedback.attachments.imageUrl} target="_blank" rel="noreferrer" title="اضغط للتكبير">
                                                        <img src={selectedFeedback.attachments.imageUrl} alt="مرفق" className="max-h-64 object-contain hover:scale-105 transition-transform" />
                                                    </a>
                                                </div>
                                            )}
                                            {selectedFeedback.attachments.audioUrl && (
                                                <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50 dark:bg-slate-900 flex flex-col justify-center">
                                                    <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1"><span className="material-symbols-outlined text-sm">audio_file</span> تسجيل صوتي</p>
                                                    <audio src={selectedFeedback.attachments.audioUrl} controls className="w-full" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Admin Notes */}
                                <div className="pt-4 mt-6 border-t border-slate-100 dark:border-slate-700">
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-400 mb-2">ملاحظات الإدارة (للمطورين فقط)</label>
                                    <textarea
                                        value={adminNote}
                                        onChange={(e) => setAdminNote(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-sm text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px] resize-y"
                                        placeholder="اكتب ملاحظاتك التقنية أو تقدم الحل هنا..."
                                    />
                                    <div className="mt-2 flex justify-end">
                                        <button
                                            onClick={handleSaveAdminNote}
                                            className="px-4 py-2 bg-slate-800 text-white dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-sm font-bold transition flex items-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-sm">save</span>
                                            حفظ الملاحظة
                                        </button>
                                    </div>
                                </div>

                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
                            <span className="material-symbols-outlined text-6xl opacity-50">data_exploration</span>
                            <p className="font-bold text-lg">اختر ملاحظة من القائمة لعرض تفاصيلها</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DeveloperFeedbackPage;
