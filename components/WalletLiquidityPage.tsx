import React, { useMemo } from 'react';
import { useAppContext } from '../AppContext';
import { safeCompare } from '../utils';

const WalletLiquidityPage: React.FC = () => {
    const {
        restaurants,
        fundSnapshots,
        bankDefinitions,
        liquidityMappings,
        saveLiquidityMapping,
        deleteLiquidityMapping
    } = useAppContext();

    const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
    const [editingMapping, setEditingMapping] = React.useState<any>(null);
    const [selectedWallet, setSelectedWallet] = React.useState<any>(null);

    // Help to normalize names for strict matching (Fallback if no manual mapping exists)
    const normalizeName = (name: string): string => {
        if (!name) return 'غير محدد';
        let n = name.trim();
        n = n.replace(/^(محفظة|بنك|البنك|المحفظة|حساب|الـ|ال)\s*/g, '');
        n = n.replace(/\s*(محفظة|بنك|البنك|المحفظة|حساب|ريال جديد|ريال قديم|جديد|قديم|شلن|ريال)$/g, '');
        return n.replace(/[()\-\/_.[\]]/g, '').replace(/\s+/g, '').trim() || 'غير محدد';
    };

    // Helper to find mapping for a given original name or bank identifier
    const getMappingForAccount = (originalType: string) => {
        return liquidityMappings.find(m => m.restaurantAccountTypes.includes(originalType));
    };

    const getMappingForBank = (bankId: string) => {
        return liquidityMappings.find(m => m.bankDefIds.includes(bankId));
    };

    // 1. Aggregate Owed to Restaurants by Mapping or Normalized Wallet Type
    const debtsByWallet = useMemo(() => {
        const aggregation: Record<string, { wallet: string; label: string; currency: 'old_riyal' | 'new_riyal'; totalOwed: number; restaurantCount: number; restaurants: any[] }> = {};

        restaurants.forEach(r => {
            const balance = r.balance || 0;
            if (balance <= 0) return;

            const primaryAccount = r.transferAccounts?.find(a => a.isPrimary) || r.transferAccounts?.[0];
            const originalType = (primaryAccount?.type || 'غير محدد').trim();
            const currency = r.currencyType;

            const mapping = getMappingForAccount(originalType);
            const walletName = mapping ? mapping.publicName : normalizeName(originalType);

            const key = `${walletName}_${currency}`;
            if (!aggregation[key]) {
                aggregation[key] = {
                    wallet: walletName,
                    label: walletName,
                    currency: currency,
                    totalOwed: 0,
                    restaurantCount: 0,
                    restaurants: []
                };
            }

            aggregation[key].totalOwed += balance;
            aggregation[key].restaurantCount += 1;
            aggregation[key].restaurants.push({
                id: r.id,
                name: r.name,
                branch: r.branch,
                balance: balance,
                accountNumber: primaryAccount?.accountNumber || '---',
                beneficiaryName: primaryAccount?.beneficiaryName || '---'
            });
        });

        const sorted = Object.values(aggregation).sort((a, b) => safeCompare(a.label, b.label));
        // Sort restaurants within each wallet by balance descending
        sorted.forEach(item => {
            item.restaurants.sort((a, b) => b.balance - a.balance);
        });
        return sorted;
    }, [restaurants, liquidityMappings]);

    // 2. Get Latest Fund Balance
    const latestSnapshot = useMemo(() => {
        if (!fundSnapshots || fundSnapshots.length === 0) return null;
        const sorted = [...fundSnapshots].sort((a, b) => safeCompare(b.fullTimestamp || b.id, a.fullTimestamp || a.id));
        return sorted.find(s => s.status === 'completed' || s.status === 'approved') || sorted[0];
    }, [fundSnapshots]);

    const availabilityMap = useMemo(() => {
        const map: Record<string, number> = {};
        if (!latestSnapshot) return map;

        const allItems = [
            ...(latestSnapshot.oldRiyalItems || []),
            ...(latestSnapshot.newRiyalItems || []),
        ];

        allItems.forEach(item => {
            const bankDef = bankDefinitions.find(b => b.id === item.bankDefId);
            if (!bankDef) return;

            const mapping = getMappingForBank(bankDef.id);
            const walletName = mapping ? mapping.publicName : normalizeName(bankDef.name);
            const currency = bankDef.currency as 'old_riyal' | 'new_riyal';

            const key = `${walletName}_${currency}`;
            map[key] = (map[key] || 0) + (item.bankBalance || 0);
        });

        return map;
    }, [latestSnapshot, bankDefinitions, liquidityMappings]);

    // Cleanup labels for display
    const getDisplayLabel = (name: string) => {
        return name.replace(/^(محفظة|بنك|البنك|المحفظة|حساب|الـ|ال)\s*/g, '').trim();
    };

    // 3. Merge Data for Display
    const liquidityData = useMemo(() => {
        return debtsByWallet.map(debt => {
            const key = `${debt.wallet}_${debt.currency}`;
            const available = availabilityMap[key] || 0;
            const variance = available - debt.totalOwed;
            const coveragePercent = debt.totalOwed > 0 ? (available / debt.totalOwed) * 100 : 100;

            return {
                ...debt,
                label: getDisplayLabel(debt.label),
                available,
                variance,
                coveragePercent
            };
        });
    }, [debtsByWallet, availabilityMap]);

    const newRiyalItems = liquidityData.filter(d => d.currency === 'new_riyal');
    const oldRiyalItems = liquidityData.filter(d => d.currency === 'old_riyal');

    const totalOwedNew = newRiyalItems.reduce((sum, d) => sum + d.totalOwed, 0);
    const totalAvailableNew = newRiyalItems.reduce((sum, d) => sum + d.available, 0);
    const totalOwedOld = oldRiyalItems.reduce((sum, d) => sum + d.totalOwed, 0);
    const totalAvailableOld = oldRiyalItems.reduce((sum, d) => sum + d.available, 0);

    const handleSaveMapping = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const publicName = (form.elements.namedItem('publicName') as HTMLInputElement).value;
        const restaurantTypes = (form.elements.namedItem('restaurantTypes') as HTMLSelectElement).selectedOptions;
        const bankDefIds = (form.elements.namedItem('bankDefIds') as HTMLSelectElement).selectedOptions;

        const mapping = {
            id: editingMapping?.id || safeCompare('', '') ? editingMapping.id : Date.now().toString(),
            publicName,
            restaurantAccountTypes: Array.from(restaurantTypes).map(o => o.value),
            bankDefIds: Array.from(bankDefIds).map(o => o.value)
        };

        await saveLiquidityMapping(mapping);
        setEditingMapping(null);
    };

    // List of unique account types from restaurants for selection
    const allAccountTypes = Array.from(new Set(restaurants.flatMap(r => (r.transferAccounts || []).map(a => a.type)))).sort();

    const renderLiquidityTable = (items: any[], title: string, colorClass: string) => (
        <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden mb-8">
            <div className={`px-8 py-6 border-b border-slate-100 dark:border-slate-700 ${colorClass} bg-opacity-10`}>
                <h3 className={`text-xl font-black ${colorClass.replace('bg-', 'text-').replace('/10', '')}`}>{title}</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
                            <th className="px-6 py-5 text-sm font-black text-slate-500">المحفظة / البنك</th>
                            <th className="px-6 py-5 text-sm font-black text-slate-500 text-center">عدد المطاعم</th>
                            <th className="px-6 py-5 text-sm font-black text-slate-500">المستحقات (Owed)</th>
                            <th className="px-6 py-5 text-sm font-black text-slate-500">الرصيد المتوفر (Available)</th>
                            <th className="px-6 py-5 text-sm font-black text-slate-500">التغطية</th>
                            <th className="px-6 py-5 text-sm font-black text-slate-500">الفائض / العجز</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                        {items.length > 0 ? items.map((item, idx) => (
                            <tr
                                key={idx}
                                onClick={() => setSelectedWallet(item)}
                                className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-all cursor-pointer group"
                            >
                                <td className="px-6 py-5 font-black text-slate-800 dark:text-white group-hover:text-blue-600 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="size-10 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center font-bold">
                                            {item.wallet.charAt(0)}
                                        </div>
                                        {item.wallet}
                                        <span className="material-symbols-outlined text-xs opacity-0 group-hover:opacity-100 transition-opacity text-slate-400">visibility</span>
                                    </div>
                                </td>
                                <td className="px-6 py-5 text-center font-bold text-slate-600 dark:text-slate-400">
                                    {item.restaurantCount}
                                </td>
                                <td className="px-6 py-5 font-black text-red-600">
                                    {item.totalOwed.toLocaleString()}
                                </td>
                                <td className="px-6 py-5 font-black text-green-600">
                                    {item.available.toLocaleString()}
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex flex-col gap-1 w-32">
                                        <div className="flex justify-between text-[10px] font-bold">
                                            <span>{item.coveragePercent >= 100 ? '100% (فائض)' : `${item.coveragePercent.toFixed(0)}%`}</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-1000 ${item.coveragePercent >= 100 ? 'bg-green-500' :
                                                    item.coveragePercent >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                                    }`}
                                                style={{ width: `${Math.min(item.coveragePercent, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </td>
                                <td className={`px-6 py-5 font-black ${item.variance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                    <div className="flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">
                                            {item.variance >= 0 ? 'trending_up' : 'trending_down'}
                                        </span>
                                        {item.variance.toLocaleString()}
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={6} className="px-6 py-20 text-center text-slate-400 font-bold">
                                    لا توجد بيانات لهذه العملة
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20 RTL" dir="rtl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-blue-600">account_balance_wallet</span>
                        مراجعة سيولة المحافظ
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 font-bold">
                        مقارنة مستحقات المطاعم بالرصيد الفعلي المتوفر في المحافظ (آخر مطابقة: {latestSnapshot?.date || 'لا يوجد'})
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition font-black text-sm"
                    >
                        <span className="material-symbols-outlined">settings</span>
                        إعدادات الربط
                    </button>
                </div>
            </div>

            {/* Global Summary Cards - 4 Key Metrics */}
            <h2 className="text-2xl font-black text-slate-800 dark:text-slate-200 mt-8 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-500">space_dashboard</span>
                ملخص السيولة والمستحقات
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border-t-4 border-t-emerald-500 border border-slate-100 dark:border-slate-700">
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">مستحقات جديد</p>
                    <p className="text-2xl font-black text-red-600">{totalOwedNew.toLocaleString()}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border-t-4 border-t-emerald-500 border border-slate-100 dark:border-slate-700">
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">متوفر جديد</p>
                    <p className="text-2xl font-black text-green-600">{totalAvailableNew.toLocaleString()}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border-t-4 border-t-amber-500 border border-slate-100 dark:border-slate-700">
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">مستحقات قديم</p>
                    <p className="text-2xl font-black text-red-600">{totalOwedOld.toLocaleString()}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border-t-4 border-t-amber-500 border border-slate-100 dark:border-slate-700">
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">متوفر قديم</p>
                    <p className="text-2xl font-black text-green-600">{totalAvailableOld.toLocaleString()}</p>
                </div>
            </div>

            {/* Coverage Ratios */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-2xl border border-emerald-200 dark:border-emerald-800 flex justify-between items-center transition-all hover:shadow-md">
                    <div>
                        <h3 className="text-lg font-black text-emerald-800 dark:text-emerald-400">تغطية السيولة (الريال الجديد)</h3>
                        <p className="text-xs font-bold text-emerald-600/80 mt-1 dark:text-emerald-500/80">المتوفر / المستحقات المتأخرة</p>
                    </div>
                    <p className="text-3xl font-black text-emerald-700 dark:text-emerald-300" dir="ltr">
                        {totalOwedNew > 0 ? `${((totalAvailableNew / totalOwedNew) * 100).toFixed(1)}%` : '100%'}
                    </p>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-2xl border border-amber-200 dark:border-amber-800 flex justify-between items-center transition-all hover:shadow-md">
                    <div>
                        <h3 className="text-lg font-black text-amber-800 dark:text-amber-400">تغطية السيولة (الريال القديم)</h3>
                        <p className="text-xs font-bold text-amber-600/80 mt-1 dark:text-amber-500/80">المتوفر / المستحقات المتأخرة</p>
                    </div>
                    <p className="text-3xl font-black text-amber-700 dark:text-amber-300" dir="ltr">
                        {totalOwedOld > 0 ? `${((totalAvailableOld / totalOwedOld) * 100).toFixed(1)}%` : '100%'}
                    </p>
                </div>
            </div>

            {/* Warning Message if liquidity is low */}
            {liquidityData.some(d => d.coveragePercent < 100) && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800/50 p-6 rounded-3xl flex items-start gap-4">
                    <span className="material-symbols-outlined text-amber-600 text-3xl">warning</span>
                    <div>
                        <h4 className="font-black text-amber-800 dark:text-amber-300">تنبيه: عجز في بعض المحافظ</h4>
                        <p className="text-amber-700/80 dark:text-amber-400/80 text-sm font-bold mt-1">
                            يوجد عجز في تغطية مستحقات المطاعم لبعض المحافظ المذكورة أعلاه. يرجى مراجعة الصناديق وتغذيتها لضمان سرعة السداد.
                        </p>
                    </div>
                </div>
            )}

            {/* New Riyal Section */}
            {renderLiquidityTable(newRiyalItems, 'سيولة الريال الجديد (New Riyal)', 'bg-emerald-500 text-emerald-700')}

            {/* Old Riyal Section */}
            {renderLiquidityTable(oldRiyalItems, 'سيولة الريال القديم (Old Riyal)', 'bg-amber-500 text-amber-700')}


            {/* Settings Modal */}
            {isSettingsOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsSettingsOpen(false)} />

                    <div className="relative bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col animate-scale-up">
                        {/* Modal Header */}
                        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-blue-600">tune</span>
                                    إعدادات ربط المحافظ
                                </h2>
                                <p className="text-slate-500 dark:text-slate-400 text-xs font-bold mt-1">تحديد كيفية دمج حسابات التحويل والمحافظ في اسم مالي واحد</p>
                            </div>
                            <button onClick={() => setIsSettingsOpen(false)} className="size-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Left Side: Existing Mappings */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4">المخططات الحالية</h3>
                                {liquidityMappings.length > 0 ? liquidityMappings.map(m => (
                                    <div key={m.id} className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="font-black text-slate-800 dark:text-white">{m.publicName}</span>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => setEditingMapping(m)} className="size-8 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition flex items-center justify-center text-blue-600">
                                                    <span className="material-symbols-outlined text-lg">edit</span>
                                                </button>
                                                <button onClick={() => deleteLiquidityMapping(m.id)} className="size-8 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition flex items-center justify-center text-red-600">
                                                    <span className="material-symbols-outlined text-lg">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {m.restaurantAccountTypes.map(t => (
                                                <span key={t} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded text-[10px] font-bold">{t}</span>
                                            ))}
                                            {m.bankDefIds.map(id => {
                                                const bank = bankDefinitions.find(b => b.id === id);
                                                return <span key={id} className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 rounded text-[10px] font-bold">{bank?.name || id}</span>
                                            })}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="py-20 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl text-slate-400 font-bold">
                                        لم يتم تعريف أي مخططات ربط بعد
                                    </div>
                                )}
                            </div>

                            {/* Right Side: Add/Edit Form */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 h-fit sticky top-0">
                                <h3 className="text-sm font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                                    <span className="size-2 rounded-full bg-blue-600"></span>
                                    {editingMapping ? 'تعديل مخطط' : 'إضافة مخطط ربط جديد'}
                                </h3>
                                <form onSubmit={handleSaveMapping} className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-black text-slate-500 mb-2 mr-1">الاسم العام (الذي سيظهر في المراجعة)</label>
                                        <input
                                            name="publicName"
                                            defaultValue={editingMapping?.publicName || ''}
                                            key={editingMapping?.id || 'new'}
                                            required
                                            placeholder="مثل: محفظة جيب كاك بنك"
                                            className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-bold focus:ring-2 focus:ring-blue-600 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-black text-slate-500 mb-2 mr-1">اختر أنواع حسابات المطاعم</label>
                                        <select
                                            name="restaurantTypes"
                                            multiple
                                            defaultValue={editingMapping?.restaurantAccountTypes || []}
                                            className="w-full h-32 px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-bold focus:ring-2 focus:ring-blue-600 outline-none"
                                        >
                                            {allAccountTypes.map(type => (
                                                <option key={type} value={type}>{type}</option>
                                            ))}
                                        </select>
                                        <p className="text-[10px] text-slate-400 mt-1 mr-1 font-bold">اضغط Ctrl لاختيار أكثر من نوع</p>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-black text-slate-500 mb-2 mr-1">اختر الحسابات البنكية (من المطابقة)</label>
                                        <select
                                            name="bankDefIds"
                                            multiple
                                            defaultValue={editingMapping?.bankDefIds || []}
                                            className="w-full h-32 px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-bold focus:ring-2 focus:ring-blue-600 outline-none"
                                        >
                                            {bankDefinitions.map(b => (
                                                <option key={b.id} value={b.id}>{b.name} ({b.currency === 'new_riyal' ? 'جديد' : 'قديم'})</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="flex items-center gap-3 pt-4">
                                        <button
                                            type="submit"
                                            className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-lg shadow-blue-600/20 transition font-black"
                                        >
                                            {editingMapping ? 'حفظ التغييرات' : 'إضافة المخطط'}
                                        </button>
                                        {editingMapping && (
                                            <button
                                                type="button"
                                                onClick={() => setEditingMapping(null)}
                                                className="px-6 py-4 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-black"
                                            >
                                                إلغاء
                                            </button>
                                        )}
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Wallet Details Modal (Drill Down) */}
            {selectedWallet && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setSelectedWallet(null)} />
                    <div className="relative bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col animate-scale-up">
                        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                            <div>
                                <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-blue-600">list</span>
                                    تفاصيل المستحقات: {selectedWallet.wallet}
                                </h2>
                                <p className="text-slate-500 dark:text-slate-400 text-xs font-bold mt-1">
                                    قائمة المطاعم التي لها مستحقات في هذه المحفظة
                                </p>
                            </div>
                            <button onClick={() => setSelectedWallet(null)} className="size-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-0">
                            <table className="w-full text-right border-collapse">
                                <thead className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shadow-sm z-10">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-black text-slate-500">اسم المطعم</th>
                                        <th className="px-6 py-4 text-xs font-black text-slate-500">الفرع</th>
                                        <th className="px-6 py-4 text-xs font-black text-slate-500">رقم الحساب / المستفيد</th>
                                        <th className="px-6 py-4 text-xs font-black text-slate-500">المستحق</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                    {selectedWallet.restaurants.map((r: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                            <td className="px-6 py-4 font-bold text-slate-800 dark:text-white text-sm">{r.name}</td>
                                            <td className="px-6 py-4 text-sm text-slate-500">{r.branch}</td>
                                            <td className="px-6 py-4 text-xs text-slate-500">
                                                <div className="font-bold">{r.accountNumber}</div>
                                                <div className="text-[10px] opacity-70">{r.beneficiaryName}</div>
                                            </td>
                                            <td className="px-6 py-4 font-black text-red-600 dir-ltr text-left text-sm">
                                                {r.balance.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 font-bold sticky bottom-0">
                                    <tr>
                                        <td colSpan={3} className="px-6 py-4 text-left">الإجمالي</td>
                                        <td className="px-6 py-4 font-black text-red-600 dir-ltr text-left">
                                            {selectedWallet.totalOwed.toLocaleString()}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WalletLiquidityPage;
