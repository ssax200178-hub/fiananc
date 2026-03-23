import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, setDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { User } from '../../AppContext';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';

const generateId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// --- Types ---

export interface ChartAccount {
    id: string;
    accountNumber: string;
    accountName: string;
    accountType: 'main' | 'sub';
    parentAccountNumber?: string; // رقم الحساب الرئيسي إذا كان تحليلي
    parentAccountName?: string; // اسم الحساب الرئيسي (الأب)
    category?: string; // تصنيف: مطاعم، موظفين، موصلين، عملاء، أصول، عام
    accountNature?: string; // النوع: أصول، خصوم، إيرادات، مصروفات
    currency?: string; // العملة: ريال قديم، ريال جديد
    mainCategory?: string; // البند الرئيسي
    branch?: string; // الفرع: عدن، المكلا، إلخ
    isActive: boolean;
    createdAt: string;
    createdBy: string;
}

export type JournalEntryType = 'simple' | 'compound' | 'batch';

export interface JournalEntryLine {
    id: string;
    entryNumber: number; // رقم القيد (تسلسلي في الجماعي)
    accountNumber: string; // رقم الحساب الرئيسي
    subAccountNumber: string; // رقم الحساب التحليلي
    debitAmount: number; // مدين
    creditAmount: number; // دائن
    currencyId: number; // رقم العملة
    description: string; // البيان
    costCenter: string; // مركز التكلفة
    reference: string; // رقم المرجع
}

export interface JournalEntry {
    id: string;
    entryType: JournalEntryType;
    title: string; // عنوان/وصف القيد
    lines: JournalEntryLine[];
    totalDebit: number;
    totalCredit: number;
    currencyId: number;
    status: 'draft' | 'completed';
    createdBy: string;
    createdByName: string;
    createdAt: string;
    updatedAt?: string;
}

// --- Hook ---

export const useJournalEntries = (currentUser: User | null) => {
    const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
    const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);

    // Subscribe to chart of accounts
    useEffect(() => {
        if (!currentUser) {
            setChartAccounts([]);
            return;
        }

        const ref = collection(db, ROOT_COLLECTION, DATA_PATH, 'chart_of_accounts');
        const unsubscribe = onSnapshot(ref, (snapshot) => {
            const items: ChartAccount[] = [];
            snapshot.forEach((docSnap) => {
                items.push({ ...docSnap.data(), id: docSnap.id } as ChartAccount);
            });
            items.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber, 'ar'));
            setChartAccounts(items);
        }, (error) => {
            console.error('[useJournalEntries] Error fetching chart accounts:', error);
        });

        return () => unsubscribe();
    }, [currentUser]);

    // Subscribe to journal entries
    useEffect(() => {
        if (!currentUser) {
            setJournalEntries([]);
            return;
        }

        const ref = collection(db, ROOT_COLLECTION, DATA_PATH, 'journal_entries');
        const unsubscribe = onSnapshot(ref, (snapshot) => {
            const items: JournalEntry[] = [];
            snapshot.forEach((docSnap) => {
                items.push({ ...docSnap.data(), id: docSnap.id } as JournalEntry);
            });
            items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            setJournalEntries(items);
        }, (error) => {
            console.error('[useJournalEntries] Error fetching journal entries:', error);
        });

        return () => unsubscribe();
    }, [currentUser]);

    // ============ CHART OF ACCOUNTS CRUD ============

    const addChartAccount = useCallback(async (data: Omit<ChartAccount, 'id' | 'createdAt' | 'createdBy' | 'isActive'>): Promise<string> => {
        if (!currentUser) throw new Error('يجب تسجيل الدخول');
        const id = generateId();
        const account: ChartAccount = {
            ...data,
            id,
            isActive: true,
            createdAt: new Date().toISOString(),
            createdBy: currentUser.id,
        };
        const docRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'chart_of_accounts', id);
        await setDoc(docRef, account);
        return id;
    }, [currentUser]);

    const addChartAccountsBulk = useCallback(async (accounts: Omit<ChartAccount, 'id' | 'createdAt' | 'createdBy' | 'isActive'>[]): Promise<number> => {
        if (!currentUser) throw new Error('يجب تسجيل الدخول');
        const BATCH_SIZE = 450; // Firestore max = 500, use 450 for safety
        let count = 0;
        for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
            const chunk = accounts.slice(i, i + BATCH_SIZE);
            const batch = writeBatch(db);
            for (const data of chunk) {
                const id = generateId();
                const account: ChartAccount = {
                    ...data,
                    id,
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    createdBy: currentUser.id,
                };
                const docRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'chart_of_accounts', id);
                batch.set(docRef, account);
                count++;
            }
            await batch.commit();
        }
        return count;
    }, [currentUser]);

    const updateChartAccount = useCallback(async (id: string, updates: Partial<ChartAccount>): Promise<void> => {
        const docRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'chart_of_accounts', id);
        await updateDoc(docRef, { ...updates });
    }, []);

    const deleteChartAccount = useCallback(async (id: string): Promise<void> => {
        const docRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'chart_of_accounts', id);
        await deleteDoc(docRef);
    }, []);

    // ============ JOURNAL ENTRIES CRUD ============

    const addJournalEntry = useCallback(async (data: Omit<JournalEntry, 'id' | 'createdAt' | 'createdBy' | 'createdByName'>): Promise<string> => {
        if (!currentUser) throw new Error('يجب تسجيل الدخول');
        const id = generateId();
        const entry: JournalEntry = {
            ...data,
            id,
            createdBy: currentUser.id,
            createdByName: currentUser.name || currentUser.username,
            createdAt: new Date().toISOString(),
        };
        const docRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'journal_entries', id);
        await setDoc(docRef, entry);
        return id;
    }, [currentUser]);

    const deleteJournalEntry = useCallback(async (id: string): Promise<void> => {
        const docRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'journal_entries', id);
        await deleteDoc(docRef);
    }, []);

    return {
        chartAccounts,
        setChartAccounts,
        journalEntries,
        setJournalEntries,
        addChartAccount,
        addChartAccountsBulk,
        updateChartAccount,
        deleteChartAccount,
        addJournalEntry,
        deleteJournalEntry,
    };
};
