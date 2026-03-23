import React, { useState, useMemo, useEffect } from 'react';
import { confirmDialog, promptDialog } from '../utils/confirm';
import { useAppContext, LoanRequest, Employee, Deduction } from '../AppContext';
import { safeCompare, calculateEmployeeSalary, getCurrencySymbol, ARABIC_MONTHS } from '../utils';
import * as XLSX from 'xlsx';
import { collection, query, where, orderBy, limit, startAfter, onSnapshot, getDocs, DocumentSnapshot, QueryConstraint } from 'firebase/firestore';
import { db } from '../firebase';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';

const LoanRequestsPage: React.FC = () => {
    const {
        addLoanRequest,
        updateLoanRequest,
        deleteLoanRequest,
        approveLoanRequest,
        rejectLoanRequest,
        employees,
        currentUser,
        exchangeRates,
        branches,
        deductions,
        setSelectedEmployeeDrawerId
    } = useAppContext();

    const canAddLoans = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('loans_add');
    const canEditLoans = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('loans_edit');
    const canDeleteLoans = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('loans_delete');
    const canApproveLoans = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('loans_approve');
    const canViewSalary = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('salary_view');

    // View Mode: 'active' (Unapproved), 'approved' (History), or 'rejected'
    const [viewMode, setViewMode] = useState<'active' | 'approved' | 'rejected'>('active');

    // Filters
    const [branch, setBranch] = useState<string>('all');
    const [status, setStatus] = useState<string>('all');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    // Search and Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editMode, setEditMode] = useState<'full' | 'amount'>('full');
    const [searchEmployee, setSearchEmployee] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedDates, setExpandedDates] = useState<string[]>([]);

    // Server-Side Query States
    const [localLoanRequests, setLocalLoanRequests] = useState<LoanRequest[]>([]);
    const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const PAGE_SIZE = 50;

    const [formData, setFormData] = useState<Partial<LoanRequest>>({
        employeeId: '',
        employeeName: '',
        branch: '',
        date: new Date().toISOString().split('T')[0], // Standard YYYY-MM-DD
        requestedAmount: 0,
        balance: 0,
        status: 'debtor',
        basicSalary: 0,
        extraSalary: 0,
        totalSalary: 0,
        notes: ''
    });

    // Formatting date helper
    const formatDateForDisplay = (dateStr: string) => {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${Number(d)}/${Number(m)}`; // Return as D/M
    };

    const formattedDateRange = useMemo(() => {
        let text = '';
        if (startDate) text += `من ${startDate} `;
        if (endDate) text += `إلى ${endDate}`;
        return text;
    }, [startDate, endDate]);

    // Server-Side Fetch Logic
    const buildQuery = (isNextPage = false) => {
        let constraints: QueryConstraint[] = [];

        if (branch && branch !== 'all') {
            constraints.push(where('branch', '==', branch));
        }

        if (status && status !== 'all') {
            constraints.push(where('status', '==', status));
        }

        if (startDate) {
            constraints.push(where('date', '>=', startDate));
        }

        if (endDate) {
            constraints.push(where('date', '<=', endDate));
        }

        const isApprovedFilter = viewMode === 'approved';
        const isRejectedFilter = viewMode === 'rejected';

        if (viewMode === 'active' || viewMode === 'rejected') {
            // Unify query for both active and rejected to use isApproved: false index.
            // We filter isRejected locally in displayedRequests.
            constraints.push(where('isApproved', '==', false));
        } else if (viewMode === 'approved') {
            constraints.push(where('isApproved', '==', true));
        }

        constraints.push(orderBy('date', 'desc'));
        constraints.push(limit(PAGE_SIZE));

        if (isNextPage && lastVisible) {
            constraints.push(startAfter(lastVisible));
        }

        return query(collection(db, ROOT_COLLECTION, DATA_PATH, 'loan_requests'), ...constraints);
    };

    useEffect(() => {
        setLoading(true);
        setLocalLoanRequests([]); // Clear old data to prevent confusion during load
        setLastVisible(null);
        const q = buildQuery(false);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoanRequest));
            setLocalLoanRequests(requests);

            if (snapshot.docs.length > 0) {
                setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
                setHasMore(snapshot.docs.length === PAGE_SIZE);
            } else {
                setLastVisible(null);
                setHasMore(false);
            }
            setLoading(false);
        }, (error) => {
            console.error('Error fetching loan requests:', error);
            alert('حدث خطأ أثناء تحميل البيانات. قد يكون هناك تضارب في الفلاتر أو نقص في الفهرسة (Index).');
            setLoading(false);
        });

        return () => unsubscribe();
    }, [branch, status, startDate, endDate, viewMode]);

    const handleLoadMore = async () => {
        if (!lastVisible || !hasMore) return;
        setLoading(true);
        const q = buildQuery(true);
        const snapshot = await getDocs(q);
        const moreRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoanRequest));

        setLocalLoanRequests(prev => [...prev, ...moreRequests]);

        if (snapshot.docs.length > 0) {
            setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
            setHasMore(snapshot.docs.length === PAGE_SIZE);
        } else {
            setHasMore(false);
        }
        setLoading(false);
    };

    const displayedRequests = useMemo(() => {
        let filtered = localLoanRequests;

        // Local filtering:
        // 'active' -> !isApproved && !isRejected
        // 'rejected' -> !isApproved && isRejected
        if (viewMode === 'active') {
            filtered = filtered.filter(req => !req.isRejected);
        } else if (viewMode === 'rejected') {
            filtered = filtered.filter(req => req.isRejected);
        }

        if (!searchTerm.trim()) return filtered;
        return filtered.filter(req =>
            req.employeeName?.includes(searchTerm) ||
            req.employeeId?.includes(searchTerm)
        );
    }, [localLoanRequests, searchTerm, viewMode]);

    // Grouping for History View (Approved or Rejected)
    const historySummaries = useMemo(() => {
        if (viewMode === 'active') return [];

        const groups: { [date: string]: { date: string, count: number, total: number, requests: LoanRequest[] } } = {};

        displayedRequests.forEach(req => {
            if (!groups[req.date]) {
                groups[req.date] = { date: req.date, count: 0, total: 0, requests: [] };
            }
            groups[req.date].count += 1;
            groups[req.date].total += (req.requestedAmount || 0);
            groups[req.date].requests.push(req);
        });

        return Object.values(groups).sort((a, b) => safeCompare(b.date, a.date));
    }, [displayedRequests, viewMode]);

    // Totals
    const totals = useMemo(() => {
        return displayedRequests.reduce((acc, curr: LoanRequest) => ({
            requested: acc.requested + (curr.requestedAmount || 0),
            basic: acc.basic + (curr.basicSalary || 0),
            totalSalary: acc.totalSalary + (curr.totalSalary || 0),
            balance: acc.balance + (curr.balance || 0),
        }), { requested: 0, basic: 0, totalSalary: 0, balance: 0 });
    }, [displayedRequests]);

    // Handlers
    const handleOpenModal = (request?: LoanRequest, mode: 'full' | 'amount' = 'full') => {
        setEditMode(mode);
        if (request) {
            setEditingId(request.id);
            setFormData({ ...request });
        } else {
            setEditingId(null);
            setFormData({
                employeeId: '',
                employeeName: '',
                branch: '',
                date: new Date().toLocaleDateString('en-GB').split('/').reverse().join('-'), // Use today's date instead of filter

                requestedAmount: 0,
                balance: 0,
                status: 'debtor',
                basicSalary: 0,
                extraSalary: 0,
                totalSalary: 0,
                notes: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleEmployeeSelect = (emp: Employee) => {
        const sal = calculateEmployeeSalary(emp, exchangeRates, deductions);
        const sourceCurrency = emp.salarySourceCurrency || 'YER';
        const employeeCurrency = emp.salaryCurrency || 'old_rial';

        let rateAtReq = 1;
        if (sourceCurrency === 'SAR') {
            rateAtReq = employeeCurrency === 'new_rial'
                ? exchangeRates.SAR_TO_NEW_RIAL
                : exchangeRates.SAR_TO_OLD_RIAL;
        }

        setFormData((prev: Partial<LoanRequest>) => ({
            ...prev,
            employeeId: emp.id,
            employeeName: emp.name,
            branch: emp.branch,
            basicSalary: sal.basic,
            extraSalary: sal.extra,
            totalSalary: sal.basic + sal.extra, // Display total without deductions subtraction
            currency: employeeCurrency,
            exchangeRateAtRequest: rateAtReq
        }));
        setSearchEmployee('');
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.employeeId || !formData.requestedAmount) {
            alert('يرجى اختيار الموظف وتحديد مبلغ السلفة');
            return;
        }

        if (saving) return;
        setSaving(true);
        try {
            if (editingId) {
                await updateLoanRequest(editingId, formData);
            } else {
                await addLoanRequest(formData as any);
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء الحفظ');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        const confirmed = await confirmDialog('هل أنت متأكد من حذف هذا الطلب؟', { type: 'danger', confirmText: 'حذف', cancelText: 'إلغاء' });
        if (confirmed) {
            await deleteLoanRequest(id);
        }
    };

    const handleApprove = async (id: string) => {
        const confirmed = await confirmDialog('تأكيد اعتماد طلب السلفة وترحيله للسجل؟', { type: 'warning', confirmText: 'اعتماد', cancelText: 'إلغاء' });
        if (confirmed) {
            await approveLoanRequest(id);
        }
    };

    const handleReject = async (id: string) => {
        const reason = await promptDialog('يرجى إدخال سبب الرفض (اختياري):', { cancelText: 'إلغاء الأمر', confirmText: 'موافق', placeholder: '' });
        if (reason !== null) {
            await rejectLoanRequest(id, reason);
        }
    };

    const handleExportRejected = () => {
        const rejected = localLoanRequests.filter(r => r.isRejected);
        if (rejected.length === 0) {
            alert('لا توجد طلبات مرفوضة للتصدير');
            return;
        }

        const wb = XLSX.utils.book_new();
        const header = ['التاريخ', 'اسم الموظف', 'الفرع', 'المبلغ', 'العملة', 'سبب الرفض', 'بواسطة'];
        const data = rejected.map(r => [
            r.date,
            r.employeeName,
            r.branch,
            r.requestedAmount,
            getCurrencySymbol(r.currency || 'old_rial'),
            r.rejectionReason || '-',
            r.rejectedByName || '-'
        ]);

        const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
        XLSX.utils.book_append_sheet(wb, ws, 'السلف المرفوضة');
        XLSX.writeFile(wb, `تقرير_السلف_المرفوضة_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // Employee Search Results
    const employeeResults = useMemo(() => {
        if (!searchEmployee) return [];
        return employees.filter(e =>
            e.name.includes(searchEmployee) ||
            e.branch.includes(searchEmployee)
        ).slice(0, 5);
    }, [employees, searchEmployee]);

    return (
        <div className="p-4 md:p-8 space-y-6 animate-fade-in" dir="rtl">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-indigo-600">payments</span>
                        {viewMode === 'active' ? `طلبات السلف ${formattedDateRange}` :
                            viewMode === 'approved' ? 'سجل السلف المعتمدة' :
                                'سجل السلف المرفوضة'}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-bold">
                        {viewMode === 'active' ? 'إدارة ومتابعة سلف الموظفين حسب الفروع' :
                            viewMode === 'approved' ? 'عرض السجل التجميعي للسلف التي تم اعتمادها' :
                                'عرض قائمة الطلبات التي تم رفضها مع توضيح الأسباب'}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <button
                            onClick={() => setViewMode('active')}
                            className={`px-6 py-2 rounded-xl font-black transition-all flex items-center gap-2 ${viewMode === 'active' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <span className="material-symbols-outlined text-lg">pending_actions</span>
                            الطلبات النشطة
                        </button>
                        <button
                            onClick={() => setViewMode('approved')}
                            className={`px-6 py-2 rounded-xl font-black transition-all flex items-center gap-2 ${viewMode === 'approved' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <span className="material-symbols-outlined text-lg">inventory_2</span>
                            السجل
                        </button>
                        <button
                            onClick={() => setViewMode('rejected')}
                            className={`px-6 py-2 rounded-xl font-black transition-all flex items-center gap-2 ${viewMode === 'rejected' ? 'bg-white dark:bg-slate-700 text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <span className="material-symbols-outlined text-lg">cancel</span>
                            المرفوضة
                        </button>
                    </div>

                    {viewMode === 'rejected' && (
                        <button
                            onClick={handleExportRejected}
                            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-red-200 dark:shadow-none transition-all flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined">download</span>
                            تصدير تقرير الرفض
                        </button>
                    )}

                    {canAddLoans && viewMode === 'active' && (
                        <button
                            onClick={() => handleOpenModal()}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined">add_circle</span>
                            إضافة طلب سلفة
                        </button>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 items-end">
                <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 mr-2">تصفية حسب الفرع</label>
                    <select
                        value={branch}
                        onChange={(e) => { setBranch(e.target.value); setLastVisible(null); }}
                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl px-4 py-3 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    >
                        <option value="all">كل الفروع</option>
                        {['صنعاء', 'عدن', 'إب', 'ذمار', 'تعز - الحوبان', 'تعز - المدينة', 'المكلا', 'الحديدة'].map(b => (
                            <option key={b} value={b}>{b}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 mr-2">الحالة</label>
                    <select
                        value={status}
                        onChange={(e) => { setStatus(e.target.value); setLastVisible(null); }}
                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl px-4 py-3 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    >
                        <option value="all">الكل</option>
                        <option value="debtor">مدين</option>
                        <option value="creditor">دائن</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 mr-2">من تاريخ</label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => { setStartDate(e.target.value); setLastVisible(null); }}
                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl px-4 py-3 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 mr-2">إلى تاريخ</label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => { setEndDate(e.target.value); setLastVisible(null); }}
                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl px-4 py-3 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 mr-2">بحث (في النتائج)</label>
                    <input
                        type="text"
                        placeholder="اسم الموظف..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl px-4 py-3 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                </div>
            </div>

            {/* Main Table / Record View */}
            {viewMode === 'active' ? (
                <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-900/50">
                                    <th className="px-6 py-5 text-right text-sm font-black text-slate-500">الفرع</th>
                                    <th className="px-6 py-5 text-right text-sm font-black text-slate-500">الاسم</th>
                                    <th className="px-6 py-5 text-right text-sm font-black text-slate-500">التنبيهات والخصومات</th>
                                    <th className="px-6 py-5 text-right text-sm font-black text-slate-500">الرصيد</th>
                                    <th className="px-6 py-5 text-right text-sm font-black text-slate-500">الحالة</th>
                                    <th className="px-6 py-5 text-right text-sm font-black text-slate-500">السلفة المطلوبة</th>
                                    {canViewSalary && (
                                        <>
                                            <th className="px-6 py-5 text-right text-sm font-black text-slate-500">الراتب</th>
                                            <th className="px-6 py-5 text-right text-sm font-black text-slate-500">الراتب مع الإضافي</th>
                                        </>
                                    )}
                                    <th className="px-6 py-5 text-right text-sm font-black text-slate-500">ملاحظات</th>
                                    {(canEditLoans || canDeleteLoans || canApproveLoans) && <th className="px-6 py-5 text-center text-sm font-black text-slate-500">الإجراءات</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {loading && displayedRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={canViewSalary ? 10 : 8} className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <span className="material-symbols-outlined text-4xl text-indigo-500 animate-spin">refresh</span>
                                                <p className="text-slate-500 font-bold animate-pulse">جاري تحميل البيانات...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : displayedRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={canViewSalary ? 10 : 8} className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <span className="material-symbols-outlined text-6xl text-slate-200 dark:text-slate-700">payments</span>
                                                <p className="text-slate-400 font-bold">لا توجد طلبات سلف لهذه الفلاتر</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    displayedRequests.map((req) => (
                                        <tr key={req.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors group">
                                            <td className="px-6 py-4">
                                                <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-black">
                                                    {req.branch}
                                                </span>
                                            </td>
                                            <td
                                                className="px-6 py-4 font-bold text-slate-700 dark:text-white cursor-pointer hover:text-blue-600 transition-colors"
                                                onClick={() => setSelectedEmployeeDrawerId(req.employeeId)}
                                            >
                                                {req.employeeName}
                                            </td>
                                            <td className="px-6 py-4">
                                                {(() => {
                                                    // Filter non-exempted deductions for this employee in the current month
                                                    const currentMonth = ARABIC_MONTHS[new Date().getMonth()];
                                                    const empDeductions = deductions.filter(d =>
                                                        d.employeeId === req.employeeId &&
                                                        !d.isExempted &&
                                                        (d.month === currentMonth || d.date.includes(`/${new Date().getMonth() + 1}/`))
                                                    );

                                                    const totalAmount = empDeductions.reduce((sum, d) => sum + (d.amount || 0), 0);
                                                    const count = empDeductions.length;

                                                    if (count === 0) return <span className="text-slate-300 text-xs font-bold">- لا يوجد -</span>;

                                                    return (
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-black text-xs">
                                                                <span className="material-symbols-outlined text-sm">warning</span>
                                                                {count} تنبيهات/خصومات
                                                            </div>
                                                            {totalAmount > 0 && (
                                                                <div className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-md inline-block w-fit">
                                                                    إجمالي: {totalAmount.toLocaleString()} {getCurrencySymbol(req.currency)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-6 py-4 font-mono font-bold text-slate-600 dark:text-slate-300">{req.balance.toLocaleString()} {getCurrencySymbol(req.currency)}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-3 py-1 rounded-lg text-xs font-black ${req.status === 'debtor'
                                                    ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                                                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                                                    }`}>
                                                    {req.status === 'debtor' ? 'مدين' : 'دائن'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 font-mono font-black text-indigo-600 dark:text-indigo-400 text-2xl">
                                                {req.requestedAmount.toLocaleString()} {getCurrencySymbol(req.currency)}
                                            </td>
                                            {canViewSalary && (
                                                <>
                                                    <td className="px-6 py-4 font-mono font-bold text-slate-500 dark:text-slate-400">{req.basicSalary.toLocaleString()} {getCurrencySymbol(req.currency)}</td>
                                                    <td className="px-6 py-4 font-mono font-black text-slate-700 dark:text-slate-200">{req.totalSalary.toLocaleString()} {getCurrencySymbol(req.currency)}</td>
                                                </>
                                            )}
                                            <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate" title={req.notes}>
                                                {req.notes || '-'}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {canApproveLoans && (
                                                        <button
                                                            onClick={() => handleApprove(req.id)}
                                                            className="px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-xl transition-all font-black text-xs flex items-center gap-1 border border-emerald-200 dark:border-emerald-800"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">how_to_reg</span>
                                                            اعتماد
                                                        </button>
                                                    )}
                                                    {canApproveLoans && (
                                                        <button
                                                            onClick={() => handleReject(req.id)}
                                                            className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 rounded-xl transition-all font-black text-xs flex items-center gap-1 border border-red-200 dark:border-red-800"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">cancel</span>
                                                            رفض
                                                        </button>
                                                    )}
                                                    {canEditLoans && (
                                                        <>
                                                            <button
                                                                onClick={() => handleOpenModal(req, 'amount')}
                                                                className="px-3 py-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors border border-blue-200 dark:border-blue-800 text-xs font-bold"
                                                                title="تعديل المبلغ فقط"
                                                            >
                                                                المبلغ
                                                            </button>
                                                            <button
                                                                onClick={() => handleOpenModal(req, 'full')}
                                                                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors border border-blue-100 dark:border-blue-900"
                                                                title="تعديل البيانات كاملة"
                                                            >
                                                                <span className="material-symbols-outlined text-lg">edit</span>
                                                            </button>
                                                        </>
                                                    )}
                                                    {canDeleteLoans && (
                                                        <button
                                                            onClick={() => handleDelete(req.id)}
                                                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors border border-red-100 dark:border-red-900"
                                                        >
                                                            <span className="material-symbols-outlined text-lg">delete</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {displayedRequests.length > 0 && (
                                <tfoot>
                                    <tr className="bg-indigo-50/30 dark:bg-indigo-900/10 font-black">
                                        <td colSpan={2} className="px-6 py-5 text-indigo-700 dark:text-indigo-300">اجمالي السلف</td>
                                        <td className="px-6 py-5 font-mono text-indigo-700 dark:text-indigo-300">{totals.balance.toLocaleString()}</td>
                                        <td></td>
                                        <td className="px-6 py-5 font-mono text-indigo-700 dark:text-indigo-300 text-xl">{totals.requested.toLocaleString()}</td>
                                        {canViewSalary && (
                                            <>
                                                <td className="px-6 py-5 font-mono text-indigo-600/70 dark:text-indigo-400/70">{totals.basic.toLocaleString()}</td>
                                                <td className="px-6 py-5 font-mono text-indigo-700 dark:text-indigo-400">{totals.totalSalary.toLocaleString()}</td>
                                            </>
                                        )}
                                        <td></td>
                                        {(canEditLoans || canDeleteLoans || canApproveLoans) && <td></td>}
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                    {hasMore && (
                        <div className="p-6 border-t border-slate-100 dark:border-slate-700 flex justify-center bg-slate-50 dark:bg-slate-800/50">
                            <button
                                onClick={handleLoadMore}
                                disabled={loading}
                                className="px-8 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:border-indigo-300 text-indigo-600 dark:text-indigo-400 rounded-xl font-black flex items-center gap-2 transition-all shadow-sm hover:shadow-md disabled:opacity-50"
                            >
                                {loading ? <span className="material-symbols-outlined animate-spin font-bold">refresh</span> : <span className="material-symbols-outlined font-bold">expand_more</span>}
                                {loading ? 'جاري التحميل...' : 'تحميل المزيد'}
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                /* History Record View (Grouped by Date) */
                <div className="space-y-4">
                    <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-900/50">
                                        <th className="px-8 py-5 text-right text-sm font-black text-slate-500">التاريخ</th>
                                        <th className="px-8 py-5 text-right text-sm font-black text-slate-500">عدد الطلبات</th>
                                        <th className="px-8 py-5 text-right text-sm font-black text-slate-500">إجمالي المبالغ</th>
                                        <th className="px-8 py-5 text-center text-sm font-black text-slate-500">الإجراء</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {historySummaries.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-20 text-center text-slate-400 font-bold">لا توجد سجلات حالياً</td>
                                        </tr>
                                    ) : (
                                        historySummaries.map(group => (
                                            <React.Fragment key={group.date}>
                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                                                    <td className="px-8 py-5 font-black text-slate-700 dark:text-white">{group.date}</td>
                                                    <td className="px-8 py-5 text-indigo-600 dark:text-indigo-400 font-black">
                                                        {group.count} موظفين
                                                    </td>
                                                    <td className="px-8 py-5 font-mono font-black text-lg text-emerald-600 dark:text-emerald-400">
                                                        {group.total.toLocaleString()}
                                                    </td>
                                                    <td className="px-8 py-5 text-center">
                                                        <button
                                                            className={`p-2 rounded-xl transition-all flex items-center justify-center mx-auto ${expandedDates.includes(group.date)
                                                                ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30'
                                                                : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700'
                                                                }`}
                                                            onClick={() => {
                                                                const isExpanded = expandedDates.includes(group.date);
                                                                if (isExpanded) {
                                                                    setExpandedDates(prev => prev.filter(d => d !== group.date));
                                                                } else {
                                                                    setExpandedDates(prev => [...prev, group.date]);
                                                                }
                                                            }}
                                                            title={expandedDates.includes(group.date) ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
                                                        >
                                                            <span className={`material-symbols-outlined transition-transform duration-300 ${expandedDates.includes(group.date) ? 'rotate-180' : ''}`}>
                                                                {expandedDates.includes(group.date) ? 'expand_less' : 'visibility'}
                                                            </span>
                                                        </button>
                                                    </td>
                                                </tr>

                                                {/* Expanded Details */}
                                                {expandedDates.includes(group.date) && (
                                                    <tr>
                                                        <td colSpan={4} className="px-8 py-0">
                                                            <div className="bg-slate-50/50 dark:bg-slate-900/30 rounded-2xl my-4 overflow-hidden border border-slate-100 dark:border-slate-800 animate-slide-down">
                                                                <table className="w-full text-right">
                                                                    <thead>
                                                                        <tr className="border-b border-slate-200 dark:border-slate-700">
                                                                            <th className="px-4 py-3 text-xs font-black text-slate-400">الموظف</th>
                                                                            <th className="px-4 py-3 text-xs font-black text-slate-400">الفرع</th>
                                                                            <th className="px-4 py-3 text-xs font-black text-slate-400">المبلغ</th>
                                                                            <th className="px-4 py-3 text-xs font-black text-slate-400">إجمالي الراتب</th>
                                                                            <th className="px-4 py-3 text-xs font-black text-slate-400">الملاحظات</th>
                                                                            <th className="px-4 py-3 text-xs font-black text-slate-400 text-center">الحالة</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                                        {group.requests.map(req => (
                                                                            <tr key={req.id} className="hover:bg-white dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0">
                                                                                <td className="px-4 py-4">
                                                                                    <div
                                                                                        className="font-bold text-slate-700 dark:text-slate-300 text-base cursor-pointer hover:text-blue-600 transition-colors"
                                                                                        onClick={() => setSelectedEmployeeDrawerId(req.employeeId)}
                                                                                    >
                                                                                        {req.employeeName}
                                                                                    </div>
                                                                                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                                                                                        {req.approvedByName ? `بواسطة: ${req.approvedByName}` : ''}
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-4 py-4 text-sm text-slate-500 font-bold">{req.branch}</td>
                                                                                <td className="px-4 py-4 font-mono font-black text-indigo-600 dark:text-indigo-400 text-lg">
                                                                                    {req.requestedAmount.toLocaleString()} {getCurrencySymbol(req.currency)}
                                                                                </td>
                                                                                <td className="px-4 py-4 text-sm text-slate-500 font-bold">
                                                                                    {req.totalSalary.toLocaleString()} {getCurrencySymbol(req.currency)}
                                                                                </td>
                                                                                <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400 max-w-[200px] truncate font-bold" title={req.notes}>
                                                                                    {req.notes || '-'}
                                                                                </td>
                                                                                <td className="px-4 py-4 text-center">
                                                                                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black border ${req.isApproved
                                                                                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                                                                        : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800'
                                                                                        }`}>
                                                                                        {req.isApproved ? 'معتمد' : 'مرفوض'}
                                                                                    </span>
                                                                                    {req.rejectionReason && (
                                                                                        <div className="text-[10px] text-red-400 mt-1 max-w-[150px] truncate" title={req.rejectionReason}>
                                                                                            السبب: {req.rejectionReason}
                                                                                        </div>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {hasMore && (
                            <div className="p-6 border-t border-slate-100 dark:border-slate-700 flex justify-center bg-slate-50 dark:bg-slate-800/50">
                                <button
                                    onClick={handleLoadMore}
                                    disabled={loading}
                                    className="px-8 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:border-indigo-300 text-indigo-600 dark:text-indigo-400 rounded-xl font-black flex items-center gap-2 transition-all shadow-sm hover:shadow-md disabled:opacity-50"
                                >
                                    {loading ? <span className="material-symbols-outlined animate-spin font-bold">refresh</span> : <span className="material-symbols-outlined font-bold">expand_more</span>}
                                    {loading ? 'جاري التحميل...' : 'تحميل المزيد'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto thin-scrollbar animate-slide-up">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                                <span className="material-symbols-outlined text-indigo-600">payments</span>
                                {editingId ? 'تعديل طلب سلفة' : 'إضافة طلب سلفة جديد'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-8 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {editMode === 'full' && (
                                    <div className="space-y-2 relative">
                                        <label className="text-sm font-black text-slate-500 mr-2">اسم الموظف</label>
                                        <div className="relative">
                                            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">person_search</span>
                                            <input
                                                type="text"
                                                placeholder="ابحث بالاسم..."
                                                value={formData.employeeName || searchEmployee}
                                                onChange={(e) => {
                                                    setSearchEmployee(e.target.value);
                                                    if (formData.employeeId) setFormData(prev => ({ ...prev, employeeId: '', employeeName: '' }));
                                                }}
                                                className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 pr-12 pl-4 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                            />

                                            {/* Dropdown Results */}
                                            {employeeResults.length > 0 && (
                                                <div className="absolute z-10 w-full mt-2 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                                                    {employeeResults.map(emp => (
                                                        <button
                                                            key={emp.id}
                                                            type="button"
                                                            onClick={() => handleEmployeeSelect(emp)}
                                                            className="w-full text-right px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex flex-col"
                                                        >
                                                            <span className="font-black text-slate-800 dark:text-white">{emp.name}</span>
                                                            <span className="text-xs text-slate-400 font-bold">{emp.branch} | {emp.systemAccountNumber}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-sm font-black text-slate-500 mr-2">التاريخ</label>
                                    <input
                                        type="date"
                                        value={formData.date}
                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-black text-slate-500 mr-2">السلفة المطلوبة</label>
                                    <input
                                        type="number"
                                        value={formData.requestedAmount || ''}
                                        onChange={(e) => setFormData({ ...formData, requestedAmount: Number(e.target.value) })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-mono font-black text-indigo-600 dark:text-indigo-400 text-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                        placeholder="0"
                                    />
                                </div>

                                {editMode === 'full' && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-black text-slate-500 mr-2">الرصيد الحالي للموظف</label>
                                            <input
                                                type="number"
                                                value={formData.balance || ''}
                                                onChange={(e) => setFormData({ ...formData, balance: Number(e.target.value) })}
                                                className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-mono font-bold text-slate-600 dark:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                                placeholder="0"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-black text-slate-500 mr-2">الحالة</label>
                                            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-50 dark:bg-slate-900 rounded-2xl">
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, status: 'debtor' })}
                                                    className={`py-3 rounded-xl font-black transition-all ${formData.status === 'debtor'
                                                        ? 'bg-red-500 text-white shadow-lg'
                                                        : 'text-slate-400 hover:text-slate-600'
                                                        }`}
                                                >
                                                    مدين
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, status: 'creditor' })}
                                                    className={`py-3 rounded-xl font-black transition-all ${formData.status === 'creditor'
                                                        ? 'bg-emerald-500 text-white shadow-lg'
                                                        : 'text-slate-400 hover:text-slate-600'
                                                        }`}
                                                >
                                                    دائن
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div className="space-y-2">
                                    <label className="text-sm font-black text-slate-500 mr-2">الفرع (تلقائي)</label>
                                    <input
                                        type="text"
                                        value={formData.branch}
                                        readOnly
                                        className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-2xl py-4 px-6 font-bold text-slate-400 dark:text-slate-500 outline-none cursor-not-allowed"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-black text-slate-500 mr-2">ملاحظات</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all min-h-[100px]"
                                    placeholder="أي ملاحظات إضافية..."
                                />
                            </div>

                            <div className="pt-6 flex gap-4">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className={`flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-black shadow-lg shadow-indigo-100 dark:shadow-none transition-all flex items-center justify-center gap-2 ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                    {saving && <span className="material-symbols-outlined animate-spin">refresh</span>}
                                    {saving ? 'جاري الحفظ...' : 'حفظ الطلب'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-8 py-4 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl font-black hover:bg-slate-200 transition-all"
                                >
                                    إلغاء
                                </button>
                            </div>
                        </form>

                        {/* If employee selected, show deductions alert */}
                        {formData.employeeId && (
                            <div className="px-8 pb-8 space-y-4">
                                {(() => {
                                    const emp = employees.find(e => e.id === formData.employeeId);
                                    if (!emp) return null;
                                    const filterStr = formData.date?.substring(0, 7) || new Date().toISOString().substring(0, 7);
                                    const sal = calculateEmployeeSalary(emp, exchangeRates, deductions, filterStr);

                                    if (sal.deductionsTotal > 0) {
                                        return (
                                            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-3xl flex items-center gap-4 animate-pulse">
                                                <span className="material-symbols-outlined text-amber-600 text-3xl">warning</span>
                                                <div>
                                                    <div className="text-amber-800 dark:text-amber-200 font-black text-sm">تنبيه خصميات لهذا الشهر</div>
                                                    <div className="text-amber-600 dark:text-amber-400 text-xs font-bold">
                                                        يوجد على الموظف إجمالي خصميات بقيمة {sal.deductionsTotal.toLocaleString()} {getCurrencySymbol(emp.salaryCurrency)} خلال هذا الشهر.
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}

                                {/* Financial Info Summary */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-700">
                                        <div className="text-[10px] text-slate-500 font-bold">الراتب الأساسي</div>
                                        <div className="text-xl font-black text-slate-800 dark:text-white">
                                            {formData.totalSalary?.toLocaleString()} {getCurrencySymbol(formData.currency as any)}
                                        </div>
                                    </div>
                                    <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-700">
                                        <div className="text-[10px] text-slate-500 font-bold">الرصيد الحالي</div>
                                        <div className={`text-xl font-black ${formData.status === 'debtor' ? 'text-red-500' : 'text-emerald-500'}`}>
                                            {formData.balance?.toLocaleString()} {getCurrencySymbol(formData.currency as any)}
                                            <span className="text-xs mr-1 opacity-50 font-bold">({formData.status === 'debtor' ? 'مدين' : 'دائن'})</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LoanRequestsPage;
