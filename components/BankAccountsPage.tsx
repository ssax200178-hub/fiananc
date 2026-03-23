import React, { useState, useMemo } from 'react';
import { useAppContext, PaymentAccount } from '../AppContext';

const BankAccountsPage: React.FC = () => {
    const {
        paymentAccounts,
        addPaymentAccount,
        updatePaymentAccount,
        deletePaymentAccount,
        currentUser
    } = useAppContext();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedMainAccount, setSelectedMainAccount] = useState<PaymentAccount | null>(null);
    const [formData, setFormData] = useState<Partial<PaymentAccount>>({
        accountName: '',
        isMain: true,
        useUniqueNumber: false,
        isActive: true,
        parentId: '',
        systemAccountNumber: ''
    });

    const [searchTerm, setSearchTerm] = useState('');

    const canManage = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('restaurants_add');

    const filteredAccounts = useMemo(() => {
        let docs = paymentAccounts.filter(a => a.isMain);
        if (searchTerm) {
            docs = docs.filter(a =>
                a.accountName.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        return docs;
    }, [paymentAccounts, searchTerm]);

    const mainAccounts = useMemo(() => paymentAccounts.filter(a => a.isMain), [paymentAccounts]);

    const handleOpenModal = (account?: PaymentAccount) => {
        if (account) {
            setEditingId(account.id);
            setFormData({ ...account });
        } else {
            setEditingId(null);
            setFormData({
                accountName: '',
                isMain: true,
                useUniqueNumber: false,
                isActive: true,
                parentId: '',
                systemAccountNumber: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.accountName?.trim()) {
            alert('يرجى إدخال اسم المسمى');
            return;
        }

        try {
            // Clean data for Firestore
            const cleanData = { ...formData };
            if (cleanData.isMain) {
                delete cleanData.parentId;
            } else if (!cleanData.parentId) {
                cleanData.parentId = ''; // Or handle as error
            }

            if (editingId) {
                await updatePaymentAccount(editingId, cleanData);
            } else {
                await addPaymentAccount(cleanData as Omit<PaymentAccount, 'id' | 'createdAt' | 'isActive'>);
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error('Error saving payment account:', error);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white font-display">الحسابات البنكية لسداد المطاعم</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">إدارة الحسابات البنكية وطرق التحويل المرتبطة بالمطاعم</p>
                </div>
                {canManage && (
                    <button
                        onClick={() => handleOpenModal()}
                        className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-red-500/20"
                    >
                        <span className="material-symbols-outlined">add_circle</span>
                        إضافة حساب / طريقة تحويل
                    </button>
                )}
            </div>

            {/* Search */}
            <div className="relative">
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input
                    type="text"
                    placeholder="بحث في الحسابات..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pr-12 pl-4 py-3 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-red-500 outline-none"
                />
            </div>

            {/* Main Accounts List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredAccounts.map(account => (
                    <div
                        key={account.id}
                        onClick={() => account.isMain && setSelectedMainAccount(account)}
                        className={`bg-white dark:bg-[#1e293b] rounded-2xl border ${account.isMain ? 'border-red-200 dark:border-red-900/50 cursor-pointer hover:border-red-500' : 'border-slate-200 dark:border-slate-700'} p-6 shadow-sm hover:shadow-md transition-all relative group`}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-xl ${account.isMain ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'bg-slate-50 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                                <span className="material-symbols-outlined font-black">
                                    {account.isMain ? 'account_balance' : 'account_balance_wallet'}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleOpenModal(account); }}
                                    className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-blue-500 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-xl">edit</span>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); deletePaymentAccount(account.id); }}
                                    className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-red-500 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-xl">delete</span>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <h3 className="font-black text-lg text-slate-900 dark:text-white leading-tight">{account.accountName}</h3>
                            {account.isMain && (
                                <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1 mt-1">
                                    <span className="material-symbols-outlined text-sm">visibility</span>
                                    انقر لرؤية الحسابات الفرعية
                                </p>
                            )}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                            {account.isMain ? (
                                <span className="px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-[10px] font-black rounded-lg uppercase tracking-wider">حساب رئيسي</span>
                            ) : (
                                <span className="px-2 py-1 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 text-[10px] font-black rounded-lg uppercase tracking-wider">طريقة تحويل</span>
                            )}
                            {account.useUniqueNumber && (
                                <span className="px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] font-black rounded-lg uppercase tracking-wider">الرقم المميز: مفعل</span>
                            )}
                            {account.systemAccountNumber && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[10px] font-black rounded-lg uppercase tracking-wider" dir="ltr">
                                    {account.systemAccountNumber}
                                </span>
                            )}
                        </div>

                        {!account.isMain && account.parentId && (
                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">link</span>
                                يتبع لـ: {paymentAccounts.find(a => a.id === account.parentId)?.accountName || 'حساب محذوف'}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Sub-Accounts View Modal */}
            {selectedMainAccount && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 overflow-hidden">
                    <div className="bg-white dark:bg-[#0f172a] rounded-[32px] shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 animate-scale-in flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-red-600 text-white rounded-2xl shadow-lg shadow-red-600/20">
                                    <span className="material-symbols-outlined font-black">account_balance</span>
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 dark:text-white">{selectedMainAccount.accountName}</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">قائمة الحسابات الفرعية وطرق التحويل المرتبطة</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedMainAccount(null)}
                                className="w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-950 dark:hover:text-white transition-all shadow-sm border border-slate-200 dark:border-slate-700"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                            {paymentAccounts.filter(a => a.parentId === selectedMainAccount.id).length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {paymentAccounts
                                        .filter(a => a.parentId === selectedMainAccount.id)
                                        .map((sub, idx) => (
                                            <div
                                                key={sub.id}
                                                className="group p-5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-red-400 dark:hover:border-red-500/50 transition-all flex flex-col justify-between"
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-300 shadow-sm">
                                                        <span className="material-symbols-outlined font-black">account_balance_wallet</span>
                                                    </div>
                                                    <div className="font-black text-slate-200 dark:text-slate-700 text-2xl opacity-50 group-hover:opacity-100 transition-opacity">
                                                        {String(idx + 1).padStart(2, '0')}
                                                    </div>
                                                </div>
                                                <div className="mt-4">
                                                    <h4 className="font-black text-slate-900 dark:text-white text-base">{sub.accountName}</h4>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[9px] font-black rounded-md uppercase">طريقة تحويل</span>
                                                        {sub.useUniqueNumber && (
                                                            <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 text-[9px] font-black rounded-md uppercase">رقم مميز</span>
                                                        )}
                                                        {sub.systemAccountNumber && (
                                                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 text-[9px] font-black rounded-md uppercase" dir="ltr">
                                                                {sub.systemAccountNumber}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            ) : (
                                <div className="py-12 text-center bg-slate-50 dark:bg-slate-800/20 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                                    <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300 shadow-sm border border-slate-100 dark:border-slate-700">
                                        <span className="material-symbols-outlined text-3xl">inbox_customize</span>
                                    </div>
                                    <p className="text-slate-500 dark:text-slate-400 font-bold text-lg">لا توجد حسابات فرعية مرتبطة حتى الآن</p>
                                    <p className="text-slate-400 dark:text-slate-500 text-sm mt-1 mx-auto max-w-xs">يمكنك إضافة حساب فرعي عن طريق تعديل طريقة التحويل وربطها بهذا الحساب الرئيسي</p>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-8 py-6 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50/30 dark:bg-slate-900/30">
                            <button
                                onClick={() => setSelectedMainAccount(null)}
                                className="px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-xl hover:scale-105 transition-all shadow-lg active:scale-95"
                            >
                                إغلاق النافذة
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
                        <div className="px-8 py-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">
                                {editingId ? 'تعديل البيانات' : 'إضافة حساب جديد'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-8 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">المسمى</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.accountName || ''}
                                        onChange={e => setFormData({ ...formData, accountName: e.target.value })}
                                        className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl dark:bg-slate-800 dark:text-white font-bold focus:ring-2 focus:ring-red-500 outline-none"
                                        placeholder="مثال: البنك الكريمي أو تطبيق جيب"
                                    />
                                </div>

                                {formData.isMain && (
                                    <div className="col-span-2">
                                        <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">رقم الحساب في النظام (لحسابات التطبيق/البنك الرئيسي فقط - اختياري)</label>
                                        <input
                                            type="text"
                                            value={formData.systemAccountNumber || ''}
                                            onChange={e => setFormData({ ...formData, systemAccountNumber: e.target.value })}
                                            className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl dark:bg-slate-800 dark:text-white font-bold focus:ring-2 focus:ring-red-500 outline-none"
                                            placeholder="مثال: 112101 لتوجيه القيد التلقائي لهذا البنك/التطبيق"
                                        />
                                    </div>
                                )}

                                <div className="col-span-2 flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${formData.isMain ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-500'}`}>
                                            <span className="material-symbols-outlined text-sm">star</span>
                                        </div>
                                        <div>
                                            <div className="text-sm font-black text-slate-900 dark:text-white">حساب رئيسي</div>
                                            <div className="text-[10px] text-slate-500 font-bold">الحسابات الرئيسية تظهر كمرجع للحسابات الفرعية</div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, isMain: !formData.isMain, parentId: undefined })}
                                        className={`relative w-12 h-6 rounded-full transition-colors flex items-center px-0.5 ${formData.isMain ? 'bg-red-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                                    >
                                        <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${formData.isMain ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </button>
                                </div>

                                {!formData.isMain && (
                                    <div className="col-span-2 animate-fade-in">
                                        <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">يرتبط بالحساب الرئيسي</label>
                                        <select
                                            value={formData.parentId || ''}
                                            onChange={e => setFormData({ ...formData, parentId: e.target.value })}
                                            className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl dark:bg-slate-800 dark:text-white font-bold focus:ring-2 focus:ring-red-500 outline-none"
                                        >
                                            <option value="">اختر الحساب الرئيسي...</option>
                                            {mainAccounts.map(a => (
                                                <option key={a.id} value={a.id}>{a.accountName}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="col-span-2 space-y-3">
                                    <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
                                                <span className="material-symbols-outlined text-sm">key</span>
                                            </div>
                                            <div>
                                                <div className="text-sm font-black text-slate-900 dark:text-white">تفعيل الرقم المميز</div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, useUniqueNumber: !formData.useUniqueNumber })}
                                            className={`relative w-12 h-6 rounded-full transition-colors flex items-center px-0.5 ${formData.useUniqueNumber ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                                        >
                                            <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${formData.useUniqueNumber ? 'translate-x-6' : 'translate-x-0'}`} />
                                        </button>
                                    </div>

                                </div>
                            </div>

                            <div className="pt-4 flex gap-4">
                                <button
                                    type="submit"
                                    className="flex-1 py-4 bg-red-600 text-white font-black rounded-2xl hover:bg-red-700 transition-all shadow-xl shadow-red-500/20"
                                >
                                    حفظ البيانات
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-8 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
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

export default BankAccountsPage;
