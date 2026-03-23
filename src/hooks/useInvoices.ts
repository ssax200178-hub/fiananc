import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, setDoc, updateDoc, deleteDoc, doc, writeBatch, getDocs, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { InvoiceBatch, InvoiceBatchItem, User } from '../../AppContext';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';

const generateId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const useInvoices = (currentUser: User | null) => {
    const [invoiceBatches, setInvoiceBatches] = useState<InvoiceBatch[]>([]);
    const [invoiceBatchItems, setInvoiceBatchItems] = useState<InvoiceBatchItem[]>([]);
    const [allInvoiceBatchItems, setAllInvoiceBatchItems] = useState<InvoiceBatchItem[]>([]);
    const itemsUnsubRef = useRef<(() => void) | null>(null);

    // Subscribe to all batches
    useEffect(() => {
        if (!currentUser) {
            setInvoiceBatches([]);
            return;
        }

        const batchesRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'invoice_batches');

        const unsubscribeBatches = onSnapshot(batchesRef, (snapshot) => {
            const batchesData: InvoiceBatch[] = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                batchesData.push({
                    ...data,
                    id: docSnap.id,
                    createdAt: data.createdAt || new Date().toISOString(),
                    issueDate: data.issueDate || '',
                } as InvoiceBatch);
            });
            // Sort by createdAt descending
            batchesData.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            setInvoiceBatches(batchesData);
        }, (error) => {
            console.error("Error fetching invoice batches:", error);
        });

        const allItemsRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'invoice_batch_items');
        const unsubscribeAllItems = onSnapshot(allItemsRef, (snapshot) => {
            const items: InvoiceBatchItem[] = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                items.push({
                    ...data,
                    id: docSnap.id,
                } as InvoiceBatchItem);
            });
            setAllInvoiceBatchItems(items);
        }, (error) => {
            console.error("Error fetching all batch items:", error);
        });

        return () => {
            unsubscribeBatches();
            unsubscribeAllItems();
        };
    }, [currentUser]);

    // Load batch items for a specific batch
    const loadBatchItems = useCallback((batchId: string) => {
        // Cleanup previous subscription
        if (itemsUnsubRef.current) {
            itemsUnsubRef.current();
            itemsUnsubRef.current = null;
        }

        if (!batchId) {
            setInvoiceBatchItems([]);
            return;
        }

        const q = query(
            collection(db, ROOT_COLLECTION, DATA_PATH, 'invoice_batch_items'),
            where('batchId', '==', batchId)
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const items: InvoiceBatchItem[] = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                items.push({
                    ...data,
                    id: docSnap.id,
                } as InvoiceBatchItem);
            });
            // Sort by rangeFrom
            items.sort((a, b) => (a.rangeFrom || 0) - (b.rangeFrom || 0));
            setInvoiceBatchItems(items);
        }, (error) => {
            console.error("Error fetching batch items:", error);
        });

        itemsUnsubRef.current = unsub;
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (itemsUnsubRef.current) itemsUnsubRef.current();
        };
    }, []);

    // ============ BATCH CRUD ============

    const addInvoiceBatch = async (batch: Omit<InvoiceBatch, 'id' | 'createdAt' | 'createdBy'>): Promise<string> => {
        if (!currentUser) throw new Error("يجب تسجيل الدخول");

        try {
            const id = generateId();
            const batchData = {
                ...batch,
                id,
                createdAt: new Date().toISOString(),
                createdBy: currentUser.id
            };

            // Use setDoc with the custom ID as doc ID so we can update later
            const docRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'invoice_batches', id);
            await setDoc(docRef, batchData);
            console.log('[useInvoices] Batch created:', id);
            return id;
        } catch (error) {
            console.error("[useInvoices] Error adding invoice batch:", error);
            throw error;
        }
    };

    const updateInvoiceBatch = async (id: string, updates: Partial<InvoiceBatch>): Promise<void> => {
        try {
            console.log('[useInvoices] Updating batch:', id, updates);
            const docRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'invoice_batches', id);
            await updateDoc(docRef, {
                ...updates,
                updatedAt: new Date().toISOString(),
                updatedBy: currentUser?.id
            });
            console.log('[useInvoices] Batch updated successfully:', id);
        } catch (error) {
            console.error("[useInvoices] Error updating invoice batch:", error);
            throw error;
        }
    };

    const deleteInvoiceBatch = async (id: string): Promise<void> => {
        try {
            // Delete all batch items associated with this batch
            const itemsQuery = query(
                collection(db, ROOT_COLLECTION, DATA_PATH, 'invoice_batch_items'),
                where('batchId', '==', id)
            );
            const itemsSnap = await getDocs(itemsQuery);

            const batch = writeBatch(db);
            itemsSnap.docs.forEach((itemDoc) => {
                batch.delete(itemDoc.ref);
            });

            // Also delete legacy subcollection invoices if any
            try {
                const invoicesRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'invoice_batches', id, 'invoices');
                const legacySnap = await getDocs(invoicesRef);
                legacySnap.docs.forEach((invoiceDoc) => {
                    batch.delete(invoiceDoc.ref);
                });
            } catch (e) { /* ignore if doesn't exist */ }

            // Delete the main batch document
            const mainDocRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'invoice_batches', id);
            batch.delete(mainDocRef);

            await batch.commit();
            console.log('[useInvoices] Batch deleted:', id);
        } catch (error) {
            console.error("[useInvoices] Error deleting invoice batch:", error);
            throw error;
        }
    };

    // ============ BATCH ITEMS CRUD ============

    const addInvoiceBatchItem = async (item: Omit<InvoiceBatchItem, 'id' | 'createdBy'>): Promise<string> => {
        if (!currentUser) throw new Error("يجب تسجيل الدخول");

        try {
            const id = generateId();
            const itemData = {
                ...item,
                id,
                createdBy: currentUser.id,
                updatedAt: new Date().toISOString()
            };

            // Use setDoc with the custom ID so we can reliably update
            const docRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'invoice_batch_items', id);
            await setDoc(docRef, itemData);
            console.log('[useInvoices] Item created:', id);
            return id;
        } catch (error) {
            console.error("[useInvoices] Error adding batch item:", error);
            throw error;
        }
    };

    const updateInvoiceBatchItem = async (id: string, updates: Partial<InvoiceBatchItem>): Promise<void> => {
        try {
            console.log('[useInvoices] Updating item:', id, updates);
            const docRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'invoice_batch_items', id);
            await updateDoc(docRef, {
                ...updates,
                updatedAt: new Date().toISOString()
            });
            console.log('[useInvoices] Item updated successfully:', id);
        } catch (error) {
            console.error("[useInvoices] Error updating batch item:", error);
            throw error;
        }
    };

    const deleteInvoiceBatchItem = async (id: string): Promise<void> => {
        try {
            const docRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'invoice_batch_items', id);
            await deleteDoc(docRef);
            console.log('[useInvoices] Item deleted:', id);
        } catch (error) {
            console.error("[useInvoices] Error deleting batch item:", error);
            throw error;
        }
    };

    return {
        invoiceBatches,
        addInvoiceBatch,
        updateInvoiceBatch,
        deleteInvoiceBatch,
        invoiceBatchItems,
        allInvoiceBatchItems,
        addInvoiceBatchItem,
        updateInvoiceBatchItem,
        deleteInvoiceBatchItem,
        loadBatchItems,
    };
};
