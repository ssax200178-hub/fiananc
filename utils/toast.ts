/**
 * Custom Toast Notification System
 * Replaces browser alert() with beautiful centered notifications
 */

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
    duration?: number;
    type?: ToastType;
}

const ICONS: Record<ToastType, string> = {
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
    info: 'info',
};

const COLORS: Record<ToastType, { bg: string; border: string; text: string; icon: string; glow: string }> = {
    success: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)', text: '#10b981', icon: '#10b981', glow: '0 0 30px rgba(16, 185, 129, 0.15)' },
    error: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.35)', text: '#ef4444', icon: '#ef4444', glow: '0 0 30px rgba(239, 68, 68, 0.15)' },
    warning: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.35)', text: '#f59e0b', icon: '#f59e0b', glow: '0 0 30px rgba(245, 158, 11, 0.15)' },
    info: { bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.35)', text: '#6366f1', icon: '#6366f1', glow: '0 0 30px rgba(99, 102, 241, 0.15)' },
};

let toastContainer: HTMLDivElement | null = null;

function getOrCreateContainer(): HTMLDivElement {
    if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-notification-container';
    toastContainer.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
        padding-top: 80px; pointer-events: none; z-index: 99999; gap: 12px;
    `;
    document.body.appendChild(toastContainer);
    return toastContainer;
}

function autoDetectType(message: string): ToastType {
    if (message.includes('❌') || message.includes('فشل') || message.includes('خطأ')) return 'error';
    if (message.includes('⚠️') || message.includes('تنبيه') || message.includes('تحذير')) return 'warning';
    if (message.includes('✅') || message.includes('تم') || message.includes('نجاح') || message.includes('بنجاح') || message.includes('✔')) return 'success';
    return 'info';
}

export function showToast(message: string, options?: ToastOptions) {
    const type = options?.type || autoDetectType(message);
    const duration = options?.duration || (type === 'error' ? 5000 : 3500);
    const colors = COLORS[type];
    const icon = ICONS[type];
    const container = getOrCreateContainer();

    // Clean emoji prefixes for cleaner display
    const cleanMessage = message.replace(/^[❌✅⚠️🔴🚫✔️📋]\s*/g, '').trim();

    const toast = document.createElement('div');
    toast.style.cssText = `
        pointer-events: auto;
        display: flex; align-items: center; gap: 14px;
        padding: 16px 28px; max-width: 520px; min-width: 280px;
        background: ${colors.bg};
        backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
        border: 1.5px solid ${colors.border};
        border-radius: 20px;
        box-shadow: ${colors.glow}, 0 8px 32px rgba(0,0,0,0.12);
        font-family: 'Cairo', 'Tajawal', 'Segoe UI', sans-serif;
        direction: rtl; text-align: right;
        opacity: 0; transform: translateY(-24px) scale(0.92);
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        cursor: pointer;
    `;

    toast.innerHTML = `
        <span class="material-symbols-outlined" style="font-size: 28px; color: ${colors.icon}; flex-shrink: 0;">${icon}</span>
        <span style="font-size: 14px; font-weight: 700; color: ${colors.text}; line-height: 1.6; flex: 1;">${cleanMessage}</span>
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0) scale(1)';
        });
    });

    const dismiss = () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-16px) scale(0.92)';
        setTimeout(() => toast.remove(), 400);
    };

    toast.addEventListener('click', dismiss);
    setTimeout(dismiss, duration);
}

// Override global alert
const originalAlert = window.alert.bind(window);
window.alert = (message: any) => {
    showToast(String(message));
};

// Export for explicit usage
export default showToast;
