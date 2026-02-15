import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import type { Restaurant, TransferAccount } from '../AppContext';
import { generateId } from '../utils';

const RestaurantDetailsPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { restaurants, updateRestaurant, deleteRestaurant, currentUser } = useAppContext();

    const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
    const [isEditingBase, setIsEditingBase] = useState(false);
    const [editForm, setEditForm] = useState<Partial<Restaurant>>({});

    const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
    const [newAccount, setNewAccount] = useState<Omit<TransferAccount, 'id'>>({
        type: '',
        accountNumber: '',
        beneficiaryName: '',
        isPrimary: false
    });

    useEffect(() => {
        const found = restaurants.find((r: Restaurant) => r.id === id);
        if (found) {
            setRestaurant(found);
            setEditForm(found);
        }
    }, [id, restaurants]);

    if (!restaurant) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[50vh]">
                <div className="text-center">
                    <span className="material-symbols-outlined text-6xl text-slate-300 animate-pulse">storefront</span>
                    <p className="mt-4 text-slate-500 font-bold">جاري تحميل بيانات المطعم...</p>
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
        const isFirst = !restaurant.transferAccounts || restaurant.transferAccounts.length === 0;
        const account: TransferAccount = {
            ...newAccount,
            id: generateId(),
            isPrimary: isFirst || newAccount.isPrimary
        };

        let updatedAccounts = [...(restaurant.transferAccounts || [])];
        if (account.isPrimary) {
            updatedAccounts = updatedAccounts.map(a => ({ ...a, isPrimary: false }));
        }
        updatedAccounts.push(account);

        await updateRestaurant(id, { transferAccounts: updatedAccounts });
        setIsAddAccountModalOpen(false);
        setNewAccount({ type: '', accountNumber: '', beneficiaryName: '', isPrimary: false });
    };

    const handleDeleteAccount = async (accountId: string) => {
        if (!confirm('تأكيد حذف حساب التحويل هذا؟')) return;
        const updatedAccounts = restaurant.transferAccounts.filter(a => a.id !== accountId);
        // If we deleted the primary, make the first one primary
        if (updatedAccounts.length > 0 && !updatedAccounts.some(a => a.isPrimary)) {
            updatedAccounts[0].isPrimary = true;
        }
        await updateRestaurant(restaurant.id, { transferAccounts: updatedAccounts });
    };

    const handleTogglePrimary = async (accountId: string) => {
        if (!id || !restaurant) return;
        const updatedAccounts = restaurant.transferAccounts.map(a => ({
            ...a,
            isPrimary: a.id === accountId ? !a.isPrimary : false
        }));
        await updateRestaurant(id, { transferAccounts: updatedAccounts });
    };

    return (
        <div className="p-4 md:p-8 space-y-8 animate-fade-in RTL" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/restaurants')}
                        className="size-12 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center hover:bg-slate-50 transition-all border border-slate-100 dark:border-slate-700 shadow-sm"
                    >
                        <span className="material-symbols-outlined">arrow_forward</span>
                    </button>
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 dark:text-white">{restaurant.name}</h1>
                        <p className="text-slate-500 dark:text-slate-400 font-bold">فرع: {restaurant.branch} | رقم الحساب: {restaurant.restaurantAccountNumber}</p>
                    </div>
                </div>

                {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
                    <div className="flex gap-2">
                        <button
                            onClick={async () => {
                                if (confirm('هل أنت متأكد من حذف المطعم نهائياً؟')) {
                                    await deleteRestaurant(restaurant.id);
                                    navigate('/restaurants');
                                }
                            }}
                            className="size-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 transition-all"
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
                                    <p className="font-bold text-slate-700 dark:text-white">{new Date(restaurant.createdAt).toLocaleDateString('ar-SA')}</p>
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
                            حسابات التحويل
                        </h3>
                        {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
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
                        {restaurant.transferAccounts?.map(account => (
                            <div key={account.id} className="p-6 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm relative group overflow-hidden">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-3 py-1 text-[10px] font-black rounded-lg ${account.isPrimary ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                                            {account.type} {account.isPrimary && '(أساسي)'}
                                        </span>
                                    </div>
                                    {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleTogglePrimary(account.id)}
                                                className={`size-8 rounded-lg transition-all flex items-center justify-center ${account.isPrimary ? 'text-amber-500 bg-amber-50 dark:bg-amber-500/10' : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'}`}
                                                title={account.isPrimary ? "إزالة الحساب الأساسي" : "تعيين كحساب أساسي"}
                                            >
                                                <span className={`material-symbols-outlined text-sm ${account.isPrimary ? 'fill-1' : ''}`}>star</span>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteAccount(account.id)}
                                                className="size-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all flex items-center justify-center"
                                            >
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <h4 className="text-lg font-black text-slate-800 dark:text-white mb-1">{account.beneficiaryName}</h4>
                                <p className="text-xl font-black text-[var(--color-header)] leading-none select-all">{account.accountNumber}</p>
                                <p className="text-[10px] font-bold text-slate-400 mt-3 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[10px]">verified</span>
                                    حساب معتمد للتحويل
                                </p>
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
                                    <input
                                        type="text"
                                        value={editForm.branch}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, branch: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-[var(--color-header)] font-bold"
                                    />
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
                </div >
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
                            <form onSubmit={handleAddAccount} className="p-6 space-y-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500">نوع الحساب (بنكي، محفظة، إلخ)</label>
                                    <input
                                        type="text"
                                        placeholder="مثال: حساب بنكي، محفظة جوال..."
                                        value={newAccount.type}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, type: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-green-600 font-bold"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500">اسم المستفيد</label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="الاسم كما هو في الحساب"
                                        value={newAccount.beneficiaryName}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, beneficiaryName: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-green-600 font-bold"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500">رقم الحساب / الآيبان</label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="أدخل رقم الحساب بدقة"
                                        value={newAccount.accountNumber}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, accountNumber: e.target.value })}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:border-green-600 font-bold"
                                    />
                                </div>
                                <div className="flex items-center gap-2 py-2">
                                    <input
                                        type="checkbox"
                                        id="isPrimary"
                                        checked={newAccount.isPrimary}
                                        onChange={e => setNewAccount({ ...newAccount, isPrimary: e.target.checked })}
                                        className="size-4 rounded text-green-600 focus:ring-green-500"
                                    />
                                    <label htmlFor="isPrimary" className="text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer">تعيين كحساب أساسي ذو أولوية</label>
                                </div>
                                <div className="pt-4 flex gap-3">
                                    <button type="submit" className="flex-1 py-3 bg-green-600 text-white font-black rounded-xl shadow-lg">إضافة الحساب</button>
                                    <button type="button" onClick={() => setIsAddAccountModalOpen(false)} className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 font-black rounded-xl">إلغاء</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default RestaurantDetailsPage;
