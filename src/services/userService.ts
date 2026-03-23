import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as fSignOut, updatePassword, getAuth } from 'firebase/auth';
import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { auth, db, firebaseConfig } from '../../firebase';
import { User, UserRole, UserPermission, ALL_NEW_PERMISSIONS } from '../../AppContext';
import { generateId, cleanPayload } from '../../utils';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';

export const userService = {
    login: async (username: string, password: string): Promise<{ success: boolean; email: string }> => {
        let email = username;
        if (!username.includes('@')) {
            if (username.toLowerCase() === 'abdr200178') email = 'abdr200178@financial.com';
            else if (username.toLowerCase() === 'admin') email = 'admin@financial.com';
            else email = `${username}@financial.com`;
        }

        console.log("🔐 [AUTH] Attempting sign in with:", email);
        await signInWithEmailAndPassword(auth, email, password);
        return { success: true, email };
    },

    logout: async () => {
        await fSignOut(auth);
    },

    changePassword: async (newPassword: string) => {
        if (!auth.currentUser) {
            throw new Error('يجب تسجيل الدخول أولاً لتغيير كلمة المرور');
        }
        await updatePassword(auth.currentUser, newPassword);
    },

    syncUserRole: async (firebaseUid: string, role: string, permissions: string[], isActive: boolean, email: string) => {
        try {
            const data = cleanPayload({
                role,
                permissions,
                isActive,
                email,
                updatedAt: new Date().toISOString()
            });
            await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'user_roles', firebaseUid), data);
            console.log(`✅[FIREBASE] Role synced for UID: ${firebaseUid}`);
        } catch (e) {
            console.error("❌ [FIREBASE] Role sync failed:", e);
        }
    },

    createUserInFirebase: async (username: string, password: string): Promise<{ uid: string, email: string }> => {
        const secondaryAppName = `Secondary-${Date.now()}`;
        const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
        const secondaryAuth = getAuth(secondaryApp);

        try {
            const cleanUsername = username.trim().toLowerCase();
            const usernameRegex = /^[a-z0-9._-]+$/;
            if (!cleanUsername.includes('@') && !usernameRegex.test(cleanUsername)) {
                throw new Error("يجب أن يكون 'اسم المستخدم' باللغة الإنجليزية وبدون مسافات (مثال: ali_2024)");
            }

            const userEmail = cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@financial.com`;
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, userEmail, password);
            const firebaseUid = userCredential.user.uid;

            await fSignOut(secondaryAuth);
            await deleteApp(secondaryApp);

            return { uid: firebaseUid, email: userEmail };
        } catch (error: any) {
            try { await deleteApp(secondaryApp); } catch (e) { }
            throw error;
        }
    },

    deleteUserRoleCache: async (firebaseUid: string) => {
        if (firebaseUid) {
            await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'user_roles', firebaseUid));
        }
    }
};
