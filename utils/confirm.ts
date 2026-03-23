/**
 * Custom Promise-based Confirm Dialog
 * Replaces browser confirm() with a beautiful centered modal
 */

interface ConfirmOptions {
    title?: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
}

export function confirmDialog(message: string, options?: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'custom-confirm-backdrop';
        backdrop.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            z-index: 999999;
            opacity: 0;
            transition: opacity 0.3s ease;
            font-family: 'Cairo', 'Tajawal', 'Segoe UI', sans-serif;
            direction: rtl;
        `;

        // Create dialog box
        const dialog = document.createElement('div');
        const isDanger = options?.type === 'danger' || message.includes('حذف') || message.includes('نهائياً');
        const primaryColor = isDanger ? '#ef4444' : '#3b82f6';
        const primaryBg = isDanger ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)';
        const iconName = isDanger ? 'warning' : 'help';
        const title = options?.title || (isDanger ? 'تأكيد الحذف' : 'تأكيد الإجراء');

        dialog.style.cssText = `
            background: #ffffff;
            border-radius: 20px;
            padding: 32px;
            width: 90%; max-width: 420px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
            transform: scale(0.9);
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            position: relative;
            overflow: hidden;
        `;

        // Add dark mode support logic directly via CSS if possible, but hardcoding colors is tricky.
        // Let's use CSS variables where possible or adapt to root dark mode class.
        const isDark = document.documentElement.classList.contains('dark');
        if (isDark) {
            dialog.style.background = '#1e293b';
            dialog.style.color = '#f8fafc';
            dialog.style.border = '1px solid #334155';
        }

        dialog.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px;">
                <div style="
                    width: 64px; height: 64px; border-radius: 32px; 
                    background: ${primaryBg}; color: ${primaryColor};
                    display: flex; align-items: center; justify-content: center;
                    margin-bottom: 8px;
                ">
                    <span class="material-symbols-outlined" style="font-size: 32px;">${iconName}</span>
                </div>
                <h3 style="margin: 0; font-size: 20px; font-weight: 700; color: ${isDark ? '#f1f5f9' : '#0f172a'};">${title}</h3>
                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: ${isDark ? '#cbd5e1' : '#475569'};">${message.replace(/\n/g, '<br>')}</p>
                
                <div style="display: flex; gap: 12px; width: 100%; margin-top: 24px;">
                    <button id="custom-confirm-cancel" style="
                        flex: 1; padding: 12px; border-radius: 12px;
                        background: ${isDark ? '#334155' : '#f1f5f9'};
                        color: ${isDark ? '#e2e8f0' : '#475569'};
                        border: none; font-size: 15px; font-weight: 600; font-family: inherit;
                        cursor: pointer; transition: all 0.2s;
                    ">${options?.cancelText || 'إلغاء الأمر'}</button>
                    
                    <button id="custom-confirm-btn" style="
                        flex: 1; padding: 12px; border-radius: 12px;
                        background: ${primaryColor};
                        color: white;
                        border: none; font-size: 15px; font-weight: 600; font-family: inherit;
                        cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px ${primaryBg};
                    ">${options?.confirmText || 'متأكد، موافق'}</button>
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);
        backdrop.appendChild(dialog);

        // Animate in
        requestAnimationFrame(() => {
            backdrop.style.opacity = '1';
            dialog.style.transform = 'scale(1)';
        });

        // Hover effects inline
        const cancelBtn = dialog.querySelector('#custom-confirm-cancel') as HTMLButtonElement;
        const confirmBtn = dialog.querySelector('#custom-confirm-btn') as HTMLButtonElement;

        cancelBtn.onmouseover = () => { cancelBtn.style.background = isDark ? '#475569' : '#e2e8f0'; };
        cancelBtn.onmouseout = () => { cancelBtn.style.background = isDark ? '#334155' : '#f1f5f9'; };

        confirmBtn.onmouseover = () => { confirmBtn.style.opacity = '0.9'; confirmBtn.style.transform = 'translateY(-1px)'; };
        confirmBtn.onmouseout = () => { confirmBtn.style.opacity = '1'; confirmBtn.style.transform = 'translateY(0)'; };

        const closeDialog = (result: boolean) => {
            backdrop.style.opacity = '0';
            dialog.style.transform = 'scale(0.95)';
            setTimeout(() => {
                backdrop.remove();
                resolve(result);
            }, 300);
        };

        cancelBtn.addEventListener('click', () => closeDialog(false));
        confirmBtn.addEventListener('click', () => closeDialog(true));

        // Close on clicking outside
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeDialog(false);
        });
    });
}

// Ensure window.confirm is not used directly
window.confirm = () => {
    console.warn("window.confirm is deprecated. Use import { confirmDialog } from 'utils/confirm' instead.");
    return false; // Prevent blocking
};

export function promptDialog(message: string, options?: ConfirmOptions & { defaultValue?: string, placeholder?: string }): Promise<string | null> {
    return new Promise((resolve) => {
        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'custom-prompt-backdrop';
        backdrop.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            z-index: 999999;
            opacity: 0;
            transition: opacity 0.3s ease;
            font-family: 'Cairo', 'Tajawal', 'Segoe UI', sans-serif;
            direction: rtl;
        `;

        // Create dialog box
        const dialog = document.createElement('div');
        const primaryColor = '#3b82f6';
        const primaryBg = 'rgba(59, 130, 246, 0.1)';
        const iconName = 'edit';
        const title = options?.title || 'إدخال بيانات';

        dialog.style.cssText = `
            background: #ffffff;
            border-radius: 20px;
            padding: 32px;
            width: 90%; max-width: 420px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
            transform: scale(0.9);
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            position: relative;
            overflow: hidden;
        `;

        const isDark = document.documentElement.classList.contains('dark');
        if (isDark) {
            dialog.style.background = '#1e293b';
            dialog.style.color = '#f8fafc';
            dialog.style.border = '1px solid #334155';
        }

        dialog.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px;">
                <div style="
                    width: 64px; height: 64px; border-radius: 32px; 
                    background: ${primaryBg}; color: ${primaryColor};
                    display: flex; align-items: center; justify-content: center;
                    margin-bottom: 8px;
                ">
                    <span class="material-symbols-outlined" style="font-size: 32px;">${iconName}</span>
                </div>
                <h3 style="margin: 0; font-size: 20px; font-weight: 700; color: ${isDark ? '#f1f5f9' : '#0f172a'};">${title}</h3>
                <label for="custom-prompt-input" style="margin: 0; font-size: 15px; line-height: 1.6; color: ${isDark ? '#cbd5e1' : '#475569'}; align-self: flex-start;">${message.replace(/\n/g, '<br>')}</label>
                
                <input id="custom-prompt-input" type="text" value="${options?.defaultValue || ''}" placeholder="${options?.placeholder || ''}" style="
                    width: 100%; padding: 12px 16px; margin-top: 8px; border-radius: 12px;
                    border: 1px solid ${isDark ? '#475569' : '#cbd5e1'};
                    background: ${isDark ? '#0f172a' : '#ffffff'};
                    color: ${isDark ? '#f1f5f9' : '#0f172a'};
                    font-size: 15px; font-family: inherit; outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                " />

                <div style="display: flex; gap: 12px; width: 100%; margin-top: 24px;">
                    <button id="custom-prompt-cancel" style="
                        flex: 1; padding: 12px; border-radius: 12px;
                        background: ${isDark ? '#334155' : '#f1f5f9'};
                        color: ${isDark ? '#e2e8f0' : '#475569'};
                        border: none; font-size: 15px; font-weight: 600; font-family: inherit;
                        cursor: pointer; transition: all 0.2s;
                    ">${options?.cancelText || 'إلغاء الأمر'}</button>
                    
                    <button id="custom-prompt-btn" style="
                        flex: 1; padding: 12px; border-radius: 12px;
                        background: ${primaryColor};
                        color: white;
                        border: none; font-size: 15px; font-weight: 600; font-family: inherit;
                        cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px ${primaryBg};
                    ">${options?.confirmText || 'موافق'}</button>
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);
        backdrop.appendChild(dialog);

        const input = dialog.querySelector('#custom-prompt-input') as HTMLInputElement;

        // Focus and select input text
        setTimeout(() => {
            input.focus();
            input.select();
        }, 300);

        // Styling for input focus
        input.addEventListener('focus', () => {
            input.style.borderColor = primaryColor;
            input.style.boxShadow = `0 0 0 3px ${primaryBg}`;
        });
        input.addEventListener('blur', () => {
            input.style.borderColor = isDark ? '#475569' : '#cbd5e1';
            input.style.boxShadow = 'none';
        });

        // Animate in
        requestAnimationFrame(() => {
            backdrop.style.opacity = '1';
            dialog.style.transform = 'scale(1)';
        });

        // Hover effects inline
        const cancelBtn = dialog.querySelector('#custom-prompt-cancel') as HTMLButtonElement;
        const confirmBtn = dialog.querySelector('#custom-prompt-btn') as HTMLButtonElement;

        cancelBtn.onmouseover = () => { cancelBtn.style.background = isDark ? '#475569' : '#e2e8f0'; };
        cancelBtn.onmouseout = () => { cancelBtn.style.background = isDark ? '#334155' : '#f1f5f9'; };

        confirmBtn.onmouseover = () => { confirmBtn.style.opacity = '0.9'; confirmBtn.style.transform = 'translateY(-1px)'; };
        confirmBtn.onmouseout = () => { confirmBtn.style.opacity = '1'; confirmBtn.style.transform = 'translateY(0)'; };

        const closeDialog = (result: string | null) => {
            backdrop.style.opacity = '0';
            dialog.style.transform = 'scale(0.95)';
            setTimeout(() => {
                backdrop.remove();
                resolve(result);
            }, 300);
        };

        cancelBtn.addEventListener('click', () => closeDialog(null));
        confirmBtn.addEventListener('click', () => closeDialog(input.value));

        // Handle Enter and Escape key presses
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                closeDialog(input.value);
            } else if (e.key === 'Escape') {
                closeDialog(null);
            }
        });

        // Close on clicking outside
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeDialog(null);
        });
    });
}
