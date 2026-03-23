import { useState } from 'react';
import { PaymentAccount } from '../../AppContext';
import { paymentAccountService } from '../services/paymentAccountService';
import { generateId } from '../../utils';
import { confirmDialog } from '../../utils/confirm';

export const usePaymentAccounts = (
    currentUser: any,
    addLog: any
) => {
    const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);

    const addPaymentAccount = async (data: Omit<PaymentAccount, 'id' | 'createdAt' | 'isActive'>) => {
        const id = generateId();
        const newAccount: PaymentAccount = {
            ...data,
            id,
            isActive: true,
            createdAt: new Date().toISOString()
        };

        try {
            await paymentAccountService.addPaymentAccount(newAccount);
            addLog('إضافة حساب سداد', `تم إضافة حساب جديد: ${data.accountName}`, 'settings');
            return id;
        } catch (e: any) {
            console.error("Error adding payment account:", e);
            alert(`❌ فشل إضافة الحساب: ${e.message}`);
            throw e;
        }
    };

    const updatePaymentAccount = async (id: string, updates: Partial<PaymentAccount>) => {
        try {
            await paymentAccountService.updatePaymentAccount(id, updates);
            addLog('تحديث حساب سداد', `تم تحديث بيانات الحساب: ${id}`, 'settings');
        } catch (e: any) {
            console.error("Error updating payment account:", e);
            alert(`❌ فشل تحديث بيانات الحساب: ${e.message}`);
            throw e;
        }
    };

    const deletePaymentAccount = async (id: string) => {
        if (!currentUser || currentUser.role !== 'super_admin') {
            alert('❌ صلاحية محدودة!');
            return;
        }
        if (!(await confirmDialog('سيتم حذف الحساب نهائياً. هل أنت متأكد؟', { type: 'danger' }))) return;

        try {
            await paymentAccountService.deletePaymentAccount(id);
            addLog('حذف حساب سداد', `تم حذف الحساب (${id})`, 'settings');
        } catch (e: any) {
            console.error("Error deleting payment account:", e);
            alert(`❌ فشل الحذف: ${e.message}`);
            throw e;
        }
    };

    return {
        paymentAccounts,
        setPaymentAccounts,
        addPaymentAccount,
        updatePaymentAccount,
        deletePaymentAccount
    };
};
