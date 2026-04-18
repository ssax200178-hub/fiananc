import React, { useState } from 'react';

interface PhoneProvider {
    id: string;
    name: string;
    icon?: string;
    color?: string;
}

interface ProviderManagementUIProps {
    providers: PhoneProvider[];
    onAdd: (provider: any) => Promise<void>;
    onUpdate: (provider: any) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

const ProviderManagementUI: React.FC<ProviderManagementUIProps> = ({ providers, onAdd, onUpdate, onDelete }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', icon: 'smartphone', color: '#6366f1' });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (editingId) {
            await onUpdate({ ...form, id: editingId });
            setEditingId(null);
        } else {
            await onAdd(form);
            setIsAdding(false);
        }
        setForm({ name: '', icon: 'smartphone', color: '#6366f1' });
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-800 dark:text-white">المزودون المتاحون ({providers.length})</h3>
                {!isAdding && !editingId && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-purple-700 transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm">add</span>
                        إضافة مزود
                    </button>
                )}
            </div>

            {(isAdding || editingId) && (
                <form onSubmit={handleSubmit} className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl mb-4 animate-scale-in">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500">اسم المزود</label>
                            <input
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                required
                                className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 font-bold text-sm dark:text-white"
                                placeholder="مثال: يمن موبايل"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500">الأيقونة</label>
                            <select
                                value={form.icon}
                                onChange={e => setForm({ ...form, icon: e.target.value })}
                                className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 font-bold text-sm dark:text-white"
                            >
                                <option value="smartphone">هاتف الذكي</option>
                                <option value="router">راوتر</option>
                                <option value="conveyor_belt">تحويل</option>
                                <option value="signal_cellular_alt">إشارة</option>
                                <option value="wifi">واي فاي</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500">اللون المميز</label>
                            <input
                                type="color"
                                value={form.color}
                                onChange={e => setForm({ ...form, color: e.target.value })}
                                className="w-full h-11 p-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg outline-none cursor-pointer"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 text-xs">
                        <button
                            type="button"
                            onClick={() => { setIsAdding(false); setEditingId(null); setForm({ name: '', icon: 'smartphone', color: '#6366f1' }); }}
                            className="px-4 py-2 text-slate-500 font-bold hover:text-slate-700"
                        >
                            إلغاء
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            {editingId ? 'تحديث' : 'إضافة'}
                        </button>
                    </div>
                </form>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {providers.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl group hover:border-purple-300 dark:hover:border-purple-800 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="size-10 rounded-lg flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: p.color || '#6366f1' }}>
                                <span className="material-symbols-outlined">{p.icon || 'phone_iphone'}</span>
                            </div>
                            <span className="font-bold text-slate-800 dark:text-white">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => {
                                    setForm({ name: p.name, icon: p.icon || 'smartphone', color: p.color || '#6366f1' });
                                    setEditingId(p.id);
                                    setIsAdding(false);
                                }}
                                className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-all"
                            >
                                <span className="material-symbols-outlined text-sm">edit</span>
                            </button>
                            <button
                                onClick={() => {
                                    if (window.confirm(`هل أنت متأكد من حذف ${p.name}؟`)) {
                                        onDelete(p.id);
                                    }
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                            >
                                <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

interface PhoneProvidersTabProps {
    phoneProviders: PhoneProvider[];
    addPhoneProvider: (provider: any) => Promise<void>;
    updatePhoneProvider: (provider: any) => Promise<void>;
    deletePhoneProvider: (id: string) => Promise<void>;
}

const PhoneProvidersTab: React.FC<PhoneProvidersTabProps> = ({
    phoneProviders,
    addPhoneProvider,
    updatePhoneProvider,
    deletePhoneProvider
}) => {
    return (
        <div className="space-y-6 max-w-4xl">
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                            <span className="material-symbols-outlined text-purple-600 dark:text-purple-400">settings_remote</span>
                            إدارة مزودي الاتصالات
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">تحديد الشركات المزودة لخدمات الاتصالات في النظام</p>
                    </div>
                </div>

                <div className="p-6">
                    {phoneProviders && (
                        <ProviderManagementUI
                            providers={phoneProviders}
                            onAdd={addPhoneProvider}
                            onUpdate={updatePhoneProvider}
                            onDelete={deletePhoneProvider}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default PhoneProvidersTab;
