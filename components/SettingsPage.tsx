import React, { useState } from 'react';
import { useAppContext } from '../AppContext';
import type { ColorScheme, ParticleType, UserRole, User } from '../AppContext';

const SettingsPage: React.FC = () => {
    const {
        colorScheme,
        updateColorScheme,
        resetColors,
        particlesConfig,
        updateParticlesConfig,
        currentUser,
        users,
        addUser,
        toggleUserStatus,
        deleteUser,
        updateUserName
    } = useAppContext();

    const [activeTab, setActiveTab] = useState<'users' | 'appearance'>(
        currentUser?.role === 'user' ? 'appearance' : 'users'
    );


    // --- User Management State ---
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [newUserForm, setNewUserForm] = useState({
        username: '',
        password: '',
        name: '',
        role: 'user' as UserRole
    });

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

    // --- Edit User State ---
    const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [editUserForm, setEditUserForm] = useState({
        name: '',
        role: 'user' as UserRole
    });

    const handleOpenEditModal = (user: User) => {
        setEditingUser(user);
        setEditUserForm({
            name: user.name || '',
            role: user.role
        });
        setIsEditUserModalOpen(true);
    };

    const handleEditUser = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;

        try {
            updateUserName(editingUser.id, editUserForm.name);
            setIsEditUserModalOpen(false);
            setEditingUser(null);
            alert('✅ تم تحديث بيانات المستخدم بنجاح');
        } catch (error) {
            console.error(error);
            alert('❌ فشل تحديث البيانات');
        }
    };

    // --- Appearance State ---
    const [tempColors, setTempColors] = useState<ColorScheme>(colorScheme);
    const [hasChanges, setHasChanges] = useState(false);

    const handleColorChange = (key: keyof ColorScheme, value: string) => {
        setTempColors(prev => ({ ...prev, [key]: value }));
        setHasChanges(true);
    };

    const handleSaveColors = () => {
        updateColorScheme(tempColors);
        setHasChanges(false);
    };

    const handleResetColors = () => {
        resetColors();
        const defaultColors: ColorScheme = {
            header: '#C62828',
            sidebar: '#263238',
            active: '#FFB300',
            link: '#4FC3F7',
            background: '#F5F5F5',
            success: '#4CAF50'
        };
        setTempColors(defaultColors);
        setHasChanges(false);
    };

    const colorItems: { key: keyof ColorScheme; label: string; description: string; icon: string }[] = [
        { key: 'header', label: 'الشريط العلوي', description: 'لون الشريط العلوي والأزرار الرئيسية', icon: 'toolbar' },
        { key: 'sidebar', label: 'القائمة الجانبية', description: 'خلفية القائمة الجانبية', icon: 'menu' },
        { key: 'active', label: 'العنصر النشط', description: 'لون تمييز القسم المختار والتنبيهات', icon: 'star' },
        { key: 'link', label: 'الروابط والبحث', description: 'أزرار البحث والروابط التشعبية', icon: 'link' },
        { key: 'background', label: 'خلفية البيانات', description: 'الخلفية الرئيسية لمنطقة العمل', icon: 'wallpaper' },
        { key: 'success', label: 'الحالات الإيجابية', description: 'لون تمييز الحالات الناجحة', icon: 'check_circle' }
    ];

    const particleTypes: { value: ParticleType; label: string; icon: string }[] = [
        { value: 'dollar', label: 'دولار ($)', icon: 'attach_money' },
        { value: 'stars', label: 'نجوم (⭐)', icon: 'star' },
        { value: 'circles', label: 'دوائر', icon: 'circle' },
        { value: 'all', label: 'جميع العملات', icon: 'currency_exchange' },
        { value: 'none', label: 'بدون', icon: 'block' }
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white font-display">الإعدادات</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        {currentUser?.role === 'user' ? 'تخصيص النظام' : 'إدارة المستخدمين وتخصيص النظام'}
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
                <button
                    onClick={() => setActiveTab('appearance')}
                    className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'appearance'
                        ? 'bg-[var(--color-active)] text-white shadow-md'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                >
                    <span className="material-symbols-outlined">palette</span>
                    المظهر والتخصيص
                </button>
            </div>

            {/* Content Area */}
            {activeTab === 'users' ? (
                <div className="space-y-6">
                    {/* Users Management Section */}
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
                                                    <span className="font-bold text-slate-900 dark:text-white">{user.username}</span>
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
                                                    {user.role === 'super_admin' ? 'مدير النظام' : user.role === 'admin' ? 'مسؤول' : 'موظف'}
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
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">اسم المستخدم</label>
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
                                            <option value="super_admin">مدير النظام (كامل الصلاحيات)</option>
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
                                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3 mb-4">
                                        <p className="text-sm text-blue-700 dark:text-blue-300">
                                            <strong>اسم المستخدم:</strong> {editingUser.username}
                                        </p>
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
                </div>
            ) : currentUser?.role === 'user' ? (
                // Regular users see access denied message
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-2xl p-8 text-center">
                    <span className="material-symbols-outlined text-6xl text-yellow-600 dark:text-yellow-400">block</span>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-4">صلاحيات محدودة</h3>
                    <p className="text-slate-600 dark:text-slate-400 mt-2">ليس لديك صلاحية الوصول لإدارة المستخدمين</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Color Customization Section */}
                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                <span className="material-symbols-outlined text-purple-600 dark:text-purple-400">palette</span>
                                تنسيق الألوان
                            </h2>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">قم بتخصيص ألوان النظام حسب هوية شركتك البصرية</p>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {colorItems.map((item) => (
                                    <div key={item.key} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600">
                                                    <span className="material-symbols-outlined text-slate-600 dark:text-slate-300 text-xl">{item.icon}</span>
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-slate-900 dark:text-white">{item.label}</h3>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                                                </div>
                                            </div>
                                            <div
                                                className="w-12 h-12 rounded-lg border-2 border-white dark:border-slate-600 shadow-sm"
                                                style={{ backgroundColor: tempColors[item.key] }}
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={tempColors[item.key]}
                                                onChange={(e) => handleColorChange(item.key, e.target.value)}
                                                className="w-full h-10 rounded-lg cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={tempColors[item.key]}
                                                onChange={(e) => handleColorChange(item.key, e.target.value)}
                                                className="w-28 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg font-mono text-sm bg-white dark:bg-slate-700 dark:text-white"
                                                placeholder="#FFFFFF"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
                                <button
                                    onClick={handleResetColors}
                                    className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold flex items-center gap-2 transition-colors"
                                >
                                    <span className="material-symbols-outlined">refresh</span>
                                    استعادة الافتراضي
                                </button>
                                <button
                                    onClick={handleSaveColors}
                                    disabled={!hasChanges}
                                    className="px-6 py-3 bg-[var(--color-header)] hover:brightness-110 text-white font-bold rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="material-symbols-outlined">save</span>
                                    حفظ التغييرات
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Particles Background Section */}
                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                <span className="material-symbols-outlined text-green-600 dark:text-green-400">blur_on</span>
                                خلفية الجزيئات التفاعلية
                            </h2>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">إضافة مؤثرات بصرية ثلاثية الأبعاد للخلفية (Three.js)</p>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Enable/Disable Toggle */}
                            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-2xl text-blue-600 dark:text-blue-400">visibility</span>
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white">تفعيل الخلفية</h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">إظهار/إخفاء الجزيئات المتحركة</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => updateParticlesConfig({ enabled: !particlesConfig.enabled })}
                                    className={`relative w-16 h-8 rounded-full transition-colors ${particlesConfig.enabled ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                                        }`}
                                >
                                    <div
                                        className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-transform ${particlesConfig.enabled ? 'translate-x-9' : 'translate-x-1'
                                            }`}
                                    />
                                </button>
                            </div>

                            {/* Particle Type Selection */}
                            <div>
                                <label className="block font-bold text-slate-900 dark:text-white mb-3">نوع الجزيئات</label>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                    {particleTypes.map((type) => (
                                        <button
                                            key={type.value}
                                            onClick={() => updateParticlesConfig({ type: type.value })}
                                            className={`p-4 rounded-xl border-2 transition-all ${particlesConfig.type === type.value
                                                ? 'border-[var(--color-header)] bg-red-50 dark:bg-red-900/20'
                                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                                }`}
                                        >
                                            <div className="flex flex-col items-center gap-2">
                                                <span className="material-symbols-outlined text-3xl text-slate-700 dark:text-slate-300">{type.icon}</span>
                                                <span className="text-sm font-bold text-slate-900 dark:text-white">{type.label}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Particle Count */}
                            <div>
                                <label className="block font-bold text-slate-900 dark:text-white mb-2">
                                    عدد الجزيئات: {particlesConfig.count}
                                </label>
                                <input
                                    type="range"
                                    min="100"
                                    max="1000"
                                    step="50"
                                    value={particlesConfig.count}
                                    onChange={(e) => updateParticlesConfig({ count: parseInt(e.target.value) })}
                                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    <span>قليل (100)</span>
                                    <span>كثير (1000)</span>
                                </div>
                            </div>

                            {/* Particle Speed */}
                            <div>
                                <label className="block font-bold text-slate-900 dark:text-white mb-2">
                                    سرعة الحركة: {particlesConfig.speed}x
                                </label>
                                <input
                                    type="range"
                                    min="0.5"
                                    max="3"
                                    step="0.5"
                                    value={particlesConfig.speed}
                                    onChange={(e) => updateParticlesConfig({ speed: parseFloat(e.target.value) })}
                                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    <span>بطيء (0.5x)</span>
                                    <span>سريع (3x)</span>
                                </div>
                            </div>

                            {/* Gravity / Interaction Strength */}
                            <div>
                                <label className="block font-bold text-slate-900 dark:text-white mb-2">
                                    قوة الجذب (الجاذبية): {particlesConfig.interactionStrength || 1}x
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="5"
                                    step="0.5"
                                    value={particlesConfig.interactionStrength || 1}
                                    onChange={(e) => updateParticlesConfig({ interactionStrength: parseFloat(e.target.value) })}
                                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    <span>منعدمة (0)</span>
                                    <span>قوية جداً (5x)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default SettingsPage;