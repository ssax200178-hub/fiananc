import React from 'react';
import type { AppCurrency } from '../../AppContext';
import { confirmDialog } from '../../utils/confirm';

interface CurrenciesTabProps {
    customCurrencies: AppCurrency[];
    handleEditCurrency: (currency: AppCurrency) => void;
    deleteCustomCurrency: (id: number) => Promise<void>;
    setCurrencyForm: (form: Partial<AppCurrency>) => void;
    setIsEditingCurrency: (is: boolean) => void;
    setCurrencyFormOpen: (open: boolean) => void;
    canManageRates: boolean;
}

const CurrenciesTab: React.FC<CurrenciesTabProps> = ({
    customCurrencies,
    handleEditCurrency,
    deleteCustomCurrency,
    setCurrencyForm,
    setIsEditingCurrency,
    setCurrencyFormOpen,
    canManageRates
}) => {
    return (
        <div className="space-y-6 max-w-4xl">
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-900/20 dark:to-emerald-900/20 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                            <span className="material-symbols-outlined text-teal-600 dark:text-teal-400">payments</span>
                            العملات المخصصة
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">إضافة وإدارة العملات المستخدمة في النظام</p>
                    </div>
                    {canManageRates && (
                        <button
                            onClick={() => {
                                setCurrencyForm({ name: '', currencyId: 0, defaultAccountId: '', isActive: true });
                                setIsEditingCurrency(false);
                                setCurrencyFormOpen(true);
                            }}
                            className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-teal-500/20"
                        >
                            <span className="material-symbols-outlined">add</span>
                            إضافة عملة
                        </button>
                    )}
                </div>

                <div className="p-6">
                    {customCurrencies.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <span className="material-symbols-outlined text-5xl mb-3 opacity-30 block">currency_exchange</span>
                            <p className="font-bold">لا يوجد عملات مخصصة حتى الآن.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {customCurrencies.map(currency => (
                                <div key={currency.id} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between group hover:border-teal-300 dark:hover:border-teal-700 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="size-12 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-teal-600 dark:text-teal-400">monetization_on</span>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900 dark:text-white">{currency.name}</h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs px-2 py-0.5 bg-white dark:bg-slate-700 rounded-lg text-slate-500 font-mono">ID: {currency.currencyId}</span>
                                                {!currency.isActive && (
                                                    <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg font-bold">معطلة</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {canManageRates && (
                                        <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEditCurrency(currency)}
                                                className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-all"
                                                title="تعديل"
                                            >
                                                <span className="material-symbols-outlined">edit</span>
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    const confirmed = await confirmDialog(`حذف عملة "${currency.name}"؟`, { type: 'danger', confirmText: 'حذف', cancelText: 'إلغاء' });
                                                    if (confirmed) {
                                                        await deleteCustomCurrency(currency.id!);
                                                    }
                                                }}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                                title="حذف"
                                            >
                                                <span className="material-symbols-outlined">delete</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CurrenciesTab;
