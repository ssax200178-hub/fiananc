import { useState } from 'react';
import { Branch, ExchangeRates, DevFeedbackSettings, FeatureFlags, OperationalSheet, LiquidityMapping, LoanRequest, Employee, FinancialTip, TipType, Deduction, SystemBalance, AccountMapping, SyncMetadata } from '../../AppContext';
import { settingsService } from '../services/settingsService';
import { generateId } from '../../utils';
import { confirmDialog } from '../../utils/confirm';

export const useSettings = (currentUser: any, addLog: any, persistState: any, saveDataToFirebase: any) => {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({} as ExchangeRates);
    const [devFeedbackSettings, setDevFeedbackSettings] = useState<DevFeedbackSettings>({} as DevFeedbackSettings);
    const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({});

    const [operationalSheets, setOperationalSheets] = useState<OperationalSheet[]>([]);
    const [liquidityMappings, setLiquidityMappings] = useState<LiquidityMapping[]>([]);

    const [financialTips, setFinancialTips] = useState<FinancialTip[]>([]);
    const [loanRequests, setLoanRequests] = useState<LoanRequest[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [deductions, setDeductions] = useState<Deduction[]>([]);

    // System Balances (أرصدة النظام الأساسي)
    const [systemBalances, setSystemBalances] = useState<SystemBalance[]>([]);
    const [accountMappings, setAccountMappings] = useState<AccountMapping[]>([]);
    const [syncMetadata, setSyncMetadata] = useState<SyncMetadata | null>(null);

    // Branches
    const addBranch = async (data: Omit<Branch, 'id' | 'createdAt'>) => {
        const id = generateId();
        const newBranch: Branch = { ...data, id, createdAt: new Date().toISOString() };
        try {
            await settingsService.addBranch(newBranch);
            addLog('إضافة فرع', `تم إضافة فرع جديد: ${data.name}`, 'settings');
        } catch (e: any) { alert(`❌ فشل إضافة الفرع: ${e.message}`); }
    };
    const updateBranch = async (id: string, updates: Partial<Branch>) => {
        try {
            await settingsService.updateBranch(id, updates);
            const branch = branches.find(b => b.id === id);
            addLog('تحديث فرع', `تم تحديث بيانات الفرع: ${branch?.name || id}`, 'settings');
        } catch (e: any) { alert(`❌ فشل تحديث الفرع: ${e.message}`); }
    };
    const deleteBranch = async (id: string) => {
        const branch = branches.find(b => b.id === id);
        if (!(await confirmDialog(`تأكيد حذف الفرع "${branch?.name}"؟`, { type: 'danger' }))) return;
        try {
            await settingsService.deleteBranch(id);
            addLog('حذف فرع', `تم حذف الفرع: ${branch?.name || id}`, 'settings');
        } catch (e: any) { alert(`❌ فشل حذف الفرع: ${e.message}`); }
    };

    // Exchange Rates
    const getExchangeRateHistory = () => settingsService.getExchangeRateHistory();
    const updateExchangeRates = async (newRates: Partial<ExchangeRates>) => {
        const historyId = generateId();
        const updated: ExchangeRates = {
            ...exchangeRates,
            ...newRates,
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser?.name || currentUser?.username || ''
        };
        try {
            await settingsService.updateExchangeRates(updated, historyId);
            setExchangeRates(updated);
            addLog('تحديث أسعار الصرف', `SAR→ر.ق: ${updated.SAR_TO_OLD_RIAL} | SAR→ر.ج: ${updated.SAR_TO_NEW_RIAL}`, 'settings');
        } catch (e: any) { alert(`❌ فشل تحديث أسعار الصرف: ${e.message}`); }
    };

    // Settings & Feedback
    const updateDevFeedbackSettings = async (settings: Partial<DevFeedbackSettings>) => {
        try {
            const fullSettings = { ...settings, updatedAt: new Date().toISOString(), updatedBy: currentUser?.name || 'Unknown' } as DevFeedbackSettings;
            await settingsService.updateDevFeedbackSettings(fullSettings);
            addLog('تحديث إعدادات الملاحظات', 'تم تحديث إعدادات ملاحظات المطورين', 'settings');
        } catch (e) { console.error(e); }
    };
    const updateFeatureFlags = async (flags: Partial<FeatureFlags>) => {
        // Optimistic update: reflect immediately in UI
        setFeatureFlags(prev => ({ ...prev, ...flags }));
        try {
            await settingsService.updateFeatureFlags(flags);
            addLog('تحديث الميزات التجريبية', 'تم تحديث إعدادات الميزات التجريبية', 'settings');
        } catch (e) {
            // Revert on failure
            console.error(e);
            setFeatureFlags(prev => {
                const reverted = { ...prev };
                for (const key of Object.keys(flags)) {
                    reverted[key] = !flags[key];
                }
                return reverted;
            });
            alert('❌ فشل تحديث الميزات التجريبية');
        }
    };

    // Operational Sheets
    const createOperationalSheet = async (name: string, columns: string[]): Promise<string> => {
        try {
            const id = generateId();
            const newSheet: OperationalSheet = { id, name, date: new Date().toLocaleDateString('ar-SA'), createdBy: currentUser?.name || 'Unknown', rows: [], columns, createdAt: new Date().toISOString() };
            await settingsService.createOperationalSheet(newSheet);
            addLog('إنشاء كشف عمليات', `تم إنشاء كشف جديد: ${name}`, 'general');
            return id;
        } catch (e: any) { alert(`❌ فشل إنشاء الكشف: ${e.message}`); return ''; }
    };
    const updateSheetRow = async (sheetId: string, restaurantId: string, field: string, value: any) => {
        try {
            const sheet = operationalSheets.find(s => s.id === sheetId);
            if (!sheet) return;

            const updatedRows = [...sheet.rows];
            const rowIndex = updatedRows.findIndex(r => r.restaurantId === restaurantId);

            if (rowIndex >= 0) {
                updatedRows[rowIndex] = { ...updatedRows[rowIndex], data: { ...updatedRows[rowIndex].data, [field]: value } };
            } else {
                updatedRows.push({ restaurantId, restaurantName: 'Unknown', branch: 'Unknown', data: { [field]: value } });
            }

            await settingsService.updateSheetRow(sheetId, updatedRows);
            addLog('تحديث سطر في كشف', `تم تحديث بيانات المطعم في الكشف: ${sheetId}`, 'general');
        } catch (e: any) { alert(`❌ فشل تحديث البيانات: ${e.message}`); }
    };
    const deleteOperationalSheet = async (id: string) => {
        if (!(await confirmDialog('تأكيد حذف كشف العمليات؟', { type: 'danger' }))) return;
        try {
            await settingsService.deleteOperationalSheet(id);
            addLog('حذف كشف عمليات', `تم حذف الكشف: ${id}`, 'general');
        } catch (e: any) { alert(`❌ فشل حذف الكشف: ${e.message}`); }
    };

    // Liquidity Mappings
    const saveLiquidityMapping = async (mapping: LiquidityMapping) => {
        await settingsService.saveLiquidityMapping(mapping);
        addLog('تحديث مخطط السيولة', `تم تحديث المخطط: ${mapping.publicName}`, 'settings');
    };
    const deleteLiquidityMapping = async (id: string) => {
        await settingsService.deleteLiquidityMapping(id);
        addLog('حذف مخطط السيولة', `تم حذف المخطط: ${id}`, 'settings');
    };

    // Loans
    const addLoanRequest = async (request: Omit<LoanRequest, 'id' | 'createdAt'>) => {
        const id = generateId();
        const newRequest: LoanRequest = {
            ...request,
            id,
            isApproved: false,
            isRejected: false, // Added initialization
            createdAt: new Date().toISOString()
        };
        await settingsService.addLoanRequest(newRequest);
        addLog('إضافة طلب سلفة', `تم إضافة طلب سلفة جديد: ${id}`, 'funds');
    };
    const updateLoanRequest = async (id: string, updates: Partial<LoanRequest>) => {
        setLoanRequests(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
        await settingsService.updateLoanRequest(id, updates);
        const req = loanRequests.find(r => r.id === id);
        addLog('تحديث طلب سلفة', `تم تحديث طلب السلفة للموظف: ${req?.employeeName || id}`, 'funds');
    };
    const deleteLoanRequest = async (id: string) => {
        if (!(await confirmDialog('تأكيد حذف طلب السلفة هذا؟', { type: 'danger' }))) return;
        const originalLoanRequests = [...loanRequests];
        setLoanRequests(prev => prev.filter(l => l.id !== id));
        try {
            await settingsService.deleteLoanRequest(id);
            addLog('حذف طلب سلفة', `تم حذف طلب السلفة`, 'funds');
        } catch (e: any) {
            setLoanRequests(originalLoanRequests);
        }
    };
    const approveLoanRequest = async (id: string) => {
        if (!(await confirmDialog('تأكيد اعتماد طلب السلفة هذا؟'))) return;
        const updates = { isApproved: true, approvedAt: new Date().toISOString(), approvedByName: currentUser?.name || 'غير معروف' };
        setLoanRequests(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
        await settingsService.updateLoanRequest(id, updates);
        addLog('اعتماد طلب سلفة', `تم اعتماد طلب السلفة`, 'funds');
    };
    const rejectLoanRequest = async (id: string, reason?: string) => {
        if (!(await confirmDialog('تأكيد رفض طلب السلفة هذا؟', { type: 'warning' }))) return;
        const updates = {
            isRejected: true,
            isApproved: false,
            rejectedAt: new Date().toISOString(),
            rejectedByName: currentUser?.name || 'غير معروف',
            rejectionReason: reason || ''
        };
        setLoanRequests(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
        await settingsService.updateLoanRequest(id, updates);
        addLog('رفض طلب سلفة', `تم رفض طلب السلفة: ${reason || ''}`, 'funds');
    };

    // Employees
    const addEmployee = async (data: Omit<Employee, 'id' | 'createdAt' | 'isActive'>) => {
        const id = generateId();
        const newEmployee: Employee = { ...data, id, isActive: true, createdAt: new Date().toISOString() };
        await settingsService.addEmployee(newEmployee);
        addLog('إضافة موظف', `تم إضافة موظف جديد: ${data.name}`, 'users');
    };
    const updateEmployee = async (id: string, data: Partial<Employee>) => {
        await settingsService.updateEmployee(id, data);
        addLog('تحديث موظف', `تم تحديث بيانات الموظف: ${id}`, 'users');
        return true;
    };
    const deleteEmployee = async (id: string) => {
        if (!(await confirmDialog('تأكيد حذف بيانات هذا الموظف؟', { type: 'danger' }))) return;
        const originalEmployees = [...employees];
        setEmployees(prev => prev.filter(e => e.id !== id));
        try {
            await settingsService.deleteEmployee(id);
            addLog('حذف موظف', `تم حذف بيانات الموظف ID: ${id}`, 'users');
        } catch (e: any) {
            setEmployees(originalEmployees);
        }
    };

    // Deductions
    const addDeduction = async (data: Omit<Deduction, 'id' | 'createdAt' | 'createdBy'>) => {
        const id = generateId();
        const newDeduction: Deduction = {
            ...data,
            id,
            createdAt: new Date().toISOString(),
            createdBy: currentUser?.id || 'unknown'
        };
        await settingsService.addDeduction(newDeduction);
        addLog('إضافة خصم', `تم إضافة خصم للموظف: ${data.employeeName}`, 'users');
        return id;
    };
    const updateDeduction = async (id: string, updates: Partial<Deduction>) => {
        await settingsService.updateDeduction(id, updates);
        addLog('تحديث خصم', `تم تحديث بيانات الخصم: ${id}`, 'users');
    };
    const deleteDeduction = async (id: string) => {
        if (!(await confirmDialog('تأكيد حذف هذا الخصم؟', { type: 'danger' }))) return;
        try {
            await settingsService.deleteDeduction(id);
            addLog('حذف خصم', `تم حذف الخصم: ${id}`, 'users');
        } catch (e: any) { alert(`❌ فشل الحذف: ${e.message}`); }
    };
    const exemptDeduction = async (id: string, reason: string) => {
        if (!(await confirmDialog('تأكيد الإعفاء من هذه الغرامة؟'))) return;
        const updates = {
            isExempted: true,
            amount: 0,
            exemptionReason: reason,
            exemptedAt: new Date().toISOString(),
            exemptedByName: currentUser?.name || 'غير معروف'
        };
        try {
            await settingsService.updateDeduction(id, updates);
            addLog('إعفاء من غرامة', `تم الإعفاء من الغرامة لسبب: ${reason}`, 'users');
        } catch (e: any) { alert(`❌ فشل الإعفاء: ${e.message}`); }
    };

    // Financial Tips
    const addFinancialTip = async (text: string, type: TipType, icon: string) => {
        const newTip: FinancialTip = { id: generateId(), text, type, icon, isActive: true, createdAt: new Date().toISOString() };
        const newTips = [...financialTips, newTip];
        setFinancialTips(newTips);
        await saveDataToFirebase({ financialTips: newTips });
        addLog('إضافة توجيه مالي', 'تم إضافة رسالة توجيه جديدة', 'tips');
    };
    const updateFinancialTip = async (id: string, updates: Partial<FinancialTip>) => {
        const newTips = financialTips.map(t => t.id === id ? { ...t, ...updates } : t);
        setFinancialTips(newTips);
        await saveDataToFirebase({ financialTips: newTips });
    };
    const deleteFinancialTip = async (id: string) => {
        const newTips = financialTips.filter(t => t.id !== id);
        setFinancialTips(newTips);
        await saveDataToFirebase({ financialTips: newTips });
        addLog('حذف توجيه مالي', 'تم حذف التوجيه', 'tips');
    };

    // Account Mappings (ربط حسابات النظام الأساسي)
    const saveAccountMapping = async (mapping: AccountMapping) => {
        try {
            await settingsService.saveAccountMapping(mapping);
            addLog('تحديث ربط حساب', `تم ربط حساب المطابقة بالرقم: ${mapping.systemAccountNumber}`, 'settings');
        } catch (e: any) { alert(`❌ فشل حفظ الربط: ${e.message}`); }
    };
    const deleteAccountMapping = async (id: string) => {
        try {
            await settingsService.deleteAccountMapping(id);
            addLog('حذف ربط حساب', `تم حذف ربط الحساب: ${id}`, 'settings');
        } catch (e: any) { alert(`❌ فشل الحذف: ${e.message}`); }
    };

    return {
        branches, setBranches,
        exchangeRates, setExchangeRates,
        devFeedbackSettings, setDevFeedbackSettings,
        featureFlags, setFeatureFlags,
        operationalSheets, setOperationalSheets,
        liquidityMappings, setLiquidityMappings,
        financialTips, setFinancialTips,
        loanRequests, setLoanRequests,
        employees, setEmployees,
        deductions, setDeductions,
        systemBalances, setSystemBalances,
        accountMappings, setAccountMappings,
        syncMetadata, setSyncMetadata,

        addBranch, updateBranch, deleteBranch,
        getExchangeRateHistory, updateExchangeRates,
        updateDevFeedbackSettings, updateFeatureFlags,
        createOperationalSheet, updateSheetRow, deleteOperationalSheet,
        saveLiquidityMapping, deleteLiquidityMapping,
        addLoanRequest, updateLoanRequest, deleteLoanRequest, approveLoanRequest, rejectLoanRequest,
        addEmployee, updateEmployee, deleteEmployee,
        addDeduction, updateDeduction, deleteDeduction, exemptDeduction,
        addFinancialTip, updateFinancialTip, deleteFinancialTip,
        saveAccountMapping, deleteAccountMapping
    };
};
