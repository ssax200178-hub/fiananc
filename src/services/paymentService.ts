import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { InvoiceBatch, Invoice, PhonePayment } from '../../AppContext';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';

export const paymentService = {
    // Archive Operations
    // ... future implementations for downloading archives

    // Invoice / Payments
    addInvoiceBatch: async (batch: InvoiceBatch) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'invoice_batches', batch.id), batch);
    },

    deleteInvoiceBatch: async (id: string) => {
        await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'invoice_batches', id));
    }
};
