import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ReconData } from '../../AppContext';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';

/**
 * Recursively removes undefined values from an object to prevent
 * Firestore setDoc() errors ("Unsupported field value: undefined").
 */
const cleanForFirestore = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.map(cleanForFirestore);
    if (typeof obj === 'object' && !(obj instanceof Date)) {
        const cleaned: any = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined) {
                cleaned[key] = cleanForFirestore(value);
            }
        }
        return cleaned;
    }
    return obj;
};

export const reconciliationService = {
    addToHistory: async (data: ReconData) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'history_records', data.id), cleanForFirestore(data));
    },

    updateHistoryItem: async (id: string, data: Partial<ReconData>) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'history_records', id), cleanForFirestore({
            ...data,
            updatedAt: new Date().toISOString()
        }), { merge: true });
    }
};
