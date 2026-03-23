import React, { useState, useMemo } from 'react';
import { useAppContext } from '../AppContext';

const ActivityLogsPage: React.FC = () => {
    const { activityLogs, users, currentUser } = useAppContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState('الكل');
    const [selectedCategory, setSelectedCategory] = useState('الكل');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);

    const categories = [
        { id: 'الكل', label: 'الكل', icon: 'list_alt' },
        { id: 'auth', label: 'دخول/خروج', icon: 'login' },
        { id: 'restaurant', label: 'المطاعم', icon: 'store' },
        { id: 'funds', label: 'الصناديق', icon: 'account_balance' },
        { id: 'recon', label: 'التسويات', icon: 'receipt_long' },
        { id: 'settings', label: 'الإعدادات', icon: 'settings' },
        { id: 'tips', label: 'النصائح', icon: 'lightbulb' },
        { id: 'users', label: 'الموظفين', icon: 'badge' },
        { id: 'general', label: 'عام', icon: 'info' }
    ];

    // Filter Logic
    const filteredLogs = useMemo(() => {
        return activityLogs.filter(log => {
            const matchesTerm =
                log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
                log.details.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesUser = selectedUser === 'الكل' || log.userName === selectedUser;
            const matchesCategory = selectedCategory === 'الكل' || log.category === selectedCategory;
            return matchesTerm && matchesUser && matchesCategory;
        });
    }, [activityLogs, searchTerm, selectedUser, selectedCategory]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

    // Reset page when filters change
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedUser, selectedCategory, itemsPerPage]);

    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredLogs.slice(start, start + itemsPerPage);
    }, [filteredLogs, currentPage, itemsPerPage]);

    const getCategoryStyles = (category: string) => {
        switch (category) {
            case 'auth': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
            case 'restaurant': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300';
            case 'funds': return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
            case 'recon': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
            case 'settings': return 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300';
            case 'tips': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
            case 'users': return 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300';
            default: return 'bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300';
        }
    };

    const formatDate = (iso: string) => {
        const date = new Date(iso);
        return date.toLocaleString('ar-YE', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
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
                        سجل النشاط
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-bold mt-1">
                        تتبع عمليات الموظفين ونشاط الحسابات ({filteredLogs.length} عملية)
                    </p>
                </div>
            </header>

            {/* Filters Dashboard */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    {/* Search - 4 cols */}
                    <div className="md:col-span-4 space-y-2">
                        <label className="text-sm font-black text-slate-500 pr-1">البحث</label>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                            <input
                                type="text"
                                placeholder="بحث في السجل..."
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-bold text-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* User Filter - 3 cols */}
                    <div className="md:col-span-3 space-y-2">
                        <label className="text-sm font-black text-slate-500 pr-1">الموظف</label>
                        <select
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-sm"
                            value={selectedUser}
                            onChange={(e) => setSelectedUser(e.target.value)}
                        >
                            <option value="الكل">الكل</option>
                            {Array.from(new Set(activityLogs.map(l => l.userName))).map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Rows Per Page - 2 cols */}
                    <div className="md:col-span-2 space-y-2">
                        <label className="text-sm font-black text-slate-500 pr-1">الصفوف</label>
                        <select
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-sm"
                            value={itemsPerPage}
                            onChange={(e) => setItemsPerPage(Number(e.target.value))}
                        >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>
                </div>

                {/* Categories */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2 transition-all border ${selectedCategory === cat.id
                                ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300'
                                : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                }`}
                        >
                            <span className="material-symbols-outlined text-base">{cat.icon}</span>
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Logs List */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden flex flex-col min-h-[500px]">
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-right border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">التاريخ</th>
                                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">المستخدم</th>
                                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">النشاط</th>
                                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">التفاصيل</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {currentItems.length > 0 ? currentItems.map(log => (
                                <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors group">
                                    <td className="px-6 py-3 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 dir-ltr text-right">
                                                {formatDate(log.timestamp)}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 text-[10px] font-black">
                                                {log.userName.charAt(0)}
                                            </div>
                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{log.userName}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black ${getCategoryStyles(log.category)}`}>
                                                    {categories.find(c => c.id === log.category)?.label || log.category}
                                                </span>
                                                <span className="text-sm font-bold text-slate-800 dark:text-white">{log.action}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3">
                                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug max-w-lg">
                                            {log.details}
                                        </p>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <span className="material-symbols-outlined text-4xl opacity-50">search_off</span>
                                            <p className="font-bold">لا توجد نتائج</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {filteredLogs.length > 0 && (
                    <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                        <div className="text-xs font-bold text-slate-500">
                            عرض {Math.min((currentPage - 1) * itemsPerPage + 1, filteredLogs.length)} - {Math.min(currentPage * itemsPerPage, filteredLogs.length)} من {filteredLogs.length}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg hover:bg-white dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">chevron_right</span>
                            </button>

                            <div className="flex items-center gap-1">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    // Logic to show generic page numbers nicely could be complex, 
                                    // simplifying to show first few or simple logic for now
                                    let p = i + 1;
                                    if (totalPages > 5 && currentPage > 3) {
                                        p = currentPage - 2 + i;
                                    }
                                    if (p > totalPages) return null;

                                    return (
                                        <button
                                            key={p}
                                            onClick={() => setCurrentPage(p)}
                                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${currentPage === p
                                                ? 'bg-blue-600 text-white shadow-md'
                                                : 'text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-800'
                                                }`}
                                        >
                                            {p}
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg hover:bg-white dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">chevron_left</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActivityLogsPage;
