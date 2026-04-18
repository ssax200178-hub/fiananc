import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import type { UserRole, User, UserPermission, ExchangeRateHistory, AppCurrency } from '../AppContext';
import { PERMISSION_GROUPS } from '../AppContext';
import { settingsService } from '../src/services/settingsService';
import AutomationSettingsTab from './AutomationSettingsTab';

const parseNum = (t: string): number => {
    if (!t || t.trim() === '-' || t.trim() === '—' || t.trim() === '') return 0;
    let c = t.trim().replace(/,/g, '').replace(/٬/g, '').replace(/ /g, '');
    let isNegative = false;
    if (c.startsWith('(') && c.endsWith(')')) {
        isNegative = true;
        c = c.slice(1, -1);
    } else if (c.endsWith('-')) {
        isNegative = true;
        c = c.slice(0, -1);
    } else if (c.startsWith('-')) {
        isNegative = true;
        c = c.slice(1);
    }
    return Math.abs(parseFloat(c)) || 0;
};

// Known Arabic column headers for tawseel.app tables
const HEADER_PATTERNS: Record<string, string[]> = {
    accountName: ['اسم الحساب', 'الاسم', 'اسم'],
    accountNumber: ['رقم الحساب', 'رقم', 'الرقم'],
    branch: ['الفرع', 'فرع'],
    currency: ['العملة', 'عملة', 'عملة الحساب'],
    debit: ['مدين', 'المدين'],
    credit: ['دائن', 'الدائن'],
    balance: ['الرصيد', 'رصيد'],
    financialStatement: ['القائمة المالية'],
    costCenter: ['مركز التكلفة'],
    difference: ['الفارق'],
};

// Detect column mapping from header row
const detectColumnMap = (headerCols: string[]): Record<string, number> => {
    const map: Record<string, number> = {};
    headerCols.forEach((col, idx) => {
        const cleaned = col.trim();
        if (!cleaned || cleaned === '#') return;
        for (const [key, patterns] of Object.entries(HEADER_PATTERNS)) {
            if (patterns.some(p => cleaned.includes(p))) {
                if (!(key in map)) map[key] = idx;
                break;
            }
        }
    });
    return map;
};

