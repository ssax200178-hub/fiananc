import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import type { Restaurant } from '../AppContext';
import { parseNumber, safeCompare, safeSessionGet, safeSessionSet, cleanPayload } from '../utils';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { generateBranchPDFBlob, generateAndDownloadArchiveZip, generateGroupedPDF } from '../utils/exportUtils';
import { confirmDialog } from '../utils/confirm';

const ARABIC_MONTHS = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

function getPaymentDateOptions(): { label: string; value: string }[] {
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-based
    const currentYear = now.getFullYear();
    const options: { label: string; value: string }[] = [];

    // Generate options for current month and surrounding months
    for (let offset = -1; offset <= 1; offset++) {
        const m = (currentMonth + offset + 12) % 12;
        const monthName = ARABIC_MONTHS[m];
        options.push(
            { label: `${monthName} 1`, value: `${monthName}_1` },
            { label: `${monthName} 2`, value: `${monthName}_2` }
        );
    }
    return options;
}

function getDefaultPaymentDate(): string {
    const now = new Date();
    const day = now.getDate();
    const currentMonth = now.getMonth();
    const monthName = ARABIC_MONTHS[currentMonth];

    // Day 1-15 → "[Previous Month] 2" (second payment of previous month)
    // Day 16-31 → "[Current Month] 1" (first payment of current month)
    if (day >= 16) {
        return `${monthName}_1`;
    } else {
        const prevMonth = (currentMonth - 1 + 12) % 12;
        return `${ARABIC_MONTHS[prevMonth]}_2`;
    }
}

