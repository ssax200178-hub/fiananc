import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import { parseNumber } from '../utils';
import { confirmDialog } from '../utils/confirm';


// Declare XLSX globally
declare var XLSX: any;

const VarianceResolutionPage: React.FC = () => {
    const navigate = useNavigate();
    const { currentData, updateCurrentData, currency, currentUser, theme } = useAppContext();

    // Commission rate
    const [commissionRate, setCommissionRate] = useState(currentData.commissionRate || 0);

    // Resolution state: { [itemId]: { captainName, accountingRef, note, resolved } }
    const [resolutions, setResolutions] = useState<Record<string, {
        captainName: string;
        accountingRef: string;
        note: string;
        resolved: boolean;
    }>>(currentData.resolutions || {});

    const updateResolution = (id: string, field: string, value: any) => {
        setResolutions(prev => ({
            ...prev,
            [id]: { ...(prev[id] || { captainName: '', accountingRef: '', note: '', resolved: false }), [field]: value }
        }));
    };

    // Parse variances from the raw data (same logic as AnalysisPage)
    const varianceItems = useMemo(() => {
        if (!currentData.companyRaw && !currentData.restaurantRaw) return [];

        const parseTransactions = (raw: string, prefix: string) => {
            if (!raw) return [];
            return raw.split('\n').map((line, idx) => {
                const cleanLine = line.trim();
                if (!cleanLine || cleanLine.includes('المبلغ') || cleanLine.includes('Amount')) return null;
                let parts: string[] = [];
                let amount = 0, date = '', ref = 'N/A';
                if (cleanLine.includes('\t')) {
                    parts = cleanLine.split('\t');
                    amount = parseNumber(parts[0]);
                    date = parts[1] ? parts[1].trim() : '';
                    ref = parts[2] ? parts[2].trim() : 'N/A';
                } else {
                    if (cleanLine.includes(',')) parts = cleanLine.split(',');
                    else parts = cleanLine.split(/\s+/);
                    parts = parts.map(p => p.trim()).filter(p => p !== '');
                    const amountIndex = parts.findIndex(p => { const val = parseNumber(p); return !isNaN(val) && isFinite(val) && !p.includes('/') && !p.includes('-'); });
                    if (amountIndex !== -1) amount = parseNumber(parts[amountIndex]);
                    const dateIndex = parts.findIndex((p, idx) => idx !== amountIndex && (p.includes('/') || p.includes('-')));
                    if (dateIndex !== -1) date = parts[dateIndex];
                    const refIndex = parts.findIndex((p, idx) => idx !== amountIndex && idx !== dateIndex);
                    if (refIndex !== -1) ref = parts[refIndex];
                }
                return { id: `${prefix}-${idx}`, amount, date, ref: ref.trim(), matched: false };
            }).filter((t): t is any => t !== null && t.amount !== 0);
        };

        const companyTxns = parseTransactions(currentData.companyRaw, 'C');
        const restaurantTxns = parseTransactions(currentData.restaurantRaw, 'R');
        const manualLinksMap = currentData.manualLinks || {};
        const ignoredAutoLinksMap = currentData.ignoredAutoLinks || {};
        const dismissedItems = currentData.dismissedItems || {};

        // Apply matching (simplified from AnalysisPage)
        const isIgnoredPair = (cId: string, rId: string) => ignoredAutoLinksMap[cId] === rId;

        // Manual Links
        Object.entries(manualLinksMap).forEach(([cId, rId]) => {
            const cTxn = companyTxns.find((t: any) => t.id === cId);
            const rTxn = restaurantTxns.find((t: any) => t.id === rId);
            if (cTxn && rTxn) { cTxn.matched = true; rTxn.matched = true; }
        });

        // Perfect Match
        companyTxns.forEach((c: any) => {
            if (c.matched || c.ref.length < 2 || c.ref === 'N/A') return;
            const rIdx = restaurantTxns.findIndex((r: any) => !r.matched && r.ref === c.ref && Math.abs(r.amount - c.amount) < 0.01 && !isIgnoredPair(c.id, r.id));
            if (rIdx > -1) { c.matched = true; restaurantTxns[rIdx].matched = true; }
        });

        // Ref Match with variance
        const linkedVariances: any[] = [];
        companyTxns.forEach((c: any) => {
            if (c.matched || c.ref.length < 2 || c.ref === 'N/A') return;
            const rMatch = restaurantTxns.find((r: any) => !r.matched && r.ref === c.ref && !isIgnoredPair(c.id, r.id));
            if (rMatch) {
                c.matched = true; rMatch.matched = true;
                linkedVariances.push({
                    id: `LV-${c.id}-${rMatch.id}`, type: 'linked_variance',
                    cRef: c.ref, rRef: rMatch.ref, cAmount: c.amount, rAmount: rMatch.amount,
                    variance: c.amount - rMatch.amount, date: c.date || rMatch.date,
                    side: (c.amount - rMatch.amount) > 0 ? 'company' : 'restaurant'
                });
            }
        });

        // Manual link variances
        Object.entries(manualLinksMap).forEach(([cId, rId]) => {
            const cTxn = companyTxns.find((t: any) => t.id === cId);
            const rTxn = restaurantTxns.find((t: any) => t.id === rId);
            if (cTxn && rTxn && Math.abs(cTxn.amount - rTxn.amount) > 0.01) {
                linkedVariances.push({
                    id: `MLV-${cId}-${rId}`, type: 'manual_variance',
                    cRef: cTxn.ref, rRef: rTxn.ref, cAmount: cTxn.amount, rAmount: rTxn.amount,
                    variance: cTxn.amount - rTxn.amount, date: cTxn.date || rTxn.date,
                    side: (cTxn.amount - rTxn.amount) > 0 ? 'company' : 'restaurant'
                });
            }
        });

        // Unmatched entries (non-dismissed)
        const unmatchedItems: any[] = [
            ...companyTxns.filter((t: any) => !t.matched && !dismissedItems[t.id]).map((t: any) => ({
                id: `UC-${t.id}`, type: 'unmatched', side: 'company',
                cRef: t.ref, rRef: '', cAmount: t.amount, rAmount: 0,
                variance: t.amount, date: t.date
            })),
            ...restaurantTxns.filter((t: any) => !t.matched && !dismissedItems[t.id]).map((t: any) => ({
                id: `UR-${t.id}`, type: 'unmatched', side: 'restaurant',
                cRef: '', rRef: t.ref, cAmount: 0, rAmount: t.amount,
                variance: -t.amount, date: t.date
            }))
        ];

        return [...linkedVariances, ...unmatchedItems];
    }, [currentData]);

    // Summary calculations
    const summary = useMemo(() => {
        const forCompany = varianceItems.filter(v => v.variance > 0);
        const forRestaurant = varianceItems.filter(v => v.variance < 0);
        const totalForCompany = forCompany.reduce((a, b) => a + b.variance, 0);
        const totalForRestaurant = forRestaurant.reduce((a, b) => a + Math.abs(b.variance), 0);
        const resolvedCount = Object.values(resolutions).filter(r => r.resolved).length;
        return { forCompany, forRestaurant, totalForCompany, totalForRestaurant, resolvedCount, total: varianceItems.length, netSettlement: totalForCompany - totalForRestaurant };
    }, [varianceItems, resolutions]);

    const handleSave = () => {
        updateCurrentData({ resolutions, commissionRate });
        alert('تم حفظ التسويات بنجاح');
    };

    const handleCloseReconciliation = async () => {
        if (summary.resolvedCount < summary.total) {
            alert('يجب تسوية جميع الفوارق قبل إغلاق المطابقة');
            return;
        }
        const isConfirmed = await confirmDialog('هل أنت متأكد من إغلاق المطابقة؟ سيتم تحويل الحالة إلى "مطابق ✅"', {
            type: 'warning'
        });
        if (isConfirmed) {
            updateCurrentData({ resolutions, commissionRate, status: 'matched' as any });
            navigate('/analysis');
        }
    };

    const calcSettlement = (amount: number, side: string) => {
        const commission = Math.abs(amount) * (commissionRate / 100);
        if (side === 'restaurant') {
            return { captainDeduction: Math.abs(amount), companyCommission: commission, netForRestaurant: Math.abs(amount) - commission };
        } else {
            return { creditToCompany: Math.abs(amount), returnedCommission: commission, netForCompany: Math.abs(amount) - commission };
        }
    };

    const handleExportExcel = () => {
        if (varianceItems.length === 0) {
            alert('لا توجد فوارق لتصديرها');
            return;
        }

        const dataToExport = varianceItems.map(item => {
            const res = resolutions[item.id] || { captainName: '', accountingRef: '', note: '', resolved: false };
            const isForRestaurant = item.variance < 0;
            const settlement = calcSettlement(item.variance, item.side);

            return {
                "الجهة المستفيدة": isForRestaurant ? 'المطعم' : 'الشركة',
                "التاريخ": item.date,
                "مرجع الشركة": item.cRef || '-',
                "مرجع المطعم": item.rRef || '-',
                "مبلغ الشركة": item.cAmount,
                "مبلغ المطعم": item.rAmount,
                "الفارق": item.variance,
                "العمولة": commissionRate > 0 ? (isForRestaurant ? settlement.companyCommission : settlement.returnedCommission).toFixed(2) : 0,
                "الصافي": commissionRate > 0 ? (isForRestaurant ? settlement.netForRestaurant : settlement.netForCompany).toFixed(2) : Math.abs(item.variance),
                "اسم الكابتن": res.captainName,
                "مرجع المحاسبة": res.accountingRef,
                "ملاحظة": res.note,
                "حالة التسوية": res.resolved ? 'نعم' : 'لا',
            };
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        XLSX.utils.book_append_sheet(wb, ws, "تقرير التسويات");
        XLSX.writeFile(wb, `تسويات_${currentData.restaurantName || 'عام'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    return (
        <div className="bg-gradient-to-bl from-slate-50 via-slate-100 to-indigo-50/30 dark:from-[#0a0f1e] dark:via-[#0f172a] dark:to-[#0d1330] min-h-screen text-slate-900 dark:text-[#f1f5f9] transition-colors duration-500">
            <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-10">

                {/* Header */}
                <div className="relative mb-8">
                    <div className="absolute top-0 right-0 w-32 h-1 bg-gradient-to-l from-emerald-500 via-teal-500 to-cyan-500 rounded-full" />
                    <div className="flex flex-wrap justify-between items-start gap-4 pt-4">
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-3 text-sm font-bold">
                                <button onClick={() => navigate('/analysis')} className="flex items-center gap-1.5 text-indigo-500 hover:text-indigo-600 transition-colors group">
                                    <span className="material-symbols-outlined text-sm rotate-180 group-hover:-translate-x-1 transition-transform">arrow_back</span>
                                    العودة للتحليل
                                </button>
                            </div>
                            <h1 className="text-3xl lg:text-4xl font-black text-slate-900 dark:text-white leading-tight">
                                <span className="bg-gradient-to-l from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
                                    تسوية الفروقات
                                </span>
                            </h1>
                            <p className="text-slate-400 text-sm">
                                {currentData.restaurantName || 'مطعم غير مسمى'} — تسوية كل فارق وإغلاق المطابقة
                            </p>
                        </div>

                        {/* Commission Rate & Actions */}
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2 bg-white/80 dark:bg-white/5 backdrop-blur-sm px-4 py-3 rounded-2xl border border-slate-200/50 dark:border-white/10">
                                <span className="material-symbols-outlined text-amber-500">percent</span>
                                <label className="text-xs font-bold text-slate-500">نسبة العمولة:</label>
                                <input
                                    type="number"
                                    value={commissionRate}
                                    onChange={e => setCommissionRate(Number(e.target.value))}
                                    className="w-20 text-center px-2 py-1.5 rounded-xl text-sm font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600"
                                    min={0} max={100} step={0.5}
                                />
                                <span className="text-xs text-slate-400">%</span>
                            </div>
                            <button onClick={handleExportExcel} className="flex items-center gap-2 h-11 px-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all">
                                <span className="material-symbols-outlined text-lg">download</span>
                                تصدير
                            </button>
                            <button onClick={handleSave} className="flex items-center gap-2 h-11 px-6 rounded-full bg-gradient-to-l from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-sm font-bold shadow-lg shadow-emerald-500/25 active:scale-95 transition-all">
                                <span className="material-symbols-outlined text-lg">save</span>
                                حفظ التسويات
                            </button>
                        </div>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/50 dark:border-white/[0.06] p-5 shadow-lg">
                        <p className="text-xs font-bold text-slate-400 mb-1 uppercase">لصالح الشركة</p>
                        <p className="text-2xl font-black text-amber-600">+{summary.totalForCompany.toLocaleString()} <span className="text-sm opacity-60">{currency}</span></p>
                        <p className="text-xs text-slate-400 mt-1">{summary.forCompany.length} فارق</p>
                    </div>
                    <div className="bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/50 dark:border-white/[0.06] p-5 shadow-lg">
                        <p className="text-xs font-bold text-slate-400 mb-1 uppercase">لصالح المطعم</p>
                        <p className="text-2xl font-black text-red-600">-{summary.totalForRestaurant.toLocaleString()} <span className="text-sm opacity-60">{currency}</span></p>
                        <p className="text-xs text-slate-400 mt-1">{summary.forRestaurant.length} فارق</p>
                    </div>
                    <div className="bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/50 dark:border-white/[0.06] p-5 shadow-lg">
                        <p className="text-xs font-bold text-slate-400 mb-1 uppercase">صافي التسوية</p>
                        <p className={`text-2xl font-black ${summary.netSettlement >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {summary.netSettlement.toLocaleString()} <span className="text-sm opacity-60">{currency}</span>
                        </p>
                    </div>
                    <div className="bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/50 dark:border-white/[0.06] p-5 shadow-lg">
                        <p className="text-xs font-bold text-slate-400 mb-1 uppercase">التقدم</p>
                        <p className="text-2xl font-black text-indigo-600">{summary.resolvedCount}<span className="text-sm text-slate-400">/{summary.total}</span></p>
                        <div className="mt-2 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-l from-emerald-500 to-teal-500 rounded-full transition-all duration-500" style={{ width: `${summary.total > 0 ? (summary.resolvedCount / summary.total * 100) : 0}%` }} />
                        </div>
                    </div>
                </div>

                {/* Variance Cards */}
                {varianceItems.length === 0 ? (
                    <div className="bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl rounded-3xl border border-white/50 dark:border-white/[0.06] p-16 flex flex-col items-center justify-center text-slate-400 gap-4">
                        <span className="material-symbols-outlined text-6xl opacity-20">check_circle</span>
                        <p className="text-xl font-bold text-slate-600 dark:text-slate-300">لا توجد فوارق</p>
                        <p className="text-sm opacity-60">جميع القيود متطابقة تماماً</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {varianceItems.map((item) => {
                            const res = resolutions[item.id] || { captainName: '', accountingRef: '', note: '', resolved: false };
                            const settlement = calcSettlement(item.variance, item.side);
                            const isForRestaurant = item.variance < 0;

                            return (
                                <div key={item.id} className={`bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl rounded-2xl border ${res.resolved ? 'border-emerald-300 dark:border-emerald-500/30' : 'border-white/50 dark:border-white/[0.06]'} shadow-lg overflow-hidden transition-all ${res.resolved ? 'opacity-70' : ''}`}>
                                    {/* Card Header */}
                                    <div className={`flex items-center justify-between p-4 border-b ${isForRestaurant ? 'border-red-100 dark:border-red-500/10 bg-red-50/50 dark:bg-red-500/5' : 'border-amber-100 dark:border-amber-500/10 bg-amber-50/50 dark:bg-amber-500/5'}`}>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-sm px-3 py-1 rounded-full font-black ${isForRestaurant ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'}`}>
                                                {isForRestaurant ? 'لصالح المطعم' : 'لصالح الشركة'}
                                            </span>
                                            <span className="text-xs font-mono text-slate-400">{item.date}</span>
                                            {item.cRef && <span className="text-xs font-mono bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-lg">{item.cRef}</span>}
                                            {item.rRef && item.rRef !== item.cRef && <span className="text-xs font-mono bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-lg">{item.rRef}</span>}
                                        </div>
                                        <span className={`text-lg font-black font-mono ${isForRestaurant ? 'text-red-600' : 'text-amber-600'}`}>
                                            {item.variance > 0 ? '+' : ''}{item.variance.toLocaleString()} {currency}
                                        </span>
                                    </div>

                                    {/* Card Body */}
                                    <div className="p-4 space-y-4">
                                        {/* Amount comparison */}
                                        {item.type !== 'unmatched' && (
                                            <div className="flex items-center gap-3 text-sm font-mono bg-slate-50 dark:bg-white/[0.02] p-3 rounded-xl">
                                                <span className="text-slate-400 text-xs">الشركة:</span>
                                                <span className="font-bold text-indigo-600">{item.cAmount.toLocaleString()}</span>
                                                <span className="text-slate-300">−</span>
                                                <span className="text-slate-400 text-xs">المطعم:</span>
                                                <span className="font-bold text-violet-600">{item.rAmount.toLocaleString()}</span>
                                                <span className="text-slate-300">=</span>
                                                <span className={`font-black ${isForRestaurant ? 'text-red-600' : 'text-amber-600'}`}>
                                                    {item.variance.toLocaleString()}
                                                </span>
                                            </div>
                                        )}

                                        {/* Settlement calculation */}
                                        {commissionRate > 0 && (
                                            <div className="bg-emerald-50/50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10 rounded-xl p-3">
                                                <div className="text-xs text-emerald-700 dark:text-emerald-400 font-bold mb-2 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-sm">calculate</span>
                                                    حسابات التسوية ({commissionRate}% عمولة)
                                                </div>
                                                {isForRestaurant ? (
                                                    <div className="flex flex-wrap gap-4 text-xs font-mono">
                                                        <span>خصم الكابتن: <b className="text-red-600">{settlement.captainDeduction?.toLocaleString()}</b></span>
                                                        <span>عمولة الشركة: <b className="text-amber-600">{settlement.companyCommission?.toFixed(2)}</b></span>
                                                        <span>صافي للمطعم: <b className="text-emerald-600">{settlement.netForRestaurant?.toFixed(2)}</b></span>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-wrap gap-4 text-xs font-mono">
                                                        <span>يُقيّد للشركة: <b className="text-amber-600">{settlement.creditToCompany?.toLocaleString()}</b></span>
                                                        <span>عمولة مُعادة: <b className="text-blue-600">{settlement.returnedCommission?.toFixed(2)}</b></span>
                                                        <span>صافي للشركة: <b className="text-emerald-600">{settlement.netForCompany?.toFixed(2)}</b></span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Input fields */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">اسم الكابتن</label>
                                                <input
                                                    value={res.captainName}
                                                    onChange={e => updateResolution(item.id, 'captainName', e.target.value)}
                                                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500/30"
                                                    placeholder="اسم كابتن التوصيل"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">رقم القيد المحاسبي</label>
                                                <input
                                                    value={res.accountingRef}
                                                    onChange={e => updateResolution(item.id, 'accountingRef', e.target.value)}
                                                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500/30 font-mono"
                                                    placeholder="مرجع النظام المحاسبي"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">ملاحظة</label>
                                                <input
                                                    value={res.note}
                                                    onChange={e => updateResolution(item.id, 'note', e.target.value)}
                                                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500/30"
                                                    placeholder="ملاحظة اختيارية"
                                                />
                                            </div>
                                        </div>

                                        {/* Resolve toggle */}
                                        <div className="flex justify-end">
                                            <button
                                                onClick={() => updateResolution(item.id, 'resolved', !res.resolved)}
                                                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all active:scale-95 ${res.resolved
                                                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 border border-slate-200 dark:border-slate-600'
                                                    }`}
                                            >
                                                <span className="material-symbols-outlined text-lg">{res.resolved ? 'check_circle' : 'radio_button_unchecked'}</span>
                                                {res.resolved ? 'تمت التسوية ✅' : 'تأكيد التسوية'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Bottom Close Button */}
                {summary.total > 0 && (
                    <div className="mt-8 flex flex-col items-center gap-4 p-6 bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl rounded-3xl border border-white/50 dark:border-white/[0.06] shadow-xl">
                        <div className="flex flex-wrap gap-8 text-center">
                            <div>
                                <p className="text-xs font-bold text-slate-400 mb-1">لصالح المطعم</p>
                                <p className="text-lg font-black text-red-600">-{summary.totalForRestaurant.toLocaleString()} {currency}</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 mb-1">لصالح الشركة</p>
                                <p className="text-lg font-black text-amber-600">+{summary.totalForCompany.toLocaleString()} {currency}</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 mb-1">صافي التسوية</p>
                                <p className={`text-lg font-black ${summary.netSettlement >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {summary.netSettlement.toLocaleString()} {currency}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 mb-1">المُسوّاة</p>
                                <p className="text-lg font-black text-indigo-600">{summary.resolvedCount} / {summary.total}</p>
                            </div>
                        </div>

                        <button
                            onClick={handleCloseReconciliation}
                            disabled={summary.resolvedCount < summary.total}
                            className="flex items-center gap-3 px-10 py-4 rounded-full text-base font-black bg-gradient-to-l from-emerald-500 to-teal-600 text-white shadow-xl shadow-emerald-500/30 disabled:opacity-30 disabled:grayscale hover:from-emerald-600 hover:to-teal-700 transition-all active:scale-95"
                        >
                            <span className="material-symbols-outlined text-xl">lock</span>
                            {summary.resolvedCount < summary.total ? `متبقي ${summary.total - summary.resolvedCount} فارق - لا يمكن الإغلاق` : '🔒 إغلاق المطابقة نهائياً'}
                        </button>
                    </div>
                )}

                <footer className="mt-16 py-8 text-center">
                    <p className="text-slate-300 dark:text-slate-700 text-xs font-medium">© 2024 نظام المطابقة المالي المتقدم</p>
                </footer>
            </div>
        </div>
    );
};

export default VarianceResolutionPage;
