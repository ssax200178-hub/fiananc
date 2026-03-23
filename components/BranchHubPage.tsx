import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import {
    Users,
    Utensils,
    FileText,
    ArrowRight,
    ChevronRight,
    Home,
    MapPin,
    Activity,
    CreditCard,
    X
} from 'lucide-react';

const BranchHubPage: React.FC = () => {
    const { branchId } = useParams<{ branchId: string }>();
    const navigate = useNavigate();
    const { branches, employees, restaurants, allInvoiceBatchItems } = useAppContext();
    const [activeModal, setActiveModal] = React.useState<'employees' | 'restaurants' | 'invoices' | null>(null);

    const branch = branches.find(b => b.id === branchId);

    if (!branch) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-2xl font-bold text-red-500">الفرع غير موجود</h2>
                <button
                    onClick={() => navigate('/branches')}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
                >
                    العودة لقائمة الفروع
                </button>
            </div>
        );
    }

    // Calculate counts for this branch
    const branchEmployees = employees.filter(e => e.branch === branch.name);
    const branchRestaurants = restaurants.filter(r => r.branch === branch.name);
    const branchInvoices = (allInvoiceBatchItems || []).filter(i => i.branchId === branch.id);
    const totalBooklets = branchInvoices.reduce((sum, item) => sum + (Number(item.bookletCount) || 0), 0);

    const hubOptions = [
        {
            id: 'employees',
            title: 'الموظفين',
            description: `إدارة وبيانات ${branchEmployees.length} موظف في هذا الفرع`,
            icon: <Users className="w-8 h-8 text-blue-500" />,
            color: 'from-blue-500/20 to-blue-600/20',
            borderColor: 'border-blue-500/30',
            path: '/employees',
            count: branchEmployees.length,
            unit: 'موظف'
        },
        {
            id: 'restaurants',
            title: 'المطاعم',
            description: `إدارة وحسابات ${branchRestaurants.length} مطعم مرتبط بالفرع`,
            icon: <Utensils className="w-8 h-8 text-orange-500" />,
            color: 'from-orange-500/20 to-orange-600/20',
            borderColor: 'border-orange-500/30',
            path: '/restaurants',
            count: branchRestaurants.length,
            unit: 'مطعم'
        },
        {
            id: 'invoices',
            title: 'الفواتير المنصرفة',
            description: `سجل صرف دفاتر الفواتير لهذا الفرع (${totalBooklets} دفتر)`,
            icon: <FileText className="w-8 h-8 text-emerald-500" />,
            color: 'from-emerald-500/20 to-emerald-600/20',
            borderColor: 'border-emerald-500/30',
            path: '/invoice-disbursement',
            count: totalBooklets,
            unit: 'دفتر'
        }
    ];

    const handleNavigate = (path: string, id: string) => {
        if (id === 'employees' || id === 'restaurants' || id === 'invoices') {
            setActiveModal(id as 'employees' | 'restaurants' | 'invoices');
        } else {
            navigate(path);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 animate-in fade-in duration-500" dir="rtl">
            {/* Breadcrumbs */}
            <nav className="flex items-center space-x-reverse space-x-2 text-sm text-slate-500 mb-8 bg-white/50 p-3 rounded-2xl border border-slate-200/50 w-fit backdrop-blur-sm">
                <Link to="/" className="hover:text-blue-600 transition-colors">
                    <Home className="w-4 h-4" />
                </Link>
                <ChevronRight className="w-4 h-4" />
                <Link to="/branches" className="hover:text-blue-600 transition-colors font-medium">إدارة الفروع</Link>
                <ChevronRight className="w-4 h-4" />
                <span className="text-slate-900 font-bold">{branch.name}</span>
            </nav>

            {/* Header / Branch Info */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 rounded-[2.5rem] p-8 md:p-12 mb-10 shadow-2xl shadow-blue-900/20">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -ml-20 -mb-20"></div>

                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <span className="px-4 py-1.5 bg-blue-500/20 backdrop-blur-md border border-blue-400/30 text-blue-200 rounded-full text-xs font-bold tracking-wider uppercase">Branch Terminal</span>
                            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></div>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
                            مركز إدارة <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-emerald-300">{branch.name}</span>
                        </h1>
                        <div className="flex flex-wrap items-center gap-6 text-slate-300">
                            <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl backdrop-blur-sm border border-white/10">
                                <MapPin className="w-4 h-4 text-emerald-400" />
                                <span className="text-sm font-medium">{branch.branchNumber}</span>
                            </div>
                            <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl backdrop-blur-sm border border-white/10">
                                <CreditCard className="w-4 h-4 text-blue-400" />
                                <span className="text-sm font-medium">{branch.currencyType === 'old_rial' ? 'ريال قديم' : 'ريال جديد'}</span>
                            </div>
                            <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl backdrop-blur-sm border border-white/10">
                                <Activity className="w-4 h-4 text-orange-400" />
                                <span className="text-sm font-medium">الحساب: {branch.creditAccountNumber}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 bg-white/10 border border-white/20 p-6 rounded-[2rem] backdrop-blur-md">
                        <div className="text-center px-6 border-l border-white/10">
                            <div className="text-2xl font-black text-white">{branchEmployees.length}</div>
                            <div className="text-[10px] text-slate-300 uppercase font-bold tracking-widest mt-1">موظف</div>
                        </div>
                        <div className="text-center px-6 border-l border-white/10">
                            <div className="text-2xl font-black text-white">{branchRestaurants.length}</div>
                            <div className="text-[10px] text-slate-300 uppercase font-bold tracking-widest mt-1">مطعم</div>
                        </div>
                        <div className="text-center px-6">
                            <div className="text-2xl font-black text-white">{totalBooklets}</div>
                            <div className="text-[10px] text-slate-300 uppercase font-bold tracking-widest mt-1">دفتر</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hub Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {hubOptions.map((option, index) => (
                    <button
                        key={option.id}
                        onClick={() => handleNavigate(option.path, option.id)}
                        style={{ animationDelay: `${index * 150}ms` }}
                        className={`group relative overflow-hidden bg-white border ${option.borderColor} p-8 rounded-[2.5rem] shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 text-right flex flex-col h-full animate-in slide-in-from-bottom-8`}
                    >
                        {/* Background Gradient Hover Element */}
                        <div className={`absolute top-0 right-0 w-48 h-48 bg-gradient-to-br ${option.color} rounded-full blur-3xl -mr-20 -mt-20 opacity-50 group-hover:opacity-100 transition-opacity duration-500`}></div>

                        <div className="relative flex justify-between items-start mb-8">
                            <div className="p-4 bg-slate-50 rounded-3xl group-hover:scale-110 group-hover:bg-white group-hover:shadow-lg transition-all duration-500">
                                {option.icon}
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-5xl font-black text-slate-900 group-hover:text-blue-600 transition-colors duration-500 tabular-nums">
                                    {option.count}
                                </span>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{option.unit}</span>
                            </div>
                        </div>

                        <h3 className="relative text-2xl font-black text-slate-900 mb-3 group-hover:translate-x-[-4px] transition-transform duration-500">
                            {option.title}
                        </h3>

                        <p className="relative text-slate-500 text-sm leading-relaxed mb-8 flex-grow">
                            {option.description}
                        </p>

                        <div className="relative flex items-center justify-between mt-auto">
                            <div className="flex items-center gap-2 group-hover:gap-4 transition-all duration-500">
                                <span className="text-xs font-black text-blue-600 uppercase tracking-widest">عرض التفاصيل</span>
                                <ArrowRight className="w-5 h-5 text-blue-600" />
                            </div>
                            <div className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center group-hover:bg-blue-600 group-hover:border-blue-600 group-hover:text-white transition-all duration-500">
                                <ChevronRight className="w-5 h-5" />
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {/* Quick Actions Footer */}
            <div className="mt-12 p-8 bg-white/40 border border-white/60 backdrop-blur-md rounded-[2.5rem] flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
                <div className="flex items-center gap-4 text-slate-600">
                    <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
                        <Activity className="w-6 h-6 text-indigo-500" />
                    </div>
                    <div>
                        <div className="text-sm font-bold text-slate-900">حالة الفرع</div>
                        <div className="text-xs text-slate-500">الفرع نشط حالياً ويعمل بكامل طاقته</div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={() => navigate('/branches')}
                        className="px-8 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-2xl hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95"
                    >
                        إدارة كل الفروع
                    </button>
                    <button
                        onClick={() => navigate('/')}
                        className="px-8 py-3 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 active:scale-95"
                    >
                        العودة للرئيسية
                    </button>
                </div>
            </div>

            {/* Modal */}
            {activeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                {activeModal === 'employees' && <div className="p-2 bg-blue-100 rounded-xl"><Users className="w-6 h-6 text-blue-600" /></div>}
                                {activeModal === 'restaurants' && <div className="p-2 bg-orange-100 rounded-xl"><Utensils className="w-6 h-6 text-orange-600" /></div>}
                                {activeModal === 'invoices' && <div className="p-2 bg-emerald-100 rounded-xl"><FileText className="w-6 h-6 text-emerald-600" /></div>}
                                <div>
                                    <h2 className="text-xl font-black text-slate-800">
                                        {activeModal === 'employees' && 'موظفي الفرع'}
                                        {activeModal === 'restaurants' && 'مطاعم الفرع'}
                                        {activeModal === 'invoices' && 'سجل الفواتير المنصرفة'}
                                    </h2>
                                    <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">{branch.name}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setActiveModal(null)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors bg-white border border-slate-200 shadow-sm"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-0 bg-white">
                            {activeModal === 'employees' && (
                                <table className="w-full text-sm text-right">
                                    <thead className="text-xs text-slate-500 bg-slate-50 sticky top-0 shadow-sm">
                                        <tr>
                                            <th className="px-6 py-4 font-black border-b border-slate-200">الاسم</th>
                                            <th className="px-6 py-4 font-black border-b border-slate-200">رقم الحساب</th>
                                            <th className="px-6 py-4 font-black border-b border-slate-200 text-left">الهاتف</th>
                                            <th className="px-6 py-4 font-black border-b border-slate-200 text-center">الحالة</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {branchEmployees.length === 0 ? (
                                            <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500 font-medium">لا يوجد موظفين مسجلين في هذا الفرع</td></tr>
                                        ) : branchEmployees.map(emp => (
                                            <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="px-6 py-4 font-bold text-slate-900">{emp.name}</td>
                                                <td className="px-6 py-4 text-slate-600 font-mono text-xs">{emp.systemAccountNumber || '-'}</td>
                                                <td className="px-6 py-4 text-slate-600 font-mono text-xs text-left" dir="ltr">{emp.phone}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${emp.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                        {emp.isActive ? 'نشط' : 'موقف'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {activeModal === 'restaurants' && (
                                <table className="w-full text-sm text-right">
                                    <thead className="text-xs text-slate-500 bg-slate-50 sticky top-0 shadow-sm">
                                        <tr>
                                            <th className="px-6 py-4 font-black border-b border-slate-200">المطعم</th>
                                            <th className="px-6 py-4 font-black border-b border-slate-200">المالك</th>
                                            <th className="px-6 py-4 font-black border-b border-slate-200 text-left">الهاتف</th>
                                            <th className="px-6 py-4 font-black border-b border-slate-200">رقم الحساب</th>
                                            <th className="px-6 py-4 font-black border-b border-slate-200 text-center">الحالة</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {branchRestaurants.length === 0 ? (
                                            <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500 font-medium">لا يوجد مطاعم مسجلة في هذا الفرع</td></tr>
                                        ) : branchRestaurants.map(rest => (
                                            <tr key={rest.id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="px-6 py-4 font-bold text-slate-900 block truncate max-w-[200px]" title={rest.name}>{rest.name}</td>
                                                <td className="px-6 py-4 text-slate-600 font-medium block truncate max-w-[150px]" title={rest.ownerName}>{rest.ownerName}</td>
                                                <td className="px-6 py-4 text-slate-600 font-mono text-xs text-left" dir="ltr">{rest.phone}</td>
                                                <td className="px-6 py-4 text-slate-600 font-mono text-xs">{rest.restaurantAccountNumber}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${rest.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                        {rest.isActive ? 'نشط' : 'موقف'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {activeModal === 'invoices' && (
                                <table className="w-full text-sm text-right">
                                    <thead className="text-xs text-slate-500 bg-slate-50 sticky top-0 shadow-sm">
                                        <tr>
                                            <th className="px-6 py-4 font-black border-b border-slate-200">التاريخ</th>
                                            <th className="px-6 py-4 font-black border-b border-slate-200 text-center">الكمية (دفتر)</th>
                                            <th className="px-6 py-4 font-black border-b border-slate-200">من سيريال</th>
                                            <th className="px-6 py-4 font-black border-b border-slate-200">إلى سيريال</th>
                                            <th className="px-6 py-4 font-black border-b border-slate-200 text-left">التكلفة</th>
                                            <th className="px-6 py-4 font-black border-b border-slate-200 text-center">مدخل القيد</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {branchInvoices.length === 0 ? (
                                            <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium">لا يوجد دفعات فواتير منصرفة لهذا الفرع</td></tr>
                                        ) : branchInvoices.map(inv => (
                                            <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="px-6 py-4 font-bold text-slate-700 whitespace-nowrap">{inv.disbursementDate}</td>
                                                <td className="px-6 py-4 text-slate-900 font-black text-center text-lg">{inv.bookletCount}</td>
                                                <td className="px-6 py-4 text-slate-600 font-mono text-xs shadow-sm bg-slate-50/50 rounded-lg">{inv.rangeFrom.toLocaleString('en-US', { useGrouping: false })}</td>
                                                <td className="px-6 py-4 text-slate-600 font-mono text-xs shadow-sm bg-slate-50/50 rounded-lg">{inv.rangeTo.toLocaleString('en-US', { useGrouping: false })}</td>
                                                <td className="px-6 py-4 text-slate-800 font-bold text-left whitespace-nowrap tabular-nums">
                                                    {(branch.currencyType === 'old_rial' ? inv.amountOld : (inv.amountNew || inv.amountOld)).toLocaleString()} <span className="text-[10px] text-slate-500">{branch.currencyType === 'old_rial' ? 'ريال قديم' : 'ريال جديد'}</span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {inv.isPosted ? (
                                                        <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700" title={inv.entryNumber ? `رقم القيد: ${inv.entryNumber}` : ''}>
                                                            مرحل
                                                        </span>
                                                    ) : (
                                                        <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-slate-100 text-slate-600">
                                                            غير مرحل
                                                        </span>
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
        </div>
    );
};

export default BranchHubPage;