const RestaurantPaymentsPage: React.FC = () => {
    const { restaurants, updateRestaurant, currentUser, systemBalances, syncMetadata } = useAppContext();

    const [searchTerm, setSearchTerm] = useState(safeSessionGet('payments_searchTerm', ''));
    const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
    const [selectedBranch, setSelectedBranch] = useState(safeSessionGet('payments_selectedBranch', 'الكل'));
    const [selectedPaymentPeriod, setSelectedPaymentPeriod] = useState(safeSessionGet('payments_selectedPaymentPeriod', 'الكل'));
    const [sortBy, setSortBy] = useState<'name' | 'branch' | 'balance' | 'accountType'>(safeSessionGet('payments_sortBy', 'branch'));
    const [isMatchingModalOpen, setIsMatchingModalOpen] = useState(false);
    const [matchingText, setMatchingText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);
    const [minBalance, setMinBalance] = useState<string>('');
    const [showInactive, setShowInactive] = useState(false);
    const [autoExtractedData, setAutoExtractedData] = useState<string | null>(null);
    const [selectedPaymentDate, setSelectedPaymentDate] = useState(getDefaultPaymentDate);
    const paymentDateOptions = useMemo(() => getPaymentDateOptions(), []);
    const paymentDateLabel = paymentDateOptions.find(o => o.value === selectedPaymentDate)?.label || selectedPaymentDate.replace('_', ' ');

    const [itemsPerPage, setItemsPerPage] = useState<number>(50);
    const [branchPages, setBranchPages] = useState<Record<string, number>>({});

    // Export Modal State
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isExportingAll, setIsExportingAll] = useState(false);
    const [exportFormat, setExportFormat] = useState<'excel' | 'pdf'>('excel');
    const [isSpecificExport, setIsSpecificExport] = useState(false);
    const [exportSortBy, setExportSortBy] = useState<'branch' | 'type'>('branch');
    const [selectedExportBranches, setSelectedExportBranches] = useState<string[]>([]);

    const getBranchPage = useCallback((branch: string) => branchPages[branch] || 1, [branchPages]);
    const setBranchPage = useCallback((branch: string, page: number) => {
        setBranchPages(prev => ({ ...prev, [branch]: page }));
    }, []);
    // Reset pages when items per page changes
    const handleItemsPerPageChange = useCallback((val: number) => {
        setItemsPerPage(val);
        setBranchPages({});
    }, []);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 300);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    // Integrated Listener for Bookmarklet
    React.useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // In production, we should check event.origin for security
            if (event.data && typeof event.data === 'string' && event.data.includes('\t')) {
                setMatchingText(event.data);
                // Automatically open modal if it was data from our bookmarklet
                setIsMatchingModalOpen(true);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const branches = ['الكل', ...Array.from(new Set(restaurants.map(r => r.branch)))];

    const sortedAndFilteredRestaurants = useMemo(() => {
        return restaurants
            .filter(r => {
                const s = debouncedSearch.toLowerCase();
                const matchesSearch = s === '' || [
                    r.name,
                    r.restaurantAccountNumber,
                    r.branch,
                    r.phone,
                    r.ownerName,
                    ...(r.transferAccounts || []).map(a => `${a.type} ${a.beneficiaryName} ${a.accountNumber}`)
                ].some(val => val && val.toString().toLowerCase().includes(s));

                const matchesBranch = selectedBranch === 'الكل' || r.branch === selectedBranch;
                const matchesPeriod = selectedPaymentPeriod === 'الكل' || r.paymentPeriod === selectedPaymentPeriod;
                const matchesBalance = minBalance === '' || (r.balance || 0) >= parseFloat(minBalance);
                const matchesActive = showInactive || r.isActive !== false;

                return matchesSearch && matchesBranch && matchesPeriod && matchesBalance && matchesActive;
            })
            .sort((a, b) => {
                if (sortBy === 'branch') {
                    const branchAlpha = safeCompare(a.branch, b.branch);
                    if (branchAlpha !== 0) return branchAlpha;
                    const currencyCompare = safeCompare(a.currencyType, b.currencyType);
                    if (currencyCompare !== 0) return currencyCompare;
                    return safeCompare(a.name, b.name);
                }
                if (sortBy === 'accountType') {
                    const typeA = (a.transferAccounts?.find(acc => acc.isPrimary)?.type || a.transferAccounts?.[0]?.type || '').toString();
                    const typeB = (b.transferAccounts?.find(acc => acc.isPrimary)?.type || b.transferAccounts?.[0]?.type || '').toString();
                    const typeCompare = safeCompare(typeA, typeB);
                    if (typeCompare !== 0) return typeCompare;
                    return safeCompare(a.name, b.name);
                }
                if (sortBy === 'balance') return (b.balance || 0) - (a.balance || 0);
                return safeCompare(a.name, b.name);
            });
    }, [restaurants, debouncedSearch, selectedBranch, selectedPaymentPeriod, sortBy, minBalance, showInactive]);

    const groupedByBranch = useMemo(() => {
        const groups: Record<string, Restaurant[]> = {};
        sortedAndFilteredRestaurants.forEach(r => {
            if (!groups[r.branch]) groups[r.branch] = [];
            groups[r.branch].push(r);
        });
        return groups;
    }, [sortedAndFilteredRestaurants]);

    const handleMatchAndImport = async () => {
        if (!matchingText.trim()) return;
        setIsProcessing(true);

        try {
            // Simple parsing logic: looks for numbers that could be IDs and numbers that could be balances
            // User said: "paste the data into a text box... matched based on account numbers"
            // Usually this data looks like: "12345   50,000.00" or similar
            const lines = matchingText.split('\n');
            let matchCount = 0;

            for (const line of lines) {
                if (!line.trim()) continue;

                let potentialId: string;
                let potentialAmount: number;

                if (line.includes('\t')) {
                    // Precise format from our bookmarklet (2 cols) OR Excel (3 cols: ID, Name, Balance)
                    const parts = line.split('\t').filter(p => p.trim() !== '');
                    if (parts.length >= 2) {
                        potentialId = parts[0].trim();
                        // Always take the last valid part as the amount (handles both 2-col and 3-col inputs)
                        potentialAmount = parseNumber(parts[parts.length - 1]);
                    } else {
                        continue;
                    }
                } else {
                    // Fallback for manual copy-paste
                    const parts = line.trim().split(/\s+/);
                    if (parts.length < 2) continue;
                    potentialId = parts[0].replace(/[^0-9]/g, '');
                    potentialAmount = parseNumber(parts[parts.length - 1]);
                }

                if (potentialId && !isNaN(potentialAmount)) {
                    const target = restaurants.find(r => r.restaurantAccountNumber === potentialId);
                    if (target) {
                        await updateRestaurant(target.id, { balance: potentialAmount });
                        matchCount++;
                    }
                }
            }
            alert(`تمت عملية المطابقة بنجاح. تم تحديث ${matchCount} مطعم بالنتائج الجديدة.`);
            setIsMatchingModalOpen(false);
            setMatchingText('');
        } catch (error) {
            console.error("Matching error:", error);
            alert("حدث خطأ أثناء معالجة البيانات. يرجى التأكد من التنسيق.");
        } finally {
            setIsProcessing(false);
        }
    };

    const exportBranchExcel = (branch: string) => {
        const list = groupedByBranch[branch];
        if (!list || list.length === 0) return;

        const data = list.map(r => {
            const primaryAcc = r.transferAccounts?.find(a => a.isPrimary) || r.transferAccounts?.[0];
            return {
                'الفرع': r.branch || '',
                'المطعم': r.name || '',
                'رقم الحساب': r.restaurantAccountNumber || '',
                'العملة': r.currencyType === 'new_riyal' ? 'ريال جديد' : 'ريال قديم',
                'الرصيد': r.balance || 0,
                'اسم المستفيد': primaryAcc?.beneficiaryName || '-',
                'رقم حساب التحويل': primaryAcc?.accountNumber || '-',
                'نوع الحساب': primaryAcc?.type || '-',
                'فترة السداد': r.paymentPeriod === 'semi-monthly' ? 'نصف شهرية' : 'شهرية',
            };
        });

        const ws = XLSX.utils.json_to_sheet(data);
        // Set column widths
        ws['!cols'] = [
            { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 15 },
            { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 12 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, branch);
        XLSX.writeFile(wb, `كشف_سداد_${branch}_${paymentDateLabel}_${new Date().toLocaleDateString('ar-SA')}.xlsx`);
    };

    const exportBranchPDF = (branch: string) => {
        const list = groupedByBranch[branch];
        if (!list || list.length === 0) return;

        const rows = list.map(r => {
            const primaryAcc = r.transferAccounts?.find(a => a.isPrimary) || r.transferAccounts?.[0];
            return `<tr>
                <td>${r.name || ''}</td>
                <td>${r.restaurantAccountNumber || ''}</td>
                <td>${r.currencyType === 'new_riyal' ? 'ريال جديد' : 'ريال قديم'}</td>
                <td style="font-weight:bold">${(r.balance || 0).toLocaleString()}</td>
                <td>${primaryAcc?.beneficiaryName || '-'}</td>
                <td>${primaryAcc?.accountNumber || '-'}</td>
                <td>${primaryAcc?.type || '-'}</td>
                <td>${r.paymentPeriod === 'semi-monthly' ? 'نصف شهرية' : 'شهرية'}</td>
            </tr>`;
        }).join('');

        const totalBalance = list.reduce((sum, r) => sum + (r.balance || 0), 0);

        const html = `<!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>كشف سداد - فرع ${branch}</title>
            <style>
                * { font-family: 'Segoe UI', Tahoma, sans-serif; }
                body { padding: 20px; color: #1e293b; }
                h1 { font-size: 22px; margin-bottom: 5px; }
                h2 { font-size: 13px; color: #64748b; margin-bottom: 15px; }
                table { width: 100%; border-collapse: collapse; }
                th { background: #1e293b; color: white; padding: 8px 6px; font-size: 11px; text-align: right; white-space: nowrap; }
                td { padding: 8px 6px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: right; }
                tr:nth-child(even) { background: #f8fafc; }
                .total-row { font-weight: 900; background: #f1f5f9; font-size: 13px; }
                @media print { body { padding: 10px; } }
                @page { size: landscape; margin: 10mm; }
            </style>
        </head>
        <body>
            <h1>كشف سداد المطاعم - فرع: ${branch}</h1>
            <h2>فترة السداد: ${paymentDateLabel} | تاريخ: ${new Date().toLocaleDateString('ar-SA')} | عدد المطاعم: ${list.length}</h2>
            <table>
                <thead>
                    <tr>
                        <th>المطعم</th>
                        <th>رقم الحساب</th>
                        <th>العملة</th>
                        <th>الرصيد</th>
                        <th>اسم المستفيد</th>
                        <th>رقم حساب التحويل</th>
                        <th>نوع الحساب</th>
                        <th>فترة السداد</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                    <tr class="total-row">
                        <td colspan="3">الإجمالي</td>
                        <td>${totalBalance.toLocaleString()}</td>
                        <td colspan="4"></td>
                    </tr>
                </tbody>
            </table>
        </body>
        </html>`;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.onload = () => {
                printWindow.print();
            };
        }
    };

    const archiveAndExportAll = async () => {
        if (!selectedPaymentDate) {
            alert('الرجاء اختيار تاريخ السداد أولاً');
            return;
        }

        if (!await confirmDialog(`هل أنت متأكد من أرشفة وتصدير جميع كشوفات السداد للفترة "${paymentDateLabel}"؟\nسيتم حفظ لقطة من البيانات وتنزيل ملف ZIP.`, { type: 'warning', confirmText: 'أرشفة وتصدير', cancelText: 'إلغاء' })) {
            return;
        }

        setIsArchiving(true);
        try {
            // 1. Snapshot Data for Archive — uses ALL restaurants, not paginated
            const archiveId = `${selectedPaymentDate}_${new Date().getFullYear()}`;
            const archiveRef = doc(db, 'archives', archiveId);

            const restaurantsToArchive = restaurants.filter(r => {
                const matchesBalance = minBalance === '' || (r.balance || 0) >= parseFloat(minBalance);
                const matchesActive = showInactive || r.isActive !== false;
                return matchesBalance && matchesActive;
            });

            const totalNewRiyal = restaurantsToArchive.reduce((sum, r) => sum + (r.currencyType === 'new_riyal' ? (r.balance || 0) : 0), 0);
            const totalOldRiyal = restaurantsToArchive.reduce((sum, r) => sum + (r.currencyType === 'old_riyal' ? (r.balance || 0) : 0), 0);

            const snapshotBalances = restaurantsToArchive.reduce((acc, r) => {
                acc[r.id] = r.balance || 0;
                return acc;
            }, {} as Record<string, number>);

            const snapshotData = {
                id: archiveId,
                paymentDateLabel,
                paymentDateValue: selectedPaymentDate,
                archivedAt: serverTimestamp(),
                totalAmount: restaurantsToArchive.reduce((sum, r) => sum + (r.balance || 0), 0),
                totalNewRiyal,
                totalOldRiyal,
                snapshotBalances,
                restaurantCount: restaurantsToArchive.length,
                branches: branches.filter(b => b !== 'الكل'),
                restaurants: restaurantsToArchive
            };

            await setDoc(archiveRef, cleanPayload(snapshotData));

            // 2. Generate ZIP — uses ALL restaurants
            const zip = new JSZip();
            const folderName = `كشوفات_${paymentDateLabel.replace(/\s/g, '_')}`;
            const folder = zip.folder(folderName) || zip;

            const groups: { [key: string]: Restaurant[] } = {};
            restaurants.forEach(r => {
                if (!r.branch) return;
                if (!groups[r.branch]) groups[r.branch] = [];
                groups[r.branch].push(r);
            });

            const branchNames = Object.keys(groups);

            const promises = branchNames.map(async (branchName) => {
                const branchRestaurants = groups[branchName];
                const blob = await generateBranchPDFBlob(branchName, branchRestaurants, paymentDateLabel);
                if (blob) {
                    folder.file(`${branchName}_${paymentDateLabel}.pdf`, blob);
                }
            });

            await Promise.all(promises);

            const content = await zip.generateAsync({ type: 'blob' });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `${folderName}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            alert('تمت الأرشفة والتصدير بنجاح!');

        } catch (error) {
            console.error('Archive Error:', error);
            alert('حدث خطأ أثناء الأرشفة: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setIsArchiving(false);
        }
    };

    // ======== EXPORT ALL FUNCTIONS ========
    const exportAllHandler = async () => {
        setIsExportModalOpen(false);
        setIsExportingAll(true);
        try {
            // 1. Filter
            const filtered = restaurants.filter(r => {
                const targetBranches = isSpecificExport ? selectedExportBranches : branches.filter(b => b !== 'الكل');
                if (minBalance !== '' && (r.balance || 0) < parseFloat(minBalance)) return false;
                if (!showInactive && r.isActive === false) return false;
                if (targetBranches.length > 0 && !targetBranches.includes(r.branch)) return false;
                return true;
            });

            if (filtered.length === 0) {
                alert('لا توجد بيانات للتصدير للفروع المحددة');
                return;
            }

            // 2. Sort & Group
            const groups: { name: string; restaurants: Restaurant[]; total: number }[] = [];
            const groupMap: Record<string, Restaurant[]> = {};

            filtered.forEach(r => {
                let key = '';
                if (exportSortBy === 'branch') {
                    key = r.branch || 'غير محدد';
                } else {
                    // Sort by Payment Type (Primary Account Type)
                    const primary = r.transferAccounts?.find(a => a.isPrimary) || r.transferAccounts?.[0];
                    key = primary?.type || 'غير محدد';
                }
                if (!groupMap[key]) groupMap[key] = [];
                groupMap[key].push(r);
            });

            // Sort Groups
            const sortedKeys = Object.keys(groupMap).sort((a, b) => safeCompare(a, b));
            sortedKeys.forEach(key => {
                const list = groupMap[key];
                // Sort inside group by name
                list.sort((a, b) => safeCompare(a.name, b.name));
                const total = list.reduce((sum, r) => sum + (r.balance || 0), 0);
                groups.push({ name: key, restaurants: list, total });
            });

            const grandTotal = groups.reduce((sum, g) => sum + g.total, 0);

            if (exportFormat === 'excel') {
                // Per-Group (Branch/Type) as Zip
                const zip = new JSZip();
                groups.forEach(g => {
                    const wb = XLSX.utils.book_new();
                    // Flatten simple list for per-file
                    const data = g.restaurants.map(r => {
                        const primaryAcc = r.transferAccounts?.find(a => a.isPrimary) || r.transferAccounts?.[0];
                        return {
                            'الفرع': r.branch || '',
                            'المطعم': r.name || '',
                            'رقم الحساب': r.restaurantAccountNumber || '',
                            'العملة': r.currencyType === 'new_riyal' ? 'ريال جديد' : 'ريال قديم',
                            'الرصيد': r.balance || 0,
                            'اسم المستفيد': primaryAcc?.beneficiaryName || '-',
                            'رقم حساب التحويل': primaryAcc?.accountNumber || '-',
                            'نوع الحساب': primaryAcc?.type || '-',
                            'فترة السداد': r.paymentPeriod === 'semi-monthly' ? 'نصف شهرية' : 'شهرية'
                        };
                    });
                    // Append Total Row object
                    data.push({
                        'الفرع': '', 'المطعم': '', 'رقم الحساب': '', 'العملة': 'الإجمالي',
                        'الرصيد': g.total,
                        'اسم المستفيد': '', 'رقم حساب التحويل': '', 'نوع الحساب': '', 'فترة السداد': ''
                    } as any);

                    const ws = XLSX.utils.json_to_sheet(data);
                    XLSX.utils.book_append_sheet(wb, ws, g.name.substring(0, 31));
                    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                    zip.file(`${g.name}_${paymentDateLabel}.xlsx`, wbout);
                });

                const content = await zip.generateAsync({ type: 'blob' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = `كشوفات_اكسل_مجمعة_${paymentDateLabel}.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

            } else {
                // PDF Export
                // Per Group Zip PDF
                const zip = new JSZip();
                const promises = groups.map(async (g) => {
                    const blob = await generateBranchPDFBlob(g.name, g.restaurants, paymentDateLabel, true);
                    if (blob) zip.file(`${g.name}_${paymentDateLabel}.pdf`, blob);
                });

                await Promise.all(promises);
                const content = await zip.generateAsync({ type: 'blob' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = `كشوفات_PDF_مجمعة_${paymentDateLabel}.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

        } catch (error) {
            console.error('Export Error:', error);
            alert('حدث خطأ أثناء التصدير: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setIsExportingAll(false);
        }
    };

    return (
        <div className="p-4 md:p-8 space-y-6 RTL" dir="rtl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-[var(--color-header)]">payments</span>
                        سداد المطاعم
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 font-bold">إدارة مستحقات المطاعم وتحويلاتهم</p>
                </div>

                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={archiveAndExportAll}
                        disabled={isArchiving}
                        className={`px-6 py-3 ${isArchiving ? 'bg-slate-400' : 'bg-indigo-600 hover:bg-indigo-700'} text-white font-black rounded-xl shadow-lg transition-all flex items-center gap-2`}
                    >
                        {isArchiving ? (
                            <span className="material-symbols-outlined animate-spin">refresh</span>
                        ) : (
                            <span className="material-symbols-outlined">archive</span>
                        )}
                        {isArchiving ? 'جاري الأرشفة...' : 'أرشفة وتصدير الكل'}
                    </button>

                    <div>
                        <button
                            onClick={() => {
                                setSelectedExportBranches(branches.filter(b => b !== 'الكل'));
                                setIsExportModalOpen(true);
                            }}
                            disabled={isExportingAll}
                            className={`px-6 py-3 ${isExportingAll ? 'bg-slate-400' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-black rounded-xl shadow-lg transition-all flex items-center gap-2`}
                        >
                            {isExportingAll ? (
                                <span className="material-symbols-outlined animate-spin">refresh</span>
                            ) : (
                                <span className="material-symbols-outlined">download</span>
                            )}
                            {isExportingAll ? 'جاري التصدير...' : 'تصدير مخصص'}
                        </button>
                    </div>

                    <button
                        onClick={() => setIsMatchingModalOpen(true)}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg hover:scale-105 transition-all flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined">upload_file</span>
                        استيراد الأرصدة
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-sm">search</span>
                    <input
                        type="text"
                        placeholder="بحث بالاسم أو ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-4 pr-10 bg-slate-50 dark:bg-slate-700/50 border-2 border-slate-100 dark:border-slate-700/50 rounded-2xl outline-none focus:border-[var(--color-header)] font-bold transition-all"
                    />
                </div>

                <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-sm">payments</span>
                    <input
                        type="number"
                        placeholder="الحد الأدنى للرصيد"
                        value={minBalance}
                        onChange={(e) => setMinBalance(e.target.value)}
                        className="w-full p-4 pr-10 bg-slate-50 dark:bg-slate-700/50 border-2 border-slate-100 dark:border-slate-700/50 rounded-2xl outline-none focus:border-[var(--color-header)] font-bold transition-all"
                    />
                </div>

                <div className="relative flex items-center justify-between px-4 bg-slate-50 dark:bg-slate-700/50 border-2 border-slate-100 dark:border-slate-700/50 rounded-2xl">
                    <span className="text-sm font-black text-slate-500">إظهار غير النشط</span>
                    <button
                        onClick={() => setShowInactive(!showInactive)}
                        className={`w-12 h-6 rounded-full p-1 transition-colors relative ${showInactive ? 'bg-[var(--color-header)]' : 'bg-slate-300'}`}
                    >
                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${showInactive ? '-translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>

                <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-sm">filter_list</span>
                    <select
                        value={selectedBranch}
                        onChange={(e) => {
                            setSelectedBranch(e.target.value);
                            safeSessionSet('payments_selectedBranch', e.target.value);
                        }}
                        className="w-full pr-10 pl-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-none rounded-xl outline-none focus:ring-2 focus:ring-[var(--color-header)] transition-all font-bold text-sm appearance-none"
                    >
                        {branches.map(b => <option key={b} value={b}>{b === 'الكل' ? 'جميع الفروع' : b}</option>)}
                    </select>
                </div>
                <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-sm">event_repeat</span>
                    <select
                        value={selectedPaymentPeriod}
                        onChange={(e) => {
                            setSelectedPaymentPeriod(e.target.value);
                            safeSessionSet('payments_selectedPaymentPeriod', e.target.value);
                        }}
                        className="w-full pr-10 pl-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-none rounded-xl outline-none focus:ring-2 focus:ring-[var(--color-header)] transition-all font-bold text-sm appearance-none"
                    >
                        <option value="الكل">جميع الفترات</option>
                        <option value="monthly">شهرية</option>
                        <option value="semi-monthly">نصف شهرية</option>
                    </select>
                </div>
                <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-sm">calendar_month</span>
                    <select
                        value={selectedPaymentDate}
                        onChange={(e) => setSelectedPaymentDate(e.target.value)}
                        className="w-full pr-10 pl-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-600 rounded-xl outline-none focus:ring-2 focus:ring-amber-400 transition-all font-black text-sm appearance-none text-amber-800 dark:text-amber-300"
                    >
                        {paymentDateOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                </div>
                <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-sm">sort</span>
                    <select
                        value={sortBy}
                        onChange={(e) => {
                            const val = e.target.value as any;
                            setSortBy(val);
                            safeSessionSet('payments_sortBy', val);
                        }}
                        className="w-full pr-10 pl-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-none rounded-xl outline-none focus:ring-2 focus:ring-[var(--color-header)] transition-all font-bold text-sm appearance-none"
                    >
                        <option value="branch">الفرع + العملة</option>
                        <option value="name">الاسم</option>
                        <option value="balance">الرصيد الأعلى</option>
                        <option value="accountType">نوع الحساب</option>
                    </select>
                </div>
            </div>

            {/* Result Count + Items Per Page */}
            <div className="flex items-center justify-between flex-wrap gap-3" >
                <div className="flex items-center gap-3 text-sm font-bold text-slate-500 dark:text-slate-400">
                    <span className="material-symbols-outlined text-lg">info</span>
                    عرض {sortedAndFilteredRestaurants.length} من {restaurants.length} مطعم
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">عدد العرض:</span>
                    {[10, 50, 100, 0].map(val => (
                        <button
                            key={val}
                            onClick={() => handleItemsPerPageChange(val)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${itemsPerPage === val
                                ? 'bg-[var(--color-header)] text-white shadow-md'
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                }`}
                        >
                            {val === 0 ? 'الكل' : val}
                        </button>
                    ))}
                </div>
            </div>

            {/* Groups by Branch */}
            <div className="space-y-12" >
                {(Object.entries(groupedByBranch) as [string, Restaurant[]][]).map(([branch, list]) => {
                    const currentPage = getBranchPage(branch);
                    const effectivePerPage = itemsPerPage === 0 ? list.length : itemsPerPage;
                    const totalPages = Math.ceil(list.length / effectivePerPage);
                    const startIdx = (currentPage - 1) * effectivePerPage;
                    const paginatedList = list.slice(startIdx, startIdx + effectivePerPage);

                    return (
                        <div
                            key={branch}
                            className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden"
                        >
                            {/* Branch Header */}
                            <div className="p-8 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                <div>
                                    <h2 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-4">
                                        <span className="size-14 rounded-2xl bg-[var(--color-header)] text-white flex items-center justify-center">
                                            <span className="material-symbols-outlined text-3xl">location_on</span>
                                        </span>
                                        فرع: {branch}
                                    </h2>
                                    <p className="text-slate-500 font-bold mt-2">إجمالي المطاعم: {list.length} {totalPages > 1 && <span className="text-xs text-slate-400">• صفحة {currentPage} من {totalPages}</span>}</p>
                                </div>
                            </div>

                            {/* List - Table Style but Modern */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-right border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100/50 dark:bg-slate-800/30">
                                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">المطعم</th>
                                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">العملة</th>
                                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">رصيد المطعم</th>
                                            <th className="px-6 py-4 text-xs font-black text-emerald-600 uppercase">
                                                <div className="flex flex-col">
                                                    <span>رصيد النظام (تلقائي)</span>
                                                    {syncMetadata && <span className="text-[9px] opacity-70 font-normal">{new Date(syncMetadata.lastSync).toLocaleDateString('ar-SA')}</span>}
                                                </div>
                                            </th>
                                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">حساب التحويل (الأساسي)</th>
                                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">فترة السداد</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {paginatedList.map(r => {
                                            const primaryAcc = r.transferAccounts?.find(a => a.isPrimary) || r.transferAccounts?.[0];
                                            return (
                                                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                    <td className="px-6 py-5">
                                                        <div>
                                                            <p className="font-black text-slate-800 dark:text-white text-lg">{r.name}</p>
                                                            <p className="text-xs font-bold text-slate-400">#{r.restaurantAccountNumber}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <span className={`px-3 py-1 text-xs font-black rounded-lg ${r.currencyType === 'new_riyal'
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-amber-100 text-amber-700'
                                                            }`}>
                                                            {r.currencyType === 'new_riyal' ? 'ريال جديد' : 'ريال قديم'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <p className="text-xl font-black text-[var(--color-header)]">
                                                            {(r.balance || 0).toLocaleString()}
                                                        </p>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        {(() => {
                                                            const sysAccNum = r.systemAccountNumber || r.restaurantAccountNumber;
                                                            if (!sysAccNum) return <span className="text-[10px] text-slate-400 italic">غير مربوط</span>;
                                                            const matchedBalance = systemBalances.find(sb => sb.accountNumber === sysAccNum && sb.type === 'restaurant');
                                                            if (!matchedBalance) return <span className="text-[10px] text-amber-500 italic">لا توجد بيانات</span>;
                                                            return (
                                                                <p className="text-lg font-black text-emerald-600 dark:text-emerald-400" dir="ltr">
                                                                    {matchedBalance.balance.toLocaleString()}
                                                                </p>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        {primaryAcc ? (
                                                            <div className="space-y-1">
                                                                <p className="text-sm font-black text-slate-800 dark:text-white">{primaryAcc.beneficiaryName}</p>
                                                                <p className="text-lg font-black text-blue-600 dark:text-blue-400 tracking-wider" style={{ fontFamily: 'monospace' }}>
                                                                    {primaryAcc.accountNumber}
                                                                </p>
                                                                <p className="text-[10px] font-black text-slate-400 underline decoration-slate-200">
                                                                    {primaryAcc.type}
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            <p className="text-slate-400 text-sm font-bold">لا يوجد حساب تحويل</p>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <span className={`px-3 py-1 text-xs font-black rounded-lg ${r.paymentPeriod === 'semi-monthly'
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

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="p-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-700 flex items-center justify-center gap-2 flex-wrap">
                                    <button
                                        onClick={() => setBranchPage(branch, currentPage - 1)}
                                        disabled={currentPage === 1}
                                        className="px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                    >
                                        <span className="material-symbols-outlined text-sm">chevron_right</span>
                                        السابق
                                    </button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                                        .map((page, idx, arr) => (
                                            <React.Fragment key={page}>
                                                {idx > 0 && arr[idx - 1] !== page - 1 && (
                                                    <span className="text-slate-400 text-sm">...</span>
                                                )}
                                                <button
                                                    onClick={() => setBranchPage(branch, page)}
                                                    className={`w-10 h-10 rounded-xl font-black text-sm transition-all ${page === currentPage
                                                        ? 'bg-[var(--color-header)] text-white shadow-lg'
                                                        : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'
                                                        }`}
                                                >
                                                    {page}
                                                </button>
                                            </React.Fragment>
                                        ))}
                                    <button
                                        onClick={() => setBranchPage(branch, currentPage + 1)}
                                        disabled={currentPage === totalPages}
                                        className="px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                    >
                                        التالي
                                        <span className="material-symbols-outlined text-sm">chevron_left</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Matching Modal */}
            {
                isMatchingModalOpen && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
                        <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-scale-in" dir="rtl">
                            <div className="p-6 bg-slate-800 text-white flex items-center justify-between">
                                <h2 className="text-2xl font-black flex items-center gap-3">
                                    <span className="material-symbols-outlined">analytics</span>
                                    مطابقة واستخراج الأرصدة
                                </h2>
                                <button onClick={() => setIsMatchingModalOpen(false)} className="hover:rotate-90 transition-transform">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-2xl space-y-3">
                                    <p className="text-amber-800 dark:text-amber-400 text-sm font-bold flex items-center gap-2">
                                        <span className="material-symbols-outlined">extension</span>
                                        طريقة استخدام "إضافة المتصفح" (Tawseel Helper):
                                    </p>
                                    <ol className="text-xs text-amber-900/70 dark:text-amber-400/70 list-decimal mr-5 font-bold space-y-2">
                                        <li>افتح المجلد، وأنشئ ملفاً عادياً باسم <code className="bg-amber-100 px-1 rounded">manifest.json</code> وألصق الكود (1) فيه.</li>
                                        <li>أنشئ ملفاً آخر باسم <code className="bg-amber-100 px-1 rounded">content.js</code> وألصق الكود (2) فيه.</li>
                                        <li>افتح <code className="text-blue-600">chrome://extensions</code>، فعل <span className="text-red-600">Developer Mode</span>، ثم اضغط على <span className="font-black">Load Unpacked</span> واختر المجلد.</li>
                                        <li>افتح صفحة <a href="https://tawseel.app/admin/accounting/market" target="_blank" className="text-blue-600 underline font-black">أرصدة المطاعم في توصيل ون</a>.</li>
                                        <li>ستظهر أيقونة "سحاب البيانات" عائمة في الأسفل؛ اضغط عليها وسيرسل البيانات هنا تلقائياً.</li>
                                    </ol>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-[10px] font-bold text-amber-800">
                                            <span>كود (1): manifest.json</span>
                                            <button onClick={() => {
                                                const code = `{
  "manifest_version": 3,
  "name": "مساعد توصيل ون",
  "version": "1.0",
  "permissions": ["activeTab", "scripting"],
  "content_scripts": [{ 
    "matches": ["https://tawseel.app/*", "https://*.tawseel.app/*"], 
    "js": ["content.js"],
    "all_frames": true
  }]
}`;
                                                navigator.clipboard.writeText(code);
                                                alert('تم نسخ كود manifest.json المطور');
                                            }} className="text-blue-600 hover:underline">نسخ كود manifest المطور</button>
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] font-bold text-amber-800">
                                            <span>كود (2): content.js</span>
                                            <button onClick={() => {
                                                const code = `// مساعد توصيل ون - استخراج الأرصدة المتطور جداً\nfunction scrapeData() {\n  const rows = Array.from(document.querySelectorAll('tr'));\n  if (rows.length === 0) { alert("⚠️ لم يتم العثور على أي صفوف في الصفحة."); return; }\n  const data = rows.map(r => {\n    const cells = Array.from(r.querySelectorAll('td, th'));\n    if (cells.length <6) return null;\n    const id = cells[0].innerText.trim();\n    const balance = cells[5].innerText.replace(/,/g, '').trim();\n    if (!id || id === "رقم الحساب" || isNaN(parseFloat(balance))) return null;\n    return id + '\\t' + balance;\n  }).filter(Boolean).join('\\n');\n  if (data) {\n    if (window.opener) {\n      window.opener.postMessage(data, "*");\n      alert("✅ نجاح: تم استخراج " + data.split('\\n').length + " سجل وإرسالها بنجاح!");\n    } else {\n      const el = document.createElement('textarea');\n      el.value = data; document.body.appendChild(el); el.select();\n      document.execCommand('copy'); document.body.removeChild(el);\n      alert("✅ تم نسخ " + data.split('\\n').length + " سجل للذاكرة!");\n    }\n  } else {\n    alert("❌ لم يتم العثور على أرصدة صالحة. تأكد من ظهور الجدول.");\n  }\n}\n\nfunction initHelper() {\n  if (document.getElementById('tawseel-helper-btn')) return;\n  const target = document.body || document.documentElement;\n  if (!target) return;\n  const btn = document.createElement('button');\n  btn.id = 'tawseel-helper-btn';\n  btn.innerHTML = '🚀 سحب بيانات المطاعم';\n  btn.style.cssText = 'position:fixed;bottom:40px;right:40px;z-index:2147483647 !important;padding:15px 30px;background:#e91e63 !important;color:white !important;border:4px solid white !important;border-radius:50px !important;cursor:pointer;font-weight:900 !important;box-shadow:0 10px 30px rgba(233,30,99,0.6) !important;font-size:18px !important;';\n  btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); scrapeData(); };\n  target.appendChild(btn);\n}\n\nconst obs = new MutationObserver(() => initHelper());\nif (document.body) obs.observe(document.body, { childList: true, subtree: true });\nsetInterval(initHelper, 2000);\ninitHelper();`;
                                                navigator.clipboard.writeText(code);
                                                alert('تم نسخ كود content.js المطور جداً');
                                            }} className="text-blue-600 hover:underline">نسخ الكود المطور جداً</button>
                                        </div>
                                    </div>
                                </div>
                                <textarea
                                    value={matchingText}
                                    onChange={(e) => setMatchingText(e.target.value)}
                                    placeholder="ألصق البيانات هنا..."
                                    className="w-full h-64 p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl outline-none focus:border-[var(--color-header)] font-mono text-sm resize-none"
                                />

                                <div className="flex gap-4">
                                    <button
                                        disabled={isProcessing || !matchingText}
                                        onClick={handleMatchAndImport}
                                        className="flex-1 py-4 bg-[var(--color-header)] text-white font-black rounded-2xl shadow-xl hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isProcessing ? (
                                            <>
                                                <span className="material-symbols-outlined animate-spin">sync</span>
                                                جاري المعالجة...
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined">auto_fix_high</span>
                                                ابدأ المطابقة الآن
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setIsMatchingModalOpen(false)}
                                        className="px-8 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-black rounded-2xl hover:bg-slate-200 transition-all"
                                    >
                                        إلغاء
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Export Modal */}
            {isExportModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-scale-in" dir="rtl">
                        <div className="p-6 bg-emerald-600 text-white flex items-center justify-between">
                            <h2 className="text-xl font-black flex items-center gap-2">
                                <span className="material-symbols-outlined">download</span>
                                تصدير مخصص لكشوفات السداد
                            </h2>
                            <button onClick={() => setIsExportModalOpen(false)} className="hover:rotate-90 transition-transform">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            {/* Format & Scope Selection */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-500">صيغة الملف</label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setExportFormat('pdf')}
                                            className={`flex-1 py-2 text-sm font-black rounded-xl border-2 transition-all ${exportFormat === 'pdf' ? 'bg-red-50 text-red-600 border-red-600' : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700'}`}
                                        >
                                            PDF
                                        </button>
                                        <button
                                            onClick={() => setExportFormat('excel')}
                                            className={`flex-1 py-2 text-sm font-black rounded-xl border-2 transition-all ${exportFormat === 'excel' ? 'bg-emerald-50 text-emerald-600 border-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700'}`}
                                        >
                                            Excel
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2 flex flex-col justify-center">
                                    <label className="text-xs font-black text-slate-500">تصدير محدد الفروع</label>
                                    <div className="flex items-center gap-3 mt-2">
                                        <input
                                            type="checkbox"
                                            id="specific_export_checkbox"
                                            checked={isSpecificExport}
                                            onChange={(e) => setIsSpecificExport(e.target.checked)}
                                            className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500"
                                        />
                                        <label htmlFor="specific_export_checkbox" className="text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                                            تحديد فروع معينة
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-500">ترتيب التصدير الداخلي حسب</label>
                                <select
                                    value={exportSortBy}
                                    onChange={(e) => setExportSortBy(e.target.value as any)}
                                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-emerald-600 font-bold appearance-none"
                                >
                                    <option value="branch">الفرع</option>
                                    <option value="type">نوع الحساب</option>
                                </select>
                            </div>

                            {isSpecificExport && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-black text-slate-500">تحديد الفروع المطلوبة</label>
                                        <button
                                            onClick={() => {
                                                const allActualBranches = branches.filter(b => b !== 'الكل');
                                                setSelectedExportBranches(selectedExportBranches.length === allActualBranches.length ? [] : allActualBranches);
                                            }}
                                            className="text-[10px] font-bold text-emerald-600 hover:underline"
                                        >
                                            تحديد الكل / إلغاء تحديد الكل
                                        </button>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-2 grid grid-cols-2 gap-2">
                                        {branches.filter(b => b !== 'الكل').map(branch => (
                                            <div key={branch} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                                                <input
                                                    type="checkbox"
                                                    id={`export_branch_${branch}`}
                                                    checked={selectedExportBranches.includes(branch)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedExportBranches([...selectedExportBranches, branch]);
                                                        } else {
                                                            setSelectedExportBranches(selectedExportBranches.filter(b => b !== branch));
                                                        }
                                                    }}
                                                    className="rounded text-emerald-600 focus:ring-emerald-500"
                                                />
                                                <label htmlFor={`export_branch_${branch}`} className="text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer flex-1">
                                                    {branch}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 flex gap-3">
                                <button
                                    onClick={exportAllHandler}
                                    disabled={selectedExportBranches.length === 0}
                                    className="flex-1 py-4 bg-emerald-600 text-white font-black rounded-xl shadow-lg hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    بدء التصدير ({selectedExportBranches.length} فرع)
                                </button>
                                <button
                                    onClick={() => setIsExportModalOpen(false)}
                                    className="px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-black rounded-xl hover:bg-slate-200 transition-all"
                                >
                                    إلغاء
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RestaurantPaymentsPage;
