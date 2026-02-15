import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppContext } from '../AppContext';

const DashboardPage: React.FC = () => {
    const { currentUser, financialTips, addFinancialTip } = useAppContext();
    const [activeTipIndex, setActiveTipIndex] = useState(0);
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const [quickTipText, setQuickTipText] = useState('');
    const [quickTipType, setQuickTipType] = useState<'tip' | 'alert' | 'warning' | 'guidance'>('tip');

    const activeTips = financialTips && financialTips.length > 0
        ? financialTips.filter(t => t.isActive)
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

    return (
        <div className="max-w-6xl mx-auto space-y-10 animate-fade-in pb-20">
            {/* Hero Section with Moving Tips */}
            <div className="relative bg-[var(--color-header)] dark:bg-[#102218] rounded-3xl p-8 md:p-12 overflow-hidden shadow-xl text-white">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <span className="material-symbols-outlined text-9xl">account_balance_wallet</span>
                </div>

                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="text-center md:text-right">
                        <div className="flex flex-col md:flex-row items-center gap-3 mb-2">
                            <h1 className="text-4xl md:text-5xl font-black font-display">
                                مرحباً، {currentUser?.name || currentUser?.username} 👋
                            </h1>
                            <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-bold tracking-widest uppercase opacity-50">v1.1.0</span>
                        </div>
                        <p className="text-slate-300 text-lg">الادارة المالية - شركة توصيل ون</p>
                    </div>
                    <div className="size-48 md:size-64 bg-white rounded-[3rem] p-8 shadow-2xl flex items-center justify-center shrink-0 border-8 border-white/20 transform hover:scale-105 transition-all duration-700 hover:rotate-2">
                        <img src="/logo.png" alt="Tawseel One Logo" className="w-full h-full object-contain" />
                    </div>
                </div>      {/* Animated Tips */}
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 max-w-2xl mt-8 relative group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <span className={`material-symbols-outlined ${activeTips[activeTipIndex]?.type === 'warning' ? 'text-red-400' : 'text-amber-400'} animate-pulse`}>
                                {activeTips[activeTipIndex]?.icon || 'lightbulb'}
                            </span>
                            <span className="font-bold text-sm tracking-wider uppercase">
                                {activeTips[activeTipIndex]?.type === 'warning' ? 'تحذير هام' :
                                    activeTips[activeTipIndex]?.type === 'alert' ? 'تنبيه' :
                                        activeTips[activeTipIndex]?.type === 'guidance' ? 'توجيه إداري' : 'نصيحة مالية'}
                            </span>
                        </div>

                        {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
                            <button
                                onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
                                className="size-8 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center transition-all shadow-lg text-white"
                                title="إضافة نصيحة سريعة"
                            >
                                <span className={`material-symbols-outlined text-sm transition-transform duration-300 ${isQuickAddOpen ? 'rotate-45' : ''}`}>add</span>
                            </button>
                        )}
                    </div>

                    {isQuickAddOpen && (
                        <div className="mb-6 animate-slide-down">
                            <div className="bg-white/10 rounded-xl p-4 border border-white/5 space-y-3">
                                <textarea
                                    value={quickTipText}
                                    onChange={(e) => setQuickTipText(e.target.value)}
                                    placeholder="اكتب النصيحة أو التنبيه هنا..."
                                    className="w-full bg-black/20 border-none rounded-lg p-3 text-sm text-white focus:ring-1 focus:ring-white/30 outline-none h-20 placeholder:text-white/40 font-bold"
                                />
                                <div className="flex gap-2">
                                    <select
                                        value={quickTipType}
                                        onChange={(e) => setQuickTipType(e.target.value as any)}
                                        className="flex-1 bg-black/20 border-none rounded-lg px-3 py-2 text-xs text-white outline-none font-bold"
                                    >
                                        <option value="tip" className="bg-slate-800">نصيحة</option>
                                        <option value="alert" className="bg-slate-800">تنبيه</option>
                                        <option value="guidance" className="bg-slate-800">توجيه</option>
                                        <option value="warning" className="bg-slate-800">تحذير</option>
                                    </select>
                                    <button
                                        onClick={async () => {
                                            if (!quickTipText.trim()) return;
                                            let icon = 'lightbulb';
                                            if (quickTipType === 'alert') icon = 'notifications_active';
                                            if (quickTipType === 'warning') icon = 'warning';
                                            if (quickTipType === 'guidance') icon = 'direction';

                                            await addFinancialTip(quickTipText, quickTipType, icon);
                                            setQuickTipText('');
                                            setIsQuickAddOpen(false);
                                        }}
                                        className="px-4 py-2 bg-white text-[var(--color-sidebar)] rounded-lg text-xs font-black shadow-lg hover:bg-slate-100 transition-colors"
                                    >
                                        نشر للاعضاء
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="h-24 relative overflow-hidden">
                        {activeTips.map((tip, index) => (
                            <div
                                key={index}
                                className={`absolute top-0 right-0 w-full transition-all duration-700 ease-in-out transform ${index === activeTipIndex
                                    ? 'opacity-100 translate-y-0'
                                    : 'opacity-0 translate-y-8'
                                    } flex items-start gap-4`}
                            >
                                <div className={`p-2 rounded-lg shrink-0 ${tip.type === 'warning' ? 'bg-red-500/20 text-red-400' :
                                    tip.type === 'alert' ? 'bg-orange-500/20 text-orange-400' :
                                        'bg-white/20 text-[var(--color-active)]'
                                    }`}>
                                    <span className="material-symbols-outlined text-2xl">{tip.icon}</span>
                                </div>
                                <p className="text-lg md:text-xl font-bold leading-relaxed">
                                    {tip.text}
                                </p>
                            </div>
                        ))}
                    </div>
                    {activeTips.length > 1 && (
                        <div className="flex gap-2 mt-4">
                            {activeTips.map((_, idx) => (
                                <div
                                    key={idx}
                                    className={`h-1 rounded-full transition-all duration-300 ${idx === activeTipIndex ? 'w-8 bg-[var(--color-active)] dark:bg-[#13ec6d]' : 'w-2 bg-white/20'
                                        }`}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Access Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {(currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('manage_funds')) && (
                    <NavLink to="/input" className="group relative bg-white dark:bg-[#1e293b] p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
                        <div className="size-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-[var(--color-header)] dark:text-blue-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-3xl">restaurant</span>
                        </div>
                        <h3 className="text-xl font-black text-[var(--color-sidebar)] dark:text-white mb-2">مطابقة المطاعم</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">تحليل ومطابقة ملفات الإكسل للمطاعم والشركة.</p>
                    </NavLink>
                )}

                {(currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('manage_restaurants')) && (
                    <NavLink to="/restaurants" className="group relative bg-white dark:bg-[#1e293b] p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
                        <div className="size-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-[var(--color-active)] dark:text-amber-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-3xl">storefront</span>
                        </div>
                        <h3 className="text-xl font-black text-[var(--color-sidebar)] dark:text-white mb-2">دليل المطاعم</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">المرجع الرئيسي لبيانات المطاعم وحسابات التحويل المعتمدة.</p>
                    </NavLink>
                )}

                {(currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('manage_funds')) && (
                    <NavLink to="/funds" className="group relative bg-white dark:bg-[#1e293b] p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
                        <div className="size-14 rounded-2xl bg-green-50 dark:bg-green-900/20 text-[var(--color-success)] dark:text-green-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-3xl">account_balance</span>
                        </div>
                        <h3 className="text-xl font-black text-[var(--color-sidebar)] dark:text-white mb-2">مطابقة الصناديق</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">إدارة السيولة، الريال القديم والجديد، ومتابعة الأرصدة البنكية.</p>
                    </NavLink>
                )}

                <NavLink to="/settings" className="group relative bg-white dark:bg-[#1e293b] p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="size-14 rounded-2xl bg-slate-100 dark:bg-slate-700/50 text-[#607D8B] dark:text-slate-300 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-3xl">settings</span>
                    </div>
                    <h3 className="text-xl font-black text-[var(--color-sidebar)] dark:text-white mb-2">الإعدادات</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">إدارة المستخدمين، الصلاحيات، وتخصيص النظام.</p>
                </NavLink>
            </div>
        </div >
    );
};

export default DashboardPage;
