import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import { DashboardCharts } from './DashboardCharts';
import { PremiumCard } from './PremiumCard';
import { PremiumStat } from './PremiumStat';
import { safeCompare } from '../utils';

export const PremiumDashboardPage: React.FC = () => {
    const {
        currentUser, financialTips, addFinancialTip,
        restaurants, fundSnapshots, bankDefinitions, history, featureFlags
    } = useAppContext();
    
    const [activeTipIndex, setActiveTipIndex] = useState(0);
    const [selectedGroupTitle, setSelectedGroupTitle] = useState<string | null>(null);
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const [quickTipText, setQuickTipText] = useState('');
    const [quickTipType, setQuickTipType] = useState<'tip' | 'alert' | 'warning' | 'guidance'>('tip');

    // Navigation Groups (Synced with DashboardPage.tsx)
    const rawNavGroups = [
        {
            title: 'المراجعات المالية',
            icon: 'account_balance',
            color: 'indigo',
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
            color: 'cyan',
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
            color: 'violet',
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
            color: 'emerald',
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
            color: 'slate',
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

    // Prepare Data (Matching DashboardPage.tsx logic)
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

    return (
        <div className="min-h-screen premium-mode pb-24" dir="rtl">
            <div className="max-w-7xl mx-auto px-6 py-12">
                
                {/* Header Section */}
                <header className="flex flex-col md:flex-row items-center justify-between gap-8 mb-16 animate-premium-fade-up">
                    <div className="text-right flex-1">
                        <div className="flex items-center gap-3 mb-2">
                             <span className="text-indigo-400 font-bold text-premium">FINANCIAL INTELLIGENCE</span>
                             <div className="h-px w-12 bg-indigo-500/30" />
                        </div>
                        <h1 className="text-5xl md:text-7xl font-black text-premium mb-4">
                            مرحباً، <span className="gradient-text-indigo">{currentUser?.name || currentUser?.username}</span>
                        </h1>
                        <p className="text-slate-400 text-xl max-w-2xl leading-relaxed">
                            مرحباً بك في لوحة تحكم شركة توصيل ون المالية. تابع بدقة العمليات والمطابقات والمؤشرات الحيوية.
                        </p>
                    </div>

                    <div className="premium-card p-4 shrink-0 rotate-3 hover:rotate-0">
                        <img src="/logo.png" alt="Tawseel One Logo" className="w-48 h-48 object-contain drop-shadow-2xl" />
                    </div>
                </header>

                {/* Stats Grid */}
                <div className="premium-grid mb-12">
                    <PremiumStat 
                        label="نسبة التطابق الإجمالية" 
                        value={reconOverview.matchRate} 
                        suffix="%" 
                        icon="verified" 
                        trend={{ value: 12, isUp: true }}
                        delay={100}
                    />
                    <PremiumStat 
                        label="إجمالي المطابقات" 
                        value={reconOverview.total} 
                        icon="fact_check" 
                        delay={200}
                    />
                    <PremiumStat 
                        label="المطاعم النشطة" 
                        value={restaurantStats.withAccount + restaurantStats.withoutAccount} 
                        icon="restaurant" 
                        delay={300}
                    />
                    <PremiumStat 
                        label="أعلى الفروقات" 
                        value={reconOverview.topVariance[0]?.[1]?.toLocaleString() || 0} 
                        icon="warning" 
                        trend={{ value: reconOverview.topVariance.length, isUp: false }}
                        delay={400}
                    />
                </div>

                {/* Tips Slider (Refined) */}
                <div className="mb-16">
                    <PremiumCard className="relative overflow-hidden group">
                         <div className="flex items-center gap-6 min-h-[100px]">
                            <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
                                <span className="material-symbols-outlined text-4xl gradient-text-indigo animate-pulse">
                                    lightbulb
                                </span>
                            </div>
                             <div className="relative flex-1">
                                {activeTips.map((tip, index) => (
                                    <div
                                        key={index}
                                        className={`absolute inset-y-0 left-0 right-0 transition-all duration-1000 ease-in-out flex items-center ${
                                            index === activeTipIndex ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12 pointer-events-none'
                                        }`}
                                    >
                                        <p className="text-xl md:text-2xl font-bold text-slate-100 leading-relaxed italic">
                                            "{tip.text}"
                                        </p>
                                    </div>
                                ))}
                            </div>
                            <button 
                                onClick={() => setIsQuickAddOpen(true)}
                                className="size-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors border border-white/10"
                                title="إضافة نصيحة سريعة"
                            >
                                <span className="material-symbols-outlined text-white">add</span>
                            </button>
                         </div>
                    </PremiumCard>
                </div>

                {/* Quick Add Tip Modal */}
                {isQuickAddOpen && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsQuickAddOpen(false)} />
                        <PremiumCard className="w-full max-w-lg relative z-10" title="إضافة نصيحة مالية سريعة" icon="lightbulb">
                            <textarea
                                value={quickTipText}
                                onChange={(e) => setQuickTipText(e.target.value)}
                                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-white mb-4 focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="اكتب النصيحة هنا..."
                                rows={3}
                            />
                            <div className="flex gap-4">
                                <button
                                    onClick={async () => {
                                        if (quickTipText.trim()) {
                                            await addFinancialTip?.(quickTipText, quickTipType, "lightbulb");
                                            setQuickTipText('');
                                            setIsQuickAddOpen(false);
                                        }
                                    }}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors"
                                >
                                    حفظ بنجاح
                                </button>
                                <button
                                    onClick={() => setIsQuickAddOpen(false)}
                                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-colors"
                                >
                                    إلغاء
                                </button>
                            </div>
                        </PremiumCard>
                    </div>
                )}

                {/* Charts Section */}
                {featureFlags.dashboard_charts !== false && (
                    <div className="mb-16">
                        <DashboardCharts
                            restaurantStats={restaurantStats}
                            cashFlowData={cashFlowData}
                            reconTrends={reconTrends}
                        />
                    </div>
                )}

                {/* Main Navigation Sections */}
                <div className="space-y-12">
                    <div className="flex items-center gap-4 px-2">
                        <div className="h-10 w-2 bg-indigo-600 rounded-full" />
                        <h2 className="text-3xl font-black text-premium">أقسام الأنظمة</h2>
                    </div>

                    <div className="premium-grid">
                        {navGroups.map((group, idx) => (
                            <PremiumCard 
                                key={group.title} 
                                title={group.title} 
                                icon={group.icon}
                                delay={idx * 100}
                                className="group/group-card cursor-pointer"
                            >
                                <p className="text-slate-400 mb-6 text-sm line-clamp-2">{group.description}</p>
                                
                                <div className="space-y-3">
                                    {group.items.map((item) => (
                                        <NavLink 
                                            key={item.path} 
                                            to={item.path} 
                                            className="premium-nav-item"
                                        >
                                            <span className="material-symbols-outlined text-indigo-400 group-hover/group-card:scale-110 transition-transform">
                                                {item.icon}
                                            </span>
                                            <span className="font-bold flex-1">{item.label}</span>
                                            <span className="material-symbols-outlined text-slate-600 text-sm">
                                                arrow_back_ios
                                            </span>
                                        </NavLink>
                                    ))}
                                </div>
                            </PremiumCard>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
};
