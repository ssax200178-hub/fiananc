import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext, AutomationConfig } from '../AppContext';

const AutomationSettingsTab = () => {
    const { automationConfig, updateAutomationConfig } = useAppContext();
    const navigate = useNavigate();
    const [isSaving, setIsSaving] = useState(false);
    const [triggerSuccess, setTriggerSuccess] = useState(false);
    const [previewTriggerSuccess, setPreviewTriggerSuccess] = useState(false);
    const [isRunningNow, setIsRunningNow] = useState(false);
    const [isRunningPreview, setIsRunningPreview] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Default configuration if null
    const config: AutomationConfig = automationConfig || {
        isEnabled: false,
        runTimeHHMM: '03:00',
        modules: {
            banks_recon: true,
            banks_liquidity: true,
            restaurants_data: true,
            restaurants_payments: true,
            restaurants_liquidity: true,
            restaurants_statements: true,
            couriers_data: true,
            employees_data: true,
            employees_balances: true,
            expenses_data: true,
            expenses_pdfs: true
        },
        workerStatus: 'idle'
    };

    // Track elapsed time when worker is running
    useEffect(() => {
        if (config.workerStatus === 'running' && config.forceRunTrigger) {
            const startTime = new Date(config.forceRunTrigger).getTime();
            
            const updateElapsed = () => {
                const now = Date.now();
                setElapsedSeconds(Math.floor((now - startTime) / 1000));
            };
            
            updateElapsed(); // Initial
            timerRef.current = setInterval(updateElapsed, 1000);
            
            return () => {
                if (timerRef.current) clearInterval(timerRef.current);
            };
        } else {
            setElapsedSeconds(0);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    }, [config.workerStatus, config.forceRunTrigger]);

    // Is the worker stuck? (running for more than 10 minutes)
    const isStuck = config.workerStatus === 'running' && elapsedSeconds > 600;
    
    const formatElapsedTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins === 0) return `${secs} ثانية`;
        return `${mins} دقيقة و ${secs} ثانية`;
    };

    const handleSave = async (updates: Partial<AutomationConfig>) => {
        setIsSaving(true);
        try {
            await updateAutomationConfig(updates);
        } catch (error) {
            console.error("Failed to save automation config", error);
            alert('❌ فشل حفظ الإعدادات');
        } finally {
            setIsSaving(false);
        }
    };

    const runNow = async () => {
        setIsRunningNow(true);
        setTriggerSuccess(false);
        try {
            await updateAutomationConfig({
                forceRunTrigger: new Date().toISOString(),
                workerStatus: 'running'
            });
            setTriggerSuccess(true);
            setTimeout(() => setTriggerSuccess(false), 5000);
        } catch (error) {
            console.error("Failed to trigger run", error);
            alert('❌ فشل إرسال أمر السحب الفوري');
        } finally {
            setIsRunningNow(false);
        }
    };

    const resetWorkerStatus = async () => {
        try {
            await updateAutomationConfig({ workerStatus: 'idle' });
        } catch (error) {
            console.error("Failed to reset worker status", error);
        }
    };

    const runPreview = async () => {
        setIsRunningPreview(true);
        setPreviewTriggerSuccess(false);
        try {
            await updateAutomationConfig({
                forceRunTrigger: new Date().toISOString(),
                workerStatus: 'running',
                previewMode: true
            });
            setPreviewTriggerSuccess(true);
            setTimeout(() => setPreviewTriggerSuccess(false), 5000);
        } catch (error) {
            console.error("Failed to trigger preview run", error);
            alert('❌ فشل إرسال أمر السحب مع المعاينة');
        } finally {
            setIsRunningPreview(false);
        }
    };

    const handleModuleToggle = (moduleName: keyof typeof config.modules) => {
        handleSave({
            modules: {
                ...config.modules,
                [moduleName]: !config.modules[moduleName]
            }
        });
    };

    const ModuleCheckbox = ({ id, label, icon, color }: { id: keyof typeof config.modules, label: string, icon: string, color: string }) => (
        <label className="flex items-center gap-3 p-2.5 border border-slate-100 dark:border-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <input
                type="checkbox"
                checked={config.modules[id]}
                onChange={() => handleModuleToggle(id)}
                className={`size-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500`}
            />
            <div className="flex items-center gap-2 text-[13px] font-medium text-slate-700 dark:text-slate-300">
                <span className={`material-symbols-outlined ${color} text-lg`}>{icon}</span>
                {label}
            </div>
        </label>
    );

    return (
        <div className="space-y-6 max-w-5xl">
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-900/20 dark:to-emerald-900/20 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                            <span className="material-symbols-outlined text-teal-600 dark:text-teal-400">smart_toy</span>
                            الأتمتة والسحب الآلي (الخادم المحلي)
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            تحكم في إعدادات الخادم الخفي (Worker) الذي يعمل في الخلفية لسحب البيانات وتنزيل كشوفات الحسابات.
                        </p>
                    </div>
                    {/* Status badge */}
                    <div className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 ${
                        isStuck
                            ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 animate-pulse'
                            : config.workerStatus === 'running'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                : (config.workerStatus as any) === 'preview_ready'
                                    ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300'
                                    : config.workerStatus === 'error'
                                        ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                        : config.workerStatus === 'asleep'
                                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                                            : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                    }`}>
                        {isStuck ? (
                            <>
                                <span className="material-symbols-outlined text-sm">error</span>
                                <div className="text-right">
                                    <div>يبدو أن العملية عالقة!</div>
                                    <div className="text-[10px] font-normal opacity-75">منذ {formatElapsedTime(elapsedSeconds)}</div>
                                </div>
                            </>
                        ) : config.workerStatus === 'running' ? (
                            <>
                                <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                                <div className="text-right">
                                    <div>جاري مسح وسحب البيانات...</div>
                                    {elapsedSeconds > 0 && (
                                        <div className="text-[10px] font-normal opacity-75">⏱ {formatElapsedTime(elapsedSeconds)}</div>
                                    )}
                                </div>
                            </>
                        ) : (config.workerStatus as any) === 'preview_ready' ? (
                            <>
                                <span className="material-symbols-outlined text-sm">preview</span>
                                <div className="text-right">
                                    <div>بيانات جاهزة للمعاينة</div>
                                    <div className="text-[10px] font-normal opacity-75">اضغط للمعاينة</div>
                                </div>
                            </>
                        ) : config.workerStatus === 'error' ? (
                            <>
                                <span className="material-symbols-outlined text-sm">error</span>
                                توقف بسبب خطأ
                            </>
                        ) : config.workerStatus === 'asleep' ? (
                            <>
                                <span className="material-symbols-outlined text-sm">snooze</span>
                                المتصفح الخفي مغلق (نائم)
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-sm">notifications</span>
                                ينتظر الموعد...
                            </>
                        )}
                    </div>
                </div>

                <div className="p-6 space-y-8">
                    {/* Main control switch */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">تفعيل الجدولة التلقائية</h3>
                            <p className="text-sm text-slate-500 mt-1">
                                السماح للخادم المحلي بالسحب التلقائي في المواعيد المحددة. إذا تم التعطيل، فلن يتم السحب التلقائي.
                            </p>
                        </div>
                        <button
                            onClick={() => handleSave({ isEnabled: !config.isEnabled })}
                            className={`relative w-14 h-8 rounded-full transition-all flex items-center px-1 ${config.isEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                        >
                            <div className={`size-6 rounded-full bg-white shadow-md transition-transform ${config.isEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {/* Schedule options */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm text-slate-400">schedule</span>
                                موعد السحب اليومي
                            </label>
                            <input
                                type="time"
                                value={config.runTimeHHMM}
                                onChange={(e) => handleSave({ runTimeHHMM: e.target.value })}
                                disabled={isSaving || !config.isEnabled}
                                className="w-full p-3 bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:border-teal-500 font-bold text-sm disabled:opacity-50 text-right"
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm text-slate-400">history</span>
                                آخر عملية سحب ناجحة
                            </label>
                            <div className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 flex items-center justify-between rounded-xl">
                                <span className="font-mono text-slate-600 dark:text-slate-400 text-sm">
                                    {config.lastSuccess ? new Date(config.lastSuccess).toLocaleString('ar-SA') : 'لم يتم التشغيل أبداً'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Modules categories */}
                    <div className="space-y-5">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">
                            الوحدات والمهام المجدولة
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Banks Category */}
                            <div className="bg-slate-50/50 dark:bg-slate-800/30 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-4">
                                <h4 className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-xl">account_balance</span>
                                    البنوك
                                </h4>
                                <div className="space-y-2">
                                    <ModuleCheckbox id="banks_recon" label="سحب أرصدة البنوك للمطابقة" icon="account_balance_wallet" color="text-blue-500" />
                                    <ModuleCheckbox id="banks_liquidity" label="سحب أرصدة البنوك لمراجعة السيولة" icon="equalizer" color="text-blue-400" />
                                </div>
                            </div>

                            {/* Restaurants Category */}
                            <div className="bg-slate-50/50 dark:bg-slate-800/30 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-4">
                                <h4 className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-xl">restaurant</span>
                                    المطاعم
                                </h4>
                                <div className="space-y-2">
                                    <ModuleCheckbox id="restaurants_data" label="سحب بيانات المطاعم جميع الفروع" icon="database" color="text-rose-500" />
                                    <ModuleCheckbox id="restaurants_payments" label="سحب أرصدة المطاعم لصفحة السداد" icon="payments" color="text-rose-400" />
                                    <ModuleCheckbox id="restaurants_liquidity" label="سحب أرصدة المطاعم لمراجعة السيولة" icon="monitoring" color="text-rose-300" />
                                    <ModuleCheckbox id="restaurants_statements" label="سحب كشوفات حساب المطاعم PDF" icon="picture_as_pdf" color="text-rose-600" />
                                </div>
                            </div>

                            {/* Couriers Category */}
                            <div className="bg-slate-50/50 dark:bg-slate-800/30 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-4">
                                <h4 className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-xl">local_shipping</span>
                                    الموصلين
                                </h4>
                                <div className="space-y-2">
                                    <ModuleCheckbox id="couriers_data" label="سحب بيانات الموصلين جميع الفروع" icon="group" color="text-indigo-500" />
                                    <div className="p-3 bg-white/50 dark:bg-slate-900/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-center text-[12px] text-slate-400 italic">
                                        سيتم إضافة مهام أخرى لاحقاً
                                    </div>
                                </div>
                            </div>

                            {/* Employees Category */}
                            <div className="bg-slate-50/50 dark:bg-slate-800/30 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-4">
                                <h4 className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-xl">group</span>
                                    الموظفين
                                </h4>
                                <div className="space-y-2">
                                    <ModuleCheckbox id="employees_data" label="سحب بيانات الموظفين جميع الفروع" icon="badge" color="text-amber-500" />
                                    <ModuleCheckbox id="employees_balances" label="سحب أرصدة الموظفين وإضافتها للملف" icon="account_balance_wallet" color="text-amber-400" />
                                </div>
                            </div>

                            {/* Expenses Category */}
                            <div className="bg-slate-50/50 dark:bg-slate-800/30 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-4">
                                <h4 className="font-bold text-purple-600 dark:text-purple-400 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-xl">receipt_long</span>
                                    المصروفات
                                </h4>
                                <div className="space-y-2">
                                    <ModuleCheckbox id="expenses_data" label="سحب المصروفات والسيالة" icon="list_alt" color="text-purple-500" />
                                    <ModuleCheckbox id="expenses_pdfs" label="سحب فواتير/سندات المصروفات (PDF)" icon="picture_as_pdf" color="text-purple-600" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Action */}
                    <div className="pt-6 border-t border-slate-200 dark:border-slate-700 space-y-3">
                        {/* Success feedback */}
                        {triggerSuccess && (
                            <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 rounded-xl animate-fade-in">
                                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-xl">check_circle</span>
                                <div>
                                    <p className="font-bold text-emerald-800 dark:text-emerald-300 text-sm">✅ تم إرسال أمر السحب الفوري بنجاح!</p>
                                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">سيبدأ الخادم المحلي بالعمل فوراً عند اكتشاف الأمر.</p>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={runNow}
                            disabled={isRunningNow || isSaving}
                            className="w-full flex justify-center items-center gap-2 py-4 rounded-xl font-bold transition-all shadow-md bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                        >
                            {isRunningNow ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-xl">sync</span>
                                    جاري إرسال أمر السحب...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined">bolt</span>
                                    إجبار السحب الفوري الآن (مع التصدير للـ PDF)
                                </>
                            )}
                        </button>

                        {/* Preview Mode Button */}
                        <button
                            onClick={runPreview}
                            disabled={isRunningPreview || isRunningNow || isSaving}
                            className="w-full flex justify-center items-center gap-2 py-4 rounded-xl font-bold transition-all shadow-md bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                        >
                            {isRunningPreview ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-xl">sync</span>
                                    جاري إرسال أمر السحب مع المعاينة...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined">preview</span>
                                    سحب مع معاينة (مراجعة البيانات قبل الاعتماد)
                                </>
                            )}
                        </button>

                        {/* Preview Trigger Success */}
                        {previewTriggerSuccess && (
                            <div className="flex items-center gap-3 p-4 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-700/50 rounded-xl animate-fade-in">
                                <span className="material-symbols-outlined text-cyan-600 dark:text-cyan-400 text-xl">check_circle</span>
                                <div>
                                    <p className="font-bold text-cyan-800 dark:text-cyan-300 text-sm">✅ تم إرسال أمر السحب مع المعاينة!</p>
                                    <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-0.5">سيتم حفظ البيانات بشكل مؤقت لمراجعتها قبل الاعتماد. اذهب لصفحة المعاينة بعد اكتمال السحب.</p>
                                </div>
                            </div>
                        )}

                        {/* Preview Ready Banner */}
                        {(config.workerStatus as any) === 'preview_ready' && (
                            <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 border-2 border-cyan-300 dark:border-cyan-700 rounded-xl animate-fade-in">
                                <span className="material-symbols-outlined text-cyan-600 dark:text-cyan-400 text-3xl">preview</span>
                                <div className="flex-1">
                                    <p className="font-black text-cyan-800 dark:text-cyan-300 text-base">🔍 بيانات جاهزة للمعاينة!</p>
                                    <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-0.5">تم سحب البيانات وحفظها مؤقتاً. اضغط للمعاينة والاعتماد.</p>
                                </div>
                                <button
                                    onClick={() => navigate('/scrape-preview')}
                                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-bold rounded-xl transition-all shadow-lg text-sm flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-lg">open_in_new</span>
                                    فتح صفحة المعاينة
                                </button>
                            </div>
                        )}

                        {/* Stuck warning */}
                        {isStuck && (
                            <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl animate-fade-in">
                                <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-2xl">warning</span>
                                <div className="flex-1">
                                    <p className="font-bold text-red-800 dark:text-red-300 text-sm">⚠️ العملية عالقة منذ {formatElapsedTime(elapsedSeconds)}</p>
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">يبدو أن الخادم المحلي لم يتمكن من إكمال العملية. اضغط الزر أدناه لإعادة تعيين الحالة.</p>
                                </div>
                                <button
                                    onClick={resetWorkerStatus}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-sm transition-all whitespace-nowrap"
                                >
                                    إعادة تعيين
                                </button>
                            </div>
                        )}

                        {/* Reset button when running but not stuck yet */}
                        {config.workerStatus === 'running' && !isRunningNow && !isStuck && (
                            <button
                                onClick={resetWorkerStatus}
                                className="w-full flex justify-center items-center gap-2 py-3 rounded-xl font-bold transition-all border-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-sm"
                            >
                                <span className="material-symbols-outlined text-lg">restart_alt</span>
                                إعادة تعيين حالة الخادم (في حال توقف العملية)
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AutomationSettingsTab;
