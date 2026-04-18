import React from 'react';

interface ThemeSectionProps {
    isDarkMode: boolean;
    onToggleTheme: () => void;
}

const ThemeSection: React.FC<ThemeSectionProps> = ({ isDarkMode, onToggleTheme }) => {
    return (
        <section className="bg-white/70 dark:bg-slate-900/40 backdrop-blur-xl rounded-[2.5rem] border border-slate-200 dark:border-white/5 p-10 shadow-xl" dir="rtl">
            <div className="flex items-center justify-between mb-8">
                <div className="text-right">
                    <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2 tracking-tight flex items-center gap-3">
                        <span className="material-symbols-outlined text-blue-600">palette</span>
                        مظهر النظام
                    </h3>
                    <p className="text-slate-500 font-bold text-sm">اختر المظهر المريح لعينيك</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <button
                    onClick={() => !isDarkMode && onToggleTheme()}
                    className={`p-6 rounded-3xl border-2 transition-all group relative overflow-hidden ${
                        !isDarkMode 
                            ? 'border-blue-600 bg-blue-50/50' 
                            : 'border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5'
                    }`}
                >
                    <div className="flex flex-col items-center gap-4 relative z-10">
                        <div className={`size-16 rounded-2xl flex items-center justify-center transition-all ${
                            !isDarkMode ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-200 dark:bg-white/10 text-slate-400'
                        }`}>
                            <span className="material-symbols-outlined text-3xl font-variation-light">light_mode</span>
                        </div>
                        <span className={`font-black text-sm uppercase tracking-widest ${!isDarkMode ? 'text-blue-600' : 'text-slate-400'}`}>فاتح</span>
                    </div>
                </button>

                <button
                    onClick={() => isDarkMode && onToggleTheme()}
                    className={`p-6 rounded-3xl border-2 transition-all group relative overflow-hidden ${
                        isDarkMode 
                            ? 'border-blue-600 bg-blue-900/20' 
                            : 'border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5'
                    }`}
                >
                    <div className="flex flex-col items-center gap-4 relative z-10">
                        <div className={`size-16 rounded-2xl flex items-center justify-center transition-all ${
                            isDarkMode ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-200 dark:bg-white/10 text-slate-400'
                        }`}>
                            <span className="material-symbols-outlined text-3xl font-variation-light">dark_mode</span>
                        </div>
                        <span className={`font-black text-sm uppercase tracking-widest ${isDarkMode ? 'text-blue-600' : 'text-slate-400'}`}>داكن</span>
                    </div>
                </button>
            </div>
        </section>
    );
};

export default ThemeSection;
