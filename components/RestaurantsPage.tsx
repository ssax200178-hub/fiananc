import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAppContext } from '../AppContext';
import { useNavigate } from 'react-router-dom';
import type { Restaurant, TransferAccount } from '../AppContext';
import * as XLSX from 'xlsx';

const RestaurantsPage: React.FC = () => {
    const { restaurants, addRestaurant, updateRestaurant, mergeRestaurants, currentUser, getCurrencyByBranch } = useAppContext();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [searchTerm, setSearchTerm] = useState(() => sessionStorage.getItem('rest_searchTerm') || '');
    const [selectedBranch, setSelectedBranch] = useState(() => sessionStorage.getItem('rest_selectedBranch') || 'الكل');
    const [selectedAccountType, setSelectedAccountType] = useState(() => sessionStorage.getItem('rest_selectedAccountType') || 'الكل');
    const [selectedPaymentPeriod, setSelectedPaymentPeriod] = useState(() => sessionStorage.getItem('rest_selectedPaymentPeriod') || 'الكل');
    const [accountSearch, setAccountSearch] = useState(() => sessionStorage.getItem('rest_accountSearch') || '');
    const [sortBy, setSortBy] = useState<'name' | 'branch' | 'newest'>(() => (sessionStorage.getItem('rest_sortBy') as 'name' | 'branch' | 'newest') || 'newest');

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isMerging, setIsMerging] = useState(false);
    const [isUpdatingAll, setIsUpdatingAll] = useState(false);
    const [isUpdatingCurrencies, setIsUpdatingCurrencies] = useState(false);

    // Persist filters to sessionStorage
    useEffect(() => {
        sessionStorage.setItem('rest_searchTerm', searchTerm);
    }, [searchTerm]);

    useEffect(() => {
        sessionStorage.setItem('rest_selectedBranch', selectedBranch);
    }, [selectedBranch]);

    useEffect(() => {
        sessionStorage.setItem('rest_selectedAccountType', selectedAccountType);
    }, [selectedAccountType]);

    useEffect(() => {
        sessionStorage.setItem('rest_accountSearch', accountSearch);
    }, [accountSearch]);

    useEffect(() => {
        sessionStorage.setItem('rest_selectedPaymentPeriod', selectedPaymentPeriod);
    }, [selectedPaymentPeriod]);

    useEffect(() => {
        sessionStorage.setItem('rest_sortBy', sortBy);
    }, [sortBy]);

    const [newRestaurant, setNewRestaurant] = useState({
        branch: '',
        restaurantAccountNumber: '',
        name: '',
        ownerName: '',
        phone: '',
        paymentPeriod: 'monthly' as 'monthly' | 'semi-monthly',
        currencyType: 'old_riyal' as 'old_riyal' | 'new_riyal'
    });

    const branches = ['الكل', ...Array.from(new Set(restaurants.map(r => r.branch)))];
    const accountTypes = ['الكل', ...Array.from(new Set(restaurants.flatMap(r => r.transferAccounts?.map(acc => acc.type) || []).filter(Boolean)))];

    const filteredRestaurants = restaurants.filter(r => {
        const matchesMain = r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.restaurantAccountNumber.includes(searchTerm);

        const matchesBranch = selectedBranch === 'الكل' || r.branch === selectedBranch;

        const matchesPayment = selectedPaymentPeriod === 'الكل' || r.paymentPeriod === selectedPaymentPeriod;

        const matchesAccount = (!accountSearch || r.transferAccounts?.some(acc =>
            acc.accountNumber.includes(accountSearch) ||
            acc.beneficiaryName.toLowerCase().includes(accountSearch.toLowerCase()) ||
            acc.type.toLowerCase().includes(accountSearch.toLowerCase())
        )) && (selectedAccountType === 'الكل' || r.transferAccounts?.some(acc => acc.type === selectedAccountType));

        return matchesMain && matchesBranch && matchesAccount && matchesPayment;
    }).sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name, 'ar');
        if (sortBy === 'branch') return a.branch.localeCompare(b.branch, 'ar');
        if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return 0;
    });

    // Pagination
    const ITEMS_PER_PAGE = 50;
    const [currentPage, setCurrentPage] = useState(1);
    const totalPages = Math.ceil(filteredRestaurants.length / ITEMS_PER_PAGE);
    const paginatedRestaurants = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredRestaurants.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredRestaurants, currentPage]);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedBranch, selectedAccountType, selectedPaymentPeriod, accountSearch, sortBy]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const id = await addRestaurant({
                ...newRestaurant,
                transferAccounts: []
            });
            setIsAddModalOpen(false);
            setNewRestaurant({ branch: '', restaurantAccountNumber: '', name: '', ownerName: '', phone: '', paymentPeriod: 'monthly', currencyType: 'old_riyal' });
            navigate(`/restaurants/${id}`);
        } catch (error) {
            console.error(error);
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
                    // Mapping expected columns from the screenshot provided by user
                    const name = row['اسم المطعم'] || row['Restaurant Name'] || row['Name'];
                    const branch = row['الفرع'] || row['Branch'];
                    const accNum = row['id في نظام توصيل'] || row['رقم الحساب'] || row['Account Number'] || row['AccNum'];
                    const owner = row['الاسم'] || row['المالك'] || row['Owner'] || '';
                    const phone = row['رقم التواصل'] || row['الهاتف'] || row['Phone'] || '';

                    // Transfer Account data
                    const tType = row['طريقة التحويل'] || '';
                    const tAccNum = row['حساب التحويل'] || '';
                    const tBeneficiary = row['اسم المحول له'] || '';

                    // Payment Period
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
                            paymentPeriod: paymentPeriod as 'monthly' | 'semi-monthly'
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
        if (!confirm('تأكيد تحويل جميع المطاعم إلى نظام الدفع "نصف الشهري" (كل 15 يوم)؟')) return;
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

    const handleBulkUpdateCurrencies = async () => {
        if (!confirm('سيتم تحديث عملات جميع المطاعم بناءً على الفروع (قديم/جديد). هل أنت متأكد؟')) return;
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

                {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
                    <div className="flex gap-2">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleExcelImport}
                            className="hidden"
                            accept=".xlsx, .xls"
                        />
                        <button
                            disabled={isMerging}
                            onClick={handleMerge}
                            className="px-6 py-3 bg-amber-600 text-white font-black rounded-xl shadow-lg hover:bg-amber-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined">{isMerging ? 'sync' : 'merge'}</span>
                            {isMerging ? 'جاري الدمج...' : 'دمج المتكرر'}
                        </button>
                        <button
                            disabled={isUpdatingAll}
                            onClick={handleBulkUpdateToSemiMonthly}
                            className="px-6 py-3 bg-purple-600 text-white font-black rounded-xl shadow-lg hover:bg-purple-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined">{isUpdatingAll ? 'sync' : 'event_repeat'}</span>
                            {isUpdatingAll ? 'جاري التحديث...' : 'تحويل الكل لنظام نصف شهر'}
                        </button>
                        <button
                            disabled={isUpdatingCurrencies}
                            onClick={handleBulkUpdateCurrencies}
                            className="px-6 py-3 bg-indigo-600 text-white font-black rounded-xl shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined">{isUpdatingCurrencies ? 'sync' : 'sync_alt'}</span>
                            {isUpdatingCurrencies ? 'جاري المزامنة...' : 'مزامنة عملات الفروع (قديم/جديد)'}
                        </button>
                        <button
                            disabled={isImporting}
                            onClick={() => fileInputRef.current?.click()}
                            className="px-6 py-3 bg-green-600 text-white font-black rounded-xl shadow-lg hover:bg-green-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined">{isImporting ? 'sync' : 'upload_file'}</span>
                            {isImporting ? 'جاري الاستيراد...' : 'استيراد من إكسل'}
                        </button>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="px-6 py-3 bg-[var(--color-header)] text-white font-black rounded-xl shadow-lg hover:scale-105 transition-all flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined">add_business</span>
                            إضافة مطعم
                        </button>
                    </div>
                )}
            </div>

            {/* Advanced Filters & Sorting */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="relative group">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-sm">search</span>
                    <input
                        type="text"
                        placeholder="اسم المطعم أو ID..."
                        value={searchTerm}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                        className="w-full pr-10 pl-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-none rounded-xl outline-none focus:ring-2 focus:ring-[var(--color-header)] transition-all font-bold text-sm"
                    />
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
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-sm">account_balance_wallet</span>
                    <select
                        value={selectedAccountType}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedAccountType(e.target.value)}
                        className="w-full pr-10 pl-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-none rounded-xl outline-none focus:ring-2 focus:ring-[var(--color-header)] transition-all font-bold text-sm appearance-none"
                    >
                        {accountTypes.map(t => <option key={t} value={t}>{t === 'الكل' ? 'جميع أنواع الحسابات' : t}</option>)}
                    </select>
                </div>
                <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-sm">sort</span>
                    <select
                        value={sortBy}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value as 'name' | 'branch' | 'newest')}
                        className="w-full pr-10 pl-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-none rounded-xl outline-none focus:ring-2 focus:ring-[var(--color-header)] transition-all font-bold text-sm appearance-none"
                    >
                        <option value="newest">الأحدث أولاً</option>
                        <option value="name">الاسم (أ-ي)</option>
                        <option value="branch">الفرع</option>
                    </select>
                </div>
                <div className="relative group">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-sm">event_repeat</span>
                    <select
                        value={selectedPaymentPeriod}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedPaymentPeriod(e.target.value)}
                        className="w-full pr-10 pl-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-none rounded-xl outline-none focus:ring-2 focus:ring-[var(--color-header)] transition-all font-bold text-sm appearance-none"
                    >
                        <option value="الكل">جميع فترات السداد</option>
                        <option value="monthly">شهرية</option>
                        <option value="semi-monthly">نصف شهرية</option>
                    </select>
                </div>
                <div className="relative group">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-sm">payments</span>
                    <input
                        type="text"
                        placeholder="بحث برقم الحساب..."
                        value={accountSearch}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAccountSearch(e.target.value)}
                        className="w-full pr-10 pl-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-none rounded-xl outline-none focus:ring-2 focus:ring-[var(--color-header)] transition-all font-bold text-sm"
                    />
                </div>
            </div>

            {/* Result Count */}
            <div className="flex items-center gap-3 text-sm font-bold text-slate-500 dark:text-slate-400">
                <span className="material-symbols-outlined text-lg">info</span>
                عرض {paginatedRestaurants.length} من {filteredRestaurants.length} مطعم
                {filteredRestaurants.length !== restaurants.length && <span>(إجمالي: {restaurants.length})</span>}
                {totalPages > 1 && <span>• صفحة {currentPage} من {totalPages}</span>}
            </div>

            {/* List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedRestaurants.map(restaurant => (
                    <div
                        key={restaurant.id}
                        onClick={() => navigate(`/restaurants/${restaurant.id}`)}
                        className="p-5 bg-white dark:bg-slate-800 rounded-2xl border-2 border-transparent hover:border-[var(--color-header)] transition-all cursor-pointer group shadow-sm hover:shadow-xl"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="size-14 bg-slate-50 dark:bg-slate-700/50 rounded-2xl flex items-center justify-center group-hover:bg-[var(--color-header)] group-hover:text-white transition-all">
                                <span className="material-symbols-outlined text-3xl">restaurant</span>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <span className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs font-black rounded-lg">
                                    {restaurant.branch}
                                </span>
                                <span className={`px-3 py-1 text-[10px] font-black rounded-lg border ${restaurant.paymentPeriod === 'semi-monthly'
                                    ? 'bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800'
                                    : 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
                                    }`}>
                                    {restaurant.paymentPeriod === 'semi-monthly' ? 'نصف شهرية' : 'شهرية'}
                                </span>
                                <span className={`px-3 py-1 text-[10px] font-black rounded-lg border ${restaurant.currencyType === 'new_riyal'
                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
                                    : 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
                                    }`}>
                                    {restaurant.currencyType === 'new_riyal' ? 'ريال جديد' : 'ريال قديم'}
                                </span>
                            </div>
                        </div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white mb-1">{restaurant.name}</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-bold flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">fingerprint</span>
                            ID: {restaurant.restaurantAccountNumber}
                        </p>

                        {/* Account Priority / Fallback Snapshot */}
                        <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-100 dark:border-slate-700">
                            {(() => {
                                const primaryAcc = restaurant.transferAccounts?.find((a: TransferAccount) => a.isPrimary);
                                const firstAcc = restaurant.transferAccounts && restaurant.transferAccounts.length > 0 ? restaurant.transferAccounts[0] : null;
                                const displayAcc = primaryAcc || firstAcc;

                                if (displayAcc) {
                                    return (
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[10px] font-black flex items-center gap-1 ${displayAcc.isPrimary ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                                                    <span className="material-symbols-outlined text-[12px]">{displayAcc.isPrimary ? 'star' : 'payments'}</span>
                                                    {displayAcc.isPrimary ? 'الحساب الأساسي' : 'حساب تحويل'}
                                                </span>
                                                <span className="text-[9px] font-black bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-700">{displayAcc.type}</span>
                                            </div>
                                            <p className="text-sm font-black text-slate-700 dark:text-white truncate">{displayAcc.beneficiaryName}</p>
                                            <p className="text-lg font-black text-[var(--color-header)] tracking-wider">
                                                {displayAcc.accountNumber}
                                            </p>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black text-slate-400 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[12px]">account_balance</span>
                                                حساب المطعم
                                            </span>
                                        </div>
                                        <p className="text-sm font-black text-slate-700 dark:text-white truncate">{restaurant.ownerName || 'بيانات المطعم الأساسية'}</p>
                                        <p className="text-lg font-black text-slate-500 tracking-wider font-mono">{restaurant.restaurantAccountNumber}</p>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-700 flex items-center justify-between text-[10px] font-bold text-slate-400">
                            <span className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">person</span>
                                {restaurant.ownerName || 'بدون اسم'}
                            </span>
                            <div className="flex items-center gap-3">
                                {restaurant.phone && (
                                    <span className="flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">call</span>
                                        {restaurant.phone.slice(-4)}
                                    </span>
                                )}
                                <div className="flex items-center gap-1 text-[var(--color-header)] bg-[var(--color-header)]/5 px-2 py-0.5 rounded-full">
                                    <span className="material-symbols-outlined text-xs">payments</span>
                                    {restaurant.transferAccounts?.length || 0}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {filteredRestaurants.length === 0 && (
                <div className="text-center py-20 bg-slate-50 dark:bg-slate-800/50 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-700">
                    <span className="material-symbols-outlined text-6xl text-slate-300 dark:text-slate-600 mb-4">search_off</span>
                    <p className="text-slate-500 dark:text-slate-400 font-bold">لا توجد نتائج تطابق بحثك</p>
                </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 flex-wrap py-4">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
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
                                    onClick={() => setCurrentPage(page)}
                                    className={`w-10 h-10 rounded-xl font-black text-sm transition-all ${page === currentPage
                                            ? 'bg-[var(--color-header)] text-white shadow-lg'
                                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                                        }`}
                                >
                                    {page}
                                </button>
                            </React.Fragment>
                        ))}
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                        التالي
                        <span className="material-symbols-outlined text-sm">chevron_left</span>
                    </button>
                </div>
            )}

            {/* Add Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-scale-in" dir="rtl">
                        <div className="p-6 bg-[var(--color-header)] text-white flex items-center justify-between">
                            <h2 className="text-xl font-black flex items-center gap-2">
                                <span className="material-symbols-outlined">add_business</span>
                                إضافة مطعم جديد
                            </h2>
                            <button onClick={() => setIsAddModalOpen(false)} className="hover:rotate-90 transition-transform">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleAdd} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500 mr-1">اسم المطعم</label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="مثال: مطعم النور"
                                        value={newRestaurant.name}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRestaurant({ ...newRestaurant, name: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500 mr-1">الفرع</label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="مثال: صنعاء - حدة"
                                        value={newRestaurant.branch}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRestaurant({ ...newRestaurant, branch: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-500 mr-1">رقم حساب المطعم</label>
                                <input
                                    required
                                    type="text"
                                    placeholder="رقم الحساب في النظام"
                                    value={newRestaurant.restaurantAccountNumber}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRestaurant({ ...newRestaurant, restaurantAccountNumber: e.target.value })}
                                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500 mr-1">اسم المالك</label>
                                    <input
                                        type="text"
                                        placeholder="اسم مالك المطعم"
                                        value={newRestaurant.ownerName}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRestaurant({ ...newRestaurant, ownerName: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500 mr-1">رقم الهاتف</label>
                                    <input
                                        type="text"
                                        placeholder="رقم للتواصل"
                                        value={newRestaurant.phone}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRestaurant({ ...newRestaurant, phone: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-500 mr-1">فترة السداد</label>
                                <select
                                    value={newRestaurant.paymentPeriod}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewRestaurant({ ...newRestaurant, paymentPeriod: e.target.value as 'monthly' | 'semi-monthly' })}
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
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewRestaurant({ ...newRestaurant, currencyType: e.target.value as 'old_riyal' | 'new_riyal' })}
                                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold transition-all appearance-none"
                                >
                                    <option value="old_riyal">ريال قديم (Sana'a/Old)</option>
                                    <option value="new_riyal">ريال جديد (Aden/New)</option>
                                </select>
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
