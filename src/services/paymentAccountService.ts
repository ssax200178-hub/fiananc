import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { PaymentAccount } from '../../AppContext';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';

export const paymentAccountService = {
    addPaymentAccount: async (account: PaymentAccount) => {
        try {
            await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'payment_accounts', account.id), account);
        } catch (e) {
            console.error("Error adding payment account:", e);
            throw e;
        }
    },
    updatePaymentAccount: async (id: string, updates: Partial<PaymentAccount>) => {
        try {
            await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'payment_accounts', id), updates, { merge: true });
        } catch (e) {
            console.error("Error updating payment account:", e);
            throw e;
        }
    },
    deletePaymentAccount: async (id: string) => {
        try {
            await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'payment_accounts', id));
        } catch (e) {
            console.error("Error deleting payment account:", e);
            throw e;
        }
    }
};
