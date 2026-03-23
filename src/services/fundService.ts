import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { FundSnapshot, FundLineItem, BankDefinition } from '../../AppContext';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';

export const fundService = {
    saveFundSnapshot: async (snapshot: FundSnapshot) => {
        // CRITICAL: Strip undefined values - Firestore rejects them
        const cleanData: Record<string, any> = { updatedAt: new Date().toISOString() };
        for (const [key, value] of Object.entries(snapshot)) {
            if (value !== undefined) {
                cleanData[key] = value;
            }
        }
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'fund_snapshots', snapshot.id), cleanData, { merge: true });
    },

    deleteFundSnapshot: async (id: string) => {
        await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'fund_snapshots', id));
    },

    deleteSnapshotForEdit: async (id: string) => {
        await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'fund_snapshots', id));
    },

    saveFundDraft: async (items: FundLineItem[], currentUser: any) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'fund_draft', 'current'), {
            items,
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: currentUser?.name || currentUser?.username || 'Unknown'
        });
    },

    clearFundDraft: async () => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'fund_draft', 'current'), {
            items: [],
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: 'System'
        });
    }
};
