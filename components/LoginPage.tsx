import React, { useState } from 'react';
import { useAppContext } from '../AppContext';

const LoginPage: React.FC = () => {
    const { login } = useAppContext();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const success = await login(username, password);
            if (!success) {
                setError('اسم المستخدم أو كلمة المرور غير صحيحة');
            }
        } catch (error) {
            setError('حدث خطأ أثناء تسجيل الدخول');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0f172a] p-4 animate-fade-in relative overflow-hidden">
            {/* Background Decorative Circles */}
            <div className="absolute top-[-10%] left-[-10%] size-96 bg-[#ED1C24]/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-[-10%] right-[-10%] size-96 bg-[#C62828]/10 rounded-full blur-3xl"></div>

            <div className="bg-white dark:bg-[#1e293b] w-full max-w-md p-8 md:p-10 rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-[#334155] relative overflow-hidden z-10 transition-all">
                {/* Decorative Top Accent */}
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#ED1C24] via-[#FF4D4D] to-[#C62828]"></div>

                <div className="text-center mb-10">
                    <div className="size-28 bg-white rounded-[2rem] p-4 shadow-2xl flex items-center justify-center mx-auto mb-6 border border-slate-100 dark:border-slate-800 transform hover:scale-105 transition-transform">
                        <img src="/logo.png" alt="توصيل ون" className="w-full h-full object-contain" />
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">تسجيل الدخول</h1>
                    <div className="inline-block px-4 py-1.5 bg-red-50 dark:bg-red-900/10 rounded-full">
                        <p className="text-[#ED1C24] font-black text-xs">الادارة المالية - شركة توصيل ون</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2 text-right">
                        <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mr-2">
                            اسم المستخدم
                        </label>
                        <div className="relative group">
                            <input
                                type="text"
                                value={username}
                                onChange={e => {
                                    setUsername(e.target.value);
                                    setError('');
                                }}
                                className={`w-full px-5 py-4 rounded-2xl border ${error ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-[#334155] focus:ring-[#ED1C24]'} bg-slate-50 dark:bg-[#0f172a] text-slate-900 dark:text-white focus:ring-2 transition-all outline-none font-bold text-right group-hover:border-[#ED1C24]/50`}
                                placeholder="أدخل اسم المستخدم..."
                                autoFocus
                                disabled={isLoading}
                            />
                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#ED1C24] transition-colors">person</span>
                        </div>
                    </div>

                    <div className="space-y-2 text-right">
                        <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mr-2">
                            كلمة المرور
                        </label>
                        <div className="relative group">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={e => {
                                    setPassword(e.target.value);
                                    setError('');
                                }}
                                className={`w-full px-5 py-4 rounded-2xl border ${error ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-[#334155] focus:ring-[#ED1C24]'} bg-slate-50 dark:bg-[#0f172a] text-slate-900 dark:text-white focus:ring-2 transition-all outline-none font-bold text-right group-hover:border-[#ED1C24]/50`}
                                placeholder="أدخل كلمة المرور..."
                                disabled={isLoading}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#ED1C24] transition-colors"
                            >
                                <span className="material-symbols-outlined">
                                    {showPassword ? 'visibility' : 'visibility_off'}
                                </span>
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/15 border border-red-100 dark:border-red-900/30 rounded-2xl text-[13px] text-red-600 dark:text-red-400 font-bold flex items-center gap-3 animate-shake justify-end">
                            {error}
                            <span className="material-symbols-outlined text-lg">error</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={!username.trim() || !password.trim() || isLoading}
                        className="w-full py-4.5 bg-[#ED1C24] hover:bg-[#C62828] disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-2xl transition-all shadow-xl shadow-red-500/25 flex items-center justify-center gap-3 text-lg leading-none active:scale-[0.97] hover:-translate-y-0.5"
                    >
                        {isLoading ? (
                            <>
                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                <span>جاري تسجيل الدخول...</span>
                            </>
                        ) : (
                            <>
                                <span>دخول للنظام</span>
                                <span className="material-symbols-outlined">login</span>
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-10 pt-8 border-t border-slate-100 dark:border-[#334155] text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-400 font-bold text-xs uppercase tracking-tighter">
                        <span className="material-symbols-outlined text-[1rem]">lock</span>
                        نظام مشفر ومحمي
                        <span className="mx-1 opacity-30">|</span>
                        <span>v1.0.2</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;