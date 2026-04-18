import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAppContext } from '../../AppContext';
import ScrapingConfigPanel from './ScrapingConfigPanel';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { restaurantService } from '../../src/services/restaurantService';
import { generateId } from '../../utils';
import { Restaurant } from '../../AppContext';

interface MarketRecord {
    id: string;
    name: string;
    address: string;
    imageUrl: string;
    category: string;
    type: string;
    status: string;
    branch: string;
    branchName: string;
    commission?: string | number;
    phone?: string;
    timings?: string;
}

interface CaptainRecord {
    id: string;
    name: string;
    licensePlate: string;
    branchName: string;
    status: string;
    balance?: number;
}

interface EmployeeRecord {
    id: string;
    name: string;
    position: string;
    branchName: string;
    balance?: number;
    loans?: number;
}

type TabType = 'banks' | 'restaurants' | 'captains' | 'employees';

const ScrapedDataViewer: React.FC = () => {
    const { systemBalances } = useAppContext();
    const [activeTab, setActiveTab] = useState<TabType>('banks');
    const [loading, setLoading] = useState(false);

    // Data states
    const [markets, setMarkets] = useState<MarketRecord[]>([]);
    const [captains, setCaptains] = useState<CaptainRecord[]>([]);
    const [employees, setEmployees] = useState<EmployeeRecord[]>([]);

    useEffect(() => {
        loadData(activeTab);
    }, [activeTab]);

    const loadData = async (tab: TabType) => {
        if (!db) return;
        
        // Banks actually relies on systemBalances from AppContext, no direct fetch needed typically, but we can structure it.
        if (tab === 'banks') return;

        setLoading(true);
        try {
            if (tab === 'restaurants') {
                const ref = collection(db, 'app', 'v1_data', 'scraped_markets');
                const snap = await getDocs(ref);
                const records: MarketRecord[] = [];
                snap.forEach(doc => records.push(doc.data() as MarketRecord));
                setMarkets(records);
            } else if (tab === 'captains') {
                const ref = collection(db, 'app', 'v1_data', 'scraped_captains');
                const snap = await getDocs(ref);
                const records: CaptainRecord[] = [];
                snap.forEach(doc => records.push(doc.data() as CaptainRecord));
                setCaptains(records);
            } else if (tab === 'employees') {
                const ref = collection(db, 'app', 'v1_data', 'scraped_employees');
                const snap = await getDocs(ref);
                const records: EmployeeRecord[] = [];
                snap.forEach(doc => records.push(doc.data() as EmployeeRecord));
                setEmployees(records);
            }
        } catch (e) {
            console.error(`Failed to load ${tab}`, e);
        } finally {
            setLoading(false);
        }
    };

    // Derived states for Banks
    const bankBalances = systemBalances.filter(sb => sb.type === 'bank');
    const chartBanks = bankBalances.map(b => ({
        name: b.accountName.split(' ').slice(0, 2).join(' '),
        amount: b.balance,
        fill: b.balance > 0 ? '#10b981' : '#f43f5e'
    })).sort((a, b) => b.amount - a.amount).slice(0, 10); // top 10

    // Derived states for Restaurants
    const restBalances = systemBalances.filter(sb => sb.type === 'restaurant');
    const chartRest = restBalances.map(b => ({
        name: b.accountName.replace(/مطعم |بوفية /g, '').slice(0, 15),
        amount: Math.abs(b.balance),
        fill: '#f59e0b'
    })).sort((a, b) => b.amount - a.amount).slice(0, 10);

    const handleSyncMissingRestaurants = async () => {
        if (markets.length === 0) {
            alert('لا توجد مطاعم مسحوبة.');
            return;
        }
        if (!confirm('هل أنت متأكد من مزامنة وإضافة المطاعم المفقودة إلى دليل المطاعم؟')) return;
        
        try {
            setLoading(true);
            const existing = await restaurantService.getFilteredRestaurants({});
            
            let addedCount = 0;
            let updatedCount = 0;
            
            for (const market of markets) {
                // Check if already exists
                const exists = existing.find(e => 
                    e.restaurantAccountNumber === market.id || 
                    e.systemAccountNumber === market.id ||
                    e.name === market.name
                );
                
                if (!exists) {
                    const newRest: Omit<Restaurant, 'id'> = {
                        branch: market.branch || 'tenant.main',
                        restaurantAccountNumber: market.id,
                        systemAccountNumber: market.id,
                        name: market.name,
                        ownerName: market.name, // Fallback
                        phone: market.phone || '',
                        transferAccounts: [],
                        paymentPeriod: 'monthly',
                        currencyType: 'old_riyal',
                        createdAt: new Date().toISOString(),
                        isActive: market.status === 'نشط',
                        logoUrl: market.imageUrl,
                        commission: market.commission,
                        timings: market.timings,
                        address: market.address,
                        classification: market.category
                    };
                    const newId = generateId();
                    await restaurantService.addRestaurant({ id: newId, ...newRest } as Restaurant);
                    addedCount++;
                } else {
                    // Update missing properties if available
                    const updates: Partial<Restaurant> = {};
                    if (!exists.logoUrl && market.imageUrl) updates.logoUrl = market.imageUrl;
                    if (!exists.commission && market.commission) updates.commission = market.commission;
                    if (!exists.timings && market.timings) updates.timings = market.timings;
                    if (!exists.address && market.address) updates.address = market.address;
                    
                    if (Object.keys(updates).length > 0) {
                        await restaurantService.updateRestaurant(exists.id, updates);
                        updatedCount++;
                    }
                }
            }
            
            setLoading(false);
            alert(`✅ اكتملت المزامنة بنجاح!\nتمت إضافة: ${addedCount} مطعم جديد.\nتم تحديث: ${updatedCount} مطعم حالي ببيانات إضافية (صورة، توقيت، نسبة...)`);
        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء المزامنة');
            setLoading(false);
        }
    };

    const TabButton = ({ type, title, icon, colorClass, dataCount }: { type: TabType, title: string, icon: string, colorClass: string, dataCount: number }) => (
        <button
            onClick={() => setActiveTab(type)}
            className={`relative flex items-center gap-3 w-full md:w-auto px-6 py-4 rounded-2xl transition-all font-bold ${activeTab === type ? `bg-white dark:bg-slate-800 shadow-xl border-2 border-${colorClass.split('-')[1]}-500/50 scale-[1.02] transform -translate-y-1` : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50 border-2 border-transparent'}`}
        >
            <div className={`size-10 rounded-xl flex items-center justify-center ${activeTab === type ? `bg-${colorClass.split('-')[1]}-100 text-${colorClass.split('-')[1]}-600 dark:bg-${colorClass.split('-')[1]}-900/30 dark:text-${colorClass.split('-')[1]}-400` : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                <span className="material-symbols-outlined">{icon}</span>
            </div>
            <div className="text-right">
                <p className={`text-base ${activeTab === type ? 'text-slate-900 dark:text-white' : ''}`}>{title}</p>
                <p className="text-xs opacity-75">{dataCount} سجل</p>
            </div>
        </button>
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-emerald-500">travel_explore</span>
                        مستعرض البيانات المدمجة
                    </h1>
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-2">
                        تعرض هذه الواجهة جميع البيانات المسحوبة حديثاً والمخزنة مؤقتاً لتسهيل مراجعتها وتحليلها.
                    </p>
                </div>
            </div>

            {/* Main Tabs Navigation */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-2 bg-slate-100/50 dark:bg-[#1e293b]/50 rounded-3xl">
                <TabButton type="banks" title="صناديق وبنوك" icon="account_balance" colorClass="text-blue-500" dataCount={bankBalances.length} />
                <TabButton type="restaurants" title="المطاعم" icon="restaurant" colorClass="text-rose-500" dataCount={markets.length || restBalances.length} />
                <TabButton type="captains" title="الموصلين والكباتن" icon="two_wheeler" colorClass="text-amber-500" dataCount={captains.length} />
                <TabButton type="employees" title="الموظفين والرواتب" icon="badge" colorClass="text-indigo-500" dataCount={employees.length} />
            </div>

            {loading && (
                <div className="flex flex-col items-center justify-center p-12 text-slate-500 bg-white dark:bg-[#1e293b] rounded-3xl border border-slate-200 dark:border-slate-800">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent mx-auto mb-4"></div>
                    <p className="font-bold text-lg">جاري تحميل وسحب البيانات...</p>
                </div>
            )}

            {!loading && (
                <div className="animate-fade-in space-y-6">
                    {/* -------------------- BANKS TAB -------------------- */}
                    {activeTab === 'banks' && (
                        <div className="space-y-6">
                            {/* Charts Section */}
                            <div className="grid grid-cols-1 gap-6">
                                <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center">
                                    <h3 className="w-full text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-blue-500">bar_chart</span>
                                        توزيع أرصدة البنوك والصناديق الرئيسية
                                    </h3>
                                    {chartBanks.length > 0 ? (
                                        <div className="w-full h-[300px]" dir="ltr">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={chartBanks} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                                    <XAxis dataKey="name" stroke="#8884d8" fontSize={11} interval={0} tickFormatter={(val) => val.length > 10 ? val.substring(0, 10) + '...' : val} />
                                                    <YAxis hide />
                                                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                                    <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                                                        {chartBanks.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ) : (
                                        <div className="h-[200px] flex items-center justify-center text-slate-400 font-bold">لا توجد بيانات للأرصدة البنكية</div>
                                    )}
                                </div>
                            </div>

                            {/* Tables Section */}
                            <div className="bg-white dark:bg-[#1e293b] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="p-6 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-blue-50/50 dark:bg-blue-900/10">
                                    <h3 className="text-lg font-black text-blue-800 dark:text-blue-400">جدول أرصدة البنوك المستخرجة</h3>
                                    <ScrapingConfigPanel scrapingType="banks" onTriggerScrape={() => {}} />
                                </div>
                                <div className="p-0 overflow-x-auto">
                                    <table className="w-full text-right text-sm">
                                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold">
                                            <tr>
                                                <th className="px-6 py-4">اسم الحساب</th>
                                                <th className="px-6 py-4">الرقم الدليلي (كود)</th>
                                                <th className="px-6 py-4">الجهة / الفرع</th>
                                                <th className="px-6 py-4">الرصيد الفعلي</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                            {bankBalances.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                    <td className="px-6 py-4 font-bold text-slate-800 dark:text-white">{item.accountName}</td>
                                                    <td className="px-6 py-4 font-mono text-slate-500">{item.accountNumber}</td>
                                                    <td className="px-6 py-4 text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 inline-block mt-3 mb-1 px-3 py-1 rounded-lg">المركز الرئيسي</td>
                                                    <td className="px-6 py-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">{item.balance.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* -------------------- RESTAURANTS TAB -------------------- */}
                    {activeTab === 'restaurants' && (
                        <div className="space-y-6">
                            
                            <div className="flex justify-between items-center bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 p-6 rounded-3xl shadow-sm">
                                <div>
                                    <h3 className="text-xl font-black text-rose-800 dark:text-rose-300">مزامنة المطاعم مع الدليل المركزي</h3>
                                    <p className="text-sm font-bold text-rose-600 dark:text-rose-400 mt-1">يوجد {markets.length} مطعم مسحوب يمكن مطابقته واستيراد نواقصه إلى دليل المنصة.</p>
                                </div>
                                <div className="flex gap-3">
                                    <ScrapingConfigPanel scrapingType="markets" onTriggerScrape={() => loadData('restaurants')} />
                                    <button 
                                        onClick={handleSyncMissingRestaurants}
                                        className="px-6 py-3 bg-gradient-to-r from-rose-600 to-red-600 text-white font-black rounded-xl shadow-lg hover:from-rose-700 hover:to-red-700 transition-all flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined">sync</span>
                                        مزامنة النواقص
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-6">
                                <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center">
                                    <h3 className="w-full text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-rose-500">ssid_chart</span>
                                        أعلى 10 مطاعم في المديونيات المتأخرة
                                    </h3>
                                    {chartRest.length > 0 ? (
                                        <div className="w-full h-[300px]" dir="ltr">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={chartRest} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                                    <XAxis dataKey="name" stroke="#8884d8" fontSize={11} interval={0} tickFormatter={(val) => val.length > 8 ? val.substring(0, 8) + '..' : val} />
                                                    <YAxis hide />
                                                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                                    <Bar dataKey="amount" fill="#f43f5e" radius={[8, 8, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ) : (
                                        <div className="h-[200px] flex items-center justify-center text-slate-400 font-bold">لا توجد سجلات مديونيات للمطاعم مسحوبة حديثاً</div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {markets.slice(0, 50).map((market, idx) => (
                                    <div key={idx} className="bg-white dark:bg-[#1e293b] rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-xl transition-all group">
                                        <div className="h-32 bg-slate-100 dark:bg-slate-800 relative overflow-hidden group-hover:scale-105 transition-transform duration-500">
                                            {market.imageUrl ? (
                                                <img src={market.imageUrl} alt={market.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                                                    <span className="material-symbols-outlined text-4xl mb-1">restaurant</span>
                                                    <span className="text-xs font-bold">صورة غير متوفرة</span>
                                                </div>
                                            )}
                                            <div className="absolute top-3 right-3 px-3 py-1 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-lg text-xs font-black shadow-sm text-slate-800 dark:text-white">
                                                {market.category || 'غير مصنف'}
                                            </div>
                                        </div>
                                        <div className="p-6">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h4 className="font-black text-lg text-slate-900 dark:text-white leading-tight">{market.name}</h4>
                                                    <p className="text-xs font-bold text-slate-500 mt-1 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[14px]">location_on</span>
                                                        {market.address || 'العنوان غير مدرج'}
                                                    </p>
                                                </div>
                                                <div className={`px-2 py-1 rounded-md text-[10px] font-black ${market.status === 'نشط' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                                    {market.status}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 mb-4">
                                                <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl">
                                                    <p className="text-[10px] text-slate-400 font-bold mb-1">الرقم المرجعي</p>
                                                    <p className="font-mono text-sm font-bold text-slate-700 dark:text-slate-300">{market.id}</p>
                                                </div>
                                                <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl">
                                                    <p className="text-[10px] text-slate-400 font-bold mb-1">النسبة المئوية</p>
                                                    <p className="font-mono text-sm font-bold text-rose-600 dark:text-rose-400">{market.commission || '15'}%</p>
                                                </div>
                                                <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl col-span-2 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-[16px] text-slate-400">schedule</span>
                                                    <div>
                                                        <p className="text-[10px] text-slate-400 font-bold">أوقات العمل المكتشفة</p>
                                                        <p className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">{market.timings || '12:00 م - 12:00 ص'}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* -------------------- CAPTAINS TAB -------------------- */}
                    {activeTab === 'captains' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 p-6 rounded-3xl shadow-sm">
                                <div>
                                    <h3 className="text-xl font-black text-amber-800 dark:text-amber-300">سجل الكباتن والموصلين الخارجي</h3>
                                    <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-1">يحتوي على {captains.length} كابتن. يتم استخدامها لربط الحوالات.</p>
                                </div>
                                <ScrapingConfigPanel scrapingType="captains" onTriggerScrape={() => loadData('captains')} />
                            </div>

                            <div className="bg-white dark:bg-[#1e293b] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="p-0 overflow-x-auto">
                                    <table className="w-full text-right text-sm">
                                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold">
                                            <tr>
                                                <th className="px-6 py-4">اسم الكابتن</th>
                                                <th className="px-6 py-4">رقم اللوحة</th>
                                                <th className="px-6 py-4">الفرع</th>
                                                <th className="px-6 py-4">الحالة</th>
                                                <th className="px-6 py-4">المديونية</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                            {captains.length === 0 ? (
                                                <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-bold">لا يوجد بيانات مسحوبة. اضغط سحب الآن.</td></tr>
                                            ) : captains.slice(0, 100).map((cap, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="size-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
                                                                {cap.name.charAt(0)}
                                                            </div>
                                                            <span className="font-bold text-slate-800 dark:text-white">{cap.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 font-mono">
                                                        <span className="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-bold text-xs">{cap.licensePlate || 'لا يوحد'}</span>
                                                    </td>
                                                    <td className="px-6 py-4 font-bold text-slate-500">{cap.branchName}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded-md text-[10px] font-black ${cap.status === 'نشط' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                                            {cap.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 font-mono font-bold text-rose-500">{cap.balance ? Math.abs(cap.balance).toLocaleString() : '0.00'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* -------------------- EMPLOYEES TAB -------------------- */}
                    {activeTab === 'employees' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-900/50 p-6 rounded-3xl shadow-sm">
                                <div>
                                    <h3 className="text-xl font-black text-indigo-800 dark:text-indigo-300">أرصدة والسلف الخاصة بالموظفين</h3>
                                    <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-1">يحتوي على {employees.length} موظف لمطابقة الكشوفات والاعتمادات.</p>
                                </div>
                                <ScrapingConfigPanel scrapingType="employees" onTriggerScrape={() => loadData('employees')} />
                            </div>

                            {employees.length === 0 ? (
                                <div className="p-12 text-center text-slate-400 bg-white dark:bg-[#1e293b] rounded-3xl border border-slate-200 dark:border-slate-800">
                                    <span className="material-symbols-outlined text-6xl mb-4 opacity-50">badge</span>
                                    <p className="font-bold text-lg">لم يتم السحب بعد. يرجى تفعيل Worker.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {employees.map((emp, idx) => (
                                        <div key={idx} className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4 hover:border-indigo-300 transition-colors">
                                            <div className="size-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 flex items-center justify-center text-xl font-black border border-indigo-100 dark:border-indigo-800 shrink-0">
                                                {emp.name.split(' ')[0][0]}{emp.name.split(' ').length > 1 ? emp.name.split(' ')[1][0] : ''}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-black text-slate-900 dark:text-white truncate" title={emp.name}>{emp.name}</h4>
                                                <p className="text-xs font-bold text-indigo-500 mb-2">{emp.position}</p>
                                                <div className="flex items-center gap-4">
                                                    <div>
                                                        <p className="text-[10px] text-slate-400 font-bold mb-0.5">الرصيد</p>
                                                        <p className="font-mono font-bold text-slate-700 dark:text-slate-300">{emp.balance ? emp.balance.toLocaleString() : '0'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-slate-400 font-bold mb-0.5">السلف</p>
                                                        <p className="font-mono font-bold text-rose-500">{emp.loans ? emp.loans.toLocaleString() : '0'}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ScrapedDataViewer;
