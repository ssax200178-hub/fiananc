import React, { useState } from 'react';
import { PhoneProvider } from '../../AppContext';

interface ProviderManagementUIProps {
    providers: PhoneProvider[];
    onAddProvider: (name: string) => Promise<boolean>;
    onToggleProvider: (id: string, active: boolean) => Promise<boolean>;
}

const ProviderManagementUI: React.FC<ProviderManagementUIProps> = ({ 
    providers, 
    onAddProvider, 
    onToggleProvider 
}) => {
    const [newName, setNewName] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const handleAdd = async () => {
        if (!newName.trim()) return;
        setIsAdding(true);
        const success = await onAddProvider(newName.trim());
        setIsAdding(false);
        if (success) setNewName('');
    };

    return (
        <section className="bg-white/70 dark:bg-slate-900/40 backdrop-blur-xl rounded-[2.5rem] border border-slate-200 dark:border-white/5 p-10 shadow-xl" dir="rtl">
            <div className="flex items-center justify-between mb-10">
                <div className="text-right">
                    <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2 tracking-tight flex items-center gap-3">
                        <span className="material-symbols-outlined text-blue-600">settings_remote</span>
                        مزودي الخدمة
                    </h3>
                    <p className="text-slate-500 font-bold text-sm">إدارة شركات الاتصالات ومزودي المدفوعات</p>
                </div>
            </div>

            {/* Add New Provider */}
            <div className="flex gap-3 mb-10">
                <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="اسم المزود الجديد..."
                    className="flex-1 px-6 py-4 rounded-2xl bg-slate-100 dark:bg-[#0f172a] border border-slate-200 dark:border-white/5 text-slate-800 dark:text-white font-bold focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all group-hover:border-blue-500/50"
                />
                <button
                    onClick={handleAdd}
                    disabled={isAdding || !newName.trim()}
                    className="px-8 rounded-2xl bg-blue-600 text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
                >
                    {isAdding ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : 'إضافة'}
                </button>
            </div>

            {/* Provider List */}
            <div className="space-y-3">
                {providers.map((provider) => (
                    <div 
                        key={provider.id}
                        className="flex items-center justify-between p-5 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 group hover:border-blue-500/30 transition-all"
                    >
                        <div className="flex items-center gap-4">
                            <div className={`size-12 rounded-2xl flex items-center justify-center ${
                                provider.isActive ? 'bg-blue-600/10 text-blue-600' : 'bg-slate-200 dark:bg-white/10 text-slate-400'
                            }`}>
                                <span className="material-symbols-outlined font-variation-bold">router</span>
                            </div>
                            <div>
                                <p className="font-black text-slate-800 dark:text-white">{provider.name}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    {provider.isActive ? 'نشط' : 'متوقف'}
                                </p>
                            </div>
                        </div>
                        
                        <button
                            onClick={() => onToggleProvider(provider.id, !provider.isActive)}
                            className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                                provider.isActive 
                                    ? 'bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white' 
                                    : 'bg-green-500/10 text-green-600 hover:bg-green-500 hover:text-white'
                            }`}
                        >
                            {provider.isActive ? 'تعطيل' : 'تفعيل'}
                        </button>
                    </div>
                ))}
                
                {providers.length === 0 && (
                    <div className="text-center py-12 opacity-30">
                        <span className="material-symbols-outlined text-6xl mb-4">inventory_2</span>
                        <p className="font-bold">لا يوجد مزودين مضافين حالياً</p>
                    </div>
                )}
            </div>
        </section>
    );
};

export default ProviderManagementUI;
