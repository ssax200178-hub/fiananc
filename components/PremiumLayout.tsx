import React, { useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import NotificationBell from './NotificationBell';
import FeedbackModal from './FeedbackModal';
import EmployeeDrawer from './EmployeeDrawer';

const PremiumLayout = () => {
    const { 
        theme, 
        toggleTheme, 
        currentUser, 
        logout, 
        featureFlags, 
        selectedEmployeeDrawerId, 
        setSelectedEmployeeDrawerId,
        togglePremiumUI
    } = useAppContext();
    const location = useLocation();
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

    if (!currentUser) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-[var(--color-header)] border-t-transparent"></div>
            </div>
        );
    }

    if (currentUser.isActive === false) {
        logout();
        return null;
    }

    // Navigation Groups (Exact copy from Layout.tsx for logic consistency)
    const rawNavGroups = [
        {
            items: [
                { label: 'الرئيسية', path: '/', icon: 'dashboard', permission: 'dashboard_view' },
            ]
        },
        {
            title: 'المراجعات المالية',
            items: [
                { label: 'مطابقة المطاعر', path: '/input', icon: 'restaurant', permission: 'recon_view' },
                { label: 'مطابقة الصناديق', path: '/funds', icon: 'account_balance', permission: 'funds_view' },
                { label: 'مراجعة السيولة', path: '/liquidity-review', icon: 'account_balance_wallet', permission: 'funds_view', featureFlag: 'wallet_liquidity' },
            ]
        },
        {
            title: 'عمليات المطاعم',
            items: [
                { label: 'إدخال حسابات المطاعم', path: '/transfer-accounts', icon: 'move_up', permission: 'restaurants_add', featureFlag: 'transfer_accounts' },
                { label: 'سداد المطاعم', path: '/restaurant-payments', icon: 'payments', permission: 'payments_view', featureFlag: 'restaurant_payments' },
                { label: 'الحسابات البنكية', path: '/bank-accounts', icon: 'account_balance', permission: 'restaurants_add' },
                { label: 'سجل دفعات المطاعم', path: '/payments/history', icon: 'history', permission: 'payments_view', featureFlag: 'payment_history' },
                { label: 'كشوفات المطاعم', path: '/accounting/statements', icon: 'request_quote', permission: 'automation_manage' },
                { label: 'دليل المطاعم', path: '/restaurants', icon: 'storefront', permission: 'restaurants_view' },
                { label: 'العمليات (Excel)', path: '/operations-grid', icon: 'grid_on', permission: 'restaurants_view', featureFlag: 'operations_grid' },
                { label: 'أرشيف الكشوفات', path: '/archives', icon: 'inventory_2', permission: 'archives_view' },
            ]
        },
        {
            title: 'عمليات الصرف والمدفوعات',
            items: [
                { label: 'دفاتر الفواتير', path: '/invoice-batches', icon: 'receipt_long', permission: 'invoice_batches_view', featureFlag: 'invoice_disbursement' },
                { label: 'صرف الفواتير', path: '/invoices/disbursement', icon: 'file_present', permission: 'invoice_batches_view' },
                { label: 'تتبع الدفاتر', path: '/invoices/books', icon: 'content_paste_search', permission: 'invoice_batches_view' },
                { label: 'تجميع الصرف', path: '/sum-disbursement', icon: 'summarize', permission: 'invoice_manage', featureFlag: 'sum_disbursement' },
                { label: 'سداد الهواتف', path: '/phone-payments', icon: 'phone_iphone', permission: 'phone_payments_manage', featureFlag: 'phone_payments' },
            ]
        },
        {
            title: 'القيود المحاسبية',
            items: [
                { label: 'إنشاء القيود', path: '/journal-entries', icon: 'edit_note', permission: 'journal_entries_manage' },
                { label: 'دليل الحسابات', path: '/chart-of-accounts', icon: 'account_tree', permission: 'chart_of_accounts_manage' },
            ]
        },
        {
            title: 'نظام السحب',
            items: [
                { label: 'إدارة الجلسة', path: '/scraping/session', icon: 'key', permission: 'automation_manage' },
                { label: 'مركز السحب والأتمتة', path: '/scraping/hub', icon: 'memory', permission: 'automation_manage' },
                { label: 'مستعرض البيانات', path: '/scraping/viewer', icon: 'travel_explore', permission: 'automation_manage' },
                { label: 'تحويل الأرصدة المجمعة', path: '/tools/bulk-transfer', icon: 'currency_exchange', permission: 'tools_manage', featureFlag: 'bulk_transfer_tool' },
                { label: 'مزامنة عملة الحساب', path: '/tools/currency-sync', icon: 'sync', permission: 'tools_manage', featureFlag: 'currency_sync_tool' },
                { label: 'تقسيم وتسمية PDF', path: '/tools/pdf-splitter', icon: 'picture_as_pdf', permission: 'restaurants_view', featureFlag: 'pdf_splitter' },
            ]
        },
        {
            title: 'شؤون الموظفين',
            items: [
                { label: 'بيانات الموظفين', path: '/employees', icon: 'badge', permission: 'users_view' },
                { label: 'طلبات السلف', path: '/loan-requests', icon: 'payments', permission: 'loans_view', featureFlag: 'loan_requests' },
                { label: 'إدارة الفروع', path: '/branches', icon: 'domain', permission: 'branches_view' },
                { label: 'الخصميات والإنذارات', path: '/deductions', icon: 'money_off', permission: 'deductions_view' },
                { label: 'تقارير السلف', path: '/loan-reports', icon: 'analytics', permission: 'loan_reports_view', featureFlag: 'loan_reports' },
            ]
        },
        {
            title: 'الإدارة',
            items: [
                { label: 'سجل النشاط', path: '/activity-logs', icon: 'history_edu', permission: 'logs_view' },
                { label: 'إدارة الصلاحيات', path: '/permissions-matrix', icon: 'admin_panel_settings', permission: 'users_permissions' },
                { label: 'الإعدادات', path: '/settings', icon: 'settings' },
            ]
        },
        {
            title: 'التطوير',
            items: [
                { label: 'ملاحظات المطورين', path: '/developer-feedback', icon: 'bug_report', permission: 'developer_access', featureFlag: 'developer_feedback' },
            ]
        }
    ];

    const navGroups = rawNavGroups.map(group => {
        const filteredItems = group.items.filter(item => {
            if ((item as any).featureFlag && featureFlags[(item as any).featureFlag] === false) return false;
            if (currentUser.role === 'super_admin') return true;
            if (!item.permission) return true;
            return currentUser.permissions?.includes(item.permission as any);
        });
        return { ...group, items: filteredItems };
    }).filter(group => group.items.length > 0);

    const allNavItems = navGroups.flatMap(g => g.items);
    const [expandedGroup, setExpandedGroup] = useState<string | null>('المراجعات المالية');

    const toggleGroup = (title: string) => {
        setExpandedGroup(prev => prev === title ? null : title);
    };

    const currentTitle = allNavItems.find(i => i.path === location.pathname)?.label || 'الادارة المالية';

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex overflow-hidden font-['Outfit',_sans-serif] rtl">
            {/* Ambient Background Blobs */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20 dark:opacity-40">
                <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-blue-400 blur-[120px] animate-pulse"></div>
                <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-indigo-600 blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>

            {/* Sidebar - Premium Glassmorphism */}
            <aside
                className={`fixed inset-y-0 right-0 z-50 w-72 backdrop-blur-xl bg-white/70 dark:bg-slate-900/80 border-l border-white/20 dark:border-white/5 shadow-[0_0_40px_rgba(0,0,0,0.1)] transition-all duration-500 ease-in-out flex flex-col lg:relative lg:translate-x-0 ${
                    isSidebarOpen ? 'translate-x-0' : 'translate-x-[calc(100%+20px)]'
                }`}
            >
                {/* Sidebar Header */}
                <div className="p-8 pb-4 shrink-0">
                    <div className="flex items-center gap-4 group cursor-pointer" onClick={() => navigate('/')}>
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity"></div>
                            <img src="/logo.png" alt="Logo" className="relative h-14 w-auto drop-shadow-xl" />
                        </div>
                        <div>
                            <h1 className="font-black text-xl tracking-tight text-slate-800 dark:text-white leading-none">توصيل <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">ون</span></h1>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold tracking-[0.2em] uppercase mt-1">Nizam Al-Mali</p>
                        </div>
                    </div>
                </div>

                {/* Sidebar Navigation */}
                <nav className="flex-1 px-6 space-y-6 overflow-y-auto scrollbar-hide py-6 text-right" dir="rtl">
                    {navGroups.map((group, groupIndex) => (
                        <div key={groupIndex} className="space-y-2">
                            {group.title && (
                                <button
                                    onClick={() => toggleGroup(group.title!)}
                                    className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                    <span>{group.title}</span>
                                    <span className={`material-symbols-outlined text-xs transition-transform duration-300 ${expandedGroup === group.title ? 'rotate-180' : ''}`}>
                                        keyboard_arrow_down
                                    </span>
                                </button>
                            )}

                            <div className={`space-y-1 overflow-hidden transition-all duration-500 ease-in-out ${
                                !group.title || expandedGroup === group.title ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
                            }`}>
                                {group.items.map((item) => {
                                    const isActive = location.pathname === item.path;
                                    return (
                                        <NavLink
                                            key={item.path}
                                            to={item.path}
                                            className={`flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-300 group relative ${
                                                isActive
                                                    ? 'bg-gradient-to-l from-blue-600/10 to-indigo-600/5 text-blue-600 dark:text-blue-400 font-bold translate-x-[-4px]'
                                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                                            }`}
                                        >
                                            {isActive && (
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-blue-600 rounded-l-full shadow-[0_0_15px_rgba(37,99,235,0.5)]"></div>
                                            )}
                                            <span className={`material-symbols-outlined text-xl transition-transform duration-300 group-hover:scale-110 ${isActive ? 'fill-[1] text-blue-600' : 'opacity-70'}`}>
                                                {item.icon}
                                            </span>
                                            <span className="text-sm tracking-tight">{item.label}</span>
                                        </NavLink>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* Sidebar Footer - User Profile */}
                <div className="p-6 mt-auto">
                    <div className="p-4 rounded-3xl bg-slate-100/50 dark:bg-white/5 border border-white/20 dark:border-white/5 backdrop-blur-md">
                        <div className="flex items-center gap-3 mb-4 px-1 cursor-pointer group" onClick={() => navigate('/settings')}>
                            <div className="relative">
                                <div className="absolute inset-0 bg-blue-600 rounded-full blur-[8px] opacity-0 group-hover:opacity-40 transition-opacity"></div>
                                <div className="size-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-lg relative shadow-lg">
                                    {currentUser.username.charAt(0).toUpperCase()}
                                </div>
                            </div>
                            <div className="text-right flex-1 overflow-hidden">
                                <p className="font-bold text-sm text-slate-800 dark:text-white truncate">{currentUser.name || currentUser.username}</p>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">{currentUser.role.replace('_', ' ')}</p>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={toggleTheme}
                                className="p-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 hover:border-blue-500 transition-all flex items-center justify-center group"
                            >
                                <span className="material-symbols-outlined text-lg text-slate-600 dark:text-slate-400 group-hover:text-blue-500 transition-colors">
                                    {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                                </span>
                            </button>
                            <button
                                onClick={logout}
                                className="p-2 rounded-xl bg-red-50 dark:bg-red-500/10 shadow-sm border border-red-100 dark:border-red-500/20 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center group"
                            >
                                <span className="material-symbols-outlined text-lg text-red-500 group-hover:text-white transition-colors">logout</span>
                            </button>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Content Area */}
            <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative z-10">
                {/* Premium Floating Header */}
                <header className="h-24 px-8 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="size-12 rounded-2xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-white/5 flex items-center justify-center hover:shadow-xl hover:border-blue-500/50 transition-all group active:scale-95"
                        >
                            <span className="material-symbols-outlined text-slate-600 dark:text-slate-400 group-hover:text-blue-600 transition-colors">
                                {isSidebarOpen ? 'menu_open' : 'menu'}
                            </span>
                        </button>
                        
                        <div className="flex flex-col text-right" dir="rtl">
                            <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{currentTitle}</h2>
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                <span className="text-blue-500">نظام المراجعة المالية</span>
                                <span>/</span>
                                <span>{currentTitle}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="hidden lg:flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-[11px] font-black uppercase tracking-wider animate-pulse">
                            <div className="size-2 rounded-full bg-green-500"></div>
                            النظام متصل
                        </div>

                        <div className="h-10 w-px bg-slate-200 dark:bg-white/10 mx-2"></div>

                        <button
                            onClick={() => setIsFeedbackModalOpen(true)}
                            className="px-6 py-2.5 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                        >
                            <span className="material-symbols-outlined text-lg">support_agent</span>
                            تواصل مع المطور
                        </button>

                        {(currentUser.role === 'super_admin' || currentUser.permissions?.includes('notifications_view')) && (
                            <NotificationBell />
                        )}
                        
                        <div 
                            className="size-12 rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900 flex items-center justify-center text-blue-600 cursor-pointer hover:shadow-lg transition-all"
                            onClick={togglePremiumUI}
                            title="تبديل الواجهة (عادي/بريميوم)"
                        >
                            <span className="material-symbols-outlined">auto_awesome</span>
                        </div>
                    </div>
                </header>

                {/* Page Viewport with smooth scroll */}
                <div className="flex-1 overflow-y-auto px-8 pb-12 transition-all duration-300 scroll-smooth custom-scrollbar">
                    <div className="max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-1000">
                        <Outlet />
                    </div>
                </div>
            </main>

            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div
                    onClick={() => setIsSidebarOpen(false)}
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-500"
                ></div>
            )}

            <FeedbackModal isOpen={isFeedbackModalOpen} onClose={() => setIsFeedbackModalOpen(false)} />

            <EmployeeDrawer
                employeeId={selectedEmployeeDrawerId}
                isOpen={!!selectedEmployeeDrawerId}
                onClose={() => setSelectedEmployeeDrawerId(null)}
            />

            <style>{`
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
                
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(100, 116, 139, 0.2);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(100, 116, 139, 0.4);
                }
                
                @keyframes pulse-soft {
                    0%, 100% { opacity: 0.2; transform: scale(1); }
                    50% { opacity: 0.3; transform: scale(1.1); }
                }
            `}</style>
        </div>
    );
};

export default PremiumLayout;
