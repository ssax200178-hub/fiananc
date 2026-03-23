import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAppContext } from '../AppContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { safeCompare, safeSessionGet, safeSessionSet, getBranchColorClasses } from '../utils';
import type { Restaurant, TransferAccount } from '../AppContext';
import * as XLSX from 'xlsx';
import { confirmDialog } from '../utils/confirm';

const RestaurantsPage: React.FC = () => {
    const { restaurants, addRestaurant, updateRestaurant, deleteRestaurant, mergeRestaurants, currentUser, getCurrencyByBranch, addLog, paymentAccounts } = useAppContext();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const listRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [searchTerm, setSearchTerm] = useState(() => safeSessionGet('rest_searchTerm', ''));
    const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
    const [searchField, setSearchField] = useState<'all' | 'name' | 'account' | 'phone'>(() => safeSessionGet('rest_searchField', 'all') as any);
    const [selectedBranch, setSelectedBranch] = useState(() => safeSessionGet('rest_selectedBranch', 'الكل'));
    const [selectedCategory, setSelectedCategory] = useState<'الكل' | string>('الكل');
    const [selectedAccountType, setSelectedAccountType] = useState(() => safeSessionGet('rest_selectedAccountType', 'الكل'));
    const [selectedPaymentPeriod, setSelectedPaymentPeriod] = useState(() => safeSessionGet('rest_selectedPaymentPeriod', 'الكل'));
    const [activeFilter, setActiveFilter] = useState<'الكل' | 'نشط' | 'غير نشط'>('نشط');
    const [accountStatusFilter, setAccountStatusFilter] = useState<'الكل' | 'لديه حساب' | 'بدون حساب'>('الكل');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'name', direction: 'asc' });

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isMerging, setIsMerging] = useState(false);
    const [isUpdatingAll, setIsUpdatingAll] = useState(false);
    const [isUpdatingCurrencies, setIsUpdatingCurrencies] = useState(false);
    const [isDataMenuOpen, setIsDataMenuOpen] = useState(false);

    // Persist filters to sessionStorage
    useEffect(() => { safeSessionSet('rest_searchTerm', searchTerm); }, [searchTerm]);
    useEffect(() => { safeSessionSet('rest_searchField', searchField); }, [searchField]);
    useEffect(() => { safeSessionSet('rest_selectedBranch', selectedBranch); }, [selectedBranch]);
    useEffect(() => { safeSessionSet('rest_selectedAccountType', selectedAccountType); }, [selectedAccountType]);
    useEffect(() => { safeSessionSet('rest_selectedPaymentPeriod', selectedPaymentPeriod); }, [selectedPaymentPeriod]);
    // sortBy is no longer persisted directly, sortConfig handles it
    useEffect(() => { safeSessionSet('rest_activeFilter', activeFilter); }, [activeFilter]);
    useEffect(() => { safeSessionSet('rest_accountStatusFilter', accountStatusFilter); }, [accountStatusFilter]);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 300);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    useEffect(() => {
        const search = searchParams.get('search');
        if (search) {
            setSearchTerm(search);
            setSearchField('all');
        }
    }, [searchParams]);

    const [newRestaurant, setNewRestaurant] = useState({
        branch: '',
        restaurantAccountNumber: '',
        name: '',
        ownerName: '',
        phone: '',
        paymentPeriod: 'monthly' as 'monthly' | 'semi-monthly',
        currencyType: 'old_riyal' as 'old_riyal' | 'new_riyal',
        classification: '',
        clientType: '',
        logoUrl: '',
        systemAccountNumber: ''
    });

    const branches = useMemo(() => ['الكل', ...Array.from(new Set(restaurants.map(r => r.branch)))], [restaurants]);
    const accountTypes = useMemo(() => ['الكل', ...Array.from(new Set(restaurants.flatMap(r => r.transferAccounts?.map(acc => acc.type) || []).filter(Boolean)))], [restaurants]);

    // Categories deduction
    const categories = useMemo(() => {
        const cats = restaurants.map(r => r.classification?.trim()).filter(Boolean);
        return Array.from(new Set(cats));
    }, [restaurants]);

    // Filter & Sort Logic
    const filteredRestaurants = useMemo(() => {
        let result = (restaurants || []).filter(restaurant => {
            if (!restaurant) return false;
            const s = debouncedSearch.toLowerCase().trim();

            const matchesSearch = !s ||
                (searchField === 'all' && (
                    (restaurant.name || '').toLowerCase().includes(s) ||
                    (restaurant.restaurantAccountNumber || '').includes(s) ||
                    (restaurant.ownerName || '').toLowerCase().includes(s) ||
                    (restaurant.phone || '').includes(s) ||
                    (restaurant.secondaryPhone || '').includes(s) ||
                    (restaurant.branch || '').toLowerCase().includes(s) ||
                    (restaurant.classification || '').toLowerCase().includes(s) ||
                    (restaurant.clientType || '').toLowerCase().includes(s) ||
                    (restaurant.transferAccounts || []).some(acc =>
                        (acc.type || '').toLowerCase().includes(s) ||
                        (acc.accountNumber || '').includes(s) ||
                        (acc.beneficiaryName || '').toLowerCase().includes(s) ||
                        (acc.uniqueCode || '').includes(s)
                    )
                )) ||
                (searchField === 'name' && (restaurant.name || '').toLowerCase().includes(s)) ||
                (searchField === 'account' && (
                    (restaurant.restaurantAccountNumber || '').includes(s) ||
                    (restaurant.transferAccounts || []).some(acc => (acc.accountNumber || '').includes(s) || (acc.uniqueCode || '').includes(s))
                )) ||
                (searchField === 'phone' && (
                    (restaurant.phone || '').includes(s) ||
                    (restaurant.secondaryPhone || '').includes(s)
                ));

            const matchesActive =
                activeFilter === 'الكل' ||
                (activeFilter === 'نشط' ? restaurant.isActive !== false : restaurant.isActive === false);

            const matchesBranch = selectedBranch === 'الكل' || (restaurant.branch || '') === selectedBranch;
            const matchesCategory = selectedCategory === 'الكل' ? true :
                (selectedCategory === 'بدون تصنيف' ? !restaurant.classification?.trim() : restaurant.classification?.trim() === selectedCategory);

            const hasAccounts = (restaurant.transferAccounts?.length || 0) > 0;
            const matchesAccountStatus =
                accountStatusFilter === 'الكل' ||
                (accountStatusFilter === 'لديه حساب' ? hasAccounts : !hasAccounts);

            const matchesPayment = selectedPaymentPeriod === 'الكل' || restaurant.paymentPeriod === selectedPaymentPeriod;
            const matchesAccountType = selectedAccountType === 'الكل' || (restaurant.transferAccounts || []).some(acc => acc.type === selectedAccountType);

            return matchesSearch && matchesActive && matchesBranch && matchesCategory && matchesAccountStatus && matchesPayment && matchesAccountType;
        });

        if (sortConfig) {
            result.sort((a, b) => {
                const aValue = (a as any)[sortConfig.key];
                const bValue = (b as any)[sortConfig.key];
                const comparison = safeCompare(aValue, bValue);
                return sortConfig.direction === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [restaurants, debouncedSearch, searchField, activeFilter, selectedBranch, selectedCategory, accountStatusFilter, selectedPaymentPeriod, selectedAccountType, sortConfig]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (!sortConfig || sortConfig.key !== column) return <span className="material-symbols-outlined text-[14px] opacity-20">sort</span>;
        return (
            <span className="material-symbols-outlined text-[14px] text-[#C62828]">
                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
            </span>
        );
    };

    // Pagination
    const ITEMS_PER_PAGE = 50;
    const [currentPage, setCurrentPage] = useState(1);
    const totalPages = Math.ceil(filteredRestaurants.length / ITEMS_PER_PAGE);
    const paginatedRestaurants = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredRestaurants.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredRestaurants, currentPage]);

    const totalBalance = useMemo(() => {
        return filteredRestaurants.reduce((sum, r: Restaurant) => sum + (r.balance || 0), 0);
    }, [filteredRestaurants]);

    // Reset page when filters change
    useEffect(() => { setCurrentPage(1); }, [debouncedSearch, searchField, selectedBranch, selectedCategory, selectedAccountType, selectedPaymentPeriod, sortConfig, activeFilter, accountStatusFilter]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const id = await addRestaurant({
                ...newRestaurant,
                transferAccounts: []
            });
            setIsAddModalOpen(false);
            setNewRestaurant({ branch: '', restaurantAccountNumber: '', name: '', ownerName: '', phone: '', paymentPeriod: 'monthly', currencyType: 'old_riyal', classification: '', clientType: '', logoUrl: '', systemAccountNumber: '' });
            navigate(`/restaurants/${id}`);
        } catch (error) {
            console.error(error);
        }
    };

    const handleToggleActive = async (e: React.MouseEvent, restaurant: Restaurant) => {
        e.stopPropagation();
        const isCurrentlyActive = restaurant.isActive !== false;
        const confirmed = await confirmDialog(
            `هل أنت متأكد من ${isCurrentlyActive ? 'تعطيل' : 'تنشيط'} هذا المطعم؟\n${isCurrentlyActive ? 'لن يظهر المطعم في صفحات المدفوعات.' : 'سيظهر المطعم في صفحات المدفوعات مرة أخرى.'}`,
            { type: isCurrentlyActive ? 'warning' : 'info', confirmText: isCurrentlyActive ? 'تعطيل' : 'تنشيط', cancelText: 'إلغاء' }
        );
        if (confirmed) {
            try {
                await updateRestaurant(restaurant.id, { isActive: !isCurrentlyActive });
                // Log the action explicitly
                await addLog(
                    !isCurrentlyActive ? 'تنشيط مطعم' : 'تعطيل مطعم',
                    `تم ${!isCurrentlyActive ? 'تنشيط' : 'تعطيل'} حساب المطعم (${restaurant.name}) بواسطة ${currentUser?.name || currentUser?.username || 'المستخدم'}`,
                    'restaurant'
                );
            } catch (error) {
                console.error("Error toggling status:", error);
                alert("حدث خطأ أثناء تغيير الحالة");
            }
        }
    };

    const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws) as any[];

                let count = 0;
                for (const row of data) {
                    const name = row['اسم المطعم'] || row['Restaurant Name'] || row['Name'];
                    const branch = row['الفرع'] || row['Branch'];
                    const accNum = row['id في نظام توصيل'] || row['رقم الحساب'] || row['Account Number'] || row['AccNum'];
                    const owner = row['الاسم'] || row['المالك'] || row['Owner'] || '';
                    const phone = row['رقم التواصل'] || row['الهاتف'] || row['Phone'] || '';
                    const classification = row['التصنيف'] || row['Classification'] || '';
                    const clientType = row['النوع'] || row['Type'] || '';

                    const tType = row['طريقة التحويل'] || '';
                    const tAccNum = row['حساب التحويل'] || '';
                    const tBeneficiary = row['اسم المحول له'] || '';

                    const ppRaw = row['فترة السداد'] || '';
                    const paymentPeriod = ppRaw.includes('نصف') ? 'semi-monthly' : 'monthly';

                    if (name && branch && accNum) {
                        const transferAccounts = [];
                        if (tAccNum) {
                            transferAccounts.push({
                                id: crypto.randomUUID(),
                                type: String(tType),
                                accountNumber: String(tAccNum),
                                beneficiaryName: String(tBeneficiary) || String(owner)
                            });
                        }

                        await addRestaurant({
                            name: String(name),
                            branch: String(branch),
                            restaurantAccountNumber: String(accNum),
                            ownerName: String(owner),
                            phone: String(phone),
                            transferAccounts: transferAccounts,
                            paymentPeriod: paymentPeriod as 'monthly' | 'semi-monthly',
                            currencyType: getCurrencyByBranch(String(branch)),
                            classification: String(classification),
                            clientType: String(clientType)
                        });
                        count++;
                    }
                }
                alert(`تم استيراد ${count} مطعم بنجاح`);
            } catch (error) {
                console.error("Excel Import Error:", error);
                alert("حدث خطأ أثناء استيراد الملف. تأكد من ترويسة الأعمدة.");
            } finally {
                setIsImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleMerge = async () => {
        setIsMerging(true);
        try {
            await mergeRestaurants();
            alert('تم دمج المطاعم المتكررة بنجاح');
        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء الدمج');
        } finally {
            setIsMerging(false);
        }
    };

    const handleBulkUpdateToSemiMonthly = async () => {
        if (!await confirmDialog('تأكيد تحويل جميع المطاعم إلى نظام الدفع "نصف الشهري" (كل 15 يوم)؟', { type: 'warning', confirmText: 'تحويل الكل', cancelText: 'إلغاء' })) return;
        setIsUpdatingAll(true);
        try {
            let count = 0;
            for (const r of restaurants) {
                if (!r.id) continue;
                if (r.paymentPeriod !== 'semi-monthly') {
                    await updateRestaurant(r.id, { paymentPeriod: 'semi-monthly' });
                    count++;
                }
            }
            alert(`تم تحديث ${count} مطعم بنجاح إلى نظام نصف الشهري.`);
        } catch (error: any) {
            console.error('Bulk Semi-Monthly Update Error:', error);
            alert(`حدث خطأ أثناء التحديث الجماعي: ${error.message || error}`);
        } finally {
            setIsUpdatingAll(false);
        }
    };

    const handleDownloadTemplate = () => {
        const headers = [
            'اسم المطعم', 'الفرع', 'رقم الحساب', 'الاسم', 'رقم الهاتف',
            'التصنيف', 'النوع', 'طريقة التحويل', 'حساب التحويل', 'اسم المحول له', 'فترة السداد'
        ];
        const sampleData = [
            ['مطعم مثال', 'الفرع الرئيسي', '1001', 'اسم المالك', '0500000000', 'وجبات سريعة', 'توصيل', 'بنك', 'SA00000000000000', 'اسم المستفيد', 'شهري']
        ];

        const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "قالب المطاعم");
        XLSX.writeFile(wb, "قالب_استيراد_المطاعم.xlsx");
    };

    const handleExportFiltered = () => {
        const data = filteredRestaurants.map(r => ({
            'ID توصيل': r.restaurantAccountNumber,
            'اسم المطعم': r.name,
            'الفرع': r.branch,
            'المالك': r.ownerName,
            'الهاتف': r.phone,
            'التصنيف': r.classification,
            'الحالة': r.isActive !== false ? 'نشط' : 'معطل',
            'عدد الحسابات': r.transferAccounts?.length || 0,
            'الحساب الأساسي': r.transferAccounts?.find(a => a.isPrimary)?.accountNumber || 'لا يوجد'
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "المطاعم");
        XLSX.writeFile(wb, `بيانات_المطاعم_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleBulkUpdateCurrencies = async () => {
        if (!await confirmDialog('سيتم تحديث عملات جميع المطاعم بناءً على الفروع (قديم/جديد). هل أنت متأكد؟', { type: 'warning', confirmText: 'تحديث الكل', cancelText: 'إلغاء' })) return;
        setIsUpdatingCurrencies(true);
        try {
            let count = 0;
            for (const r of restaurants) {
                if (!r.id) continue;
                const correctCurrency = getCurrencyByBranch(r.branch);
                if (r.currencyType !== correctCurrency) {
                    await updateRestaurant(r.id, { currencyType: correctCurrency });
                    count++;
                }
            }
            alert(`تمت مزامنة عملات ${count} مطعم بنجاح!`);
        } catch (error: any) {
            console.error('Bulk Currency Update Error:', error);
            alert(`حدث خطأ أثناء تحديث العملات: ${error.message || error}`);
        } finally {
            setIsUpdatingCurrencies(false);
        }
    };

    return (
        <div className="p-4 md:p-8 space-y-6 animate-fade-in RTL" dir="rtl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-[var(--color-header)]">storefront</span>
                        دليل حسابات المطاعم
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 font-bold">المرجع الرئيسي لبيانات وحسابات المطاعم</p>
                </div>

                {(currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('restaurants_add') || currentUser?.permissions?.includes('restaurants_import') || currentUser?.permissions?.includes('restaurants_edit')) && (
                    <div className="flex gap-2 flex-wrap">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleExcelImport}
                            className="hidden"
                            accept=".xlsx, .xls"
                        />
                        {(currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('restaurants_edit')) && (
                            <div className="relative group">
                                <button
                                    className="px-6 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-white font-black rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-indigo-500">settings</span>
                                    إجراءات جماعية
                                    <span className="material-symbols-outlined text-xs">keyboard_arrow_down</span>
                                </button>
                                <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[110] overflow-hidden">
                                    <button
                                        onClick={() => navigate('/transfer-accounts')}
                                        className="w-full px-4 py-3 text-right hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-3 text-slate-700 dark:text-slate-300 font-bold transition-all border-b border-slate-50 dark:border-slate-700/50"
                                    >
                                        <span className="material-symbols-outlined text-indigo-500">manage_accounts</span>
                                        إدارة الطلبات
                                    </button>
                                    <button
                                        disabled={isMerging}
                                        onClick={handleMerge}
                                        className="w-full px-4 py-3 text-right hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-3 text-slate-700 dark:text-slate-300 font-bold transition-all border-b border-slate-50 dark:border-slate-700/50 disabled:opacity-50"
                                    >
                                        <span className="material-symbols-outlined text-amber-500">{isMerging ? 'sync' : 'merge'}</span>
                                        {isMerging ? 'جاري الدمج...' : 'دمج المتكرر'}
                                    </button>
                                    <button
                                        onClick={handleBulkUpdateCurrencies}
                                        className="w-full px-4 py-3 text-right hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-3 text-slate-700 dark:text-slate-300 font-bold transition-all border-b border-slate-50 dark:border-slate-700/50"
                                    >
                                        <span className="material-symbols-outlined text-blue-500">currency_exchange</span>
                                        تزامن كافة العملات
                                    </button>
                                    <button
                                        onClick={handleBulkUpdateToSemiMonthly}
                                        className="w-full px-4 py-3 text-right hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-3 text-slate-700 dark:text-slate-300 font-bold transition-all"
                                    >
                                        <span className="material-symbols-outlined text-green-500">calendar_month</span>
                                        تحويل نصف شهري (الكل)
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="h-10 w-px bg-slate-200 dark:bg-slate-700 mx-2 hidden md:block"></div>
                        {(currentUser?.role === 'super_admin' || currentUser?.role === 'admin' || currentUser?.permissions?.includes('restaurants_import')) && (
                            <div className="relative">
                                <button
                                    onClick={() => setIsDataMenuOpen(!isDataMenuOpen)}
                                    className="px-6 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-white font-black rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                                >
                                    <span className="material-symbols-outlined text-slate-500">grid_view</span>
                                    إدارة البيانات
                                    <span className={`material-symbols-outlined text-sm transition-transform ${isDataMenuOpen ? 'rotate-180' : ''}`}>expand_more</span>
                                </button>

                                {isDataMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setIsDataMenuOpen(false)}></div>
                                        <div className="absolute left-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-20 animate-scale-in origin-top-left">
                                            {(currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('restaurants_import')) && (
                                                <>
                                                    <button
                                                        onClick={() => { handleDownloadTemplate(); setIsDataMenuOpen(false); }}
                                                        className="w-full px-4 py-3 text-right hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-3 text-slate-700 dark:text-slate-300 font-bold transition-all border-b border-slate-50 dark:border-slate-700/50"
                                                    >
                                                        <span className="material-symbols-outlined text-red-500">download</span>
                                                        تحميل القالب
                                                    </button>
                                                    <button
                                                        disabled={isImporting}
                                                        onClick={() => { fileInputRef.current?.click(); setIsDataMenuOpen(false); }}
                                                        className="w-full px-4 py-3 text-right hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-3 text-slate-700 dark:text-slate-300 font-bold transition-all border-b border-slate-50 dark:border-slate-700/50 disabled:opacity-50"
                                                    >
                                                        <span className="material-symbols-outlined text-green-600">{isImporting ? 'sync' : 'upload_file'}</span>
                                                        {isImporting ? 'جاري الاستيراد...' : 'استيراد بيانات'}
                                                    </button>
                                                </>
                                            )}
                                            {(currentUser?.role === 'super_admin' || currentUser?.role === 'admin') && (
                                                <button
                                                    onClick={() => { handleExportFiltered(); setIsDataMenuOpen(false); }}
                                                    className="w-full px-4 py-3 text-right hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-3 text-slate-700 dark:text-slate-300 font-bold transition-all"
                                                >
                                                    <span className="material-symbols-outlined text-blue-500">download_for_offline</span>
                                                    تصدير إكسل
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        {(currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('restaurants_add')) && (
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="px-6 py-3 bg-[var(--color-header)] text-white font-black rounded-xl shadow-lg hover:scale-105 transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined">add_business</span>
                                إضافة مطعم
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative group/category">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <div className="size-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center">
                            <span className="material-symbols-outlined text-3xl font-bold">storefront</span>
                        </div>
                        <div>
                            <p className="text-xs font-black text-slate-400">إجمالي المطاعم <span className="text-[10px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-500">{selectedCategory === 'الكل' ? 'الكل' : selectedCategory}</span></p>
                            <p className="text-2xl font-black text-slate-800 dark:text-white">{restaurants.length}</p>
                        </div>
                    </div>
                    {/* Categories Dropdown */}
                    <div className="absolute right-0 top-full mt-2 w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 opacity-0 invisible group-hover/category:opacity-100 group-hover/category:visible transition-all z-[110] overflow-hidden">
                        <div className="max-h-60 overflow-y-auto">
                            <button
                                onClick={() => setSelectedCategory('الكل')}
                                className={`w-full px-4 py-2 text-right text-sm font-bold transition-colors ${selectedCategory === 'الكل' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                            >
                                الكل
                            </button>
                            <button
                                onClick={() => setSelectedCategory('بدون تصنيف')}
                                className={`w-full px-4 py-2 text-right text-sm font-bold transition-colors border-t border-slate-50 dark:border-slate-700 ${selectedCategory === 'بدون تصنيف' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                            >
                                بدون تصنيف
                            </button>
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`w-full px-4 py-2 text-right text-sm font-bold transition-colors border-t border-slate-50 dark:border-slate-700 ${selectedCategory === cat ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4 border-r-4 border-r-green-500">
                    <div className="size-14 rounded-2xl bg-green-50 dark:bg-green-900/20 text-green-600 flex items-center justify-center">
                        <span className="material-symbols-outlined text-3xl font-bold">check_circle</span>
                    </div>
                    <div>
                        <p className="text-xs font-black text-slate-400">نشط حالياً</p>
                        <p className="text-2xl font-black text-slate-800 dark:text-white">{restaurants.filter(r => r.isActive !== false).length}</p>
                    </div>
                </div>
                <div
                    className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20 transition-all border-r-4 border-r-red-500"
                    onClick={() => {
                        setAccountStatusFilter('بدون حساب');
                        setSearchTerm('');
                        setSearchField('all');
                        setSelectedBranch('الكل');
                        setSelectedCategory('الكل');
                        // Scroll to list
                        setTimeout(() => {
                            listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 50);
                    }}
                >
                    <div className="size-14 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-600 flex items-center justify-center">
                        <span className="material-symbols-outlined text-3xl font-bold">no_accounts</span>
                    </div>
                    <div>
                        <p className="text-xs font-black text-slate-400">بدون حساب تحويل</p>
                        <p className="text-2xl font-black text-slate-800 dark:text-white">{restaurants.filter(r => !r.transferAccounts || r.transferAccounts.length === 0).length}</p>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4">
                    <div className="size-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 flex items-center justify-center">
                        <span className="material-symbols-outlined text-3xl font-bold">pending_actions</span>
                    </div>
                    <div>
                        <p className="text-xs font-black text-slate-400">متوقف</p>
                        <p className="text-2xl font-black text-slate-800 dark:text-white">{restaurants.filter(r => r.isActive === false).length}</p>
                    </div>
                </div>
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-2 items-center text-sm font-bold">
                <button
                    onClick={() => setActiveFilter(activeFilter === 'نشط' ? 'الكل' : 'نشط')}
                    className={`px-4 py-2 rounded-xl transition-colors border ${activeFilter === 'نشط' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
                >
                    إظهار النشط فقط
                </button>
                <button
                    onClick={() => setAccountStatusFilter(accountStatusFilter === 'بدون حساب' ? 'الكل' : 'بدون حساب')}
                    className={`px-4 py-2 rounded-xl transition-colors border ${accountStatusFilter === 'بدون حساب' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
                >
                    إظهار من ليس لديهم حساب
                </button>
            </div>

            {/* Filters */}
            <div ref={listRef} className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="relative group md:col-span-2 flex items-center bg-slate-50 dark:bg-slate-700/50 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[var(--color-header)] transition-all">
                    <span className="pl-3 pr-4 material-symbols-outlined text-slate-400 text-sm">search</span>
                    <input
                        type="text"
                        placeholder="بحث سريع..."
                        value={searchTerm}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                        className="w-full py-3 bg-transparent border-none outline-none font-bold text-sm"
                    />
                    <select
                        value={searchField}
                        onChange={(e) => setSearchField(e.target.value as any)}
                        className="bg-transparent text-sm font-bold text-slate-600 dark:text-slate-300 px-2 py-3 outline-none border-r border-slate-200 dark:border-slate-600 cursor-pointer"
                    >
                        <option value="all">الكل</option>
                        <option value="name">الاسم</option>
                        <option value="account">رقم الحساب</option>
                        <option value="phone">الهاتف</option>
                    </select>
                </div>
                <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-sm">filter_list</span>
                    <select
                        value={selectedBranch}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedBranch(e.target.value)}
                        className="w-full pr-10 pl-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-none rounded-xl outline-none focus:ring-2 focus:ring-[var(--color-header)] transition-all font-bold text-sm appearance-none"
                    >
                        {branches.map(b => <option key={b} value={b}>{b === 'الكل' ? 'جميع الفروع' : b}</option>)}
                    </select>
                </div>
                <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-sm">toggle_on</span>
                    <select
                        value={activeFilter}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setActiveFilter(e.target.value as any)}
                        className="w-full pr-10 pl-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-none rounded-xl outline-none focus:ring-2 focus:ring-[var(--color-header)] transition-all font-bold text-sm appearance-none"
                    >
                        <option value="الكل">كل الحالات (نشط وغير نشط)</option>
                        <option value="نشط">نشط فقط</option>
                    </select>
                </div>
                <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-sm">category</span>
                    <select
                        value={selectedCategory}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedCategory(e.target.value)}
                        className="w-full pr-10 pl-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-none rounded-xl outline-none focus:ring-2 focus:ring-[var(--color-header)] transition-all font-bold text-sm appearance-none"
                    >
                        <option value="الكل">كل التصنيفات</option>
                        <option value="بدون تصنيف">بدون تصنيف</option>
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                </div>
            </div>

            <div className="flex justify-between items-center px-2">
                <span className="text-sm font-bold text-slate-500">
                    تم العثور على <strong className="text-indigo-600 dark:text-indigo-400">{filteredRestaurants.length}</strong> مطعم
                </span>
            </div>

            {/* Table View */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead className="bg-slate-50 dark:bg-slate-700/50">
                            <tr>
                                <th onClick={() => handleSort('restaurantAccountNumber')} className="p-4 text-xs font-black text-slate-500 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                                    <div className="flex items-center gap-2">
                                        #
                                        <SortIcon column="restaurantAccountNumber" />
                                    </div>
                                </th>
                                <th onClick={() => handleSort('name')} className="p-4 text-xs font-black text-slate-500 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                                    <div className="flex items-center gap-2">
                                        المطعم
                                        <SortIcon column="name" />
                                    </div>
                                </th>
                                <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400">معلومات التواصل</th>
                                <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400 text-center">حسابات المطعم</th>
                                <th onClick={() => handleSort('balance')} className="p-4 text-xs font-black text-slate-500 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                                    <div className="flex items-center gap-2 justify-center">
                                        الرصيد
                                        <SortIcon column="balance" />
                                    </div>
                                </th>
                                <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400 text-center w-[180px]">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {paginatedRestaurants.map((restaurant, index) => (
                                <tr key={restaurant.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group">
                                    <td className="p-4 text-sm font-bold text-slate-400 font-mono">
                                        <div className="flex items-center gap-1.5">
                                            <span>{restaurant.restaurantAccountNumber || '—'}</span>
                                            {restaurant.restaurantAccountNumber && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/chart-of-accounts?search=${restaurant.restaurantAccountNumber}`);
                                                    }}
                                                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 rounded-md transition-all"
                                                    title="عرض في دليل الحسابات"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">account_tree</span>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            {restaurant.logoUrl ? (
                                                <img src={restaurant.logoUrl} alt={restaurant.name} className="size-12 rounded-xl object-cover border border-slate-200 dark:border-slate-600" />
                                            ) : (
                                                <div className="size-12 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center text-slate-400">
                                                    <span className="material-symbols-outlined">storefront</span>
                                                </div>
                                            )}
                                            <div>
                                                <h3 className="font-bold text-slate-800 dark:text-white">{restaurant.name}</h3>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-md mt-1 inline-block border ${getBranchColorClasses(restaurant.branch)}`}>
                                                    {restaurant.branch}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                            <div className="flex items-center gap-1 mb-1">
                                                <span className="material-symbols-outlined text-xs text-slate-400">person</span>
                                                {restaurant.ownerName || '-'}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-xs text-slate-400">phone</span>
                                                {restaurant.phone || '-'}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        {restaurant.classification ? (
                                            <span className="px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-lg border border-amber-100 dark:border-amber-800">
                                                {restaurant.classification}
                                            </span>
                                        ) : <span className="text-slate-400 text-xs">-</span>}
                                    </td>
                                    <td className="p-4">
                                        {restaurant.clientType ? (
                                            <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-lg border border-blue-100 dark:border-blue-800">
                                                {restaurant.clientType}
                                            </span>
                                        ) : <span className="text-slate-400 text-xs">-</span>}
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-bold text-slate-500">
                                                {restaurant.paymentPeriod === 'monthly' ? 'شهري' : 'نصف شهري'}
                                            </span>
                                            <span className="text-[10px] text-slate-400">
                                                {restaurant.currencyType === 'new_riyal' ? 'ريال جديد' : 'ريال قديم'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        {restaurant.transferAccounts && restaurant.transferAccounts.length > 0 ? (
                                            <div
                                                onClick={() => navigate(`/restaurants/${restaurant.id}`)}
                                                className="flex flex-col items-center gap-1 cursor-pointer hover:scale-105 transition-transform"
                                            >
                                                {(() => {
                                                    const primaryAcc = restaurant.transferAccounts.find(a => a.isPrimary) || restaurant.transferAccounts[0];
                                                    const matchingAcc = paymentAccounts.find(pa => pa.accountName === primaryAcc.type);
                                                    const parentAcc = matchingAcc?.parentId ? paymentAccounts.find(pa => pa.id === matchingAcc.parentId) : null;

                                                    return (
                                                        <>
                                                            {parentAcc && (
                                                                <span className="text-[9px] font-bold text-slate-400 mb-0.5">
                                                                    {parentAcc.accountName}
                                                                </span>
                                                            )}
                                                            <span className="text-[10px] font-black text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-lg border border-green-100 dark:border-green-800">
                                                                {primaryAcc.type}
                                                            </span>
                                                            <span className="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300">
                                                                {primaryAcc.accountNumber}
                                                            </span>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => navigate(`/restaurants/${restaurant.id}?action=add_account`)}
                                                className="px-3 py-1.5 bg-amber-500 text-white text-[10px] font-black rounded-lg shadow-sm hover:bg-amber-600 hover:scale-105 transition-all flex items-center gap-1 mx-auto"
                                            >
                                                <span className="material-symbols-outlined text-sm">add</span>
                                                إضافة حساب
                                            </button>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={(e) => handleToggleActive(e, restaurant)}
                                                className={`p-2 rounded-lg transition-all ${restaurant.isActive !== false ? 'text-green-600 hover:bg-green-50' : 'text-red-400 hover:text-red-600 hover:bg-red-50'}`}
                                                title={restaurant.isActive !== false ? 'تعطيل' : 'تنشيط'}
                                            >
                                                <span className="material-symbols-outlined">
                                                    {restaurant.isActive !== false ? 'toggle_on' : 'toggle_off'}
                                                </span>
                                            </button>
                                            <button
                                                onClick={() => navigate(`/restaurants/${restaurant.id}`)}
                                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                title="التفاصيل / تعديل"
                                            >
                                                <span className="material-symbols-outlined">edit_square</span>
                                            </button>
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    const name = restaurant.name;
                                                    if (await confirmDialog(`تأكيد حذف المطعم (${name}) وكافة بياناته؟`, { type: 'danger', confirmText: 'حذف نهائي', cancelText: 'إلغاء' })) deleteRestaurant(restaurant.id);
                                                }}
                                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                title="حذف"
                                            >
                                                <span className="material-symbols-outlined">delete</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-slate-500 font-bold">
                        عرض {paginatedRestaurants.length} من {filteredRestaurants.length}
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="size-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-sm">chevron_right</span>
                            </button>
                            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                                صفحة {currentPage} من {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="size-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-sm">chevron_left</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Empty State */}
            {filteredRestaurants.length === 0 && (
                <div className="text-center py-20 bg-slate-50 dark:bg-slate-800/50 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-700">
                    <span className="material-symbols-outlined text-6xl text-slate-300 dark:text-slate-600 mb-4">search_off</span>
                    <p className="text-slate-500 dark:text-slate-400 font-bold">لا توجد نتائج تطابق بحثك</p>
                </div>
            )}

            {/* Add Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-scale-in" dir="rtl">
                        <div className="p-6 bg-[var(--color-header)] text-white flex items-center justify-between">
                            <h2 className="text-xl font-black flex items-center gap-2">
                                <span className="material-symbols-outlined">add_business</span>
                                إضافة مطعم جديد
                            </h2>
                            <button onClick={() => setIsAddModalOpen(false)} className="hover:rotate-90 transition-transform">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleAdd} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500 mr-1">اسم المطعم</label>
                                    <input
                                        required
                                        type="text"
                                        value={newRestaurant.name}
                                        onChange={(e) => setNewRestaurant({ ...newRestaurant, name: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500 mr-1">الفرع</label>
                                    <div className="flex gap-2 relative">
                                        <select
                                            required
                                            value={newRestaurant.branch.startsWith('__NEW__') ? '__NEW__' : newRestaurant.branch}
                                            onChange={(e) => {
                                                if (e.target.value === '__NEW__') {
                                                    setNewRestaurant({ ...newRestaurant, branch: '__NEW__' });
                                                } else {
                                                    setNewRestaurant({ ...newRestaurant, branch: e.target.value });
                                                }
                                            }}
                                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all appearance-none pr-10"
                                        >
                                            <option value="">اختر الفرع...</option>
                                            {branches.filter(b => b !== 'الكل').map(b => (
                                                <option key={b} value={b}>{b}</option>
                                            ))}
                                            <option value="__NEW__">+ إضافة فرع جديد...</option>
                                        </select>
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 pointer-events-none">expand_more</span>
                                    </div>
                                    {newRestaurant.branch.startsWith('__NEW__') && (
                                        <input
                                            required
                                            type="text"
                                            placeholder="اكتب اسم الفرع الجديد..."
                                            value={newRestaurant.branch.replace('__NEW__', '')}
                                            onChange={(e) => setNewRestaurant({ ...newRestaurant, branch: '__NEW__' + e.target.value })}
                                            className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all"
                                            autoFocus
                                        />
                                    )}
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-500 mr-1">رقم حساب المطعم</label>
                                <input
                                    required
                                    type="text"
                                    value={newRestaurant.restaurantAccountNumber}
                                    onChange={(e) => setNewRestaurant({ ...newRestaurant, restaurantAccountNumber: e.target.value })}
                                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-black text-emerald-600 mr-1">رقم الحساب في النظام الأساسي (اختياري)</label>
                                <input
                                    type="text"
                                    placeholder="رقم الحساب في tawseel.app"
                                    value={newRestaurant.systemAccountNumber}
                                    onChange={(e) => setNewRestaurant({ ...newRestaurant, systemAccountNumber: e.target.value })}
                                    className="w-full p-3 bg-emerald-50/50 dark:bg-emerald-900/10 border-2 border-emerald-100 dark:border-emerald-800/50 rounded-xl outline-none focus:border-emerald-500 font-bold transition-all"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500 mr-1">اسم المالك</label>
                                    <input
                                        type="text"
                                        value={newRestaurant.ownerName}
                                        onChange={(e) => setNewRestaurant({ ...newRestaurant, ownerName: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500 mr-1">رقم الهاتف</label>
                                    <input
                                        type="text"
                                        value={newRestaurant.phone}
                                        onChange={(e) => setNewRestaurant({ ...newRestaurant, phone: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500 mr-1">التصنيف</label>
                                    <input
                                        type="text"
                                        placeholder="مثال: حلويات، برجر"
                                        value={newRestaurant.classification}
                                        onChange={(e) => setNewRestaurant({ ...newRestaurant, classification: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500 mr-1">النوع</label>
                                    <input
                                        type="text"
                                        placeholder="مثال: توصيل، استلام"
                                        value={newRestaurant.clientType}
                                        onChange={(e) => setNewRestaurant({ ...newRestaurant, clientType: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-500 mr-1">رابط الشعار (اختياري)</label>
                                <input
                                    type="text"
                                    placeholder="https://example.com/logo.png"
                                    value={newRestaurant.logoUrl}
                                    onChange={(e) => setNewRestaurant({ ...newRestaurant, logoUrl: e.target.value })}
                                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500 mr-1">فترة السداد</label>
                                    <select
                                        value={newRestaurant.paymentPeriod}
                                        onChange={(e) => setNewRestaurant({ ...newRestaurant, paymentPeriod: e.target.value as 'monthly' | 'semi-monthly' })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all appearance-none"
                                    >
                                        <option value="monthly">شهرية (كل شهر)</option>
                                        <option value="semi-monthly">نصف شهرية (كل 15 يوم)</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500 mr-1">نوع العملة</label>
                                    <select
                                        value={newRestaurant.currencyType}
                                        onChange={(e) => setNewRestaurant({ ...newRestaurant, currencyType: e.target.value as 'old_riyal' | 'new_riyal' })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all appearance-none"
                                    >
                                        <option value="old_riyal">ريال قديم (Sana'a/Old)</option>
                                        <option value="new_riyal">ريال جديد (Aden/New)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="submit"
                                    className="flex-1 py-3 bg-[var(--color-header)] text-white font-black rounded-xl shadow-lg hover:brightness-110 transition-all"
                                >
                                    حفظ البيانات
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-black rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                >
                                    إلغاء
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};

export default RestaurantsPage;
