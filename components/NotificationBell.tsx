import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import { safeCompare } from '../utils';

interface Notification {
    id: string;
    type: 'payment_due' | 'liquidity_deficit' | 'liquidity_warning' | 'liquidity_ok';
    title: string;
    message: string;
    severity: 'critical' | 'warning' | 'info' | 'success';
    icon: string;
    link?: string;
}

const ARABIC_MONTHS = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

// --- Sound Alert Utility ---
const playNotificationSound = (severity: 'critical' | 'warning' | 'info' | 'success') => {
    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        if (severity === 'critical') {
            // Urgent double-beep
            oscillator.frequency.setValueAtTime(880, ctx.currentTime);
            oscillator.frequency.setValueAtTime(0, ctx.currentTime + 0.15);
            oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.25);
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.setValueAtTime(0, ctx.currentTime + 0.15);
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime + 0.25);
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.5);
        } else {
            // Gentle single chime
            oscillator.frequency.setValueAtTime(660, ctx.currentTime);
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.4);
        }
    } catch {
        // Silently fail if audio context not available
    }
};

const NotificationBell: React.FC = () => {
    const navigate = useNavigate();
    const {
        restaurants,
        fundSnapshots,
        bankDefinitions,
        liquidityMappings,
        currentUser
    } = useAppContext();

    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(() => {
        try { return sessionStorage.getItem('notification_sound') !== 'off'; } catch { return true; }
    });
    const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
        try {
            const stored = sessionStorage.getItem('dismissed_notifications');
            return stored ? JSON.parse(stored) : [];
        } catch { return []; }
    });
    const [lastSoundPlayedFor, setLastSoundPlayedFor] = useState<string>('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click (only in non-expanded mode)
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!isExpanded && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, isExpanded]);

    // Close expanded on Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isExpanded) { setIsExpanded(false); }
                else if (isOpen) { setIsOpen(false); }
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen, isExpanded]);

    // Toggle sound setting
    const toggleSound = useCallback(() => {
        const newVal = !soundEnabled;
        setSoundEnabled(newVal);
        try { sessionStorage.setItem('notification_sound', newVal ? 'on' : 'off'); } catch { }
        if (newVal) playNotificationSound('info');
    }, [soundEnabled]);

    // --- Helpers (same logic as WalletLiquidityPage) ---
    const normalizeName = (name: string): string => {
        if (!name) return 'غير محدد';
        let n = name.trim();
        n = n.replace(/^(محفظة|بنك|البنك|المحفظة|حساب|الـ|ال)\s*/g, '');
        n = n.replace(/\s*(محفظة|بنك|البنك|المحفظة|حساب|ريال جديد|ريال قديم|جديد|قديم|شلن|ريال)$/g, '');
        return n.replace(/[()\\\/_.[\]]/g, '').replace(/\s+/g, '').trim() || 'غير محدد';
    };

    const getMappingForAccount = (originalType: string) => {
        return liquidityMappings.find(m => m.restaurantAccountTypes.includes(originalType));
    };

    const getMappingForBank = (bankId: string) => {
        return liquidityMappings.find(m => m.bankDefIds.includes(bankId));
    };

    const getDisplayLabel = (name: string) => {
        return name.replace(/^(محفظة|بنك|البنك|المحفظة|حساب|الـ|ال)\s*/g, '').trim();
    };

    // --- Payment Deadline Detection ---
    const paymentAlerts = useMemo((): Notification[] => {
        const canViewPayments = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('notifications_payments');
        if (!canViewPayments) return [];

        const now = new Date();
        const today = now.getDate();
        const currentMonth = now.getMonth();
        const daysInMonth = new Date(now.getFullYear(), currentMonth + 1, 0).getDate();
        const alerts: Notification[] = [];

        const activeRestaurants = (restaurants || []).filter(r => r && r.isActive !== false && (r.balance || 0) > 0);
        if (activeRestaurants.length === 0) return alerts;

        const semiMonthlyNearDeadline1 = today >= 11 && today <= 14;
        const monthlyNearDeadline = today >= (daysInMonth - 3);
        const semiMonthlyNearDeadline2 = monthlyNearDeadline;

        const monthlyRestaurants = activeRestaurants.filter(r => r.paymentPeriod === 'monthly');
        const semiMonthlyRestaurants = activeRestaurants.filter(r => r.paymentPeriod === 'semi-monthly');

        const monthName = ARABIC_MONTHS[currentMonth];

        if (monthlyNearDeadline && monthlyRestaurants.length > 0) {
            const totalOwed = monthlyRestaurants.reduce((sum, r) => sum + (r.balance || 0), 0);
            const daysLeft = daysInMonth - today;
            alerts.push({
                id: `payment_monthly_${currentMonth}`,
                type: 'payment_due',
                title: 'موعد سداد شهري قريب',
                message: `سداد ${monthlyRestaurants.length} مطعم (شهري) بعد ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'} — إجمالي ${totalOwed.toLocaleString()} ريال`,
                severity: daysLeft <= 1 ? 'critical' : 'warning',
                icon: 'event_upcoming',
                link: '/restaurant-payments'
            });
        }

        if (semiMonthlyNearDeadline1 && semiMonthlyRestaurants.length > 0) {
            const totalOwed = semiMonthlyRestaurants.reduce((sum, r) => sum + (r.balance || 0), 0);
            const daysLeft = 15 - today;
            alerts.push({
                id: `payment_semi1_${currentMonth}`,
                type: 'payment_due',
                title: `سداد نصف شهري — ${monthName} (1)`,
                message: `سداد ${semiMonthlyRestaurants.length} مطعم (نصف شهري) بعد ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'} — إجمالي ${totalOwed.toLocaleString()} ريال`,
                severity: daysLeft <= 1 ? 'critical' : 'warning',
                icon: 'event_upcoming',
                link: '/restaurant-payments'
            });
        }

        if (semiMonthlyNearDeadline2 && semiMonthlyRestaurants.length > 0) {
            const totalOwed = semiMonthlyRestaurants.reduce((sum, r) => sum + (r.balance || 0), 0);
            const daysLeft = daysInMonth - today;
            alerts.push({
                id: `payment_semi2_${currentMonth}`,
                type: 'payment_due',
                title: `سداد نصف شهري — ${monthName} (2)`,
                message: `سداد ${semiMonthlyRestaurants.length} مطعم (نصف شهري) بعد ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'} — إجمالي ${totalOwed.toLocaleString()} ريال`,
                severity: daysLeft <= 1 ? 'critical' : 'warning',
                icon: 'event_upcoming',
                link: '/restaurant-payments'
            });
        }

        return alerts;
    }, [restaurants]);

    // --- Liquidity Deficit Detection ---
    const liquidityAlerts = useMemo((): Notification[] => {
        const canViewLiquidity = currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('notifications_liquidity');
        if (!canViewLiquidity) return [];

        const alerts: Notification[] = [];

        const debtAgg: Record<string, { wallet: string; label: string; currency: string; totalOwed: number; count: number }> = {};
        (restaurants || []).forEach(r => {
            if (!r || (r.balance || 0) <= 0) return;
            const primaryAccount = r.transferAccounts?.find(a => a.isPrimary) || r.transferAccounts?.[0];
            const originalType = (primaryAccount?.type || 'غير محدد').trim();
            const currency = r.currencyType;
            const mapping = getMappingForAccount(originalType);
            const walletName = mapping ? mapping.publicName : normalizeName(originalType);
            const key = `${walletName}_${currency}`;

            if (!debtAgg[key]) {
                debtAgg[key] = { wallet: walletName, label: walletName, currency, totalOwed: 0, count: 0 };
            }
            debtAgg[key].totalOwed += (r.balance || 0);
            debtAgg[key].count += 1;
        });

        const latestSnapshot = (() => {
            if (!fundSnapshots || fundSnapshots.length === 0) return null;
            const sorted = [...fundSnapshots].sort((a, b) => safeCompare(b.fullTimestamp || b.id, a.fullTimestamp || a.id));
            return sorted.find(s => s.status === 'completed' || s.status === 'approved') || sorted[0];
        })();

        const availMap: Record<string, number> = {};
        if (latestSnapshot) {
            const allItems = [
                ...(latestSnapshot.oldRiyalItems || []),
                ...(latestSnapshot.newRiyalItems || []),
            ];
            allItems.forEach(item => {
                const bankDef = bankDefinitions.find(b => b.id === item.bankDefId);
                if (!bankDef) return;
                const mapping = getMappingForBank(bankDef.id);
                const walletName = mapping ? mapping.publicName : normalizeName(bankDef.name);
                const currency = bankDef.currency as string;
                const key = `${walletName}_${currency}`;
                availMap[key] = (availMap[key] || 0) + (item.bankBalance || 0);
            });
        }

        Object.values(debtAgg).forEach(debt => {
            const key = `${debt.wallet}_${debt.currency}`;
            const available = availMap[key] || 0;
            const variance = available - debt.totalOwed;
            const coverage = debt.totalOwed > 0 ? (available / debt.totalOwed) * 100 : 100;
            const label = getDisplayLabel(debt.label);
            const currencyLabel = debt.currency === 'new_riyal' ? 'ريال جديد' : 'ريال قديم';

            if (coverage < 50) {
                alerts.push({
                    id: `liq_critical_${key}`,
                    type: 'liquidity_deficit',
                    title: `${label} يحتاج تعزيز عاجل`,
                    message: `عجز ${Math.abs(variance).toLocaleString()} ${currencyLabel} — التغطية ${coverage.toFixed(0)}% فقط (${debt.count} مطعم)`,
                    severity: 'critical',
                    icon: 'warning',
                    link: '/liquidity-review'
                });
            } else if (coverage < 90) {
                alerts.push({
                    id: `liq_warning_${key}`,
                    type: 'liquidity_warning',
                    title: `${label} — تغطية جزئية`,
                    message: `${variance < 0 ? 'عجز' : 'فائض'} ${Math.abs(variance).toLocaleString()} ${currencyLabel} — التغطية ${coverage.toFixed(0)}% (${debt.count} مطعم)`,
                    severity: 'warning',
                    icon: 'info',
                    link: '/liquidity-review'
                });
            }
        });

        return alerts.sort((a, b) => {
            const severityOrder = { critical: 0, warning: 1, info: 2, success: 3 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });
    }, [restaurants, fundSnapshots, bankDefinitions, liquidityMappings]);

    // --- Combine all notifications ---
    const allNotifications = useMemo(() => {
        return [...paymentAlerts, ...liquidityAlerts];
    }, [paymentAlerts, liquidityAlerts]);

    const activeNotifications = allNotifications.filter(n => !dismissedIds.includes(n.id));
    const criticalCount = activeNotifications.filter(n => n.severity === 'critical').length;
    const totalCount = activeNotifications.length;

    // --- Play sound when new critical/warning notifications appear ---
    useEffect(() => {
        if (!soundEnabled || totalCount === 0) return;
        const currentSignature = activeNotifications.map(n => n.id).sort().join(',');
        if (currentSignature && currentSignature !== lastSoundPlayedFor) {
            const hasCritical = activeNotifications.some(n => n.severity === 'critical');
            playNotificationSound(hasCritical ? 'critical' : 'warning');
            setLastSoundPlayedFor(currentSignature);
        }
    }, [activeNotifications, soundEnabled, lastSoundPlayedFor, totalCount]);

    const handleDismiss = (id: string) => {
        const updated = [...dismissedIds, id];
        setDismissedIds(updated);
        try { sessionStorage.setItem('dismissed_notifications', JSON.stringify(updated)); } catch { }
    };

    const handleDismissAll = () => {
        const allIds = allNotifications.map(n => n.id);
        setDismissedIds(allIds);
        try { sessionStorage.setItem('dismissed_notifications', JSON.stringify(allIds)); } catch { }
    };

    const handleClick = (notification: Notification) => {
        if (notification.link) {
            navigate(notification.link);
            setIsOpen(false);
            setIsExpanded(false);
        }
    };

    const getSeverityStyles = (severity: string) => {
        switch (severity) {
            case 'critical': return {
                bg: 'bg-red-50 dark:bg-red-900/20',
                border: 'border-red-200 dark:border-red-800',
                icon: 'text-red-500',
                badge: 'bg-red-500 text-white',
                progressBar: 'bg-red-500'
            };
            case 'warning': return {
                bg: 'bg-amber-50 dark:bg-amber-900/20',
                border: 'border-amber-200 dark:border-amber-800',
                icon: 'text-amber-500',
                badge: 'bg-amber-500 text-white',
                progressBar: 'bg-amber-500'
            };
            case 'info': return {
                bg: 'bg-blue-50 dark:bg-blue-900/20',
                border: 'border-blue-200 dark:border-blue-800',
                icon: 'text-blue-500',
                badge: 'bg-blue-500 text-white',
                progressBar: 'bg-blue-500'
            };
            case 'success': return {
                bg: 'bg-green-50 dark:bg-green-900/20',
                border: 'border-green-200 dark:border-green-800',
                icon: 'text-green-500',
                badge: 'bg-green-500 text-white',
                progressBar: 'bg-green-500'
            };
            default: return {
                bg: 'bg-slate-50 dark:bg-slate-800',
                border: 'border-slate-200 dark:border-slate-700',
                icon: 'text-slate-500',
                badge: 'bg-slate-500 text-white',
                progressBar: 'bg-slate-500'
            };
        }
    };

    // --- Render notification card (shared between dropdown and expanded) ---
    const renderNotificationCard = (notification: Notification, expanded: boolean) => {
        const styles = getSeverityStyles(notification.severity);
        return (
            <div
                key={notification.id}
                className={`${expanded ? 'p-5 rounded-2xl mb-3 shadow-sm' : 'p-3'} ${styles.bg} hover:brightness-95 dark:hover:brightness-110 transition-all cursor-pointer group border-r-4 ${styles.border}`}
            >
                <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={`mt-0.5 ${expanded ? 'size-12 rounded-2xl' : 'size-9 rounded-xl'} flex items-center justify-center ${styles.badge} shadow-sm flex-shrink-0`}>
                        <span className={`material-symbols-outlined ${expanded ? 'text-2xl' : 'text-lg'}`}>
                            {notification.icon}
                        </span>
                    </div>

                    {/* Content */}
                    <div
                        className="flex-1 min-w-0"
                        onClick={() => handleClick(notification)}
                    >
                        <h4 className={`${expanded ? 'text-base' : 'text-sm'} font-black text-slate-800 dark:text-white leading-tight`}>
                            {notification.title}
                        </h4>
                        <p className={`${expanded ? 'text-sm mt-2' : 'text-[11px] mt-1'} font-bold text-slate-500 dark:text-slate-400 leading-relaxed`}>
                            {notification.message}
                        </p>

                        {/* Coverage bar in expanded mode */}
                        {expanded && notification.type !== 'payment_due' && (
                            <div className="mt-3">
                                {(() => {
                                    const match = notification.message.match(/التغطية (\d+)%/);
                                    const pct = match ? parseInt(match[1]) : 0;
                                    return (
                                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${styles.progressBar}`}
                                                style={{ width: `${Math.min(pct, 100)}%` }}
                                            />
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {notification.link && (
                            <span className={`${expanded ? 'text-xs mt-2' : 'text-[10px] mt-1'} font-black text-[var(--color-header)] inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                                عرض التفاصيل
                                <span className="material-symbols-outlined text-xs">arrow_back</span>
                            </span>
                        )}
                    </div>

                    {/* Dismiss */}
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDismiss(notification.id); }}
                        className={`${expanded ? 'size-8' : 'size-6'} rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0`}
                        title="تجاهل"
                    >
                        <span className={`material-symbols-outlined ${expanded ? 'text-base' : 'text-sm'}`}>close</span>
                    </button>
                </div>
            </div>
        );
    };

    return (
        <>
            <div className="relative" ref={dropdownRef}>
                {/* Bell Button */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={`relative size-10 rounded-full flex items-center justify-center transition-all duration-300 ${totalCount > 0
                        ? 'bg-white/20 hover:bg-white/30 text-white'
                        : 'bg-white/10 hover:bg-white/20 text-white/70'
                        }`}
                    title="الإشعارات"
                >
                    <span className={`material-symbols-outlined text-xl ${totalCount > 0 ? 'animate-bell-ring' : ''}`}>
                        {totalCount > 0 ? 'notifications_active' : 'notifications'}
                    </span>

                    {/* Badge */}
                    {totalCount > 0 && (
                        <span className={`absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center shadow-lg ${criticalCount > 0 ? 'bg-red-500 text-white animate-pulse' : 'bg-amber-500 text-white'
                            }`}>
                            {totalCount}
                        </span>
                    )}
                </button>

                {/* Dropdown (compact mode) */}
                {isOpen && !isExpanded && (
                    <div className="absolute left-0 top-full mt-2 w-[380px] max-h-[70vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-[200] animate-scale-in" dir="rtl">
                        {/* Header */}
                        <div className="p-4 bg-gradient-to-l from-[var(--color-header)] to-[var(--color-sidebar)] text-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined">notifications</span>
                                <h3 className="font-black text-sm">الإشعارات</h3>
                                {totalCount > 0 && (
                                    <span className="bg-white/20 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                                        {totalCount}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Sound Toggle */}
                                <button
                                    onClick={toggleSound}
                                    className={`size-7 rounded-lg flex items-center justify-center transition-colors ${soundEnabled ? 'bg-white/20 text-white' : 'bg-white/10 text-white/40'}`}
                                    title={soundEnabled ? 'إيقاف الصوت' : 'تفعيل الصوت'}
                                >
                                    <span className="material-symbols-outlined text-sm">
                                        {soundEnabled ? 'volume_up' : 'volume_off'}
                                    </span>
                                </button>
                                {/* Expand Button */}
                                <button
                                    onClick={() => setIsExpanded(true)}
                                    className="size-7 rounded-lg flex items-center justify-center bg-white/20 text-white hover:bg-white/30 transition-colors"
                                    title="تكبير الإشعارات"
                                >
                                    <span className="material-symbols-outlined text-sm">open_in_full</span>
                                </button>
                                {/* Dismiss All */}
                                {totalCount > 0 && (
                                    <button
                                        onClick={handleDismissAll}
                                        className="text-[10px] font-bold text-white/70 hover:text-white transition-colors"
                                    >
                                        تجاهل الكل
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Notifications List */}
                        <div className="overflow-y-auto max-h-[calc(70vh-60px)] thin-scrollbar">
                            {activeNotifications.length === 0 ? (
                                <div className="p-8 text-center">
                                    <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-3 block">
                                        notifications_off
                                    </span>
                                    <p className="text-sm font-bold text-slate-400 dark:text-slate-500">
                                        لا توجد إشعارات حالياً
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        سيتم تنبيهك عند اقتراب مواعيد السداد أو وجود عجز في السيولة
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {activeNotifications.map(n => renderNotificationCard(n, false))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {activeNotifications.length > 0 && (
                            <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                                <button
                                    onClick={() => { navigate('/liquidity-review'); setIsOpen(false); }}
                                    className="w-full py-2 text-xs font-black text-[var(--color-header)] hover:bg-[var(--color-header)]/10 rounded-xl transition-colors flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
                                    فتح مراجعة السيولة
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ========== Expanded Fullscreen Modal ========== */}
            {isExpanded && (
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-fade-in" dir="rtl">
                    <div className="w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-in-modal">
                        {/* Expanded Header */}
                        <div className="p-6 bg-gradient-to-l from-[var(--color-header)] to-[var(--color-sidebar)] text-white">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="size-12 rounded-2xl bg-white/20 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-2xl">notifications</span>
                                    </div>
                                    <div>
                                        <h2 className="font-black text-xl">مركز الإشعارات</h2>
                                        <p className="text-white/70 text-xs font-bold mt-0.5">
                                            {totalCount > 0 ? `${totalCount} إشعار${criticalCount > 0 ? ` — ${criticalCount} عاجل` : ''}` : 'لا توجد إشعارات'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* Sound Toggle */}
                                    <button
                                        onClick={toggleSound}
                                        className={`size-10 rounded-xl flex items-center justify-center transition-colors ${soundEnabled ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white/10 text-white/40 hover:bg-white/20'}`}
                                        title={soundEnabled ? 'إيقاف الصوت' : 'تفعيل الصوت'}
                                    >
                                        <span className="material-symbols-outlined">
                                            {soundEnabled ? 'volume_up' : 'volume_off'}
                                        </span>
                                    </button>
                                    {/* Shrink */}
                                    <button
                                        onClick={() => setIsExpanded(false)}
                                        className="size-10 rounded-xl bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                                        title="تصغير"
                                    >
                                        <span className="material-symbols-outlined">close_fullscreen</span>
                                    </button>
                                    {/* Close */}
                                    <button
                                        onClick={() => { setIsExpanded(false); setIsOpen(false); }}
                                        className="size-10 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-red-500/30 transition-colors"
                                        title="إغلاق"
                                    >
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>
                            </div>

                            {/* Summary Cards */}
                            {totalCount > 0 && (
                                <div className="flex gap-3 mt-2">
                                    {criticalCount > 0 && (
                                        <div className="flex-1 bg-red-500/30 rounded-xl p-3 text-center">
                                            <div className="text-2xl font-black">{criticalCount}</div>
                                            <div className="text-[10px] font-bold text-white/80">عاجل</div>
                                        </div>
                                    )}
                                    {activeNotifications.filter(n => n.severity === 'warning').length > 0 && (
                                        <div className="flex-1 bg-amber-500/30 rounded-xl p-3 text-center">
                                            <div className="text-2xl font-black">{activeNotifications.filter(n => n.severity === 'warning').length}</div>
                                            <div className="text-[10px] font-bold text-white/80">تحذير</div>
                                        </div>
                                    )}
                                    <div className="flex-1 bg-white/10 rounded-xl p-3 text-center">
                                        <div className="text-2xl font-black">{totalCount}</div>
                                        <div className="text-[10px] font-bold text-white/80">إجمالي</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Expanded Content */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 thin-scrollbar">
                            {activeNotifications.length === 0 ? (
                                <div className="py-16 text-center">
                                    <span className="material-symbols-outlined text-7xl text-slate-200 dark:text-slate-700 mb-4 block">
                                        notifications_off
                                    </span>
                                    <h3 className="text-lg font-black text-slate-400 dark:text-slate-500">لا توجد إشعارات حالياً</h3>
                                    <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
                                        سيتم تنبيهك عند اقتراب مواعيد سداد المطاعم أو وجود عجز في سيولة الصناديق
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* Payment Alerts Section */}
                                    {activeNotifications.filter(n => n.type === 'payment_due').length > 0 && (
                                        <div className="mb-6">
                                            <h3 className="text-sm font-black text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-base text-amber-500">event_upcoming</span>
                                                مواعيد السداد القادمة
                                            </h3>
                                            {activeNotifications.filter(n => n.type === 'payment_due').map(n => renderNotificationCard(n, true))}
                                        </div>
                                    )}

                                    {/* Liquidity Alerts Section */}
                                    {activeNotifications.filter(n => n.type !== 'payment_due').length > 0 && (
                                        <div className="mb-6">
                                            <h3 className="text-sm font-black text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-base text-red-500">account_balance_wallet</span>
                                                حالة سيولة الصناديق
                                            </h3>
                                            {activeNotifications.filter(n => n.type !== 'payment_due').map(n => renderNotificationCard(n, true))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Expanded Footer */}
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-3">
                            <button
                                onClick={() => { navigate('/liquidity-review'); setIsExpanded(false); setIsOpen(false); }}
                                className="flex-1 py-3 text-sm font-black text-white bg-[var(--color-header)] hover:brightness-110 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
                            >
                                <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
                                مراجعة السيولة
                            </button>
                            {totalCount > 0 && (
                                <button
                                    onClick={handleDismissAll}
                                    className="py-3 px-5 text-sm font-black text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-lg">notifications_off</span>
                                    تجاهل الكل
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Animations */}
            <style>{`
                @keyframes bell-ring {
                    0%, 100% { transform: rotate(0deg); }
                    10% { transform: rotate(12deg); }
                    20% { transform: rotate(-10deg); }
                    30% { transform: rotate(8deg); }
                    40% { transform: rotate(-6deg); }
                    50% { transform: rotate(0deg); }
                }
                .animate-bell-ring {
                    animation: bell-ring 2s ease-in-out infinite;
                    transform-origin: top center;
                }
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in {
                    animation: fade-in 0.2s ease-out;
                }
                @keyframes scale-in-modal {
                    from { opacity: 0; transform: scale(0.9) translateY(20px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                .animate-scale-in-modal {
                    animation: scale-in-modal 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes scale-in {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-scale-in {
                    animation: scale-in 0.15s ease-out;
                }
            `}</style>
        </>
    );
};

export default NotificationBell;
