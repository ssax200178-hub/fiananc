import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import type { UserRole, User, TipType, UserPermission } from '../AppContext';

const SettingsPage = () => {
    const {
        currentUser,
        users,
        addUser,
        toggleUserStatus,
        deleteUser,
        updateUser,
        changePassword,
        financialTips,
        addFinancialTip,
        updateFinancialTip,
        deleteFinancialTip
    } = useAppContext();

    const [activeTab, setActiveTab] = useState<'users' | 'tips' | 'account'>(
        currentUser?.role === 'user' ? 'account' : 'users'
    );

    const location = useLocation();

    useEffect(() => {
        if (currentUser?.role === 'user' || location.state?.openAccount) {
            setActiveTab('account');
        }
    }, [currentUser, location.state]);

    const availablePermissions: { key: UserPermission; label: string; icon: string; description: string }[] = [
        { key: 'view_dashboard', label: 'عرض لوحة التحكم', icon: 'dashboard', description: 'السماح بمراجعة الملخص المالي العام' },
        { key: 'manage_funds', label: 'مطابقة الصناديق', icon: 'account_balance', description: 'إجراء وحفظ المطابقات اليومية للبنوك والصناديق' },
        { key: 'delete_funds', label: 'حذف المطابقات', icon: 'delete_history', description: 'صلاحية حساسة لحذف سجلات قديمة' },
        { key: 'manage_restaurants', label: 'إدارة المطاعم', icon: 'storefront', description: 'إضافة وتعديل بيانات وحسابات المطاعم' },
        { key: 'view_history', label: 'عرض السجلات', icon: 'history', description: 'مراجعة أرشيف المطابقات السابقة' },
        { key: 'view_activity_logs', label: 'سجل النظام', icon: 'history_edu', description: 'مراقبة كافة تحركات الموظفين' },
        { key: 'manage_users', label: 'إدارة الموظفين', icon: 'group', description: 'إضافة موظفين وتعديل صلاحياتهم' },
        { key: 'manage_settings', label: 'إعدادات النظام', icon: 'settings_suggest', description: 'إدارة الإعدادات العامة للنظام' },
        { key: 'manage_tips', label: 'إدارة التوجيهات', icon: 'lightbulb', description: 'إضافة وتعديل النصائح المالية للموظفين' },
    ];


    // --- User Management State ---
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [newUserForm, setNewUserForm] = useState({
        username: '',
        password: '',
        name: '',
        role: 'user' as UserRole
    });

    // --- Tip Preview State ---
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [tipToPreview, setTipToPreview] = useState<any>(null);

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await addUser(newUserForm.username, newUserForm.password, newUserForm.name, newUserForm.role);
            setIsAddUserModalOpen(false);
            setNewUserForm({ username: '', password: '', name: '', role: 'user' });
            alert('تم إضافة المستخدم بنجاح');
        } catch (error) {
            console.error(error);
        }
    };

    const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
    const [userForPermissions, setUserForPermissions] = useState<User | null>(null);

    const handleOpenPermissionsModal = (user: User) => {
        setUserForPermissions(user);
        setIsPermissionsModalOpen(true);
    };

    const handleTogglePermission = async (perm: UserPermission) => {
        if (!userForPermissions) return;
        const currentPerms = userForPermissions.permissions || [];
        const newPerms = currentPerms.includes(perm)
            ? currentPerms.filter(p => p !== perm)
            : [...currentPerms, perm];

        const updatedUser = { ...userForPermissions, permissions: newPerms };
        setUserForPermissions(updatedUser);

        try {
            await updateUser(userForPermissions.id, { permissions: newPerms });
        } catch (error) {
            console.error(error);
            alert('❌ فشل تحديث الصلاحية');
        }
    };

    // --- Edit User State ---
    const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [editUserForm, setEditUserForm] = useState({
        username: '',
        name: '',
        password: ''
    });

    const handleOpenEditModal = (user: User) => {
        setEditingUser(user);
        setEditUserForm({
            username: user.username,
            name: user.name || '',
            password: '' // Always start empty for security
        });
        setIsEditUserModalOpen(true);
    };

    const handleEditUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;

        try {
            const success = await updateUser(editingUser.id, {
                username: editUserForm.username,
                name: editUserForm.name,
                password: editUserForm.password || undefined
            });
            if (success) {
                setIsEditUserModalOpen(false);
                setEditingUser(null);
                alert('✅ تم تحديث بيانات المستخدم بنجاح');
            }
        } catch (error) {
            console.error(error);
            alert('❌ فشل تحديث البيانات');
        }
    };

    // --- Password Change State ---
    const [passwordForm, setPasswordForm] = useState({
        newPassword: '',
        confirmPassword: ''
    });
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    const handleChangePassword = async (e: any) => {
        e.preventDefault();
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            alert('❌ كلمات المرور غير متطابقة!');
            return;
        }
        if (passwordForm.newPassword.length < 6) {
            alert('❌ يجب أن تكون كلمة المرور 6 أحرف على الأقل');
            return;
        }

        setIsChangingPassword(true);
        try {
            await changePassword(passwordForm.newPassword);
            alert('✅ تم تغيير كلمة المرور بنجاح');
            setPasswordForm({ newPassword: '', confirmPassword: '' });
        } catch (error: any) {
            alert(error.message || '❌ فشل تغيير كلمة المرور');
        } finally {
            setIsChangingPassword(false);
        }
    };


    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white font-display">الإعدادات</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        {currentUser?.role === 'user' ? 'إعدادات النظام' : 'إدارة المستخدمين والنظام'}
                    </p>
                </div>
                <span className="material-symbols-outlined text-6xl text-slate-200 dark:text-slate-700">settings</span>
            </div>

            {/* Tabs Navigation */}
            <div className="flex bg-white dark:bg-[#1e293b] p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm w-fit">
                {/* Only show Users tab for admin and super_admin */}
                {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'users'
                            ? 'bg-[var(--color-active)] text-white shadow-md'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                    >
                        <span className="material-symbols-outlined">group</span>
                        إدارة المستخدمين
                    </button>
                )}
                {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
                    <button
                        onClick={() => setActiveTab('tips')}
                        className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'tips'
                            ? 'bg-[var(--color-active)] text-white shadow-md'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                    >
                        <span className="material-symbols-outlined">lightbulb</span>
                        النصائح والتوجيهات
                    </button>
                )}
                <button
                    onClick={() => setActiveTab('account')}
                    className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'account'
                        ? 'bg-[var(--color-active)] text-white shadow-md'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                >
                    <span className="material-symbols-outlined">shield_person</span>
                    حسابي وأماني
                </button>
            </div>

            {/* Content Area */}
            {activeTab === 'users' ? (
                <div className="space-y-6">
                    {/* Users Management Section */}
                    {currentUser?.role === 'user' ? (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-2xl p-8 text-center">
                            <span className="material-symbols-outlined text-6xl text-yellow-600 dark:text-yellow-400">block</span>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-4">صلاحيات محدودة</h3>
                            <p className="text-slate-600 dark:text-slate-400 mt-2">ليس لديك صلاحية الوصول لإدارة المستخدمين</p>
                        </div>
                    ) : (
                        <>
                            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 flex justify-between items-center">
                                    <div>
                                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                            <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">manage_accounts</span>
                                            قائمة المستخدمين
                                        </h2>
                                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">إدارة حسابات الموظفين والصلاحيات</p>
                                    </div>
                                    {/* Only super_admin can add users */}
                                    {currentUser?.role === 'super_admin' && (
                                        <button
                                            onClick={() => setIsAddUserModalOpen(true)}
                                            className="px-4 py-2 bg-[var(--color-header)] hover:brightness-110 text-white rounded-lg font-bold flex items-center gap-2 transition-all shadow-sm"
                                        >
                                            <span className="material-symbols-outlined">person_add</span>
                                            إضافة مستخدم
                                        </button>
                                    )}
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-right">
                                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-sm">
                                            <tr>
                                                <th className="px-6 py-4">المستخدم</th>
                                                <th className="px-6 py-4">الاسم الكامل</th>
                                                <th className="px-6 py-4">الدور</th>
                                                <th className="px-6 py-4">الحالة</th>
                                                <th className="px-6 py-4">الإجراءات</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                            {users.map((user) => (
                                                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`size-8 rounded-full flex items-center justify-center font-bold text-white text-xs ${user.role === 'super_admin' ? 'bg-purple-500' : user.role === 'admin' ? 'bg-blue-500' : 'bg-slate-500'
                                                                }`}>
                                                                {user.username.charAt(0).toUpperCase()}
                                                            </div>
                                                            <button
                                                                onClick={() => handleOpenPermissionsModal(user)}
                                                                className="font-bold text-[var(--color-header)] hover:underline text-right"
                                                            >
                                                                {user.username}
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                                                        {user.name || '-'}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${user.role === 'super_admin'
                                                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                                            : user.role === 'admin'
                                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                                                : 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300'
                                                            }`}>
                                                            {user.role === 'super_admin' ? 'مهندس النظام' : user.role === 'admin' ? 'مسؤول' : 'موظف'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <button
                                                            onClick={() => toggleUserStatus(user.id)}
                                                            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 transition-colors ${user.isActive
                                                                ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300'
                                                                : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300'
                                                                }`}
                                                            title="تغيير الحالة"
                                                            disabled={user.role === 'super_admin' || (currentUser?.role !== 'super_admin' && user.role === 'admin')}
                                                        >
                                                            <span className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                                            {user.isActive ? 'نشط' : 'موقف'}
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            {/* Edit Button */}
                                                            {user.id !== '0' && user.id !== '1' && user.id !== '2' && (
                                                                <button
                                                                    onClick={() => handleOpenEditModal(user)}
                                                                    className="text-blue-500 hover:text-blue-700 p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                                                    title="تعديل"
                                                                >
                                                                    <span className="material-symbols-outlined">edit</span>
                                                                </button>
                                                            )}
                                                            {/* Delete Button */}
                                                            {user.id !== '0' && user.id !== currentUser?.id && (
                                                                <button
                                                                    onClick={() => {
                                                                        if (confirm('هل أنت متأكد من حذف هذا المستخدم؟')) {
                                                                            deleteUser(user.id);
                                                                        }
                                                                    }}
                                                                    className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                                    title="حذف"
                                                                    disabled={user.id === '0'}
                                                                >
                                                                    <span className="material-symbols-outlined">delete</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Add User Modal */}
                            {isAddUserModalOpen && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">إضافة مستخدم جديد</h3>
                                            <button onClick={() => setIsAddUserModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                                                <span className="material-symbols-outlined">close</span>
                                            </button>
                                        </div>
                                        <form onSubmit={handleAddUser} className="p-6 space-y-4">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">اسم المستخدم (بالإنجيزية فقط)</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={newUserForm.username}
                                                    onChange={e => setNewUserForm({ ...newUserForm, username: e.target.value })}
                                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">الاسم الكامل (الموظف)</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={newUserForm.name}
                                                    onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })}
                                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">كلمة المرور</label>
                                                <input
                                                    type="password"
                                                    required
                                                    value={newUserForm.password}
                                                    onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">الدور (الصلاحية)</label>
                                                <select
                                                    value={newUserForm.role}
                                                    onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value as UserRole })}
                                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                                >
                                                    <option value="user">موظف (مشاهدة فقط)</option>
                                                    <option value="admin">مسؤول (تحرير ومطابقة)</option>
                                                    <option value="super_admin">مهندس النظام (كامل الصلاحيات)</option>
                                                </select>
                                            </div>
                                            <div className="pt-4 flex gap-3">
                                                <button
                                                    type="submit"
                                                    className="flex-1 py-2 bg-[var(--color-header)] text-white font-bold rounded-lg hover:brightness-110 transition-all"
                                                >
                                                    إضافة
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsAddUserModalOpen(false)}
                                                    className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                                                >
                                                    إلغاء
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}

                            {/* Edit User Modal */}
                            {isEditUserModalOpen && editingUser && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">تعديل بيانات المستخدم</h3>
                                            <button onClick={() => setIsEditUserModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                                                <span className="material-symbols-outlined">close</span>
                                            </button>
                                        </div>
                                        <form onSubmit={handleEditUser} className="p-6 space-y-4">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">اسم المستخدم (للدخول)</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={editUserForm.username}
                                                    onChange={e => setEditUserForm({ ...editUserForm, username: e.target.value })}
                                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">الاسم الكامل</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={editUserForm.name}
                                                    onChange={e => setEditUserForm({ ...editUserForm, name: e.target.value })}
                                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">كلمة المرور الجديدة (اختياري)</label>
                                                <input
                                                    type="password"
                                                    placeholder="اتركه فارغاً لعدم التغيير"
                                                    value={editUserForm.password}
                                                    onChange={e => setEditUserForm({ ...editUserForm, password: e.target.value })}
                                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                                />
                                            </div>
                                            <div className="pt-4 flex gap-3">
                                                <button
                                                    type="submit"
                                                    className="flex-1 py-2 bg-[var(--color-header)] text-white font-bold rounded-lg hover:brightness-110 transition-all"
                                                >
                                                    حفظ التغييرات
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditUserModalOpen(false)}
                                                    className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                                                >
                                                    إلغاء
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}
                            {/* Permissions Management Modal */}
                            {isPermissionsModalOpen && userForPermissions && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-in">
                                        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-red-50 to-white dark:from-red-900/10 dark:to-[#1e293b] flex justify-between items-center">
                                            <div>
                                                <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-red-600">admin_panel_settings</span>
                                                    إدارة صلاحيات: {userForPermissions.name || userForPermissions.username}
                                                </h3>
                                                <p className="text-xs text-slate-500 mt-1">تحكم دقيق في الإجراءات التي يمكن للموظف القيام بها</p>
                                            </div>
                                            <button
                                                onClick={() => setIsPermissionsModalOpen(false)}
                                                className="size-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center text-slate-400"
                                            >
                                                <span className="material-symbols-outlined">close</span>
                                            </button>
                                        </div>

                                        <div className="p-6">
                                            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-200 dark:border-amber-700/50 mb-6 flex gap-3">
                                                <span className="material-symbols-outlined text-amber-600">info</span>
                                                <p className="text-xs text-amber-800 dark:text-amber-300 font-bold leading-relaxed">
                                                    ملاحظة: الصلاحيات الممنوحة هنا يتم تطبيقها فوراً. الموظفين برتبة "مدير النظام" يمتلكون كافة الصلاحيات تلقائياً ولا يمكن تقييدهم.
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                                {availablePermissions.map((perm) => {
                                                    const isGranted = userForPermissions.permissions?.includes(perm.key) || userForPermissions.role === 'super_admin';
                                                    const isDisabled = userForPermissions.role === 'super_admin';

                                                    return (
                                                        <div
                                                            key={perm.key}
                                                            className={`p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${isGranted
                                                                ? 'border-green-100 bg-green-50/30 dark:border-green-900/30 dark:bg-green-900/10'
                                                                : 'border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800/50'
                                                                }`}
                                                        >
                                                            <div className={`size-10 rounded-lg flex items-center justify-center ${isGranted ? 'bg-green-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                                                                <span className="material-symbols-outlined text-xl">{perm.icon}</span>
                                                            </div>
                                                            <div className="flex-1">
                                                                <h4 className="font-bold text-sm text-slate-900 dark:text-white">{perm.label}</h4>
                                                                <p className="text-[10px] text-slate-500 leading-tight">{perm.description}</p>
                                                            </div>
                                                            <button
                                                                disabled={isDisabled}
                                                                onClick={() => handleTogglePermission(perm.key)}
                                                                className={`relative w-12 h-6 rounded-full transition-colors flex items-center px-1 ${isGranted ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            >
                                                                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isGranted ? 'translate-x-6' : 'translate-x-0'}`} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                                            <button
                                                onClick={() => setIsPermissionsModalOpen(false)}
                                                className="px-6 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg hover:brightness-110 transition-all"
                                            >
                                                إغلاق
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            ) : activeTab === 'tips' ? (
                <div className="space-y-6">
                    {currentUser?.role === 'user' ? (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-2xl p-8 text-center">
                            <span className="material-symbols-outlined text-6xl text-yellow-600 dark:text-yellow-400">block</span>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-4">صلاحيات محدودة</h3>
                            <p className="text-slate-600 dark:text-slate-400 mt-2">ليس لديك صلاحية الوصول لإدارة النصائح</p>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">tips_and_updates</span>
                                        إدارة النصائح المالية والتنبيهات
                                    </h2>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">أضف نصائح أو تنبيهات تظهر للموظفين في لوحة التحكم</p>
                                </div>
                            </div>

                            <div className="p-6">
                                <form onSubmit={async (e) => {
                                    e.preventDefault();
                                    const form = e.target as HTMLFormElement;
                                    const text = (form.elements.namedItem('tip-text') as HTMLTextAreaElement).value;
                                    const type = (form.elements.namedItem('tip-type') as HTMLSelectElement).value as TipType;

                                    let icon = 'lightbulb';
                                    if (type === 'alert') icon = 'notifications_active';
                                    if (type === 'warning') icon = 'warning';
                                    if (type === 'guidance') icon = 'direction';

                                    await addFinancialTip(text, type, icon);
                                    form.reset();
                                    alert('تمت الإضافة بنجاح ✅');
                                }} className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 mb-8 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">نص النصيحة / التنبيه</label>
                                            <textarea
                                                id="tip-text"
                                                name="tip-text"
                                                required
                                                placeholder="اكتب النصيحة المالية أو التوجيه هنا..."
                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-[var(--color-active)] outline-none min-h-[100px] font-bold"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">نوع الرسالة</label>
                                            <select
                                                id="tip-type"
                                                name="tip-type"
                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-[var(--color-active)] outline-none font-bold"
                                            >
                                                <option value="tip">نصيحة مالية</option>
                                                <option value="alert">تنبيه هام</option>
                                                <option value="guidance">توجيه إداري</option>
                                                <option value="warning">تحذير</option>
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-3 justify-end">
                                            <button
                                                type="submit"
                                                className="w-full py-3 bg-[var(--color-header)] text-white font-black rounded-xl hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/10"
                                            >
                                                <span className="material-symbols-outlined">add_circle</span>
                                                إضافة للوحة
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const form = document.querySelector('form') as HTMLFormElement;
                                                    const text = (form.elements.namedItem('tip-text') as HTMLTextAreaElement).value;
                                                    const type = (form.elements.namedItem('tip-type') as HTMLSelectElement).value;
                                                    if (!text) return alert('الرجاء كتابة نص للمعاينة');

                                                    let icon = 'lightbulb';
                                                    if (type === 'alert') icon = 'notifications_active';
                                                    if (type === 'warning') icon = 'warning';
                                                    if (type === 'guidance') icon = 'direction';

                                                    setTipToPreview({ text, type, icon });
                                                    setIsPreviewModalOpen(true);
                                                }}
                                                className="w-full py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-white font-black rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined">visibility</span>
                                                معاينة
                                            </button>
                                        </div>
                                    </div>
                                </form>

                                <div className="space-y-4">
                                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm">list</span>
                                        الرسائل الحالية
                                    </h3>
                                    {(useAppContext() as any).financialTips?.length === 0 ? (
                                        <div className="text-center py-10 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-700">
                                            لا توجد نصائح مضافة حالياً.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-3">
                                            {financialTips.map((tip: any) => (
                                                <div key={tip.id} className="flex flex-col md:flex-row items-center justify-between p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:shadow-lg transition-all gap-4">
                                                    <div className="flex items-center gap-5 flex-1">
                                                        <div className={`size-12 rounded-2xl flex items-center justify-center shadow-sm ${tip.type === 'warning' ? 'bg-red-50 text-red-600' :
                                                            tip.type === 'alert' ? 'bg-orange-50 text-orange-600' :
                                                                tip.type === 'guidance' ? 'bg-blue-50 text-blue-600' :
                                                                    'bg-amber-50 text-amber-600'
                                                            }`}>
                                                            <span className="material-symbols-outlined text-2xl">{tip.icon}</span>
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="font-black text-slate-900 dark:text-white leading-relaxed">{tip.text}</p>
                                                            <div className="flex gap-2 mt-2">
                                                                <span className="text-[10px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-black">
                                                                    {tip.type === 'tip' ? '💡 نصيحة' : tip.type === 'alert' ? '🔔 تنبيه' : tip.type === 'warning' ? '⚠️ تحذير' : '📝 توجيه'}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400 flex items-center gap-1 font-bold">
                                                                    <span className="material-symbols-outlined text-[12px]">calendar_today</span>
                                                                    {new Date(tip.createdAt).toLocaleDateString('ar-SA')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 w-full md:w-auto shrink-0 border-t md:border-t-0 pt-4 md:pt-0 border-slate-100 dark:border-slate-700">
                                                        <button
                                                            onClick={() => {
                                                                setTipToPreview(tip);
                                                                setIsPreviewModalOpen(true);
                                                            }}
                                                            className="flex-1 md:flex-none px-4 py-2 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">visibility</span>
                                                            معاينة
                                                        </button>
                                                        <button
                                                            onClick={() => updateFinancialTip(tip.id, { isActive: !tip.isActive })}
                                                            className={`p-2 rounded-xl transition-all ${tip.isActive ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-400 opacity-50'}`}
                                                            title={tip.isActive ? "نشطة" : "معطلة"}
                                                        >
                                                            <span className="material-symbols-outlined">{tip.isActive ? 'visibility' : 'visibility_off'}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => deleteFinancialTip(tip.id)}
                                                            className="px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-red-100 transition-colors"
                                                            title="حذف"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">delete</span>
                                                            حذف
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : activeTab === 'account' ? (
                <div className="space-y-6 max-w-2xl">
                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                    <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">lock_reset</span>
                                    تغيير كلمة المرور
                                </h2>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">قم بتحديث كلمة المرور الخاصة بك لتأمين حسابك</p>
                            </div>
                        </div>

                        <div className="p-8">
                            <form onSubmit={handleChangePassword} className="space-y-6">
                                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 flex gap-3 mb-6">
                                    <span className="material-symbols-outlined text-blue-600">info</span>
                                    <div className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
                                        <p className="font-bold">نصيحة أمان:</p>
                                        <p>استخدم كلمة مرور قوية تحتوي على أحرف وأرقام لضمان حماية بياناتك المالية.</p>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">كلمة المرور الجديدة</label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">lock</span>
                                        <input
                                            type="password"
                                            required
                                            value={passwordForm.newPassword}
                                            onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                            className="w-full pr-12 pl-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-[var(--color-active)] outline-none font-bold transition-all"
                                            placeholder="أدخل كلمة مرور جديدة (6 أحرف على الأقل)"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">تأكيد كلمة المرور الجديدة</label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">check_circle</span>
                                        <input
                                            type="password"
                                            required
                                            value={passwordForm.confirmPassword}
                                            onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                            className="w-full pr-12 pl-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-[var(--color-active)] outline-none font-bold transition-all"
                                            placeholder="أعد إدخال كلمة المرور للتأكيد"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isChangingPassword}
                                    className="w-full py-4 bg-[var(--color-header)] text-white font-black rounded-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 text-lg"
                                >
                                    {isChangingPassword ? (
                                        <>
                                            <span className="material-symbols-outlined animate-spin">sync</span>
                                            جاري التحديث...
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined">save</span>
                                            حفظ كلمة المرور الجديدة
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default SettingsPage;