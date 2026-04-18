import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import { DashboardCharts } from './DashboardCharts';
import { PremiumDashboardPage } from './PremiumDashboardPage';
import { safeCompare } from '../utils';

const DashboardPage: React.FC = () => {
    const {
        currentUser, financialTips, addFinancialTip,
        restaurants, fundSnapshots, bankDefinitions, history, featureFlags
    } = useAppContext();
    const [activeTipIndex, setActiveTipIndex] = useState(0);
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const [quickTipText, setQuickTipText] = useState('');
    const [quickTipType, setQuickTipType] = useState<'tip' | 'alert' | 'warning' | 'guidance'>('tip');
    const [isPremium, setIsPremium] = useState(() => {
        const saved = localStorage.getItem('isPremiumMode');
        return saved === null ? true : saved === 'true';
    });

    const togglePremium = () => {
        const newValue = !isPremium;
        setIsPremium(newValue);
        localStorage.setItem('isPremiumMode', JSON.stringify(newValue));
    };

    // UI State for Departments
    const [selectedGroupTitle, setSelectedGroupTitle] = useState<string | null>(null);

    // Navigation Groups (Synced with Layout.tsx)
    const rawNavGroups = [
        {
            title: 'المراجعات المالية',
            icon: 'account_balance',
            color: 'blue',
            description: 'مطابقة الصناديق، البنوك، والسيولة النقدية',
            items: [
                { label: 'مطابقة المطاعم', path: '/input', icon: 'restaurant', permission: 'recon_view' },
                { label: 'مطابقة الصناديق', path: '/funds', icon: 'account_balance', permission: 'funds_view' },
                { label: 'مراجعة السيولة', path: '/liquidity-review', icon: 'account_balance_wallet', permission: 'funds_view', featureFlag: 'wallet_liquidity' },
            ]
        },
        {
            title: 'عمليات الصرف والمدفوعات',
            icon: 'payments',
            color: 'emerald',
            description: 'إدارة الفواتير، سداد الهواتف، وتجميع الصرف',
            items: [
                { label: 'دفاتر الفواتير', path: '/invoice-batches', icon: 'receipt_long', permission: 'invoice_batches_view', featureFlag: 'invoice_disbursement' },
                { label: 'تجميع الصرف', path: '/sum-disbursement', icon: 'summarize', permission: 'invoice_manage', featureFlag: 'sum_disbursement' },
                { label: 'سداد الهواتف', path: '/phone-payments', icon: 'phone_iphone', permission: 'phone_payments_manage', featureFlag: 'phone_payments' },
            ]
        },
        {
            title: 'شؤون الموظفين',
            icon: 'badge',
            color: 'indigo',
            description: 'بيانات الموظفين، السلف، الخصميات والإنذارات',
            items: [
                { label: 'بيانات الموظفين', path: '/employees', icon: 'badge', permission: 'users_view' },
                { label: 'طلبات السلف', path: '/loan-requests', icon: 'payments', permission: 'loans_view', featureFlag: 'loan_requests' },
                { label: 'الخصميات والإنذارات', path: '/deductions', icon: 'money_off', permission: 'deductions_view' },
                { label: 'تقارير السلف', path: '/loan-reports', icon: 'analytics', permission: 'loan_reports_view', featureFlag: 'loan_reports' },
            ]
        },
        {
            title: 'عمليات المطاعم',
            icon: 'storefront',
            color: 'amber',
            description: 'إدارة المطاعم، حسابات البنوك، والأرشفة',
            items: [
                { label: 'إدخال حسابات المطاعم', path: '/transfer-accounts', icon: 'move_up', permission: 'restaurants_add', featureFlag: 'transfer_accounts' },
                { label: 'سداد المطاعم', path: '/restaurant-payments', icon: 'payments', permission: 'payments_view', featureFlag: 'restaurant_payments' },
                { label: 'سجل دفعات المطاعم', path: '/payments/history', icon: 'history', permission: 'payments_view', featureFlag: 'payment_history' },
                { label: 'دليل المطاعم', path: '/restaurants', icon: 'storefront', permission: 'restaurants_view' },
                { label: 'العمليات (Excel)', path: '/operations-grid', icon: 'grid_on', permission: 'restaurants_view', featureFlag: 'operations_grid' },
                { label: 'أرشيف الكشوفات', path: '/archives', icon: 'inventory_2', permission: 'archives_view' },
            ]
        },
        {
            title: 'الأدوات والأنظمة',
            icon: 'build',
            color: 'rose',
            description: 'أدوات التحويل، تقسيم PDF، والإدارة',
            items: [
                { label: 'تحويل الأرصدة المجمعة', path: '/tools/bulk-transfer', icon: 'currency_exchange', permission: 'tools_manage', featureFlag: 'bulk_transfer_tool' },
                { label: 'مزامنة عملة الحساب', path: '/tools/currency-sync', icon: 'sync', permission: 'tools_manage', featureFlag: 'currency_sync_tool' },
                { label: 'تقسيم وتسمية PDF', path: '/tools/pdf-splitter', icon: 'picture_as_pdf', permission: 'restaurants_view', featureFlag: 'pdf_splitter' },
                { label: 'سجل النشاط', path: '/activity-logs', icon: 'history_edu', permission: 'logs_view' },
                { label: 'إدارة الفروع', path: '/branches', icon: 'domain', permission: 'branches_view' },
                { label: 'إعدادات النظام', path: '/settings', icon: 'settings' },
            ]
        }
    ];

    // Filter Groups
    const navGroups = rawNavGroups.map(group => {
        const filteredItems = group.items.filter(item => {
            if (item.featureFlag && featureFlags[item.featureFlag] === false) return false;
            if (currentUser?.role === 'super_admin') return true;
            if (!item.permission) return true;
            return currentUser?.permissions?.includes(item.permission as any);
        });
        return { ...group, items: filteredItems };
    }).filter(group => group.items.length > 0);

    const activeGroup = navGroups.find(g => g.title === selectedGroupTitle);

    const activeTips = (financialTips && financialTips.length > 0)
        ? financialTips.filter(t => t && t.isActive)
        : [
            { text: "المحاسبة هي لغة الأعمال؛ ومن لا يتقن لغته، لا يمكنه قيادة مؤسسته نحو النجاح.", icon: "language", type: 'tip' },
            { text: "احذر من النفقات الصغيرة؛ فثقبٌ صغير كفيلٌ بإغراق سفينة عظيمة.", icon: "leak_add", type: 'tip' },
            { text: "كل ريال يتم رصده بدقة اليوم، هو لبنة في بناء مستقبل شركة 'توصيل ون'.", icon: "domain", type: 'tip' }
        ];

    useEffect(() => {
        if (activeTips.length <= 1) return;
        const interval = setInterval(() => {
            setActiveTipIndex(prev => (prev + 1) % activeTips.length);
        }, 5000);
        return () => clearInterval(interval);
    }, [activeTips.length]);

    // Prepare Chart Data
    const restaurantStats = {
        withAccount: (restaurants || []).filter(r => r && r.transferAccounts && r.transferAccounts.length > 0).length,
        withoutAccount: (restaurants || []).filter(r => r && (!r.transferAccounts || r.transferAccounts.length === 0)).length
    };

    const cashFlowData = (bankDefinitions || [])
        .filter(b => b && b.isActive)
        .map(b => {
            let balance = 0;
            const snapshots = Array.isArray(fundSnapshots) ? fundSnapshots : [];
            const latestSnapshot = [...snapshots].sort((a, b) => safeCompare((b.fullTimestamp || b.id), (a.fullTimestamp || a.id)))[0];
            if (latestSnapshot) {
                const allItems = [
                    ...(latestSnapshot.oldRiyalItems || []),
                    ...(latestSnapshot.newRiyalItems || []),
                    ...(latestSnapshot.sarItems || []),
                    ...(latestSnapshot.blueUsdItems || []),
                    ...(latestSnapshot.whiteUsdItems || []),
                    ...(latestSnapshot.customCurrencyItems || [])
                ];
                const item = allItems.find(i => i.bankDefId === b.id);
                if (item) balance = item.bankBalance;
            }
            return { name: b.name, balance };
        })
        .slice(0, 5);

    const reconTrends = (history || [])
        .filter(h => h && h.date)
        .sort((a, b) => safeCompare(a.date, b.date))
        .slice(-7)
        .map(h => ({
            date: (h.date || '').split('/').slice(0, 2).join('/') || h.date,
            matches: h.count || 1,
            variance: Math.abs(h.calculatedVariance || 0)
        }));

    // Phase 6.5: Recon overview stats
    const reconOverview = React.useMemo(() => {
        const allHistory = (history || []).filter(h => h && h.date);
        const matched = allHistory.filter(h => h.status === 'matched' || h.status === 'approved').length;
        const total = allHistory.length;
        const matchRate = total > 0 ? Math.round((matched / total) * 100) : 0;

        // Top variance restaurants
        const restaurantVariances: Record<string, number> = {};
        allHistory.forEach(h => {
            if (h.restaurantName && Math.abs(h.calculatedVariance || 0) > 0) {
                restaurantVariances[h.restaurantName] = (restaurantVariances[h.restaurantName] || 0) + Math.abs(h.calculatedVariance);
            }
        });
        const topVariance = Object.entries(restaurantVariances)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        return { matched, total, matchRate, topVariance };
    }, [history]);

    if (isPremium) {
        return (
            <div className="relative">
                <PremiumDashboardPage />
                <button 
                    onClick={togglePremium}
                    className="fixed bottom-6 left-6 z-[100] px-4 py-2 bg-slate-800/50 hover:bg-slate-800 backdrop-blur-md text-white/50 hover:text-white rounded-full text-xs font-bold border border-white/10 transition-all flex items-center gap-2"
                >
                    <span className="material-symbols-outlined text-sm">settings_backup_restore</span>
                    الرجوع للنسخة العادية
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 select-none animate-fade-in" dir="rtl">
            <button 
                onClick={togglePremium}
                className="fixed bottom-6 left-6 z-[100] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-xs font-bold shadow-xl transition-all flex items-center gap-2"
            >
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                الوضع المتميز (Premium)
            </button>
            <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">

                {/* Hero Section */}
                <div className="relative bg-red-600 dark:bg-red-950 rounded-[3rem] p-8 md:p-12 overflow-hidden shadow-2xl text-white mb-12">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <span className="material-symbols-outlined text-[12rem]">account_balance_wallet</span>
                    </div>

                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="text-center md:text-right flex-1">
                            <h1 className="text-4xl md:text-6xl font-black font-display mb-4 leading-tight">
                                مرحباً، {currentUser?.name || currentUser?.username} 👋
                            </h1>
                            <p className="text-red-100 text-xl font-bold opacity-80 mb-6 italic">الادارة المالية - شركة توصيل ون</p>

                            {/* Tips Slider */}
                            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 max-w-2xl relative group min-h-[140px]">
                                {activeTips.map((tip, index) => (
                                    <div
                                        key={index}
                                        className={`absolute inset-x-6 top-6 transition-all duration-700 ease-in-out transform ${index === activeTipIndex
                                            ? 'opacity-100 translate-y-0 scale-100'
                                            : 'opacity-0 translate-y-8 scale-95 pointer-events-none'
                                            } flex items-start gap-4`}
                                    >
                                        <div className="size-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-2xl">{tip.icon}</span>
                                        </div>
                                        <p className="text-lg md:text-xl font-black leading-relaxed">
                                            {tip.text}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="size-56 md:size-72 bg-white dark:bg-slate-800 rounded-[3.5rem] p-10 shadow-2xl flex items-center justify-center shrink-0 border-[12px] border-white/20 transform hover:scale-105 transition-all duration-700 hover:rotate-2">
                            <img src="/logo.png" alt="Tawseel One Logo" className="w-full h-full object-contain" />
                        </div>
                    </div>
                </div>

                {/* Dashboard Charts */}
                {featureFlags.dashboard_charts !== false && (
                    <div className="mb-12 animate-slide-up">
                        <DashboardCharts
                            restaurantStats={restaurantStats}
                            cashFlowData={cashFlowData}
                            reconTrends={reconTrends}
                        />
                    </div>
                )}

                {/* Phase 6.5: Reconciliation Overview */}
                {reconOverview.total > 0 && (
                    <div className="mb-12 animate-slide-up">
                        <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3 mb-6 px-2">
                            <div className="size-10 rounded-2xl bg-violet-600 text-white flex items-center justify-center shadow-lg">
                                <span className="material-symbols-outlined text-xl">monitoring</span>
                            </div>
                            ملخص المطابقات
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            {/* Match Rate */}
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-sm font-bold text-slate-500">نسبة التطابق</span>
                                    <div className="size-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                                        <span className="material-symbols-outlined">percent</span>
                                    </div>
                                </div>
                                <div className="text-4xl font-black text-emerald-600">{reconOverview.matchRate}%</div>
                                <div className="text-xs font-bold text-slate-400 mt-1">{reconOverview.matched} من {reconOverview.total} مطابقة</div>
                                <div className="mt-3 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${reconOverview.matchRate}%` }} />
                                </div>
                            </div>

                            {/* Total Reconciliations */}
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-sm font-bold text-slate-500">إجمالي المطابقات</span>
                                    <div className="size-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 flex items-center justify-center">
                                        <span className="material-symbols-outlined">fact_check</span>
                                    </div>
                                </div>
                                <div className="text-4xl font-black text-blue-600">{reconOverview.total}</div>
                                <div className="text-xs font-bold text-slate-400 mt-1">مطابقة مسجلة</div>
                            </div>

                            {/* Top Variance Restaurants */}
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-sm font-bold text-slate-500">أعلى فروقات</span>
                                    <div className="size-10 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 flex items-center justify-center">
                                        <span className="material-symbols-outlined">trending_up</span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {reconOverview.topVariance.length > 0 ? reconOverview.topVariance.map(([name, amount], idx) => (
                                        <div key={name} className="flex items-center justify-between text-xs">
                                            <span className="font-bold text-slate-700 dark:text-slate-300 truncate max-w-[140px]">{idx + 1}. {name}</span>
                                            <span className="font-black text-red-500 font-mono">{amount.toLocaleString()}</span>
                                        </div>
                                    )) : (
                                        <span className="text-xs text-slate-400">لا توجد فروقات</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Departments Section */}
                <div className="space-y-8">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-4">
                            <div className="size-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-lg">
                                <span className="material-symbols-outlined text-2xl">apps</span>
                            </div>
                            أقسام النظام الرئيسية
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {navGroups.map((group, idx) => {
                            const colorMap: Record<string, string> = {
                                blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
                                emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
                                indigo: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
                                amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
                                rose: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
                            };
                            const colorClasses = colorMap[group.color as string] || colorMap.blue;

                            return (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedGroupTitle(group.title)}
                                    className="group relative bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 text-right overflow-hidden border-b-4 hover:border-b-red-500"
                                >
                                    <div className="absolute top-0 left-0 w-32 h-32 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity -translate-x-1/4 -translate-y-1/4">
                                        <span className="material-symbols-outlined text-[10rem]">{group.icon}</span>
                                    </div>

                                    <div className={`size-16 rounded-2xl ${colorClasses} flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 group-hover:rotate-6 transition-all duration-500`}>
                                        <span className="material-symbols-outlined text-3xl font-bold">{group.icon}</span>
                                    </div>

                                    <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-3 group-hover:text-red-600 transition-colors">{group.title}</h3>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm font-bold mb-8 leading-relaxed line-clamp-2">{group.description}</p>

                                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-black text-xs bg-red-50 dark:bg-red-900/20 w-fit px-4 py-2 rounded-xl group-hover:bg-red-600 group-hover:text-white transition-all">
                                        <span>عرض {group.items.length} خيارات</span>
                                        <span className="material-symbols-outlined text-sm group-hover:translate-x-[-4px] transition-transform">arrow_back</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Department Modal (Notification Center Style) */}
                {selectedGroupTitle && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-8 md:p-12 animate-fade-in" dir="rtl">
                        {/* Heavy Backdrop Blur Overlay */}
                        <div
                            className="absolute inset-0 bg-slate-950/20 backdrop-blur-2xl transition-all duration-700"
                            onClick={() => setSelectedGroupTitle(null)}
                        ></div>

                        {/* Floating Glassmorphism Panel */}
                        <div className="relative bg-white/75 dark:bg-slate-900/80 backdrop-blur-xl w-full max-w-2xl rounded-[3.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.35)] border border-white/50 dark:border-slate-700/50 overflow-hidden animate-scale-up ring-1 ring-black/5">
                            {/* Modal Header - Premium Visual Bar */}
                            <div className="bg-red-600/90 dark:bg-red-500/80 p-10 text-white relative overflow-hidden backdrop-blur-md">
                                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                                    <span className="material-symbols-outlined text-[10rem]">{activeGroup?.icon}</span>
                                </div>

                                <div className="relative z-10 flex items-center justify-between">
                                    <div className="flex items-center gap-6 text-right">
                                        <div className="size-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-lg border border-white/30">
                                            <span className="material-symbols-outlined text-4xl">{activeGroup?.icon}</span>
                                        </div>
                                        <div>
                                            <h2 className="text-3xl font-black uppercase tracking-tight mb-1 drop-shadow-sm">{selectedGroupTitle}</h2>
                                            <p className="text-red-50/70 text-sm font-bold">{activeGroup?.description}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedGroupTitle(null)}
                                        className="size-12 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center transition-all shadow-lg active:scale-90 border border-white/10 group"
                                    >
                                        <span className="material-symbols-outlined group-hover:rotate-90 transition-transform">close</span>
                                    </button>
                                </div>
                            </div>

                            {/* Modal Content - Tile Grid */}
                            <div className="p-10 max-h-[60vh] overflow-y-auto thin-scrollbar bg-transparent">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    {activeGroup?.items.map((item, idx) => (
                                        <NavLink
                                            key={idx}
                                            to={item.path}
                                            className="group bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm p-6 rounded-[2.2rem] border border-white dark:border-slate-700/50 hover:border-red-500/50 hover:bg-white dark:hover:bg-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all flex items-center gap-5 active:scale-[0.98] text-right"
                                        >
                                            <div className="size-14 rounded-2xl bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 group-hover:bg-red-600 group-hover:text-white shadow-md flex items-center justify-center shrink-0 transition-all border border-slate-100 dark:border-slate-600">
                                                <span className="material-symbols-outlined text-2xl">{item.icon}</span>
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-black text-slate-800 dark:text-white group-hover:text-red-600 transition-colors text-sm tracking-wide leading-tight">{item.label}</div>
                                                <div className="text-[10px] text-slate-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">استكشاف الخيار</div>
                                            </div>
                                            <span className="material-symbols-outlined text-slate-300 group-hover:text-red-600 transition-colors group-hover:translate-x-[-4px]">arrow_back</span>
                                        </NavLink>
                                    ))}
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-8 bg-white/20 dark:bg-slate-900/20 backdrop-blur-md border-t border-white/20 dark:border-slate-800/50 flex justify-end">
                                <button
                                    onClick={() => setSelectedGroupTitle(null)}
                                    className="px-10 py-4 bg-white/40 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 rounded-2xl font-black text-sm hover:bg-white dark:hover:bg-slate-700 transition-all shadow-sm border border-white/40 dark:border-slate-700 active:scale-95"
                                >
                                    إغلاق القائمة
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DashboardPage;
