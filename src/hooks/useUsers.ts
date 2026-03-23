import { useState, useRef } from 'react';
import { User, UserRole, UserPermission, ALL_NEW_PERMISSIONS } from '../../AppContext';
import { userService } from '../services/userService';
import { generateId } from '../../utils';
import { confirmDialog } from '../../utils/confirm';

export const useUsers = (persistState: any, addLog: any) => {
    const [users, setUsers] = useState<User[]>([]);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(false);

    const usersRef = useRef<User[]>([]);
    // Keep internal ref updated for accurate closure reads during consecutive updates
    useState(() => {
        usersRef.current = users;
    });
    // Update ref when users change from external sources (like fetch)
    if (users !== usersRef.current) {
        usersRef.current = users;
    }

    const userSaveLockRef = useRef(false);
    const pendingUserUpdateRef = useRef<{ id: string; updates: any } | null>(null);

    const login = async (username: string, password: string): Promise<boolean> => {
        setIsAuthLoading(true);
        try {
            const { email } = await userService.login(username, password);
            setTimeout(() => addLog('تسجيل دخول', `تم تسجيل دخول: ${email}`, 'auth'), 2000);
            return true;
        } catch (error: any) {
            console.error("❌ [AUTH] Login Error:", error.code, error.message);
            if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
                return false;
            } else if (error.code === 'auth/too-many-requests') {
                alert('⚠️ تم تجاوز عدد المحاولات المسموح. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.');
                return false;
            } else {
                alert(`فشل تسجيل الدخول: ${error.message}`);
                return false;
            }
        } finally {
            setIsAuthLoading(false);
        }
    };

    const logout = async () => {
        if (currentUser) {
            addLog('تسجيل خروج', `خرج المستخدم ${currentUser.name} من النظام`, 'auth');
        }
        await userService.logout();
    };

    const changePassword = async (newPassword: string) => {
        try {
            await userService.changePassword(newPassword);
            addLog('تغيير كلمة المرور', `قام المستخدم ${currentUser?.name} بتغيير كلمة المرور الخاصة به`, 'auth');
        } catch (error: any) {
            console.error("Error changing password:", error);
            if (error.code === 'auth/requires-recent-login') {
                throw new Error('يرجى تسجيل الدخول مرة أخرى لإتمام عملية تغيير كلمة المرور لأغراض أمنية');
            }
            throw error;
        }
    };

    const addUser = async (username: string, password: string, name: string, role: UserRole, permissions?: UserPermission[]) => {
        setIsAuthLoading(true);
        try {
            const { uid, email } = await userService.createUserInFirebase(username, password);

            const existing = users.find(u => u.username.toLowerCase() === username.toLowerCase() || u.email?.toLowerCase() === email.toLowerCase());
            if (existing) {
                throw new Error(`اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل: ${email}`);
            }

            const defaultPermissions: UserPermission[] = permissions || (
                role === 'super_admin' ? [...ALL_NEW_PERMISSIONS] :
                    role === 'admin' ? [
                        'dashboard_view',
                        'restaurants_view', 'restaurants_add', 'restaurants_edit', 'restaurants_import',
                        'funds_view', 'funds_add', 'funds_edit',
                        'recon_view', 'recon_add',
                        'payments_view', 'payments_manage',
                        'archives_view',
                        'tips_view', 'tips_add'
                    ] :
                        ['dashboard_view', 'archives_view']
            );

            const newUser: User = {
                id: generateId(),
                username: username.trim().toLowerCase(),
                name,
                role,
                isActive: true,
                email,
                firebaseUid: uid,
                permissions: defaultPermissions
            };

            const updatedUsers = [...users, newUser];
            setUsers(updatedUsers);

            await persistState({ users: updatedUsers });
            await userService.syncUserRole(uid, role, defaultPermissions, true, email);

            addLog('إضافة مستخدم', `تم إضافة مستخدم جديد: ${name} (${role})`, 'settings');
        } catch (error: any) {
            console.error("Error creating user:", error);
            let errorMsg = error.message;
            if (error.code === 'auth/email-already-in-use') {
                errorMsg = "البريد الإلكتروني مستخدم مسبقاً في النظام. (قد يكون هناك حساب مخفي)";
            }
            alert(`❌ فشل إنشاء المستخدم: ${errorMsg}`);
            throw error;
        } finally {
            setIsAuthLoading(false);
        }
    };

    const deleteUser = async (id: string) => {
        if (currentUser?.id === id) {
            alert('❌ لا يمكنك حذف حسابك الخاص!');
            return;
        }
        if (id === '0') {
            alert('❌ لا يمكن حذف مدير النظام الافتراضي!');
            return;
        }
        const userToDelete = users.find(u => u.id === id);
        if (!userToDelete) return;

        if (!(await confirmDialog(`هل أنت متأكد من حذف المستخدم ${userToDelete.name}؟ لن يتمكن من الدخول للنظام مرة أخرى.`, { type: 'danger' }))) return;

        try {
            if (userToDelete.firebaseUid) {
                await userService.deleteUserRoleCache(userToDelete.firebaseUid);
            }

            const updatedUsers = users.filter(u => u.id !== id);
            setUsers(updatedUsers);
            await persistState({ users: updatedUsers });

            addLog('حذف مستخدم', `تم حذف المستخدم: ${userToDelete.name}`, 'settings');
        } catch (e: any) {
            console.error("Error deleting user:", e);
            alert(`❌ فشل حذف المستخدم: ${e.message}`);
        }
    };

    const toggleUserStatus = async (id: string) => {
        const userToToggle = users.find(u => u.id === id);
        if (!userToToggle) return;

        const newStatus = !userToToggle.isActive;
        const currentUsers = usersRef.current;
        const updatedUsers = currentUsers.map(u => u.id === id ? { ...u, isActive: newStatus } : u);
        usersRef.current = updatedUsers;
        setUsers(updatedUsers);
        await persistState({ users: updatedUsers });

        if (userToToggle.firebaseUid) {
            await userService.syncUserRole(userToToggle.firebaseUid, userToToggle.role, userToToggle.permissions || [], newStatus, userToToggle.email || '');
        }

        addLog('تغيير حالة مستخدم', `تم ${newStatus ? 'تنشيط' : 'تعطيل'} المستخدم: ${userToToggle.name}`, 'settings');
    };

    const updateUser = async (id: string, updates: { username?: string; name?: string; password?: string; permissions?: UserPermission[]; role?: UserRole; firebaseUid?: string; isActive?: boolean; email?: string }): Promise<boolean> => {
        if (updates.password) {
            alert("تنبيه: تغيير كلمة المرور هنا لا يؤثر على حساب الدخول في هذه النسخة.");
        }

        if (userSaveLockRef.current) {
            pendingUserUpdateRef.current = { id, updates };
            console.log('⏳ [AUTH] User update queued — another save is in progress');
            return true;
        }

        userSaveLockRef.current = true;

        try {
            let targetUser: User | undefined;
            const currentUsers = usersRef.current;
            const updatedUsers = currentUsers.map(u => {
                if (u.id === id) {
                    targetUser = {
                        ...u,
                        ...(updates.username && { username: updates.username }),
                        ...(updates.name && { name: updates.name }),
                        ...(updates.permissions && { permissions: updates.permissions }),
                        ...(updates.role && { role: updates.role }),
                        ...(updates.firebaseUid && { firebaseUid: updates.firebaseUid }),
                        ...(updates.isActive !== undefined && { isActive: updates.isActive }),
                        ...(updates.email && { email: updates.email }),
                    };
                    return targetUser;
                }
                return u;
            });

            usersRef.current = updatedUsers;
            setUsers(updatedUsers);
            await persistState({ users: updatedUsers });

            if (targetUser && targetUser.firebaseUid) {
                await userService.syncUserRole(targetUser.firebaseUid, targetUser.role, targetUser.permissions || [], targetUser.isActive, targetUser.email || '');
            }

            addLog('تحديث مستخدم', `تم تحديث بيانات المستخدم: ${targetUser?.name || id}`, 'settings');
        } finally {
            userSaveLockRef.current = false;

            if (pendingUserUpdateRef.current) {
                const pending = pendingUserUpdateRef.current;
                pendingUserUpdateRef.current = null;
                console.log('🔄 [AUTH] Processing queued user update');
                await updateUser(pending.id, pending.updates);
            }
        }
        return true;
    };

    return {
        users, setUsers, currentUser, setCurrentUser, isAuthLoading,
        login, logout, changePassword, addUser, deleteUser, toggleUserStatus, updateUser
    };
};
