import React, { useState } from 'react';
import { useAppContext } from '../AppContext';

const ActivityLogsPage: React.FC = () => {
    const { activityLogs, users, currentUser } = useAppContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState('الكل');
    const [selectedCategory, setSelectedCategory] = useState('الكل');

    const categories = [
        { id: 'الكل', label: 'كافة الأنشطة', icon: 'list_alt' },
        { id: 'auth', label: 'دخول/خروج', icon: 'login' },
        { id: 'restaurant', label: 'المطاعم', icon: 'store' },
        { id: 'funds', label: 'الصناديق/البنوك', icon: 'account_balance' },
        { id: 'recon', label: 'التسويات', icon: 'receipt_long' },
        { id: 'settings', label: 'الإعدادات', icon: 'settings' },
        { id: 'tips', label: 'النصائح', icon: 'lightbulb' },
        { id: 'general', label: 'عام', icon: 'info' }
    ];

    const filteredLogs = activityLogs.filter(log => {
        const matchesTerm = log.action.includes(searchTerm) || log.details.includes(searchTerm);
        const matchesUser = selectedUser === 'الكل' || log.userName === selectedUser;
        const matchesCategory = selectedCategory === 'الكل' || log.category === selectedCategory;
        return matchesTerm && matchesUser && matchesCategory;
    });

    const getCategoryStyles = (category: string) => {
        switch (category) {
            case 'auth': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
            case 'restaurant': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300';
            case 'funds': return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
            case 'recon': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
            case 'settings': return 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300';
            case 'tips': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
            default: return 'bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300';
        }
    };

    const formatDate = (iso: string) => {
        const date = new Date(iso);
        return date.toLocaleString('ar-YE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    if (currentUser?.role !== 'admin' && currentUser?.role !== 'super_admin') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <span className="material-symbols-outlined text-red-500 text-6xl">lock</span>
                <h1 className="text-2xl font-black text-slate-800 dark:text-white">عذراً، هذه الصفحة للمدراء فقط</h1>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 space-y-6 animate-fade-in RTL" dir="rtl">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-blue-600">history_edu</span>
                        سجل نشاط النظام
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-bold mt-1">تتبع عمليات الموظفين ونشاط الحسابات</p>
                </div>
            </header>

            {/* Filters Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="space-y-2">
                    <label className="text-sm font-black text-slate-500 pr-1">البحث في النشاط</label>
                    <div className="relative">
                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                        <input
                            type="text"
                            placeholder="بحث عن عملية..."
                            className="w-full pr-10 pl-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-bold"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-black text-slate-500 pr-1">تصفية حسب الموظف</label>
                    <select
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-bold"
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
                    >
                        <option value="الكل">كل الموظفين</option>
                        {Array.from(new Set(activityLogs.map(l => l.userName))).map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                </div>

                <div className="md:col-span-2 flex flex-wrap gap-2 pt-7">
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`px-4 py-2 rounded-xl font-black text-xs flex items-center gap-2 transition-all ${selectedCategory === cat.id
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                                }`}
                        >
                            <span className="material-symbols-outlined text-sm">{cat.icon}</span>
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Logs List */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50">
                                <th className="px-6 py-4 text-sm font-black text-slate-500">التاريخ والوقت</th>
                                <th className="px-6 py-4 text-sm font-black text-slate-500">الموظف</th>
                                <th className="px-6 py-4 text-sm font-black text-slate-500">النوع</th>
                                <th className="px-6 py-4 text-sm font-black text-slate-500">العملية</th>
                                <th className="px-6 py-4 text-sm font-black text-slate-500">التفاصيل</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredLogs.length > 0 ? filteredLogs.map(log => (
                                <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-black text-slate-700 dark:text-white capitalize">
                                                {formatDate(log.timestamp)}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 font-black text-xs">
                                                {log.userName.charAt(0)}
                                            </div>
                                            <span className="font-black text-slate-700 dark:text-slate-200">{log.userName}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${getCategoryStyles(log.category)}`}>
                                            {categories.find(c => c.id === log.category)?.label || log.category}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="font-black text-slate-800 dark:text-white">{log.action}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400 max-w-md truncate" title={log.details}>
                                            {log.details}
                                        </p>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center gap-2 text-slate-400">
                                            <span className="material-symbols-outlined text-5xl">manage_search</span>
                                            <p className="font-black">لا توجد سجلات تطابق البحث</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ActivityLogsPage;
