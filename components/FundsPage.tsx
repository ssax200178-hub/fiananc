import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext, BankDefinition, FundLineItem, FundSnapshot } from '../AppContext';
import { generateId } from '../utils';

const FundsPage: React.FC = () => {
    const { currentUser, bankDefinitions, addBankDefinition, fundSnapshots, saveFundSnapshot } = useAppContext();

    // -- State --
    // We hold the working state for the current session here.
    // In a real app, this should probably be persisted to localStorage to survive refreshes until "Closed".
    const [lineItems, setLineItems] = useState<FundLineItem[]>([]);
    const [isSessionInitialized, setIsSessionInitialized] = useState(false);

    // Admin Modal State
    const [isAddBankModalOpen, setIsAddBankModalOpen] = useState(false);
    const [newBankName, setNewBankName] = useState('');
    const [newBankCurrency, setNewBankCurrency] = useState<'old_riyal' | 'new_riyal'>('old_riyal');

    // Report/Snapshot Modal State
    const [reportSnapshot, setReportSnapshot] = useState<FundSnapshot | null>(null);

    // -- Initialization --
    useEffect(() => {
        // Load draft from local storage or init from definitions
        const savedDraft = localStorage.getItem('funds_draft_v2');

        if (savedDraft) {
            setLineItems(JSON.parse(savedDraft));
        } else {
            // Initialize from active bank definitions
            const initialItems: FundLineItem[] = bankDefinitions
                .filter(def => def.isActive)
                .map(def => ({
                    id: generateId(),
                    bankDefId: def.id,
                    bankName: def.name,
                    sysBalance: 0,
                    bankBalance: 0,
                    variance: 0,
                    notes: '',
                    isCompleted: false
                }));
            setLineItems(initialItems);
        }
        setIsSessionInitialized(true);
    }, []); // Run once on mount

    // Sync active definitions with line items (in case a new bank was added while drafting)
    useEffect(() => {
        if (!isSessionInitialized) return;

        setLineItems(currentItems => {
            const newItems = [...currentItems];

            // Add missing definitions
            bankDefinitions.forEach(def => {
                if (def.isActive && !newItems.find(item => item.bankDefId === def.id)) {
                    newItems.push({
                        id: generateId(),
                        bankDefId: def.id,
                        bankName: def.name,
                        sysBalance: 0,
                        bankBalance: 0,
                        variance: 0,
                        notes: '',
                        isCompleted: false
                    });
                }
            });

            // (Optional) Remove inactive? Better to keep them if they have data entered.
            return newItems;
        });
    }, [bankDefinitions, isSessionInitialized]);


    // Auto-save draft
    useEffect(() => {
        if (isSessionInitialized) {
            localStorage.setItem('funds_draft_v2', JSON.stringify(lineItems));
        }
    }, [lineItems, isSessionInitialized]);


    // -- Handlers --

    const handleUpdateItem = (id: string, field: keyof FundLineItem, value: any) => {
        setLineItems(prev => prev.map(item => {
            if (item.id !== id) return item;
            if (item.isCompleted && field !== 'isCompleted') return item; // Locked

            const updated = { ...item, [field]: value };

            // Auto-calc variance
            if (field === 'sysBalance' || field === 'bankBalance') {
                const sys = field === 'sysBalance' ? Number(value) : item.sysBalance;
                const bank = field === 'bankBalance' ? Number(value) : item.bankBalance;
                updated.variance = sys - bank;
            }
            return updated;
        }));
    };

    const toggleRowCompletion = (id: string) => {
        setLineItems(prev => prev.map(item => {
            if (item.id !== id) return item;

            if (item.isCompleted) {
                // Unlock (Edit)
                return { ...item, isCompleted: false, completedAt: undefined };
            } else {
                // Lock (Complete)
                const timeStr = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                return { ...item, isCompleted: true, completedAt: timeStr };
            }
        }));
    };

    const handleAddBank = () => {
        if (!newBankName.trim()) return;
        addBankDefinition(newBankName, newBankCurrency);
        setNewBankName('');
        setIsAddBankModalOpen(false);
    };

    // Final Approval
    const handleFinalApproval = () => {
        // Validate all rows completed
        const incomplete = lineItems.filter(i => !i.isCompleted);
        if (incomplete.length > 0) {
            alert(`عذراً، يجب إتمام جميع الأسطر أولاً. يوجد ${incomplete.length} حسابات غير مكتملة.`);
            return;
        }

        if (!window.confirm('هل أنت متأكد من اعتماد وإغلاق المطابقة بشكل نهائي؟\n\nتنبيه: لا يمكن التعديل أو الحذف بعد الاعتماد.')) {
            return;
        }

        // Create Snapshot
        const snapshot: FundSnapshot = {
            id: generateId(),
            date: new Date().toLocaleDateString('en-GB'), // DD/MM/YYYY
            fullTimestamp: new Date().toLocaleString('ar-SA'),
            user: currentUser?.name || currentUser?.username || 'Unknown',
            oldRiyalItems: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'old_riyal'),
            newRiyalItems: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'new_riyal'),
            totalVarianceOld: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'old_riyal').reduce((acc, curr) => acc + curr.variance, 0),
            totalVarianceNew: lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'new_riyal').reduce((acc, curr) => acc + curr.variance, 0),
        };

        saveFundSnapshot(snapshot);
        localStorage.removeItem('funds_draft_v2'); // Clear draft
        setLineItems(prev => prev.map(i => ({ ...i, sysBalance: 0, bankBalance: 0, variance: 0, notes: '', isCompleted: false, completedAt: undefined }))); // Reset Form or keep? Usually reset for next day. 
        // Actually, let's keep it clear.

        setReportSnapshot(snapshot); // Show Result
    };


    // Helpers
    const getCurrencyForDef = (defId: string) => {
        const def = bankDefinitions.find(d => d.id === defId);
        return def?.currency || 'old_riyal';
    };

    // Separated Items
    const oldRiyalItems = lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'old_riyal');
    const newRiyalItems = lineItems.filter(i => getCurrencyForDef(i.bankDefId) === 'new_riyal');


    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-32">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-200 dark:border-slate-700 pb-6">
                <div>
                    <h1 className="text-3xl font-black text-[#263238] dark:text-white font-display">مطابقة الصناديق اليومية</h1>
                    <p className="text-[#607D8B] dark:text-slate-400 mt-1">المراجعة اليومية للسيولة النقدية والحسابات البنكية</p>
                </div>
                <div className="text-end">
                    <p className="text-sm font-bold text-[#607D8B] dark:text-slate-500">التاريخ: <span className="text-[#263238] dark:text-white font-mono">{new Date().toLocaleDateString('ar-SA')}</span></p>
                    <p className="text-sm font-bold text-[#607D8B] dark:text-slate-500">الموظف: <span className="text-[#263238] dark:text-white">{currentUser?.name || currentUser?.username}</span></p>
                </div>
            </div>

            {/* Admin Action: Add Bank */}
            {currentUser?.role === 'super_admin' && (
                <div className="flex justify-end">
                    <button
                        onClick={() => setIsAddBankModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-[#4FC3F7] dark:bg-slate-700 text-[#263238] dark:text-white rounded-lg text-xs font-bold hover:bg-[#29B6F6] dark:hover:bg-slate-600 transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm">add_card</span>
                        إضافة حساب بنكي جديد
                    </button>
                </div>
            )}

            {/* TABLE 1: OLD RIYAL */}
            <ReconTable
                title="مطابقة الريال القديم (Old Riyal)"
                items={oldRiyalItems}
                colorClass="green"
                onUpdate={handleUpdateItem}
                onToggleComplete={toggleRowCompletion}
            />

            {/* TABLE 2: NEW RIYAL */}
            <ReconTable
                title="مطابقة الريال الجديد (New Riyal)"
                items={newRiyalItems}
                colorClass="blue"
                onUpdate={handleUpdateItem}
                onToggleComplete={toggleRowCompletion}
            />

            <div className="flex justify-center mt-12 mb-20">
                <button
                    onClick={handleFinalApproval}
                    className="group relative px-8 py-4 bg-[#C62828] hover:bg-[#b71c1c] text-white rounded-2xl shadow-xl shadow-[#C62828]/20 transform hover:-translate-y-1 transition-all duration-200"
                >
                    <div className="flex flex-col items-center">
                        <span className="text-xl font-black flex items-center gap-2">
                            <span className="material-symbols-outlined">verified_user</span>
                            اعتماد وإغلاق المطابقة النهائية
                        </span>
                        <span className="text-xs text-red-100 mt-1 opacity-80 group-hover:opacity-100">سيتم ترحيل البيانات للأرشيف وإصدار الشهادة</span>
                    </div>
                </button>
            </div>

            {/* Archive / History Section (Quick View) */}
            {fundSnapshots.length > 0 && (
                <div className="border-t border-slate-200 dark:border-slate-800 pt-8">
                    <h3 className="font-bold text-slate-500 mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined">history_edu</span>
                        أرشيف المطابقات السابقة
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {fundSnapshots.slice(0, 4).map(snap => (
                            <div
                                key={snap.id}
                                onClick={() => setReportSnapshot(snap)}
                                className="bg-white dark:bg-[#1e293b] p-4 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-[#C62828] transition-colors group"
                            >
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-mono font-bold text-[#263238] dark:text-white">{snap.date}</span>
                                    <span className="material-symbols-outlined text-slate-300 group-hover:text-[#C62828] transition-colors">visibility</span>
                                </div>
                                <p className="text-xs text-[#607D8B] dark:text-slate-400">بواسطة: {snap.user}</p>
                                <div className="mt-2 flex gap-2">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${snap.totalVarianceOld === 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} font-bold`}>
                                        قديم: {snap.totalVarianceOld}
                                    </span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${snap.totalVarianceNew === 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'} font-bold`}>
                                        جديد: {snap.totalVarianceNew}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}


            {/* ADD BANK MODAL */}
            {isAddBankModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <h3 className="text-xl font-bold mb-4 text-slate-800 dark:text-white">إضافة حساب بنكي جديد</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-bold text-slate-500 block mb-1">اسم الحساب (مثال: كُريمي، جوالي)</label>
                                <input
                                    autoFocus
                                    className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent text-slate-900 dark:text-white"
                                    value={newBankName}
                                    onChange={e => setNewBankName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-bold text-slate-500 block mb-1">نوع العملة</label>
                                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                                    <button
                                        onClick={() => setNewBankCurrency('old_riyal')}
                                        className={`flex-1 py-2 rounded-md text-sm font-bold ${newBankCurrency === 'old_riyal' ? 'bg-white shadow text-green-600' : 'text-slate-500'}`}
                                    >ريال قديم</button>
                                    <button
                                        onClick={() => setNewBankCurrency('new_riyal')}
                                        className={`flex-1 py-2 rounded-md text-sm font-bold ${newBankCurrency === 'new_riyal' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                                    >ريال جديد</button>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setIsAddBankModalOpen(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 font-bold">إلغاء</button>
                            <button onClick={handleAddBank} className="px-6 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800">حفظ وإضافة</button>
                        </div>
                    </div>
                </div>
            )}

            {/* REPORT SNAPSHOT MODAL */}
            {reportSnapshot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
                    <div className="bg-white text-slate-900 w-full max-w-3xl rounded-none shadow-2xl overflow-hidden flex flex-col my-8">
                        {/* Print Area */}
                        <div id="snapshot-print-area" className="p-10 bg-white relative">
                            {/* Header */}
                            <div className="border-b-4 border-[#263238] pb-6 mb-8 flex justify-between items-end">
                                <div>
                                    <h1 className="text-3xl font-black uppercase tracking-tight mb-2 text-[#C62828]">توصيل ون</h1>
                                    <p className="text-[#607D8B] font-bold text-sm uppercase tracking-widest">Daily Funds Reconciliation</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-4xl font-black text-[#263238]">#{reportSnapshot.id.slice(-4)}</div>
                                    <div className="font-mono font-bold mt-1 text-[#607D8B]">{reportSnapshot.date}</div>
                                </div>
                            </div>

                            {/* Meta */}
                            <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
                                <div>
                                    <span className="block text-slate-400 uppercase text-[10px] font-bold tracking-wider">الموظف المسؤول</span>
                                    <span className="block font-bold text-lg">{reportSnapshot.user}</span>
                                </div>
                                <div className="text-right">
                                    <span className="block text-slate-400 uppercase text-[10px] font-bold tracking-wider">وقت الإغلاق</span>
                                    <span className="block font-bold font-mono text-lg">{reportSnapshot.fullTimestamp}</span>
                                </div>
                            </div>

                            {/* Tables */}
                            <div className="space-y-8">
                                <SnapshotTable title="ريال قديم (Old Riyal)" items={reportSnapshot.oldRiyalItems} />
                                <SnapshotTable title="ريال جديد (New Riyal)" items={reportSnapshot.newRiyalItems} />
                            </div>

                            {/* Totals Footer */}
                            <div className="mt-12 pt-6 border-t-2 border-dashed border-slate-200 grid grid-cols-2 gap-8">
                                <div className={`p-4 rounded-xl border ${reportSnapshot.totalVarianceOld === 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                                    <span className="block text-xs uppercase font-bold text-slate-500">إجمالي الفارق (قديم)</span>
                                    <span className={`block text-2xl font-black font-mono ${reportSnapshot.totalVarianceOld === 0 ? 'text-green-700' : 'text-red-600'}`}>{reportSnapshot.totalVarianceOld}</span>
                                </div>
                                <div className={`p-4 rounded-xl border ${reportSnapshot.totalVarianceNew === 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                                    <span className="block text-xs uppercase font-bold text-slate-500">إجمالي الفارق (جديد)</span>
                                    <span className={`block text-2xl font-black font-mono ${reportSnapshot.totalVarianceNew === 0 ? 'text-blue-700' : 'text-red-600'}`}>{reportSnapshot.totalVarianceNew}</span>
                                </div>
                            </div>

                            {/* Signature Line */}
                            <div className="mt-16 pt-8 text-center">
                                <p className="text-[10px] text-slate-400 uppercase tracking-widest">Electronic Signature: {reportSnapshot.id}</p>
                                <p className="text-[10px] text-slate-400">وثيقة رسمية - نظام توصيل ون المالي</p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="bg-[#263238] p-6 flex justify-between items-center print:hidden">
                            <button onClick={() => setReportSnapshot(null)} className="text-slate-400 hover:text-white font-bold text-sm">إغلاق</button>
                            <button
                                onClick={() => window.print()}
                                className="px-6 py-3 bg-[#4FC3F7] text-[#263238] rounded-full font-bold flex items-center gap-2 hover:bg-[#29B6F6] transition-colors"
                            >
                                <span className="material-symbols-outlined">download</span>
                                تنزيل الصورة / طباعة
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// -- Sub-Components --

const ReconTable = ({ title, items, colorClass, onUpdate, onToggleComplete }: any) => {
    // Alternating Colors Logic handled in mapping

    return (
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-sm border border-[#CFD8DC] dark:border-slate-700 overflow-hidden mb-8">
            <div className={`px-6 py-4 border-b border-[#CFD8DC] dark:border-slate-700 ${colorClass === 'green' ? 'bg-[#E8F5E9] dark:bg-emerald-900/20' : 'bg-[#E3F2FD] dark:bg-blue-900/20'}`}>
                <h2 className={`text-lg font-bold flex items-center gap-2 ${colorClass === 'green' ? 'text-[#2E7D32] dark:text-emerald-400' : 'text-[#1565C0] dark:text-blue-400'}`}>
                    <span className="material-symbols-outlined">account_balance_wallet</span>
                    {title}
                </h2>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                    <thead>
                        <tr className="bg-[#263238] dark:bg-[#0f172a] text-white font-bold border-b border-[#CFD8DC] dark:border-slate-700">
                            <th className="px-4 py-3 w-[15%]">اسم الحساب</th>
                            <th className="px-4 py-3 w-[15%]">مبلغ النظام</th>
                            <th className="px-4 py-3 w-[15%]">مبلغ البنك</th>
                            <th className="px-4 py-3 w-[10%]">الفارق</th>
                            <th className="px-4 py-3 w-[25%]">ملاحظات</th>
                            <th className="px-4 py-3 w-[10%] text-center">الإجراء</th>
                            <th className="px-4 py-3 w-[10%] text-center">الوقت</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {items.length === 0 && (
                            <tr><td colSpan={7} className="text-center p-8 text-slate-400">لا توجد حسابات مضافة.</td></tr>
                        )}
                        {items.map((item: FundLineItem, idx: number) => (
                            <tr key={item.id} className={`${idx % 2 === 0 ? 'bg-white dark:bg-[#1e293b]' : 'bg-[#F5F5F5] dark:bg-[#1e293b]/50'} hover:bg-[#ECEFF1] dark:hover:bg-slate-700 transition-colors`}>
                                {/* 1. Name */}
                                <td className="px-4 py-2 font-bold text-[#263238] dark:text-slate-200">
                                    {item.bankName}
                                </td>

                                {/* 2. System Amt */}
                                <td className="px-4 py-2">
                                    <input
                                        type="number"
                                        disabled={item.isCompleted}
                                        value={item.sysBalance}
                                        onChange={e => onUpdate(item.id, 'sysBalance', Number(e.target.value))}
                                        className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-green-500 outline-none font-mono font-bold disabled:text-slate-400 disabled:cursor-not-allowed"
                                        placeholder="0"
                                    />
                                </td>

                                {/* 3. Bank Amt */}
                                <td className="px-4 py-2">
                                    <input
                                        type="number"
                                        disabled={item.isCompleted}
                                        value={item.bankBalance}
                                        onChange={e => onUpdate(item.id, 'bankBalance', Number(e.target.value))}
                                        className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-green-500 outline-none font-mono font-bold disabled:text-slate-400 disabled:cursor-not-allowed"
                                        placeholder="0"
                                    />
                                </td>

                                {/* 4. Variance */}
                                <td className="px-4 py-2">
                                    <span className={`font-mono font-bold ${item.variance === 0 ? 'text-green-600' : 'text-red-500'}`}>
                                        {item.variance.toLocaleString()}
                                    </span>
                                </td>

                                {/* 5. Notes */}
                                <td className="px-4 py-2">
                                    <input
                                        type="text"
                                        disabled={item.isCompleted}
                                        value={item.notes}
                                        onChange={e => onUpdate(item.id, 'notes', e.target.value)}
                                        className="w-full bg-transparent text-sm disabled:text-slate-400"
                                        placeholder="..."
                                    />
                                </td>

                                {/* 6/7. Actions */}
                                <td className="px-4 py-2 text-center">
                                    <button
                                        onClick={() => onToggleComplete(item.id)}
                                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${item.isCompleted
                                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                            : 'bg-slate-800 text-white hover:bg-slate-700'
                                            }`}
                                    >
                                        {item.isCompleted ? 'تعديل' : 'إتمام'}
                                    </button>
                                </td>

                                {/* Completed At */}
                                <td className="px-4 py-2 text-center text-xs font-mono text-slate-400">
                                    {item.completedAt || '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-[#112218] font-bold text-sm border-t border-slate-200 dark:border-slate-800">
                        <tr>
                            <td className="px-4 py-3">الإجمالي</td>
                            <td className="px-4 py-3 font-mono">{items.reduce((a: number, b: FundLineItem) => a + Number(b.sysBalance || 0), 0).toLocaleString()}</td>
                            <td className="px-4 py-3 font-mono">{items.reduce((a: number, b: FundLineItem) => a + Number(b.bankBalance || 0), 0).toLocaleString()}</td>
                            <td className="px-4 py-3 font-mono text-slate-500">-</td>
                            <td colSpan={3}></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

// Snapshot Print Helper
const SnapshotTable = ({ title, items }: any) => (
    <div>
        <h4 className="font-bold border-b border-black mb-2 uppercase text-xs tracking-wider">{title}</h4>
        <table className="w-full text-right text-xs">
            <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-1">Account</th>
                    <th className="py-1">Sys</th>
                    <th className="py-1">Bank</th>
                    <th className="py-1">Diff</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-dashed divide-slate-100">
                {items.map((i: any) => (
                    <tr key={i.id}>
                        <td className="py-1 font-bold">{i.bankName}</td>
                        <td className="py-1 font-mono">{i.sysBalance}</td>
                        <td className="py-1 font-mono">{i.bankBalance}</td>
                        <td className={`py-1 font-mono font-bold ${i.variance !== 0 ? 'text-red-500' : ''}`}>{i.variance}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

export default FundsPage;