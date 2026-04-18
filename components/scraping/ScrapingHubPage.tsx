import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext, AutomationConfig } from '../../AppContext';

const ScrapingHubPage = () => {
    const { automationConfig, updateAutomationConfig } = useAppContext();
    const navigate = useNavigate();
    const [isSaving, setIsSaving] = useState(false);
    const [triggerSuccess, setTriggerSuccess] = useState(false);
    const [previewTriggerSuccess, setPreviewTriggerSuccess] = useState(false);
    const [isRunningNow, setIsRunningNow] = useState(false);
    const [isRunningPreview, setIsRunningPreview] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [showManual, setShowManual] = useState(false);
    const [activityLogs, setActivityLogs] = useState<Array<{time: string; message: string; type: string}>>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const logsEndRef = useRef<HTMLDivElement | null>(null);

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
    const isCloud = config.scrapingMethod === 'cloud';

    // Track statusMessage changes for live activity log
    useEffect(() => {
        if (config.statusMessage) {
            const now = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const msgType = config.statusMessage.includes('❌') ? 'error'
                : config.statusMessage.includes('✅') ? 'success'
                : config.statusMessage.includes('⚠️') ? 'warning'
                : 'info';
            setActivityLogs(prev => {
                const last = prev[prev.length - 1];
                if (last && last.message === config.statusMessage) return prev;
                return [...prev, { time: now, message: config.statusMessage!, type: msgType }].slice(-20);
            });
        }
        if (config.workerStatus === 'idle' || config.workerStatus === 'done') {
            // Keep logs visible for review
        }
    }, [config.statusMessage, config.workerStatus]);

    // Auto-scroll logs
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activityLogs]);
    
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
            // 1. If cloud mode, try to ping the server FIRST to see if it's alive/well-configured
            if (isCloud && config.cloudServerUrl) {
                try {
                    const response = await fetch(`${config.cloudServerUrl}/start-job`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': config.apiSecret || 'tawseel-scraper-2024'
                        },
                        body: JSON.stringify({ trigger: 'manual' })
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData.error || `Server returned ${response.status}`);
                    }
                } catch (fetchErr: any) {
                    console.error("Cloud server error:", fetchErr);
                    alert(`❌ فشل التواصل بالخادم السحابي:\n${fetchErr.message}\n\nتأكد من الرابط ومن أن الخادم يعمل في Render.`);
                    setIsRunningNow(false);
                    return;
                }
            }

            // 2. Only if the ping succeeded (or not in cloud mode), update Firestore trigger
            await updateAutomationConfig({
                forceRunTrigger: new Date().toISOString(),
                workerStatus: 'running'
            });

            setTriggerSuccess(true);
            setTimeout(() => setTriggerSuccess(false), 5000);
        } catch (error: any) {
            console.error("Failed to trigger run now", error);
            alert(`❌ فشل بدء العملية: ${error.message}`);
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

            // If cloud mode, also ping the Render server
            if (isCloud && config.cloudServerUrl) {
                try {
                    await fetch(`${config.cloudServerUrl}/start-job`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': config.apiSecret || 'tawseel-scraper-2024'
                        },
                        body: JSON.stringify({ trigger: 'preview' })
                    });
                } catch (fetchErr) {
                    console.warn("Cloud server ping failed:", fetchErr);
                }
            }

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
        <label className="flex items-center gap-3 p-3 border border-slate-200 dark:border-slate-700/50 rounded-xl cursor-pointer hover:bg-white dark:hover:bg-slate-800 transition-all shadow-sm bg-slate-50 dark:bg-slate-800/50">
            <input
                type="checkbox"
                checked={config.modules[id]}
                onChange={() => handleModuleToggle(id)}
                className="w-5 h-5 text-blue-600 rounded-md border-slate-300 focus:ring-blue-500 transition-colors"
            />
            <div className="flex items-center gap-3 font-bold text-sm text-slate-700 dark:text-slate-300">
                <div className={`size-8 rounded-lg flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm`}>
                    <span className={`material-symbols-outlined text-lg ${color}`}>{icon}</span>
                </div>
                {label}
            </div>
        </label>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-blue-500">memory</span>
                        مركز الأتمتة والسحب الآلي
                    </h1>
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-2">
                        لوحة التحكم المركزية بالخادم الآلي ({isCloud ? 'السحابي' : 'المحلي'}) الذي يعمل في الخلفية لسحب ومطابقة البيانات
                    </p>
                </div>
                <button
                    onClick={() => setShowManual(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-xl font-bold border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-all shadow-sm"
                >
                    <span className="material-symbols-outlined">menu_book</span>
                    دليل الاستخدام (كيف يعمل النظام)
                </button>
            </div>

            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                            <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">{isCloud ? 'cloud' : 'smart_toy'}</span>
                            التحكم بالخادم المطابق ({isCloud ? 'Cloud' : 'Worker'})
                        </h2>
                    </div>
                    {/* Status badge */}
                    <div className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 border shadow-sm ${
                        isStuck
                            ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300 animate-pulse'
                            : config.workerStatus === 'running'
                                ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300'
                                : (config.workerStatus as any) === 'preview_ready'
                                    ? 'bg-cyan-50 border-cyan-200 text-cyan-700 dark:bg-cyan-900/30 dark:border-cyan-800 dark:text-cyan-300'
                                    : config.workerStatus === 'error'
                                        ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300'
                                        : config.workerStatus === 'asleep'
                                            ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-300'
                                            : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300'
                    }`}>
                        {isStuck ? (
                            <>
                                <span className="material-symbols-outlined text-lg">error</span>
                                <div className="text-right">
                                    <div>يبدو أن العملية عالقة!</div>
                                    <div className="text-[10px] font-bold opacity-80">منذ {formatElapsedTime(elapsedSeconds)}</div>
                                </div>
                            </>
                        ) : config.workerStatus === 'running' ? (
                            <>
                                <span className="material-symbols-outlined animate-spin text-lg">sync</span>
                                <div className="text-right">
                                    <div>جاري السحب {isCloud ? '(سحابي)' : ''}...</div>
                                    {elapsedSeconds > 0 && (
                                        <div className="text-[10px] font-bold opacity-80">⏱ {formatElapsedTime(elapsedSeconds)}</div>
                                    )}
                                </div>
                            </>
                        ) : (config.workerStatus as any) === 'preview_ready' ? (
                            <>
                                <span className="material-symbols-outlined text-lg">preview</span>
                                <div className="text-right">
                                    <div>بيانات جاهزة للمعاينة</div>
                                    <div className="text-[10px] font-bold opacity-80">اضغط للمعاينة</div>
                                </div>
                            </>
                        ) : config.workerStatus === 'error' ? (
                            <>
                                <span className="material-symbols-outlined text-lg">error</span>
                                توقف بسبب خطأ
                            </>
                        ) : config.workerStatus === 'asleep' ? (
                            <>
                                <span className="material-symbols-outlined text-lg">snooze</span>
                                المتصفح الخفي مغلق (نائم)
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-lg">{isCloud ? 'cloud_done' : 'verified'}</span>
                                {isCloud ? 'الربط السحابي جاهز' : 'مستعد ينتظر الموعد'}
                            </>
                        )}
                    </div>
                </div>

                {/* Live Activity Log Panel */}
                {(config.workerStatus === 'running' || config.workerStatus === 'error' || config.workerStatus === 'done' || activityLogs.length > 0) && (
                    <div className="mx-6 mt-4 bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
                            <div className="flex items-center gap-2">
                                <div className={`size-3 rounded-full ${config.workerStatus === 'running' ? 'bg-green-400 animate-pulse' : config.workerStatus === 'error' ? 'bg-red-400' : 'bg-blue-400'}`} />
                                <span className="text-sm font-black text-white">📡 سجل العمليات المباشر</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {config.workerStatus === 'running' && (
                                    <span className="text-[10px] font-mono text-green-400 animate-pulse">● LIVE</span>
                                )}
                                <button
                                    onClick={() => setActivityLogs([])}
                                    className="text-[10px] text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 transition-all"
                                >
                                    مسح
                                </button>
                            </div>
                        </div>
                        <div className="max-h-48 overflow-y-auto p-3 space-y-1 font-mono text-xs" dir="rtl">
                            {activityLogs.length === 0 ? (
                                <div className="text-slate-500 text-center py-4">بانتظار بدء العملية...</div>
                            ) : (
                                activityLogs.map((log, i) => (
                                    <div key={i} className={`flex items-start gap-2 py-1 px-2 rounded ${
                                        log.type === 'error' ? 'bg-red-900/30 text-red-300'
                                        : log.type === 'success' ? 'bg-green-900/30 text-green-300'
                                        : log.type === 'warning' ? 'bg-yellow-900/30 text-yellow-300'
                                        : 'text-slate-300'
                                    }`}>
                                        <span className="text-slate-500 text-[10px] whitespace-nowrap mt-0.5">[{log.time}]</span>
                                        <span>{log.message}</span>
                                    </div>
                                ))
                            )}
                            <div ref={logsEndRef} />
                        </div>
                    </div>
                )}

                <div className="p-6 space-y-8">
                    {/* Main control switch */}
                    <div className="flex items-center justify-between p-5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="flex gap-4 items-center">
                            <div className={`size-12 rounded-2xl flex items-center justify-center shadow-lg transform transition-transform ${config.isEnabled ? 'bg-emerald-500 scale-110' : 'bg-slate-300 dark:bg-slate-600 grayscale'}`}>
                                <span className="material-symbols-outlined text-white text-2xl">published_with_changes</span>
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white">تفعيل الجدولة التلقائية</h3>
                                <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-1">
                                    السماح {isCloud ? 'للربط السحابي' : 'للخادم المحلي'} بالبدء في السحب التلقائي يومياً في الموعد المختار.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => handleSave({ isEnabled: !config.isEnabled })}
                            className={`relative w-16 h-8 rounded-full transition-all flex items-center px-1 shadow-inner ${config.isEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                        >
                            <div className={`size-6 rounded-full bg-white shadow-md transition-transform ${config.isEnabled ? 'translate-x-8' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {/* Schedule options */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <label className="text-sm font-black text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                                    <span className="material-symbols-outlined text-sm">schedule</span>
                                </div>
                                موعد السحب اليومي
                            </label>
                            <input
                                type="time"
                                value={config.runTimeHHMM}
                                onChange={(e) => handleSave({ runTimeHHMM: e.target.value })}
                                disabled={isSaving || !config.isEnabled}
                                className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-bold text-lg disabled:opacity-50 text-center tracking-widest shadow-inner transition-all"
                            />
                        </div>

                        <div className="space-y-3 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <label className="text-sm font-black text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <div className="size-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600">
                                    <span className="material-symbols-outlined text-sm">history</span>
                                </div>
                                آخر عملية سحب ناجحة
                            </label>
                            <div className="w-full p-3 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-800/50 flex flex-col items-center justify-center rounded-xl h-[56px] shadow-sm">
                                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                                    {config.lastSuccess ? new Date(config.lastSuccess).toLocaleString('ar-SA') : 'لم يتم التشغيل أبداً'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Cloud Server Settings (only in cloud mode) */}
                    {isCloud && (
                        <div className="bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 p-5 rounded-2xl border border-cyan-200 dark:border-cyan-800 shadow-sm space-y-4">
                            <h3 className="text-lg font-black text-cyan-700 dark:text-cyan-400 flex items-center gap-2">
                                <div className="size-9 rounded-xl bg-cyan-100 dark:bg-cyan-900/50 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-cyan-600">cloud</span>
                                </div>
                                إعدادات الخادم السحابي (Render)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-600 dark:text-slate-400">رابط الخادم السحابي (Server URL)</label>
                                    <input
                                        type="url"
                                        placeholder="https://my-tawseel-scraper.onrender.com"
                                        value={config.cloudServerUrl || ''}
                                        onChange={(e) => handleSave({ cloudServerUrl: e.target.value })}
                                        className="w-full p-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-cyan-500 font-mono text-sm ltr text-left shadow-inner transition-all"
                                        dir="ltr"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-600 dark:text-slate-400">مفتاح API السري</label>
                                    <input
                                        type="password"
                                        placeholder="tawseel-scraper-2024"
                                        value={config.apiSecret || ''}
                                        onChange={(e) => handleSave({ apiSecret: e.target.value })}
                                        className="w-full p-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-cyan-500 font-mono text-sm ltr text-left shadow-inner transition-all"
                                        dir="ltr"
                                    />
                                </div>
                            </div>
                            <p className="text-[11px] font-bold text-cyan-600 dark:text-cyan-500 flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">info</span>
                                الصق رابط خادمك من منصة Render هنا. سيقوم النظام بإيقاظ الخادم وإرسال أمر السحب إليه مباشرة.
                            </p>
                        </div>
                    )}

                    {/* Modules categories */}
                    <div className="space-y-5">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-slate-400 text-2xl">checklist</span>
                            الوحدات والمهام المجدولة المتاحة للسحب
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Banks Category */}
                            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                                <h4 className="font-black text-blue-600 dark:text-blue-400 flex items-center gap-2 text-lg">
                                    <div className="size-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                        <span className="material-symbols-outlined">account_balance</span>
                                    </div>
                                    البنوك والحسابات (6000)
                                </h4>
                                <div className="space-y-3">
                                    <ModuleCheckbox id="banks_recon" label="سحب أرصدة البنوك للمطابقة" icon="account_balance_wallet" color="text-blue-500" />
                                    <ModuleCheckbox id="banks_liquidity" label="سحب الحركات اليومية للبنوك" icon="receipt_long" color="text-blue-600" />
                                </div>
                            </div>

                            {/* Restaurants Category */}
                            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                                <h4 className="font-black text-rose-600 dark:text-rose-400 flex items-center gap-2 text-lg">
                                    <div className="size-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                                        <span className="material-symbols-outlined">restaurant</span>
                                    </div>
                                    المطاعم والمديونيات (2000)
                                </h4>
                                <div className="space-y-3">
                                    <ModuleCheckbox id="restaurants_data" label="مسح شامل لبيانات المطاعم" icon="storefront" color="text-rose-400" />
                                    <ModuleCheckbox id="restaurants_payments" label="سحب أرصدة المطاعم الدائنة والمدينة" icon="payments" color="text-rose-500" />
                                    <ModuleCheckbox id="restaurants_statements" label="سحب كشوفات الحساب بصيغة PDF" icon="picture_as_pdf" color="text-rose-600" />
                                </div>
                            </div>

                            {/* Employees Category */}
                            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                                <h4 className="font-black text-amber-600 dark:text-amber-400 flex items-center gap-2 text-lg">
                                    <div className="size-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                        <span className="material-symbols-outlined">group</span>
                                    </div>
                                    الموظفين والكباتن
                                </h4>
                                <div className="space-y-3">
                                    <ModuleCheckbox id="employees_data" label="سحب ملفات الموظفين (السلف، القروض)" icon="badge" color="text-amber-500" />
                                    <ModuleCheckbox id="couriers_data" label="سحب بيانات الكباتن (الاسم المستعار، اللوحة)" icon="two_wheeler" color="text-orange-500" />
                                </div>
                            </div>

                            {/* Expenses Category */}
                            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                                <h4 className="font-black text-purple-600 dark:text-purple-400 flex items-center gap-2 text-lg">
                                    <div className="size-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                        <span className="material-symbols-outlined">request_quote</span>
                                    </div>
                                    المصروفات والعمليات
                                </h4>
                                <div className="space-y-3">
                                    <ModuleCheckbox id="expenses_data" label="سحب المصروفات المركزية والسيالة" icon="list_alt" color="text-purple-500" />
                                    <ModuleCheckbox id="expenses_pdfs" label="أرشفة فواتير المصروفات تلقائياً (PDF)" icon="save" color="text-purple-600" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Action */}
                    <div className="pt-6 border-t border-slate-200 dark:border-slate-700 space-y-4">
                        {triggerSuccess && (
                            <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 rounded-xl animate-fade-in shadow-sm">
                                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-3xl">check_circle</span>
                                <div>
                                    <p className="font-black text-emerald-800 dark:text-emerald-300">✅ الإشارة أُرسلت بنجاح!</p>
                                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1">سيبدأ الخادم {isCloud ? 'السحابي' : 'المخفي'} باستقبال الطلب حالا ويبدأ السحب.</p>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button
                                onClick={runNow}
                                disabled={isRunningNow || isSaving}
                                className="w-full flex justify-center items-center gap-3 py-4 rounded-xl font-black text-lg transition-all shadow-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                            >
                                {isRunningNow ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-2xl">sync</span>
                                        جاري التواصل بالخادم...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-2xl">rocket_launch</span>
                                        سحب الآن (مباشرة)
                                    </>
                                )}
                            </button>

                            <button
                                onClick={runPreview}
                                disabled={isRunningPreview || isRunningNow || isSaving}
                                className="w-full flex justify-center items-center gap-3 py-4 rounded-xl font-black text-lg transition-all shadow-md bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                            >
                                {isRunningPreview ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-2xl">sync</span>
                                        يتم السحب للمعاينة...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-2xl">preview</span>
                                        سحب تجريبي (بدون حفظ نهائي)
                                    </>
                                )}
                            </button>
                        </div>

                        {isStuck && (
                            <div className="flex justify-between items-center p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl animate-fade-in shadow-sm">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-2xl">warning</span>
                                    <div>
                                        <p className="font-bold text-red-800 dark:text-red-300 text-sm">⚠️ النظام معلق منذ {formatElapsedTime(elapsedSeconds)}</p>
                                        <p className="text-[11px] font-bold text-red-600 dark:text-red-400 mt-1">تأكد من شاشة الـ Worker لديك، إذا كان متوقفاً اضغط زر الاسترداد.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={resetWorkerStatus}
                                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm transition-all shadow-md"
                                >
                                    فرض إيقاف العملية
                                </button>
                            </div>
                        )}
                        {config.workerStatus === 'running' && !isRunningNow && !isStuck && (
                            <button
                                onClick={resetWorkerStatus}
                                className="w-full flex justify-center items-center gap-2 py-3 rounded-xl font-bold transition-all border-2 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm"
                            >
                                <span className="material-symbols-outlined text-lg">cancel</span>
                                إيقاف السحب يدوياً
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* User Manual Modal */}
            {showManual && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                            <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-indigo-500">menu_book</span>
                                الدليل الشامل لنظام السحب
                            </h2>
                            <button onClick={() => setShowManual(false)} className="p-2 bg-slate-200 dark:bg-slate-700 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                        <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar">
                            
                            <section>
                                <h3 className="text-lg font-black text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined">route</span>
                                    رحلة البيانات (من أين وإلى أين؟)
                                </h3>
                                <div className="space-y-4">
                                    <div className="flex gap-4 items-start p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                                        <div className="size-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-xl">account_balance</span>
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800 dark:text-white text-base">حسابات البنوك وصناديق الفروع (Д 6000)</p>
                                            <p className="text-sm font-bold text-slate-500 mt-1 leading-relaxed">
                                                يقوم الخادم بالدخول لصفحة القوائم المالية للبنوك في النظام المحاسبي وسحب الدائن والمدين.
                                                تنعكس هذه البيانات فوراً في <strong className="text-blue-500">لوحة المطابقة البنكية وصندوق العمليات</strong> لضمان أن كل تحويل قد تم تسجيله وتقييده، وكشف النقص أو الفائض بألوان مميزة.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 items-start p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                                        <div className="size-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-xl">restaurant</span>
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800 dark:text-white text-base">المطاعم والمديونيات (Д 2000)</p>
                                            <p className="text-sm font-bold text-slate-500 mt-1 leading-relaxed">
                                                يتم سحب كل مطعم بصورته، بياناته، توقيتاته ونسبته، بالإضافة إلى الرصيد (كم يجب أن نسدد للمطعم). 
                                                تذهب هذه البيانات إلى قسم <strong className="text-rose-500">سداد المطاعم</strong> لإنشاء فواتير السداد تلقائياً دون الحاجة للإدخال اليدوي، كما نضيف المطاعم الجديدة فوراً لصفحة "المطاعم (Restaurants)".
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 items-start p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                                        <div className="size-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-xl">two_wheeler</span>
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800 dark:text-white text-base">المناديب والكباتن (المتعاونين)</p>
                                            <p className="text-sm font-bold text-slate-500 mt-1 leading-relaxed">
                                                يتم سحب أسمائهم، الفروع التي ينتمون إليها، ولوحات دراجاتهم لربطها بالحوالات. يفيدنا هذا في عمليات قصف العهد وكشف أي كابتن عليه عجز أو مطلوب مبالغ.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-lg font-black text-emerald-600 dark:text-emerald-400 mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined">shield_person</span>
                                    الأمان والنصائح للحفاظ على النظام
                                </h3>
                                <ul className="space-y-3">
                                    <li className="flex gap-3 text-sm font-bold text-slate-600 dark:text-slate-400 p-2">
                                        <span className="material-symbols-outlined text-emerald-500">check_circle</span>
                                        إذا تم اختيار طريقة سحب الخادم المحلي (Worker) في إعدادات إدارة الجلسة، فيجب عليك إبقاء شاشة سطر الأوامر (Terminal) المخصصة للسحب مفتوحة في السيرفر.
                                    </li>
                                    <li className="flex gap-3 text-sm font-bold text-slate-600 dark:text-slate-400 p-2">
                                        <span className="material-symbols-outlined text-emerald-500">check_circle</span>
                                        السحب التجريبي ممتاز عندما تريد التأكد من أن التحديث الأخير للنظام المحاسبي لم يكسر الكود أو الجداول لدينا قبل الاعتماد.
                                    </li>
                                    <li className="flex gap-3 text-sm font-bold text-slate-600 dark:text-slate-400 p-2">
                                        <span className="material-symbols-outlined text-amber-500">warning</span>
                                        تجنب إغلاق المتصفح الخفي (Chromium) المفتوح من قِبل الـ Worker وأنت داخل السيرفر! 
                                    </li>
                                </ul>
                            </section>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
                            <button onClick={() => setShowManual(false)} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl font-bold transition-colors">
                                حسناً، فهمت الاستخدام
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScrapingHubPage;
