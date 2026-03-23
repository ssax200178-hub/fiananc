import React, { useState, useMemo } from 'react';
import { confirmDialog } from '../utils/confirm';
import { useAppContext, Branch, BranchPhone, PhonePayment, PhoneProvider } from '../AppContext';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

// Use local worker for better reliability in production/test environments
// @ts-ignore - Vite will handle the ?url import correctly
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface ExtractedPayment {
    phoneNumber: string;
    amount: number;
    paymentDate: string;
    refNumber: string;
    description: string;
    provider: string;
    type: 'debit' | 'credit'; // debit = payment, credit = refund
    status: 'pending' | 'duplicate' | 'refunded' | 'unregistered' | 'importing' | 'done' | 'error';
    linkRefId?: string;
    isPackage?: boolean;
    isEditing?: boolean;
}

const PhonePaymentsPage: React.FC = () => {
    const {
        currentUser, branches, employees, addLog,
        phonePayments, addPhonePayment, updatePhonePayment, deletePhonePayment,
        branchPhones, addBranchPhone, updateBranchPhone, deleteBranchPhone,
        phoneProviders, addPhoneProvider, updatePhoneProvider, deletePhoneProvider,
        updateBranch
    } = useAppContext();

    const canManagePayments = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('phone_payments_manage');
    const canManageProviders = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('phone_providers_manage');

    // --- State ---
    const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'branches' | 'details' | 'providers'>('branches');
    const [searchTerm, setSearchTerm] = useState('');
    const [groupByDate, setGroupByDate] = useState(true);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<string>>(new Set());
    const [bookedFilter, setBookedFilter] = useState<'all' | 'booked' | 'unbooked'>('all');
    const [showCreditSettings, setShowCreditSettings] = useState(false);
    const [creditSettings, setCreditSettings] = useState<{
        creditAccountNumber: string;
        creditSubAccountNumber: string;
        creditCostCenter: string;
        creditCostCenterId: string;
    }>({ creditAccountNumber: '', creditSubAccountNumber: '', creditCostCenter: '', creditCostCenterId: '' });


    // --- Detail View State ---
    const [phoneSearchTerm, setPhoneSearchTerm] = useState('');
    const [paymentSearchTerm, setPaymentSearchTerm] = useState('');
    const [isSavedPhonesSidebarOpen, setIsSavedPhonesSidebarOpen] = useState(false);

    // --- Modals State ---
    const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
    const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
    const [phoneFormData, setPhoneFormData] = useState<Partial<BranchPhone>>({});

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
    const [paymentFormData, setPaymentFormData] = useState<Partial<PhonePayment>>({});

    const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
    const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
    const [providerFormData, setProviderFormData] = useState<Partial<PhoneProvider>>({});

    // --- PDF Import State ---
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [extractedData, setExtractedData] = useState<ExtractedPayment[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);

    // --- Computed Data ---
    const activeBranches = useMemo(() => branches.filter(b => b.isActive), [branches]);

    const filteredBranches = useMemo(() => {
        if (!searchTerm) return activeBranches;
        return activeBranches.filter(b => b.name.includes(searchTerm));
    }, [activeBranches, searchTerm]);

    const selectedBranch = useMemo(() => branches.find(b => b.id === selectedBranchId), [branches, selectedBranchId]);

    const branchSavedPhones = useMemo(() => {
        if (!selectedBranchId) return [];
        return branchPhones.filter(p => p.branchId === selectedBranchId);
    }, [branchPhones, selectedBranchId]);

    const branchPaymentHistory = useMemo(() => {
        if (!selectedBranchId) return [];
        let filtered = phonePayments.filter(p => p.branchId === selectedBranchId);
        if (bookedFilter === 'booked') filtered = filtered.filter(p => p.isBooked);
        if (bookedFilter === 'unbooked') filtered = filtered.filter(p => !p.isBooked);
        return filtered;
    }, [phonePayments, selectedBranchId, bookedFilter]);

    // --- Employee Search for Phone Modal ---
    const [searchEmployeeForPhone, setSearchEmployeeForPhone] = useState('');
    const [isEmployeeSearchFocused, setIsEmployeeSearchFocused] = useState(false);

    const employeeResultsForPhone = useMemo(() => {
        const term = searchEmployeeForPhone.trim().toLowerCase();
        return employees
            .filter(e => e.isActive !== false && (
                e.name.toLowerCase().includes(term) ||
                (e.branch && e.branch.toLowerCase().includes(term))
            ))
            .sort((a, b) => {
                const aInBranch = a.branch === selectedBranch?.name;
                const bInBranch = b.branch === selectedBranch?.name;
                if (aInBranch && !bInBranch) return -1;
                if (!aInBranch && bInBranch) return 1;
                return a.name.localeCompare(b.name, 'ar');
            })
            .slice(0, 10);
    }, [employees, searchEmployeeForPhone, selectedBranch]);

    // --- Handlers ---
    const handleSelectBranch = (branchId: string) => {
        setSelectedBranchId(branchId);
        setViewMode('details');
        // Load credit settings from branch
        const branch = branches.find(b => b.id === branchId);
        if (branch) {
            setCreditSettings({
                creditAccountNumber: branch.creditAccountNumber || '',
                creditSubAccountNumber: branch.creditSubAccountNumber || '',
                creditCostCenter: branch.creditCostCenter || '',
                creditCostCenterId: branch.creditCostCenterId || ''
            });
        }
    };

    // --- تصدير قيد يومية محاسبي ---
    const CURRENCY_MAP: Record<string, number> = { 'new_riyal': 7, 'old_riyal': 8 };

    const exportJournalEntry = async () => {
        if (selectedPaymentIds.size === 0) return alert('يرجى تحديد سدادات أولاً');
        if (!creditSettings.creditAccountNumber) {
            setShowCreditSettings(true);
            return alert('يرجى إعداد بيانات الحساب الدائن أولاً (اضغط على ⚙️ إعدادات القيد)');
        }

        const selectedPayments = branchPaymentHistory.filter(p => selectedPaymentIds.has(p.id));
        if (selectedPayments.length === 0) return;

        // Sort by payment date to find period
        const sorted = [...selectedPayments].sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime());
        const firstDate = new Date(sorted[0].paymentDate).toLocaleDateString('ar-SA');
        const lastDate = new Date(sorted[sorted.length - 1].paymentDate).toLocaleDateString('ar-SA');

        // Build debit rows
        const rows: any[][] = [];
        let totalDebit = 0;

        for (const payment of sorted) {
            const linkedPhone = branchSavedPhones.find(
                ph => ph.phoneNumber === payment.phoneNumber || ph.phoneId === payment.phoneId
            );
            const accountNumber = linkedPhone?.phoneId || payment.phoneId || '';
            const currencyId = CURRENCY_MAP[payment.currency] || 7;
            const dateStr = new Date(payment.paymentDate).toLocaleDateString('ar-SA');

            rows.push([
                1,  // رقم القيد (A)
                Number(accountNumber) || accountNumber, // رقم الحساب (B)
                '', // رقم الحساب التحليلي (C)
                payment.amount, // مدين (D)
                '', // دائن (E)
                currencyId, // رقم العملة (F)
                `سداد الرقم ${payment.phoneNumber} مبلغ ${payment.amount.toLocaleString()} بتاريخ ${dateStr}`, // البيان (G)
                '', // مركز التكلفة (H)
                ''  // رقم المرجع (I)
            ]);
            totalDebit += payment.amount;
        }

        // Build credit row
        const currencyId = CURRENCY_MAP[selectedBranch?.currencyType === 'new_rial' ? 'new_riyal' : 'old_riyal'] || 7;
        const periodText = firstDate === lastDate
            ? `عهدة سداد الهواتف بتاريخ ${firstDate}`
            : `عهدة سداد الهواتف للفترة من ${firstDate} إلى ${lastDate}`;
        const costCenterText = creditSettings.creditCostCenter && creditSettings.creditCostCenterId
            ? `${creditSettings.creditCostCenter} - ${creditSettings.creditCostCenterId}`
            : creditSettings.creditCostCenter || '';

        rows.push([
            1,  // رقم القيد (A)
            Number(creditSettings.creditAccountNumber) || creditSettings.creditAccountNumber, // رقم الحساب (B)
            Number(creditSettings.creditSubAccountNumber) || creditSettings.creditSubAccountNumber || '', // رقم الحساب التحليلي (C)
            '', // مدين (D)
            totalDebit, // دائن (E)
            currencyId, // رقم العملة (F)
            periodText, // البيان (G)
            costCenterText, // مركز التكلفة (H)
            ''  // رقم المرجع (I)
        ]);

        // Add totals row
        rows.push([
            '', '', '', totalDebit, totalDebit, '', 'الإجمالي', '', ''
        ]);

        // Build worksheet
        const headers = ['رقم القيد', 'رقم الحساب', 'رقم الحساب التحليلي', 'مدين', 'دائن', 'رقم العملة', 'البيان', 'مركز التكلفة', 'رقم المرجع'];
        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Set column widths
        ws['!cols'] = [
            { wch: 10 },  // رقم القيد
            { wch: 14 },  // رقم الحساب
            { wch: 18 },  // رقم الحساب التحليلي
            { wch: 12 },  // مدين
            { wch: 12 },  // دائن
            { wch: 15 },  // رقم العملة
            { wch: 50 },  // البيان
            { wch: 20 },  // مركز التكلفة
            { wch: 12 }   // رقم المرجع
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'قيد يومية');

        const fileName = `قيد_سداد_هواتف_${selectedBranch?.name || 'فرع'}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);

        // Mark selected payments as booked
        const now = new Date().toISOString();
        for (const payment of selectedPayments) {
            try {
                await updatePhonePayment(payment.id, { isBooked: true, bookedAt: now });
            } catch (err) {
                console.error('Failed to mark payment as booked:', payment.id, err);
            }
        }
        setSelectedPaymentIds(new Set());

        addLog('تصدير قيد يومية', `الفرع: ${selectedBranch?.name} - عدد العمليات: ${selectedPayments.length} - المبلغ: ${totalDebit.toLocaleString()}`, 'general');
    };

    const handleSaveCreditSettings = async () => {
        if (!selectedBranchId) return;
        try {
            await updateBranch(selectedBranchId, {
                creditAccountNumber: creditSettings.creditAccountNumber,
                creditSubAccountNumber: creditSettings.creditSubAccountNumber,
                creditCostCenter: creditSettings.creditCostCenter,
                creditCostCenterId: creditSettings.creditCostCenterId
            });
            setShowCreditSettings(false);
            alert('تم حفظ إعدادات الحساب الدائن بنجاح');
        } catch (err) {
            console.error(err);
            alert('حدث خطأ أثناء حفظ الإعدادات');
        }
    };

    const handleOpenPhoneModal = (phone?: BranchPhone) => {
        if (phone) {
            setEditingPhoneId(phone.id);
            setPhoneFormData({ ...phone });
        } else {
            setEditingPhoneId(null);
            setPhoneFormData({
                branchId: selectedBranchId!,
                phoneId: '',
                isActive: true,
                currency: selectedBranch?.currencyType === 'new_rial' ? 'new_riyal' : 'old_riyal'
            });
        }
        setIsPhoneModalOpen(true);
    };

    const handleSavePhone = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!phoneFormData.phoneNumber || !phoneFormData.phoneId) return alert('يرجى إدخال رقم الهاتف ومعرف الرقم (ID)');
        try {
            if (editingPhoneId) {
                await updateBranchPhone(editingPhoneId, phoneFormData);
                addLog('تعديل رقم هاتف محفوظ', `الفرع: ${selectedBranch?.name} - الرقم: ${phoneFormData.phoneNumber}`, 'general');
            } else {
                await addBranchPhone(phoneFormData as Omit<BranchPhone, 'id' | 'createdAt'>);
                addLog('إضافة رقم هاتف محفوظ', `الفرع: ${selectedBranch?.name} - الرقم: ${phoneFormData.phoneNumber}`, 'general');
            }
            setIsPhoneModalOpen(false);
        } catch (err) { console.error(err); }
    };

    const handleOpenPaymentModal = (payment?: PhonePayment) => {
        if (payment) {
            setEditingPaymentId(payment.id);
            setPaymentFormData({ ...payment, paymentDate: payment.paymentDate ? new Date(payment.paymentDate).toISOString().split('T')[0] : '' });
        } else {
            setEditingPaymentId(null);
            setPaymentFormData({
                branchId: selectedBranchId!,
                branchName: selectedBranch?.name || '',
                paymentDate: new Date().toISOString().split('T')[0],
                currency: selectedBranch?.currencyType === 'new_rial' ? 'new_riyal' : 'old_riyal'
            });
        }
        setIsPaymentModalOpen(true);
    };

    const handlePhoneSelection = (savedPhoneId: string) => {
        const phone = branchSavedPhones.find(p => p.id === savedPhoneId);
        if (phone) {
            setPaymentFormData(prev => ({
                ...prev,
                branchPhoneId: phone.id,
                phoneId: phone.phoneId,
                systemAccountName: phone.systemAccountName,
                phoneNumber: phone.phoneNumber,
                employeeId: phone.employeeId || '',
                employeeName: phone.employeeName || '',
                currency: phone.currency,
                provider: phone.provider || prev.provider || ''
            }));
        }
    };

    const handleSavePayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentFormData.phoneNumber || !paymentFormData.amount || !paymentFormData.provider) {
            return alert('يرجى ملء الحقول المطلوبة');
        }
        try {
            if (editingPaymentId) {
                await updatePhonePayment(editingPaymentId, paymentFormData);
                addLog('تعديل سداد هاتف', `${paymentFormData.phoneNumber} - ${paymentFormData.amount}`, 'general');
            } else {
                await addPhonePayment(paymentFormData as any);
                addLog('إضافة سداد هاتف', `${paymentFormData.phoneNumber} - ${paymentFormData.amount}`, 'general');
            }
            setIsPaymentModalOpen(false);
        } catch (err) { console.error(err); }
    };

    const handleBulkDelete = async () => {
        console.log('handleBulkDelete called with', selectedPaymentIds.size, 'ids');
        if (selectedPaymentIds.size === 0) {
            console.log('No items selected, returning');
            return;
        }

        const confirmed = await confirmDialog(`هل أنت متأكد من حذف ${selectedPaymentIds.size} عملية سداد مختارة؟`, { type: 'danger', confirmText: 'حذف', cancelText: 'إلغاء' });
        if (confirmed) {
            try {
                // Sequential deletion to avoid firestore throughput issues if many
                const ids = Array.from(selectedPaymentIds);
                for (const id of ids) {
                    await deletePhonePayment(id);
                }
                addLog('حذف جماعي لسداد هواتف', `الفرع: ${selectedBranch?.name} - عدد العمليات: ${selectedPaymentIds.size}`, 'general');
                setSelectedPaymentIds(new Set());
            } catch (err: any) {
                console.error(err);
                alert(`حدث خطأ أثناء الحذف الجماعي: ${err?.message || JSON.stringify(err)}`);
            }
        }
    };

    const togglePaymentSelection = (id: string) => {
        const next = new Set(selectedPaymentIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedPaymentIds(next);
    };

    const toggleSelectAll = (payments: PhonePayment[]) => {
        const allInCurrentVisibleSelected = payments.every(p => selectedPaymentIds.has(p.id));
        const next = new Set(selectedPaymentIds);
        if (allInCurrentVisibleSelected) {
            payments.forEach(p => next.delete(p.id));
        } else {
            payments.forEach(p => next.add(p.id));
        }
        setSelectedPaymentIds(next);
    };


    const handleOpenProviderModal = (provider?: PhoneProvider) => {
        if (provider) {
            setEditingProviderId(provider.id);
            setProviderFormData({ ...provider });
        } else {
            setEditingProviderId(null);
            setProviderFormData({ isActive: true });
        }
        setIsProviderModalOpen(true);
    };

    const handleSaveProvider = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!providerFormData.name) return alert('يرجى إدخال اسم المزود');
        try {
            if (editingProviderId) {
                await updatePhoneProvider(editingProviderId, providerFormData);
            } else {
                await addPhoneProvider(providerFormData as Omit<PhoneProvider, 'id'>);
            }
            setIsProviderModalOpen(false);
        } catch (err) { console.error(err); }
    };

    // --- PDF Extraction Logic ---
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsExtracting(true);
        setIsImportModalOpen(true);
        setExtractedData([]); // Reset

        try {
            const arrayBuffer = await file.arrayBuffer();
            // Load PDF with error handling for worker
            const loadingTask = pdfjsLib.getDocument({
                data: arrayBuffer,
                useWorkerFetch: true,
                isEvalSupported: false
            });

            const pdf = await loadingTask.promise;
            let fullText = "";

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                // Group items by their vertical position (y) to handle rows better
                const items = textContent.items as any[];

                // BETTER: Group by Y coordinate to preserve rows and use a reliable separator
                const lines: { [key: number]: any[] } = {};
                items.forEach(item => {
                    // Grouping items on the same baseline (tolerance of 3 units)
                    const y = Math.round(item.transform[5] / 3) * 3;
                    if (!lines[y]) lines[y] = [];
                    lines[y].push(item);
                });

                const sortedY = Object.keys(lines).map(Number).sort((a, b) => b - a);
                for (const y of sortedY) {
                    const lineItems = lines[y].sort((a, b) => a.transform[4] - b.transform[4]);
                    const lineText = lineItems.map(item => item.str).join(" | ");
                    fullText += lineText + "\n";
                }
            }

            if (!fullText.trim()) {
                throw new Error("لم يتم العثور على نص في ملف PDF. قد يكون الملف عبارة عن صور فقط.");
            }

            const results = parsePdfText(fullText);
            setExtractedData(results); // Important: need to update state

            if (results.length === 0) {
                // Throw the first part of the text so we can see what the PDF actually contains!
                const snippet = fullText.trim().substring(0, 300);
                throw new Error(`لم يتم العثور على عمليات سداد. \nنص العينة المستخرج:\n${snippet}...\n\nيرجى تصوير هذه الرسالة للمطور.`);
            }
        } catch (err: any) {
            console.error("PDF Error Details:", err);
            let userMsg = "فشل قراءة ملف PDF";
            if (err.message) userMsg += ": " + err.message;
            if (err.name === 'MissingPDFException') userMsg = "الملف المرفوع ليس ملف PDF صالح.";

            alert(userMsg);
            setIsImportModalOpen(false); // Close on hard error
        } finally {
            setIsExtracting(false);
        }
    };

    const parsePdfText = (text: string) => {
        const rows: ExtractedPayment[] = [];
        const failedRows: string[] = []; // Track why rows failed
        // Process line by line since we nicely grouped them by Y-coordinate
        const lines = text.split('\n');

        // Flexible Date Regex: Supports YYYY-MM-DD or YYYY/MM/DD and HH:mm:ss in any order
        const dateRegex = /(\d{4}[-/]\d{2}[-/]\d{2}\s+\d{2}:\d{2}:\d{2})|(\d{2}:\d{2}:\d{2}\s+\d{4}[-/]\d{2}[-/]\d{2})|(\d{2}[-/]\d{2}[-/]\d{4}\s+\d{2}:\d{2}:\d{2})|(\d{2}:\d{2}:\d{2}\s+\d{2}[-/]\d{2}[-/]\d{4})/i;

        // Broad Phone Regex: Matches 9 digits starting with 7, optionally prefixed by 967, 00967, +967
        // Capture group 1 or group 2 will be the 9 digit number
        const phoneRegex = /(?:الجوال|الرقم|الموبايل)\s*[:：/]?\s*(?:967|00967|\+967)?(7\d{8})|(?:\b|[^0-9])(?:967|00967|\+967)?(7\d{8})(?:\b|[^0-9])/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;

            const phoneMatch = line.match(phoneRegex);

            // If there's a phone number, this line is very likely a transaction row
            if (phoneMatch) {
                const phoneNumber = phoneMatch[1] || phoneMatch[2];
                let dateMatch = line.match(dateRegex);
                let date = dateMatch ? dateMatch[0] : '';

                // Check adjacent lines for date if not found (handles multi-line rows)
                if (!date) {
                    if (lines[i - 1]) dateMatch = lines[i - 1].match(dateRegex);
                    if (!dateMatch && lines[i + 1]) dateMatch = lines[i + 1].match(dateRegex);
                    date = dateMatch ? dateMatch[0] : '';
                }

                if (!date) {
                    const shortDateMatch = line.match(/(\d{4}[-/]\d{2}[-/]\d{2})|(\d{2}[-/]\d{2}[-/]\d{4})/);
                    date = shortDateMatch ? shortDateMatch[0] : new Date().toISOString().split('T')[0];
                }

                // Identify Transaction Type (Check adjacent lines too)
                const combinedText = [lines[i - 1] || '', line, lines[i + 1] || ''].join(' ');

                const isCredit = combinedText.includes('مسترد') || combinedText.includes('عكس') || combinedText.includes('دائن') || combinedText.includes('إيداع') || combinedText.includes('مرتجع') || combinedText.includes('فاشل') || combinedText.includes('مرفوض');

                // Ref Number Logic
                // Must be at least 6 digits, must not be the current phone number, AND importantly must not be ANY valid phone number (from adjacent rows)
                const allNumbers: string[] = combinedText.match(/\b\d{6,15}\b/g) || [];
                const refNum = allNumbers.find(n =>
                    n !== phoneNumber &&
                    !n.match(/^(?:967|00967|\+967)?7\d{8}$/) &&
                    !date.includes(n)
                ) || `p-${Math.random().toString(36).substr(2, 5)}`;

                // Amount Extraction
                const potentialAmounts: string[] = combinedText.match(/\d+(?:\.\d{1,2})?/g) || [];
                // Filter out ref, phone, dates, and ensure it's not a long random ID (amount usually < 8 chars)
                const filtered = potentialAmounts.filter(a =>
                    a !== refNum &&
                    !a.includes(phoneNumber) &&
                    !date.includes(a) &&
                    !a.startsWith('967') &&
                    a.length < 8
                );

                const type: 'debit' | 'credit' = isCredit ? 'credit' : 'debit';
                let amount = 0;

                const amounts = filtered.map(a => parseFloat(a));
                if (type === 'debit') {
                    // Check for common amounts first
                    const common = amounts.find(a => [100, 200, 250, 300, 350, 400, 500, 600, 1000, 2000, 2500, 3000, 4000, 5000, 10000].includes(a));
                    amount = common || Math.max(...amounts.filter(a => a < 200000 && a > 0)) || 0;
                } else {
                    amount = Math.max(...amounts.filter(a => a < 1000000)) || 0;
                }

                if (amount > 0) {
                    // Clean up the description
                    const noiseRegex = new RegExp(`(?:الاسم|الجوال|يمن موبايل -|ريال يمن(?:ي)?|\\||${amount}|${refNum}|0\\.00|\\b0\\b|(?:967)?7\\d{8}|:)`, 'g');
                    let cleanDesc = line.replace(noiseRegex, '').replace(dateRegex, '').replace(/[0-9]{4,}/g, '').replace(/\s{2,}/g, ' ').trim();
                    if (cleanDesc.length < 5) cleanDesc = combinedText.replace(noiseRegex, '').replace(dateRegex, '').replace(/[0-9]{4,}/g, '').replace(/\s{2,}/g, ' ').trim();
                    if (cleanDesc.replace(/[^أ-يa-zA-Z]/g, '').length < 3) cleanDesc = 'باقة / رصيد';

                    rows.push({
                        phoneNumber,
                        amount,
                        paymentDate: date,
                        refNumber: refNum,
                        description: cleanDesc.substring(0, 150),
                        provider: combinedText.includes('يمن موبايل') ? 'يمن موبايل' :
                            combinedText.includes('يو') || combinedText.includes('YOU') ? 'يو (YOU)' :
                                combinedText.includes('سبأفون') ? 'سبأفون' : 'يمن موبايل',
                        type,
                        status: 'pending',
                        isPackage: combinedText.includes('باقة') || combinedText.includes('مزايا') || combinedText.includes('تفعيل'),
                        isSelected: true
                    } as any);
                } else {
                    failedRows.push(`- Phone: ${phoneNumber} | isCredit: ${isCredit ? 'yes' : 'no'} | Amounts: ${filtered.join(', ')} | Text: ${line.substring(0, 50)}...`);
                }
            }
        }

        // Deduplicate rows based on refNumber. Since spanned rows capture the identical correct refNum now, this is perfectly safe.
        // We filter out random 'p-' IDs generated as fallbacks unless they uniquely identify real individual un-numbered rows.
        let uniqueRows = Array.from(new Map(rows.map(row => [row.refNumber, row])).values());

        // Second pass: Deduplicate identical failed/refund operations that happen within a short timeframe (e.g. 10 minutes)
        // If we have a Debit and a Credit for the exact same amount and phone number within 10 minutes, they cancel out, BUT
        // the user specifically mentioned two identical Debits and one Credit refund.
        // We should mark them as 'duplicate' or 'refunded', and visually highlight the phone number.
        uniqueRows = uniqueRows.map((row, index, arr) => {
            const timeA = new Date(row.paymentDate).getTime();

            // Highlight any group that occurs within 10 minutes on the same phone/amount
            const groupOccurrences = arr.filter(other =>
                row.phoneNumber === other.phoneNumber &&
                row.amount === other.amount &&
                Math.abs(timeA - new Date(other.paymentDate).getTime()) <= 10 * 60 * 1000
            );
            const isRecentGroup = groupOccurrences.length > 1;

            // Check if this row has an identical counterpart within 10 minutes
            const identicalRecent = arr.find((other, otherIdx) => {
                if (otherIdx >= index) return false; // Only look backwards
                if (row.phoneNumber !== other.phoneNumber || row.amount !== other.amount || row.type !== other.type) return false;
                if (!row.paymentDate.includes(':') || !other.paymentDate.includes(':')) return false; // Can't compute 10m if no time
                const timeB = new Date(other.paymentDate).getTime();
                return Math.abs(timeA - timeB) < 10 * 60 * 1000; // 10 minutes
            });

            let status = row.status;
            let description = row.description;

            if (identicalRecent) {
                // This is a repeated identical operation (e.g. user retried)
                status = 'duplicate';
                description = `${description} (مكرر خلال 10 دقائق)`;
            }

            // Check if this is a refunded operation
            const isRefunded = arr.some((other) => {
                if (row.phoneNumber !== other.phoneNumber || row.amount !== other.amount) return false;
                if (row.type === other.type) return false; // One must be debit, one credit
                if (!row.paymentDate.includes(':') || !other.paymentDate.includes(':')) return false; // Can't compute 10m if no time
                const timeB = new Date(other.paymentDate).getTime();
                return Math.abs(timeA - timeB) < 10 * 60 * 1000; // 10 minutes
            });

            if (isRefunded) {
                status = 'refunded';
            }

            // Turn off default selection for duplicates or refunded items
            const isSelected = (status === 'duplicate' || status === 'refunded') ? false : true;

            // If the bank didn't output "Credit" but we have >= 3 operations (e.g. 2 failed, 1 valid)
            if (isRecentGroup && groupOccurrences.length >= 3 && status !== 'duplicate' && status !== 'refunded') {
                // If this is the last one, maybe it's valid. Mark earlier ones differently?
                // The explicit highlight will take care of letting the user know to manually clean them up.
            }

            return { ...row, status, description, isRecentDuplicateGroup: isRecentGroup, isSelected };
        });

        const finalRows = uniqueRows.map(row => {
            if (row.status === 'duplicate' || row.status === 'refunded') return row;
            // Only check for duplicates in the DB if we have a real reference number (not auto-generated)
            const isRealRef = row.refNumber && !row.refNumber.startsWith('p-');
            const isDuplicate = isRealRef && phonePayments.some(p => p.refNumber === row.refNumber);
            return isDuplicate ? { ...row, status: 'duplicate' as const, isSelected: false } : row;
        });

        return finalRows;
    };

    const handleImportSelection = async () => {
        const toImport = extractedData.filter(d => (d as any).isSelected !== false && d.status !== 'duplicate' && d.status !== 'importing' && d.status !== 'done');
        if (toImport.length === 0) return alert('لا توجد عمليات صالحة أو محددة للاستيراد');

        setIsExtracting(true);
        try {
            for (const item of toImport) {
                // Find saved phone for branch phone ID linking
                const savedPhone = branchSavedPhones.find(p => p.phoneNumber === item.phoneNumber);

                const payload: any = {
                    branchId: selectedBranchId!,
                    branchName: selectedBranch?.name || '',
                    phoneNumber: item.phoneNumber,
                    amount: item.amount,
                    currency: selectedBranch?.currencyType === 'new_rial' ? 'new_riyal' : 'old_riyal',
                    provider: item.provider,
                    paymentDate: item.paymentDate,
                    refNumber: item.refNumber,
                    isRefunded: item.type === 'credit',
                    pdfImported: true,
                    notes: item.description || ''
                };

                if (savedPhone?.id) payload.branchPhoneId = savedPhone.id;
                if (savedPhone?.phoneId) payload.phoneId = savedPhone.phoneId;
                if (savedPhone?.systemAccountName) payload.systemAccountName = savedPhone.systemAccountName;
                if ((item as any).linkRefId) payload.refundRefId = (item as any).linkRefId;

                await addPhonePayment(payload);
            }
            alert('تم استيراد العمليات بنجاح');
            setIsImportModalOpen(false);
            addLog('استيراد سدادات من PDF', `الفرع: ${selectedBranch?.name} - عدد العمليات: ${toImport.length}`, 'general');
        } catch (err) {
            console.error(err);
            alert('حدث خطأ أثناء الاستيراد');
        } finally {
            setIsExtracting(false);
        }
    };

    const getBranchColor = (id: string) => {
        const colors = [
            '#4F46E5', '#0891B2', '#059669', '#DC2626', '#D97706',
            '#7C3AED', '#DB2777', '#2563EB', '#0D9488', '#9333EA'
        ];
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    // --- Sub-components ---

    const BranchListScreen = () => (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-white">اختر الفرع</h2>
                    <p className="text-slate-500 font-bold">إدارة هواتف وسداد كل فرع على حدة</p>
                </div>
                <div className="flex items-center gap-3">
                    {canManageProviders && (
                        <button onClick={() => setViewMode('providers')} className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-200 transition-all">
                            <span className="material-symbols-outlined">settings_remote</span>
                            إدارة المزودين
                        </button>
                    )}
                    <div className="relative">
                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                        <input type="text" placeholder="بحث عن فرع..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2.5 font-bold outline-none focus:ring-2 focus:ring-purple-500 transition-all" />
                    </div>
                </div>
            </div>

            <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-md rounded-[2rem] border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                <table className="w-full text-right border-collapse">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/50">
                            <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-wider text-sm">الفرع</th>
                            <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-wider text-sm text-center">العملة</th>
                            <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-wider text-sm text-center">الأرقام المحفوظة</th>
                            <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-wider text-sm text-center">إجمالي السداد</th>
                            <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-wider text-sm text-center">الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {filteredBranches.map(branch => {
                            const branchColor = getBranchColor(branch.id);
                            const phoneCount = branchPhones.filter(p => p.branchId === branch.id).length;
                            const paymentCount = phonePayments.filter(p => p.branchId === branch.id).length;
                            return (
                                <tr key={branch.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group cursor-pointer" onClick={() => handleSelectBranch(branch.id)}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                            <div className="size-3 rounded-full shadow-[0_0_8px]" style={{ backgroundColor: branchColor, boxShadow: `0 0 8px ${branchColor}66` }} />
                                            <span className="font-black text-slate-800 dark:text-white group-hover:translate-x-1 transition-transform inline-block" style={{ color: branchColor }}>
                                                {branch.name}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${branch.currencyType === 'new_rial' ? 'bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'}`}>
                                            {branch.currencyType === 'new_rial' ? 'ريال جديد' : 'ريال قديم'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <span className="font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg">
                                            {phoneCount}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <span className="font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg">
                                            {paymentCount}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <button className="px-4 py-2 bg-purple-600/10 text-purple-600 dark:text-purple-400 rounded-xl font-black text-xs hover:bg-purple-600 hover:text-white transition-all">
                                            عرض التفاصيل
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const BranchDetailScreen = () => (
        <div className="space-y-8 relative">
            {/* Sidebar for Saved Numbers */}
            {isSavedPhonesSidebarOpen && (
                <div className="fixed inset-0 z-[70] overflow-hidden flex justify-end">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setIsSavedPhonesSidebarOpen(false)} />
                    <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 shadow-2xl animate-slide-left h-full flex flex-col" dir="rtl">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                            <div>
                                <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-purple-600">contact_phone</span>
                                    الأرقام المحفوظة - {selectedBranch?.name}
                                </h3>
                                <p className="text-xs font-bold text-slate-400">إدارة أرقام الحسابات والبطائق للفرع</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {canManagePayments && (
                                    <button onClick={() => handleOpenPhoneModal()} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-all">
                                        <span className="material-symbols-outlined text-sm">add</span>
                                        إضافة رقم
                                    </button>
                                )}
                                <button onClick={() => setIsSavedPhonesSidebarOpen(false)} className="size-10 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 text-slate-400 hover:text-red-500 shadow-sm transition-colors border border-slate-100 dark:border-slate-700">
                                    <span className="material-symbols-outlined text-2xl">close</span>
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                            <div className="relative mb-6">
                                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                                <input type="text" placeholder="بحث في الأرقام المحفوظة..." value={phoneSearchTerm} onChange={e => setPhoneSearchTerm(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl pr-12 pl-4 py-4 font-bold outline-none focus:ring-2 focus:ring-purple-500 transition-all shadow-sm" />
                            </div>

                            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
                                <table className="w-full text-right text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-bold border-b border-slate-50 dark:border-slate-700">
                                            <th className="px-4 py-4">ID</th>
                                            <th className="px-4 py-4">البيانات</th>
                                            <th className="px-4 py-4">الحالة</th>
                                            {canManagePayments && <th className="px-4 py-4 text-center">الإجراءات</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                                        {branchSavedPhones
                                            .filter(p => p.phoneNumber.includes(phoneSearchTerm) || (p.phoneId || '').includes(phoneSearchTerm) || (p.systemAccountName || '').includes(phoneSearchTerm))
                                            .map(p => (
                                                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-4 py-4 font-black text-purple-600">{p.phoneId || '—'}</td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="font-mono font-black text-slate-700 dark:text-white" dir="ltr">{p.phoneNumber}</span>
                                                            <span className="text-[10px] text-slate-500 font-bold">{p.systemAccountName || p.employeeName || '—'}</span>
                                                            <span className="text-[10px] text-purple-400 font-bold">{p.provider || 'بدون مزود'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${p.isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                                            {p.isActive ? 'نشط' : 'معطل'}
                                                        </span>
                                                    </td>
                                                    {canManagePayments && (
                                                        <td className="px-4 py-4">
                                                            <div className="flex justify-center gap-1">
                                                                <button onClick={() => handleOpenPhoneModal(p)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"><span className="material-symbols-outlined text-sm">edit</span></button>
                                                                <button onClick={() => deleteBranchPhone(p.id)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"><span className="material-symbols-outlined text-sm">delete</span></button>
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => setViewMode('branches')} className="size-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center hover:bg-slate-200 transition-all">
                        <span className="material-symbols-outlined">arrow_forward</span>
                    </button>
                    <div>
                        <h2 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                            {selectedBranch?.name}
                            <span className="text-sm font-black px-3 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-full">سجل السداد</span>
                        </h2>
                    </div>
                </div>
                <div className="flex gap-4">
                    <label className="px-6 py-3 rounded-2xl bg-teal-600 text-white font-black flex items-center gap-2 hover:bg-teal-700 transition-all shadow-lg shadow-teal-200 dark:shadow-none cursor-pointer">
                        <span className="material-symbols-outlined">upload_file</span>
                        استيراد من PDF
                        <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} />
                    </label>
                    <button onClick={() => setIsSavedPhonesSidebarOpen(true)} className="px-6 py-3 rounded-2xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-black flex items-center gap-2 hover:bg-purple-100 transition-all border border-purple-100 dark:border-purple-800 shadow-sm tracking-wide">
                        <span className="material-symbols-outlined">contact_phone</span>
                        الأرقام المحفوظة
                    </button>
                </div>
            </div>

            {/* Payment History */}
            <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
                <div className="p-8 border-b border-slate-50 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/30">
                    <div className="flex items-center gap-4">
                        <div className="size-14 rounded-3xl bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 shadow-sm border border-teal-100 dark:border-teal-900/50">
                            <span className="material-symbols-outlined text-3xl">history</span>
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 dark:text-white">سجل السداد</h3>
                            <p className="text-slate-500 font-bold text-sm">تتبع المبالغ المدفوعة لمزودي الخدمة</p>
                        </div>
                    </div>
                    {canManagePayments && (
                        <div className="flex items-center gap-3">
                            <button onClick={() => {
                                if (branchPaymentHistory.length > 0 && branchPaymentHistory.every(p => selectedPaymentIds.has(p.id))) {
                                    setSelectedPaymentIds(new Set());
                                } else {
                                    setSelectedPaymentIds(new Set(branchPaymentHistory.map(p => p.id)));
                                }
                            }} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-200 transition-all text-sm">
                                <span className="material-symbols-outlined text-base">fact_check</span>
                                {branchPaymentHistory.length > 0 && branchPaymentHistory.every(p => selectedPaymentIds.has(p.id)) ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                            </button>
                            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                                <button onClick={() => setBookedFilter('all')} className={`px-3 py-2 text-xs font-black transition-colors ${bookedFilter === 'all' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}>الكل</button>
                                <button onClick={() => setBookedFilter('unbooked')} className={`px-3 py-2 text-xs font-black transition-colors ${bookedFilter === 'unbooked' ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-200'}`}>غير مقيّد</button>
                                <button onClick={() => setBookedFilter('booked')} className={`px-3 py-2 text-xs font-black transition-colors ${bookedFilter === 'booked' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}>مقيّد ✓</button>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-xl text-sm font-bold text-slate-600">
                                <input type="checkbox" checked={groupByDate} onChange={e => setGroupByDate(e.target.checked)} className="size-4 text-teal-600 rounded" />
                                تجميع حسب تاريخ الإضافة
                            </label>
                            <button onClick={() => handleOpenPaymentModal()} className="px-6 py-3 bg-teal-600 text-white rounded-2xl font-black flex items-center gap-2 hover:bg-teal-700 transition-all shadow-lg shadow-teal-200 dark:shadow-none">
                                <span className="material-symbols-outlined">add_circle</span>
                                إضافة سداد جديد
                            </button>
                        </div>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-black border-b border-slate-50 dark:border-slate-700">
                                <th className="px-6 py-5 w-12 text-center">
                                    <input type="checkbox"
                                        checked={branchPaymentHistory.length > 0 && branchPaymentHistory.every(p => selectedPaymentIds.has(p.id))}
                                        onChange={() => toggleSelectAll(branchPaymentHistory)}
                                        className="size-4 rounded text-teal-600 focus:ring-teal-500 outline-none cursor-pointer"
                                        title={branchPaymentHistory.every(p => selectedPaymentIds.has(p.id)) ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                                    />
                                </th>
                                <th className="px-6 py-5">الرقم / الحساب</th>
                                <th className="px-6 py-5">المبلغ</th>
                                <th className="px-6 py-5 text-center">العملة</th>
                                <th className="px-6 py-5">المزود</th>
                                <th className="px-6 py-5">التاريخ</th>
                                {canManagePayments && <th className="px-6 py-5 text-center">الإجراءات</th>}
                            </tr>

                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                            {(() => {
                                const renderPaymentRow = (p: PhonePayment) => {
                                    const linkedPhone = branchSavedPhones.find(bp => bp.id === p.branchPhoneId);
                                    const displayId = linkedPhone?.phoneId || p.phoneId;
                                    const displayName = linkedPhone?.systemAccountName || linkedPhone?.employeeName || p.systemAccountName || p.employeeName || '—';

                                    return (
                                        <tr key={p.id} className={`hover:bg-slate-50/50 transition-colors group ${selectedPaymentIds.has(p.id) ? 'bg-teal-50/30' : ''}`}>
                                            <td className="px-6 py-4 text-center border-l border-slate-100 dark:border-slate-800">
                                                <input type="checkbox"
                                                    checked={selectedPaymentIds.has(p.id)}
                                                    onChange={() => togglePaymentSelection(p.id)}
                                                    className="size-4 rounded text-teal-600 focus:ring-teal-500 outline-none cursor-pointer"
                                                />
                                            </td>
                                            <td className="px-6 py-4">

                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-black text-purple-600 text-xs">{displayId ? `#${displayId}` : ''}</span>
                                                        <span className="font-mono font-black text-slate-700 dark:text-white" dir="ltr">{p.phoneNumber}</span>
                                                        {p.pdfImported && <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200" title="مستورد من PDF">PDF</span>}
                                                        {p.isBooked && <span className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-700 font-black" title={`تم القيد ${p.bookedAt ? new Date(p.bookedAt).toLocaleDateString('ar-SA') : ''}`}>مقيّد ✓</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-slate-500 font-bold">{displayName}</span>
                                                        {!linkedPhone && (
                                                            <span className="flex items-center gap-1 text-[9px] text-orange-600 font-black bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">
                                                                <span className="material-symbols-outlined text-[10px]">person_off</span>
                                                                لا يوجد حساب
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-mono font-black text-xl text-teal-600">
                                                <div className="flex flex-col">
                                                    <span>{p.amount.toLocaleString()}</span>
                                                    {p.isRefunded && <span className="text-[10px] text-red-500 font-black">مستردة</span>}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black ${p.currency === 'new_riyal' ? 'bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'}`}>
                                                    {p.currency === 'new_riyal' ? 'ريال جديد' : 'ريال قديم'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">{p.provider}</span>
                                            </td>
                                            <td className="px-6 py-4 text-xs font-bold text-slate-400" dir="ltr">
                                                {new Date(p.paymentDate).toLocaleString('ar-SA', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            {canManagePayments && (
                                                <td className="px-4 py-4">
                                                    <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => handleOpenPaymentModal(p)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl transition-colors">
                                                            <span className="material-symbols-outlined text-sm">edit</span>
                                                        </button>
                                                        <button onClick={async () => {
                                                            const confirmed = await confirmDialog('هل أنت متأكد من حذف هذه العملية؟', { type: 'danger', confirmText: 'حذف', cancelText: 'إلغاء' });
                                                            if (confirmed) {
                                                                await deletePhonePayment(p.id);
                                                            }
                                                        }} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors">
                                                            <span className="material-symbols-outlined text-sm">delete</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                };

                                let sortedPayments = [...branchPaymentHistory].sort((a, b) => new Date(b.createdAt || b.paymentDate).getTime() - new Date(a.createdAt || a.paymentDate).getTime());

                                if (!groupByDate) {
                                    return sortedPayments.map(p => renderPaymentRow(p));
                                }

                                const grouped = sortedPayments.reduce((acc, p) => {
                                    const d = p.createdAt ? new Date(p.createdAt).toLocaleDateString('ar-SA') : new Date(p.paymentDate).toLocaleDateString('ar-SA');
                                    if (!acc[d]) acc[d] = [];
                                    acc[d].push(p);
                                    return acc;
                                }, {} as Record<string, PhonePayment[]>);

                                return Object.entries(grouped).map(([date, payments]) => {
                                    const isCollapsed = collapsedGroups.has(date);
                                    return (
                                        <React.Fragment key={date}>
                                            <tr className="bg-slate-100/50 dark:bg-slate-800/50 cursor-pointer hover:bg-slate-200/50 transition-colors"
                                                onClick={() => {
                                                    const next = new Set(collapsedGroups);
                                                    if (next.has(date)) next.delete(date); else next.add(date);
                                                    setCollapsedGroups(next);
                                                }}>
                                                <td className="px-6 py-3 text-center">
                                                    <input type="checkbox"
                                                        checked={payments.every(p => selectedPaymentIds.has(p.id))}
                                                        onChange={(e) => {
                                                            e.stopPropagation();
                                                            toggleSelectAll(payments);
                                                        }}
                                                        className="size-4 rounded text-teal-600 focus:ring-teal-500 outline-none cursor-pointer"
                                                    />
                                                </td>
                                                <td colSpan={6} className="px-6 py-3 font-black text-slate-700 dark:text-slate-300">

                                                    <div className="flex items-center gap-3">
                                                        <span className="material-symbols-outlined text-sm transition-transform" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>
                                                            expand_more
                                                        </span>
                                                        {date}
                                                        <span className="mr-auto text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 px-2 py-0.5 rounded text-slate-500">
                                                            تمت إضافة {payments.length} عمليات
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                            {!isCollapsed && payments.map(p => renderPaymentRow(p))}
                                        </React.Fragment>
                                    );
                                });
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const ProviderManagementScreen = () => (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <button onClick={() => setViewMode('branches')} className="size-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 flex items-center justify-center hover:bg-slate-200"><span className="material-symbols-outlined">arrow_forward</span></button>
                <h2 className="text-2xl font-black text-slate-800 dark:text-white">إدارة مزودي الخدمة</h2>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm max-w-2xl">
                <div className="p-6 border-b border-slate-50 dark:border-slate-700 flex justify-between items-center">
                    <h3 className="text-lg font-black text-slate-800 dark:text-white">قائمة المزودين</h3>
                    <button onClick={() => handleOpenProviderModal()} className="px-4 py-2 bg-slate-800 text-white rounded-xl font-bold flex items-center gap-2">
                        <span className="material-symbols-outlined">add</span>
                        إضافة مزود
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-bold text-sm">
                                <th className="px-6 py-4">الاسم</th>
                                <th className="px-6 py-4">الحالة</th>
                                <th className="px-6 py-4 text-center">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                            {phoneProviders.map(p => (
                                <tr key={p.id}>
                                    <td className="px-6 py-4 font-bold text-slate-700 dark:text-white">{p.name}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${p.isActive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                            {p.isActive ? 'نشط' : 'معطل'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => handleOpenProviderModal(p)} className="p-1.5 text-blue-600 rounded-lg hover:bg-blue-50"><span className="material-symbols-outlined text-sm">edit</span></button>
                                            <button onClick={() => deletePhoneProvider(p.id)} className="p-1.5 text-red-600 rounded-lg hover:bg-red-50"><span className="material-symbols-outlined text-sm">delete</span></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    return (
        <div className="p-4 md:p-8 space-y-6 animate-fade-in" dir="rtl">
            <div className="flex justify-between items-center mb-8">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-purple-600">phone_iphone</span>
                        سداد هواتف الفروع
                    </h1>
                </div>
            </div>

            {viewMode === 'branches' && <BranchListScreen />}
            {viewMode === 'details' && <BranchDetailScreen />}
            {viewMode === 'providers' && <ProviderManagementScreen />}

            {/* --- Modals --- */}

            {/* Phone Number Modal */}
            {isPhoneModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-purple-600">contact_phone</span>
                                {editingPhoneId ? 'تعديل رقم هاتف' : 'إضافة رقم هاتف جديد'}
                            </h3>
                            <button onClick={() => setIsPhoneModalOpen(false)} className="text-slate-400 hover:text-red-500"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <form onSubmit={handleSavePhone} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 mr-2">ID (معرف الرقم) *</label>
                                    <input type="text" value={phoneFormData.phoneId || ''} onChange={e => setPhoneFormData({ ...phoneFormData, phoneId: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-purple-500" placeholder="" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 mr-2">اسم الحساب في النظام</label>
                                    <input type="text" value={phoneFormData.systemAccountName || ''} onChange={e => setPhoneFormData({ ...phoneFormData, systemAccountName: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-purple-500" placeholder="" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 mr-2">رقم الهاتف *</label>
                                <input type="text" value={phoneFormData.phoneNumber || ''} onChange={e => setPhoneFormData({ ...phoneFormData, phoneNumber: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-purple-500" dir="ltr" placeholder="" />
                            </div>
                            <div className="space-y-1 relative">
                                <label className="text-xs font-black text-slate-400 mr-2">الموظف (اختياري)</label>
                                <input type="text" placeholder="اختر الموظف..." value={phoneFormData.employeeName || searchEmployeeForPhone}
                                    onFocus={() => setIsEmployeeSearchFocused(true)}
                                    onBlur={() => setTimeout(() => setIsEmployeeSearchFocused(false), 200)}
                                    onChange={e => { setSearchEmployeeForPhone(e.target.value); setPhoneFormData({ ...phoneFormData, employeeId: '', employeeName: '' }); }}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-purple-500" />
                                {isEmployeeSearchFocused && employeeResultsForPhone.length > 0 && (
                                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                                        {employeeResultsForPhone.map(e => (
                                            <button key={e.id} type="button" onClick={() => { setPhoneFormData({ ...phoneFormData, employeeId: e.id, employeeName: e.name }); setSearchEmployeeForPhone(''); setIsEmployeeSearchFocused(false); }}
                                                className="w-full text-right px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold transition-colors border-b border-slate-50 dark:border-slate-700 last:border-none">
                                                <div className="flex justify-between items-center">
                                                    <span>{e.name}</span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${e.branch === selectedBranch?.name ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-500'}`}>{e.branch}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 mr-2">المزود الافتراضي</label>
                                    <select value={phoneFormData.provider || ''} onChange={e => setPhoneFormData({ ...phoneFormData, provider: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-purple-500">
                                        <option value="">لا يوجد</option>
                                        {phoneProviders.filter(p => p.isActive).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                                <span className="text-sm font-bold text-slate-600 dark:text-slate-400">الحالة: {phoneFormData.isActive ? 'نشط' : 'معطل'}</span>
                                <button type="button" onClick={() => setPhoneFormData({ ...phoneFormData, isActive: !phoneFormData.isActive })}
                                    className={`relative w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${phoneFormData.isActive ? 'bg-green-500' : 'bg-slate-300'}`}>
                                    <div className={`size-4 rounded-full bg-white transition-transform ${phoneFormData.isActive ? 'translate-x-4.5' : 'translate-x-0'}`} />
                                </button>
                            </div>
                            <div className="pt-4 flex gap-4">
                                <button type="submit" className="flex-1 bg-purple-600 text-white py-3 rounded-xl font-black shadow-lg">حفظ</button>
                                <button type="button" onClick={() => setIsPhoneModalOpen(false)} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 py-3 rounded-xl font-bold">إلغاء</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {isPaymentModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-teal-600">payments</span>
                                {editingPaymentId ? 'تعديل سداد' : 'إضافة سداد هاتف'}
                            </h3>
                            <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-red-500"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <form onSubmit={handleSavePayment} className="p-6 space-y-4">
                            <div className="flex gap-4">
                                <div className="space-y-1 flex-1">
                                    <label className="text-xs font-black text-slate-400 mr-2">اختر الرقم *</label>
                                    <select value={paymentFormData.branchPhoneId || ''} onChange={e => handlePhoneSelection(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-teal-500">
                                        <option value="">-- اختر من الأرقام المحفوظة --</option>
                                        {branchSavedPhones.filter(p => p.isActive).map(p => (
                                            <option key={p.id} value={p.id}>{p.phoneNumber}</option>
                                        ))}
                                    </select>
                                </div>
                                <button type="button" onClick={() => handleOpenPhoneModal()} className="mt-6 px-4 rounded-xl bg-purple-50 text-purple-600 flex items-center gap-2 hover:bg-purple-100 font-bold transition-all">
                                    <span className="material-symbols-outlined">add</span>
                                    إضافة رقم جديد
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 mr-2">ID (المعرف المالي)</label>
                                    <div className="w-full bg-slate-100 dark:bg-slate-900/50 rounded-xl px-4 py-3 font-black text-purple-600 shadow-inner">
                                        {paymentFormData.phoneId || '—'}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 mr-2">اسم الحساب في النظام</label>
                                    <div className="w-full bg-slate-100 dark:bg-slate-900/50 rounded-xl px-4 py-3 font-bold text-slate-600 shadow-inner">
                                        {paymentFormData.systemAccountName || '—'}
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 mr-2">المبلغ *</label>
                                    <input type="number" value={paymentFormData.amount || ''} onChange={e => setPaymentFormData({ ...paymentFormData, amount: Number(e.target.value) })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-3 font-mono font-black text-lg text-teal-600 outline-none focus:ring-2 focus:ring-teal-500" placeholder="0" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 mr-2">العملة</label>
                                    <select value={paymentFormData.currency} onChange={e => setPaymentFormData({ ...paymentFormData, currency: e.target.value as any })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-teal-500">
                                        <option value="old_riyal">ريال قديم</option>
                                        <option value="new_riyal">ريال جديد</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 mr-2">المزود *</label>
                                    <select value={paymentFormData.provider || ''} onChange={e => setPaymentFormData({ ...paymentFormData, provider: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-teal-500 text-sm">
                                        <option value="">اختر المزود / الحساب</option>
                                        {phoneProviders.filter(p => p.isActive).map(p => (
                                            <option key={p.id} value={p.name}>{p.name} {p.systemAccountId ? `(${p.systemAccountId})` : ''}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 mr-2">تاريخ السداد</label>
                                    <input type="date" value={paymentFormData.paymentDate || ''} onChange={e => setPaymentFormData({ ...paymentFormData, paymentDate: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-teal-500" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 mr-2">ملاحظات</label>
                                <textarea value={paymentFormData.notes || ''} onChange={e => setPaymentFormData({ ...paymentFormData, notes: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-teal-500 min-h-[60px]" placeholder="ملاحظات إضافية..." />
                            </div>
                            <div className="pt-4 flex gap-4">
                                <button type="submit" className="flex-1 bg-teal-600 text-white py-3 rounded-xl font-black shadow-lg">حفظ السداد</button>
                                <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 py-3 rounded-xl font-bold">إلغاء</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Provider Modal */}
            {isProviderModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-slide-up">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-xl font-black text-slate-800 dark:text-white">{editingProviderId ? 'تعديل مزود' : 'إضافة مزود جديد'}</h3>
                            <button onClick={() => setIsProviderModalOpen(false)} className="text-slate-400 hover:text-red-500"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <form onSubmit={handleSaveProvider} className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 mr-2">اسم المزود *</label>
                                <input type="text" value={providerFormData.name || ''} onChange={e => setProviderFormData({ ...providerFormData, name: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-slate-500" placeholder="مثال: يمن موبايل" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 mr-2">معرف حساب النظام (اختياري)</label>
                                <input type="text" value={providerFormData.systemAccountId || ''} onChange={e => setProviderFormData({ ...providerFormData, systemAccountId: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-slate-500" placeholder="ID الحساب المالي" />
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                                <span className="text-sm font-bold text-slate-600 dark:text-slate-400">الحالة: {providerFormData.isActive ? 'نشط' : 'معطل'}</span>
                                <button type="button" onClick={() => setProviderFormData({ ...providerFormData, isActive: !providerFormData.isActive })}
                                    className={`relative w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${providerFormData.isActive ? 'bg-green-500' : 'bg-slate-300'}`}>
                                    <div className={`size-4 rounded-full bg-white transition-transform ${providerFormData.isActive ? 'translate-x-4.5' : 'translate-x-0'}`} />
                                </button>
                            </div>
                            <div className="pt-4 flex gap-4">
                                <button type="submit" className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-black">حفظ</button>
                                <button type="button" onClick={() => setIsProviderModalOpen(false)} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 py-3 rounded-xl font-bold">إلغاء</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Import Preview Modal */}
            {isImportModalOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-slide-up border border-slate-200 dark:border-slate-700">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                                    <span className="material-symbols-outlined text-teal-600 text-3xl">preview</span>
                                    معاينة استيراد ملف السداد
                                </h3>
                                <p className="text-slate-500 font-bold mt-1">راجع العمليات المستخرجة قبل تأكيد الحفظ في النظام</p>
                            </div>
                            <button onClick={() => setIsImportModalOpen(false)} className="size-12 rounded-2xl bg-white dark:bg-slate-800 text-slate-400 hover:text-red-500 shadow-sm transition-all border border-slate-100 dark:border-slate-700 flex items-center justify-center">
                                <span className="material-symbols-outlined text-2xl">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8">
                            {isExtracting ? (
                                <div className="h-64 flex flex-col items-center justify-center gap-4 text-slate-400">
                                    <div className="size-12 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
                                    <p className="font-black text-lg animate-pulse">جاري معالجة الملف واستخراج البيانات...</p>
                                </div>
                            ) : extractedData.length === 0 ? (
                                <div className="h-64 flex flex-col items-center justify-center gap-4 text-slate-400 opacity-50">
                                    <span className="material-symbols-outlined text-6xl">search_off</span>
                                    <p className="font-black text-xl">لم يتم العثور على أي سدادات في الملف</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-4 gap-4 mb-8">
                                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800">
                                            <p className="text-[10px] font-black text-blue-500 uppercase">إجمالي العمليات</p>
                                            <h4 className="text-2xl font-black text-blue-700 dark:text-blue-300">{extractedData.length}</h4>
                                        </div>
                                        <div className="bg-teal-50 dark:bg-teal-900/20 p-4 rounded-2xl border border-teal-100 dark:border-teal-800">
                                            <p className="text-[10px] font-black text-teal-500 uppercase">جاهزة للاستيراد</p>
                                            <h4 className="text-2xl font-black text-teal-700 dark:text-teal-300">{extractedData.filter(d => d.status === 'pending').length}</h4>
                                        </div>
                                        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-2xl border border-red-100 dark:border-red-800">
                                            <p className="text-[10px] font-black text-red-500 uppercase">مكررة مسبقاً</p>
                                            <h4 className="text-2xl font-black text-red-700 dark:text-red-300">{extractedData.filter(d => d.status === 'duplicate').length}</h4>
                                        </div>
                                        <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl border border-orange-100 dark:border-orange-800">
                                            <p className="text-[10px] font-black text-orange-500 uppercase">مستردة (فاشلة)</p>
                                            <h4 className="text-2xl font-black text-orange-700 dark:text-orange-300">{extractedData.filter(d => d.status === 'refunded').length}</h4>
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
                                        <table className="w-full text-right text-sm">
                                            <thead>
                                                <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-black border-b border-slate-50 dark:border-slate-700">
                                                    <th className="px-6 py-4 w-12 text-center">
                                                        <input type="checkbox"
                                                            checked={extractedData.length > 0 && extractedData.every(d => (d as any).isSelected !== false)}
                                                            onChange={e => {
                                                                const checked = e.target.checked;
                                                                setExtractedData(prev => prev.map(d => ({ ...d, isSelected: checked } as any)));
                                                            }}
                                                            className="size-4 rounded text-teal-600 focus:ring-teal-500 outline-none cursor-pointer"
                                                            title={extractedData.every(d => (d as any).isSelected !== false) ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                                                        />
                                                    </th>
                                                    <th className="px-6 py-4">الحالة</th>
                                                    <th className="px-6 py-4">رقم الهاتف</th>
                                                    <th className="px-6 py-4">المبلغ</th>
                                                    <th className="px-6 py-4">البيان / الغرض</th>
                                                    <th className="px-6 py-4">الرقم المرجعي</th>
                                                    <th className="px-6 py-4 text-center">التاريخ</th>
                                                    <th className="px-6 py-4 text-center">إجراءات</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                                                {extractedData.map((d, i) => (
                                                    <tr key={i} className={`hover:bg-slate-50/50 transition-colors ${d.status === 'duplicate' ? 'opacity-40 grayscale' : ''}`}>
                                                        <td className="px-6 py-4 border-l border-slate-100 dark:border-slate-800 text-center">
                                                            <input type="checkbox"
                                                                checked={(d as any).isSelected !== false}
                                                                onChange={e => {
                                                                    const newData = [...extractedData];
                                                                    (newData[i] as any).isSelected = e.target.checked;
                                                                    setExtractedData(newData);
                                                                }}
                                                                className="size-4 rounded text-teal-600 focus:ring-teal-500 outline-none cursor-pointer"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {d.status === 'duplicate' ? (
                                                                <span className="flex items-center gap-1 text-red-500 text-[10px] font-black bg-red-50 px-2 py-1 rounded-lg border border-red-100">
                                                                    <span className="material-symbols-outlined text-sm">warning</span>
                                                                    مكرر
                                                                </span>
                                                            ) : d.status === 'refunded' ? (
                                                                <span className="flex items-center gap-1 text-orange-500 text-[10px] font-black bg-orange-50 px-2 py-1 rounded-lg border border-orange-100">
                                                                    <span className="material-symbols-outlined text-sm">undo</span>
                                                                    مستردة
                                                                </span>
                                                            ) : (
                                                                <span className="flex items-center gap-1 text-teal-500 text-[10px] font-black bg-teal-50 px-2 py-1 rounded-lg border border-teal-100">
                                                                    <span className="material-symbols-outlined text-sm">check_circle</span>
                                                                    جاهز
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 border-l border-slate-100 dark:border-slate-800 relative">
                                                            {(d as any).isRecentDuplicateGroup && (
                                                                <span className="absolute right-0 top-0 bottom-0 w-1 bg-rose-500 rounded-r-lg" title="تكرر هذا الرقم خلال أقل من 10 دقائق"></span>
                                                            )}
                                                            {d.isEditing ? (
                                                                <input type="text" value={d.phoneNumber} onChange={e => {
                                                                    const newData = [...extractedData];
                                                                    newData[i].phoneNumber = e.target.value;
                                                                    setExtractedData(newData);
                                                                }} className={`w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-mono text-sm ${(d as any).isRecentDuplicateGroup ? 'text-rose-600 border-rose-200 bg-rose-50' : ''}`} dir="ltr" />
                                                            ) : (
                                                                <span className={`font-mono font-black ${d.status === 'duplicate' ? 'text-rose-500' : (d as any).isRecentDuplicateGroup ? 'text-rose-600 bg-rose-50 px-2 py-1 rounded-md' : 'text-slate-700 dark:text-white'}`} dir="ltr" title={(d as any).isRecentDuplicateGroup ? 'عملية متكررة خلال 10 دقائق' : ''}>
                                                                    {d.phoneNumber}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {d.isEditing ? (
                                                                <input type="number" value={d.amount} onChange={e => {
                                                                    const newData = [...extractedData];
                                                                    newData[i].amount = Number(e.target.value);
                                                                    setExtractedData(newData);
                                                                }} className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-mono text-sm text-teal-600" />
                                                            ) : (
                                                                <span className="font-mono font-black text-teal-600">{d.amount.toLocaleString()}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 max-w-[200px] truncate">
                                                            {d.isEditing ? (
                                                                <input type="text" value={d.description} onChange={e => {
                                                                    const newData = [...extractedData];
                                                                    newData[i].description = e.target.value;
                                                                    setExtractedData(newData);
                                                                }} className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-bold text-slate-500 text-xs" />
                                                            ) : (
                                                                <span className="font-bold text-slate-500 text-xs truncate block" title={d.description || ''}>{d.description || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {d.isEditing ? (
                                                                <input type="text" value={d.refNumber} onChange={e => {
                                                                    const newData = [...extractedData];
                                                                    newData[i].refNumber = e.target.value;
                                                                    setExtractedData(newData);
                                                                }} className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-mono text-[10px]" />
                                                            ) : (
                                                                <span className="font-mono text-[10px] text-slate-400">{d.refNumber}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            {d.isEditing ? (
                                                                <input type="text" value={d.paymentDate} onChange={e => {
                                                                    const newData = [...extractedData];
                                                                    newData[i].paymentDate = e.target.value;
                                                                    setExtractedData(newData);
                                                                }} className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-mono text-[10px]" dir="ltr" />
                                                            ) : (
                                                                <span className="text-[10px] font-bold text-slate-400" dir="ltr">
                                                                    {new Date(d.paymentDate).toLocaleString('ar-SA', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                {d.isEditing ? (
                                                                    <button onClick={() => {
                                                                        const newData = [...extractedData];
                                                                        newData[i].isEditing = false;
                                                                        setExtractedData(newData);
                                                                    }} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><span className="material-symbols-outlined text-sm">check</span></button>
                                                                ) : (
                                                                    <>
                                                                        <button onClick={() => {
                                                                            const newData = [...extractedData];
                                                                            newData[i].isEditing = true;
                                                                            setExtractedData(newData);
                                                                        }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><span className="material-symbols-outlined text-sm">edit</span></button>
                                                                        <button onClick={async () => {
                                                                            const confirmed = await confirmDialog('هل أنت متأكد من حذف هذا السطر من الاستيراد؟', { type: 'danger', confirmText: 'حذف', cancelText: 'إلغاء' });
                                                                            if (confirmed) {
                                                                                setExtractedData(extractedData.filter((_, idx) => idx !== i));
                                                                            }
                                                                        }} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><span className="material-symbols-outlined text-sm">delete</span></button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-8 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end gap-4">
                            <button onClick={handleImportSelection} disabled={isExtracting || extractedData.filter(d => d.status === 'pending' || d.status === 'refunded').length === 0}
                                className="px-8 py-4 bg-teal-600 text-white rounded-2xl font-black shadow-lg shadow-teal-200 dark:shadow-none hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-3">
                                <span className="material-symbols-outlined">sync</span>
                                تأكيد واستيراد ({extractedData.filter(d => d.status === 'pending' || d.status === 'refunded').length}) عملية
                            </button>
                            <button onClick={() => setIsImportModalOpen(false)} className="px-8 py-4 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl font-black hover:bg-slate-300 transition-all">
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Floating Bulk Actions Bar */}
            {selectedPaymentIds.size > 0 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] bg-slate-950 text-white px-8 py-6 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-8 border border-slate-600 backdrop-blur-xl pointer-events-auto">
                    <div className="flex items-center gap-4 border-l border-slate-700 pl-8">
                        <span className="size-10 rounded-full bg-teal-500 flex items-center justify-center text-lg font-black">{selectedPaymentIds.size}</span>
                        <span className="font-bold text-base">عمليات مختارة</span>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={exportJournalEntry}
                            className="flex items-center gap-3 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm transition-all shadow-lg active:scale-95 cursor-pointer pointer-events-auto"
                        >
                            <span className="material-symbols-outlined text-lg">description</span>
                            تصدير قيد يومية
                        </button>
                        <button
                            onClick={(e) => {
                                console.log('Bulk delete button clicked event');
                                handleBulkDelete();
                            }}
                            className="flex items-center gap-3 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-sm transition-all shadow-lg active:scale-95 cursor-pointer pointer-events-auto"
                        >
                            <span className="material-symbols-outlined text-lg">delete</span>
                            حذف المحددة
                        </button>
                        <button
                            onClick={() => setShowCreditSettings(true)}
                            className="flex items-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-2xl font-black text-sm transition-all text-slate-100 shadow-lg active:scale-95 cursor-pointer pointer-events-auto"
                            title="إعدادات القيد المحاسبي"
                        >
                            <span className="material-symbols-outlined text-lg">settings</span>
                        </button>
                        <button
                            onClick={() => {
                                console.log('Cancel selection clicked');
                                setSelectedPaymentIds(new Set());
                            }}
                            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-2xl font-black text-sm transition-all text-slate-100 shadow-lg active:scale-95 cursor-pointer pointer-events-auto"
                        >
                            إلغاء التحديد
                        </button>
                    </div>
                </div>
            )}

            {/* Credit Account Settings Modal */}
            {showCreditSettings && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-700">
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                            <span className="material-symbols-outlined text-emerald-400">settings</span>
                            إعدادات الحساب الدائن - {selectedBranch?.name}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-300 mb-1">رقم الحساب الرئيسي (الدائن)</label>
                                <input
                                    type="text"
                                    value={creditSettings.creditAccountNumber}
                                    onChange={e => setCreditSettings(prev => ({ ...prev, creditAccountNumber: e.target.value }))}
                                    placeholder="مثال: 25000"
                                    className="w-full px-4 py-3 rounded-xl bg-slate-700 text-white border border-slate-600 focus:border-emerald-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-300 mb-1">رقم الحساب التحليلي (الفرعي)</label>
                                <input
                                    type="text"
                                    value={creditSettings.creditSubAccountNumber}
                                    onChange={e => setCreditSettings(prev => ({ ...prev, creditSubAccountNumber: e.target.value }))}
                                    placeholder="مثال: 126"
                                    className="w-full px-4 py-3 rounded-xl bg-slate-700 text-white border border-slate-600 focus:border-emerald-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-300 mb-1">اسم مركز التكلفة</label>
                                <input
                                    type="text"
                                    value={creditSettings.creditCostCenter}
                                    onChange={e => setCreditSettings(prev => ({ ...prev, creditCostCenter: e.target.value }))}
                                    placeholder="مثال: عهد الموظفين"
                                    className="w-full px-4 py-3 rounded-xl bg-slate-700 text-white border border-slate-600 focus:border-emerald-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-300 mb-1">رقم مركز التكلفة</label>
                                <input
                                    type="text"
                                    value={creditSettings.creditCostCenterId}
                                    onChange={e => setCreditSettings(prev => ({ ...prev, creditCostCenterId: e.target.value }))}
                                    placeholder="مثال: 6"
                                    className="w-full px-4 py-3 rounded-xl bg-slate-700 text-white border border-slate-600 focus:border-emerald-500 focus:outline-none"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end mt-8">
                            <button
                                onClick={() => setShowCreditSettings(false)}
                                className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-700 transition-colors"
                            >
                                إلغاء
                            </button>
                            <button
                                onClick={handleSaveCreditSettings}
                                className="px-6 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-bold shadow-lg"
                            >
                                حفظ الإعدادات
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );

};

export default PhonePaymentsPage;
