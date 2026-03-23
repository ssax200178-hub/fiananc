import React, { useState, useMemo } from 'react';
import {
    Building2, Plus, Search, Edit2, Trash2, X, Check, ArrowRight, Building,
    Users, Utensils, CreditCard, ChevronRight, LayoutGrid, FileText,
    TrendingUp, Activity, BarChart3, ShieldCheck
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import type { Branch } from '../AppContext';
import { useNavigate } from 'react-router-dom';
import { getCurrencySymbol } from '../utils';
import { confirmDialog } from '../utils/confirm';

const BranchesPage: React.FC = () => {
    const {
        branches, addBranch, updateBranch, deleteBranch,
        employees, restaurants, allInvoiceBatchItems, currentUser
    } = useAppContext();
    const navigate = useNavigate();

    // --- State ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [formData, setFormData] = useState<Partial<Branch>>({
        name: '',
        branchNumber: '',
        currencyType: 'old_rial',
        defaultSalarySource: 'YER',
        isActive: true,
        creditAccountNumber: '',
        creditSubAccountNumber: '',
        creditCostCenter: '',
        creditCostCenterId: ''
    });
    const [searchTerm, setSearchTerm] = useState('');

    // --- Permissions ---
    const canAdd = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('branches_add');
    const canEdit = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('branches_edit');
    const canDelete = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('branches_delete');

    // --- Filtered Branches ---
    const filteredBranches = useMemo(() =>
        branches.filter(branch =>
            branch.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (branch.branchNumber && branch.branchNumber.toLowerCase().includes(searchTerm.toLowerCase()))
        ), [branches, searchTerm]);

    // --- Stats ---
    const stats = useMemo(() => {
        return {
            total: branches.length,
            active: branches.filter(b => b.isActive).length,
            totalBooklets: allInvoiceBatchItems.reduce((sum, item) => sum + (item.bookletCount || 0), 0)
        };
    }, [branches, allInvoiceBatchItems]);

    // --- Handlers ---
    const handleOpenModal = (branch?: Branch) => {
        if (branch) {
            setEditingBranch(branch);
            setFormData({
                name: branch.name,
                branchNumber: branch.branchNumber || '',
                currencyType: branch.currencyType,
                defaultSalarySource: branch.defaultSalarySource || 'YER',
                isActive: branch.isActive,
                creditAccountNumber: branch.creditAccountNumber || '',
                creditSubAccountNumber: branch.creditSubAccountNumber || '',
                creditCostCenter: branch.creditCostCenter || '',
                creditCostCenterId: branch.creditCostCenterId || ''
            });
        } else {
            setEditingBranch(null);
            setFormData({
                name: '',
                branchNumber: '',
                currencyType: 'old_rial',
                defaultSalarySource: 'YER',
                isActive: true,
                creditAccountNumber: '',
                creditSubAccountNumber: '',
                creditCostCenter: '',
                creditCostCenterId: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name?.trim()) {
            alert('يرجى إدخال اسم الفرع');
            return;
        }

        try {
            if (editingBranch) {
                await updateBranch(editingBranch.id, formData);
            } else {
                await addBranch(formData as Omit<Branch, 'id' | 'createdAt'>);
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error('Error saving branch:', error);
            alert('حدث خطأ أثناء حفظ البيانات');
        }
    };

    // --- Helper: Count linked entities ---
    const getLinkedCount = (branchId: string, branchName: string) => {
        const branchEmployees = employees.filter(e => e.branch === branchName);
        const branchRestaurants = restaurants.filter(r => r.branch === branchName);
        const branchInvoices = allInvoiceBatchItems.filter(i => i.branchId === branchId);
        const bookletCount = branchInvoices.reduce((sum, item) => sum + (item.bookletCount || 0), 0);

        return {
            employees: branchEmployees.length,
            restaurants: branchRestaurants.length,
            booklets: bookletCount
        };
    };

    return (
        <div className="p-4 md:p-8 bg-slate-50/50 min-h-screen font-sans animate-in fade-in duration-500 text-slate-900" dir="rtl">
            {/* Premium Header Section */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-[2.5rem] p-8 md:p-10 mb-10 shadow-2xl shadow-indigo-900/20">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -ml-20 -mb-20"></div>

                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-indigo-500/20 backdrop-blur-md rounded-2xl border border-indigo-400/30">
                                <Building2 className="w-6 h-6 text-indigo-400" />
                            </div>
                            <div className="h-8 w-px bg-slate-700 mx-1"></div>
                            <span className="text-indigo-400 font-bold tracking-widest text-xs uppercase">Directory System</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">إدارة <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-blue-300 to-emerald-300">الفروع</span></h1>
                        <p className="text-slate-400 max-w-md text-sm leading-relaxed font-medium">التحكم في هيكل الفروع، إدارة الحسابات المحاسبية، ومتابعة النشاط الإجمالي لكل نطاق جغرافي.</p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-3xl transform hover:scale-105 transition-all">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-blue-500/20 rounded-lg"><Activity className="w-4 h-4 text-blue-400" /></div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">الإجمالي</span>
                            </div>
                            <div className="text-3xl font-black text-white">{stats.total}</div>
                            <div className="text-[10px] font-bold text-slate-500 mt-1">فرع مسجل</div>
                        </div>
                        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-3xl transform hover:scale-105 transition-all">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-emerald-500/20 rounded-lg"><Check className="w-4 h-4 text-emerald-400" /></div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">النشطة</span>
                            </div>
                            <div className="text-3xl font-black text-white">{stats.active}</div>
                            <div className="text-[10px] font-bold text-slate-500 mt-1">يعمل حالياً</div>
                        </div>
                        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-3xl transform hover:scale-105 transition-all hidden sm:block">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-indigo-500/20 rounded-lg"><FileText className="w-4 h-4 text-indigo-400" /></div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">الفواتير</span>
                            </div>
                            <div className="text-3xl font-black text-white">{stats.totalBooklets}</div>
                            <div className="text-[10px] font-bold text-slate-500 mt-1">إجمالي المنصرف</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-col md:flex-row gap-4 mb-8">
                <div className="relative flex-1 group">
                    <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-indigo-500 transition-colors" />
                    <input
                        type="text"
                        placeholder="البحث عن فرع (الاسم أو الرقم)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white border border-slate-200 pr-12 pl-4 py-4 rounded-3xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all shadow-sm font-bold text-slate-700 placeholder:text-slate-400"
                    />
                </div>
                {canAdd && (
                    <button
                        onClick={() => handleOpenModal()}
                        className="bg-indigo-600 hover:bg-slate-900 text-white px-10 py-4 rounded-3xl font-black flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/20 transition-all hover:-translate-y-1 active:scale-95 whitespace-nowrap"
                    >
                        <Plus className="w-6 h-6" />
                        إضافة فرع جديد
                    </button>
                )}
            </div>

            {/* Branches Table */}
            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-8 py-6 text-xs font-black text-slate-500 uppercase tracking-widest text-center w-16">#</th>
                                <th className="px-6 py-6 text-xs font-black text-slate-500 uppercase tracking-widest">الفرع</th>
                                <th className="px-6 py-6 text-xs font-black text-slate-500 uppercase tracking-widest text-center">الرقم المحاسبي</th>
                                <th className="px-6 py-6 text-xs font-black text-slate-500 uppercase tracking-widest text-center">العملة</th>
                                <th className="px-6 py-6 text-xs font-black text-slate-500 uppercase tracking-widest text-center">الموظفين</th>
                                <th className="px-6 py-6 text-xs font-black text-slate-500 uppercase tracking-widest text-center">المطاعم</th>
                                <th className="px-6 py-6 text-xs font-black text-slate-500 uppercase tracking-widest text-center">الفواتير المنصرفة</th>
                                <th className="px-6 py-6 text-xs font-black text-slate-500 uppercase tracking-widest text-center">الحالة</th>
                                <th className="px-8 py-6 text-xs font-black text-slate-500 uppercase tracking-widest text-left">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredBranches.map((branch, index) => {
                                const counts = getLinkedCount(branch.id, branch.name);
                                return (
                                    <tr key={branch.id} className="group hover:bg-indigo-50/30 transition-colors">
                                        <td className="px-8 py-6 text-center">
                                            <span className="text-sm font-black text-slate-400 group-hover:text-indigo-400 transition-colors">{(index + 1).toString().padStart(2, '0')}</span>
                                        </td>
                                        <td className="px-6 py-6">
                                            <div
                                                onClick={() => navigate(`/branches/${branch.id}/hub`)}
                                                className="flex flex-col cursor-pointer group/name"
                                            >
                                                <span className="text-lg font-black text-slate-800 group-hover/name:text-indigo-600 transition-colors flex items-center gap-2">
                                                    {branch.name}
                                                    <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover/name:opacity-100 group-hover/name:translate-x-0 transition-all text-indigo-500" />
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">الراتب: {branch.defaultSalarySource === 'SAR' ? 'ريال سعودي' : 'ريال يمني'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-6 text-center">
                                            <span className="inline-block px-3 py-1 bg-slate-100 rounded-full font-mono font-bold text-slate-600 text-sm">
                                                {branch.branchNumber || '—'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-6 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="text-lg font-black text-indigo-600">{getCurrencySymbol(branch.currencyType)}</span>
                                                <span className="text-[10px] font-bold text-slate-400">{branch.currencyType === 'old_rial' ? 'قديم' : 'جديد'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-6 text-center">
                                            <div className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 rounded-2xl group-hover:bg-white transition-colors border border-transparent group-hover:border-indigo-100">
                                                <Users className="w-4 h-4 text-indigo-500" />
                                                <span className="text-sm font-black text-slate-700">{counts.employees}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-6 text-center">
                                            <div className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 rounded-2xl group-hover:bg-white transition-colors border border-transparent group-hover:border-blue-100">
                                                <Utensils className="w-4 h-4 text-blue-500" />
                                                <span className="text-sm font-black text-slate-700">{counts.restaurants}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-6 text-center">
                                            <div className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 rounded-2xl group-hover:bg-white transition-colors border border-transparent group-hover:border-emerald-100">
                                                <FileText className="w-4 h-4 text-emerald-500" />
                                                <span className="text-sm font-black text-slate-700">{counts.booklets}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-6 text-center">
                                            <span className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${branch.isActive
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-rose-100 text-rose-700'
                                                }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${branch.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                                                {branch.isActive ? 'نشط' : 'متوقف'}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center justify-start gap-2">
                                                {canEdit && (
                                                    <button
                                                        onClick={() => handleOpenModal(branch)}
                                                        className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-all"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {canDelete && (
                                                    <button
                                                        onClick={async () => {
                                                            if (await confirmDialog(`هل أنت متأكد من حذف فرع ${branch.name}؟`, { type: 'danger' })) {
                                                                deleteBranch(branch.id);
                                                            }
                                                        }}
                                                        className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>

                    <div className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl shadow-indigo-900/20 overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-300">
                        {/* Sidebar */}
                        <div className="md:w-64 bg-slate-900 p-8 text-white flex flex-col justify-between overflow-hidden relative">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl -mr-10 -mt-10"></div>

                            <div className="relative z-10 space-y-6">
                                <div className="p-3 bg-white/10 rounded-2xl w-fit border border-white/10">
                                    <Building className="w-8 h-8 text-indigo-400" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black">{editingBranch ? 'تعديل الفرع' : 'إضافة فرع'}</h3>
                                    <p className="text-slate-400 text-xs font-bold leading-relaxed mt-2 uppercase tracking-tight">تأكد من إدخال البيانات المحاسبية بدقة لضمان صحة القيود.</p>
                                </div>
                            </div>

                            <div className="relative z-10 flex flex-col gap-3">
                                <div className="flex items-center gap-3 text-emerald-400">
                                    <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                                    <span className="text-[10px] font-black uppercase tracking-widest">ميزة الربط المحاسبي</span>
                                </div>
                                <div className="flex items-center gap-3 text-blue-400">
                                    <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                                    <span className="text-[10px] font-black uppercase tracking-widest">تعدد العملات</span>
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 p-8 md:p-10 max-h-[90vh] overflow-y-auto">
                            <form onSubmit={handleSave} className="space-y-8">
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mr-2">اسم الفرع</label>
                                            <input
                                                required
                                                type="text"
                                                value={formData.name || ''}
                                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                placeholder="مثال: صنعاء"
                                                className="w-full bg-slate-50 border-none px-5 py-4 rounded-2xl font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/10 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mr-2">رقم الفرع (محاسبياً)</label>
                                            <input
                                                type="text"
                                                value={formData.branchNumber || ''}
                                                onChange={e => setFormData({ ...formData, branchNumber: e.target.value })}
                                                placeholder="مثال: 101"
                                                className="w-full bg-slate-50 border-none px-5 py-4 rounded-2xl font-mono font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/10 outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-6 bg-slate-50 rounded-[2rem] space-y-6">
                                        <div className="flex items-center gap-2 mb-2">
                                            <BarChart3 className="w-4 h-4 text-indigo-500" />
                                            <span className="text-xs font-black text-indigo-900 uppercase tracking-widest">بيانات الحساب المدين (المقيد)</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <input
                                                type="text"
                                                placeholder="رقم الحساب"
                                                value={formData.creditAccountNumber || ''}
                                                onChange={e => setFormData({ ...formData, creditAccountNumber: e.target.value })}
                                                className="bg-white border-none px-4 py-3.5 rounded-xl font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                            />
                                            <input
                                                type="text"
                                                placeholder="التحليلي"
                                                value={formData.creditSubAccountNumber || ''}
                                                onChange={e => setFormData({ ...formData, creditSubAccountNumber: e.target.value })}
                                                className="bg-white border-none px-4 py-3.5 rounded-xl font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                            />
                                            <input
                                                type="text"
                                                placeholder="مركز التكلفة"
                                                value={formData.creditCostCenter || ''}
                                                onChange={e => setFormData({ ...formData, creditCostCenter: e.target.value })}
                                                className="bg-white border-none px-4 py-3.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                            />
                                            <input
                                                type="text"
                                                placeholder="رقم المركز"
                                                value={formData.creditCostCenterId || ''}
                                                onChange={e => setFormData({ ...formData, creditCostCenterId: e.target.value })}
                                                className="bg-white border-none px-4 py-3.5 rounded-xl font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mr-2">العملة المحلية</label>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, currencyType: 'old_rial' })}
                                                    className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${formData.currencyType === 'old_rial'
                                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                                                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                        }`}
                                                >
                                                    ريال قديم
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, currencyType: 'new_rial' })}
                                                    className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${formData.currencyType === 'new_rial'
                                                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                                                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                        }`}
                                                >
                                                    ريال جديد
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mr-2">مصدر الراتب</label>
                                            <select
                                                value={formData.defaultSalarySource}
                                                onChange={e => setFormData({ ...formData, defaultSalarySource: e.target.value as 'YER' | 'SAR' })}
                                                className="w-full bg-slate-50 border-none px-5 py-3.5 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                                            >
                                                <option value="YER">ريال يمني</option>
                                                <option value="SAR">ريال سعودي</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl">
                                        <div className="flex items-center gap-3">
                                            <ShieldCheck className={`w-5 h-5 ${formData.isActive ? 'text-emerald-500' : 'text-slate-400'}`} />
                                            <span className="text-sm font-black text-slate-700">حالة الفرع (نشط)</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                                            className={`w-14 h-8 rounded-full transition-all relative ${formData.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                        >
                                            <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-sm transition-all ${formData.isActive ? 'right-7' : 'right-1'}`}></div>
                                        </button>
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-4 border-t border-slate-100">
                                    <button
                                        type="submit"
                                        className="flex-[2] py-5 bg-indigo-600 hover:bg-slate-900 text-white font-black rounded-3xl transition-all shadow-xl shadow-indigo-600/20 active:scale-95"
                                    >
                                        {editingBranch ? 'حفظ التغييرات' : 'إتمام الإضافة'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="flex-1 py-5 bg-slate-100 text-slate-500 font-bold rounded-3xl hover:bg-slate-200 transition-all active:scale-95"
                                    >
                                        إلغاء
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BranchesPage;
