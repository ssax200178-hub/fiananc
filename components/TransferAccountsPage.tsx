import React, { useState } from 'react';
import { useAppContext, TransferRequest, TransferPurpose, ACCOUNT_TYPES, PaymentAccount } from '../AppContext';
import { generateId } from '../utils';

const TransferAccountsPage: React.FC = () => {
    const {
        addTransferRequest, transferRequests, updateTransferRequest, deleteTransferRequest,
        processTransferRequest, revertTransferRequest, restaurants, branches, paymentAccounts
    } = useAppContext();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [showApproved, setShowApproved] = useState(false);

    const initialForm = {
        name: '',
        branch: '',
        restaurantAccountNumber: '',
        ownerName: '',
        phone: '',
        transferType: '',
        transferAccountNumber: '',
        transferBeneficiary: '',
        approvalPeriod: '',
        isVerified: false,
        purpose: 'new_contract' as TransferPurpose,
        uniqueNumber: ''
    };

    const [formData, setFormData] = useState(initialForm);
    const [selectedMainAccountId, setSelectedMainAccountId] = useState('');
    const [selectedAnalyticalAccountId, setSelectedAnalyticalAccountId] = useState('');

    const mainAccounts = paymentAccounts.filter(a => a.isMain);
    const analyticalAccounts = paymentAccounts.filter(a => a.parentId === selectedMainAccountId);

    const pendingRequests = transferRequests.filter(r => r.status === 'pending' || !r.status);
    const completedRequests = transferRequests.filter(r => r.status === 'completed');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;

        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));

        // Auto-fill if restaurant exists and purpose isn't new_contract
        if (name === 'restaurantAccountNumber' && formData.purpose !== 'new_contract' && !editingId) {
            const existing = restaurants.find(r => r.restaurantAccountNumber === value);
            if (existing) {
                setFormData(prev => ({
                    ...prev,
                    name: existing.name,
                    branch: existing.branch,
                    ownerName: existing.ownerName,
                    phone: existing.phone
                }));
            }
        }
    };

    const handleMainAccountChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        setSelectedMainAccountId(id);
        setSelectedAnalyticalAccountId('');
        setFormData(prev => ({ ...prev, transferType: '', uniqueNumber: '' }));
    };

    const handleAnalyticalAccountChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        setSelectedAnalyticalAccountId(id);
        const acc = paymentAccounts.find(a => a.id === id);
        if (acc) {
            setFormData(prev => ({
                ...prev,
                transferType: acc.accountName
            }));
        }
    };

    const handleEdit = (req: TransferRequest) => {
        setEditingId(req.id);
        setFormData({
            ...req,
            uniqueNumber: req.uniqueNumber || ''
        });

        // Try to match back the account selectors
        const analytical = paymentAccounts.find(a => a.accountName === req.transferType);
        if (analytical) {
            setSelectedAnalyticalAccountId(analytical.id);
            setSelectedMainAccountId(analytical.parentId || '');
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.restaurantAccountNumber || !formData.transferType || !formData.approvalPeriod) {
            alert('يرجى تعبئة جميع الحقول الأساسية بما في ذلك الحساب وفترة الاعتماد');
            return;
        }

        try {
            if (editingId) {
                await updateTransferRequest(editingId, formData);
                alert('تم تحديث الطلب بنجاح');
            } else {
                await addTransferRequest({
                    ...formData,
                    restaurantId: '',
                    restaurantName: formData.name,
                    amount: 0,
                    status: 'pending'
                });
                alert('تم إضافة الطلب بنجاح');
            }

            resetForm();
        } catch (error) {
            console.error(error);
            alert('حدث خطأ');
        }
    };

    const resetForm = () => {
        setFormData(initialForm);
        setEditingId(null);
        setSelectedMainAccountId('');
        setSelectedAnalyticalAccountId('');
    };

    const PeriodPicker = () => {
        const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        return (
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-2">
                {months.map(month => (
                    <div key={month} className="space-y-1">
                        <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 text-center uppercase tracking-widest">{month}</div>
                        <div className="flex gap-1">
                            {[1, 2].map(p => {
                                const period = `${month} ${p}`;
                                const isSelected = formData.approvalPeriod === period;
                                return (
                                    <button
                                        key={period}
                                        type="button"
                                        onClick={() => setFormData(p => ({ ...p, approvalPeriod: period }))}
                                        className={`flex-1 py-1 text-[10px] font-bold rounded-lg border transition-all duration-200 ${isSelected
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40 scale-105 z-10'
                                            : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-800'
                                            }`}
                                    >
                                        {p}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const selectedAcc = paymentAccounts.find(a => a.id === selectedAnalyticalAccountId);

    return (
        <div className="space-y-8 pb-20 animate-fade-in" dir="rtl">
            {/* Header & Stats Card */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-indigo-600 rounded-[1.25rem] flex items-center justify-center text-white shadow-xl shadow-indigo-200 dark:shadow-none animate-scale-up">
                        <span className="material-symbols-outlined text-3xl">add_card</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">إدخال حسابات المطاعم</h1>
                        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">تسجيل العقود وتحديث بيانات التحويل والاتصال</p>
                    </div>
                </div>

                {/* Approved Operations Toggle Panel */}
                <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <div className="px-4 py-2">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">المكتملة</div>
                        <div className="text-lg font-black text-emerald-600">{completedRequests.length}</div>
                    </div>
                    <div className="w-[1px] h-10 bg-slate-100 dark:bg-slate-700"></div>
                    <button
                        onClick={() => setShowApproved(!showApproved)}
                        className={`px-4 py-3 rounded-xl font-black text-sm flex items-center gap-2 transition-all ${showApproved ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                            }`}
                    >
                        <span className="material-symbols-outlined text-lg">{showApproved ? 'visibility_off' : 'visibility'}</span>
                        {showApproved ? 'إخفاء المعتمدة' : 'عرض العمليات المعتمدة'}
                    </button>
                </div>
            </header>

            {/* Approved Operations Panel (Collapsible) */}
            {showApproved && (
                <div className="animate-slide-down glass-card p-6 border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/20 dark:bg-emerald-900/5">
                    <div className="flex items-center gap-3 mb-6">
                        <span className="material-symbols-outlined text-emerald-500">verified</span>
                        <h3 className="font-black text-slate-700 dark:text-slate-200">العمليات التي تم ترحيلها مؤخراً</h3>
                    </div>
                    {completedRequests.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 font-bold italic">لا توجد عمليات معتمدة حالياً</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {completedRequests.map(req => (
                                <div key={req.id} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-emerald-50 dark:border-emerald-900/20 relative group overflow-hidden">
                                    <div className="absolute top-0 right-0 w-1 h-full bg-emerald-500"></div>
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <div className="font-black text-slate-700 dark:text-slate-200">{req.restaurantName || req.name}</div>
                                            <div className="text-[10px] text-slate-400 font-bold mt-0.5">ID: {req.restaurantAccountNumber} • {req.branch}</div>
                                            {req.ownerName && (
                                                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex flex-col gap-0.5">
                                                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[10px]">person</span> {req.ownerName}</span>
                                                    {req.phone && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[10px]">call</span> {req.phone}</span>}
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-lg shrink-0">مكتمل</span>
                                    </div>
                                    <div className="space-y-1 mt-3 mb-3 p-2 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-100 dark:border-slate-800/50">
                                        <div className="text-xs font-bold text-slate-600 dark:text-slate-300">{req.transferType}</div>
                                        <div className="text-xs font-mono font-black text-slate-700 dark:text-slate-200">{req.transferAccountNumber}</div>
                                        {req.transferBeneficiary && <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/50 pt-1 mt-1">{req.transferBeneficiary}</div>}
                                        {req.uniqueNumber && (
                                            <div className="text-[10px] font-black text-amber-600 dark:text-amber-500 flex items-center gap-1 mt-1">
                                                <span className="material-symbols-outlined text-[12px]">fingerprint</span>
                                                مميز: {req.uniqueNumber}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1 mb-4 border-t border-slate-50 dark:border-slate-800 pt-2 opacity-70">
                                        <div className="flex items-center gap-1 text-[9px] font-black text-slate-400">
                                            <span className="material-symbols-outlined text-[10px]">person_add</span>
                                            أضافه: {req.createdByName || 'غير معروف'}
                                        </div>
                                        <div className="flex items-center gap-1 text-[9px] font-black text-emerald-600">
                                            <span className="material-symbols-outlined text-[10px]">task_alt</span>
                                            رحّله: {req.processedByName || 'غير معروف'}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => revertTransferRequest(req.id)}
                                        className="w-full py-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 text-red-600 text-[10px] font-black rounded-xl transition-all flex items-center justify-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-sm">history_toggle_off</span>
                                        خطأ في بيانات التحويل
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Left Side: Form */}
                <div className="xl:col-span-2 space-y-6">
                    <div className="glass-card p-8 animate-slide-up relative overflow-hidden">
                        {editingId && (
                            <div className="absolute top-0 left-0 right-0 bg-amber-500 text-white text-[10px] font-black text-center py-1 uppercase tracking-widest animate-pulse">
                                جارٍ تعديل الطلب: {editingId}
                            </div>
                        )}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-indigo-500">store</span>
                                <h2 className="text-lg font-black text-slate-700 dark:text-slate-200">
                                    {editingId ? 'تعديل بيانات الطلب' : 'بيانات المطعم الأساسية'}
                                </h2>
                            </div>

                            {/* NEW: Verified Toggle inside form */}
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <span className={`text-xs font-black transition-colors ${formData.isVerified ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    {formData.isVerified ? 'تم التأكد' : 'غير مؤكد'}
                                </span>
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        name="isVerified"
                                        checked={formData.isVerified}
                                        onChange={handleChange}
                                        className="sr-only peer"
                                    />
                                    <div className="w-10 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 shadow-inner"></div>
                                </div>
                            </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="col-span-full md:col-span-1">
                                <label className="block text-xs font-black text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-widest">الغرض من الطلب</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { id: 'new_contract', label: 'عقد جديد', icon: 'contract' },
                                        { id: 'update_contact', label: 'تحديث اتصال', icon: 'contact_phone' },
                                        { id: 'update_transfer', label: 'تحديث تحويل', icon: 'currency_exchange' }
                                    ].map(p => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, purpose: p.id as any }))}
                                            className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-300 gap-2 ${formData.purpose === p.id
                                                ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 font-black shadow-inner'
                                                : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                                }`}
                                        >
                                            <span className="material-symbols-outlined text-xl">{p.icon}</span>
                                            <span className="text-[10px]">{p.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="block text-xs font-black text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest">رقم الحساب (ID)</label>
                                <div className="relative">
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-sm">fingerprint</span>
                                    <input type="text" name="restaurantAccountNumber" value={formData.restaurantAccountNumber} onChange={handleChange} placeholder="مثال: 102030" className="w-full pr-10 pl-4 py-3 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-bold text-slate-700 dark:text-white shadow-sm" />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="block text-xs font-black text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest">اسم المطعم</label>
                                <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-bold text-slate-700 dark:text-white shadow-sm" />
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="block text-xs font-black text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest">الفرع</label>
                                <select name="branch" value={formData.branch} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-bold text-slate-700 dark:text-white shadow-sm">
                                    <option value="">اختر الفرع...</option>
                                    {branches.map(b => (
                                        <option key={b.id} value={b.name}>{b.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="block text-xs font-black text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest">اسم المالك</label>
                                <input type="text" name="ownerName" value={formData.ownerName} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-bold text-slate-700 dark:text-white shadow-sm" />
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="block text-xs font-black text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest">رقم الهاتف</label>
                                <input type="text" name="phone" value={formData.phone} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-bold text-slate-700 dark:text-white shadow-sm" />
                            </div>
                        </div>
                    </div>

                    {/* Transfer Info Section */}
                    <div className="glass-card p-8 animate-slide-up [animation-delay:100ms]">
                        <div className="flex items-center gap-3 mb-6">
                            <span className="material-symbols-outlined text-emerald-500">payments</span>
                            <h2 className="text-lg font-black text-slate-700 dark:text-slate-200">بيانات الحساب والتحويل</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col gap-1">
                                <label className="block text-xs font-black text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest">الحساب الرئيسي</label>
                                <select
                                    value={selectedMainAccountId}
                                    onChange={handleMainAccountChange}
                                    className="w-full px-4 py-3 rounded-xl border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/10 dark:bg-indigo-900/10 focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-slate-700 dark:text-white"
                                >
                                    <option value="">-- اختر البنك/المحفظة --</option>
                                    {mainAccounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.accountName}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="block text-xs font-black text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest">الحساب التحليلي</label>
                                <select
                                    value={selectedAnalyticalAccountId}
                                    onChange={handleAnalyticalAccountChange}
                                    disabled={!selectedMainAccountId}
                                    className="w-full px-4 py-3 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-900 disabled:opacity-50 transition-all font-bold text-slate-700 dark:text-white"
                                >
                                    <option value="">-- اختر الحساب الفرعي --</option>
                                    {analyticalAccounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.accountName}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="block text-xs font-black text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest">رقم الحساب</label>
                                <input type="text" name="transferAccountNumber" value={formData.transferAccountNumber} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-bold text-slate-700 dark:text-white" />
                            </div>

                            {selectedAcc?.useUniqueNumber && (
                                <div className="flex flex-col gap-1 animate-slide-down">
                                    <label className="block text-xs font-black text-amber-500 mb-1 uppercase tracking-widest">الرقم المميز (خاص بالكريمي)</label>
                                    <input type="text" name="uniqueNumber" value={formData.uniqueNumber} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-900/10 focus:ring-2 focus:ring-amber-500 transition-all font-bold text-amber-700 dark:text-amber-200" />
                                </div>
                            )}

                            <div className="col-span-full flex flex-col gap-1">
                                <label className="block text-xs font-black text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest">اسم المستفيد</label>
                                <input type="text" name="transferBeneficiary" value={formData.transferBeneficiary} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-bold text-slate-700 dark:text-white" />
                            </div>
                        </div>
                    </div>

                    {/* Period Picker */}
                    <div className="glass-card p-8 animate-slide-up [animation-delay:200ms]">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-amber-500">calendar_month</span>
                                <h2 className="text-lg font-black text-slate-700 dark:text-slate-200">فترة الاعتماد</h2>
                            </div>
                            {formData.approvalPeriod && (
                                <div className="px-3 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full text-[10px] font-black">
                                    المحدد: {formData.approvalPeriod}
                                </div>
                            )}
                        </div>
                        <PeriodPicker />
                    </div>
                </div>

                {/* Right Side: Actions */}
                <div className="space-y-6">
                    <div className="glass-card p-8 sticky top-6">
                        <h2 className="text-lg font-black text-slate-700 dark:text-slate-200 mb-6">الإجراءات</h2>

                        <div className="space-y-4">
                            <button
                                type="submit"
                                className={`w-full btn-premium py-4 text-white rounded-2xl font-black shadow-xl flex items-center justify-center gap-2 transition-all ${editingId ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-100' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100 dark:shadow-none'
                                    }`}
                            >
                                <span className="material-symbols-outlined">{editingId ? 'update' : 'save'}</span>
                                {editingId ? 'تحديث الطلب' : 'حفظ وإرسال الطلب'}
                            </button>

                            {editingId && (
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 rounded-xl font-black text-sm"
                                >
                                    إلغاء التعديل
                                </button>
                            )}
                        </div>

                        <div className="mt-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2 mb-2 text-indigo-500">
                                <span className="material-symbols-outlined text-lg">help</span>
                                <span className="text-[10px] font-black uppercase tracking-widest">إرشادات</span>
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold leading-relaxed">
                                • تأكد من "رقم الحساب ID" للمطعم بدقة<br />
                                • اختيار الحساب التحليلي الصحيح أساسي للتسوية<br />
                                • الطلب يمر بمرحلة مراجعة قبل الترحيل
                            </p>
                        </div>
                    </div>
                </div>
            </form>

            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-indigo-500">pending_actions</span>
                    <h3 className="text-lg font-black text-slate-700 dark:text-slate-200">طلبات بانتظار المراجعة</h3>
                    <span className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 px-3 py-1 rounded-full text-xs font-black">{pendingRequests.length}</span>
                </div>

                {pendingRequests.length === 0 ? (
                    <div className="glass-card p-20 text-center animate-fade-in">
                        <span className="material-symbols-outlined text-6xl text-slate-200 dark:text-slate-700 mb-4">inbox</span>
                        <div className="text-slate-400 font-bold">لا يوجد طلبات معلقة حالياً</div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {pendingRequests.map(req => (
                            <div key={req.id} className="glass-card p-6 animate-slide-up hover:ring-2 hover:ring-indigo-500/10 transition-all group">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <div className="font-black text-slate-800 dark:text-white group-hover:text-indigo-600 transition-colors">{req.restaurantName || req.name}</div>
                                        <div className="text-[10px] text-slate-400 font-black mt-0.5">ID: {req.restaurantAccountNumber} • {req.branch}</div>
                                        {req.ownerName && (
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 flex flex-col gap-1">
                                                <span className="flex items-center gap-1 font-bold"><span className="material-symbols-outlined text-[12px]">person</span> {req.ownerName}</span>
                                                {req.phone && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">call</span> {req.phone}</span>}
                                            </div>
                                        )}
                                    </div>
                                    <div className={`px-2 py-1 rounded-lg text-[10px] font-black ${req.purpose === 'new_contract' ? 'bg-emerald-50 text-emerald-600' :
                                        req.purpose === 'update_contact' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                                        }`}>
                                        {req.purpose === 'new_contract' ? 'عقد جديد' : req.purpose === 'update_contact' ? 'تحديث اتصال' : 'تحديث تحويل'}
                                    </div>
                                </div>

                                <div className="space-y-3 mb-6">
                                    <div className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-100 dark:border-slate-800/50 space-y-2">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-slate-400 font-bold">الحساب:</span>
                                            <span className="text-slate-700 dark:text-slate-300 font-black">{req.transferType}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-slate-400 font-bold">رقم التحويل:</span>
                                            <span className="text-slate-700 dark:text-slate-300 font-mono font-black">{req.transferAccountNumber}</span>
                                        </div>
                                        {req.transferBeneficiary && (
                                            <div className="flex items-center justify-between text-xs border-t border-slate-200/50 dark:border-slate-700/50 pt-2 mt-1">
                                                <span className="text-slate-400 font-bold">اسم المستفيد:</span>
                                                <span className="text-slate-700 dark:text-slate-300 font-black text-left">{req.transferBeneficiary}</span>
                                            </div>
                                        )}
                                        {req.uniqueNumber && (
                                            <div className="flex items-center justify-between text-xs border-t border-slate-200/50 dark:border-slate-700/50 pt-2 mt-2">
                                                <span className="text-amber-500/80 font-bold text-[10px]">الرقم المميز:</span>
                                                <span className="text-amber-600 dark:text-amber-500 font-black flex items-center gap-1">
                                                    {req.uniqueNumber}
                                                    <span className="material-symbols-outlined text-[14px]">stars</span>
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-slate-400 font-bold">الفترة:</span>
                                        <span className="text-amber-600 font-black">{req.approvalPeriod}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-slate-400 font-bold">الحالة:</span>
                                        <span className={`font-black flex items-center gap-1 ${req.isVerified ? 'text-emerald-500' : 'text-amber-500'}`}>
                                            <span className="material-symbols-outlined text-sm">{req.isVerified ? 'check_circle' : 'pending'}</span>
                                            {req.isVerified ? 'مؤكد' : 'غير مؤكد'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs borber-t border-slate-50 dark:border-slate-800 pt-2 mt-2">
                                        <span className="text-slate-400 font-bold">بواسطة:</span>
                                        <span className="text-indigo-500 font-black">{req.createdByName || 'غير معروف'}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 pt-4 border-t border-slate-50 dark:border-slate-800">
                                    {!req.isVerified ? (
                                        <button onClick={() => updateTransferRequest(req.id, { isVerified: true })} className="flex-1 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-xs font-black rounded-xl transition-all">مراجعة</button>
                                    ) : (
                                        <button onClick={() => processTransferRequest(req)} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 dark:shadow-none">
                                            <span className="material-symbols-outlined text-sm">rocket_launch</span>
                                            ترحيل
                                        </button>
                                    )}
                                    <button onClick={() => handleEdit(req)} className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-indigo-500 rounded-xl transition-all" title="تعديل">
                                        <span className="material-symbols-outlined text-lg">edit_note</span>
                                    </button>
                                    <button onClick={() => deleteTransferRequest(req.id)} className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-red-500 rounded-xl transition-all" title="حذف">
                                        <span className="material-symbols-outlined text-lg">delete</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TransferAccountsPage;
