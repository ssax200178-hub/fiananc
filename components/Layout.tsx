import React, { useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import NotificationBell from './NotificationBell';
import FeedbackModal from './FeedbackModal';
import EmployeeDrawer from './EmployeeDrawer';

const Layout = () => {
    const { theme, toggleTheme, currentUser, logout, featureFlags, selectedEmployeeDrawerId, setSelectedEmployeeDrawerId } = useAppContext();
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

    // SECURITY: Immediate guard if user is disabled while active
    if (currentUser.isActive === false) {
        logout();
        return null;
    }

    // Navigation Groups
    const rawNavGroups = [
        {
            items: [
                { label: 'الرئيسية', path: '/', icon: 'dashboard', permission: 'dashboard_view' },
            ]
        },
        {
            title: 'المراجعات المالية',
            items: [
                { label: 'مطابقة المطاعم', path: '/input', icon: 'restaurant', permission: 'recon_view' },
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
                { label: 'دليل المطاعم', path: '/restaurants', icon: 'storefront', permission: 'restaurants_view' },
                { label: 'العمليات (Excel)', path: '/operations-grid', icon: 'grid_on', permission: 'restaurants_view', featureFlag: 'operations_grid' },
                { label: 'أرشيف الكشوفات', path: '/archives', icon: 'inventory_2', permission: 'archives_view' },
            ]
        },
        {
            title: 'عمليات الصرف والمدفوعات',
            items: [
                { label: 'دفاتر الفواتير', path: '/invoice-batches', icon: 'receipt_long', permission: 'invoice_batches_view', featureFlag: 'invoice_disbursement' },
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
                { label: 'عمليات السحب المخصصة', path: '/scraping/operations', icon: 'cloud_download', permission: 'automation_manage' },
                { label: 'مستعرض البيانات', path: '/scraping/viewer', icon: 'travel_explore', permission: 'automation_manage' },
                { label: 'معاينة السحب', path: '/scrape-preview', icon: 'preview', permission: 'automation_manage' },
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

    // Filter Groups based on permissions
    const navGroups = rawNavGroups.map(group => {
        const filteredItems = group.items.filter(item => {
            // Hide item if its feature flag is explicitly set to false (applies to ALL users)
            if ((item as any).featureFlag && featureFlags[(item as any).featureFlag] === false) return false;

            if (currentUser.role === 'super_admin') return true;
            if (!item.permission) return true;
            return currentUser.permissions?.includes(item.permission as any);
        });
        return { ...group, items: filteredItems };
    }).filter(group => group.items.length > 0);

    // Flatten for Title lookup (optional, kept for header logic)
    const allNavItems = navGroups.flatMap(g => g.items);

    // State for collapsible groups - only one open at a time
    const [expandedGroup, setExpandedGroup] = useState<string | null>('المراجعات المالية');

    const toggleGroup = (title: string) => {
        setExpandedGroup(prev => prev === title ? null : title);
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex overflow-hidden">
            {/* Sidebar */}
            <aside
                className={`fixed inset-y-0 right-0 z-50 w-64 bg-[var(--color-sidebar)] text-white shadow-2xl transition-transform duration-300 ease-in-out flex flex-col lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'
                    }`}
            >
                <div className="p-6 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <img src="/logo.png" alt="الادارة المالية" className="h-12 w-auto" />
                        <div>
                            <h1 className="font-black text-lg leading-tight text-white">الادارة المالية</h1>
                            <p className="text-[10px] text-white/60 font-bold tracking-wide">شركة توصيل ون</p>
                        </div>
                    </div>
                    {/* Mobile Close Button */}
                    <button
                        onClick={() => setIsSidebarOpen(false)}
                        className="lg:hidden text-white/50 hover:text-white transition-colors"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <nav className="flex-1 px-4 space-y-2 overflow-y-auto thin-scrollbar pb-24">
                    {navGroups.map((group, groupIndex) => (
                        <div key={groupIndex} className="mb-2">
                            {group.title ? (
                                <button
                                    onClick={() => toggleGroup(group.title!)}
                                    className="w-full flex items-center justify-between px-4 py-2 mb-1 text-xs font-bold text-slate-400 uppercase tracking-wider hover:text-white hover:bg-white/5 rounded-lg transition-colors group"
                                >
                                    <span>{group.title}</span>
                                    <span className={`material-symbols-outlined text-sm transition-transform duration-300 ${expandedGroup === group.title ? 'rotate-180' : ''}`}>
                                        expand_more
                                    </span>
                                </button>
                            ) : null}

                            <div className={`space-y-1 overflow-hidden transition-all duration-300 ease-in-out ${!group.title || expandedGroup === group.title ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                                }`}>
                                {group.items.map((item) => {
                                    const isActive = location.pathname === item.path;
                                    return (
                                        <NavLink
                                            key={item.path}
                                            to={item.path}
                                            className={`flex items-center gap-3 px-4 py-3 border-r-4 transition-all duration-200 group rounded-lg ${isActive
                                                ? 'border-[var(--color-active)] bg-white/10 text-white font-bold'
                                                : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'
                                                }`}
                                        >
                                            <span className={`material-symbols-outlined ${isActive ? 'text-[var(--color-active)]' : ''}`}>
                                                {item.icon}
                                            </span>
                                            <span>{item.label}</span>
                                        </NavLink>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="shrink-0 w-full p-4 border-t border-white/10 bg-[var(--color-sidebar)] brightness-90">
                    <div
                        onClick={() => navigate('/settings', { state: { openAccount: true } })}
                        className="flex items-center gap-3 mb-4 px-2 cursor-pointer hover:bg-white/5 rounded-lg py-2 transition-colors group"
                        title="تغيير كلمة المرور والإعدادات"
                    >
                        <div className="size-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-[var(--color-active)] group-hover:bg-white/20 transition-colors">
                            {currentUser.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p className="font-bold text-sm truncate max-w-[120px] group-hover:text-[var(--color-active)] transition-colors">{currentUser.name || currentUser.username}</p>
                            <p className="text-xs text-slate-500 capitalize">{currentUser.role === 'super_admin' ? 'مهندس النظام' : currentUser.role === 'admin' ? 'مسؤول' : 'موظف'}</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm font-bold"
                    >
                        <span className="material-symbols-outlined text-lg">logout</span>
                        تسجيل خروج
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-x-hidden overflow-y-auto h-screen relative">
                {/* Header - Red */}
                <header className="sticky top-0 z-40 bg-[var(--color-header)] text-white shadow-md px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <h2 className="text-xl font-bold hidden sm:block">
                            {allNavItems.find(i => i.path === location.pathname)?.label || 'الادارة المالية'}
                        </h2>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsFeedbackModalOpen(true)}
                            className="hidden sm:flex items-center gap-2 px-3 py-2 bg-indigo-500 hover:bg-indigo-600 border border-indigo-400/30 rounded-lg text-white text-sm font-bold shadow-sm transition-colors"
                            title="إرسال ملاحظة أو الإبلاغ عن مشكلة للمطور"
                        >
                            <span className="material-symbols-outlined text-lg">support_agent</span>
                            تواصل مع المطور
                        </button>
                        <button
                            onClick={() => setIsFeedbackModalOpen(true)}
                            className="sm:hidden size-10 rounded-full bg-indigo-500 hover:bg-indigo-600 flex items-center justify-center text-white transition-colors shadow-sm"
                            title="تواصل مع المطور"
                        >
                            <span className="material-symbols-outlined text-xl">support_agent</span>
                        </button>

                        {(currentUser.role === 'super_admin' || currentUser.permissions?.includes('notifications_view')) && (
                            <NotificationBell />
                        )}
                        <button
                            onClick={toggleTheme}
                            className="size-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                        >
                            <span className="material-symbols-outlined text-xl">
                                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                            </span>
                        </button>
                    </div>
                </header>

                {/* Page Content */}
                <div className="p-2 sm:p-6 lg:p-8">
                    <Outlet />
                </div>
            </main>

            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div
                    onClick={() => setIsSidebarOpen(false)}
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                ></div>
            )}

            <FeedbackModal isOpen={isFeedbackModalOpen} onClose={() => setIsFeedbackModalOpen(false)} />

            <EmployeeDrawer
                employeeId={selectedEmployeeDrawerId}
                isOpen={!!selectedEmployeeDrawerId}
                onClose={() => setSelectedEmployeeDrawerId(null)}
            />
        </div>
    );
};

export default Layout;