import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext, InvoiceBatchItem, InvoiceBatch } from '../AppContext';
import * as XLSX from 'xlsx';

const BatchEntriesPage: React.FC = () => {
    const { batchId } = useParams<{ batchId: string }>();
    const navigate = useNavigate();
    const { currentUser, branches, invoiceBatches, invoiceBatchItems, loadBatchItems, updateInvoiceBatchItem, addLog } = useAppContext();

    const isSuperAdmin = currentUser?.role === 'super_admin';
    const canFinView = isSuperAdmin || currentUser?.permissions?.includes('financial_details_view');
    const canManageEntries = isSuperAdmin || currentUser?.permissions?.includes('financial_details_manage');

    const [entryEdits, setEntryEdits] = useState<Record<string, { entryNumber: string; contraEntryNumber: string; exchangeRateDescription: string }>>({});
    const [saving, setSaving] = useState<string | null>(null);

    const batch = invoiceBatches.find(b => b.id === batchId) || null;

    useEffect(() => {
        if (batchId) loadBatchItems(batchId);
    }, [batchId, loadBatchItems]);

    // Initialize edits from items
    useEffect(() => {
        const edits: Record<string, { entryNumber: string; contraEntryNumber: string; exchangeRateDescription: string }> = {};
        invoiceBatchItems.forEach(item => {
            edits[item.id] = { 
                entryNumber: item.entryNumber || '', 
                contraEntryNumber: item.contraEntryNumber || '',
                exchangeRateDescription: item.exchangeRateDescription || ''
            };
        });
        setEntryEdits(edits);
    }, [invoiceBatchItems]);

    const handleSaveEntry = async (item: InvoiceBatchItem) => {
        const edits = entryEdits[item.id];
        if (!edits) return;
        setSaving(item.id);
        try {
            await updateInvoiceBatchItem(item.id, {
                entryNumber: edits.entryNumber,
                contraEntryNumber: edits.contraEntryNumber,
                exchangeRateDescription: edits.exchangeRateDescription,
                isPosted: !!(edits.entryNumber && edits.entryNumber.trim()),
            });
            alert('تم حفظ القيد بنجاح ✓');
        } catch (err) {
            console.error(err);
            alert('حدث خطأ أثناء حفظ القيد');
        }
        setSaving(null);
    };

    // Export Logic
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportBranchId, setExportBranchId] = useState('');
    const [inventoryAccount, setInventoryAccount] = useState('111104');
    const [exchangeDiffAccount, setExchangeDiffAccount] = useState('212102001');
    const [supplierAccount, setSupplierAccount] = useState('211001'); // Default Supplier/Sanaa Account

    const availableBranchesToExport = useMemo(() => {
        const ids = Array.from(new Set(invoiceBatchItems.map(i => i.branchId)));
        return branches.filter(b => ids.includes(b.id));
    }, [invoiceBatchItems, branches]);

    useEffect(() => {
        if (availableBranchesToExport.length > 0 && !exportBranchId) {
            setExportBranchId(availableBranchesToExport[0].id);
        }
    }, [availableBranchesToExport, exportBranchId]);

    const handleExportBranchEntries = async () => {
        const branch = branches.find(b => b.id === exportBranchId);
        const items = invoiceBatchItems.filter(i => i.branchId === exportBranchId);
        if (!branch || items.length === 0) return;

        // Find Sanaa Branch for disbursement credit
        const sanaaBranch = branches.find(b => b.name.includes('صنعاء'));
        
        // Use batch account number if available, otherwise fallback to inventoryAccount
        const mainInventoryAccount = batch?.accountNumber || inventoryAccount;

        let rows: any[][] = [];
        const headers = ['رقم القيد', 'رقم الحساب', 'رقم الحساب التحليلي', 'مدين', 'دائن', 'رقم العملة', 'البيان', 'مركز التكلفة', 'رقم المرجع'];
        
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        let customEntryIndex = 0;

        items.forEach(item => {
            // First Entry: Disbursement (قيد صرف الفواتير)
            const entryId1 = letters[customEntryIndex % 26] || 'a';
            customEntryIndex++;

            // Row 1: Debit (مدين) - Target Branch Debt
            rows.push([
                entryId1,
                branch.creditAccountNumber || branch.branchNumber || '', // Debit account
                branch.creditSubAccountNumber || '', // Sub account
                item.amountOld, 
                '', 
                7, // Old Riyal mapped id = 7
                item.disbursementDescription || `صرف فواتير للفرع من ${item.rangeFrom} الى ${item.rangeTo}`,
                branch.creditCostCenterId || branch.creditCostCenter || '', // Cost Center
                item.entryNumber || ''
            ]);

            // Row 2: Credit (دائن) - Sanaa Branch / Main Inventory
            rows.push([
                entryId1,
                sanaaBranch?.creditAccountNumber || mainInventoryAccount, // Credit account (using batch account or fallback)
                sanaaBranch?.creditSubAccountNumber || '', // Sub account
                '', 
                item.amountOld, 
                7, 
                item.disbursementDescription || `صرف فواتير للفرع من ${item.rangeFrom} الى ${item.rangeTo}`,
                sanaaBranch?.creditCostCenterId || sanaaBranch?.creditCostCenter || '', // Cost Center
                item.entryNumber || ''
            ]);

            // Second Entry: Exchange Rate (قيد سعر الفواتير)
            if (item.exchangeRateDescription || branch.currencyType === 'new_rial') {
                const entryId2 = letters[customEntryIndex % 26] || 'b';
                customEntryIndex++;
                const amount = (branch.currencyType === 'new_rial' && item.amountNew) ? item.amountNew : item.amountOld;
                const currId = branch.currencyType === 'new_rial' ? 11 : 7; // 11=new_rial, 7=old_rial

                // Row 1: Debit (مدين) - Target Branch
                rows.push([
                    entryId2,
                    branch.creditAccountNumber || branch.branchNumber || '', // Debit account
                    branch.creditSubAccountNumber || '',
                    amount,
                    '',
                    currId,
                    item.exchangeRateDescription || `قيد سعر فواتير للفرع من ${item.rangeFrom} الى ${item.rangeTo}`,
                    branch.creditCostCenterId || branch.creditCostCenter || '',
                    item.contraEntryNumber || ''
                ]);

                // Row 2: Credit (دائن) - Exchange Diff Account
                rows.push([
                    entryId2,
                    exchangeDiffAccount, // Credit account
                    '',
                    '',
                    amount,
                    currId,
                    item.exchangeRateDescription || `قيد سعر فواتير للفرع من ${item.rangeFrom} الى ${item.rangeTo}`,
                    '',
                    item.contraEntryNumber || ''
                ]);
            }
        });

        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Styling widths
        ws['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 50 }, { wch: 20 }, { wch: 12 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'القيود');

        const fileName = `قيود_دفاتر_${branch.name}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);

        addLog('تصدير قيود الدفاتر', `تصدير قيود الفرع ${branch.name} بعدد ${items.length} عملية`, 'general');
        setShowExportModal(false);
    };

    const handleExportAllBranchesEntries = async () => {
        if (!batch || invoiceBatchItems.length === 0) return;

        let rows: any[][] = [];
        const headers = ['رقم القيد', 'رقم الحساب', 'رقم الحساب التحليلي', 'مدين', 'دائن', 'رقم العملة', 'البيان', 'مركز التكلفة', 'رقم المرجع'];
        
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        let customEntryIndex = 0;

        // Group by branch to iterate
        const branchIds = Array.from(new Set(invoiceBatchItems.map(i => i.branchId)));
        
        branchIds.forEach(bId => {
            const branch = branches.find(b => b.id === bId);
            const items = invoiceBatchItems.filter(i => i.branchId === bId);
            if (!branch) return;

            const sanaaBranch = branches.find(b => b.name.includes('صنعاء'));
            const mainInventoryAccount = batch.accountNumber || inventoryAccount;

            items.forEach(item => {
                // Disbursement Entry
                const entryId1 = letters[customEntryIndex % 26] || 'a';
                customEntryIndex++;

                // Debit Table Branch
                rows.push([
                    entryId1,
                    branch.creditAccountNumber || branch.branchNumber || '',
                    branch.creditSubAccountNumber || '',
                    item.amountOld, 
                    '', 
                    7, 
                    item.disbursementDescription || `صرف فواتير للمفرع ${branch.name} من ${item.rangeFrom} الى ${item.rangeTo}`,
                    branch.creditCostCenterId || branch.creditCostCenter || '', 
                    item.entryNumber || ''
                ]);

                // Credit Inventory/Sanaa
                rows.push([
                    entryId1,
                    sanaaBranch?.creditAccountNumber || mainInventoryAccount, 
                    sanaaBranch?.creditSubAccountNumber || '', 
                    '', 
                    item.amountOld, 
                    7, 
                    item.disbursementDescription || `صرف فواتير للمفرع ${branch.name} من ${item.rangeFrom} الى ${item.rangeTo}`,
                    sanaaBranch?.creditCostCenterId || sanaaBranch?.creditCostCenter || '', 
                    item.entryNumber || ''
                ]);

                // Exchange Entry
                if (item.exchangeRateDescription || branch.currencyType === 'new_rial') {
                    const entryId2 = letters[customEntryIndex % 26] || 'b';
                    customEntryIndex++;
                    const amount = (branch.currencyType === 'new_rial' && item.amountNew) ? item.amountNew : item.amountOld;
                    const currId = branch.currencyType === 'new_rial' ? 11 : 7;

                    rows.push([
                        entryId2,
                        branch.creditAccountNumber || branch.branchNumber || '',
                        branch.creditSubAccountNumber || '',
                        amount,
                        '',
                        currId,
                        item.exchangeRateDescription || `قيد سعر فواتير لفرع ${branch.name} من ${item.rangeFrom} الى ${item.rangeTo}`,
                        branch.creditCostCenterId || branch.creditCostCenter || '',
                        item.contraEntryNumber || ''
                    ]);

                    rows.push([
                        entryId2,
                        exchangeDiffAccount, 
                        '',
                        '',
                        amount,
                        currId,
                        item.exchangeRateDescription || `قيد سعر فواتير لفرع ${branch.name} من ${item.rangeFrom} الى ${item.rangeTo}`,
                        '',
                        item.contraEntryNumber || ''
                    ]);
                }
            });
        });

        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 50 }, { wch: 20 }, { wch: 12 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'القيود المجمعة');

        const fileName = `قيود_صرف_مجمعة_${batch.name}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);

        addLog('تصدير قيود مجمعة', `تصدير قيود الصرف لكافة الفروع في الدفعة ${batch.name}`, 'general');
        setShowExportModal(false);
    };

    const handleExportBatchReceiptEntry = async () => {
        if (!batch) return;

        // Inventory Receipt Entry (قيد التوريد المخزني)
        // Total Cost = Print + Stamp + Transport
        const totalCost = (batch.totalAmountPrint || 0) + (batch.totalAmountStamp || 0) + (batch.totalAmountTransport || 0);
        
        const headers = ['رقم القيد', 'رقم الحساب', 'رقم الحساب التحليلي', 'مدين', 'دائن', 'رقم العملة', 'البيان', 'مركز التكلفة', 'رقم المرجع'];
        let rows: any[][] = [];

        // Row 1: Debit (مدين) - Main Inventory
        rows.push([
            '1',
            batch.accountNumber || inventoryAccount, // Debit account
            '', 
            totalCost, 
            '', 
            7, // Old Riyal
            `قيد توريد مخزني للدفعة: ${batch.name}`,
            '', 
            ''
        ]);

        // Row 2: Credit (دائن) - Supplier / Sanaa
        rows.push([
            '1',
            supplierAccount, // Credit account
            '', 
            '', 
            totalCost, 
            7, 
            `قيد توريد مخزني للدفعة: ${batch.name}`,
            '', 
            ''
        ]);

        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 50 }, { wch: 20 }, { wch: 12 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'قيد التوريد');

        const fileName = `قيد_توريد_${batch.name}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);

        addLog('تصدير قيد التوريد', `تصدير قيد التوريد المخزني للدفعة ${batch.name}`, 'general');
    };

    if (!canFinView) {
        return (
            <div className="p-8 text-center">
                <span className="material-symbols-outlined text-6xl text-red-300">lock</span>
                <p className="text-xl font-black text-red-500 mt-4">ليس لديك صلاحية لعرض القيود</p>
            </div>
        );
    }

    const totalOld = invoiceBatchItems.reduce((s, i) => s + (i.amountOld || 0), 0);
    const totalNew = invoiceBatchItems.reduce((s, i) => s + (i.amountNew || 0), 0);

    return (
        <div className="p-4 md:p-8 space-y-6 animate-fade-in" dir="rtl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black bg-gradient-to-l from-purple-600 to-pink-600 bg-clip-text text-transparent drop-shadow-sm flex items-center gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-xl flex items-center justify-center text-purple-600 dark:text-purple-400">
                            <span className="material-symbols-outlined text-3xl">receipt</span>
                        </div>
                        القيود: {batch?.name || '...'}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-bold">
                        تعديل أرقام و بيانات القيود وتصدير الإكسل
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {canManageEntries && (
                        <button onClick={() => setShowExportModal(true)}
                            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-2xl font-black transition-all flex items-center gap-2 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:-translate-y-0.5">
                            <span className="material-symbols-outlined font-bold">account_balance_wallet</span>
                            نافذة تصدير القيود
                        </button>
                    )}
                    <button onClick={() => navigate('/invoice-batches')}
                        className="px-6 py-3 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-2xl font-black hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm hover:shadow-md flex items-center gap-2">
                        <span className="material-symbols-outlined">arrow_back</span>
                        العودة
                    </button>
                </div>
            </div>

            {/* Premium Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[2rem] p-6 text-white relative overflow-hidden shadow-lg shadow-indigo-500/20">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><span className="material-symbols-outlined text-6xl">inventory_2</span></div>
                    <p className="text-indigo-100/70 text-sm font-bold">المخزون المتأثر</p>
                    <p className="text-2xl font-black mt-1 font-mono">{batch?.accountNumber || inventoryAccount}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500 to-cyan-600 rounded-[2rem] p-6 text-white relative overflow-hidden shadow-lg shadow-blue-500/20">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><span className="material-symbols-outlined text-6xl">payments</span></div>
                    <p className="text-blue-100/70 text-sm font-bold">إجمالي المبلغ (قديم)</p>
                    <p className="text-3xl font-black mt-1 font-mono">{totalOld.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-[2rem] p-6 text-white relative overflow-hidden shadow-lg shadow-emerald-500/20">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><span className="material-symbols-outlined text-6xl">currency_exchange</span></div>
                    <p className="text-emerald-100/70 text-sm font-bold">إجمالي المبلغ (جديد)</p>
                    <p className="text-3xl font-black mt-1 font-mono">{totalNew ? totalNew.toLocaleString() : '—'}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-[2rem] p-6 text-white relative overflow-hidden shadow-lg shadow-amber-500/20">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><span className="material-symbols-outlined text-6xl">menu_book</span></div>
                    <p className="text-amber-100/70 text-sm font-bold">إجمالي الدفاتر</p>
                    <p className="text-3xl font-black mt-1 font-mono">{invoiceBatchItems.reduce((s, i) => s + (i.bookletCount || 0), 0)}</p>
                </div>
            </div>

            {/* Export Modal */}
            {showExportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200" dir="rtl">
                    <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-700/50 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                                <div className="p-2.5 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-2xl">
                                    <span className="material-symbols-outlined font-bold">publish</span>
                                </div>
                                تصدير قيود الفرع
                            </h2>
                            <button onClick={() => setShowExportModal(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">اختر الفرع لتصدير قيوده</label>
                                <select 
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 px-5 text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                                    value={exportBranchId}
                                    onChange={(e) => setExportBranchId(e.target.value)}
                                >
                                    {availableBranchesToExport.map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">حساب رصيد دفاتر الفواتير <span className="text-slate-400 font-normal">(الدائن في قيد التوريد)</span></label>
                                <input type="text" value={inventoryAccount} onChange={e => setInventoryAccount(e.target.value)}
                                    className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 px-5 text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all" />
                            </div>

                             <div>
                                <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">حساب المورد / فرع التوريد <span className="text-slate-400 font-normal">(الدائن في كلاً من قيد التوريد)</span></label>
                                <input type="text" value={supplierAccount} onChange={e => setSupplierAccount(e.target.value)}
                                    className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 px-5 text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all" />
                            </div>

                            <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                                <button onClick={handleExportBatchReceiptEntry} className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-black shadow-lg shadow-purple-500/30 transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5">
                                    <span className="material-symbols-outlined font-bold">receipt_long</span> تصدير قيد التوريد المخزني (للكل)
                                </button>
                                <p className="text-[10px] text-center text-slate-400 mt-2 font-bold select-none">يتم إنشاء قيد واحد للدفعة كاملة بقيمة الطباعة والختم والنقل</p>
                            </div>
                        </div>

                        <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-700 flex flex-col gap-4">
                            <h3 className="text-sm font-black text-slate-400 px-2 uppercase tracking-wider">تصدير قيود الصرف للفروع</h3>
                            <div className="flex flex-col gap-3">
                                <button onClick={handleExportBranchEntries} disabled={!exportBranchId} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl font-black shadow-lg shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5">
                                    <span className="material-symbols-outlined">download</span> تصدير قيود الفرع المختار
                                </button>
                                <button onClick={handleExportAllBranchesEntries} className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-black shadow-lg shadow-slate-500/30 transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5">
                                    <span className="material-symbols-outlined">all_inclusive</span> تصدير قيود كـــافة الفروع (ملف واحد)
                                </button>
                                <button onClick={() => setShowExportModal(false)} className="w-full py-4 font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl transition-colors">
                                    إلغاء
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50">
                                <th className="px-4 py-4 text-right text-xs font-black text-slate-500">الفرع</th>
                                <th className="px-4 py-4 text-right text-xs font-black text-slate-500">النطاق</th>
                                <th className="px-4 py-4 text-right text-xs font-black text-slate-500">الدفاتر</th>
                                <th className="px-4 py-4 text-right text-xs font-black text-slate-500">المبلغ (قديم)</th>
                                <th className="px-4 py-4 text-right text-xs font-black text-slate-500">المبلغ (جديد)</th>
                                <th className="px-4 py-4 text-right text-xs font-black text-slate-500">رقم القيد</th>
                                <th className="px-4 py-4 text-right text-xs font-black text-slate-500">القيد المقابل</th>
                                <th className="px-4 py-4 text-right text-xs font-black text-slate-500 min-w-[200px]">بيان قيد سعر الفواتير</th>
                                <th className="px-4 py-4 text-right text-xs font-black text-slate-500">تاريخ الصرف</th>
                                {canManageEntries && <th className="px-4 py-4 text-center text-xs font-black text-slate-500">حفظ</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {invoiceBatchItems.length === 0 ? (
                                <tr><td colSpan={10} className="px-6 py-16 text-center text-slate-400 font-bold">لا توجد صرفيات</td></tr>
                            ) : invoiceBatchItems.map(item => (
                                <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                                    <td className="px-4 py-3">
                                        <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-black">{item.branchName}</span>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-sm font-bold">{item.rangeFrom} – {item.rangeTo}</td>
                                    <td className="px-4 py-3 font-mono font-black">{item.bookletCount}</td>
                                    <td className="px-4 py-3 font-mono font-black text-blue-600">{item.amountOld?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className="px-4 py-3 font-mono font-bold text-emerald-600">{item.amountNew ? item.amountNew.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                                    <td className="px-4 py-3">
                                        {canManageEntries ? (
                                            <input type="text" value={entryEdits[item.id]?.entryNumber || ''}
                                                onChange={(e) => setEntryEdits(prev => ({ ...prev, [item.id]: { ...prev[item.id], entryNumber: e.target.value } }))}
                                                className="w-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-purple-500" />
                                        ) : <span className="font-mono text-sm">{item.entryNumber || '—'}</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        {canManageEntries ? (
                                            <input type="text" value={entryEdits[item.id]?.contraEntryNumber || ''}
                                                onChange={(e) => setEntryEdits(prev => ({ ...prev, [item.id]: { ...prev[item.id], contraEntryNumber: e.target.value } }))}
                                                className="w-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-purple-500" />
                                        ) : <span className="font-mono text-sm">{item.contraEntryNumber || '—'}</span>}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500">
                                        {canManageEntries ? (
                                            <textarea 
                                                value={entryEdits[item.id]?.exchangeRateDescription || ''}
                                                onChange={(e) => setEntryEdits(prev => ({ ...prev, [item.id]: { ...prev[item.id], exchangeRateDescription: e.target.value } }))}
                                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-purple-500 resize-none min-h-[50px]"
                                                placeholder="بيان قيد سعر الصرف..."
                                            />
                                        ) : (
                                            <div title={item.exchangeRateDescription || ''} className="max-w-[200px] whitespace-normal break-words leading-relaxed text-sm font-bold">
                                                {item.exchangeRateDescription || <span className="text-slate-400 italic">لا يوجد بيان</span>}
                                            </div>
                                        )}
                                        {/* Reference purely for UI Context below the text box */}
                                        <div className="mt-2 flex flex-col text-[10px] text-blue-500 dark:text-blue-400 opacity-80 border-t border-slate-200 dark:border-slate-700 pt-1">
                                            <span className="font-bold">بيان الصرف الأساسي:</span>
                                            <span className="truncate" title={item.disbursementDescription}>{item.disbursementDescription}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm font-bold text-slate-500">{item.disbursementDate ? new Date(item.disbursementDate).toLocaleDateString('ar-SA') : '—'}</td>
                                    {canManageEntries && (
                                        <td className="px-4 py-3 text-center">
                                            <button onClick={() => handleSaveEntry(item)} disabled={saving === item.id}
                                                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs transition-all disabled:opacity-50">
                                                {saving === item.id ? '...' : 'حفظ'}
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                        {invoiceBatchItems.length > 0 && (
                            <tfoot>
                                <tr className="bg-purple-50/30 dark:bg-purple-900/10 font-black">
                                    <td className="px-4 py-4 text-purple-700 dark:text-purple-300">الإجمالي</td>
                                    <td></td>
                                    <td className="px-4 py-4 font-mono">{invoiceBatchItems.reduce((s, i) => s + (i.bookletCount || 0), 0)}</td>
                                    <td className="px-4 py-4 font-mono text-blue-700">{totalOld.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                                    <td className="px-4 py-4 font-mono text-emerald-700">{totalNew > 0 ? totalNew.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</td>
                                    <td colSpan={5}></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
};

export default BatchEntriesPage;
