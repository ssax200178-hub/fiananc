import { doc, setDoc, deleteDoc, updateDoc, writeBatch, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { Restaurant, TransferAccount, TransferRequest } from '../../AppContext';
import { generateId } from '../../utils';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';

export const restaurantService = {
    getCurrencyByBranch: (branch: string, newRiyalBranches: string[]): 'old_riyal' | 'new_riyal' => {
        if (newRiyalBranches.some(b => branch.includes(b))) return 'new_riyal';
        return 'old_riyal';
    },

    getFilteredRestaurants: async (filters: any = {}): Promise<Restaurant[]> => {
        const snap = await getDocs(collection(db, ROOT_COLLECTION, DATA_PATH, 'restaurants'));
        return snap.docs.map(d => d.data() as Restaurant);
    },

    addRestaurant: async (restaurant: Restaurant) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'restaurants', restaurant.id), restaurant);
    },

    updateRestaurant: async (id: string, updates: Partial<Restaurant>) => {
        const finalUpdates = { ...updates };
        await updateDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'restaurants', id), {
            ...finalUpdates,
            updatedAt: new Date().toISOString()
        });
    },

    mergeDuplicateGroups: async (group: Restaurant[]) => {
        const [target, ...toDelete] = group;

        const allAccountsMap = new Map<string, TransferAccount>();
        group.forEach((r: Restaurant) => {
            r.transferAccounts?.forEach(acc => {
                const key = `${acc.type}-${acc.accountNumber}`;
                if (!allAccountsMap.has(key) || acc.isPrimary) {
                    allAccountsMap.set(key, acc);
                }
            });
        });

        const mergedAccounts = Array.from(allAccountsMap.values());

        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'restaurants', target.id), {
            transferAccounts: mergedAccounts
        }, { merge: true });

        for (const d of toDelete) {
            await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'restaurants', d.id));
        }
    },

    deleteRestaurantWithLinkedData: async (id: string) => {
        const batch = writeBatch(db);

        // 1. Delete Restaurant Doc
        batch.delete(doc(db, ROOT_COLLECTION, DATA_PATH, 'restaurants', id));

        // 2. Delete linked History Records
        const historySnap = await getDocs(query(collection(db, ROOT_COLLECTION, DATA_PATH, 'history_records'), where('restaurantId', '==', id)));
        historySnap.forEach(doc => batch.delete(doc.ref));

        // 3. Delete linked Transfer Requests
        const transferSnap = await getDocs(query(collection(db, ROOT_COLLECTION, DATA_PATH, 'transfer_requests'), where('restaurantId', '==', id)));
        transferSnap.forEach(doc => batch.delete(doc.ref));

        await batch.commit();
    },

    addTransferRequest: async (request: TransferRequest) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'transfer_requests', request.id), request);
    },

    updateTransferRequest: async (id: string, updates: Partial<TransferRequest>) => {
        await updateDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'transfer_requests', id), {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    },

    deleteTransferRequest: async (id: string) => {
        await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'transfer_requests', id));
    }
};
