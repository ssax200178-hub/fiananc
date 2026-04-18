import React, { useState } from 'react';

interface ProfileSectionProps {
    currentUser: any;
    onUpdatePassword: (password: string) => Promise<boolean>;
}

const ProfileSection: React.FC<ProfileSectionProps> = ({ currentUser, onUpdatePassword }) => {
    const [newPassword, setNewPassword] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const handlePasswordChange = async () => {
        if (!newPassword || newPassword.length < 6) {
            setMessage({ text: 'يجب أن تكون كلمة المرور 6 أحرف على الأقل', type: 'error' });
            return;
        }

        setIsUpdating(true);
        const success = await onUpdatePassword(newPassword);
        setIsUpdating(false);

        if (success) {
            setMessage({ text: 'تم تحديث كلمة المرور بنجاح!', type: 'success' });
            setNewPassword('');
        } else {
            setMessage({ text: 'حدث خطأ أثناء تحديث كلمة المرور', type: 'error' });
        }
    };

    return (
        <section className="bg-white/70 dark:bg-slate-900/40 backdrop-blur-xl rounded-[2.5rem] border border-slate-200 dark:border-white/5 p-10 shadow-xl" dir="rtl">
            <div className="flex items-center gap-6 mb-12">
                <div className="size-24 rounded-[2rem] bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-4xl font-black shadow-2xl relative group overflow-hidden">
                    <span className="relative z-10">{currentUser.username.charAt(0).toUpperCase()}</span>
                    <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
                <div className="text-right">
                    <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-1">{currentUser.name || currentUser.username}</h2>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{currentUser.role.replace('_', ' ')}</p>
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-12">
                {/* Account Details */}
                <div className="space-y-6">
                    <h3 className="text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-3">
                        <span className="material-symbols-outlined text-blue-600">account_circle</span>
                        بيانات الحساب
                    </h3>
                    <div className="space-y-4">
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">اسم المستخدم</p>
                            <p className="font-bold text-slate-700 dark:text-slate-300">{currentUser.username}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">البريد الإلكتروني</p>
                            <p className="font-bold text-slate-700 dark:text-slate-300">{currentUser.email || 'لا يوجد بريد إلكتروني'}</p>
                        </div>
                    </div>
                </div>

                {/* Password Security */}
                <div className="space-y-6">
                    <h3 className="text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-3">
                        <span className="material-symbols-outlined text-blue-600">security</span>
                        تغيير كلمة المرور
                    </h3>
                    <div className="space-y-4">
                        <div className="relative group">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="كلمة المرور الجديدة..."
                                className="w-full px-6 py-4 rounded-2xl bg-slate-100 dark:bg-[#0f172a] border border-slate-200 dark:border-white/5 text-slate-800 dark:text-white font-bold focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all pr-12 group-hover:border-blue-500/50"
                            />
                            <button 
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors"
                            >
                                <span className="material-symbols-outlined">{showPassword ? 'visibility' : 'visibility_off'}</span>
                            </button>
                        </div>

                        {message && (
                            <div className={`p-4 rounded-2xl text-xs font-black flex items-center gap-3 ${
                                message.type === 'success' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                            }`}>
                                <span className="material-symbols-outlined text-lg">{message.type === 'success' ? 'check_circle' : 'error'}</span>
                                {message.text}
                            </div>
                        )}

                        <button
                            onClick={handlePasswordChange}
                            disabled={isUpdating || !newPassword}
                            className="w-full py-4 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-sm uppercase tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                        >
                            {isUpdating ? (
                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            ) : (
                                <>
                                    <span>تحديث كلمة المرور</span>
                                    <span className="material-symbols-outlined text-lg">save</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ProfileSection;
