import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';

// Declare XLSX globally
declare var XLSX: any;

interface Transaction {
    id: string; // Unique ID for keying
    rawLine: string;
    amount: number;
    date: string;
    ref: string;
    matched: boolean;
    // Audit fields
    matchId?: string;       // The unique ID linking two sides
    matchReason?: string;   // Why it matched (Amount, Ref, Manual)
}

type SortField = 'date' | 'amount' | 'ref' | 'matchId';
type SortOrder = 'asc' | 'desc';

// Unified item type for the display table
type DisplayItem =
    | { kind: 'single'; side: 'company' | 'restaurant'; txn: Transaction }
    | { kind: 'linked_variance'; cTxn: Transaction; rTxn: Transaction; variance: number };

const AnalysisPage: React.FC = () => {
    const navigate = useNavigate();
    const { currentData, updateCurrentData, resetCurrentData, currency, theme, updateHistoryItem } = useAppContext();

    // UI States
    const [activeTab, setActiveTab] = useState<'analysis' | 'ledger'>('analysis');
    const [showSettings, setShowSettings] = useState(false);
    const [showLinkManager, setShowLinkManager] = useState(false); // Modal State
    const [expandedRow, setExpandedRow] = useState<string | null>(null); // For Details Expansion
    const [activeLinkRow, setActiveLinkRow] = useState<string | null>(null); // For Manual Link Input toggle

    // Color Settings State
    const [colors, setColors] = useState({
        positive: '#d97706', // amber-600
        negative: '#dc2626', // red-600
        matched: '#10b981'   // emerald-500
    });

    // Matching Settings
    const [matchSettings, setMatchSettings] = useState({
        matchByRef: true,       // Auto-link if Ref matches (even if amount diff)
        strictDate: false,      // If true, amounts only match if Date is identical
    });

    // Filters & Sorting
    const [filterText, setFilterText] = useState('');
    const [unmatchedFilter, setUnmatchedFilter] = useState<'all' | 'unmatched_only' | 'matched_variance'>('all');
    const [ledgerFilter, setLedgerFilter] = useState<'all' | 'Company' | 'Restaurant'>('all');
    const [visibleLimit, setVisibleLimit] = useState(20);

    const [sortField, setSortField] = useState<SortField>('date');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    // --- Helper: Standardize Date ---
    const standardizeDate = (input: string): string => {
        if (!input) return '';
        let clean = input.replace(/['"]/g, '').trim();
        const parts = clean.split(/[\/\-]/);

        if (parts.length === 3) {
            let day = parts[0];
            let month = parts[1];
            let year = parts[2];

            // Heuristic for YYYY at start
            if (parseInt(day) > 1000) {
                [year, month, day] = [parts[0], parts[1], parts[2]];
            } else if (parseInt(year) < 100) {
                year = '20' + year;
            }
            // Attempt to handle MM/DD vs DD/MM if middle part > 12 (likely day)
            if (parseInt(month) > 12 && parseInt(day) <= 12) {
                const temp = day;
                day = month;
                month = temp;
            }

            day = day.padStart(2, '0');
            month = month.padStart(2, '0');
            return `${year}/${month}/${day}`;
        }
        return clean;
    };

    // --- Logic to Parse Data ---
    const parseTransactions = (raw: string, prefix: string): Transaction[] => {
        if (!raw) return [];
        return raw.split('\n').map((line, idx) => {
            const cleanLine = line.trim();
            if (!cleanLine || cleanLine.includes('المبلغ') || cleanLine.includes('Amount')) return null;

            let parts: string[] = [];
            if (cleanLine.includes('\t')) parts = cleanLine.split('\t');
            else if (cleanLine.includes(',')) parts = cleanLine.split(',');
            else parts = cleanLine.split(/\s+/);

            parts = parts.map(p => p.trim()).filter(p => p !== '');

            let amount = 0;
            let date = '';
            let ref = 'N/A';

            const amountIndex = parts.findIndex(p => {
                const cleaned = p.replace(/,/g, '');
                return !isNaN(parseFloat(cleaned)) && isFinite(Number(cleaned)) && !p.includes('/');
            });

            if (amountIndex !== -1) {
                amount = parseFloat(parts[amountIndex].replace(/,/g, ''));
            }

            const dateIndex = parts.findIndex((p, idx) => idx !== amountIndex && (p.includes('/') || p.includes('-')));
            if (dateIndex !== -1) date = standardizeDate(parts[dateIndex]);

            const refIndex = parts.findIndex((p, idx) => idx !== amountIndex && idx !== dateIndex);
            if (refIndex !== -1) ref = parts[refIndex];
            else if (parts.length >= 3 && amountIndex === 0 && dateIndex === 1) ref = parts[2];

            return {
                id: `${prefix}-${idx}`,
                rawLine: line,
                amount,
                date,
                ref: ref.trim(), // Ensure trim
                matched: false
            };
        }).filter((t): t is Transaction => t !== null && t.amount > 0);
    };

    // Memoize raw parsing
    const rawCompanyTxns = useMemo(() => parseTransactions(currentData.companyRaw, 'C'), [currentData.companyRaw]);
    const rawRestaurantTxns = useMemo(() => parseTransactions(currentData.restaurantRaw, 'R'), [currentData.restaurantRaw]);

    const analysisResult = useMemo(() => {
        // Clone to avoid mutation issues during re-renders
        const companyTxns = rawCompanyTxns.map(t => ({ ...t }));
        const restaurantTxns = rawRestaurantTxns.map(t => ({ ...t }));
        const manualLinksMap = currentData.manualLinks || {};

        let globalMatchCounter = 1; // Counter for Match IDs

        // --- PRIORITY 1: Manual Links ---
        Object.entries(manualLinksMap).forEach(([cId, rId]) => {
            const cTxn = companyTxns.find(t => t.id === cId);
            const rTxn = restaurantTxns.find(t => t.id === rId);

            if (cTxn && rTxn) {
                cTxn.matched = true;
                rTxn.matched = true;

                const mId = `MAN-${globalMatchCounter++}`;
                cTxn.matchId = mId;
                rTxn.matchId = mId;
                cTxn.matchReason = 'ربط يدوي';
                rTxn.matchReason = 'ربط يدوي';
            }
        });

        // --- PRIORITY 2: Perfect Match (Same Ref AND Same Amount) ---
        companyTxns.forEach(c => {
            if (c.matched) return;
            if (c.ref.length < 2 || c.ref === 'N/A') return;

            const matchIndex = restaurantTxns.findIndex(r =>
                !r.matched &&
                r.ref === c.ref &&
                Math.abs(r.amount - c.amount) < 0.01
            );

            if (matchIndex > -1) {
                c.matched = true;
                restaurantTxns[matchIndex].matched = true;

                const mId = `PRF-${globalMatchCounter++}`;
                c.matchId = mId;
                restaurantTxns[matchIndex].matchId = mId;
                c.matchReason = 'تطابق تام (مرجع + مبلغ)';
                restaurantTxns[matchIndex].matchReason = 'تطابق تام (مرجع + مبلغ)';
            }
        });

        const linkedVariances: DisplayItem[] = [];

        // --- PRIORITY 3: Reference Match (Variance) ---
        if (matchSettings.matchByRef) {
            companyTxns.forEach(c => {
                if (c.matched) return;
                if (c.ref.length < 2 || c.ref === 'N/A') return;

                // Look for unmatched Restaurant txn with same Ref
                const rMatch = restaurantTxns.find(r =>
                    !r.matched &&
                    r.ref === c.ref
                );

                if (rMatch) {
                    c.matched = true;
                    rMatch.matched = true;

                    const mId = `REF-${globalMatchCounter++}`;
                    c.matchId = mId;
                    rMatch.matchId = mId;
                    c.matchReason = 'تطابق مرجع (فارق مبلغ)';
                    rMatch.matchReason = 'تطابق مرجع (فارق مبلغ)';

                    linkedVariances.push({
                        kind: 'linked_variance',
                        cTxn: c,
                        rTxn: rMatch,
                        variance: c.amount - rMatch.amount
                    });
                }
            });
        }

        // --- PRIORITY 4: Pure Amount Match ---
        companyTxns.forEach(c => {
            if (c.matched) return;

            const matchIndex = restaurantTxns.findIndex(r =>
                !r.matched &&
                Math.abs(r.amount - c.amount) < 0.01 &&
                (!matchSettings.strictDate || r.date === c.date)
            );

            if (matchIndex > -1) {
                c.matched = true;
                restaurantTxns[matchIndex].matched = true;

                const mId = `AMT-${globalMatchCounter++}`;
                c.matchId = mId;
                restaurantTxns[matchIndex].matchId = mId;
                c.matchReason = matchSettings.strictDate ? 'تطابق مبلغ وتاريخ' : 'تطابق مبلغ (بدون مرجع)';
                restaurantTxns[matchIndex].matchReason = matchSettings.strictDate ? 'تطابق مبلغ وتاريخ' : 'تطابق مبلغ (بدون مرجع)';
            }
        });

        // Capture Manual variances for display
        Object.entries(manualLinksMap).forEach(([cId, rId]) => {
            const cTxn = companyTxns.find(t => t.id === cId);
            const rTxn = restaurantTxns.find(t => t.id === rId);
            if (cTxn && rTxn) {
                const diff = Math.abs(cTxn.amount - rTxn.amount);
                if (diff > 0.01) {
                    linkedVariances.push({
                        kind: 'linked_variance',
                        cTxn,
                        rTxn,
                        variance: cTxn.amount - rTxn.amount
                    });
                }
            }
        });

        // Summaries & Totals
        const allDates = Array.from(new Set([...companyTxns.map(t => t.date), ...restaurantTxns.map(t => t.date)]));
        const summary: any[] = [];
        let grandTotalC = 0;
        let grandTotalR = 0;

        allDates.forEach(d => {
            if (!d) return;
            const cTotal = companyTxns.filter(t => t.date === d).reduce((a, b) => a + b.amount, 0);
            const rTotal = restaurantTxns.filter(t => t.date === d).reduce((a, b) => a + b.amount, 0);
            grandTotalC += cTotal;
            grandTotalR += rTotal;
            summary.push({ date: d, cTotal, rTotal, variance: cTotal - rTotal });
        });

        summary.sort((a, b) => a.date.localeCompare(b.date));

        const unmatchedCompany = companyTxns.filter(t => !t.matched);
        const unmatchedRestaurant = restaurantTxns.filter(t => !t.matched);
        const totalVariance = grandTotalC - grandTotalR;
        const totalUnmatchedCount = unmatchedCompany.length + unmatchedRestaurant.length;
        const totalTransactions = companyTxns.length + restaurantTxns.length;
        const matchPercentage = totalTransactions > 0 ? Math.round(((totalTransactions - totalUnmatchedCount) / totalTransactions) * 100) : 0;

        // Combined Ledger Data
        const combinedLedger = [
            ...companyTxns.map(t => ({ ...t, source: 'Company' })),
            ...restaurantTxns.map(t => ({ ...t, source: 'Restaurant' }))
        ].sort((a, b) => {
            if (a.matchId && b.matchId) {
                if (a.matchId === b.matchId) return 0;
                return a.matchId.localeCompare(b.matchId);
            }
            return a.date.localeCompare(b.date);
        });

        return {
            summary,
            unmatchedCompany,
            unmatchedRestaurant,
            linkedVariances,
            grandTotalC,
            grandTotalR,
            totalVariance,
            combinedLedger,
            totalUnmatchedCount,
            matchPercentage
        };

    }, [rawCompanyTxns, rawRestaurantTxns, currentData.manualLinks, matchSettings]);

    // Update History
    useEffect(() => {
        if (currentData.id) {
            const isMatchedZero = Math.abs(analysisResult.totalVariance) < 0.1;
            const hasUnmatched = analysisResult.totalUnmatchedCount > 0;

            // If Variance is 0 but there are unmatched items (e.g. +100 and -100 offset), it's a DIFF not a MATCH
            const finalStatus = (isMatchedZero && !hasUnmatched) ? 'matched' : 'diff';

            updateHistoryItem(currentData.id, {
                calculatedVariance: analysisResult.totalVariance,
                status: finalStatus
            });
        }
    }, [analysisResult.totalVariance, analysisResult.totalUnmatchedCount, currentData.id]);

    // Combined Display List for Analysis Table
    const tableItems: DisplayItem[] = useMemo(() => {
        let items: DisplayItem[] = [];
        items = items.concat(analysisResult.linkedVariances);
        items = items.concat(analysisResult.unmatchedCompany.map(t => ({ kind: 'single', side: 'company', txn: t } as DisplayItem)));
        items = items.concat(analysisResult.unmatchedRestaurant.map(t => ({ kind: 'single', side: 'restaurant', txn: t } as DisplayItem)));
        return items;
    }, [analysisResult]);

    // Filtering & Sorting
    const filteredItems = useMemo(() => {
        let list = [...tableItems];

        // Extended Filter Logic
        if (unmatchedFilter === 'unmatched_only') list = list.filter(i => i.kind === 'single');
        if (unmatchedFilter === 'matched_variance') list = list.filter(i => i.kind === 'linked_variance');

        if (filterText) {
            const lower = filterText.toLowerCase();
            list = list.filter(item => {
                if (item.kind === 'single') {
                    return item.txn.ref.toLowerCase().includes(lower) ||
                        item.txn.amount.toString().includes(lower) ||
                        item.txn.date.includes(lower);
                } else {
                    return item.cTxn.ref.toLowerCase().includes(lower) ||
                        item.rTxn.ref.toLowerCase().includes(lower) ||
                        item.cTxn.amount.toString().includes(lower) ||
                        item.rTxn.amount.toString().includes(lower) ||
                        item.cTxn.date.includes(lower);
                }
            });
        }

        list.sort((a, b) => {
            // Priority Grouping: Linked Variances First
            const aIsLinked = a.kind === 'linked_variance';
            const bIsLinked = b.kind === 'linked_variance';

            if (aIsLinked && !bIsLinked) return -1;
            if (!aIsLinked && bIsLinked) return 1;

            if (aIsLinked && bIsLinked && sortField === 'date') {
                const varA = (a as any).variance;
                const varB = (b as any).variance;
                if (varA !== varB) return varA - varB;
            }

            const getValue = (item: DisplayItem) => {
                if (item.kind === 'single') return item.txn[sortField as keyof Transaction];
                return item.cTxn[sortField as keyof Transaction];
            };
            let valA: any = getValue(a);
            let valB: any = getValue(b);

            if (valA === undefined) valA = '';
            if (valB === undefined) valB = '';

            if (sortField === 'amount') { valA = Number(valA); valB = Number(valB); }
            else { valA = String(valA).toLowerCase(); valB = String(valB).toLowerCase(); }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
        return list;
    }, [tableItems, unmatchedFilter, filterText, sortField, sortOrder]);


    // Handlers
    const handleLink = (sourceId: string, targetId: string, side: 'company' | 'restaurant') => {
        if (!targetId) return;
        const newLinks = { ...currentData.manualLinks };
        if (side === 'company') newLinks[sourceId] = targetId;
        else newLinks[targetId] = sourceId;
        updateCurrentData({ manualLinks: newLinks });
        setActiveLinkRow(null); // Close input after link
    };

    const handleUnlink = (cId: string) => {
        const newLinks = { ...currentData.manualLinks };
        delete newLinks[cId];
        updateCurrentData({ manualLinks: newLinks });
    };

    const handleReset = () => {
        if (window.confirm('هل أنت متأكد؟ سيتم مسح البيانات الحالية وبدء عملية جديدة (سيظل السجل محفوظاً).')) {
            resetCurrentData();
            // Explicitly navigate to the Input Page (/input)
            navigate('/input');
        }
    };

    const handleExport = () => {
        const summaryData = analysisResult.summary.map(s => ({
            "التاريخ": s.date,
            "إجمالي الشركة": s.cTotal,
            "إجمالي المطعم": s.rTotal,
            "الفارق": s.variance
        }));
        summaryData.push({
            "التاريخ": "الإجمالي الكلي",
            "إجمالي الشركة": analysisResult.grandTotalC,
            "إجمالي المطعم": analysisResult.grandTotalR,
            "الفارق": analysisResult.totalVariance
        });

        const unmatchedData = tableItems.map(item => {
            if (item.kind === 'single') {
                return {
                    "النوع": "غير مطابق",
                    "الجهة": item.side === 'company' ? 'الشركة' : 'المطعم',
                    "التاريخ": item.txn.date,
                    "المرجع": item.txn.ref,
                    "المبلغ": item.txn.amount,
                    "الربط": "-"
                };
            } else {
                return {
                    "النوع": "ربط يدوي بفارق",
                    "الجهة": "مشترك",
                    "التاريخ": item.cTxn.date,
                    "المرجع": `${item.cTxn.ref} 🔗 ${item.rTxn.ref}`,
                    "المبلغ": `${item.cTxn.amount} vs ${item.rTxn.amount}`,
                    "الربط": `فارق: ${item.variance}`
                };
            }
        });

        const combinedData = analysisResult.combinedLedger.map(t => ({
            "كود المطابقة": t.matchId || '-',
            "سبب المطابقة": t.matchReason || '-',
            "المصدر": t.source === 'Company' ? 'الشركة' : 'المطعم',
            "التاريخ": t.date,
            "المرجع": t.ref,
            "المبلغ": t.amount,
            "الحالة": t.matched ? 'مطابق' : 'غير مطابق'
        }));

        const wb = XLSX.utils.book_new();
        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        const wsUnmatched = XLSX.utils.json_to_sheet(unmatchedData);
        const wsCombined = XLSX.utils.json_to_sheet(combinedData);

        XLSX.utils.book_append_sheet(wb, wsSummary, "المخلص اليومي");
        XLSX.utils.book_append_sheet(wb, wsUnmatched, "الفروقات");
        XLSX.utils.book_append_sheet(wb, wsCombined, "كشف موحد");
        XLSX.writeFile(wb, `Recon_${currentData.restaurantName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const toggleSort = (field: SortField) => {
        if (sortField === field) setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortOrder('asc'); }
    };

    const toggleExpand = (rowId: string) => {
        setExpandedRow(prev => prev === rowId ? null : rowId);
    }

    // Helper for Manual Link Manager
    const manualLinksList = useMemo(() => {
        const list: { c: Transaction, r: Transaction }[] = [];
        Object.entries(currentData.manualLinks || {}).forEach(([cId, rId]) => {
            const c = rawCompanyTxns.find(t => t.id === cId);
            const r = rawRestaurantTxns.find(t => t.id === rId);
            if (c && r) list.push({ c, r });
        });
        return list;
    }, [currentData.manualLinks, rawCompanyTxns, rawRestaurantTxns]);

    // Combined Ledger Filtered View
    const filteredLedger = useMemo(() => {
        if (ledgerFilter === 'all') return analysisResult.combinedLedger;
        return analysisResult.combinedLedger.filter(t => t.source === ledgerFilter);
    }, [analysisResult.combinedLedger, ledgerFilter]);


    return (
        <div className="bg-[#f8fafc] dark:bg-[#0f172a] min-h-screen text-slate-900 dark:text-[#f1f5f9] transition-colors duration-300">

            {/* Note: Top Header removed in favor of Sidebar Layout */}

            <div className="max-w-[1400px] mx-auto py-8">

                {/* Title Section & Controls */}
                <div className="flex flex-wrap justify-between items-start gap-6 mb-8">
                    <div className="flex flex-col gap-3 text-right">
                        <div className="flex items-center gap-4 text-sm font-bold text-[#3b82f6] mb-1">
                            {!currentData.companyRaw && !currentData.restaurantRaw ? (
                                <button onClick={() => navigate('/input')} className="flex items-center gap-1 hover:underline group">
                                    <span className="material-symbols-outlined text-lg group-hover:scale-110 transition-transform">add_circle</span>
                                    إدخال بيانات جديدة
                                </button>
                            ) : (
                                <button onClick={() => navigate('/input')} className="flex items-center gap-1 hover:underline group">
                                    <span className="material-symbols-outlined text-sm rotate-180 group-hover:-translate-x-1 transition-transform">arrow_back</span>
                                    العودة (حفظ)
                                </button>
                            )}
                            <span className="text-slate-300">|</span>
                            <button onClick={handleReset} className="flex items-center gap-1 hover:text-red-500 transition-colors">
                                <span className="material-symbols-outlined text-sm">restart_alt</span>
                                عملية جديدة
                            </button>
                        </div>
                        <h1 className="text-slate-900 dark:text-white text-3xl lg:text-4xl font-black leading-tight tracking-tight">
                            {currentData.restaurantName || "مطعم غير مسمى"}
                        </h1>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setShowLinkManager(true)}
                            className="flex items-center gap-2 h-12 px-4 rounded-xl font-bold bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition-all hover:bg-purple-100"
                        >
                            <span className="material-symbols-outlined">link</span>
                            <span className="hidden sm:inline">إدارة الروابط ({manualLinksList.length})</span>
                        </button>
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`flex items-center gap-2 h-12 px-4 rounded-xl font-bold transition-all ${showSettings ? 'bg-slate-200 dark:bg-[#334155]' : 'bg-white dark:bg-[#1e293b] border border-[#e2e8f0] dark:border-[#334155]'}`}
                        >
                            <span className="material-symbols-outlined">settings</span>
                            <span className="hidden sm:inline">الإعدادات</span>
                        </button>
                        <button onClick={handleExport} className="flex items-center gap-2 min-w-[140px] cursor-pointer justify-center rounded-xl h-12 px-6 bg-[#10b981] hover:bg-[#059669] text-white text-sm font-bold transition-all shadow-lg shadow-emerald-500/20 active:scale-95">
                            <span className="material-symbols-outlined text-xl">download</span>
                            <span>تصدير Excel</span>
                        </button>
                    </div>
                </div>

                {/* ... Rest of Analysis Page Components (Stats, Tables, Modals) - Content Preserved ... */}

                {/* Dashboard Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="p-4 bg-white dark:bg-[#1e293b] rounded-2xl border border-[#e2e8f0] dark:border-[#1e293b] shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><span className="material-symbols-outlined text-6xl">pie_chart</span></div>
                        <p className="text-slate-500 text-xs font-bold mb-1">نسبة التطابق</p>
                        <div className="flex items-end gap-2">
                            <h3 className="text-3xl font-black text-slate-800 dark:text-white">{analysisResult.matchPercentage}%</h3>
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2 max-w-[100px]">
                                <div className="bg-[#3b82f6] h-2.5 rounded-full" style={{ width: `${analysisResult.matchPercentage}%` }}></div>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-white dark:bg-[#1e293b] rounded-2xl border border-[#e2e8f0] dark:border-[#1e293b] shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><span className="material-symbols-outlined text-6xl">warning</span></div>
                        <p className="text-slate-500 text-xs font-bold mb-1">عدد القيود غير المطابقة</p>
                        <h3 className="text-3xl font-black" style={{ color: colors.negative }}>{analysisResult.totalUnmatchedCount}</h3>
                    </div>
                    <div className="p-4 bg-white dark:bg-[#1e293b] rounded-2xl border border-[#e2e8f0] dark:border-[#1e293b] shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><span className="material-symbols-outlined text-6xl">account_balance</span></div>
                        <p className="text-slate-500 text-xs font-bold mb-1">الفارق الإجمالي (Total Variance)</p>
                        <h3 className="text-3xl font-black font-mono dir-ltr" style={{ color: Math.abs(analysisResult.totalVariance) < 0.1 ? colors.matched : colors.negative }}>
                            {analysisResult.totalVariance.toLocaleString()} {currency}
                        </h3>
                    </div>
                </div>

                {/* Settings Panel */}
                {showSettings && (
                    <div className="mb-8 p-6 bg-slate-100 dark:bg-[#161f2f] rounded-2xl border border-[#e2e8f0] dark:border-[#334155] animate-fade-in-down grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#3b82f6]">tune</span>
                                خيارات المطابقة الآلية
                            </h3>
                            <div className="flex flex-col gap-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <div className="relative">
                                        <input type="checkbox" className="peer sr-only" checked={matchSettings.matchByRef} onChange={e => setMatchSettings(p => ({ ...p, matchByRef: e.target.checked }))} />
                                        <div className="w-11 h-6 bg-gray-300 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3b82f6]"></div>
                                    </div>
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        مطابقة تلقائية برقم المرجع (حتى مع اختلاف المبلغ)
                                    </span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <div className="relative">
                                        <input type="checkbox" className="peer sr-only" checked={matchSettings.strictDate} onChange={e => setMatchSettings(p => ({ ...p, strictDate: e.target.checked }))} />
                                        <div className="w-11 h-6 bg-gray-300 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3b82f6]"></div>
                                    </div>
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        مطابقة صارمة للتاريخ (يجب تطابق التاريخ تماماً في مطابقة المبالغ)
                                    </span>
                                </label>
                            </div>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-pink-500">palette</span>
                                تخصيص الألوان
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="flex items-center gap-2 p-3 bg-white dark:bg-[#0f172a] rounded-lg border border-[#e2e8f0] dark:border-[#334155]">
                                    <input type="color" value={colors.positive} onChange={e => setColors(p => ({ ...p, positive: e.target.value }))} className="size-8 rounded cursor-pointer border-none" />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">الفائض (Income)</span>
                                </div>
                                <div className="flex items-center gap-2 p-3 bg-white dark:bg-[#0f172a] rounded-lg border border-[#e2e8f0] dark:border-[#334155]">
                                    <input type="color" value={colors.negative} onChange={e => setColors(p => ({ ...p, negative: e.target.value }))} className="size-8 rounded cursor-pointer border-none" />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">العجز (Deficit)</span>
                                </div>
                                <div className="flex items-center gap-2 p-3 bg-white dark:bg-[#0f172a] rounded-lg border border-[#e2e8f0] dark:border-[#334155]">
                                    <input type="color" value={colors.matched} onChange={e => setColors(p => ({ ...p, matched: e.target.value }))} className="size-8 rounded cursor-pointer border-none" />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">مطابق (Matched)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Manual Link Manager Modal */}
                {showLinkManager && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                        <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                            <div className="p-5 border-b border-[#e2e8f0] dark:border-[#334155] flex justify-between items-center bg-gray-50 dark:bg-[#161f2f]">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-purple-500">link</span>
                                    إدارة الروابط اليدوية
                                </h3>
                                <button onClick={() => setShowLinkManager(false)} className="size-8 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-red-100 hover:text-red-500 flex items-center justify-center transition-colors">
                                    <span className="material-symbols-outlined text-lg">close</span>
                                </button>
                            </div>
                            <div className="overflow-y-auto p-0 flex-1">
                                {manualLinksList.length === 0 ? (
                                    <div className="p-10 text-center text-slate-500 flex flex-col items-center gap-4">
                                        <span className="material-symbols-outlined text-5xl opacity-20">link_off</span>
                                        <p>لا توجد روابط يدوية حالياً. استخدم جدول "تفاصيل القيود" لإنشاء روابط جديدة.</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-right border-collapse">
                                        <thead className="bg-slate-50 dark:bg-[#0f172a] sticky top-0">
                                            <tr className="border-b border-[#e2e8f0] dark:border-[#334155]">
                                                <th className="p-4 text-xs font-bold text-slate-500">طرف الشركة</th>
                                                <th className="p-4 text-xs font-bold text-slate-500">طرف المطعم</th>
                                                <th className="p-4 text-xs font-bold text-slate-500 text-center">الإجراء</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                                            {manualLinksList.map((item) => (
                                                <tr key={`${item.c.id}-${item.r.id}`} className="hover:bg-slate-50 dark:hover:bg-[#161f2f]">
                                                    <td className="p-4 align-top">
                                                        <div className="text-sm font-bold font-mono text-slate-800 dark:text-slate-200">{item.c.amount}</div>
                                                        <div className="text-xs text-slate-500">{item.c.date} | {item.c.ref}</div>
                                                    </td>
                                                    <td className="p-4 align-top">
                                                        <div className="text-sm font-bold font-mono text-slate-800 dark:text-slate-200">{item.r.amount}</div>
                                                        <div className="text-xs text-slate-500">{item.r.date} | {item.r.ref}</div>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <button onClick={() => handleUnlink(item.c.id)} className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-100 font-bold transition-colors">
                                                            فك الربط
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex border-b border-[#e2e8f0] dark:border-[#334155] mb-6">
                    <button
                        onClick={() => setActiveTab('analysis')}
                        className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'analysis' ? 'border-[#3b82f6] text-[#3b82f6]' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        الملخص والتحليل
                    </button>
                    <button
                        onClick={() => setActiveTab('ledger')}
                        className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'ledger' ? 'border-[#3b82f6] text-[#3b82f6]' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        كشف الحساب الموحد (إثبات المطابقة)
                    </button>
                </div>

                {/* Tab Content: Analysis */}
                {activeTab === 'analysis' && (
                    <div className="animate-fade-in">
                        {/* Global Search Sticky */}
                        <div className="sticky top-[20px] z-40 mb-10 transition-all duration-300">
                            <div className="bg-white/80 dark:bg-[#1e293b]/90 backdrop-blur-md p-2 pr-3 rounded-2xl border border-[#e2e8f0] dark:border-[#1e293b] shadow-xl shadow-slate-200/50 dark:shadow-black/40 ring-1 ring-black/5">
                                <div className="flex flex-col lg:flex-row items-center gap-4">
                                    <div className="flex items-center gap-2 min-w-fit px-2 text-slate-700 dark:text-slate-300">
                                        <span className="material-symbols-outlined text-[#3b82f6]">manage_search</span>
                                        <label className="text-sm font-bold">تصفية النتائج:</label>
                                    </div>
                                    <div className="relative flex-1 w-full flex gap-3">
                                        <div className="relative flex-1 group">
                                            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-[#3b82f6] transition-colors">search</span>
                                            <input
                                                value={filterText}
                                                onChange={(e) => setFilterText(e.target.value)}
                                                className="w-full pr-12 pl-4 py-3.5 bg-slate-50 dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-[#334155] rounded-xl focus:ring-2 focus:ring-[#3b82f6]/50 focus:border-[#3b82f6] text-sm placeholder:text-slate-400 dark:placeholder:text-slate-600 text-slate-900 dark:text-white transition-all shadow-inner"
                                                placeholder="بحث شامل (المرجع، المبلغ، التاريخ)..."
                                                type="text"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Table 1: Daily Summary */}
                        <div className="mb-12">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-[#3b82f6]/10 rounded-lg text-[#3b82f6]">
                                        <span className="material-symbols-outlined text-2xl">calendar_view_day</span>
                                    </div>
                                    <h2 className="text-xl font-bold text-slate-800 dark:text-white">1. الملخص اليومي (Daily Summary)</h2>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-[#e2e8f0] dark:border-[#1e293b] overflow-hidden shadow-sm dark:shadow-none">
                                <div className="overflow-x-auto max-h-[400px]">
                                    <table className="w-full text-right border-collapse">
                                        <thead className="sticky top-0 bg-slate-50 dark:bg-[#161f2f] z-10">
                                            <tr className="border-b border-[#e2e8f0] dark:border-[#1e293b]">
                                                <Th>التاريخ (Date)</Th>
                                                <Th>إجمالي الشركة</Th>
                                                <Th>إجمالي المطعم</Th>
                                                <Th>الفارق (Variance)</Th>
                                                <Th className="text-center">النتيجة</Th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                                            {analysisResult.summary.map((row, idx) => (
                                                <Tr key={idx}>
                                                    <TdSemibold>{row.date}</TdSemibold>
                                                    <TdMono>{row.cTotal.toLocaleString()} {currency}</TdMono>
                                                    <TdMono>{row.rTotal.toLocaleString()} {currency}</TdMono>
                                                    <td className="px-6 py-5 text-sm font-mono font-bold" style={{ color: Math.abs(row.variance) < 0.1 ? colors.matched : colors.negative }}>
                                                        {row.variance.toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <div className="flex justify-center">
                                                            {Math.abs(row.variance) < 0.1 ?
                                                                <Badge variant="success">مطابق</Badge> :
                                                                <Badge variant="warning">فارق</Badge>
                                                            }
                                                        </div>
                                                    </td>
                                                </Tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="sticky bottom-0 bg-slate-100 dark:bg-[#0f172a] z-10 border-t-2 border-[#e2e8f0] dark:border-[#334155]">
                                            <tr>
                                                <td className="px-6 py-6 text-base font-black text-slate-900 dark:text-white">الإجمالي الكلي</td>
                                                <td className="px-6 py-6 text-base font-bold font-mono text-[#3b82f6]">{analysisResult.grandTotalC.toLocaleString()} {currency}</td>
                                                <td className="px-6 py-6 text-base font-bold font-mono text-[#3b82f6]">{analysisResult.grandTotalR.toLocaleString()} {currency}</td>
                                                <td className="px-6 py-6 text-base font-black font-mono" style={{ color: Math.abs(analysisResult.totalVariance) < 0.1 ? colors.matched : colors.negative }}>
                                                    {analysisResult.totalVariance.toLocaleString()} {currency}
                                                </td>
                                                <td className="px-6 py-6 text-center">
                                                    {Math.abs(analysisResult.totalVariance) < 0.1 ?
                                                        <span className="text-xs font-bold text-white px-3 py-1 rounded-full" style={{ backgroundColor: colors.matched }}>تطابق تام</span> :
                                                        <span className="text-xs font-bold text-white px-3 py-1 rounded-full" style={{ backgroundColor: colors.negative }}>يوجد فروقات</span>
                                                    }
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Table 2: Unmatched Entries */}
                        <div>
                            <div className="flex flex-wrap justify-between items-center gap-4 mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-red-500/10 rounded-lg text-red-500">
                                        <span className="material-symbols-outlined text-2xl">list_alt_check</span>
                                    </div>
                                    <h2 className="text-xl font-bold text-slate-800 dark:text-white">2. تفاصيل القيود ({filteredItems.length})</h2>
                                </div>
                                <div className="flex gap-2">
                                    {unmatchedFilter !== 'all' && (
                                        <div className="flex items-center gap-1 bg-[#3b82f6]/10 text-[#3b82f6] px-3 py-1 rounded-full text-xs font-bold border border-[#3b82f6]/20">
                                            <span className="material-symbols-outlined text-sm">filter_alt</span>
                                            <span>فلتر نشط</span>
                                        </div>
                                    )}
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">filter_list</span>
                                        <select
                                            value={unmatchedFilter}
                                            onChange={(e) => setUnmatchedFilter(e.target.value as any)}
                                            className={`pr-10 pl-4 py-2.5 bg-white dark:bg-[#1e293b] border rounded-xl text-xs font-semibold focus:ring-1 focus:ring-[#3b82f6] appearance-none min-w-[200px] text-slate-700 dark:text-slate-300 shadow-sm cursor-pointer hover:border-[#3b82f6] transition-colors ${unmatchedFilter !== 'all' ? 'border-[#3b82f6] ring-1 ring-[#3b82f6]/30' : 'border-[#e2e8f0] dark:border-[#334155]'}`}
                                        >
                                            <option value="all">عرض الكل</option>
                                            <option value="unmatched_only">غير متطابق (طرف واحد)</option>
                                            <option value="matched_variance">متطابق بفارق (روابط)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-[#e2e8f0] dark:border-[#1e293b] overflow-hidden shadow-sm dark:shadow-none">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-right border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-[#161f2f] border-b border-[#e2e8f0] dark:border-[#1e293b]">
                                                <SortableTh label="التاريخ (Date)" field="date" currentSort={sortField} sortOrder={sortOrder} onSort={toggleSort} />
                                                <SortableTh label="المرجع والمصدر (Source & Ref)" field="ref" currentSort={sortField} sortOrder={sortOrder} onSort={toggleSort} />
                                                <SortableTh label="المبلغ (Amount)" field="amount" currentSort={sortField} sortOrder={sortOrder} onSort={toggleSort} />
                                                <Th className="text-center w-[300px]">إجراءات (Actions)</Th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                                            {filteredItems.length === 0 && (
                                                <tr><td colSpan={4} className="p-8 text-center text-slate-500">ممتاز! لا توجد قيود لعرضها.</td></tr>
                                            )}
                                            {filteredItems.slice(0, visibleLimit).map((item) => {
                                                if (item.kind === 'linked_variance') {
                                                    const rowId = `link-${item.cTxn.id}-${item.rTxn.id}`;
                                                    const isExpanded = expandedRow === rowId;
                                                    return (
                                                        <React.Fragment key={rowId}>
                                                            <tr className="bg-purple-50/50 dark:bg-purple-900/10 hover:bg-purple-100/50 dark:hover:bg-purple-900/20 transition-colors border-l-4 border-l-purple-400 cursor-pointer" onClick={() => toggleExpand(rowId)}>
                                                                <td className="px-6 py-5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                                                                    {item.cTxn.date}
                                                                </td>
                                                                <td className="px-6 py-5">
                                                                    <div className="flex flex-col gap-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <Badge variant="warning-outline">الشركة: {item.cTxn.ref}</Badge>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <Badge variant="error-outline">المطعم: {item.rTxn.ref}</Badge>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-5 text-sm font-mono font-bold text-slate-800 dark:text-slate-200">
                                                                    <div className="flex flex-col gap-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-xs text-slate-400">{item.cTxn.amount} | {item.rTxn.amount}</span>
                                                                            <button className="size-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                                                                                <span className="material-symbols-outlined text-[14px]">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                                                                            </button>
                                                                        </div>
                                                                        <span className="font-black dir-ltr" style={{ color: item.variance < 0 ? colors.negative : colors.positive }}>
                                                                            {item.variance > 0 ? '+' : ''}{item.variance.toLocaleString()} {currency}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-5 text-center">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleUnlink(item.cTxn.id); }}
                                                                        className="text-xs text-red-500 hover:text-red-700 font-bold underline px-3 py-1 hover:bg-red-50 rounded"
                                                                    >
                                                                        فك الربط (Unlink)
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                            {isExpanded && (
                                                                <tr className="bg-purple-50/20 dark:bg-purple-900/5">
                                                                    <td colSpan={4} className="px-6 py-3">
                                                                        <div className="flex items-center justify-center gap-4 text-sm font-mono bg-white dark:bg-[#1e293b] p-3 rounded-lg border border-purple-100 dark:border-purple-900/30 shadow-sm">
                                                                            <span className="text-slate-500">تفاصيل الاحتساب:</span>
                                                                            <span className="font-bold text-blue-600">الشركة ({item.cTxn.amount})</span>
                                                                            <span className="text-slate-400">-</span>
                                                                            <span className="font-bold text-amber-600">المطعم ({item.rTxn.amount})</span>
                                                                            <span className="text-slate-400">=</span>
                                                                            <span className="font-black dir-ltr" style={{ color: item.variance < 0 ? colors.negative : colors.positive }}>
                                                                                {item.variance.toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                } else {
                                                    // Single Item
                                                    const options = item.side === 'company' ? analysisResult.unmatchedRestaurant : analysisResult.unmatchedCompany;
                                                    const datalistId = `list-${item.txn.id}`;

                                                    return (
                                                        <tr key={item.txn.id} className="hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-colors">
                                                            <td className="px-6 py-5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                                                                {item.txn.date}
                                                            </td>
                                                            <td className="px-6 py-5">
                                                                <div className="flex flex-row items-center gap-2">
                                                                    {item.side === 'company' ?
                                                                        <Badge variant="warning-outline">سجل شركة</Badge> :
                                                                        <Badge variant="error-outline">سجل مطعم</Badge>
                                                                    }
                                                                    <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">{item.txn.ref}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-5 text-sm font-mono font-bold text-slate-800 dark:text-slate-200">
                                                                {item.txn.amount.toLocaleString()} {currency}
                                                            </td>
                                                            <td className="px-6 py-5 text-center">
                                                                {activeLinkRow === item.txn.id ? (
                                                                    <div className="relative flex items-center gap-1 animate-fade-in justify-center">
                                                                        <input
                                                                            autoFocus
                                                                            list={datalistId}
                                                                            placeholder="بحث..."
                                                                            className="w-32 px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#0f172a] focus:ring-2 focus:ring-[#3b82f6] text-center font-mono placeholder:text-slate-400"
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Escape') setActiveLinkRow(null);
                                                                                if (e.key === 'Enter') {
                                                                                    const val = (e.target as HTMLInputElement).value;
                                                                                    let selectedOpt = options.find(o => `${o.ref} | ${o.amount} | ${o.date}` === val);
                                                                                    if (!selectedOpt) {
                                                                                        selectedOpt = options.find(o => o.ref === val);
                                                                                    }
                                                                                    if (selectedOpt) {
                                                                                        handleLink(item.txn.id, selectedOpt.id, item.side);
                                                                                        (e.target as HTMLInputElement).value = '';
                                                                                    }
                                                                                }
                                                                            }}
                                                                        />
                                                                        <button onClick={() => setActiveLinkRow(null)} className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors"><span className="material-symbols-outlined text-lg">close</span></button>
                                                                        <datalist id={datalistId}>
                                                                            {options.map(opt => (
                                                                                <option key={opt.id} value={`${opt.ref} | ${opt.amount} | ${opt.date}`} />
                                                                            ))}
                                                                        </datalist>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => setActiveLinkRow(item.txn.id)}
                                                                        className="flex items-center justify-center gap-1 text-xs font-bold text-[#3b82f6] bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 px-3 py-1.5 rounded-lg transition-colors mx-auto"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">link</span>
                                                                        ربط يدوي
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                }
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {filteredItems.length > visibleLimit && (
                                    <div className="px-6 py-4 flex items-center justify-between border-t border-[#e2e8f0] dark:border-[#1e293b] bg-slate-50 dark:bg-[#161f2f]">
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">عرض {visibleLimit} من أصل {filteredItems.length}</p>
                                        <button onClick={() => setVisibleLimit(prev => prev + 10)} className="px-4 py-2 text-sm font-bold text-slate-700 dark:text-white rounded-lg bg-white dark:bg-[#1e293b] border border-[#e2e8f0] dark:border-[#334155] hover:bg-slate-50 dark:hover:bg-[#334155] transition-colors">تحميل المزيد من القيود</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab Content: Combined Ledger */}
                {activeTab === 'ledger' && (
                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-[#e2e8f0] dark:border-[#1e293b] overflow-hidden shadow-sm dark:shadow-none animate-fade-in mb-6">
                        <div className="p-4 bg-slate-50 dark:bg-[#161f2f] border-b border-[#e2e8f0] dark:border-[#1e293b] flex justify-between items-center flex-wrap gap-4">
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#3b82f6]">table_view</span>
                                كشف الحساب الموحد
                            </h3>

                            {/* Ledger Filter */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500">عرض المصدر:</span>
                                <select
                                    value={ledgerFilter}
                                    onChange={(e) => setLedgerFilter(e.target.value as any)}
                                    className="px-3 py-1.5 bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-[#334155] rounded-lg text-xs font-bold focus:ring-1 focus:ring-[#3b82f6]"
                                >
                                    <option value="all">الكل (All)</option>
                                    <option value="Company">الشركة فقط</option>
                                    <option value="Restaurant">المطعم فقط</option>
                                </select>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-right border-collapse">
                                <thead className="sticky top-0 bg-slate-100 dark:bg-[#0f172a] z-10">
                                    <tr className="border-b border-[#e2e8f0] dark:border-[#1e293b]">
                                        <Th>رمز المطابقة</Th>
                                        <Th>سبب المطابقة</Th>
                                        <Th>المصدر</Th>
                                        <Th>المرجع</Th>
                                        <Th>التاريخ</Th>
                                        <Th>المبلغ</Th>
                                        <Th>الحالة</Th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                                    {filteredLedger.map((t, idx) => (
                                        <Tr key={idx}>
                                            <td className="px-6 py-4 text-xs font-mono text-slate-500">{t.matchId || '-'}</td>
                                            <td className="px-6 py-4 text-xs font-medium text-slate-600 dark:text-slate-400">{t.matchReason || '-'}</td>
                                            <td className="px-6 py-4 text-sm font-bold">
                                                <span className={`px-2 py-1 rounded ${t.source === 'Company' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                                                    {t.source === 'Company' ? 'الشركة' : 'المطعم'}
                                                </span>
                                            </td>
                                            <TdMono>{t.ref}</TdMono>
                                            <TdMono>{t.date}</TdMono>
                                            <TdSemibold>{t.amount.toLocaleString()}</TdSemibold>
                                            <td className="px-6 py-4">
                                                {t.matched ? (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-green-500 font-bold text-xs flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-sm">check</span>
                                                            مطابق
                                                        </span>
                                                        {t.matchReason && (
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded border w-fit ${t.matchReason.includes('يدوي')
                                                                ? 'bg-purple-100 text-purple-600 border-purple-200 dark:bg-purple-900/30 dark:border-purple-800'
                                                                : 'bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                                                                }`}>
                                                                {t.matchReason}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-red-400 text-xs font-bold flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-sm">close</span>
                                                        غير مطابق
                                                    </span>
                                                )}
                                            </td>
                                        </Tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <footer className="mt-20 py-10 border-t border-[#e2e8f0] dark:border-[#1e293b] text-center">
                    <p className="text-slate-500 dark:text-slate-500 text-sm font-medium text-center">© 2023 محرك المصالحة المتقدم والتحليل المالي. النمط المؤسسي العربي مطبق.</p>
                </footer>
            </div>

        </div>
    );
};

// Table Helper Components
const Th = ({ children, className = '' }: any) => (
    <th className={`px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ${className}`}>
        {children}
    </th>
);

const SortableTh = ({ label, field, currentSort, sortOrder, onSort }: any) => (
    <th
        onClick={() => onSort(field)}
        className="px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-[#1e293b] transition-colors select-none group"
    >
        <div className="flex items-center gap-1">
            {label}
            <span className={`material-symbols-outlined text-sm transition-opacity ${currentSort === field ? 'opacity-100 text-[#3b82f6]' : 'opacity-20 group-hover:opacity-50'}`}>
                {currentSort === field && sortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'}
            </span>
        </div>
    </th>
);

const Tr = ({ children }: any) => (
    <tr className="group hover:bg-slate-50 dark:hover:bg-[#1e293b] transition-colors">
        {children}
    </tr>
);

const TdSemibold = ({ children }: any) => (
    <td className="px-6 py-5 text-sm font-semibold text-slate-700 dark:text-slate-200">{children}</td>
);

const TdMono = ({ children }: any) => (
    <td className="px-6 py-5 text-sm font-mono text-slate-600 dark:text-slate-300">{children}</td>
);

const Badge = ({ variant, children }: any) => {
    const styles: any = {
        success: 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20',
        warning: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
        'warning-outline': 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50 text-[10px] uppercase tracking-wider',
        'error-outline': 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/50 text-[10px] uppercase tracking-wider',
        'purple': 'bg-purple-100 text-purple-700 border-purple-200',
    };
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-sm ${styles[variant]}`}>
            {children}
        </span>
    );
};

export default AnalysisPage;