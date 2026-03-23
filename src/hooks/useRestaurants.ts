import { useState } from 'react';
import { Restaurant, TransferRequest, TransferAccount } from '../../AppContext';
import { restaurantService } from '../services/restaurantService';
import { generateId } from '../../utils';
import { confirmDialog } from '../../utils/confirm';

export const useRestaurants = (
    currentUser: any,
    addLog: any,
    setIsLoading: any
) => {
    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
    const [transferRequests, setTransferRequests] = useState<TransferRequest[]>([]);

    const newRiyalBranches = [
        'صنعاء', 'اب', 'إب', 'ذمار', 'عمران', 'الحديدة', 'حجة', 'المحويت', 'صعدة', 'رداع', 'البيضاء', 'تعز - الحوبان'
    ];

    const getCurrencyByBranch = (branch?: string): 'old_riyal' | 'new_riyal' => {
        if (!branch) return 'old_riyal';
        return restaurantService.getCurrencyByBranch(branch, newRiyalBranches);
    };

    const addRestaurant = async (data: Omit<Restaurant, 'id' | 'createdAt' | 'isActive'>) => {
        const existing = restaurants.find(r => r.restaurantAccountNumber === data.restaurantAccountNumber);

        if (existing) {
            // Mark all existing accounts as non-primary
            const existingAccounts = existing.transferAccounts.map(a => ({ ...a, isPrimary: false }));
            const existingAccIds = new Set(existingAccounts.map(a => `${a.type}-${a.accountNumber}`));

            // Mark new accounts as primary (usually there's only one in this flow)
            const newAccounts = data.transferAccounts.map(a => ({
                ...a,
                isPrimary: true // The one being added now should be primary
            })).filter(a => !existingAccIds.has(`${a.type}-${a.accountNumber}`));

            if (newAccounts.length > 0) {
                const updatedAccounts = [...existingAccounts, ...newAccounts];
                await updateRestaurant(existing.id, {
                    transferAccounts: updatedAccounts,
                    ownerName: data.ownerName || existing.ownerName, // Prefer new data if provided
                    phone: data.phone || existing.phone,
                    currencyType: existing.currencyType || getCurrencyByBranch(existing.branch)
                });
                addLog('إضافة مطعم', `تم دمج حسابات تحويل جديدة وتحديث الأساسي للمطعم: ${existing.name}`, 'restaurant');
            } else {
                // If it's the exact same account, just ensure it's primary
                const updatedAccounts = existing.transferAccounts.map(a => {
                    const isTarget = data.transferAccounts.some(na => na.type === a.type && na.accountNumber === a.accountNumber);
                    return { ...a, isPrimary: isTarget ? true : false };
                });
                await updateRestaurant(existing.id, { transferAccounts: updatedAccounts });
            }
            return existing.id;
        }

        const id = generateId();
        const newRestaurant: Restaurant = {
            ...data,
            id,
            isActive: true,
            currencyType: data.currencyType || getCurrencyByBranch(data.branch),
            balance: data.balance || 0,
            createdAt: new Date().toISOString()
        };

        try {
            await restaurantService.addRestaurant(newRestaurant);
            addLog('إضافة مطعم', `تم إضافة مطعم جديد: ${data.name}`, 'restaurant');
            return id;
        } catch (e: any) {
            console.error("Error adding restaurant:", e);
            alert(`❌ فشل إضافة المطعم: ${e.message}`);
            return null;
        }
    };

    const updateRestaurant = async (id: string, updates: Partial<Restaurant>) => {
        try {
            const finalUpdates = { ...updates };
            if (updates.branch && !updates.currencyType) {
                finalUpdates.currencyType = getCurrencyByBranch(updates.branch);
            }

            await restaurantService.updateRestaurant(id, finalUpdates);
            addLog('تحديث مطعم', `تم تحديث بيانات المطعم: ${id}`, 'restaurant');
        } catch (e: any) {
            console.error("Error updating restaurant:", e);
            alert(`❌ فشل تحديث بيانات المطعم: ${e.message}`);
            throw e;
        }
    };

    const mergeRestaurants = async () => {
        const groups: Record<string, Restaurant[]> = {};
        restaurants.forEach((r: Restaurant) => {
            if (!groups[r.restaurantAccountNumber]) groups[r.restaurantAccountNumber] = [];
            groups[r.restaurantAccountNumber].push(r);
        });

        const duplicates = Object.values(groups).filter(g => g.length > 1);
        if (duplicates.length === 0) return;

        for (const group of duplicates) {
            await restaurantService.mergeDuplicateGroups(group);
        }

        addLog('دمج المطاعم', `تم دمج ${duplicates.length} مجموعة مطاعم مكررة`, 'restaurant');
    };

    const deleteRestaurant = async (id: string) => {
        if (!currentUser || currentUser.role !== 'super_admin') {
            alert('❌ صلاحية محدودة!');
            return;
        }
        if (!(await confirmDialog('سيتم حذف المطعم وجميع سجلات التسوية والتحويلات المرتبطة به نهائياً. هل أنت متأكد؟', { type: 'danger' }))) return;

        setIsLoading(true);
        try {
            await restaurantService.deleteRestaurantWithLinkedData(id);
            addLog('حذف مطعم', `تم حذف المطعم (${id}) والبيانات المرتبطة به`, 'restaurant');
        } catch (e: any) {
            console.error("Error deleting restaurant:", e);
            alert(`❌ فشل الحذف: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const addTransferRequest = async (request: Omit<TransferRequest, 'id' | 'createdAt'>) => {
        try {
            const id = generateId();
            const newRequest: TransferRequest = {
                ...request,
                id,
                createdAt: new Date().toISOString(),
                createdBy: currentUser?.id,
                createdByName: currentUser?.name
            };
            await restaurantService.addTransferRequest(newRequest);
            addLog('إضافة طلب تحويل', `طلب تحويل جديد للمطعم: ${id}`, 'restaurant');
        } catch (e: any) {
            console.error("Error adding transfer request:", e);
            alert(`❌ فشل إضافة طلب التحويل: ${e.message}`);
        }
    };

    const deleteTransferRequest = async (id: string) => {
        if (!(await confirmDialog('تأكيد حذف طلب التحويل؟', { type: 'danger' }))) return;
        try {
            await restaurantService.deleteTransferRequest(id);
            addLog('حذف طلب تحويل', `تم حذف طلب التحويل: ${id}`, 'restaurant');
        } catch (e: any) {
            alert(`❌ فشل حذف الطلب: ${e.message}`);
        }
    };

    const updateTransferRequest = async (id: string, updates: Partial<TransferRequest>) => {
        try {
            setTransferRequests(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
            await restaurantService.updateTransferRequest(id, updates);

            if (Object.keys(updates).length === 1 && 'isVerified' in updates) {
                const req = transferRequests.find(r => r.id === id);
                addLog(updates.isVerified ? 'تأكيد طلب تحويل' : 'إلغاء تأكيد طلب تحويل', `تم ${updates.isVerified ? 'تأكيد' : 'إلغاء تأكيد'} طلب التحويل: ${req?.restaurantName || id}`, 'restaurant');
            } else {
                addLog('تحديث طلب تحويل', `تم تحديث طلب التحويل: ${id}`, 'restaurant');
            }
        } catch (e: any) {
            alert(`❌ فشل تحديث طلب التحويل: ${e.message}`);
            throw e;
        }
    };

    const processTransferRequest = async (request: TransferRequest) => {
        if (!(await confirmDialog('تأكيد اعتماد وترحيل هذا الطلب؟'))) return;

        try {
            if (request.purpose === 'new_contract') {
                const newRest: Restaurant = {
                    id: generateId(),
                    name: request.restaurantName || request.name,
                    branch: request.branch,
                    restaurantAccountNumber: request.restaurantAccountNumber,
                    ownerName: request.ownerName,
                    phone: request.phone,
                    transferAccounts: [{
                        id: generateId(),
                        type: request.transferType,
                        accountNumber: request.transferAccountNumber,
                        beneficiaryName: request.transferBeneficiary,
                        isPrimary: true,
                        isActive: true,
                        uniqueCode: request.uniqueNumber,
                        approvalPeriod: request.approvalPeriod
                    }],
                    paymentPeriod: 'monthly',
                    currencyType: getCurrencyByBranch(request.branch),
                    classification: '',
                    clientType: '',
                    isActive: true,
                    createdAt: new Date().toISOString()
                };

                await addRestaurant(newRest);

            } else if (request.purpose === 'update_contact') {
                const existing = restaurants.find(r => r.restaurantAccountNumber === request.restaurantAccountNumber);
                if (existing) {
                    await updateRestaurant(existing.id, {
                        ownerName: request.ownerName,
                        phone: request.phone
                    });
                }
            } else if (request.purpose === 'update_transfer') {
                const existing = restaurants.find(r => r.restaurantAccountNumber === request.restaurantAccountNumber);
                if (existing) {
                    const newAccount: TransferAccount = {
                        id: generateId(),
                        type: request.transferType,
                        accountNumber: request.transferAccountNumber,
                        beneficiaryName: request.transferBeneficiary,
                        isPrimary: true,
                        isActive: true,
                        uniqueCode: request.uniqueNumber,
                        approvalPeriod: request.approvalPeriod
                    };
                    const updatedAccounts: any[] = existing.transferAccounts.map((a: any) => ({ ...a, isPrimary: false }));
                    updatedAccounts.push(newAccount);
                    await updateRestaurant(existing.id, { transferAccounts: updatedAccounts });
                }
            }

            // Instead of deleting, update status to completed and record processor
            await restaurantService.updateTransferRequest(request.id, {
                status: 'completed',
                processedBy: currentUser?.id,
                processedByName: currentUser?.name,
                processedAt: new Date().toISOString()
            });
            addLog('اعتماد طلب تحويل', `تم اعتماد طلب التحويل(${request.purpose}): ${request.restaurantName || request.name}`, 'restaurant');

        } catch (e) {
            console.error("Error processing transfer request:", e);
            alert('حدث خطأ أثناء معالجة الطلب.');
        }
    };

    const revertTransferRequest = async (id: string) => {
        if (!(await confirmDialog('هل أنت متأكد من وجود خطأ في البيانات وإعادة الطلب لقائمة الانتظار؟', { type: 'warning' }))) return;
        try {
            await restaurantService.updateTransferRequest(id, { status: 'pending', isVerified: false });
            addLog('إرجاع طلب تحويل', `تم إرجاع طلب التحويل (${id}) للتعديل بسبب خطأ`, 'restaurant');
        } catch (e: any) {
            alert(`❌ فشل إرجاع الطلب: ${e.message}`);
        }
    };

    return {
        restaurants, setRestaurants, transferRequests, setTransferRequests,
        getCurrencyByBranch, addRestaurant, updateRestaurant, mergeRestaurants, deleteRestaurant,
        addTransferRequest, deleteTransferRequest, updateTransferRequest, processTransferRequest, revertTransferRequest
    };
};
