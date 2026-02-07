import React, { useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';

const Layout: React.FC = () => {
    const { theme, toggleTheme, currentUser, logout } = useAppContext();
    const location = useLocation();
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    if (!currentUser) return <Outlet />;

    const navItems = [
        { label: 'الرئيسية', path: '/', icon: 'dashboard' },
        { label: 'مطابقة المطاعم', path: '/input', icon: 'restaurant' },
        { label: 'مطابقة الصناديق', path: '/funds', icon: 'account_balance' },
        { label: 'الإعدادات', path: '/settings', icon: 'settings' },
    ];

    return (
        <div className={`min-h-screen transition-colors duration-300 font-sans flex overflow-hidden`}>

            {/* Sidebar - Collapsible */}
            <aside
                className={`fixed inset-y-0 right-0 z-50 w-64 bg-[var(--color-sidebar)] text-white shadow-2xl transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'
                    } lg:relative lg:translate-x-0 lg:block ${!isSidebarOpen && 'lg:hidden'}`}
            >
                <div className="p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="size-10 bg-[var(--color-header)] rounded-xl flex items-center justify-center text-white shadow-lg">
                            <span className="material-symbols-outlined text-2xl">local_shipping</span>
                        </div>
                        <div>
                            <h1 className="font-black text-lg leading-tight">توصيل ون</h1>
                            <p className="text-[10px] text-[var(--color-active)] font-bold tracking-wide">النظام المالي</p>
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

                <nav className="mt-8 px-4 space-y-2">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-4 py-3 border-r-4 transition-all duration-200 group ${isActive
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
                </nav>

                <div className="absolute bottom-0 w-full p-4 border-t border-white/10 bg-[var(--color-sidebar)] brightness-90">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <div className="size-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-[var(--color-active)]">
                            {currentUser.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p className="font-bold text-sm truncate max-w-[120px]">{currentUser.name || currentUser.username}</p>
                            <p className="text-xs text-slate-500 capitalize">{currentUser.role === 'super_admin' ? 'مدير النظام' : currentUser.role === 'admin' ? 'مسؤول' : 'موظف'}</p>
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
                            {navItems.find(i => i.path === location.pathname)?.label || 'النظام'}
                        </h2>
                    </div>

                    <div className="flex items-center gap-3">
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

        </div>
    );
};

export default Layout;