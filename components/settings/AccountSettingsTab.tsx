import React, { useState } from 'react';

interface AccountSettingsTabProps {
    onChangePassword: (current: string, newP: string) => Promise<boolean>;
}

const AccountSettingsTab: React.FC<AccountSettingsTabProps> = ({ onChangePassword }) => {
    const [currentPass, setCurrentPass] = useState('');
    const [newPass, setNewPass] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedback(null);
        if (newPass !== confirmPass) {
            setFeedback({ type: 'error', text: 'كلمات المرور الجديدة غير متطابقة' });
            return;
        }
        if (newPass.length < 6) {
            setFeedback({ type: 'error', text: 'كلمة المرور يجب أن لا تقل عن 6 خانات' });
            return;
        }

        setIsLoading(true);
        try {
            const success = await onChangePassword(currentPass, newPass);
            if (success) {
                setFeedback({ type: 'success', text: '✅ تم تغيير كلمة المرور بنجاح' });
                setCurrentPass('');
                setNewPass('');
                setConfirmPass('');
            } else {
                setFeedback({ type: 'error', text: '❌ فشل تغيير كلمة المرور. تأكد من كلمة المرور الحالية' });
            }
        } catch (e) {
            setFeedback({ type: 'error', text: '❌ حدث خطأ غير متوقع' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-xl mx-auto py-8">
            <div className="bg-white dark:bg-[#1e293b] rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden p-8">
                <div className="flex items-center gap-4 mb-8">
                    <div className="size-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                        <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-3xl">lock_reset</span>
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white">إعدادات الحساب</h2>
                        <p className="text-slate-500 dark:text-slate-400 font-bold">قم بتغيير كلمة المرور الخاصة بك</p>
                    </div>
                </div>

                {feedback && (
                    <div className={`mb-6 p-4 rounded-2xl font-black text-sm flex items-center gap-3 ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                        <span className="material-symbols-outlined text-xl">{feedback.type === 'success' ? 'check_circle' : 'error'}</span>
                        {feedback.text}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-sm font-black text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">key</span>
                            كلمة المرور الحالية
                        </label>
                        <input
                            type="password"
                            value={currentPass}
                            onChange={e => setCurrentPass(e.target.value)}
                            required
                            className="w-full px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:ring-[3px] focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-black"
                            placeholder="••••••••"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-black text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">password</span>
                            كلمة المرور الجديدة
                        </label>
                        <input
                            type="password"
                            value={newPass}
                            onChange={e => setNewPass(e.target.value)}
                            required
                            className="w-full px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:ring-[3px] focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-black"
                            placeholder="••••••••"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-black text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">enhanced_encryption</span>
                            تأكيد كلمة المرور الجديدة
                        </label>
                        <input
                            type="password"
                            value={confirmPass}
                            onChange={e => setConfirmPass(e.target.value)}
                            required
                            className="w-full px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:ring-[3px] focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-black"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full mt-4 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-black text-lg rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-500/20"
                    >
                        {isLoading ? (
                            <><span className="material-symbols-outlined animate-spin">sync</span> جاري التغيير...</>
                        ) : (
                            <><span className="material-symbols-outlined">save</span> تحديث كلمة المرور</>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AccountSettingsTab;
