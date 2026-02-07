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
        <div className="min-h-screen flex items-center justify-center bg-[#102218] p-4 animate-fade-in">
            <div className="bg-white dark:bg-[#162a1f] w-full max-w-md p-8 rounded-2xl shadow-2xl border border-slate-200 dark:border-[#223d2d] relative overflow-hidden">
                {/* Decorative Background Element */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#13ec6d] to-blue-500"></div>

                <div className="text-center mb-8">
                    <div className="size-16 bg-[#13ec6d]/20 text-[#13ec6d] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-neon">
                        <span className="material-symbols-outlined text-4xl">account_balance_wallet</span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white">تسجيل الدخول</h1>
                    <p className="text-slate-500 text-sm mt-2">نظام المطابقة المالية الموحد</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                            اسم المستخدم
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={username}
                                onChange={e => {
                                    setUsername(e.target.value);
                                    setError('');
                                }}
                                className={`w-full px-4 py-3 rounded-xl border ${error ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 dark:border-[#223d2d] focus:ring-[#13ec6d]'} bg-white dark:bg-[#112218] text-slate-900 dark:text-white focus:ring-2 transition-all outline-none`}
                                placeholder="أدخل اسم المستخدم..."
                                autoFocus
                                disabled={isLoading}
                            />
                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">person</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                            كلمة المرور
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={e => {
                                    setPassword(e.target.value);
                                    setError('');
                                }}
                                className={`w-full px-4 py-3 rounded-xl border ${error ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 dark:border-[#223d2d] focus:ring-[#13ec6d]'} bg-white dark:bg-[#112218] text-slate-900 dark:text-white focus:ring-2 transition-all outline-none`}
                                placeholder="أدخل كلمة المرور..."
                                disabled={isLoading}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#13ec6d] transition-colors"
                            >
                                <span className="material-symbols-outlined">
                                    {showPassword ? 'visibility' : 'visibility_off'}
                                </span>
                            </button>
                        </div>
                    </div>

                    {error && (
                        <p className="text-xs text-red-500 font-bold flex items-center gap-1 animate-pulse">
                            <span className="material-symbols-outlined text-sm">error</span>
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={!username.trim() || !password.trim() || isLoading}
                        className="w-full py-3 bg-[#13ec6d] hover:bg-[#10c95d] disabled:opacity-50 disabled:cursor-not-allowed text-[#102218] font-bold rounded-xl transition-all shadow-lg shadow-[#13ec6d]/20 flex items-center justify-center gap-2"
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

                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-[#223d2d] text-center text-xs text-slate-400">
                    <p>💡 للاستخدام الداخلي فقط</p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;