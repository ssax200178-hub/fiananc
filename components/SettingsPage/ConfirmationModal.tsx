import React from 'react';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'تأكيد',
    cancelText = 'إلغاء',
    isDestructive = false
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div 
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in" 
                onClick={onClose}
            ></div>
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2rem] shadow-2xl border border-slate-200 dark:border-white/5 relative z-10 overflow-hidden animate-scale-up">
                <div className={`h-1.5 w-full ${isDestructive ? 'bg-red-500' : 'bg-blue-600'}`}></div>
                <div className="p-8 text-right" dir="rtl">
                    <h3 className="text-xl font-black text-slate-800 dark:text-white mb-3">{title}</h3>
                    <p className="text-slate-500 dark:text-slate-400 font-bold leading-relaxed mb-8">
                        {message}
                    </p>
                    <div className="flex flex-row-reverse gap-3">
                        <button
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className={`flex-1 py-3.5 rounded-2xl font-black text-white transition-all active:scale-95 shadow-lg ${
                                isDestructive 
                                    ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' 
                                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                            }`}
                        >
                            {confirmText}
                        </button>
                        <button
                            onClick={onClose}
                            className="flex-1 py-3.5 rounded-2xl font-black text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-all active:scale-95"
                        >
                            {cancelText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
