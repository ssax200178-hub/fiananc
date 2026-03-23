import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-8">
                    <div className="max-w-2xl w-full bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden border border-red-100 dark:border-red-900/30">
                        <div className="bg-red-500 text-white p-6 flex items-center gap-4">
                            <span className="material-symbols-outlined text-4xl">error_outline</span>
                            <div>
                                <h1 className="text-2xl font-black">حدث خطأ غير متوقع</h1>
                                <p className="opacity-90 font-bold">عذراً، توقف التطبيق عن العمل بسبب خطأ برمجي.</p>
                            </div>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 overflow-auto max-h-64 font-mono text-sm" dir="ltr">
                                <p className="text-red-600 dark:text-red-400 font-bold mb-2">Error: {this.state.error?.toString()}</p>
                                <pre className="text-slate-500 dark:text-slate-400 whitespace-pre-wrap break-words">
                                    {this.state.errorInfo?.componentStack || 'No stack trace available'}
                                </pre>
                            </div>

                            <div className="flex gap-4" dir="rtl">
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-6 py-3 bg-[var(--color-header)] text-white font-black rounded-xl hover:opacity-90 transition-all flex-1"
                                >
                                    إعادة تحميل الصفحة
                                </button>
                                <button
                                    onClick={() => {
                                        sessionStorage.clear();
                                        localStorage.clear();
                                        window.location.reload();
                                    }}
                                    className="px-6 py-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 font-black rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                                >
                                    مسح الذاكرة المؤقتة وإعادة التحميل
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
