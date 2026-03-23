import React, { useState, useMemo, useEffect } from 'react';
import { confirmDialog } from '../utils/confirm';
import { useNavigate } from 'react-router-dom';
import { useAppContext, InvoiceBatch } from '../AppContext';
import InvoiceBookletPrintModal from './InvoiceBookletPrintModal';

const InvoiceBatchesPage: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser, branches, addLog, invoiceBatches, addInvoiceBatch, updateInvoiceBatch, deleteInvoiceBatch,
        invoiceBatchItems, loadBatchItems, addInvoiceBatchItem, updateInvoiceBatchItem, deleteInvoiceBatchItem,
        exchangeRates } = useAppContext();

    // Permissions
    const isSuperAdmin = currentUser?.role === 'super_admin';
    const canView = isSuperAdmin || currentUser?.permissions?.includes('invoice_batches_view') || currentUser?.permissions?.includes('invoice_manage');
    const canCreate = isSuperAdmin || currentUser?.permissions?.includes('invoice_batches_create') || currentUser?.permissions?.includes('invoice_manage');
    const canEdit = isSuperAdmin || currentUser?.permissions?.includes('invoice_batches_edit') || currentUser?.permissions?.includes('invoice_manage');
    const canDelete = isSuperAdmin || currentUser?.permissions?.includes('invoice_batches_delete');
    const canFinView = isSuperAdmin || currentUser?.permissions?.includes('financial_details_view');
    const canAddItem = isSuperAdmin || currentUser?.permissions?.includes('batch_items_create') || currentUser?.permissions?.includes('invoice_manage');
    const canEditItem = isSuperAdmin || currentUser?.permissions?.includes('batch_items_edit') || currentUser?.permissions?.includes('invoice_manage');
    const canDeleteItem = isSuperAdmin || currentUser?.permissions?.includes('batch_items_delete');
    const canViewEntries = isSuperAdmin || currentUser?.permissions?.includes('financial_details_view') || currentUser?.permissions?.includes('financial_details_manage');

    // State
    const [selectedBatch, setSelectedBatch] = useState<InvoiceBatch | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [savingItem, setSavingItem] = useState(false);
    const [savingBatch, setSavingBatch] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [printParams, setPrintParams] = useState<{ rangeFrom: number, rangeTo: number, name: string } | null>(null);

    const emptyBatchForm = {
        name: '', rangeFrom: 0, rangeTo: 0, totalBooklets: 4000,
        totalAmountPrint: 0, totalAmountStamp: 0, totalAmountTransport: 0,
        issueDate: new Date().toISOString().split('T')[0],
        notes: '',
        accountNumber: ''
    };
    const [batchForm, setBatchForm] = useState(emptyBatchForm);

    // Item form
    const emptyItemForm = {
        branchId: '', branchName: '', rangeFrom: 0, rangeTo: 0,
        disbursementDate: new Date().toISOString().split('T')[0],
    };
    const [itemForm, setItemForm] = useState(emptyItemForm);

    const activeBranches = useMemo(() => branches.filter(b => b.isActive), [branches]);

    // Exchange rates — read-only from settings
    const exRateOld = exchangeRates?.SAR_TO_OLD_RIAL || 0;
    const exRateNew = exchangeRates?.SAR_TO_NEW_RIAL || 0;

    // Computed: batch totalAmount
    const computedTotal = batchForm.totalAmountPrint + batchForm.totalAmountStamp + batchForm.totalAmountTransport;

    // Booklet price
    const bookletPrice = selectedBatch ? (selectedBatch.totalAmount / (selectedBatch.totalBooklets || 4000)) : 0;

    // Item booklet count
    const itemBookletCount = itemForm.rangeTo > 0 && itemForm.rangeFrom > 0
        ? (itemForm.rangeTo - itemForm.rangeFrom + 1) / 25 : 0;
    const isValidBookletCount = Number.isInteger(itemBookletCount) && itemBookletCount > 0;

    // Amounts
    const itemAmountOld = isValidBookletCount ? itemBookletCount * bookletPrice : 0;
    const selectedBranch = activeBranches.find(b => b.id === itemForm.branchId);
    const isNewRialBranch = selectedBranch?.currencyType === 'new_rial';
    const itemAmountNew = (isNewRialBranch && exRateOld > 0)
        ? itemAmountOld * (exRateNew / exRateOld) : undefined;

    // 4000 limit
    const totalBookletsUsed = useMemo(() =>
        invoiceBatchItems.reduce((s, i) => s + (i.bookletCount || 0), 0),
        [invoiceBatchItems]);
    const editingItemBooklets = editingItemId
        ? (invoiceBatchItems.find(i => i.id === editingItemId)?.bookletCount || 0) : 0;
    const bookletsRemaining = (selectedBatch?.totalBooklets || 4000) - totalBookletsUsed + editingItemBooklets;
    const wouldExceedLimit = isValidBookletCount && itemBookletCount > bookletsRemaining;

    // Auto description — read-only
    const autoDescription = isValidBookletCount && itemForm.branchName && selectedBatch
        ? `لكم صرف فواتير من ${itemForm.rangeFrom} الى ${itemForm.rangeTo} بتاريخ ${itemForm.disbursementDate.replace(/-/g, '/')}`
        : '';

    // Filtered batches
    const filteredBatches = useMemo(() => {
        if (!searchTerm.trim()) return invoiceBatches;
        return invoiceBatches.filter(b => b.name.includes(searchTerm) || b.notes?.includes(searchTerm)
            || String(b.rangeFrom).includes(searchTerm) || String(b.rangeTo).includes(searchTerm));
    }, [invoiceBatches, searchTerm]);

    // Helpers
    const parseNum = (val: string) => {
        const cleaned = val.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]).replace(/,/g, '');
        return Number(cleaned) || 0;
    };

    // ============ BATCH SELECT ============
    const handleSelectBatch = (batch: InvoiceBatch) => {
        setSelectedBatch(batch);
        loadBatchItems(batch.id);
    };
    const handleBackToBatches = () => { setSelectedBatch(null); loadBatchItems(''); };

    // ============ BATCH CRUD ============
    const handleOpenBatchModal = (batch?: InvoiceBatch) => {
        if (batch) {
            setEditingBatchId(batch.id);
            setBatchForm({
                name: batch.name, rangeFrom: batch.rangeFrom, rangeTo: batch.rangeTo,
                totalBooklets: batch.totalBooklets || 4000,
                totalAmountPrint: batch.totalAmountPrint || 0, totalAmountStamp: batch.totalAmountStamp || 0,
                totalAmountTransport: batch.totalAmountTransport || 0,
                issueDate: batch.issueDate?.split('T')[0] || '',
                notes: batch.notes || '',
                accountNumber: batch.accountNumber || ''
            });
        } else {
            setEditingBatchId(null);
            setBatchForm(emptyBatchForm);
        }
        setIsBatchModalOpen(true);
    };

    const handleSaveBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!batchForm.name || !batchForm.rangeFrom || !batchForm.rangeTo) { alert('يرجى إدخال اسم الدفعة والنطاق'); return; }
        setSavingBatch(true);
        try {
            const total = batchForm.totalAmountPrint + batchForm.totalAmountStamp + batchForm.totalAmountTransport;
            const data: any = {
                name: batchForm.name, rangeFrom: batchForm.rangeFrom, rangeTo: batchForm.rangeTo,
                totalBooklets: batchForm.totalBooklets || 4000,
                totalAmountPrint: batchForm.totalAmountPrint, totalAmountStamp: batchForm.totalAmountStamp,
                totalAmountTransport: batchForm.totalAmountTransport, totalAmount: total,
                issueDate: batchForm.issueDate,
                notes: batchForm.notes || '',
                accountNumber: batchForm.accountNumber || '',
            };
            if (editingBatchId) {
                await updateInvoiceBatch(editingBatchId, data);
                if (selectedBatch?.id === editingBatchId) setSelectedBatch({ ...selectedBatch!, ...data, id: editingBatchId });
                addLog('تعديل دفعة فواتير', `الدفعة: ${data.name}`, 'general');
            } else {
                await addInvoiceBatch(data);
                addLog('إنشاء دفعة فواتير', `الدفعة: ${data.name} — النطاق: ${data.rangeFrom}-${data.rangeTo}`, 'general');
            }
            setIsBatchModalOpen(false);
        } catch (err: any) { console.error(err); alert('حدث خطأ أثناء الحفظ: ' + (err?.message || '')); }
        setSavingBatch(false);
    };

    const handleDeleteBatch = async (batch: InvoiceBatch) => {
        const confirmed = await confirmDialog(`هل أنت متأكد من حذف الدفعة "${batch.name}"؟ سيتم حذف جميع صرفياتها.`, { type: 'danger', confirmText: 'حذف', cancelText: 'إلغاء' });
        if (!confirmed) return;
        try {
            await deleteInvoiceBatch(batch.id);
            if (selectedBatch?.id === batch.id) handleBackToBatches();
            addLog('حذف دفعة فواتير', `الدفعة: ${batch.name}`, 'general');
        } catch (err) { console.error(err); }
    };

    // ============ ITEM CRUD ============
    const handleOpenItemModal = (item?: any) => {
        if (item) {
            setEditingItemId(item.id);
            setItemForm({
                branchId: item.branchId, branchName: item.branchName,
                rangeFrom: item.rangeFrom, rangeTo: item.rangeTo,
                disbursementDate: item.disbursementDate?.split('T')[0] || new Date().toISOString().split('T')[0],
            });
        } else {
            setEditingItemId(null);
            setItemForm(emptyItemForm);
        }
        setIsItemModalOpen(true);
    };

    const handleBranchChange = (branchId: string) => {
        const br = activeBranches.find(b => b.id === branchId);
        setItemForm(prev => ({ ...prev, branchId, branchName: br?.name || '' }));
    };

    const validateRangeOverlap = (from: number, to: number, excludeId?: string): boolean => {
        return invoiceBatchItems.filter(item => item.id !== excludeId).some(item => from <= item.rangeTo && to >= item.rangeFrom);
    };

    const handleSaveItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedBatch) return;
        if (!itemForm.branchId || !itemForm.rangeFrom || !itemForm.rangeTo) { alert('يرجى اختيار الفرع وتحديد النطاق'); return; }
        if (!isValidBookletCount) { alert('النطاق المحدد لا ينتج عدد دفاتر صحيح (يجب أن يقبل القسمة على 25)'); return; }
        if (validateRangeOverlap(itemForm.rangeFrom, itemForm.rangeTo, editingItemId || undefined)) { alert('النطاق المحدد يتداخل مع صرف موجود'); return; }
        if (wouldExceedLimit) { alert(`لا يمكن تجاوز ${selectedBatch.totalBooklets || 4000} دفتر لهذه الدفعة. المتبقي: ${bookletsRemaining} دفتر`); return; }

        setSavingItem(true);
        try {
            const branchData = activeBranches.find(b => b.id === itemForm.branchId);
            const isNew = branchData?.currencyType === 'new_rial';
            const amountOld = itemBookletCount * bookletPrice;
            const amountNew = (isNew && exRateOld > 0) ? amountOld * (exRateNew / exRateOld) : null;
            const desc = `لكم صرف فواتير من ${itemForm.rangeFrom} الى ${itemForm.rangeTo} بتاريخ ${itemForm.disbursementDate.replace(/-/g, '/')}`;

            const data: any = {
                batchId: selectedBatch.id, branchId: itemForm.branchId, branchName: itemForm.branchName,
                rangeFrom: itemForm.rangeFrom, rangeTo: itemForm.rangeTo, bookletCount: itemBookletCount,
                bookletPrice, amountOld, amountNew, exchangeRateOld: exRateOld, exchangeRateNew: exRateNew,
                disbursementDescription: desc, exchangeRateDescription: '', disbursementDate: itemForm.disbursementDate, isPosted: false,
            };
            // Keep entryNumber/contraEntryNumber if editing
            if (editingItemId) {
                const existing = invoiceBatchItems.find(i => i.id === editingItemId);
                data.entryNumber = existing?.entryNumber || '';
                data.contraEntryNumber = existing?.contraEntryNumber || '';
                data.isPosted = existing?.isPosted || false;
                await updateInvoiceBatchItem(editingItemId, data);
                addLog('تعديل صرف دفاتر', `فرع: ${data.branchName} — ${data.bookletCount} دفتر`, 'general');
            } else {
                data.entryNumber = '';
                data.contraEntryNumber = '';
                await addInvoiceBatchItem(data);
                addLog('إضافة صرف دفاتر', `فرع: ${data.branchName} — ${data.bookletCount} دفتر`, 'general');
            }
            setIsItemModalOpen(false);
        } catch (err: any) { console.error(err); alert('حدث خطأ أثناء الحفظ: ' + (err?.message || '')); }
        setSavingItem(false);
    };

    const handleDeleteItem = async (item: any) => {
        const confirmed = await confirmDialog(`هل أنت متأكد من حذف صرف فرع "${item.branchName}"؟`, { type: 'danger', confirmText: 'حذف', cancelText: 'إلغاء' });
        if (!confirmed) return;
        try {
            await deleteInvoiceBatchItem(item.id);
            addLog('حذف صرف دفاتر', `فرع: ${item.branchName}`, 'general');
        } catch (err) { console.error(err); }
    };

    // ============ RENDER ============
    if (!canView) {
        return (
            <div className="p-8 text-center">
                <span className="material-symbols-outlined text-6xl text-red-300">lock</span>
                <p className="text-xl font-black text-red-500 mt-4">ليس لديك صلاحية لعرض هذه الصفحة</p>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 space-y-8 animate-fade-in min-h-screen bg-slate-50/50 dark:bg-slate-900/50" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
                <div className="space-y-2">
                    <h1 className="text-4xl font-black bg-gradient-to-l from-blue-700 via-indigo-600 to-violet-600 bg-clip-text text-transparent drop-shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                            <span className="material-symbols-outlined text-3xl">receipt_long</span>
                        </div>
                        {selectedBatch ? `${selectedBatch.name}` : 'إدارة صرف الدفاتر'}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-bold flex items-center gap-2 mr-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                        {selectedBatch
                            ? `توزيع الدفاتر للفرع من الدفعة الحالية`
                            : 'إدارة دفعات دفاتر الفواتير وتوزيعها بشكل آلي ودقيق'}
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {selectedBatch && (
                        <>
                            <button onClick={handleBackToBatches}
                                className="px-6 py-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-2xl font-black hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm hover:shadow-md flex items-center gap-2 group">
                                <span className="material-symbols-outlined group-hover:-translate-x-1 transition-transform">arrow_forward</span>العودة للدفعات
                            </button>
                            {canViewEntries && (
                                <button onClick={() => navigate(`/invoice-batches/${selectedBatch.id}/entries`)}
                                    className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white rounded-2xl font-black shadow-lg shadow-purple-500/30 transition-all flex items-center gap-2 hover:-translate-y-0.5">
                                    <span className="material-symbols-outlined">account_balance_wallet</span>القيود المحاسبية
                                </button>
                            )}
                        </>
                    )}
                    {canCreate && !selectedBatch && (
                        <button onClick={() => handleOpenBatchModal()}
                            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-black shadow-lg shadow-blue-500/30 transition-all flex items-center gap-2 hover:-translate-y-0.5">
                            <span className="material-symbols-outlined">add_circle</span>إنشاء دفعة جديدة
                        </button>
                    )}
                    {canAddItem && selectedBatch && (
                        <button onClick={() => handleOpenItemModal()}
                            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-2xl font-black shadow-lg shadow-emerald-500/30 transition-all flex items-center gap-2 hover:-translate-y-0.5">
                            <span className="material-symbols-outlined">local_shipping</span>صرف جديد للفرع
                        </button>
                    )}
                </div>
            </div>

            {/* ============ BATCHES LIST ============ */}
            {!selectedBatch ? (
                <>
                    {/* Main Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-md p-6 rounded-[2rem] border border-white/20 dark:border-slate-700/50 shadow-xl shadow-slate-200/20 dark:shadow-none hover:-translate-y-1 transition-all group overflow-hidden relative">
                            <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all"></div>
                            <div className="flex items-start justify-between relative z-10">
                                <div className="space-y-1">
                                    <p className="text-slate-500 dark:text-slate-400 font-black text-sm">إجمالي الدفعات</p>
                                    <h3 className="text-3xl font-black text-slate-800 dark:text-white font-mono">{invoiceBatches.length}</h3>
                                </div>
                                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/40 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-inner">
                                    <span className="material-symbols-outlined text-2xl">grid_view</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-md p-6 rounded-[2rem] border border-white/20 dark:border-slate-700/50 shadow-xl shadow-slate-200/20 dark:shadow-none hover:-translate-y-1 transition-all group overflow-hidden relative">
                            <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>
                            <div className="flex items-start justify-between relative z-10">
                                <div className="space-y-1">
                                    <p className="text-slate-500 dark:text-slate-400 font-black text-sm">إجمالي الدفاتر</p>
                                    <h3 className="text-3xl font-black text-slate-800 dark:text-white font-mono">
                                        {invoiceBatches.reduce((acc, b) => acc + (b.totalBooklets || 4000), 0).toLocaleString()}
                                    </h3>
                                </div>
                                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-inner">
                                    <span className="material-symbols-outlined text-2xl">menu_book</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-md p-6 rounded-[2rem] border border-white/20 dark:border-slate-700/50 shadow-xl shadow-slate-200/20 dark:shadow-none hover:-translate-y-1 transition-all group overflow-hidden relative col-span-1 md:col-span-2">
                            <div className="absolute -right-4 -top-4 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
                            <div className="flex items-start justify-between relative z-10">
                                <div className="space-y-1">
                                    <p className="text-slate-500 dark:text-slate-400 font-black text-sm">أرصدة الدفعات (القيمة المالية)</p>
                                    <div className="flex items-baseline gap-2">
                                        <h3 className="text-3xl font-black text-slate-800 dark:text-white font-mono">
                                            {invoiceBatches.reduce((acc, b) => acc + (b.totalAmount || 0), 0).toLocaleString()}
                                        </h3>
                                        <span className="text-slate-400 text-sm font-black">ريال يمني</span>
                                    </div>
                                </div>
                                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/40 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner">
                                    <span className="material-symbols-outlined text-2xl">payments</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-md p-5 rounded-[2.5rem] shadow-xl border border-white/20 dark:border-slate-700/50 flex flex-col md:flex-row items-center gap-4">
                        <div className="relative flex-1 w-full">
                            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                            <input type="text" placeholder="ابحث باسم الدفعة، النطاق الرقمي، أو الملاحظات..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-900/50 border-none rounded-2xl pr-12 pl-4 py-4 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" />
                        </div>
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="px-6 py-4 text-sm font-black text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-2xl transition-all">إعادة تعيين</button>
                        )}
                    </div>

                    <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/20 dark:border-slate-700/50 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-100/50 dark:bg-slate-900/50">
                                        <th className="px-8 py-6 text-right text-sm font-black text-slate-500 uppercase tracking-wider">الدفعة</th>
                                        <th className="px-6 py-6 text-right text-sm font-black text-slate-500 uppercase tracking-wider">النطاق</th>
                                        <th className="px-6 py-6 text-right text-sm font-black text-slate-500 uppercase tracking-wider">تاريخ الإصدار</th>
                                        {canFinView && <th className="px-6 py-6 text-right text-sm font-black text-slate-500 uppercase tracking-wider">القيمة</th>}
                                        <th className="px-6 py-6 text-right text-sm font-black text-slate-500 uppercase tracking-wider">ملاحظات</th>
                                        <th className="px-8 py-6 text-center text-sm font-black text-slate-500 uppercase tracking-wider">إجراءات</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {filteredBatches.length === 0 ? (
                                        <tr><td colSpan={canFinView ? 6 : 5} className="px-8 py-32 text-center">
                                            <div className="flex flex-col items-center gap-4 opacity-30">
                                                <span className="material-symbols-outlined text-8xl">receipt_long</span>
                                                <p className="text-xl font-black">لا توجد دفعات مطابقة للبحث</p>
                                            </div>
                                        </td></tr>
                                    ) : filteredBatches.map(batch => (
                                        <tr key={batch.id} className="group hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all duration-300">
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-sm border border-blue-100/50 dark:border-slate-700">
                                                        <span className="material-symbols-outlined text-2xl">folder_open</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <button onClick={() => handleSelectBatch(batch)} className="font-black text-slate-800 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-lg text-right">{batch.name}</button>
                                                        {batch.accountNumber && <span className="text-[10px] font-black text-slate-400 font-mono">حساب: {batch.accountNumber}</span>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-6 font-mono">
                                                <div className="flex items-center gap-2">
                                                    <span className="px-3 py-1 bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 rounded-xl font-bold border border-slate-200/50 dark:border-slate-700">{batch.rangeFrom}</span>
                                                    <span className="text-slate-300 font-black">—</span>
                                                    <span className="px-3 py-1 bg-blue-100/50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-xl font-bold border border-blue-200/50 dark:border-blue-800/50">{batch.rangeTo}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-6">
                                                <div className="flex flex-col">
                                                    <span className="text-sm text-slate-700 dark:text-slate-300 font-black">
                                                        {batch.issueDate ? new Date(batch.issueDate).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">تاريخ التجهيز</span>
                                                </div>
                                            </td>
                                            {canFinView && (
                                                <td className="px-6 py-6">
                                                    <div className="inline-flex flex-col bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2 rounded-2xl border border-emerald-100/50 dark:border-emerald-800/50">
                                                        <div className="flex items-baseline gap-1">
                                                            <span className="font-mono font-black text-xl text-emerald-600 dark:text-emerald-400">{batch.totalAmount?.toLocaleString() || 0}</span>
                                                            <span className="text-[10px] text-emerald-500/70 font-black uppercase">ريال</span>
                                                        </div>
                                                    </div>
                                                </td>
                                            )}
                                            <td className="px-6 py-6">
                                                <div className="max-w-[200px] truncate text-sm text-slate-500 font-bold bg-slate-50/50 dark:bg-slate-900/30 px-3 py-2 rounded-xl border border-slate-100/50 dark:border-slate-800" title={batch.notes}>{batch.notes || 'لا توجد ملاحظات'}</div>
                                            </td>
                                            <td className="px-8 py-6 text-center">
                                                <div className="flex items-center justify-center gap-2 opacity-60 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                                                    <button onClick={() => handleSelectBatch(batch)} className="w-10 h-10 flex items-center justify-center text-blue-600 hover:bg-blue-600 hover:text-white dark:text-blue-400 dark:hover:bg-blue-500 dark:hover:text-white rounded-xl transition-all shadow-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700" title="فتح التفاصيل">
                                                        <span className="material-symbols-outlined text-xl">open_in_new</span>
                                                    </button>
                                                    {canEdit && <button onClick={() => handleOpenBatchModal(batch)} className="w-10 h-10 flex items-center justify-center text-amber-600 hover:bg-amber-600 hover:text-white dark:text-amber-400 dark:hover:bg-amber-500 dark:hover:text-white rounded-xl transition-all shadow-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700" title="تعديل">
                                                        <span className="material-symbols-outlined text-xl">edit</span>
                                                    </button>}
                                                    <button onClick={() => { setPrintParams({ rangeFrom: batch.rangeFrom, rangeTo: batch.rangeTo, name: batch.name }); setIsPrintModalOpen(true); }} className="w-10 h-10 flex items-center justify-center text-indigo-600 hover:bg-indigo-600 hover:text-white dark:text-indigo-400 dark:hover:bg-indigo-500 dark:hover:text-white rounded-xl transition-all shadow-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700" title="طباعة">
                                                        <span className="material-symbols-outlined text-xl">print</span>
                                                    </button>
                                                    {canDelete && <button onClick={() => handleDeleteBatch(batch)} className="w-10 h-10 flex items-center justify-center text-red-600 hover:bg-red-600 hover:text-white dark:text-red-400 dark:hover:bg-red-500 dark:hover:text-white rounded-xl transition-all shadow-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700" title="حذف">
                                                        <span className="material-symbols-outlined text-xl">delete</span>
                                                    </button>}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            ) : (
                /* ============ BATCH DETAIL (ITEMS) ============ */
                <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2rem] p-6 text-white relative overflow-hidden group shadow-xl shadow-blue-500/20 hover:shadow-blue-500/40 hover:-translate-y-1 transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><span className="material-symbols-outlined text-8xl">width_normal</span></div>
                            <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                                <div className="space-y-1">
                                    <p className="text-blue-100/90 text-sm font-black uppercase tracking-wider">النطاق الكلي</p>
                                    <div className="flex items-center gap-2">
                                        <p className="text-2xl font-black font-mono">{selectedBatch.rangeFrom}</p>
                                        <span className="opacity-40">→</span>
                                        <p className="text-2xl font-black font-mono">{selectedBatch.rangeTo}</p>
                                    </div>
                                </div>
                                <div className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-black w-fit uppercase">التسلسل الرقمي</div>
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[2rem] p-6 text-white relative overflow-hidden group shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-1 transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><span className="material-symbols-outlined text-8xl">list_alt</span></div>
                            <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                                <div className="space-y-1">
                                    <p className="text-indigo-100/90 text-sm font-black uppercase tracking-wider">عدد الفروع المستلمة</p>
                                    <p className="text-4xl font-black">{invoiceBatchItems.length}</p>
                                </div>
                                <div className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-black w-fit uppercase">إجمالي الحركات</div>
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-[2rem] p-6 text-white relative overflow-hidden group shadow-xl shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-1 transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><span className="material-symbols-outlined text-8xl">book</span></div>
                            <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                                <div className="space-y-1">
                                    <p className="text-emerald-100/90 text-sm font-black uppercase tracking-wider">المنصرف / الكلي</p>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-3xl font-black font-mono">{totalBookletsUsed}</p>
                                        <span className="text-emerald-200 text-lg font-black opacity-50">/ {selectedBatch.totalBooklets || 4000}</span>
                                    </div>
                                </div>
                                <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-white h-full transition-all duration-1000" style={{ width: `${Math.min(100, (totalBookletsUsed / (selectedBatch.totalBooklets || 4000)) * 100)}%` }}></div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-rose-500 to-orange-500 rounded-[2rem] p-6 text-white relative overflow-hidden group shadow-xl shadow-rose-500/20 hover:shadow-rose-500/40 hover:-translate-y-1 transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><span className="material-symbols-outlined text-8xl">inventory_2</span></div>
                            <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                                <div className="space-y-1">
                                    <p className="text-rose-100/90 text-sm font-black uppercase tracking-wider">المخزون المتبقي</p>
                                    <p className="text-4xl font-black font-mono">{bookletsRemaining}</p>
                                </div>
                                <div className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-black w-fit uppercase">دفتر متاح للصرف</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/20 dark:border-slate-700/50 overflow-hidden">
                        <div className="px-8 py-6 bg-slate-100/30 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                            <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-blue-600">list</span>
                                سجل صرفيات الفروع
                            </h2>
                            <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl text-sm font-black">
                                {invoiceBatchItems.length} حركة صرف
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                        <th className="px-6 py-5 text-right text-xs font-black text-slate-400 uppercase">الفرع</th>
                                        <th className="px-6 py-5 text-right text-xs font-black text-slate-400 uppercase">النطاق الرقمي</th>
                                        <th className="px-6 py-5 text-right text-xs font-black text-slate-400 uppercase">الدفاتر</th>
                                        <th className="px-6 py-5 text-right text-xs font-black text-slate-400 uppercase">تاريخ الصرف</th>
                                        <th className="px-6 py-5 text-right text-xs font-black text-slate-400 uppercase">البيان الرسمي</th>
                                        <th className="px-8 py-5 text-center text-xs font-black text-slate-400 uppercase">إجراءات</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/50">
                                    {invoiceBatchItems.length === 0 ? (
                                        <tr><td colSpan={6} className="px-6 py-32 text-center">
                                            <div className="flex flex-col items-center gap-4 opacity-20">
                                                <span className="material-symbols-outlined text-8xl">local_shipping</span>
                                                <p className="text-xl font-black">لم يتم صرف أي دفاتر من هذه الدفعة بعد</p>
                                            </div>
                                        </td></tr>
                                    ) : invoiceBatchItems.map(item => (
                                        <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-all duration-300 group">
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-2 h-8 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                                    <span className="px-4 py-2 bg-blue-50/50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-2xl text-xs font-black border border-blue-100/30 dark:border-blue-800/30">{item.branchName}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-2 font-mono text-sm font-black text-slate-700 dark:text-slate-300">
                                                    <span>{item.rangeFrom}</span>
                                                    <span className="opacity-30">→</span>
                                                    <span>{item.rangeTo}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center font-mono font-black text-lg text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all">
                                                    {item.bookletCount}
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-sm font-black text-slate-500">
                                                {item.disbursementDate ? new Date(item.disbursementDate).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' }) : '—'}
                                            </td>
                                            <td className="px-6 py-5 text-xs text-slate-400 font-bold max-w-[250px] truncate leading-relaxed group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" title={item.disbursementDescription || `لكم صرف فواتير من ${item.rangeFrom} الى ${item.rangeTo} بتاريخ ${item.disbursementDate ? item.disbursementDate.replace(/-/g, '/') : ''}`}>
                                                {item.disbursementDescription || `لكم صرف فواتير من ${item.rangeFrom} الى ${item.rangeTo} بتاريخ ${item.disbursementDate ? item.disbursementDate.replace(/-/g, '/') : ''}`}
                                            </td>
                                            <td className="px-8 py-5 text-center">
                                                <div className="flex items-center justify-center gap-2 md:opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100">
                                                    <button onClick={() => { setPrintParams({ rangeFrom: item.rangeFrom, rangeTo: item.rangeTo, name: `المنصرف لفرع ${item.branchName} - ${selectedBatch?.name || ''}` }); setIsPrintModalOpen(true); }} className="p-2 text-indigo-600 hover:bg-indigo-600 hover:text-white dark:text-indigo-400 dark:hover:bg-indigo-500 dark:hover:text-white rounded-xl border border-indigo-100 dark:border-indigo-900 transition-all shadow-sm" title="طباعة النطاق المخصص للفرع">
                                                        <span className="material-symbols-outlined text-lg">print</span>
                                                    </button>
                                                    {canEditItem && <button onClick={() => handleOpenItemModal(item)} className="p-2 text-blue-600 hover:bg-blue-600 hover:text-white dark:text-blue-400 dark:hover:bg-blue-500 dark:hover:text-white rounded-xl border border-blue-100 dark:border-blue-900 transition-all shadow-sm">
                                                        <span className="material-symbols-outlined text-lg">edit</span>
                                                    </button>}
                                                    {canDeleteItem && <button onClick={() => handleDeleteItem(item)} className="p-2 text-red-600 hover:bg-red-600 hover:text-white dark:text-red-400 dark:hover:bg-red-500 dark:hover:text-white rounded-xl border border-red-100 dark:border-red-900 transition-all shadow-sm">
                                                        <span className="material-symbols-outlined text-lg">delete</span>
                                                    </button>}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                {invoiceBatchItems.length > 0 && (
                                    <tfoot>
                                        <tr className="bg-slate-100/30 dark:bg-slate-900/50 font-black">
                                            <td colSpan={2} className="px-8 py-6 text-slate-500">إجمالي الدفاتر المنصرفة</td>
                                            <td className="px-6 py-6 font-mono text-3xl text-blue-600 dark:text-blue-400">{totalBookletsUsed}</td>
                                            <td colSpan={3}></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* ============ BATCH MODAL ============ */}
            {isBatchModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-slide-up max-h-[90vh] overflow-y-auto">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                                <span className="material-symbols-outlined text-blue-600">receipt_long</span>
                                {editingBatchId ? 'تعديل دفعة' : 'إنشاء دفعة جديدة'}
                            </h3>
                            <button onClick={() => setIsBatchModalOpen(false)} className="text-slate-400 hover:text-red-500"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <form onSubmit={handleSaveBatch} className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-black text-slate-500 mr-2">اسم الدفعة *</label>
                                <input type="text" value={batchForm.name} onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="مثال: دفعة 100,000 فاتورة" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-black text-slate-500 mr-2">من رقم *</label>
                                    <input type="number" step="1" value={batchForm.rangeFrom || ''} onChange={(e) => setBatchForm({ ...batchForm, rangeFrom: parseInt(e.target.value) || 0 })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-mono font-black text-blue-600 text-xl outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-black text-slate-500 mr-2">إلى رقم *</label>
                                    <input type="number" step="1" value={batchForm.rangeTo || ''} onChange={(e) => setBatchForm({ ...batchForm, rangeTo: parseInt(e.target.value) || 0 })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-mono font-black text-blue-600 text-xl outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-black text-slate-500 mr-2">عدد الدفاتر الكلي</label>
                                    <input type="number" step="1" value={batchForm.totalBooklets || ''} onChange={(e) => setBatchForm({ ...batchForm, totalBooklets: parseInt(e.target.value) || 0 })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="4000" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-black text-slate-500 mr-2">تاريخ الإصدار</label>
                                    <input type="date" value={batchForm.issueDate} onChange={(e) => setBatchForm({ ...batchForm, issueDate: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-black text-slate-500 mr-2">رقم حساب المخزون/الدفعة (محاسبياً)</label>
                                <input type="text" value={batchForm.accountNumber || ''} onChange={(e) => setBatchForm({ ...batchForm, accountNumber: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="مثال: 12101" />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-500 mr-2">مبلغ الطباعة</label>
                                    <input type="number" step="any" value={batchForm.totalAmountPrint || ''} onChange={(e) => setBatchForm({ ...batchForm, totalAmountPrint: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-3 px-4 font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-500 mr-2">أجور التختيم</label>
                                    <input type="number" step="any" value={batchForm.totalAmountStamp || ''} onChange={(e) => setBatchForm({ ...batchForm, totalAmountStamp: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-3 px-4 font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-500 mr-2">أجور النقل</label>
                                    <input type="number" step="any" value={batchForm.totalAmountTransport || ''} onChange={(e) => setBatchForm({ ...batchForm, totalAmountTransport: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-3 px-4 font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                                </div>
                            </div>
                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 flex items-center justify-between">
                                <span className="font-black text-blue-700 dark:text-blue-300">المبلغ الإجمالي (محسوب)</span>
                                <span className="font-mono font-black text-2xl text-blue-600 dark:text-blue-400">{computedTotal?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-black text-slate-500 mr-2">ملاحظات</label>
                                <textarea value={batchForm.notes} onChange={(e) => setBatchForm({ ...batchForm, notes: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-bold outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]" placeholder="أي ملاحظات..." />
                            </div>
                            <div className="pt-4 flex gap-4">
                                <button type="submit" disabled={savingBatch} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black shadow-lg disabled:opacity-50">{savingBatch ? 'جاري الحفظ...' : 'حفظ الدفعة'}</button>
                                <button type="button" onClick={() => setIsBatchModalOpen(false)} className="px-8 py-4 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl font-black">إلغاء</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ============ ITEM MODAL (no entry fields, read-only exchange rates) ============ */}
            {isItemModalOpen && selectedBatch && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-slide-up max-h-[90vh] overflow-y-auto">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                                <span className="material-symbols-outlined text-emerald-600">add_business</span>
                                {editingItemId ? 'تعديل صرف' : 'إضافة صرف جديد'}
                            </h3>
                            <button onClick={() => setIsItemModalOpen(false)} className="text-slate-400 hover:text-red-500"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <form onSubmit={handleSaveItem} className="p-8 space-y-5">
                            {/* Branch */}
                            <div className="space-y-2">
                                <label className="text-sm font-black text-slate-500 mr-2">الفرع *</label>
                                <select value={itemForm.branchId} onChange={(e) => handleBranchChange(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">اختر الفرع</option>
                                    {activeBranches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.currencyType === 'new_rial' ? 'جديد' : 'قديم'})</option>)}
                                </select>
                            </div>
                            {/* Range */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-black text-slate-500 mr-2">من رقم *</label>
                                    <input type="number" step="1" value={itemForm.rangeFrom || ''} onChange={(e) => setItemForm({ ...itemForm, rangeFrom: parseInt(e.target.value) || 0 })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-mono font-black text-emerald-600 text-xl outline-none focus:ring-2 focus:ring-emerald-500" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-black text-slate-500 mr-2">إلى رقم *</label>
                                    <input type="number" step="1" value={itemForm.rangeTo || ''} onChange={(e) => setItemForm({ ...itemForm, rangeTo: parseInt(e.target.value) || 0 })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-mono font-black text-emerald-600 text-xl outline-none focus:ring-2 focus:ring-emerald-500" />
                                </div>
                            </div>
                            {/* Computed */}
                            {itemForm.rangeFrom > 0 && itemForm.rangeTo > 0 && (
                                <div className={`rounded-2xl p-4 space-y-2 ${isValidBookletCount && !wouldExceedLimit
                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                                    <div className="flex items-center justify-between">
                                        <span className="font-black text-sm">عدد الدفاتر</span>
                                        <span className={`font-mono font-black text-xl ${isValidBookletCount ? (wouldExceedLimit ? 'text-red-600' : 'text-emerald-600') : 'text-red-600'}`}>
                                            {isValidBookletCount ? itemBookletCount : 'غير صحيح'}
                                        </span>
                                    </div>
                                    {wouldExceedLimit && (
                                        <p className="text-red-600 text-sm font-black">⚠ يتجاوز الحد الأقصى! المتبقي: {bookletsRemaining} دفتر</p>
                                    )}
                                    {isValidBookletCount && !wouldExceedLimit && (
                                        <>
                                            <div className="flex items-center justify-between pt-2 border-t border-emerald-200 dark:border-emerald-700">
                                                <span className="text-sm font-bold text-slate-500">المبلغ (قديم)</span>
                                                <span className="font-mono font-black text-lg text-blue-600">{itemAmountOld.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                            {isNewRialBranch && itemAmountNew != null && (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-bold text-slate-500">المبلغ (جديد)</span>
                                                    <span className="font-mono font-black text-lg text-emerald-600">{itemAmountNew?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                            {/* Exchange rates — read-only */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-500 mr-2">سعر صرف (قديم) — من الإعدادات</label>
                                    <input type="number" step="any" value={exRateOld} readOnly
                                        className="w-full bg-slate-100 dark:bg-slate-900/50 border-none rounded-2xl py-3 px-4 font-mono text-sm font-bold cursor-not-allowed text-slate-500" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-500 mr-2">سعر صرف (جديد) — من الإعدادات</label>
                                    <input type="number" step="any" value={exRateNew} readOnly
                                        className="w-full bg-slate-100 dark:bg-slate-900/50 border-none rounded-2xl py-3 px-4 font-mono text-sm font-bold cursor-not-allowed text-slate-500" />
                                </div>
                            </div>
                            {/* Date */}
                            <div className="space-y-2">
                                <label className="text-sm font-black text-slate-500 mr-2">تاريخ الصرف</label>
                                <input type="date" value={itemForm.disbursementDate} onChange={(e) => setItemForm({ ...itemForm, disbursementDate: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            {/* Auto description — read-only */}
                            {autoDescription && (
                                <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-4">
                                    <label className="text-xs font-black text-slate-400 block mb-2">البيان (تلقائي — لا يمكن تعديله)</label>
                                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300 leading-relaxed">{autoDescription}</p>
                                </div>
                            )}
                            <div className="pt-4 flex gap-4">
                                <button type="submit" disabled={savingItem} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black shadow-lg disabled:opacity-50">{savingItem ? 'جاري الحفظ...' : 'حفظ الصرف'}</button>
                                <button type="button" onClick={() => setIsItemModalOpen(false)} className="px-8 py-4 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl font-black">إلغاء</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isPrintModalOpen && printParams && (
                <InvoiceBookletPrintModal
                    isOpen={isPrintModalOpen}
                    onClose={() => setIsPrintModalOpen(false)}
                    startNumber={printParams.rangeFrom}
                    endNumber={printParams.rangeTo}
                    batchName={printParams.name}
                />
            )}
        </div>
    );
};

export default InvoiceBatchesPage;
