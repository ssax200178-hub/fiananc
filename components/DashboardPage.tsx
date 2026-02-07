import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppContext } from '../AppContext';

const DashboardPage: React.FC = () => {
    const { currentUser } = useAppContext();
    const [activeTipIndex, setActiveTipIndex] = useState(0);

    const tips = [
        { text: "المحاسبة هي لغة الأعمال؛ ومن لا يتقن لغته، لا يمكنه قيادة مؤسسته نحو النجاح.", icon: "language" },
        { text: "احذر من النفقات الصغيرة؛ فثقبٌ صغير كفيلٌ بإغراق سفينة عظيمة.", icon: "leak_add" },
        { text: "ما لا يمكن قياسه، لا يمكن إدارته؛ فاجعل أرقامك دقيقة لتكون قراراتك سديدة.", icon: "analytics" },
        { text: "السيولة في الشركة كالدم في الجسد؛ إذا توقفت، توقفت الحياة في سائر الأقسام.", icon: "water_drop" },
        { text: "التدقيق ليس تصيداً للأخطاء، بل هو بحث عن الحقيقة لضمان استدامة الكيان.", icon: "fact_check" },
        { text: "الأمانة المالية هي رأس مال الموظف الحقيقي، وهي القيمة التي لا تظهر في الميزانية لكنها ترفع شأن الشركة.", icon: "verified" },
        { text: "في عالم المال: الثقة جيدة، ولكن الرقابة والمطابقة أفضل.", icon: "policy" },
        { text: "الربح قد يأتي من عملية بيع واحدة، ولكن الاستمرار يأتي من إدارة مالية منضبطة.", icon: "trending_up" },
        { text: "النظام المالي القوي هو الدرع الواقي للشركة في أوقات الأزمات الاقتصاديّة.", icon: "shield" },
        { text: "كل ريال يتم رصده بدقة اليوم، هو لبنة في بناء مستقبل شركة 'توصيل ون'.", icon: "domain" },
        { text: "المطابقة ليست مجرد تساوي أرقام، بل هي شهادة على احترافية الموظف ونزاهة النظام.", icon: "workspace_premium" },
        { text: "البيانات المالية هي المرآة التي تعكس واقع الشركة؛ فحافظ على نظافة هذه المرآة من الأخطاء.", icon: "cleaning_services" }
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveTipIndex(prev => (prev + 1) % tips.length);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="max-w-6xl mx-auto space-y-10 animate-fade-in pb-20">
            {/* Hero Section with Moving Tips */}
            <div className="relative bg-[var(--color-header)] dark:bg-[#102218] rounded-3xl p-8 md:p-12 overflow-hidden shadow-xl text-white">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <span className="material-symbols-outlined text-9xl">account_balance_wallet</span>
                </div>

                <div className="relative z-10">
                    <h1 className="text-4xl md:text-5xl font-black font-display mb-4">
                        مرحباً، {currentUser?.name || currentUser?.username} 👋
                    </h1>
                    <p className="text-slate-300 text-lg mb-8">نظام المطابقة المالية المتطور - شركة توصيل ون</p>

                    {/* Animated Tips */}
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 max-w-2xl">
                        <div className="flex items-center gap-3 mb-2 text-[var(--color-active)] dark:text-[#13ec6d]">
                            <span className="material-symbols-outlined animate-pulse">lightbulb</span>
                            <span className="font-bold text-sm tracking-wider uppercase">نصيحة مالية</span>
                        </div>
                        <div className="h-24 relative overflow-hidden">
                            {tips.map((tip, index) => (
                                <div
                                    key={index}
                                    className={`absolute top-0 right-0 w-full transition-all duration-700 ease-in-out transform ${index === activeTipIndex
                                        ? 'opacity-100 translate-y-0'
                                        : 'opacity-0 translate-y-8'
                                        } flex items-start gap-4`}
                                >
                                    <div className="p-2 rounded-lg bg-white/20 text-[var(--color-active)] dark:bg-[#13ec6d]/20 dark:text-[#13ec6d] shrink-0">
                                        <span className="material-symbols-outlined text-2xl">{tip.icon}</span>
                                    </div>
                                    <p className="text-lg md:text-xl font-bold leading-relaxed">
                                        {tip.text}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 mt-4">
                            {tips.map((_, idx) => (
                                <div
                                    key={idx}
                                    className={`h-1 rounded-full transition-all duration-300 ${idx === activeTipIndex ? 'w-8 bg-[var(--color-active)] dark:bg-[#13ec6d]' : 'w-2 bg-white/20'
                                        }`}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            {/* Quick Access Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <NavLink to="/input" className="group relative bg-white dark:bg-[#1e293b] p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="size-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-[var(--color-header)] dark:text-blue-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-3xl">restaurant</span>
                    </div>
                    <h3 className="text-xl font-black text-[var(--color-sidebar)] dark:text-white mb-2">مطابقة المطاعم</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">تحليل ومطابقة ملفات الإكسل للمطاعم والشركة.</p>
                </NavLink>

                <NavLink to="/funds" className="group relative bg-white dark:bg-[#1e293b] p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="size-14 rounded-2xl bg-green-50 dark:bg-green-900/20 text-[var(--color-success)] dark:text-green-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-3xl">account_balance</span>
                    </div>
                    <h3 className="text-xl font-black text-[var(--color-sidebar)] dark:text-white mb-2">مطابقة الصناديق</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">إدارة السيولة، الريال القديم والجديد، ومتابعة الأرصدة البنكية بدقة.</p>
                </NavLink>

                <NavLink to="/settings" className="group relative bg-white dark:bg-[#1e293b] p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="size-14 rounded-2xl bg-slate-100 dark:bg-slate-700/50 text-[#607D8B] dark:text-slate-300 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-3xl">settings</span>
                    </div>
                    <h3 className="text-xl font-black text-[var(--color-sidebar)] dark:text-white mb-2">الإعدادات</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">إدارة المستخدمين، الصلاحيات، وتخصيص النظام حسب الحاجة.</p>
                </NavLink>
            </div>
        </div >
    );
};

export default DashboardPage;