// Sub-component: Simple Paste Extractor
const PasteExtractorCard = ({ onSaved, syncMetadata }: { onSaved: () => void, syncMetadata: any }) => {
    const [pasteType, setPasteType] = useState<'bank' | 'restaurant'>('bank');
    const [pasteText, setPasteText] = useState('');
    const [parsedData, setParsedData] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');

    const handleParse = () => {
        const lines = pasteText.split('\n').filter(l => l.trim());
        if (lines.length < 2) {
            setMessage('⚠️ الصق بيانات الجدول أولاً');
            return;
        }

        let colMap: Record<string, number> = {};
        let dataStartIdx = 0;

        for (let i = 0; i < Math.min(3, lines.length); i++) {
            const cols = lines[i].split('\t');
            const testMap = detectColumnMap(cols);
            if (Object.keys(testMap).length >= 2) {
                colMap = testMap;
                dataStartIdx = i + 1;
                break;
            }
        }

        const parsed: any[] = [];
        for (let i = dataStartIdx; i < lines.length; i++) {
            const cols = lines[i].split('\t');
            if (cols.length < 3) continue;

            let accountName = '';
            let accountNumber = '';
            let debit = 0;
            let credit = 0;
            let balance = 0;

            if (Object.keys(colMap).length >= 2) {
                accountName = cols[colMap.accountName]?.trim() || '';
                accountNumber = cols[colMap.accountNumber]?.trim() || '';
                debit = parseNum(cols[colMap.debit] || '0');
                credit = parseNum(cols[colMap.credit] || '0');
                const extractedBal = parseNum(cols[colMap.balance] || '0');
                
                if (pasteType === 'restaurant') {
                    balance = debit > credit ? -Math.abs(extractedBal) : Math.abs(extractedBal);
                } else {
                    balance = credit > debit ? -Math.abs(extractedBal) : Math.abs(extractedBal);
                }
            } else continue;

            if (!accountNumber || /^(#|رقم|رقم الحساب)$/.test(accountNumber)) continue;
            if (accountName.includes('إجمالي') || accountName === '') continue;

            parsed.push({
                accountNumber, accountName, name: accountName,
                debit, credit, balance, type: pasteType, lastUpdated: new Date().toISOString()
            });
        }

        setParsedData(parsed);
        setMessage(parsed.length > 0 ? `✅ تم استخراج ${parsed.length} حساب` : '❌ لم يتم العثور على بيانات');
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await settingsService.saveSystemBalancesBatch(parsedData);
            setMessage('✅ تم الحفظ بنجاح!');
            setPasteText('');
            setParsedData([]);
            onSaved();
        } catch (e: any) {
            setMessage(`❌ فشل: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="glass-morphism rounded-3xl p-6 border border-white/10">
            <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-indigo-500/20 rounded-2xl">
                    <span className="material-symbols-outlined text-indigo-400">content_paste</span>
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">استخراج سريع (Paste)</h3>
                    <p className="text-slate-400 text-sm">الصق جدول tawseel.app هنا مباشرة</p>
                </div>
            </div>

            <div className="flex gap-2 mb-4">
                <button 
                    onClick={() => setPasteType('bank')}
                    className={`flex-1 py-3 rounded-2xl font-bold transition-all ${pasteType === 'bank' ? 'bg-indigo-600 text-white' : 'bg-slate-800/50 text-slate-400'}`}
                >🏦 بنوك (6000)</button>
                <button 
                    onClick={() => setPasteType('restaurant')}
                    className={`flex-1 py-3 rounded-2xl font-bold transition-all ${pasteType === 'restaurant' ? 'bg-orange-600 text-white' : 'bg-slate-800/50 text-slate-400'}`}
                >🍽️ مطاعم (2000)</button>
            </div>

            <textarea 
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Ctrl+V هنا..."
                className="w-full h-32 bg-slate-900/50 border border-white/5 rounded-2xl p-4 text-white text-sm font-mono mb-4 focus:border-indigo-500 transition-all outline-none"
            />

            <div className="flex gap-3">
                <button 
                    onClick={handleParse}
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-bold transition-all"
                >تحليل</button>
                {parsedData.length > 0 && (
                    <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
                    >{isSaving ? 'جاري الحفظ...' : 'حفظ البيانات'}</button>
                )}
            </div>
            {message && <p className="mt-4 text-center text-sm font-bold text-indigo-400 animate-fade-in">{message}</p>}
        </div>
    );
};

export const PremiumSettingsPage = () => {
    const {
        currentUser, users, financialTips, exchangeRates, updateExchangeRates,
        phoneProviders, accountMappings, systemBalances, syncMetadata, customCurrencies
    } = useAppContext();

    const [activeTab, setActiveTab] = useState('account');
    const location = useLocation();

    useEffect(() => {
        if (location.state?.openAccount) setActiveTab('account');
    }, [location.state]);

    const tabs = [
        { id: 'account', label: 'حسابي', icon: 'person', roles: ['user', 'admin', 'super_admin'] },
        { id: 'users', label: 'المستخدمين', icon: 'group', roles: ['admin', 'super_admin'] },
        { id: 'tips', label: 'توجيهات', icon: 'lightbulb', roles: ['admin', 'super_admin'] },
        { id: 'exchange', label: 'الصرف', icon: 'currency_exchange', roles: ['admin', 'super_admin'] },
        { id: 'currencies', label: 'العملات', icon: 'payments', roles: ['admin', 'super_admin'] },
        { id: 'mapping', label: 'الربط', icon: 'link', roles: ['admin', 'super_admin'] },
        { id: 'automation', label: 'الأتمتة', icon: 'smart_toy', roles: ['admin', 'super_admin'] },
        { id: 'advanced', label: 'متقدم', icon: 'database', roles: ['super_admin'] },
    ];

    const filteredTabs = tabs.filter(t => t.roles.includes(currentUser?.role || 'user'));

    return (
        <div className="min-h-screen bg-[#0f172a] text-white p-6 lg:p-10" dir="rtl">
            <style>{`
                .glass-morphism {
                    background: rgba(30, 41, 59, 0.5);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                }
                .sidebar-item {
                    position: relative;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .sidebar-item.active {
                    background: rgba(99, 102, 241, 0.15);
                    color: #818cf8;
                }
                .sidebar-item.active::after {
                    content: '';
                    position: absolute;
                    right: 0;
                    top: 20%;
                    bottom: 20%;
                    width: 4px;
                    background: #6366f1;
                    border-radius: 4px 0 0 4px;
                }
            `}</style>

            <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-10">
                {/* Sidebar Navigation */}
                <aside className="lg:w-72 flex-shrink-0">
                    <div className="glass-morphism rounded-3xl p-4 border border-white/5 sticky top-10">
                        <div className="px-4 py-6 mb-4 border-b border-white/5">
                            <h1 className="text-2xl font-black font-display tracking-tightest">الإعدادات</h1>
                            <p className="text-slate-500 text-sm mt-1">تخصيص وإدارة النظام</p>
                        </div>
                        <nav className="space-y-1">
                            {filteredTabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`sidebar-item w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold text-base ${activeTab === tab.id ? 'active text-indigo-400' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                                >
                                    <span className="material-symbols-outlined">{tab.icon}</span>
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                        
                        <div className="mt-10 p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-full bg-indigo-500 flex items-center justify-center font-black text-lg">
                                    {currentUser?.username?.charAt(0).toUpperCase()}
                                </div>
                                <div className="overflow-hidden">
                                    <p className="font-bold truncate">{currentUser?.name || currentUser?.username}</p>
                                    <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">{currentUser?.role === 'super_admin' ? 'SYSTEM ARCHITECT' : currentUser?.role}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 space-y-10">
                    {activeTab === 'account' && (
                        <section className="animate-fade-in space-y-8">
                            <header className="flex items-center gap-4">
                                <div className="p-4 bg-indigo-500/10 rounded-3xl border border-indigo-500/20">
                                    <span className="material-symbols-outlined text-indigo-400 text-3xl">shield_person</span>
                                </div>
                                <div>
                                    <h2 className="text-3xl font-black tracking-tightest">حسابي وأماني</h2>
                                    <p className="text-slate-400">إدارة معلومات الدخول وكلمة المرور</p>
                                </div>
                            </header>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="glass-morphism rounded-3xl p-8 border border-white/10 space-y-6">
                                    <h3 className="text-xl font-bold">المعلومات الشخصية</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-slate-500 text-xs font-bold mb-2 uppercase">اسم المستخدم</label>
                                            <input disabled value={currentUser?.username} className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-5 py-4 text-white opacity-50 cursor-not-allowed" />
                                        </div>
                                        <div>
                                            <label className="block text-slate-500 text-xs font-bold mb-2 uppercase">الاسم الكامل</label>
                                            <input disabled value={currentUser?.name || '-'} className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-5 py-4 text-white opacity-50 cursor-not-allowed" />
                                        </div>
                                    </div>
                                </div>

                                <div className="glass-morphism rounded-3xl p-8 border border-white/10 space-y-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/10 blur-3xl -z-10"></div>
                                    <h3 className="text-xl font-bold">تغيير كلمة المرور</h3>
                                    <form className="space-y-4">
                                        <input type="password" placeholder="كلمة المرور الجديدة" className="w-full bg-slate-900/50 border border-white/5 rounded-2xl px-5 py-4 text-white focus:border-indigo-500 outline-none transition-all" />
                                        <input type="password" placeholder="تأكيد كلمة المرور" className="w-full bg-slate-900/50 border border-white/5 rounded-2xl px-5 py-4 text-white focus:border-indigo-500 outline-none transition-all" />
                                        <button className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all">تحديث كلمة المرور</button>
                                    </form>
                                </div>
                            </div>
                        </section>
                    )}

                    {activeTab === 'users' && (
                        <section className="animate-fade-in space-y-8">
                            <header className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="p-4 bg-blue-500/10 rounded-3xl border border-blue-500/20">
                                        <span className="material-symbols-outlined text-blue-400 text-3xl">group</span>
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black tracking-tightest">المستخدمين</h2>
                                        <p className="text-slate-400">إدارة الموظفين وصلاحيات الوصول</p>
                                    </div>
                                </div>
                                <button className="px-6 py-3 bg-white text-black hover:bg-slate-200 rounded-2xl font-bold transition-all shadow-xl">إضافة مستخدم</button>
                            </header>

                            <div className="glass-morphism rounded-3xl border border-white/10 overflow-hidden">
                                <table className="w-full text-right">
                                    <thead className="bg-white/5 text-slate-400 text-xs font-bold uppercase">
                                        <tr>
                                            <th className="px-8 py-5">المستخدم</th>
                                            <th className="px-8 py-5">الدور</th>
                                            <th className="px-8 py-5">آخر نشاط</th>
                                            <th className="px-8 py-5 text-left">الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {users.map(user => (
                                            <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className="size-10 rounded-2xl bg-slate-800 flex items-center justify-center font-bold text-slate-400 border border-white/5 shadow-inner">
                                                            {user.username.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold">{user.username}</p>
                                                            <p className="text-xs text-slate-500">{user.name || '-'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                        user.role === 'super_admin' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                                        user.role === 'admin' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                                        'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                                                    }`}>
                                                        {user.role}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-6 text-sm text-slate-500">
                                                    {user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString('ar-SA') : 'لم يدخل بعد'}
                                                </td>
                                                <td className="px-8 py-6 text-left">
                                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button className="p-2 hover:bg-white/10 rounded-xl transition-all" title="الصلاحيات">
                                                            <span className="material-symbols-outlined text-slate-400">key</span>
                                                        </button>
                                                        <button className="p-2 hover:bg-white/10 rounded-xl transition-all" title="تعديل">
                                                            <span className="material-symbols-outlined text-slate-400">edit</span>
                                                        </button>
                                                        <button className="p-2 hover:bg-red-500/20 rounded-xl transition-all" title="حذف">
                                                            <span className="material-symbols-outlined text-red-400">delete</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {activeTab === 'automation' && (
                        <div className="animate-fade-in space-y-10">
                            <AutomationSettingsTab />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <PasteExtractorCard onSaved={() => {}} syncMetadata={syncMetadata} />
                                <div className="glass-morphism rounded-3xl p-8 border border-white/10 flex flex-col justify-center items-center text-center space-y-4 relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-600/10 blur-3xl -z-10"></div>
                                    <div className="p-5 bg-emerald-500/20 rounded-full mb-2">
                                        <span className="material-symbols-outlined text-emerald-400 text-4xl">sync</span>
                                    </div>
                                    <h3 className="text-2xl font-black">حالة المزامنة</h3>
                                    <p className="text-slate-400 text-sm max-w-[200px]">آخر تحديث للبيانات من tawseel.app</p>
                                    <div className="mt-4 space-y-2 w-full">
                                        <div className="flex justify-between p-3 bg-white/5 rounded-xl text-sm font-bold">
                                            <span className="text-slate-500">آخر مزامنة:</span>
                                            <span>{syncMetadata?.lastSync ? new Date(syncMetadata.lastSync).toLocaleString('ar-SA') : '—'}</span>
                                        </div>
                                        <div className="flex justify-between p-3 bg-white/5 rounded-xl text-sm font-bold">
                                            <span className="text-slate-500">عدد البنوك:</span>
                                            <span className="text-indigo-400">{syncMetadata?.bankCount || 0}</span>
                                        </div>
                                        <div className="flex justify-between p-3 bg-white/5 rounded-xl text-sm font-bold">
                                            <span className="text-slate-500">عدد المطاعم:</span>
                                            <span className="text-orange-400">{syncMetadata?.restaurantCount || 0}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Placeholder for other tabs */}
                    {!['account', 'users', 'automation'].includes(activeTab) && (
                        <div className="animate-fade-in glass-morphism rounded-3xl p-20 text-center border border-dashed border-white/10">
                            <span className="material-symbols-outlined text-7xl text-slate-600 mb-6 block">construction</span>
                            <h2 className="text-3xl font-black text-slate-400">قسم {tabs.find(t => t.id === activeTab)?.label}</h2>
                            <p className="text-slate-500 mt-2">جاري العمل على تحويل هذا القسم للواجهة المتميزة</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default PremiumSettingsPage;
