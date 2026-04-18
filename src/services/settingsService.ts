import { doc, setDoc, updateDoc, deleteDoc, getDocs, query, collection, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { FinancialTip, Branch, ExchangeRates, ExchangeRateHistory, DevFeedbackSettings, FeatureFlags, LiquidityMapping, OperationalSheet, LoanRequest, Employee, Deduction, AppCurrency } from '../../AppContext';
import { generateId } from '../../utils';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';

export const settingsService = {

    // Branches
    addBranch: async (branch: Branch) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'branches', branch.id), branch);
    },
    updateBranch: async (id: string, updates: Partial<Branch>) => {
        await updateDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'branches', id), updates as any);
    },
    deleteBranch: async (id: string) => {
        await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'branches', id));
    },

    // Exchange Rates
    getExchangeRateHistory: async (): Promise<ExchangeRateHistory[]> => {
        const q = query(collection(db, ROOT_COLLECTION, DATA_PATH, 'exchange_rate_history'), orderBy('updatedAt', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as ExchangeRateHistory);
    },
    updateExchangeRates: async (updated: ExchangeRates, historyId: string) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'exchange_rates', 'current'), updated);
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'exchange_rate_history', historyId), {
            id: historyId,
            SAR_TO_OLD_RIAL: updated.SAR_TO_OLD_RIAL,
            SAR_TO_NEW_RIAL: updated.SAR_TO_NEW_RIAL,
            updatedAt: updated.updatedAt,
            updatedBy: updated.updatedBy
        });
    },

    // Developer Feedback & Feature Flags
    updateDevFeedbackSettings: async (fullSettings: DevFeedbackSettings) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'settings', 'developerFeedback'), fullSettings, { merge: true });
    },
    updateFeatureFlags: async (flags: Partial<FeatureFlags>) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'settings', 'feature_flags'), flags, { merge: true });
    },

    // Custom Currencies
    saveCustomCurrency: async (currency: AppCurrency) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'custom_currencies', currency.id), currency);
    },
    deleteCustomCurrency: async (id: string) => {
        await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'custom_currencies', id));
    },

    // Operational Sheets
    createOperationalSheet: async (sheet: OperationalSheet) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'operational_sheets', sheet.id), sheet);
    },
    updateSheetRow: async (sheetId: string, updatedRows: any[]) => {
        await updateDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'operational_sheets', sheetId), {
            rows: updatedRows,
            updatedAt: new Date().toISOString()
        });
    },
    deleteOperationalSheet: async (id: string) => {
        await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'operational_sheets', id));
    },

    // Liquidity Mappings
    saveLiquidityMapping: async (mapping: LiquidityMapping) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'liquidity_mappings', mapping.id), mapping);
    },
    deleteLiquidityMapping: async (id: string) => {
        await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'liquidity_mappings', id));
    },

    // Loans
    addLoanRequest: async (request: LoanRequest) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'loan_requests', request.id), request);
    },
    updateLoanRequest: async (id: string, updates: Partial<LoanRequest>) => {
        await updateDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'loan_requests', id), {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    },
    deleteLoanRequest: async (id: string) => {
        await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'loan_requests', id));
    },

    // Employees
    addEmployee: async (employee: Employee) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'employees', employee.id), employee);
    },
    updateEmployee: async (id: string, updates: Partial<Employee>) => {
        await updateDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'employees', id), {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    },
    deleteEmployee: async (id: string) => {
        await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'employees', id));
    },

    // Deductions
    addDeduction: async (deduction: Deduction) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'deductions', deduction.id), deduction);
    },
    updateDeduction: async (id: string, updates: Partial<Deduction>) => {
        await updateDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'deductions', id), {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    },
    deleteDeduction: async (id: string) => {
        await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'deductions', id));
    },

    // Account Mappings (ربط حسابات النظام الأساسي)
    saveAccountMapping: async (mapping: any) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'account_mappings', mapping.id), mapping);
    },
    deleteAccountMapping: async (id: string) => {
        await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'account_mappings', id));
    },

    // System Balances (حفظ الأرصدة المستخرجة)
    saveSystemBalance: async (balance: any) => {
        const docId = `${balance.type}_${balance.accountNumber}_${balance.currency}`.replace(/[\/ ]/g, '_');
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'system_balances', docId), { ...balance, id: docId });
    },
    saveSystemBalancesBatch: async (balances: any[]) => {
        const { writeBatch } = await import('firebase/firestore');
        let batch = writeBatch(db);
        let count = 0;
        for (const balance of balances) {
            const docId = `${balance.type}_${balance.accountNumber}_${balance.currency}`.replace(/[\/ ]/g, '_');
            const ref = doc(db, ROOT_COLLECTION, DATA_PATH, 'system_balances', docId);
            batch.set(ref, { ...balance, id: docId });
            count++;
            if (count % 400 === 0) {
                await batch.commit();
                batch = writeBatch(db);
            }
        }
        if (count % 400 !== 0) {
            await batch.commit();
        }
        return count;
    },
    updateSyncMetadata: async (metadata: any) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'sync_metadata', 'tawseel_sync'), metadata);
    },

    // Automation Configuration
    saveAutomationConfig: async (config: any) => {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'settings', 'automation_config'), config, { merge: true });
    }
};
