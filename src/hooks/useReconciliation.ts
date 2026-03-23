import { useState } from 'react';
import { ReconData } from '../../AppContext';
import { reconciliationService } from '../services/reconciliationService';
import { generateId } from '../../utils';

export const useReconciliation = (
    currentUser: any,
    addLog: any,
    navigate: any
) => {
    const defaultData: ReconData = {
        id: '',
        restaurantName: '',
        count: 0,
        restaurantRaw: '',
        companyRaw: '',
        date: new Date().toLocaleDateString('ar-SA'),
        totalAmount: 0,
        calculatedVariance: 0,
        status: 'draft',
        manualLinks: {}
    };

    const [currentData, setCurrentData] = useState<ReconData>({ ...defaultData, id: generateId() });
    const [history, setHistory] = useState<ReconData[]>([]);

    const updateCurrentData = (data: Partial<ReconData>) => {
        setCurrentData(prev => ({ ...prev, ...data }));
    };

    const resetCurrentData = () => {
        setCurrentData({ ...defaultData, id: generateId() });
    };

    const addToHistory = async (data: ReconData) => {
        try {
            const record = {
                ...data,
                createdByUid: currentUser?.firebaseUid || currentUser?.id || 'unknown',
                updatedAt: new Date().toISOString()
            };
            await reconciliationService.addToHistory(record as ReconData);
            addLog('إضافة تسوية', `تم إضافة تسوية جديدة: ${data.id}`, 'recon');
        } catch (e: any) {
            console.error("Error saving history:", e);
            alert(`❌ فشل حفظ التسوية: ${e.message}`);
        }
    };

    const updateHistoryItem = async (id: string, data: Partial<ReconData>) => {
        try {
            await reconciliationService.updateHistoryItem(id, data);
            addLog('تحديث تسوية', `تم تحديث التسوية: ${id}`, 'recon');
        } catch (e: any) {
            console.error("Error updating history:", e);
            alert(`❌ فشل تحديث التسوية: ${e.message}`);
        }
    };

    const loadFromHistory = (id: string) => {
        const item = history.find(i => i.id === id);
        if (item) {
            setCurrentData(item);
            navigate('/analysis');
            addLog('تحميل تسوية', `تم تحميل التسوية: ${id} من السجل`, 'recon');
        }
    };

    return {
        currentData, setCurrentData, history, setHistory,
        updateCurrentData, resetCurrentData, addToHistory, updateHistoryItem, loadFromHistory
    };
};
