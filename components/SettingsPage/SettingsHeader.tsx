import React from 'react';

interface SettingsHeaderProps {
    title: string;
    subtitle: string;
}

const SettingsHeader: React.FC<SettingsHeaderProps> = ({ title, subtitle }) => {
    return (
        <div className="mb-12 animate-slide-down" dir="rtl">
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3">
                <span className="text-blue-600 dark:text-blue-500">نظام المراجعة المالية</span>
                <span className="opacity-30">/</span>
                <span>الإعدادات</span>
            </div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">
                {title}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 font-bold text-lg">
                {subtitle}
            </p>
        </div>
    );
};

export default SettingsHeader;
