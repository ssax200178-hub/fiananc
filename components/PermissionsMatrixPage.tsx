import React, { useState, useMemo } from 'react';
import { useAppContext, PERMISSION_GROUPS } from '../AppContext';
import type { User, UserPermission, PermissionGroup } from '../AppContext';

const PermissionsMatrixPage = () => {
    const { users, updateUser, currentUser } = useAppContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<string[]>(PERMISSION_GROUPS.map(g => g.id));
    const [isSaving, setIsSaving] = useState<string | null>(null);

    // Filter out super_admins and inactive users if desired, or just show all
    const filteredUsers = useMemo(() => {
        return users.filter(user =>
        (user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.username.toLowerCase().includes(searchTerm.toLowerCase()))
        ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [users, searchTerm]);

    const toggleGroupExpansion = (groupId: string) => {
        setExpandedGroups(prev =>
            prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
        );
    };

    const handleTogglePermission = async (userId: string, permission: UserPermission) => {
        const user = users.find(u => u.id === userId);
        if (!user || user.role === 'super_admin') return;

        const currentPermissions = user.permissions || [];
        const newPermissions = currentPermissions.includes(permission)
            ? currentPermissions.filter(p => p !== permission)
            : [...currentPermissions, permission];

        setIsSaving(userId);
        try {
            await updateUser(userId, { permissions: newPermissions });
        } catch (error) {
            console.error('Failed to update permission:', error);
            alert('❌ فشل تحديث الصلاحية');
        } finally {
            setIsSaving(null);
        }
    };

    const handleToggleGroupForAll = async (userId: string, group: PermissionGroup) => {
        const user = users.find(u => u.id === userId);
        if (!user || user.role === 'super_admin') return;

        const groupKeys = group.permissions.map(p => p.key);
        const currentPermissions = user.permissions || [];
        const allInGroupGranted = groupKeys.every(k => currentPermissions.includes(k));

        let newPermissions: UserPermission[];
        if (allInGroupGranted) {
            // Remove all
            newPermissions = currentPermissions.filter(p => !groupKeys.includes(p));
        } else {
            // Add missing
            const missing = groupKeys.filter(k => !currentPermissions.includes(k));
            newPermissions = [...currentPermissions, ...missing];
        }

        setIsSaving(userId);
        try {
            await updateUser(userId, { permissions: newPermissions });
        } catch (error) {
            console.error('Failed to update group permissions:', error);
            alert('❌ فشل تحديث صلاحيات المجموعة');
        } finally {
            setIsSaving(null);
        }
    };

    return (
        <div className="max-w-full space-y-6 pb-20 overflow-x-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky left-0 right-0">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white font-display">مصفوفة الصلاحيات</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">إدارة شاملة لصلاحيات جميع الموظفين في مكان واحد</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            if (expandedGroups.length === PERMISSION_GROUPS.length) setExpandedGroups([]);
                            else setExpandedGroups(PERMISSION_GROUPS.map(g => g.id));
                        }}
                        className="px-4 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-lg">
                            {expandedGroups.length === PERMISSION_GROUPS.length ? 'collapse_all' : 'expand_all'}
                        </span>
                        {expandedGroups.length === PERMISSION_GROUPS.length ? 'طي الكل' : 'توسيع الكل'}
                    </button>
                    <div className="relative">
                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                        <input
                            type="text"
                            placeholder="بحث عن موظف..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full md:w-64 pr-10 pl-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-[var(--color-active)] outline-none"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-4 border-b border-l border-slate-200 dark:border-slate-700 min-w-[250px] sticky right-0 bg-slate-50 dark:bg-slate-800/80 z-20">الموظف / الصلاحيات</th>
                                {PERMISSION_GROUPS.map(group => (
                                    <th key={group.id} className="px-4 py-4 border-b border-slate-200 dark:border-slate-700 min-w-[150px]">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className={`p-2 rounded-lg bg-white dark:bg-slate-700 shadow-sm border border-slate-100 dark:border-slate-600 flex items-center justify-center`}>
                                                <span className="material-symbols-outlined text-xl" style={{ color: group.color }}>{group.icon}</span>
                                            </div>
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{group.label}</span>
                                            <button
                                                onClick={() => toggleGroupExpansion(group.id)}
                                                className="text-[10px] text-blue-500 hover:underline flex items-center gap-1"
                                            >
                                                {expandedGroups.includes(group.id) ? 'طي' : 'تفاصيل'}
                                                <span className="material-symbols-outlined text-[12px]">
                                                    {expandedGroups.includes(group.id) ? 'expand_less' : 'expand_more'}
                                                </span>
                                            </button>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredUsers.map(user => (
                                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="px-6 py-4 border-l border-slate-200 dark:border-slate-700 sticky right-0 bg-white dark:bg-[#1e293b] z-10">
                                        <div className="flex items-center gap-3">
                                            <div className="size-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-500">
                                                {user.username.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{user.name || user.username}</p>
                                                <p className="text-[10px] text-slate-500 uppercase">{user.role === 'super_admin' ? 'مدير نظام' : user.role === 'admin' ? 'مسؤول' : 'موظف'}</p>
                                            </div>
                                            {isSaving === user.id && (
                                                <span className="material-symbols-outlined text-sm animate-spin text-blue-500">sync</span>
                                            )}
                                        </div>
                                    </td>
                                    {PERMISSION_GROUPS.map(group => {
                                        const groupKeys = group.permissions.map(p => p.key);
                                        const grantedInGroup = groupKeys.filter(k => user.permissions?.includes(k) || user.role === 'super_admin');
                                        const allGranted = grantedInGroup.length === groupKeys.length;
                                        const someGranted = grantedInGroup.length > 0 && grantedInGroup.length < groupKeys.length;
                                        const isExpanded = expandedGroups.includes(group.id);

                                        return (
                                            <td key={group.id} className="px-2 py-4 align-top">
                                                <div className="flex flex-col items-center gap-2">
                                                    {/* Master Group Toggle */}
                                                    <button
                                                        disabled={user.role === 'super_admin' || isSaving === user.id}
                                                        onClick={() => handleToggleGroupForAll(user.id, group)}
                                                        className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${allGranted ? 'bg-green-500 text-white' :
                                                            someGranted ? 'bg-amber-500 text-white' :
                                                                'bg-slate-100 dark:bg-slate-700 text-slate-300'
                                                            }`}
                                                    >
                                                        <span className="material-symbols-outlined text-lg">
                                                            {allGranted ? 'check_circle' : someGranted ? 'published_with_changes' : 'circle'}
                                                        </span>
                                                    </button>
                                                    <span className="text-[10px] font-bold text-slate-400">{grantedInGroup.length}/{groupKeys.length}</span>

                                                    {/* Individual Expandable Toggles */}
                                                    {isExpanded && (
                                                        <div className="mt-2 space-y-1 w-full flex flex-col items-center">
                                                            {group.permissions.map(perm => {
                                                                const isGranted = user.permissions?.includes(perm.key) || user.role === 'super_admin';
                                                                return (
                                                                    <button
                                                                        key={perm.key}
                                                                        disabled={user.role === 'super_admin' || isSaving === user.id}
                                                                        onClick={() => handleTogglePermission(user.id, perm.key)}
                                                                        title={perm.label}
                                                                        className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] transition-colors border ${isGranted
                                                                            ? 'bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                                                                            : 'bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 text-slate-500'
                                                                            }`}
                                                                    >
                                                                        <span className="material-symbols-outlined text-[12px]">
                                                                            {isGranted ? 'check_circle' : 'circle'}
                                                                        </span>
                                                                        <span className="truncate">{perm.label}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800 flex gap-3 text-sm text-blue-800 dark:text-blue-300">
                <span className="material-symbols-outlined">info</span>
                <div className="space-y-1">
                    <p className="font-bold">تلميحات المصفوفة:</p>
                    <ul className="list-disc list-inside text-xs opacity-80">
                        <li>الضغط على أيقونة الحالة العلوية للمجموعة يقوم بتفعيل/تعطيل جميع صلاحيات تلك المجموعة للموظف.</li>
                        <li>استخدم زر "تفاصيل" تحت اسم المجموعة لتعديل كل صلاحية بشكل فردي.</li>
                        <li>مدراء النظام (Super Admins) يمتلكون جميع الصلاحيات دائماً ولا يمكن تعديلها.</li>
                        <li>يتم حفظ التغييرات تلقائياً وبشكل فوري عند الضغط.</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default PermissionsMatrixPage;
