import React, { useState } from 'react';
import { useAppContext } from '../AppContext';
import type { ActivityLog } from '../AppContext';

interface InlineActivityLogProps {
    category: ActivityLog['category'];
    title?: string;
    maxInitial?: number;
    searchQuery?: string;
}

const InlineActivityLog: React.FC<InlineActivityLogProps> = ({
    category,
    title = 'سجل النشاط',
    maxInitial = 10,
    searchQuery
}) => {
    const { activityLogs } = useAppContext();
    const [showAll, setShowAll] = useState(false);

    const filtered = (activityLogs || []).filter(log => {
        if (!log) return false;
        const matchesCategory = log.category === category;
        const matchesQuery = !searchQuery ||
            (log.details || '').includes(searchQuery) ||
            (log.action || '').includes(searchQuery);
        return matchesCategory && matchesQuery;
    });
    const displayed = showAll ? filtered : filtered.slice(0, maxInitial);

    const formatDate = (iso: string) => {
        const date = new Date(iso);
        return date.toLocaleString('ar-YE', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (filtered.length === 0) return null;

    return (
        <div className="mt-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">history</span>
                    <h3 className="font-bold text-slate-800 dark:text-white text-sm">{title}</h3>
                    <span className="text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full">
                        {filtered.length}
                    </span>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-sm">
                    <thead>
                        <tr className="bg-slate-50/80 dark:bg-slate-900/40">
                            <th className="px-4 py-2.5 text-[11px] font-bold text-slate-500 whitespace-nowrap">التاريخ</th>
                            <th className="px-4 py-2.5 text-[11px] font-bold text-slate-500 whitespace-nowrap">الموظف</th>
                            <th className="px-4 py-2.5 text-[11px] font-bold text-slate-500 whitespace-nowrap">العملية</th>
                            <th className="px-4 py-2.5 text-[11px] font-bold text-slate-500">التفاصيل</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                        {displayed.map(log => (
                            <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors">
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{formatDate(log.timestamp)}</span>
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        <div className="size-6 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 text-[10px] font-bold">
                                            {String(log.userName || 'U').charAt(0)}
                                        </div>
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{log.userName || 'مستخدم غير معروف'}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-2.5">
                                    <span className="text-xs font-bold text-slate-800 dark:text-white">{log.action}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                    <p className="text-xs text-slate-500 dark:text-slate-400 break-words" title={log.details}>
                                        {log.details}
                                    </p>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {filtered.length > maxInitial && (
                <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 text-center">
                    <button
                        onClick={() => setShowAll(!showAll)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 mx-auto transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm">{showAll ? 'expand_less' : 'expand_more'}</span>
                        {showAll ? 'عرض أقل' : `عرض الكل (${filtered.length})`}
                    </button>
                </div>
            )}
        </div>
    );
};

export default InlineActivityLog;
