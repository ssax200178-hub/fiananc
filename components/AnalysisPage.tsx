import React, { useMemo, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { confirmDialog, promptDialog } from '../utils/confirm';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import { parseNumber, safeCompare } from '../utils';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useSnackbar } from 'notistack';

// XLSX is imported from 'xlsx'

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
    const { enqueueSnackbar } = useSnackbar();
    const { currentData, updateCurrentData, resetCurrentData, currency, theme, colors, updateHistoryItem, currentUser } = useAppContext();

    // UI States
    const [showSettings, setShowSettings] = useState(false);
    const [showLinkManager, setShowLinkManager] = useState(false); // Modal State
    const [expandedRow, setExpandedRow] = useState<string | null>(null); // For Details Expansion
    const [activeLinkRow, setActiveLinkRow] = useState<string | null>(null); // For Manual Link Input toggle
    const [activeTab, setActiveTab] = useState<'summary' | 'details' | 'ledger'>('summary');
    const [showActivityLog, setShowActivityLog] = useState(false);

    // Dismiss Modal State
    const [dismissModalItem, setDismissModalItem] = useState<{ id: string, side: string } | null>(null);
    const [dismissNote, setDismissNote] = useState('');

    // Phase 6.1: Bulk Selection
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

    // Phase 6.2: Entry Notes
    const [noteEditItem, setNoteEditItem] = useState<string | null>(null);
    const [noteText, setNoteText] = useState('');

    // Phase 7.1: PDF Export State
    const [isExportingPDF, setIsExportingPDF] = useState(false);

    // Action Logs (Task 1)
    const [actionLogs, setActionLogs] = useState<{ timestamp: string, user: string, action: string }[]>([]);

    // Color Constants
    const COLORS = {
        positive: '#d97706', // amber-600
        negative: '#dc2626', // red-600
        matched: '#10b981'   // emerald-500
    };

    // Phase 7.2: Persistent Matching Settings
    const [matchSettings, setMatchSettings] = useState(() => {
        const saved = localStorage.getItem('financial_recon_match_settings');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) { }
        }
        return {
            matchByRef: true,           // Auto-link if Ref matches (even if amount diff)
            strictDate: false,          // If true, amounts only match if Date is identical
            dateRangeDays: 0,           // Allow ±N days tolerance (0 = disabled)
            allowAutoUnlink: true,      // Allow unlinking auto-matched items
            smartSuggestions: true,     // Show smart suggestions for unmatched items
            detectDuplicates: true,     // Warn about potential duplicate entries
            bookletRange: false,        // Detect same-booklet refs (25 per booklet)
            bookletSize: 25,            // Number of invoices per booklet
        };
    });

    useEffect(() => {
        localStorage.setItem('financial_recon_match_settings', JSON.stringify(matchSettings));
    }, [matchSettings]);

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
            let amount = 0;
            let date = '';
            let ref = 'N/A';

            // If we have tabs, we expect a specific order from InputPage: Amount \t Date \t Reference
            if (cleanLine.includes('\t')) {
                parts = cleanLine.split('\t');
                amount = parseNumber(parts[0]);
                date = parts[1] ? standardizeDate(parts[1]) : '';
                ref = parts[2] ? parts[2].trim() : 'N/A';
            } else {
                // Fallback for manual pasting or comma separated
                if (cleanLine.includes(',')) parts = cleanLine.split(',');
                else parts = cleanLine.split(/\s+/);

                parts = parts.map(p => p.trim()).filter(p => p !== '');

                const amountIndex = parts.findIndex(p => {
                    const val = parseNumber(p);
                    // Check if it's a valid number and doesn't look like a date
                    return !isNaN(val) && isFinite(val) && !p.includes('/') && !p.includes('-');
                });

                if (amountIndex !== -1) {
                    amount = parseNumber(parts[amountIndex]);
                }

                const dateIndex = parts.findIndex((p, idx) => idx !== amountIndex && (p.includes('/') || p.includes('-')));
                if (dateIndex !== -1) date = standardizeDate(parts[dateIndex]);

                const refIndex = parts.findIndex((p, idx) => idx !== amountIndex && idx !== dateIndex);
                if (refIndex !== -1) ref = parts[refIndex];
                else if (parts.length >= 3 && amountIndex === 0 && dateIndex === 1) ref = parts[2];
            }

            return {
                id: `${prefix}-${idx}`,
                rawLine: line,
                amount,
                date,
                ref: ref.trim(),
                matched: false
            };
        }).filter((t): t is Transaction => t !== null && t.amount !== 0); // Allow negative amounts, only skip zero
    };

    // Memoize raw parsing
    const rawCompanyTxns = useMemo(() => parseTransactions(currentData.companyRaw, 'C'), [currentData.companyRaw]);
    const rawRestaurantTxns = useMemo(() => parseTransactions(currentData.restaurantRaw, 'R'), [currentData.restaurantRaw]);

    const analysisResult = useMemo(() => {
        // Clone to avoid mutation issues during re-renders
        const companyTxns = rawCompanyTxns.map(t => ({ ...t }));
        const restaurantTxns = rawRestaurantTxns.map(t => ({ ...t }));
        const manualLinksMap = currentData.manualLinks || {};
        const ignoredAutoLinksMap = currentData.ignoredAutoLinks || {};

        // Helper: check if a pair is in the ignored list
        const isIgnoredPair = (cId: string, rId: string) => {
            return ignoredAutoLinksMap[cId] === rId;
        };

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
                cTxn.matchReason = 'يدوي';
                rTxn.matchReason = 'يدوي';
            }
        });

        // --- PRIORITY 2: Perfect Match (Same Ref AND Same Amount) ---
        companyTxns.forEach(c => {
            if (c.matched) return;
            if (c.ref.length < 2 || c.ref === 'N/A') return;

            const matchIndex = restaurantTxns.findIndex(r =>
                !r.matched &&
                r.ref === c.ref &&
                Math.abs(r.amount - c.amount) < 0.01 &&
                !isIgnoredPair(c.id, r.id)
            );

            if (matchIndex > -1) {
                c.matched = true;
                restaurantTxns[matchIndex].matched = true;

                const mId = `PRF-${globalMatchCounter++}`;
                c.matchId = mId;
                restaurantTxns[matchIndex].matchId = mId;
                c.matchReason = 'تلقائي (تطابق تام)';
                restaurantTxns[matchIndex].matchReason = 'تلقائي (تطابق تام)';
            }
        });

        const linkedVariances: DisplayItem[] = [];

        // --- PRIORITY 3: Reference Match (Variance) ---
        if (matchSettings.matchByRef) {
            companyTxns.forEach(c => {
                if (c.matched) return;
                if (c.ref.length < 2 || c.ref === 'N/A') return;

                // Look for unmatched Restaurant txn with same Ref (skip ignored pairs)
                const rMatch = restaurantTxns.find(r =>
                    !r.matched &&
                    r.ref === c.ref &&
                    !isIgnoredPair(c.id, r.id)
                );

                if (rMatch) {
                    c.matched = true;
                    rMatch.matched = true;

                    const mId = `REF-${globalMatchCounter++}`;
                    c.matchId = mId;
                    rMatch.matchId = mId;
                    c.matchReason = 'تلقائي (تطابق مرجع)';
                    rMatch.matchReason = 'تلقائي (تطابق مرجع)';

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
                c.matchReason = matchSettings.strictDate ? 'تلقائي (تطابق مبلغ وتاريخ)' : 'تلقائي (تطابق مبلغ)';
                restaurantTxns[matchIndex].matchReason = matchSettings.strictDate ? 'تلقائي (تطابق مبلغ وتاريخ)' : 'تلقائي (تطابق مبلغ)';
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

            // Company variance: unmatched company amounts + positive linked variances for this date
            const unmatchedCompanyByDate = companyTxns.filter(t => t.date === d && !t.matched).reduce((a, b) => a + b.amount, 0);
            const linkedCompanyByDate = linkedVariances
                .filter(item => item.kind === 'linked_variance' && item.cTxn.date === d && item.variance > 0)
                .reduce((a: number, item: any) => a + item.variance, 0);

            // Restaurant variance: unmatched restaurant amounts + negative linked variances for this date
            const unmatchedRestaurantByDate = restaurantTxns.filter(t => t.date === d && !t.matched).reduce((a, b) => a + b.amount, 0);
            const linkedRestaurantByDate = linkedVariances
                .filter(item => item.kind === 'linked_variance' && item.cTxn.date === d && item.variance < 0)
                .reduce((a: number, item: any) => a + Math.abs(item.variance), 0);

            const companyVariance = unmatchedCompanyByDate + linkedCompanyByDate;
            const restaurantVariance = unmatchedRestaurantByDate + linkedRestaurantByDate;

            summary.push({
                date: d, cTotal, rTotal,
                variance: cTotal - rTotal,
                companyVariance,
                restaurantVariance,
                netVariance: companyVariance - restaurantVariance
            });
        });

        summary.sort((a, b) => safeCompare(a.date, b.date));

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
                return safeCompare(a.matchId, b.matchId);
            }
            return safeCompare(a.date, b.date);
        });

        // --- Booklet Range Detection ---
        const bookletAlerts: { cRef: string; rRef: string; bookletStart: number; bookletEnd: number; cId: string; rId: string }[] = [];
        if (matchSettings.bookletRange) {
            const getRefNum = (ref: string): number | null => {
                const num = parseInt(ref.replace(/\D/g, ''), 10);
                return isNaN(num) ? null : num;
            };
            const getBookletRange = (num: number) => {
                const size = matchSettings.bookletSize || 25;
                const start = Math.floor((num - 1) / size) * size + 1;
                return { start, end: start + size - 1 };
            };

            unmatchedCompany.forEach(c => {
                const cNum = getRefNum(c.ref);
                if (cNum === null) return;
                const cBooklet = getBookletRange(cNum);

                unmatchedRestaurant.forEach(r => {
                    const rNum = getRefNum(r.ref);
                    if (rNum === null) return;
                    const rBooklet = getBookletRange(rNum);

                    if (cBooklet.start === rBooklet.start) {
                        // Same booklet!
                        bookletAlerts.push({
                            cRef: c.ref,
                            rRef: r.ref,
                            bookletStart: cBooklet.start,
                            bookletEnd: cBooklet.end,
                            cId: c.id,
                            rId: r.id
                        });
                    }
                });
            });
        }

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
            matchPercentage,
            bookletAlerts
        };

    }, [rawCompanyTxns, rawRestaurantTxns, currentData.manualLinks, currentData.ignoredAutoLinks, matchSettings]);

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

        // Add Log
        setActionLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString('ar-SA'),
            user: currentUser?.name || 'مدير النظام',
            action: `قام بإضافة ربط يدوي بين القيد (${sourceId}) والقيد (${targetId})`
        }]);
    };

    const handleUnlink = (cId: string) => {
        const manualLinks = { ...currentData.manualLinks };

        if (manualLinks[cId]) {
            // Unlink a manual link
            delete manualLinks[cId];
            updateCurrentData({ manualLinks });

            setActionLogs(prev => [...prev, {
                timestamp: new Date().toLocaleTimeString('ar-SA'),
                user: currentUser?.name || 'مدير النظام',
                action: `قام بإلغاء ربط يدوي متعلق بالقيد (${cId})`
            }]);
        } else {
            // Unlink an auto-linked item — add to ignoredAutoLinks
            // Find the restaurant txn paired with this company txn
            const companyTxn = rawCompanyTxns.find(t => t.id === cId);
            if (companyTxn) {
                const restaurantTxn = rawRestaurantTxns.find(r => r.ref === companyTxn.ref);
                if (restaurantTxn) {
                    const ignoredAutoLinks = { ...(currentData.ignoredAutoLinks || {}), [cId]: restaurantTxn.id };
                    updateCurrentData({ ignoredAutoLinks });

                    setActionLogs(prev => [...prev, {
                        timestamp: new Date().toLocaleTimeString('ar-SA'),
                        user: currentUser?.name || 'مدير النظام',
                        action: `قام بفك ربط آلي بين القيد (${cId}) والقيد (${restaurantTxn.id})`
                    }]);
                }
            }
        }
    };

    // Dismiss handler — saves the item ID and note to dismissedItems
    const handleDismiss = () => {
        if (!dismissModalItem) return;
        const dismissedItems = { ...(currentData.dismissedItems || {}), [dismissModalItem.id]: dismissNote || 'تم التصفير بدون ملاحظة' };
        updateCurrentData({ dismissedItems });

        setActionLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString('ar-SA'),
            user: currentUser?.name || 'مدير النظام',
            action: `قام بتصفير القيد (${dismissModalItem.id}) - ملاحظة: ${dismissNote || 'بدون ملاحظة'}`
        }]);

        setDismissModalItem(null);
        setDismissNote('');
    };

    // Undo dismiss
    const handleUndoDismiss = (itemId: string) => {
        const dismissedItems = { ...(currentData.dismissedItems || {}) };
        delete dismissedItems[itemId];
        updateCurrentData({ dismissedItems });

        setActionLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString('ar-SA'),
            user: currentUser?.name || 'مدير النظام',
            action: `قام بإلغاء تصفير القيد (${itemId})`
        }]);
    };

    // Phase 6.1: Bulk Operations
    const toggleSelect = (id: string) => {
        setSelectedItems(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedItems.size === filteredItems.length) {
            setSelectedItems(new Set());
        } else {
            const allIds = filteredItems.map(item =>
                item.kind === 'single' ? item.txn.id : `link-${item.cTxn.id}-${item.rTxn.id}`
            );
            setSelectedItems(new Set(allIds));
        }
    };

    const handleBulkDismiss = async () => {
        if (selectedItems.size === 0) return;
        const promptResult = await promptDialog('ملاحظة التصفير الجماعي (اختياري):');
        if (promptResult === null) return; // user cancelled
        const note = promptResult || 'تصفير جماعي';

        const dismissedItems = { ...(currentData.dismissedItems || {}) };
        selectedItems.forEach(id => {
            // Only dismiss single items, skip linked_variance items
            const item = filteredItems.find(fi =>
                fi.kind === 'single' && fi.txn.id === id
            );
            if (item && item.kind === 'single') {
                dismissedItems[item.txn.id] = note;
            }
        });
        updateCurrentData({ dismissedItems });
        setSelectedItems(new Set());
        setActionLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString('ar-SA'),
            user: currentUser?.name || 'مدير النظام',
            action: `تصفير جماعي لـ ${selectedItems.size} قيد`
        }]);
    };

    // Phase 6.2: Entry Notes
    const handleSaveNote = (itemId: string, note: string) => {
        const entryNotes = { ...(currentData.entryNotes || {}), [itemId]: note };
        if (!note) delete entryNotes[itemId];
        updateCurrentData({ entryNotes });
        setNoteEditItem(null);
        setNoteText('');
    };

    const getEntryNote = (itemId: string): string => {
        return currentData.entryNotes?.[itemId] || '';
    };

    // Phase 6.3: Workflow Status Change
    const workflowSteps = [
        { key: 'draft', label: 'مسودة', icon: 'edit_note', color: 'slate' },
        { key: 'review', label: 'قيد المراجعة', icon: 'rate_review', color: 'amber' },
        { key: 'approved', label: 'معتمد', icon: 'verified', color: 'emerald' },
        { key: 'archived', label: 'مؤرشف', icon: 'inventory_2', color: 'indigo' },
    ] as const;

    const handleWorkflowChange = (newStatus: string) => {
        const stepLabel = workflowSteps.find(s => s.key === newStatus)?.label || newStatus;
        updateCurrentData({ status: newStatus as any });
        setActionLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString('ar-SA'),
            user: currentUser?.name || 'مدير النظام',
            action: `تغيير حالة المطابقة إلى: ${stepLabel}`
        }]);
        enqueueSnackbar(`تم تغيير حالة المطابقة إلى: ${stepLabel}`, { variant: 'success' });
    };

    // Phase 6.4 & 7.1: PDF Export
    const handlePrintPDF = async () => {
        setIsExportingPDF(true);
        try {
            const element = document.getElementById('pdf-export-area') || document.body;

            const canvas = await html2canvas(element, {
                scale: 1.5, // optimal resolution
                useCORS: true,
                logging: false,
                backgroundColor: theme === 'dark' ? '#0f172a' : '#f8fafc',
            });
            const imgData = canvas.toDataURL('image/jpeg', 0.8);

            // p = portrait, mm, a4
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            let heightLeft = pdfHeight;
            let position = 0;

            pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= pdf.internal.pageSize.getHeight();

            while (heightLeft > 0) {
                position = position - pdf.internal.pageSize.getHeight();
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
                heightLeft -= pdf.internal.pageSize.getHeight();
            }

            pdf.save(`تسويه_${currentData.restaurantName || 'عام'}_${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (error) {
            console.error('PDF Export Error:', error);
            alert('حدث خطأ أثناء تصدير التقرير');
        } finally {
            setIsExportingPDF(false);
        }
    };

    const handleReset = async () => {
        const confirmed = await confirmDialog('هل أنت متأكد؟ سيتم مسح البيانات الحالية وبدء عملية جديدة (سيظل السجل محفوظاً).', { type: 'warning', confirmText: 'إعادة تعيين', cancelText: 'إلغاء' });
        if (confirmed) {
            resetCurrentData();
            // Explicitly navigate to the Input Page (/input)
            navigate('/input');
        }
    };

    const handleExport = () => {
        const summaryData = analysisResult.summary.map((s: any) => ({
            "التاريخ": s.date,
            "إجمالي الشركة": s.cTotal,
            "إجمالي المطعم": s.rTotal,
            "فارق الشركة": s.companyVariance,
            "فارق المطعم": s.restaurantVariance,
            "صافي الفرق": s.netVariance
        }));
        const totalCompanyVar = analysisResult.summary.reduce((a: number, r: any) => a + r.companyVariance, 0);
        const totalRestaurantVar = analysisResult.summary.reduce((a: number, r: any) => a + r.restaurantVariance, 0);
        summaryData.push({
            "التاريخ": "الإجمالي الكلي",
            "إجمالي الشركة": analysisResult.grandTotalC,
            "إجمالي المطعم": analysisResult.grandTotalR,
            "فارق الشركة": totalCompanyVar,
            "فارق المطعم": totalRestaurantVar,
            "صافي الفرق": totalCompanyVar - totalRestaurantVar
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

    // Helper for All Links Manager
    const allLinksList = useMemo(() => {
        const list: { c: Transaction, r: Transaction, isManual: boolean, reason: string }[] = [];
        const matchGroups: Record<string, { c?: Transaction, r?: Transaction, reason: string }> = {};

        analysisResult.combinedLedger.forEach(t => {
            if (t.matchId && t.matchId !== '-') {
                if (!matchGroups[t.matchId]) {
                    matchGroups[t.matchId] = { reason: t.matchReason || '' };
                }
                if (t.source === 'Company') matchGroups[t.matchId].c = t as any;
                if (t.source === 'Restaurant') matchGroups[t.matchId].r = t as any;
            }
        });

        Object.values(matchGroups).forEach(group => {
            if (group.c && group.r) {
                const isManual = group.reason.includes('يدوي');
                const diff = Math.abs(group.c.amount - (group.r as any).amount);
                // Phase 2.3: Only show manual links and ref-matched with variance (exclude perfect auto-matches)
                if (isManual || diff > 0.01) {
                    list.push({
                        c: group.c,
                        r: group.r,
                        isManual,
                        reason: group.reason
                    });
                }
            }
        });

        return list;
    }, [analysisResult.combinedLedger]);

    // Combined Ledger Filtered View
    const filteredLedger = useMemo(() => {
        if (ledgerFilter === 'all') return analysisResult.combinedLedger;
        return analysisResult.combinedLedger.filter(t => t.source === ledgerFilter);
    }, [analysisResult.combinedLedger, ledgerFilter]);


    const TABS = [
        { id: 'summary' as const, label: 'الملخص اليومي', icon: 'calendar_view_day', count: analysisResult.summary.length },
        { id: 'details' as const, label: 'تفاصيل القيود', icon: 'list_alt_check', count: filteredItems.length },
        { id: 'ledger' as const, label: 'كشف موحد', icon: 'table_view', count: filteredLedger.length },
    ];

    return (
        <div id="pdf-export-area" className="bg-gradient-to-bl from-slate-50 via-slate-100 to-indigo-50/30 dark:from-[#0a0f1e] dark:via-[#0f172a] dark:to-[#0d1330] min-h-screen text-slate-900 dark:text-[#f1f5f9] transition-colors duration-500">

            <div className="max-w-[1500px] mx-auto px-4 md:px-8 py-6 md:py-10">

                {/* ═══════════════════ HERO HEADER ═══════════════════ */}
                <div className="relative mb-10">
                    {/* Gradient decorative line */}
                    <div className="absolute top-0 right-0 w-32 h-1 bg-gradient-to-l from-indigo-500 via-violet-500 to-purple-500 rounded-full" />

                    <div className="flex flex-wrap justify-between items-start gap-6 pt-4">
                        <div className="flex flex-col gap-3 text-right">
                            {/* Breadcrumb nav */}
                            <div className="flex items-center gap-3 text-sm font-bold">
                                {!currentData.companyRaw && !currentData.restaurantRaw ? (
                                    <button onClick={() => navigate('/input')} className="flex items-center gap-1.5 text-indigo-500 hover:text-indigo-600 transition-colors group">
                                        <span className="material-symbols-outlined text-lg group-hover:scale-110 transition-transform">add_circle</span>
                                        إدخال بيانات جديدة
                                    </button>
                                ) : (
                                    <button onClick={() => navigate('/input')} className="flex items-center gap-1.5 text-indigo-500 hover:text-indigo-600 transition-colors group">
                                        <span className="material-symbols-outlined text-sm rotate-180 group-hover:-translate-x-1 transition-transform">arrow_back</span>
                                        العودة (حفظ)
                                    </button>
                                )}
                                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                                <button onClick={handleReset} className="flex items-center gap-1.5 text-slate-400 hover:text-red-500 transition-colors">
                                    <span className="material-symbols-outlined text-sm">restart_alt</span>
                                    عملية جديدة
                                </button>
                            </div>
                            {/* Restaurant Name */}
                            <h1 className="text-slate-900 dark:text-white text-3xl lg:text-5xl font-black leading-tight tracking-tight">
                                <span className="bg-gradient-to-l from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-transparent">
                                    {currentData.restaurantName || "مطعم غير مسمى"}
                                </span>
                            </h1>

                            {/* File badges */}
                            <div className="flex flex-wrap gap-2 mt-3">
                                {currentData.companyFileName && (
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 bg-white/80 dark:bg-white/5 backdrop-blur-sm px-3 py-1.5 rounded-full border border-slate-200/50 dark:border-white/10 shadow-sm">
                                        <span className="w-2 h-2 rounded-full bg-indigo-500" />
                                        الشركة: {currentData.companyFileName}
                                    </span>
                                )}
                                {currentData.restaurantFileName && (
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 bg-white/80 dark:bg-white/5 backdrop-blur-sm px-3 py-1.5 rounded-full border border-slate-200/50 dark:border-white/10 shadow-sm">
                                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                                        المطعم: {currentData.restaurantFileName}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setShowLinkManager(true)}
                                className="flex items-center gap-2 h-11 px-5 rounded-full font-bold text-sm bg-violet-500/10 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300 border border-violet-200/50 dark:border-violet-500/20 transition-all hover:bg-violet-500/20 hover:shadow-lg hover:shadow-violet-500/10 active:scale-95"
                            >
                                <span className="material-symbols-outlined text-lg">link</span>
                                <span className="hidden sm:inline">الروابط ({allLinksList.length})</span>
                            </button>
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                className={`flex items-center justify-center h-11 w-11 rounded-full font-bold transition-all active:scale-95 ${showSettings ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-white/80 dark:bg-white/5 backdrop-blur-sm text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-white/10 hover:border-indigo-300'}`}
                                title="الإعدادات"
                            >
                                <span className="material-symbols-outlined text-lg">tune</span>
                            </button>
                            <button onClick={handleExport} className="flex items-center gap-2 h-11 px-6 rounded-full bg-gradient-to-l from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-sm font-bold transition-all shadow-lg shadow-emerald-500/25 active:scale-95">
                                <span className="material-symbols-outlined text-lg">download</span>
                                <span>تصدير Excel</span>
                            </button>
                            <button
                                onClick={() => navigate('/variance-resolution')}
                                className="flex items-center gap-2 h-11 px-5 rounded-full font-bold text-sm bg-teal-500/10 dark:bg-teal-500/15 text-teal-600 dark:text-teal-300 border border-teal-200/50 dark:border-teal-500/20 transition-all hover:bg-teal-500/20 hover:shadow-lg hover:shadow-teal-500/10 active:scale-95"
                            >
                                <span className="material-symbols-outlined text-lg">gavel</span>
                                <span className="hidden sm:inline">تسوية الفروقات</span>
                            </button>
                            <button disabled={isExportingPDF} onClick={handlePrintPDF} className={`flex items-center gap-2 h-11 px-5 rounded-full font-bold text-sm ${isExportingPDF ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 opacity-70 cursor-not-allowed' : 'bg-rose-500/10 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300 border border-rose-200/50 dark:border-rose-500/20 hover:bg-rose-500/20 hover:shadow-lg hover:shadow-rose-500/10'} transition-all active:scale-95 print:hidden`}>
                                <span className="material-symbols-outlined text-lg">{isExportingPDF ? 'hourglass_empty' : 'picture_as_pdf'}</span>
                                <span className="hidden sm:inline">{isExportingPDF ? 'جاري التحضير...' : 'PDF'}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* ═══════════ WORKFLOW STATUS BAR (6.3) ═══════════ */}
                <div className="mb-6 bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/50 dark:border-white/[0.06] shadow-lg p-4 print:hidden">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-indigo-500 text-lg">linear_scale</span>
                        <span className="text-sm font-black text-slate-700 dark:text-slate-200">سير عمل المطابقة</span>
                    </div>
                    <div className="flex items-center gap-1">
                        {workflowSteps.map((step, idx) => {
                            const currentStatus = currentData.status === 'matched' ? 'approved' : (currentData.status === 'diff' ? 'draft' : currentData.status);
                            const currentIdx = workflowSteps.findIndex(s => s.key === currentStatus);
                            const isActive = step.key === currentStatus;
                            const isPast = idx < currentIdx;
                            return (
                                <React.Fragment key={step.key}>
                                    <button
                                        onClick={() => handleWorkflowChange(step.key)}
                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${isActive
                                            ? step.color === 'slate' ? 'bg-slate-500 text-white shadow-md'
                                                : step.color === 'amber' ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
                                                    : step.color === 'emerald' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                                                        : 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                                            : isPast
                                                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                                                : 'bg-slate-50 dark:bg-white/[0.03] text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-white/[0.06] hover:border-slate-300'
                                            }`}
                                    >
                                        <span className="material-symbols-outlined text-sm">{isPast && !isActive ? 'check_circle' : step.icon}</span>
                                        {step.label}
                                    </button>
                                    {idx < workflowSteps.length - 1 && (
                                        <div className={`h-0.5 w-6 rounded-full flex-shrink-0 ${isPast ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                {/* ═══════════════════ STAT CARDS ═══════════════════ */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
                    {/* Match Percentage Card */}
                    <div className="group relative bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/50 dark:border-white/[0.06] shadow-lg shadow-slate-200/50 dark:shadow-black/20 p-6 overflow-hidden hover:shadow-xl hover:border-indigo-200/50 dark:hover:border-indigo-500/20 transition-all duration-300">
                        <div className="absolute -top-6 -left-6 w-24 h-24 bg-gradient-to-br from-indigo-500/20 to-violet-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                        <div className="relative flex items-center justify-between">
                            <div>
                                <p className="text-slate-400 dark:text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">نسبة التطابق</p>
                                <h3 className="text-4xl font-black text-slate-800 dark:text-white">{analysisResult.matchPercentage}<span className="text-lg text-slate-400">%</span></h3>
                            </div>
                            {/* SVG Circular Progress */}
                            <div className="relative w-16 h-16">
                                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                                    <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="5" className="text-slate-100 dark:text-slate-800" />
                                    <circle cx="32" cy="32" r="28" fill="none" strokeWidth="5" strokeLinecap="round"
                                        className={analysisResult.matchPercentage >= 90 ? 'text-emerald-500' : analysisResult.matchPercentage >= 50 ? 'text-amber-500' : 'text-red-500'}
                                        stroke="currentColor"
                                        strokeDasharray={`${(analysisResult.matchPercentage / 100) * 175.93} 175.93`}
                                        style={{ transition: 'stroke-dasharray 1s ease-in-out' }}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className={`material-symbols-outlined text-lg ${analysisResult.matchPercentage >= 90 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                        {analysisResult.matchPercentage >= 90 ? 'verified' : 'pending'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Unmatched Count Card */}
                    <div className="group relative bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/50 dark:border-white/[0.06] shadow-lg shadow-slate-200/50 dark:shadow-black/20 p-6 overflow-hidden hover:shadow-xl hover:border-red-200/50 dark:hover:border-red-500/20 transition-all duration-300">
                        <div className="absolute -top-6 -left-6 w-24 h-24 bg-gradient-to-br from-red-500/20 to-orange-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                        <div className="relative flex items-center justify-between">
                            <div>
                                <p className="text-slate-400 dark:text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">القيود غير المطابقة</p>
                                <h3 className="text-4xl font-black" style={{ color: analysisResult.totalUnmatchedCount > 0 ? COLORS.negative : COLORS.matched }}>
                                    {analysisResult.totalUnmatchedCount}
                                </h3>
                            </div>
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${analysisResult.totalUnmatchedCount > 0 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                <span className={`material-symbols-outlined text-2xl ${analysisResult.totalUnmatchedCount > 0 ? 'animate-pulse' : ''}`}>
                                    {analysisResult.totalUnmatchedCount > 0 ? 'warning' : 'check_circle'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Total Variance Card */}
                    <div className="group relative bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/50 dark:border-white/[0.06] shadow-lg shadow-slate-200/50 dark:shadow-black/20 p-6 overflow-hidden hover:shadow-xl hover:border-amber-200/50 dark:hover:border-amber-500/20 transition-all duration-300">
                        <div className="absolute -top-6 -left-6 w-24 h-24 bg-gradient-to-br from-amber-500/20 to-yellow-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                        <div className="relative flex items-center justify-between">
                            <div>
                                <p className="text-slate-400 dark:text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">الفارق الإجمالي</p>
                                <h3 className="text-3xl font-black font-mono" style={{ color: Math.abs(analysisResult.totalVariance) < 0.1 ? COLORS.matched : COLORS.negative }}>
                                    {analysisResult.totalVariance.toLocaleString()} <span className="text-base font-bold text-slate-400">{currency}</span>
                                </h3>
                            </div>
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${Math.abs(analysisResult.totalVariance) < 0.1 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                <span className="material-symbols-outlined text-2xl">
                                    {Math.abs(analysisResult.totalVariance) < 0.1 ? 'balance' : 'account_balance'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═══════════════════ SETTINGS DRAWER ═══════════════════ */}
                {showSettings && (
                    <div className="mb-8 p-6 bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/50 dark:border-white/[0.06] shadow-lg animate-fade-in-down">
                        <h3 className="font-bold text-slate-800 dark:text-white mb-5 flex items-center gap-2 text-lg">
                            <span className="material-symbols-outlined text-indigo-500">tune</span>
                            خيارات المطابقة الآلية
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* matchByRef */}
                            <label className="flex items-center gap-4 cursor-pointer p-4 rounded-xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] hover:border-indigo-200 dark:hover:border-indigo-500/20 transition-colors">
                                <div className="relative">
                                    <input type="checkbox" className="peer sr-only" checked={matchSettings.matchByRef} onChange={e => setMatchSettings(p => ({ ...p, matchByRef: e.target.checked }))} />
                                    <div className="w-12 h-7 bg-slate-200 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-sm peer-checked:bg-indigo-500" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 block">مطابقة برقم المرجع</span>
                                    <span className="text-xs text-slate-400">حتى مع اختلاف المبلغ</span>
                                </div>
                            </label>
                            {/* strictDate */}
                            <label className="flex items-center gap-4 cursor-pointer p-4 rounded-xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] hover:border-indigo-200 dark:hover:border-indigo-500/20 transition-colors">
                                <div className="relative">
                                    <input type="checkbox" className="peer sr-only" checked={matchSettings.strictDate} onChange={e => setMatchSettings(p => ({ ...p, strictDate: e.target.checked }))} />
                                    <div className="w-12 h-7 bg-slate-200 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-sm peer-checked:bg-indigo-500" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 block">مطابقة صارمة للتاريخ</span>
                                    <span className="text-xs text-slate-400">يجب تطابق التاريخ تماماً</span>
                                </div>
                            </label>
                            {/* dateRangeDays */}
                            <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05]">
                                <div className="size-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 flex-shrink-0">
                                    <span className="material-symbols-outlined text-lg">date_range</span>
                                </div>
                                <div className="flex-1">
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 block">مطابقة بنطاق تاريخ</span>
                                    <span className="text-xs text-slate-400">السماح بفارق ±N يوم (0 = معطّل)</span>
                                </div>
                                <select
                                    value={matchSettings.dateRangeDays}
                                    onChange={e => setMatchSettings(p => ({ ...p, dateRangeDays: Number(e.target.value) }))}
                                    className="w-20 px-3 py-2 rounded-xl text-sm font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-center"
                                >
                                    <option value={0}>معطّل</option>
                                    <option value={1}>±1</option>
                                    <option value={2}>±2</option>
                                    <option value={3}>±3</option>
                                </select>
                            </div>
                            {/* allowAutoUnlink */}
                            <label className="flex items-center gap-4 cursor-pointer p-4 rounded-xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] hover:border-indigo-200 dark:hover:border-indigo-500/20 transition-colors">
                                <div className="relative">
                                    <input type="checkbox" className="peer sr-only" checked={matchSettings.allowAutoUnlink} onChange={e => setMatchSettings(p => ({ ...p, allowAutoUnlink: e.target.checked }))} />
                                    <div className="w-12 h-7 bg-slate-200 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-sm peer-checked:bg-indigo-500" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 block">السماح بفك الروابط الآلية</span>
                                    <span className="text-xs text-slate-400">تمكين زر فك الربط على القيود الآلية</span>
                                </div>
                            </label>
                            {/* smartSuggestions */}
                            <label className="flex items-center gap-4 cursor-pointer p-4 rounded-xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] hover:border-indigo-200 dark:hover:border-indigo-500/20 transition-colors">
                                <div className="relative">
                                    <input type="checkbox" className="peer sr-only" checked={matchSettings.smartSuggestions} onChange={e => setMatchSettings(p => ({ ...p, smartSuggestions: e.target.checked }))} />
                                    <div className="w-12 h-7 bg-slate-200 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-sm peer-checked:bg-indigo-500" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 block">اقتراحات ربط ذكية</span>
                                    <span className="text-xs text-slate-400">عرض مقترحات للربط عند عرض القيود</span>
                                </div>
                            </label>
                            {/* detectDuplicates */}
                            <label className="flex items-center gap-4 cursor-pointer p-4 rounded-xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] hover:border-indigo-200 dark:hover:border-indigo-500/20 transition-colors">
                                <div className="relative">
                                    <input type="checkbox" className="peer sr-only" checked={matchSettings.detectDuplicates} onChange={e => setMatchSettings(p => ({ ...p, detectDuplicates: e.target.checked }))} />
                                    <div className="w-12 h-7 bg-slate-200 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-sm peer-checked:bg-indigo-500" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 block">كشف التكرارات</span>
                                    <span className="text-xs text-slate-400">تنبيه عند وجود قيود مكررة محتملة</span>
                                </div>
                            </label>
                            {/* bookletRange */}
                            <label className="flex items-center gap-4 cursor-pointer p-4 rounded-xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] hover:border-indigo-200 dark:hover:border-indigo-500/20 transition-colors">
                                <div className="relative">
                                    <input type="checkbox" className="peer sr-only" checked={matchSettings.bookletRange} onChange={e => setMatchSettings(p => ({ ...p, bookletRange: e.target.checked }))} />
                                    <div className="w-12 h-7 bg-slate-200 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-sm peer-checked:bg-indigo-500" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 block">مطابقة نطاق دفتر الفواتير</span>
                                    <span className="text-xs text-slate-400">تنبيه إذا كانت فواتير الفارق من نفس دفتر الكابتن</span>
                                </div>
                            </label>
                        </div>
                    </div>
                )}

                {/* ═══════════════════ LINK MANAGER MODAL ═══════════════════ */}
                {showLinkManager && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
                        <div className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200/50 dark:border-white/10">
                            <div className="p-5 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-gradient-to-l from-violet-50 to-white dark:from-violet-950/20 dark:to-[#1e293b]">
                                <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-violet-500">link</span>
                                    إدارة الروابط
                                </h3>
                                <button onClick={() => setShowLinkManager(false)} className="size-9 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 flex items-center justify-center transition-colors">
                                    <span className="material-symbols-outlined text-lg">close</span>
                                </button>
                            </div>
                            <div className="overflow-y-auto p-0 flex-1">
                                {allLinksList.length === 0 ? (
                                    <div className="p-10 text-center text-slate-500 flex flex-col items-center gap-4">
                                        <span className="material-symbols-outlined text-5xl opacity-20">link_off</span>
                                        <p>لا توجد روابط حالياً. استخدم جدول "تفاصيل القيود" لإنشاء روابط جديدة.</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-right border-collapse">
                                        <thead className="bg-slate-50 dark:bg-[#0f172a] sticky top-0 border-b border-[#e2e8f0] dark:border-[#334155] z-10">
                                            <tr>
                                                <th className="p-4 text-xs font-bold text-slate-500">طرف الشركة</th>
                                                <th className="p-4 text-xs font-bold text-slate-500">طرف المطعم</th>
                                                <th className="p-4 text-xs font-bold text-slate-500 text-center">الإجراء / النوع</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                                            {allLinksList.map((item) => (
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
                                                        {item.isManual ? (
                                                            <div className="flex flex-col items-center gap-2">
                                                                <div className="text-[11px] bg-blue-50 text-blue-600 px-2 py-1.5 rounded-lg border border-blue-200 font-bold inline-block">
                                                                    يدوي
                                                                </div>
                                                                <button onClick={() => handleUnlink(item.c.id)} className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-100 font-bold transition-colors">
                                                                    فك الربط
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col items-center gap-2">
                                                                <div className="text-[11px] bg-green-50 text-green-600 px-2 py-1.5 rounded-lg border border-green-200 font-bold inline-block">
                                                                    {item.reason}
                                                                </div>
                                                                <button onClick={() => handleUnlink(item.c.id)} className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-100 font-bold transition-colors">
                                                                    فك الربط
                                                                </button>
                                                            </div>
                                                        )}
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

                {/* ═══════════════════ TABBED CONTENT ═══════════════════ */}
                <div className="bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl rounded-3xl border border-white/50 dark:border-white/[0.06] shadow-xl shadow-slate-200/30 dark:shadow-black/30 overflow-hidden">

                    {/* Tab Navigation */}
                    <div className="flex items-center border-b border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02] px-2 pt-2 gap-1 overflow-x-auto">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-5 py-3.5 rounded-t-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.id
                                    ? 'bg-white dark:bg-[#1e293b] text-indigo-600 dark:text-indigo-400 shadow-sm border border-b-0 border-slate-200/50 dark:border-white/10 -mb-[1px]'
                                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-white/[0.03]'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                                {tab.label}
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${activeTab === tab.id
                                    ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                                    }`}>
                                    {tab.count}
                                </span>
                            </button>
                        ))}

                        {/* Search integrated into tab bar */}
                        <div className="flex-1 flex justify-end pr-2">
                            <div className="relative max-w-[280px] w-full">
                                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600 text-lg">search</span>
                                <input
                                    value={filterText}
                                    onChange={(e) => setFilterText(e.target.value)}
                                    className="w-full pr-10 pl-4 py-2.5 bg-white/80 dark:bg-white/[0.03] border border-slate-200/50 dark:border-white/[0.06] rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 text-xs placeholder:text-slate-300 dark:placeholder:text-slate-600 text-slate-900 dark:text-white transition-all"
                                    placeholder="بحث شامل..."
                                    type="text"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Tab Content */}
                    <div className="p-0">

                        {/* ──── TAB 1: Daily Summary ──── */}
                        {activeTab === 'summary' && (
                            <div className="animate-fade-in">
                                <div className="overflow-x-auto max-h-[500px]">
                                    <table className="w-full text-right border-collapse">
                                        <thead className="sticky top-0 bg-slate-50/90 dark:bg-[#0f172a]/90 backdrop-blur-sm z-10">
                                            <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                                                <Th>التاريخ</Th>
                                                <Th>إجمالي الشركة</Th>
                                                <Th>إجمالي المطعم</Th>
                                                <Th>فارق الشركة</Th>
                                                <Th>فارق المطعم</Th>
                                                <Th>صافي الفرق</Th>
                                                <Th className="text-center">النتيجة</Th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-white/[0.03]">
                                            {analysisResult.summary.map((row, idx) => (
                                                <Tr key={idx}>
                                                    <TdSemibold>{row.date}</TdSemibold>
                                                    <TdMono>{row.cTotal.toLocaleString()} {currency}</TdMono>
                                                    <TdMono>{row.rTotal.toLocaleString()} {currency}</TdMono>
                                                    <td className="px-6 py-4 text-sm font-mono font-bold" style={{ color: row.companyVariance > 0 ? COLORS.positive : COLORS.matched }}>
                                                        {row.companyVariance > 0 ? `+${row.companyVariance.toLocaleString()}` : row.companyVariance.toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm font-mono font-bold" style={{ color: row.restaurantVariance > 0 ? COLORS.negative : COLORS.matched }}>
                                                        {row.restaurantVariance > 0 ? `-${row.restaurantVariance.toLocaleString()}` : row.restaurantVariance.toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm font-mono font-bold" style={{ color: Math.abs(row.netVariance) < 0.1 ? COLORS.matched : (row.netVariance > 0 ? COLORS.positive : COLORS.negative) }}>
                                                        {row.netVariance.toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex justify-center">
                                                            {Math.abs(row.variance) < 0.1 && row.companyVariance === 0 && row.restaurantVariance === 0 ?
                                                                <Badge variant="success">مطابق</Badge> :
                                                                <Badge variant="warning">فارق</Badge>
                                                            }
                                                        </div>
                                                    </td>
                                                </Tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="sticky bottom-0 bg-gradient-to-t from-white to-white/95 dark:from-[#0f172a] dark:to-[#0f172a]/95 z-10 border-t-2 border-indigo-100 dark:border-indigo-500/20">
                                            {(() => {
                                                const totalCompanyVar = analysisResult.summary.reduce((a: number, r: any) => a + r.companyVariance, 0);
                                                const totalRestaurantVar = analysisResult.summary.reduce((a: number, r: any) => a + r.restaurantVariance, 0);
                                                const totalNetVar = totalCompanyVar - totalRestaurantVar;
                                                return (
                                                    <tr>
                                                        <td className="px-6 py-5 text-base font-black text-slate-900 dark:text-white">الإجمالي الكلي</td>
                                                        <td className="px-6 py-5 text-base font-bold font-mono text-indigo-600 dark:text-indigo-400">{analysisResult.grandTotalC.toLocaleString()} {currency}</td>
                                                        <td className="px-6 py-5 text-base font-bold font-mono text-indigo-600 dark:text-indigo-400">{analysisResult.grandTotalR.toLocaleString()} {currency}</td>
                                                        <td className="px-6 py-5 text-base font-black font-mono" style={{ color: totalCompanyVar > 0 ? COLORS.positive : COLORS.matched }}>
                                                            {totalCompanyVar > 0 ? `+${totalCompanyVar.toLocaleString()}` : totalCompanyVar.toLocaleString()} {currency}
                                                        </td>
                                                        <td className="px-6 py-5 text-base font-black font-mono" style={{ color: totalRestaurantVar > 0 ? COLORS.negative : COLORS.matched }}>
                                                            {totalRestaurantVar > 0 ? `-${totalRestaurantVar.toLocaleString()}` : totalRestaurantVar.toLocaleString()} {currency}
                                                        </td>
                                                        <td className="px-6 py-5 text-base font-black font-mono" style={{ color: Math.abs(totalNetVar) < 0.1 ? COLORS.matched : (totalNetVar > 0 ? COLORS.positive : COLORS.negative) }}>
                                                            {totalNetVar.toLocaleString()} {currency}
                                                        </td>
                                                        <td className="px-6 py-5 text-center">
                                                            {Math.abs(analysisResult.totalVariance) < 0.1 ?
                                                                <span className="text-xs font-bold text-white px-4 py-1.5 rounded-full bg-gradient-to-l from-emerald-500 to-emerald-600 shadow-sm">تطابق تام</span> :
                                                                <span className="text-xs font-bold text-white px-4 py-1.5 rounded-full bg-gradient-to-l from-red-500 to-red-600 shadow-sm">يوجد فروقات</span>
                                                            }
                                                        </td>
                                                    </tr>
                                                );
                                            })()}
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ──── TAB 2: Entry Details ──── */}
                        {activeTab === 'details' && (
                            <div className="animate-fade-in">
                                {/* Booklet Alerts */}
                                {matchSettings.bookletRange && analysisResult.bookletAlerts.length > 0 && (
                                    <div className="m-4 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="material-symbols-outlined text-amber-500">auto_stories</span>
                                            <span className="text-sm font-black text-amber-700 dark:text-amber-400">تنبيهات نطاق الدفتر ({analysisResult.bookletAlerts.length})</span>
                                        </div>
                                        <div className="space-y-2 max-h-[150px] overflow-y-auto">
                                            {analysisResult.bookletAlerts.map((alert: any, i: number) => (
                                                <div key={i} className="flex items-center gap-2 text-xs bg-white/60 dark:bg-white/5 px-3 py-2 rounded-xl">
                                                    <span className="text-amber-500 font-bold">⚡</span>
                                                    <span className="text-slate-700 dark:text-slate-300">
                                                        الفاتورتان <span className="font-bold font-mono text-indigo-600">{alert.cRef}</span> و <span className="font-bold font-mono text-violet-600">{alert.rRef}</span> من نفس دفتر الكابتن
                                                        <span className="text-slate-400"> ({alert.bookletStart}–{alert.bookletEnd})</span>
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {/* Filter chips */}
                                <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-50 dark:border-white/[0.03]">
                                    <span className="text-xs font-bold text-slate-400 ml-2">تصفية:</span>
                                    {[
                                        { value: 'all', label: 'الكل', icon: 'apps' },
                                        { value: 'unmatched_only', label: 'غير متطابق', icon: 'close' },
                                        { value: 'matched_variance', label: 'بفارق', icon: 'link' },
                                    ].map(f => (
                                        <button
                                            key={f.value}
                                            onClick={() => setUnmatchedFilter(f.value as any)}
                                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all ${unmatchedFilter === f.value
                                                ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                                                : 'bg-slate-100/80 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-white/[0.06]'
                                                }`}
                                        >
                                            <span className="material-symbols-outlined text-sm">{f.icon}</span>
                                            {f.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Bulk Action Bar (6.1) */}
                                {selectedItems.size > 0 && (
                                    <div className="flex items-center gap-3 px-6 py-3 bg-indigo-50 dark:bg-indigo-500/10 border-b border-indigo-100 dark:border-indigo-500/20 animate-fade-in">
                                        <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">تم تحديد {selectedItems.size}</span>
                                        <button onClick={handleBulkDismiss} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-slate-500/10 text-slate-600 hover:bg-slate-500/20 transition-all active:scale-95">
                                            <span className="material-symbols-outlined text-sm">visibility_off</span>
                                            تصفير المحدد
                                        </button>
                                        <button onClick={() => setSelectedItems(new Set())} className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors">
                                            إلغاء التحديد
                                        </button>
                                    </div>
                                )}

                                <div className="overflow-x-auto">
                                    <table className="w-full text-right border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/80 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06]">
                                                <Th className="w-[40px] text-center print:hidden">
                                                    <input type="checkbox" checked={selectedItems.size === filteredItems.length && filteredItems.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded accent-indigo-500 cursor-pointer" />
                                                </Th>
                                                <SortableTh label="التاريخ" field="date" currentSort={sortField} sortOrder={sortOrder} onSort={toggleSort} />
                                                <SortableTh label="المرجع والمصدر" field="ref" currentSort={sortField} sortOrder={sortOrder} onSort={toggleSort} />
                                                <SortableTh label="المبلغ" field="amount" currentSort={sortField} sortOrder={sortOrder} onSort={toggleSort} />
                                                <Th className="text-center w-[300px]">إجراءات</Th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-white/[0.03]">
                                            {filteredItems.length === 0 && (
                                                <tr><td colSpan={5} className="p-12 text-center text-slate-400">
                                                    <div className="flex flex-col items-center gap-3">
                                                        <span className="material-symbols-outlined text-4xl opacity-20">check_circle</span>
                                                        <span className="font-bold">ممتاز! لا توجد قيود لعرضها.</span>
                                                    </div>
                                                </td></tr>
                                            )}
                                            {filteredItems.slice(0, visibleLimit).map((item) => {
                                                if (item.kind === 'linked_variance') {
                                                    const rowId = `link-${item.cTxn.id}-${item.rTxn.id}`;
                                                    const isExpanded = expandedRow === rowId;
                                                    return (
                                                        <React.Fragment key={rowId}>
                                                            <tr className="bg-violet-50/30 dark:bg-violet-900/5 hover:bg-violet-50/60 dark:hover:bg-violet-900/10 transition-colors border-l-4 border-l-violet-400 cursor-pointer" onClick={() => toggleExpand(rowId)}>
                                                                <td className="px-2 py-4 text-center print:hidden" onClick={e => e.stopPropagation()}>
                                                                    <input type="checkbox" checked={selectedItems.has(rowId)} onChange={() => toggleSelect(rowId)} className="w-4 h-4 rounded accent-indigo-500 cursor-pointer" />
                                                                </td>
                                                                <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400 font-mono">
                                                                    {item.cTxn.date}
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="flex flex-col gap-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <Badge variant="warning-outline">الشركة: {item.cTxn.ref}</Badge>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <Badge variant="error-outline">المطعم: {item.rTxn.ref}</Badge>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 text-sm font-mono font-bold text-slate-800 dark:text-slate-200">
                                                                    <div className="flex flex-col gap-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-xs text-slate-400">{item.cTxn.amount} | {item.rTxn.amount}</span>
                                                                            <button className="size-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                                                                                <span className="material-symbols-outlined text-[14px]">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                                                                            </button>
                                                                        </div>
                                                                        <span className="font-black dir-ltr flex items-center justify-end gap-2" style={{ color: item.variance < 0 ? COLORS.negative : COLORS.positive }}>
                                                                            <span>{item.variance > 0 ? '+' : ''}{item.variance.toLocaleString()} {currency}</span>
                                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${item.variance > 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                                                                                {item.variance > 0 ? 'لصالح الشركة' : 'لصالح المطعم'}
                                                                            </span>
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 text-center">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleUnlink(item.cTxn.id); }}
                                                                        className="text-xs text-red-500 hover:text-white hover:bg-red-500 font-bold px-4 py-2 rounded-full border border-red-200 hover:border-red-500 transition-all"
                                                                    >
                                                                        فك الربط
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                            {isExpanded && (
                                                                <tr className="bg-violet-50/10 dark:bg-violet-900/5">
                                                                    <td colSpan={4} className="px-6 py-3">
                                                                        <div className="flex items-center justify-center gap-4 text-sm font-mono bg-white dark:bg-[#1e293b] p-3 rounded-xl border border-violet-100 dark:border-violet-900/30 shadow-sm">
                                                                            <span className="text-slate-500">تفاصيل:</span>
                                                                            <span className="font-bold text-indigo-600">الشركة ({item.cTxn.amount})</span>
                                                                            <span className="text-slate-300">−</span>
                                                                            <span className="font-bold text-amber-600">المطعم ({item.rTxn.amount})</span>
                                                                            <span className="text-slate-300">=</span>
                                                                            <span className="font-black" style={{ color: item.variance < 0 ? COLORS.negative : COLORS.positive }}>
                                                                                {item.variance.toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                } else {
                                                    const isDismissed = !!(currentData.dismissedItems && currentData.dismissedItems[item.txn.id]);
                                                    const options = item.side === 'company' ? analysisResult.unmatchedRestaurant : analysisResult.unmatchedCompany;
                                                    const datalistId = `list-${item.txn.id}`;
                                                    return (
                                                        <React.Fragment key={item.txn.id}>
                                                            <tr className={`hover:bg-red-50/30 dark:hover:bg-red-900/5 transition-colors ${isDismissed ? 'opacity-50' : ''}`}>
                                                                <td className="px-2 py-4 text-center print:hidden">
                                                                    <input type="checkbox" checked={selectedItems.has(item.txn.id)} onChange={() => toggleSelect(item.txn.id)} className="w-4 h-4 rounded accent-indigo-500 cursor-pointer" />
                                                                </td>
                                                                <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400 font-mono">
                                                                    {item.txn.date}
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="flex flex-row items-center gap-2">
                                                                        {item.side === 'company' ?
                                                                            <Badge variant="warning-outline">سجل شركة</Badge> :
                                                                            <Badge variant="error-outline">سجل مطعم</Badge>
                                                                        }
                                                                        <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">{item.txn.ref}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 text-sm font-mono font-bold text-slate-800 dark:text-slate-200">
                                                                    <div className="flex flex-col gap-1">
                                                                        <span className="font-black dir-ltr flex items-center justify-end gap-2" style={{ color: item.side === 'company' ? COLORS.positive : COLORS.negative }}>
                                                                            <span>{item.side === 'company' ? '+' : '-'}{item.txn.amount.toLocaleString()} {currency}</span>
                                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${item.side === 'company' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                                                                                {item.side === 'company' ? 'لصالح الشركة' : 'لصالح المطعم'}
                                                                            </span>
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 text-center">
                                                                    {isDismissed ? (
                                                                        <div className="flex flex-col items-center gap-1">
                                                                            <span className="text-[10px] bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 px-2 py-1 rounded-full border border-slate-200 dark:border-slate-600 font-bold">
                                                                                تم التصفير
                                                                            </span>
                                                                            <span className="text-[9px] text-slate-400 max-w-[120px] truncate" title={currentData.dismissedItems?.[item.txn.id]}>
                                                                                {currentData.dismissedItems?.[item.txn.id]}
                                                                            </span>
                                                                            <button
                                                                                onClick={() => handleUndoDismiss(item.txn.id)}
                                                                                className="text-[10px] text-indigo-500 hover:underline font-bold"
                                                                            >
                                                                                إلغاء التصفير
                                                                            </button>
                                                                        </div>
                                                                    ) : activeLinkRow === item.txn.id ? (
                                                                        <div className="relative flex items-center gap-1 animate-fade-in justify-center">
                                                                            <input
                                                                                autoFocus
                                                                                list={datalistId}
                                                                                placeholder="بحث..."
                                                                                className="w-36 px-3 py-2 text-xs rounded-full border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-[#0f172a] focus:ring-2 focus:ring-indigo-500/30 text-center font-mono placeholder:text-slate-400"
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
                                                                            <button onClick={() => setActiveLinkRow(null)} className="text-red-500 hover:bg-red-50 p-1 rounded-full transition-colors"><span className="material-symbols-outlined text-lg">close</span></button>
                                                                            <datalist id={datalistId}>
                                                                                {options.map(opt => (
                                                                                    <option key={opt.id} value={`${opt.ref} | ${opt.amount} | ${opt.date}`} />
                                                                                ))}
                                                                            </datalist>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex items-center gap-2 justify-center flex-wrap">
                                                                            {/* Note icon (6.2) */}
                                                                            <button
                                                                                onClick={() => { setNoteEditItem(noteEditItem === item.txn.id ? null : item.txn.id); setNoteText(getEntryNote(item.txn.id)); }}
                                                                                className={`flex items-center gap-0.5 text-xs rounded-full px-2 py-1 transition-all ${getEntryNote(item.txn.id) ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-400' : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10'
                                                                                    }`}
                                                                                title={getEntryNote(item.txn.id) || 'إضافة ملاحظة'}
                                                                            >
                                                                                <span className="material-symbols-outlined text-sm">{getEntryNote(item.txn.id) ? 'sticky_note_2' : 'add_comment'}</span>
                                                                            </button>
                                                                            <button
                                                                                onClick={() => setActiveLinkRow(item.txn.id)}
                                                                                className="flex items-center justify-center gap-1.5 text-xs font-bold text-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20 px-4 py-2 rounded-full transition-all"
                                                                            >
                                                                                <span className="material-symbols-outlined text-sm">link</span>
                                                                                ربط يدوي
                                                                            </button>
                                                                            <button
                                                                                onClick={() => setDismissModalItem({ id: item.txn.id, side: item.side })}
                                                                                className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 px-3 py-2 rounded-full transition-all"
                                                                            >
                                                                                <span className="material-symbols-outlined text-sm">visibility_off</span>
                                                                                تصفير
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                            {/* Note editor row (6.2) */}
                                                            {
                                                                noteEditItem === item.txn.id && (
                                                                    <tr className="bg-yellow-50/50 dark:bg-yellow-500/5">
                                                                        <td colSpan={5} className="px-6 py-3">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="material-symbols-outlined text-yellow-500 text-sm">edit_note</span>
                                                                                <input
                                                                                    autoFocus
                                                                                    value={noteText}
                                                                                    onChange={e => setNoteText(e.target.value)}
                                                                                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-yellow-200 dark:border-yellow-500/20 bg-white dark:bg-[#0f172a] focus:ring-2 focus:ring-yellow-500/30 text-right"
                                                                                    placeholder="اكتب ملاحظتك هنا..."
                                                                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveNote(item.txn.id, noteText); if (e.key === 'Escape') setNoteEditItem(null); }}
                                                                                />
                                                                                <button onClick={() => handleSaveNote(item.txn.id, noteText)} className="px-3 py-2 rounded-lg text-xs font-bold bg-yellow-500 text-white hover:bg-yellow-600 transition-all">حفظ</button>
                                                                                <button onClick={() => setNoteEditItem(null)} className="px-3 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-red-500 transition-all">إلغاء</button>
                                                                            </div>
                                                                            {getEntryNote(item.txn.id) && (
                                                                                <div className="mt-1 text-[10px] text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                                                                                    <span className="material-symbols-outlined text-xs">sticky_note_2</span>
                                                                                    {getEntryNote(item.txn.id)}
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                )
                                                            }
                                                        </React.Fragment>
                                                    );
                                                }
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {filteredItems.length > visibleLimit && (
                                    <div className="px-6 py-4 flex items-center justify-between border-t border-slate-50 dark:border-white/[0.03]">
                                        <p className="text-sm font-medium text-slate-400">عرض {visibleLimit} من أصل {filteredItems.length}</p>
                                        <button onClick={() => setVisibleLimit(prev => prev + 10)} className="px-5 py-2 text-sm font-bold text-indigo-600 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200/50 dark:border-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">تحميل المزيد</button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ──── TAB 3: Combined Ledger ──── */}
                        {activeTab === 'ledger' && (
                            <div className="animate-fade-in">
                                {/* Source Filter */}
                                <div className="flex items-center gap-2 p-4 border-b border-slate-50 dark:border-white/[0.03]">
                                    <span className="text-xs font-bold text-slate-400 ml-2">المصدر:</span>
                                    {[
                                        { value: 'all', label: 'الكل' },
                                        { value: 'Company', label: 'الشركة' },
                                        { value: 'Restaurant', label: 'المطعم' },
                                    ].map(f => (
                                        <button
                                            key={f.value}
                                            onClick={() => setLedgerFilter(f.value as any)}
                                            className={`px-3.5 py-2 rounded-full text-xs font-bold transition-all ${ledgerFilter === f.value
                                                ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                                                : 'bg-slate-100/80 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400 hover:bg-slate-200/50'
                                                }`}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="overflow-auto max-h-[600px]">
                                    <table className="w-full text-right border-collapse relative">
                                        <thead className="sticky top-0 bg-slate-50/90 dark:bg-[#0f172a]/90 backdrop-blur-sm z-20 shadow-sm">
                                            <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                                                <Th>رمز المطابقة</Th>
                                                <Th>سبب المطابقة</Th>
                                                <Th>المصدر</Th>
                                                <Th>المرجع</Th>
                                                <Th>التاريخ</Th>
                                                <Th>المبلغ</Th>
                                                <Th>الحالة</Th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-white/[0.03]">
                                            {filteredLedger.map((t, idx) => (
                                                <Tr key={idx}>
                                                    <td className="px-6 py-4 text-xs font-mono text-center">
                                                        {t.matchId ? (
                                                            t.matchId.startsWith('MAN-') ? (
                                                                <span className="bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded-full font-bold text-[10px]">يدوي</span>
                                                            ) : (
                                                                <span className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-full font-bold text-[10px]">تلقائي</span>
                                                            )
                                                        ) : <span className="text-slate-300">-</span>}
                                                    </td>
                                                    <td className="px-6 py-4 text-xs font-medium text-slate-500 dark:text-slate-400">{t.matchReason || '-'}</td>
                                                    <td className="px-6 py-4 text-sm font-bold">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs ${t.source === 'Company' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                                                            {t.source === 'Company' ? 'الشركة' : 'المطعم'}
                                                        </span>
                                                    </td>
                                                    <TdMono>{t.ref}</TdMono>
                                                    <TdMono>{t.date}</TdMono>
                                                    <TdSemibold>{t.amount.toLocaleString()}</TdSemibold>
                                                    <td className="px-6 py-4">
                                                        {t.matched ? (
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-emerald-500 font-bold text-xs flex items-center gap-1">
                                                                    <span className="material-symbols-outlined text-sm">check</span>
                                                                    مطابق
                                                                </span>
                                                                {t.matchReason && (
                                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border w-fit ${t.matchReason.includes('يدوي')
                                                                        ? 'bg-indigo-100 text-indigo-600 border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800'
                                                                        : 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800'
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
                    </div>
                </div>

                {/* ═══════════════════ ACTIVITY LOG ACCORDION ═══════════════════ */}
                <div className="mt-8">
                    <button
                        onClick={() => setShowActivityLog(!showActivityLog)}
                        className="w-full flex items-center justify-between p-4 bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/50 dark:border-white/[0.06] shadow-sm hover:shadow-md transition-all"
                    >
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-violet-500">history</span>
                            <span className="font-bold text-slate-800 dark:text-white">سجل العمليات</span>
                            {actionLogs.length > 0 && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 font-bold">
                                    {actionLogs.length}
                                </span>
                            )}
                        </div>
                        <span className={`material-symbols-outlined text-slate-400 transition-transform ${showActivityLog ? 'rotate-180' : ''}`}>
                            expand_more
                        </span>
                    </button>

                    {showActivityLog && (
                        <div className="mt-2 bg-white/50 dark:bg-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/50 dark:border-white/[0.06] p-4 max-h-[250px] overflow-y-auto animate-fade-in-down">
                            {actionLogs.length === 0 ? (
                                <div className="h-32 flex items-center justify-center text-slate-400 text-sm font-bold">
                                    لا يوجد عمليات مسجلة حتى الآن.
                                </div>
                            ) : (
                                <ul className="space-y-2">
                                    {actionLogs.map((log, i) => (
                                        <li key={i} className="flex flex-wrap items-center gap-2 bg-white/80 dark:bg-white/[0.03] p-3 rounded-xl border border-slate-100/50 dark:border-white/[0.04] animate-fade-in-up">
                                            <span className="text-xs font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">
                                                {log.timestamp}
                                            </span>
                                            <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                                                {log.user}
                                            </span>
                                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                                {log.action}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                {/* ═══════════════════ DISMISS MODAL ═══════════════════ */}
                {dismissModalItem && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
                        <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200/50 dark:border-white/10">
                            <div className="p-5 border-b border-slate-100 dark:border-slate-700/50 bg-gradient-to-l from-slate-50 to-white dark:from-slate-800/50 dark:to-[#1e293b]">
                                <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-slate-500">visibility_off</span>
                                    تصفير القيد
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">سيتم تجاهل هذا القيد من حسابات الفوارق</p>
                            </div>
                            <div className="p-5 space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">ملاحظة (اختياري)</label>
                                    <textarea
                                        value={dismissNote}
                                        onChange={(e) => setDismissNote(e.target.value)}
                                        placeholder="سبب التصفير..."
                                        className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-none"
                                        rows={3}
                                    />
                                </div>
                                <div className="flex gap-3 justify-end">
                                    <button
                                        onClick={() => { setDismissModalItem(null); setDismissNote(''); }}
                                        className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 rounded-xl transition-colors"
                                    >
                                        إلغاء
                                    </button>
                                    <button
                                        onClick={handleDismiss}
                                        className="px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-l from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 rounded-xl shadow-sm transition-all"
                                    >
                                        تأكيد التصفير
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <footer className="mt-16 py-8 text-center">
                    <p className="text-slate-300 dark:text-slate-700 text-xs font-medium">© 2024 نظام المطابقة المالي المتقدم</p>
                </footer>
            </div>

        </div >
    );
};

// ═══════════════════ HELPER COMPONENTS ═══════════════════

const Th = ({ children, className = '' }: any) => (
    <th className={`px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider ${className}`}>
        {children}
    </th>
);

const SortableTh = ({ label, field, currentSort, sortOrder, onSort }: any) => (
    <th
        onClick={() => onSort(field)}
        className="px-6 py-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 dark:hover:bg-white/[0.03] transition-colors select-none group"
    >
        <div className="flex items-center gap-1">
            {label}
            <span className={`material-symbols-outlined text-sm transition-opacity ${currentSort === field ? 'opacity-100 text-indigo-500' : 'opacity-20 group-hover:opacity-50'}`}>
                {currentSort === field && sortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'}
            </span>
        </div>
    </th>
);

const Tr = ({ children }: any) => (
    <tr className="group hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
        {children}
    </tr>
);

const TdSemibold = ({ children }: any) => (
    <td className="px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-200">{children}</td>
);

const TdMono = ({ children }: any) => (
    <td className="px-6 py-4 text-sm font-mono text-slate-500 dark:text-slate-400">{children}</td>
);

const Badge = ({ variant, children }: any) => {
    const styles: any = {
        success: 'bg-emerald-100/80 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/20',
        warning: 'bg-amber-100/80 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200/50 dark:border-amber-500/20',
        'warning-outline': 'bg-amber-50/80 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200/50 dark:border-amber-500/20 text-[10px] uppercase tracking-wider',
        'error-outline': 'bg-red-50/80 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200/50 dark:border-red-500/20 text-[10px] uppercase tracking-wider',
        'purple': 'bg-violet-100/80 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-200/50 dark:border-violet-500/20',
    };
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${styles[variant]}`}>
            {children}
        </span>
    );
};

export default AnalysisPage;
