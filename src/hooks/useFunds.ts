import { useState, useRef } from 'react';
import { BankDefinition, FundsCurrency, FundSnapshot, FundLineItem } from '../../AppContext';
import { fundService } from '../services/fundService';
import { generateId } from '../../utils';
import { confirmDialog } from '../../utils/confirm';

export const useFunds = (
    currentUser: any,
    addLog: any,
    persistState: any,
    saveDataToFirebase: any
) => {
    const [bankDefinitions, setBankDefinitions] = useState<BankDefinition[]>([]);
    const [fundSnapshots, setFundSnapshots] = useState<FundSnapshot[]>([]);
    const [fundDraftItems, setFundDraftItems] = useState<FundLineItem[]>([]);

    const draftSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

    const addBankDefinition = (name: string, currency: FundsCurrency, accountNumber?: string, customCurrencyName?: string) => {
        const newDef: BankDefinition = {
            id: generateId(),
            name,
            currency,
            accountNumber,
            customCurrencyName,
            isActive: true
        };
        const newBanks = [...bankDefinitions, newDef];
        setBankDefinitions(newBanks);
        persistState({ bankDefinitions: newBanks });
        addLog('إضافة تعريف بنك', `تم إضافة تعريف بنك جديد: ${name}`, 'funds');
    };

    const toggleBankDefinition = (id: string) => {
        const bankToToggle = bankDefinitions.find(def => def.id === id);
        if (!bankToToggle) return;
        const newStatus = !bankToToggle.isActive;
        const newBanks = bankDefinitions.map(def => def.id === id ? { ...def, isActive: newStatus } : def);
        setBankDefinitions(newBanks);
        saveDataToFirebase({ bankDefinitions: newBanks });
        addLog('تغيير حالة تعريف بنك', `تم ${newStatus ? 'تنشيط' : 'تعطيل'} تعريف البنك: ${bankToToggle.name}`, 'funds');
    };

    const updateBankDefinition = (id: string, updates: Partial<BankDefinition>) => {
        const bankToUpdate = bankDefinitions.find(def => def.id === id);
        const newBanks = bankDefinitions.map(def => def.id === id ? { ...def, ...updates } : def);
        setBankDefinitions(newBanks);
        saveDataToFirebase({ bankDefinitions: newBanks });
        addLog('تحديث تعريف بنك', `تم تحديث تعريف البنك: ${bankToUpdate?.name || id}`, 'funds');
    };

    const deleteBankDefinition = async (id: string) => {
        if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'super_admin')) {
            alert('❌ صلاحية محدودة!');
            return;
        }
        if (!(await confirmDialog('تأكيد الحذف؟', { type: 'danger' }))) return;
        const bankToDelete = bankDefinitions.find(def => def.id === id);
        const newBanks = bankDefinitions.filter(def => def.id !== id);
        setBankDefinitions(newBanks);
        persistState({ bankDefinitions: newBanks });
        addLog('حذف تعريف بنك', `تم حذف تعريف البنك: ${bankToDelete?.name || id}`, 'funds');
    };

    const saveFundSnapshot = async (snapshot: FundSnapshot) => {
        try {
            await fundService.saveFundSnapshot(snapshot);
            addLog('حفظ لقطة رصيد', `تم حفظ لقطة رصيد جديدة بتاريخ: ${snapshot.date}`, 'funds');
        } catch (e: any) {
            console.error("Error saving snapshot:", e);
            alert(`❌ فشل حفظ لقطة الرصيد: ${e.message}`);
        }
    };

    const deleteFundSnapshot = async (id: string) => {
        if (!currentUser || currentUser.role !== 'super_admin') {
            alert('❌ صلاحية محدودة!');
            return;
        }
        if (!(await confirmDialog('تأكيد الحذف؟', { type: 'danger' }))) return;
        try {
            await fundService.deleteFundSnapshot(id);
            addLog('حذف لقطة رصيد', `تم حذف لقطة رصيد: ${id}`, 'funds');
        } catch (e: any) {
            console.error("Error deleting snapshot:", e);
            alert(`❌ فشل حذف لقطة الرصيد: ${e.message}`);
        }
    };

    const editFundSnapshot = (id: string): FundLineItem[] => {
        if (!currentUser || currentUser.role !== 'super_admin') {
            alert('❌ صلاحية محدودة!');
            return [];
        }
        const snap = fundSnapshots.find((s: FundSnapshot) => s.id === id);
        if (!snap) return [];

        const allItems = [
            ...snap.oldRiyalItems,
            ...snap.newRiyalItems,
            ...(snap.sarItems || []),
            ...(snap.blueUsdItems || []),
            ...(snap.whiteUsdItems || []),
            ...(snap.customCurrencyItems || [])
        ];

        fundService.deleteSnapshotForEdit(id)
            .then(() => addLog('تعديل لقطة رصيد', `بدء تعديل لقطة رصيد: ${id}`, 'funds'))
            .catch(e => console.error("Error deleting snapshot for edit:", e));

        return allItems;
    };

    const saveFundDraft = (items: FundLineItem[]) => {
        if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = setTimeout(async () => {
            try {
                await fundService.saveFundDraft(items, currentUser);
                console.log('✅ [FIREBASE] Fund draft saved to Firestore');
                addLog('حفظ مسودة رصيد', 'تم حفظ مسودة الرصيد الحالية', 'funds');
            } catch (e) {
                console.error("Error saving draft:", e);
            }
        }, 500);
    };

    const clearFundDraft = async () => {
        try {
            await fundService.clearFundDraft();
            addLog('مسح مسودة رصيد', 'تم مسح مسودة الرصيد الحالية', 'funds');
        } catch (e) {
            console.error("Error clearing draft:", e);
        }
    };

    return {
        bankDefinitions, setBankDefinitions,
        fundSnapshots, setFundSnapshots,
        fundDraftItems, setFundDraftItems,
        addBankDefinition, toggleBankDefinition, updateBankDefinition, deleteBankDefinition,
        saveFundSnapshot, deleteFundSnapshot, editFundSnapshot,
        saveFundDraft, clearFundDraft
    };
};
