import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { PhonePayment, User, BranchPhone, PhoneProvider } from '../../AppContext';
import { useSnackbar } from 'notistack';
import { appStateService } from '../services/appStateService';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';

export const usePhonePayments = (currentUser: User | null) => {
    const [phonePayments, setPhonePayments] = useState<PhonePayment[]>([]);
    const [branchPhones, setBranchPhones] = useState<BranchPhone[]>([]);
    const [phoneProviders, setPhoneProviders] = useState<PhoneProvider[]>([]);
    const { enqueueSnackbar } = useSnackbar();

    // Subscribe to Phone Payments
    useEffect(() => {
        if (!currentUser) {
            setPhonePayments([]);
            return;
        }
        const q = query(collection(db, ROOT_COLLECTION, DATA_PATH, 'phone_payments'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPhonePayments(snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt || new Date().toISOString()
            } as PhonePayment)));
        }, (error) => {
            console.error("Error fetching phone payments:", error);
        });
        return () => unsubscribe();
    }, [currentUser]);

    // Subscribe to Branch Phones
    useEffect(() => {
        if (!currentUser) {
            setBranchPhones([]);
            return;
        }
        const q = query(collection(db, ROOT_COLLECTION, DATA_PATH, 'branch_phones'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setBranchPhones(snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt || new Date().toISOString()
            } as BranchPhone)));
        }, (error) => {
            console.error("Error fetching branch phones:", error);
        });
        return () => unsubscribe();
    }, [currentUser]);

    // Subscribe to Phone Providers
    useEffect(() => {
        if (!currentUser) {
            setPhoneProviders([]);
            return;
        }
        const q = query(collection(db, ROOT_COLLECTION, DATA_PATH, 'phone_providers'), orderBy('name', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPhoneProviders(snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as PhoneProvider)));
        }, (error) => {
            console.error("Error fetching phone providers:", error);
        });
        return () => unsubscribe();
    }, [currentUser]);

    // --- Phone Payments ---
    const addPhonePayment = async (payment: Omit<PhonePayment, 'id' | 'createdAt' | 'paidBy'>): Promise<string> => {
        if (!currentUser) throw new Error("يجب تسجيل الدخول لإضافة سداد");
        try {
            const docRef = await addDoc(collection(db, ROOT_COLLECTION, DATA_PATH, 'phone_payments'), {
                ...payment,
                paidBy: currentUser.id,
                createdAt: serverTimestamp()
            });
            enqueueSnackbar('تم إضافة السداد بنجاح', { variant: 'success' });
            return docRef.id;
        } catch (error) {
            console.error("Error adding phone payment:", error);
            enqueueSnackbar('حدث خطأ أثناء إضافة السداد', { variant: 'error' });
            throw error;
        }
    };

    const updatePhonePayment = async (id: string, updates: Partial<PhonePayment>): Promise<void> => {
        try {
            await updateDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'phone_payments', id), {
                ...updates,
                updatedAt: serverTimestamp(),
                updatedBy: currentUser?.id
            });
            enqueueSnackbar('تم تحديث السداد بنجاح', { variant: 'success' });
        } catch (error) {
            console.error("Error updating phone payment:", error);
            enqueueSnackbar('حدث خطأ أثناء تحديث السداد', { variant: 'error' });
            throw error;
        }
    };

    const deletePhonePayment = async (id: string): Promise<void> => {
        try {
            // Log before deletion
            const payment = phonePayments.find(p => p.id === id);
            await appStateService.addLog(
                'حذف سداد هاتف',
                `تم حذف سداد هاتف بمبلغ ${payment?.amount} ${payment?.currency} للرقم ${payment?.phoneNumber}`,
                'funds',
                currentUser
            );
            await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'phone_payments', id));
            enqueueSnackbar('تم حذف السداد بنجاح', { variant: 'success' });
        } catch (error: any) {
            console.error("Error deleting phone payment:", error);
            alert(`حدث خطأ أثناء حذف السداد: ${error?.message || JSON.stringify(error)}`);
            enqueueSnackbar('حدث خطأ أثناء حذف السداد', { variant: 'error' });
            throw error;
        }
    };

    // --- Branch Phones ---
    const addBranchPhone = async (phone: Omit<BranchPhone, 'id' | 'createdAt'>): Promise<string> => {
        try {
            const docRef = await addDoc(collection(db, ROOT_COLLECTION, DATA_PATH, 'branch_phones'), {
                ...phone,
                createdAt: serverTimestamp()
            });
            enqueueSnackbar('تم إضافة الرقم بنجاح', { variant: 'success' });
            return docRef.id;
        } catch (error) {
            console.error("Error adding branch phone:", error);
            enqueueSnackbar('حدث خطأ أثناء إضافة الرقم', { variant: 'error' });
            throw error;
        }
    };

    const updateBranchPhone = async (id: string, updates: Partial<BranchPhone>): Promise<void> => {
        try {
            await updateDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'branch_phones', id), {
                ...updates,
                updatedAt: serverTimestamp()
            });
            enqueueSnackbar('تم تحديث الرقم بنجاح', { variant: 'success' });
        } catch (error) {
            console.error("Error updating branch phone:", error);
            enqueueSnackbar('حدث خطأ أثناء تحديث الرقم', { variant: 'error' });
            throw error;
        }
    };

    const deleteBranchPhone = async (id: string): Promise<void> => {
        try {
            // Log before deletion
            const phone = branchPhones.find(p => p.id === id);
            await appStateService.addLog(
                'حذف رقم هاتف فرع',
                `تم حذف رقم هاتف فرع: ${phone?.phoneNumber} (${phone?.systemAccountName})`,
                'users', // Closest category for branch configuration
                currentUser
            );
            await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'branch_phones', id));
            enqueueSnackbar('تم حذف الرقم بنجاح', { variant: 'success' });
        } catch (error) {
            console.error("Error deleting branch phone:", error);
            enqueueSnackbar('حدث خطأ أثناء حذف الرقم', { variant: 'error' });
            throw error;
        }
    };

    // --- Phone Providers ---
    const addPhoneProvider = async (provider: Omit<PhoneProvider, 'id'>): Promise<string> => {
        console.log("Attempting to add phone provider:", provider);
        try {
            const docRef = await addDoc(collection(db, ROOT_COLLECTION, DATA_PATH, 'phone_providers'), {
                ...provider,
                createdAt: serverTimestamp(),
                createdBy: currentUser?.id
            });
            console.log("Phone provider added successfully with ID:", docRef.id);
            enqueueSnackbar('تم إضافة المزود بنجاح', { variant: 'success' });
            return docRef.id;
        } catch (error) {
            console.error("Error adding phone provider:", error);
            enqueueSnackbar('حدث خطأ أثناء إضافة المزود', { variant: 'error' });
            throw error;
        }
    };

    const updatePhoneProvider = async (id: string, updates: Partial<PhoneProvider>): Promise<void> => {
        console.log("Attempting to update phone provider:", id, updates);
        try {
            await updateDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'phone_providers', id), {
                ...updates,
                updatedAt: serverTimestamp(),
                updatedBy: currentUser?.id
            });
            console.log("Phone provider updated successfully");
            enqueueSnackbar('تم تحديث المزود بنجاح', { variant: 'success' });
        } catch (error) {
            console.error("Error updating phone provider:", error);
            enqueueSnackbar('حدث خطأ أثناء تحديث المزود', { variant: 'error' });
            throw error;
        }
    };

    const deletePhoneProvider = async (id: string): Promise<void> => {
        try {
            // Log before deletion
            const provider = phoneProviders.find(p => p.id === id);
            await appStateService.addLog(
                'حذف مزود خدمة',
                `تم حذف مزود خدمة: ${provider?.name}`,
                'settings',
                currentUser
            );
            await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'phone_providers', id));
            enqueueSnackbar('تم حذف المزود بنجاح', { variant: 'success' });
        } catch (error) {
            console.error("Error deleting phone provider:", error);
            enqueueSnackbar('حدث خطأ أثناء حذف المزود', { variant: 'error' });
            throw error;
        }
    };

    return {
        phonePayments,
        branchPhones,
        phoneProviders,
        addPhonePayment,
        updatePhonePayment,
        deletePhonePayment,
        addBranchPhone,
        updateBranchPhone,
        deleteBranchPhone,
        addPhoneProvider,
        updatePhoneProvider,
        deletePhoneProvider
    };
};
