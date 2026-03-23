import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ActivityLog } from '../../AppContext';
import { generateId, cleanPayload } from '../../utils';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';

export const appStateService = {
    saveDataToFirebase: async (data: any) => {
        try {
            const sanitizedData = cleanPayload(data);
            return await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH), sanitizedData, { merge: true });
        } catch (e) {
            console.error("❌ [FIREBASE] Save failed:", e);
            throw e;
        }
    },

    addLog: async (action: string, details: string, category: ActivityLog['category'], currentUser: any) => {
        try {
            const log: ActivityLog = {
                id: generateId(),
                userId: currentUser?.id || 'system',
                userName: currentUser?.name || 'النظام',
                action,
                details,
                timestamp: new Date().toISOString(),
                category
            };
            const sanitizedLog = cleanPayload(log);
            await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'activity_logs', log.id), sanitizedLog);
        } catch (e) {
            console.error("Error adding log:", e);
        }
    }
};
