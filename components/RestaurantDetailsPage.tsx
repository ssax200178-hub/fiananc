import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAppContext, ACCOUNT_TYPES, APPROVAL_PERIODS } from '../AppContext';
import type { Restaurant, TransferAccount } from '../AppContext';
import { generateId, safeCompare, safeSessionGet } from '../utils';
import { confirmDialog } from '../utils/confirm';
import InlineActivityLog from './InlineActivityLog';

const RestaurantDetailsPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { restaurants, updateRestaurant, deleteRestaurant, currentUser, addLog, paymentAccounts } = useAppContext();

    const branches = useMemo(() => ['الكل', ...Array.from(new Set(restaurants.map(r => r.branch)))], [restaurants]);

    const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
    const [isEditingBase, setIsEditingBase] = useState(false);
    const [editForm, setEditForm] = useState<Partial<Restaurant>>({});

    const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
    const [newAccount, setNewAccount] = useState<Omit<TransferAccount, 'id'>>({
        type: '',
        accountNumber: '',
        beneficiaryName: '',
        isPrimary: false,
        uniqueCode: '',
        approvalPeriod: 'نوفمبر 1',
        status: 'pending',
        parentAccountId: ''
    });

    const accountTypes = useMemo(() => {
        const mains = paymentAccounts.filter(a => a.isMain).map(a => a.accountName);
        return mains.length > 0 ? mains : ACCOUNT_TYPES;
    }, [paymentAccounts]);

    useEffect(() => {
        if (accountTypes.length > 0 && !newAccount.type) {
            setNewAccount(prev => ({ ...prev, type: accountTypes[0] }));
        }
    }, [accountTypes]);
    const approvalPeriodsList = APPROVAL_PERIODS;

    useEffect(() => {
        console.log("RestaurantDetailsPage: useEffect triggered", { id, restaurantsCount: restaurants.length });
        const found = restaurants.find((r: Restaurant) => r.id === id);
        if (found) {
            console.log("RestaurantDetailsPage: Restaurant found", found.name);
            setRestaurant(found);
            setEditForm(found);

            // Handle deep-link actions
            const searchParams = new URLSearchParams(location.search);
            const action = searchParams.get('action');
            if (action === 'add_account') {
                console.log("RestaurantDetailsPage: Action add_account detected");
                setIsAddAccountModalOpen(true);
                // Clear the param from URL to prevent reopening on refresh
                navigate(`/restaurants/${id}`, { replace: true });
            }
        } else if (restaurants.length > 0) {
            console.warn("RestaurantDetailsPage: Restaurant not found in list", id);
        }
    }, [id, restaurants, location.search, navigate]);

    // Sequential Navigation - Moved up to fix "Rendered more hooks" error
    const sortedRestaurants = useMemo(() => {
        if (!restaurants || !restaurants.length) return [];
        const sortBy = safeSessionGet('rest_sortBy', 'newest') as 'name' | 'branch' | 'newest';

        return [...restaurants].sort((a, b) => {
            try {
                if (sortBy === 'name') return safeCompare(a.name, b.name);
                if (sortBy === 'branch') return safeCompare(a.branch, b.branch);
                if (sortBy === 'newest') {
                    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
                }
            } catch (e) {
                console.error("Sort error:", e);
            }
            return 0;
        });
    }, [restaurants, location.search]);

    const currentIndex = sortedRestaurants.findIndex(r => r.id === id);
    const prevRestaurant = currentIndex > 0 ? sortedRestaurants[currentIndex - 1] : null;
    const nextRestaurant = currentIndex < sortedRestaurants.length - 1 ? sortedRestaurants[currentIndex + 1] : null;
    const canManage = currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('restaurants_edit');

    if (!restaurant) {
        const hasLoadedAll = restaurants.length > 0;
        console.log("RestaurantDetailsPage: Checking state", { id, hasLoadedAll, listSize: restaurants.length });

        if (hasLoadedAll && !restaurants.find(r => r.id === id)) {
            return (
                <div className="p-8 flex flex-col items-center justify-center min-h-[50vh] text-center">
                    <span className="material-symbols-outlined text-6xl text-red-300 mb-4">error</span>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-white">المطعم غير موجود</h2>
                    <p className="mt-2 text-slate-500 font-bold">عذراً، لم نتمكن من العثور على المطعم المطلوب.</p>
                    <button
                        onClick={() => navigate('/restaurants')}
                        className="mt-6 px-6 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition"
                    >
                        العودة للدليل
                    </button>
                </div>
            );
        }

        return (
            <div className="p-8 flex items-center justify-center min-h-[50vh]">
                <div className="text-center">
                    <span className="material-symbols-outlined text-6xl text-slate-300 animate-pulse">storefront</span>
                    <p className="mt-4 text-slate-500 font-bold">جاري تحميل بيانات المطعم...</p>
                    <p className="text-[10px] text-slate-400 mt-2">ID: {id}</p>
                </div>
            </div>
        );
    }

    const handleUpdateBase = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;
        await updateRestaurant(id, editForm);
        setIsEditingBase(false);
    };

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!restaurant) return;

        const accounts = restaurant.transferAccounts || [];
        const isFirst = accounts.length === 0;
        const account: TransferAccount = {
            ...newAccount,
            id: generateId(),
            isPrimary: isFirst || newAccount.isPrimary,
            isActive: true
        };

        let updatedAccounts = [...accounts];
        if (account.isPrimary) {
            updatedAccounts = updatedAccounts.map(a => ({ ...a, isPrimary: false }));
        }
        updatedAccounts.push(account);

        await updateRestaurant(id!, { transferAccounts: updatedAccounts });
        setIsAddAccountModalOpen(false);
        setNewAccount({
            type: accountTypes[0] || '',
            accountNumber: '',
            beneficiaryName: '',
            isPrimary: false,
            uniqueCode: '',
            approvalPeriod: 'نوفمبر 1',
            status: 'pending',
            parentAccountId: ''
        });
    };

    const handleUpdateAccountStatus = async (accountId: string, status: 'approved' | 'error') => {
        if (!id || !restaurant) return;
        const updatedAccounts = (restaurant.transferAccounts || []).map(a =>
            a.id === accountId ? { ...a, status } : a
        );
        await updateRestaurant(id, { transferAccounts: updatedAccounts });
        await addLog(
            status === 'approved' ? 'اعتماد حساب' : 'تحديد خطأ بحساب',
            `تم ${status === 'approved' ? 'اعتماد' : 'تحديد كخطأ'} بيانات التحويل للمطعم (${restaurant.name}) بواسطة ${currentUser?.name || currentUser?.username || 'المستخدم'}`,
            'restaurant'
        );
    };

    const handleDeleteAccount = async (account: TransferAccount) => {
        if (!restaurant) return;
        const confirmed = await confirmDialog('تأكيد حذف حساب التحويل هذا؟', { type: 'danger', confirmText: 'حذف', cancelText: 'إلغاء' });
        if (!confirmed) return;

        const accounts = restaurant.transferAccounts || [];
        const updatedAccounts = accounts.filter(a => a.id !== account.id);

        // If we deleted the primary, make the first one primary
        if (updatedAccounts.length > 0 && !updatedAccounts.some(a => a.isPrimary)) {
            updatedAccounts[0].isPrimary = true;
        }
        await updateRestaurant(restaurant.id, { transferAccounts: updatedAccounts });

        // Log the action explicitly
        await addLog(
            'حذف حساب تحويل',
            `تم حذف حساب التحويل (${account.type} - ${account.beneficiaryName}) للمطعم (${restaurant.name}) بواسطة ${currentUser?.name || currentUser?.username || 'المستخدم'}`,
            'restaurant'
        );
    };

    const handleToggleAccountActive = async (account: TransferAccount) => {
        if (!restaurant || !account) return;

        const accounts = (restaurant.transferAccounts || []).filter(a => !!a && !!a.id);
        const updatedAccounts = accounts.map(a =>
            a.id === account.id ? { ...a, isActive: !a.isActive } : a
        );
        await updateRestaurant(restaurant.id, { transferAccounts: updatedAccounts });

        await addLog(
            !account.isActive ? 'تنشيط حساب تحويل' : 'تعطيل حساب تحويل',
            `تم ${!account.isActive ? 'تنشيط' : 'تعطيل'} حساب التحويل (${account.type} - ${account.beneficiaryName}) للمطعم (${restaurant.name}) بواسطة ${currentUser?.name || currentUser?.username || 'المستخدم'}`,
            'restaurant'
        );
    };

    const handleTogglePrimary = async (accountId: string) => {
        if (!id || !restaurant) return;

        const accounts = restaurant.transferAccounts || [];
        const updatedAccounts = accounts.map(a => ({
            ...a,
            isPrimary: a.id === accountId ? !a.isPrimary : false
        }));
        await updateRestaurant(id, { transferAccounts: updatedAccounts });
    };

    const handleToggleActive = async () => {
        if (!restaurant || !id) return;
        const isCurrentlyActive = restaurant.isActive !== false;
        const confirmed = await confirmDialog(
            `هل أنت متأكد من ${isCurrentlyActive ? 'تعطيل' : 'تنشيط'} هذا المطعم؟\n${isCurrentlyActive ? 'لن يظهر المطعم في صفحات المدفوعات.' : 'سيظهر المطعم في صفحات المدفوعات مرة أخرى.'}`,
            { type: isCurrentlyActive ? 'warning' : 'info', confirmText: isCurrentlyActive ? 'تعطيل' : 'تنشيط', cancelText: 'إلغاء' }
        );
        if (confirmed) {
            try {
                await updateRestaurant(id, { isActive: !isCurrentlyActive });
                setRestaurant(prev => prev ? { ...prev, isActive: !isCurrentlyActive } : null); // Update local state immediately

                // Log the action
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

    return (
        <div className="p-4 md:p-8 space-y-8 animate-fade-in RTL" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/restaurants')}
                        className="size-12 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center hover:bg-slate-50 transition-all border border-slate-100 dark:border-slate-700 shadow-sm"
                        title="العودة للدليل"
                    >
                        <span className="material-symbols-outlined">arrow_forward</span>
                    </button>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <h1 className="text-3xl font-black text-slate-800 dark:text-white">{restaurant.name}</h1>
                            <span className={`px-3 py-1 text-xs font-black rounded-lg border ${restaurant.isActive !== false
                                ? 'bg-green-50 text-green-600 border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                                : 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                                }`}>
                                {restaurant.isActive !== false ? 'نشط' : 'غير نشط'}
                            </span>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 font-bold">فرع: {restaurant.branch} | رقم الحساب: {restaurant.restaurantAccountNumber}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="bg-white dark:bg-slate-800 p-1 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-1">
                        <button
                            disabled={!nextRestaurant}
                            onClick={() => navigate(`/restaurants/${nextRestaurant?.id}`)}
                            className="px-4 py-2 text-sm font-black text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1"
                        >
                            التالي
                            <span className="material-symbols-outlined text-sm">chevron_left</span>
                        </button>
                        <div className="w-px h-6 bg-slate-100 dark:bg-slate-700 mx-1"></div>
                        <button
                            disabled={!prevRestaurant}
                            onClick={() => navigate(`/restaurants/${prevRestaurant?.id}`)}
                            className="px-4 py-2 text-sm font-black text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1"
                        >
                            <span className="material-symbols-outlined text-sm">chevron_right</span>
                            السابق
                        </button>
                    </div>
                </div>

                {canManage && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => navigate(`/payments/history?restaurant=${encodeURIComponent(restaurant.name)}`)}
                            className="px-4 py-3 bg-indigo-50 text-indigo-600 border border-indigo-100 font-black rounded-xl hover:bg-indigo-100 transition-all flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined">history</span>
                            سجل السداد
                        </button>
                        <button
                            onClick={handleToggleActive}
                            className={`px-4 py-3 font-black rounded-xl border transition-all flex items-center gap-2 ${restaurant.isActive !== false
                                ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'
                                : 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100'}`}
                        >
                            <span className="material-symbols-outlined">
                                {restaurant.isActive !== false ? 'toggle_off' : 'toggle_on'}
                            </span>
                            {restaurant.isActive !== false ? 'تعطيل' : 'تنشيط'}
                        </button>

                        <button
                            onClick={async () => {
                                if (await confirmDialog('هل أنت متأكد من حذف المطعم نهائياً؟', { type: 'danger', confirmText: 'حذف نهائي', cancelText: 'إلغاء' })) {
                                    await deleteRestaurant(restaurant.id);
                                    navigate('/restaurants');
                                }
                            }}
                            className="size-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 transition-all border border-red-100"
                            title="حذف المطعم"
                        >
                            <span className="material-symbols-outlined">delete</span>
                        </button>
                        <button
                            onClick={() => setIsEditingBase(true)}
                            className="px-6 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-white font-black rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined">edit</span>
                            تعديل البيانات
                        </button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Information Card */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-700">
                        <h3 className="text-lg font-black mb-6 flex items-center gap-2 text-slate-800 dark:text-white">
                            <span className="material-symbols-outlined text-[var(--color-header)]">info</span>
                            تفاصيل المطعم
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-2xl">
                                <span className="size-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-[var(--color-header)] shadow-sm">
                                    <span className="material-symbols-outlined">person</span>
                                </span>
                                <div>
                                    <p className="text-[10px] font-black text-slate-400">مالك المطعم</p>
                                    <p className="font-bold text-slate-700 dark:text-white">{restaurant.ownerName || 'غير محدد'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-2xl">
                                <span className="size-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-[var(--color-header)] shadow-sm">
                                    <span className="material-symbols-outlined">phone_iphone</span>
                                </span>
                                <div className="flex-1">
                                    <p className="text-[10px] font-black text-slate-400">رقم الهاتف (رئيسي)</p>
                                    <p className="font-bold text-slate-700 dark:text-white" dir="ltr">{restaurant.phone || 'غير محدد'}</p>
                                </div>
                            </div>
                            {restaurant.secondaryPhone && (
                                <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-2xl">
                                    <span className="size-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-amber-500 shadow-sm">
                                        <span className="material-symbols-outlined">contact_phone</span>
                                    </span>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-black text-slate-400">رقم إضافي ({restaurant.secondaryPhoneOwner || 'بدون اسم'})</p>
                                        <p className="font-bold text-slate-700 dark:text-white" dir="ltr">{restaurant.secondaryPhone}</p>
                                    </div>
                                </div>
                            )}
                            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-2xl">
                                <span className="size-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-[var(--color-header)] shadow-sm">
                                    <span className="material-symbols-outlined">calendar_today</span>
                                </span>
                                <div>
                                    <p className="text-[10px] font-black text-slate-400">تاريخ الإضافة</p>
                                    <p className="font-bold text-slate-700 dark:text-white">{restaurant.createdAt ? new Date(restaurant.createdAt).toLocaleDateString('ar-SA') : '-'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-2xl">
                                <span className={`size-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm ${restaurant.paymentPeriod === 'semi-monthly' ? 'text-purple-500' : 'text-blue-500'
                                    }`}>
                                    <span className="material-symbols-outlined">event_repeat</span>
                                </span>
                                <div>
                                    <p className="font-bold text-slate-700 dark:text-white">
                                        {restaurant.paymentPeriod === 'semi-monthly' ? 'نصف شهرية (كل 15 يوم)' : 'شهرية (كل شهر)'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-2xl">
                                <span className={`size-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm ${restaurant.currencyType === 'new_riyal' ? 'text-emerald-500' : 'text-amber-500'
                                    }`}>
                                    <span className="material-symbols-outlined">payments</span>
                                </span>
                                <div>
                                    <p className="text-[10px] font-black text-slate-400">نوع العملة</p>
                                    <p className="font-bold text-slate-700 dark:text-white">
                                        {restaurant.currencyType === 'new_riyal' ? 'ريال جديد (Aden)' : 'ريال قديم (Sana\'a)'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-2xl border-2 border-[var(--color-header)]/20">
                                <span className="size-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-[var(--color-header)] shadow-sm">
                                    <span className="material-symbols-outlined">account_balance_wallet</span>
                                </span>
                                <div>
                                    <p className="text-[10px] font-black text-slate-400">الرصيد المتبقي</p>
                                    <p className="text-xl font-black text-[var(--color-header)]">
                                        {(restaurant.balance || 0).toLocaleString()} <span className="text-xs">YER</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Transfer Accounts Section */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-2xl font-black flex items-center gap-3 text-slate-800 dark:text-white">
                            <span className="material-symbols-outlined text-4xl text-[var(--color-header)]">account_balance</span>
                            بيانات الحسابات البنكية
                        </h3>
                        {canManage && (
                            <button
                                onClick={() => setIsAddAccountModalOpen(true)}
                                className="px-5 py-2.5 bg-green-600 text-white font-black rounded-xl hover:bg-green-700 transition-all flex items-center gap-2 shadow-lg shadow-green-600/20"
                            >
                                <span className="material-symbols-outlined text-sm">add</span>
                                إضافة حساب
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(restaurant.transferAccounts || []).filter(a => !!a && !!a.id).map(account => (
                            <div key={account.id} className={`p-6 bg-white dark:bg-slate-800 rounded-3xl border transition-all ${account.isPrimary ? 'border-amber-400 dark:border-amber-500 shadow-md scale-[1.02] bg-amber-50/10' : 'border-slate-100 dark:border-slate-700 shadow-sm'} ${account.isActive === false ? 'opacity-60 bg-slate-50 dark:bg-slate-900/50' : ''} relative group overflow-hidden`}>
                                {account.isPrimary && (
                                    <div className="absolute top-0 right-0 px-3 py-1 bg-amber-400 text-white text-[10px] font-black rounded-bl-xl uppercase tracking-widest">
                                        الحساب الأساسي
                                    </div>
                                )}
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-3 py-1 text-[10px] font-black rounded-lg ${account.isPrimary ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                                            {account.type} {account.isPrimary && '(أساسي)'}
                                        </span>
                                        {/* Status Badge */}
                                        <span className={`px-2 py-1 text-[10px] font-bold rounded-lg flex items-center gap-1 ${account.isActive === false ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                            <span className={`size-1.5 rounded-full ${account.isActive === false ? 'bg-red-500' : 'bg-green-500'}`}></span>
                                            {account.isActive === false ? 'غير نشط' : 'نشط'}
                                        </span>
                                    </div>
                                    {canManage && (
                                        <div className="flex items-center gap-1">
                                            {/* Status Toggle */}
                                            <button
                                                onClick={() => handleToggleAccountActive(account)}
                                                className={`size-8 rounded-lg transition-all flex items-center justify-center ${account.isActive === false ? 'text-red-400 hover:text-green-600 hover:bg-green-50' : 'text-green-600 hover:text-red-500 hover:bg-red-50'}`}
                                                title={account.isActive === false ? "تنشيط الحساب" : "تعطيل الحساب"}
                                            >
                                                <span className="material-symbols-outlined text-sm">
                                                    {account.isActive === false ? 'toggle_off' : 'toggle_on'}
                                                </span>
                                            </button>

                                            <button
                                                onClick={() => handleTogglePrimary(account.id)}
                                                className={`size-8 rounded-lg transition-all flex items-center justify-center ${account.isPrimary ? 'text-amber-500 bg-amber-50 dark:bg-amber-500/10' : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'}`}
                                                title={account.isPrimary ? "إزالة الحساب الأساسي" : "تعيين كحساب أساسي"}
                                            >
                                                <span className={`material-symbols-outlined text-sm ${account.isPrimary ? 'fill-1' : ''}`}>star</span>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteAccount(account)}
                                                className="size-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all flex items-center justify-center"
                                            >
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <h4 className="text-lg font-black text-slate-800 dark:text-white mb-1">{account.beneficiaryName}</h4>
                                <p className="text-xl font-black text-[var(--color-header)] leading-none select-all">{account.accountNumber}</p>
                                {account.type === 'كريمي' && account.uniqueCode && (
                                    <p className="text-sm font-bold text-slate-500 mt-1 select-all">الرقم المميز: {account.uniqueCode}</p>
                                )}
                                {!account.isPrimary && account.parentAccountId && (
                                    <p className="text-sm font-bold text-slate-500 mt-1">حساب رئيسي: {restaurant.transferAccounts?.find(a => a.id === account.parentAccountId)?.beneficiaryName || account.parentAccountId}</p>
                                )}
                                {account.approvalPeriod && (
                                    <p className="text-sm font-bold text-indigo-500 mt-1">فترة الاعتماد: {account.approvalPeriod}</p>
                                )}

                                <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 dark:border-slate-700 pt-3">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-1 text-[10px] font-bold rounded-lg ${account.status === 'approved' ? 'bg-green-100 text-green-700' :
                                            account.status === 'error' ? 'bg-red-100 text-red-700' :
                                                'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                            }`}>
                                            {account.status === 'approved' ? 'معتمد' : account.status === 'error' ? 'خطأ في البيانات' : 'قيد المراجعة'}
                                        </span>
                                    </div>
                                    {canManage && (
                                        <div className="flex gap-2">
                                            <button
                                                disabled={account.status === 'approved'}
                                                onClick={() => handleUpdateAccountStatus(account.id, 'approved')}
                                                className="flex-1 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 text-xs font-black rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none"
                                            >
                                                اعتماد
                                            </button>
                                            <button
                                                disabled={account.status === 'error'}
                                                onClick={() => handleUpdateAccountStatus(account.id, 'error')}
                                                className="flex-1 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs font-black rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none"
                                            >
                                                خطأ
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {(!restaurant.transferAccounts || restaurant.transferAccounts.length === 0) && (
                            <div className="md:col-span-2 py-12 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center">
                                <span className="material-symbols-outlined text-5xl text-slate-300 mb-2">account_balance_wallet</span>
                                <p className="text-slate-500 dark:text-slate-400 font-bold">لا توجد حسابات تحويل مضافة حالياً</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Restaurant Activity Log */}
            <div className="pt-8 border-t border-slate-100 dark:border-slate-700">
                <InlineActivityLog
                    category="restaurant"
                    title={`سجل العمليات - ${restaurant.name}`}
                    searchQuery={restaurant.name}
                />
            </div>

            {/* Edit Base Info Modal */}
            {isEditingBase && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-scale-in" dir="rtl">
                        <div className="p-6 bg-slate-800 text-white flex items-center justify-between">
                            <h2 className="text-xl font-black flex items-center gap-2">تعديل بيانات المطعم</h2>
                            <button onClick={() => setIsEditingBase(false)} className="hover:rotate-90 transition-transform">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleUpdateBase} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500">اسم المطعم</label>
                                    <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, name: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500">الفرع</label>
                                    <div className="relative">
                                        <select
                                            value={editForm.branch}
                                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm({ ...editForm, branch: e.target.value })}
                                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold appearance-none pr-10"
                                        >
                                            <option value="">اختر الفرع...</option>
                                            {branches.filter(b => b !== 'الكل').map(b => (
                                                <option key={b} value={b}>{b}</option>
                                            ))}
                                        </select>
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 pointer-events-none">expand_more</span>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-500">رقم حساب المطعم</label>
                                <input
                                    type="text"
                                    value={editForm.restaurantAccountNumber}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, restaurantAccountNumber: e.target.value })}
                                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500">رقم الهاتف الرئيسي</label>
                                    <input
                                        type="text"
                                        value={editForm.phone}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, phone: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500">رقم هاتف إضافي (اختياري)</label>
                                    <input
                                        type="text"
                                        value={editForm.secondaryPhone || ''}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, secondaryPhone: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold"
                                    />
                                </div>
                            </div>
                            {editForm.secondaryPhone && (
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500">اسم صاحب الرقم الإضافي</label>
                                    <input
                                        type="text"
                                        value={editForm.secondaryPhoneOwner || ''}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, secondaryPhoneOwner: e.target.value })}
                                        placeholder="مثال: المدير المالي"
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold"
                                    />
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500">التصنيف</label>
                                    <input
                                        type="text"
                                        placeholder="مثال: حلويات، برجر"
                                        value={editForm.classification || ''}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, classification: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500">النوع</label>
                                    <input
                                        type="text"
                                        placeholder="مثال: توصيل، استلام"
                                        value={editForm.clientType || ''}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, clientType: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-500">رابط الشعار (اختياري)</label>
                                <input
                                    type="text"
                                    dir="ltr"
                                    placeholder="https://example.com/logo.png"
                                    value={editForm.logoUrl || ''}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, logoUrl: e.target.value })}
                                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold text-left"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-500">فترة السداد</label>
                                <select
                                    value={editForm.paymentPeriod}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm({ ...editForm, paymentPeriod: e.target.value as 'monthly' | 'semi-monthly' })}
                                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold appearance-none"
                                >
                                    <option value="monthly">شهرية (كل شهر)</option>
                                    <option value="semi-monthly">نصف شهرية (كل 15 يوم)</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500">نوع العملة</label>
                                    <select
                                        value={editForm.currencyType}
                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm({ ...editForm, currencyType: e.target.value as 'old_riyal' | 'new_riyal' })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold appearance-none"
                                    >
                                        <option value="old_riyal">ريال قديم</option>
                                        <option value="new_riyal">ريال جديد</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500">الرصيد (للمطابقة)</label>
                                    <input
                                        type="number"
                                        value={editForm.balance || 0}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, balance: Number(e.target.value) })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold"
                                    />
                                </div>
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button type="submit" className="flex-1 py-3 bg-[var(--color-header)] text-white font-black rounded-xl">حفظ التغييرات</button>
                                <button type="button" onClick={() => setIsEditingBase(false)} className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 font-black rounded-xl">إلغاء</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Account Modal */}
            {
                isAddAccountModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                        <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-scale-in" dir="rtl">
                            <div className="p-6 bg-green-600 text-white flex items-center justify-between">
                                <h2 className="text-xl font-black flex items-center gap-2">إضافة حساب تحويل جديد</h2>
                                <button onClick={() => setIsAddAccountModalOpen(false)} className="hover:rotate-90 transition-transform">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <form onSubmit={handleAddAccount} className="p-6 space-y-5">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500">نوع الحساب</label>
                                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 custom-scrollbar">
                                        {accountTypes.map(t => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => setNewAccount({ ...newAccount, type: t })}
                                                className={`px-3 py-2.5 text-[10px] font-black rounded-xl border transition-all flex items-center justify-center text-center leading-tight ${newAccount.type === t
                                                    ? 'bg-green-600 text-white border-green-600 shadow-md ring-2 ring-green-600/20'
                                                    : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-100 dark:border-slate-700 hover:bg-slate-50 hover:border-green-200'
                                                    }`}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-black text-slate-500">اسم المستفيد</label>
                                        <div className="flex gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setNewAccount({ ...newAccount, beneficiaryName: restaurant.name })}
                                                className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md hover:bg-slate-200 transition-all font-bold"
                                            >
                                                اسم المطعم
                                            </button>
                                            {restaurant.ownerName && (
                                                <button
                                                    type="button"
                                                    onClick={() => setNewAccount({ ...newAccount, beneficiaryName: restaurant.ownerName! })}
                                                    className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md hover:bg-slate-200 transition-all font-bold"
                                                >
                                                    اسم المالك
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <input
                                        required
                                        type="text"
                                        placeholder="الاسم الكامل كما هو في الحساب"
                                        value={newAccount.beneficiaryName}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, beneficiaryName: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-green-600 font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-black text-slate-500">رقم الحساب / الآيبان</label>
                                        <span className="text-[10px] font-bold text-slate-400">{newAccount.accountNumber.length} حرف</span>
                                    </div>
                                    <input
                                        required
                                        type="text"
                                        placeholder="أدخل رقم الحساب بدقة..."
                                        value={newAccount.accountNumber}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, accountNumber: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-green-600 font-bold"
                                        dir="ltr"
                                    />
                                </div>


                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500">فترة الاعتماد</label>
                                    <div className="relative">
                                        <select
                                            value={newAccount.approvalPeriod || ''}
                                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewAccount({ ...newAccount, approvalPeriod: e.target.value })}
                                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-green-600 font-bold appearance-none pr-10"
                                        >
                                            <option value="">اختر فترة الاعتماد...</option>
                                            {approvalPeriodsList.map(p => (
                                                <option key={p} value={p}>{p}</option>
                                            ))}
                                        </select>
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 pointer-events-none">expand_more</span>
                                    </div>
                                </div>

                                <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 rounded-2xl flex items-start gap-2">
                                    <span className="material-symbols-outlined text-amber-500 text-sm">lightbulb</span>
                                    <p className="text-[10px] text-amber-700 dark:text-amber-400 font-bold leading-relaxed">
                                        يرجى التأكد من صحة رقم الحساب واسم المستفيد لتجنب مشاكل التحويل المالي مستقبلاً.
                                    </p>
                                </div>

                                <div className="space-y-2 py-1">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="isPrimary"
                                            checked={newAccount.isPrimary}
                                            onChange={e => setNewAccount({ ...newAccount, isPrimary: e.target.checked, parentAccountId: e.target.checked ? '' : newAccount.parentAccountId })}
                                            className="size-4 rounded text-green-600 focus:ring-green-500"
                                        />
                                        <label htmlFor="isPrimary" className="text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer">تعيين كحساب أساسي ذو أولوية</label>
                                    </div>
                                    {!newAccount.isPrimary && (restaurant.transferAccounts || []).filter(a => a.isPrimary).length > 0 && (
                                        <div className="pt-2">
                                            <label className="text-xs font-black text-slate-500">الربط بحساب رئيسي (لحساب فرعي)</label>
                                            <div className="relative mt-1">
                                                <select
                                                    value={newAccount.parentAccountId || ''}
                                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewAccount({ ...newAccount, parentAccountId: e.target.value })}
                                                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-green-600 font-bold appearance-none pr-10"
                                                >
                                                    <option value="">لا يوجد ارتباط (حساب مستقل)</option>
                                                    {(restaurant.transferAccounts || []).filter(a => a.isPrimary).map(pa => (
                                                        <option key={pa.id} value={pa.id}>{pa.beneficiaryName} - {pa.type}</option>
                                                    ))}
                                                </select>
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 pointer-events-none">expand_more</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-4 flex gap-3">
                                    <button type="submit" className="flex-1 py-3 bg-green-600 text-white font-black rounded-xl shadow-lg hover:bg-green-700 transition-all">إضافة الحساب</button>
                                    <button type="button" onClick={() => setIsAddAccountModalOpen(false)} className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 font-black rounded-xl">إلغاء</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div>
    );
};

export default RestaurantDetailsPage;
