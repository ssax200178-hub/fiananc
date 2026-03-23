import { createPortal } from 'react-dom';

interface InvoiceBookletPrintModalProps {
    isOpen: boolean;
    onClose: () => void;
    startNumber: number;
    endNumber: number;
    batchName: string;
}

const InvoiceBookletPrintModal: React.FC<InvoiceBookletPrintModalProps> = ({
    isOpen,
    onClose,
    startNumber,
    endNumber,
    batchName
}) => {
    if (!isOpen) return null;

    const generatePages = () => {
        const pages = [];
        const bookletsPerPage = 20;

        // Explicit conversion to Number to avoid string arithmetic errors
        const start = Number(startNumber) || 0;
        const end = Number(endNumber) || 0;

        let currentStart = start;
        const totalBooklets = Math.max(1, Math.ceil((end - start + 1) / 25));

        for (let p = 0; p < Math.ceil(totalBooklets / bookletsPerPage); p++) {
            const pageRows = [];
            for (let r = 0; r < bookletsPerPage; r++) {
                const bookletIndex = p * bookletsPerPage + r + 1;
                if (bookletIndex > totalBooklets) break;

                pageRows.push({
                    index: r + 1, // Resets to 1-20 per page
                    from: currentStart,
                    to: Math.min(end, currentStart + 24)
                });
                currentStart += 25;
            }
            pages.push(pageRows);
        }
        return pages;
    };

    const handlePrint = () => {
        window.print();
    };

    const pages = generatePages();
    const totalCount = (Number(endNumber) - Number(startNumber) + 1);
    const totalBooklets = Math.max(1, Math.ceil(totalCount / 25));

    const modalContent = (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex flex-col">
                        <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                            <span className="material-symbols-outlined text-blue-600">print</span>
                            معاينة الطباعة: {batchName}
                        </h3>
                        <p className="text-xs text-slate-500 font-bold mr-9">
                            إجمالي الدفاتر: {totalBooklets} ({totalCount?.toLocaleString()} فاتورة) • عدد الصفحات: {pages.length}
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handlePrint}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black shadow-lg flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-sm">print</span>
                            طباعة الكل
                        </button>
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-black hover:bg-slate-300 transition-all"
                        >
                            إغلاق
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 bg-slate-100 dark:bg-slate-900 flex flex-col items-center gap-8">
                    {/* The container below is targeted by global print styles in index.css */}
                    <div className="print-modal-container flex flex-col items-center w-full">
                        <style>{`
                            .print-page { 
                                background: white; 
                                padding: 5mm; 
                                /* For screen preview */
                                width: 210mm; 
                                min-height: 297mm; 
                                color: black !important;
                                font-family: 'Noto Sans Arabic', sans-serif;
                                box-sizing: border-box;
                                page-break-after: always;
                                page-break-inside: avoid;
                                margin: 0 auto;
                            }
                            .booklet-table { 
                                width: 100%; 
                                border-collapse: collapse; 
                                margin-top: 5px; 
                                border: 2px solid #000; 
                            }
                            .booklet-table tr {
                                height: 11.5mm; /* 11.5mm * 20 rows = 230mm, securely fitting the remaining 260mm of A4 */
                            }
                            .booklet-table th { border: 1px solid #000; padding: 2px; text-align: center; font-size: 11px; font-weight: bold; color: black !important; vertical-align: middle; }
                            .booklet-table td { border: 1px solid #000; padding: 2px; text-align: center; font-size: 11px; font-weight: bold; color: black !important; vertical-align: middle; height: 11.5mm !important; }
                            .header-yellow { background-color: #ffd966 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .header-blue { background-color: #9fc5e8 !important; color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .header-text { font-size: 15px; font-weight: 900; text-align: center; text-decoration: underline; margin-bottom: 5px; color: black !important; flex-shrink: 0; }
                            .agreement-text { font-size: 10px; line-height: 1.4; margin-bottom: 10px; text-align: center; color: black !important; flex-shrink: 0; }
                            .page-number { font-size: 10px; text-align: left; margin-top: 5px; color: #666; font-weight: bold; flex-shrink: 0; }

                            /* Aggressive Print Isolation for Modal Elements */
                            @media print {
                                /* Break out of fixed, flex, and overflow constraints */
                                .fixed.inset-0 {
                                    position: static !important;
                                    display: block !important;
                                    height: auto !important;
                                    min-height: auto !important;
                                    background: transparent !important;
                                    padding: 0 !important;
                                    overflow: visible !important;
                                }
                                /* Hide the modal white box styling and remove height locks */
                                .bg-white.rounded-\\[2\\.5rem\\] {
                                    position: static !important;
                                    display: block !important;
                                    height: auto !important;
                                    max-height: none !important;
                                    background: transparent !important;
                                    box-shadow: none !important;
                                    border-radius: 0 !important;
                                    max-width: none !important;
                                    overflow: visible !important;
                                }
                                /* Explicitly hide the header containing the title and buttons */
                                .border-b.border-slate-100 {
                                    display: none !important;
                                }
                                /* Remove padding and overflow locks from the scroll area */
                                .overflow-y-auto.p-8 {
                                    display: block !important;
                                    height: auto !important;
                                    overflow: visible !important;
                                    padding: 0 !important;
                                    background: transparent !important;
                                }
                                /* Force container to block layout */
                                .print-modal-container {
                                    display: block !important;
                                    gap: 0 !important;
                                }
                                /* Free up print page constraints but ensure it fills A4 height exactly */
                                .print-page {
                                    margin: 0 !important;
                                    width: 100% !important;
                                    height: auto !important;
                                    max-height: none !important;
                                }
                            }
                        `}</style>
                        {pages.map((pageRows, pageIdx) => (
                            <div key={pageIdx} className="print-page" dir="rtl">
                                <div className="header-text">صرف واستلام دفتر فواتير شركة توصيل</div>
                                <div className="agreement-text">
                                    استلمت أنا كابتن التوصيل الموقع أدناه من شركة توصيل دفتر فواتير عبوة (٢٥) فاتورة من أصل ونسخة وأتعهد بعدم استخدام الفواتير إلا بحسب توجهات ونظام شركة توصيل كما ألتزم بتنفيذ تعليمات الشركة. ولا تبرأ ذمتي إلا بإرجاع الدفتر للشركة وأتحمل كافة المسؤلية خلاف ذلك بعد استخدامه.
                                </div>

                                <table className="booklet-table">
                                    <thead>
                                        <tr>
                                            <th className="header-yellow" style={{ width: '4%' }}>م</th>
                                            <th className="header-yellow" style={{ width: '12%' }}>يبدأ</th>
                                            <th className="header-yellow" style={{ width: '12%' }}>ينتهي</th>
                                            <th className="header-yellow" style={{ width: '25%' }}>اسم الموصل</th>
                                            <th className="header-yellow" style={{ width: '13%' }}>التوقيع مع التاريخ</th>
                                            <th className="header-yellow" style={{ width: '8%' }}>رقم الموصل</th>
                                            <th className="header-blue" style={{ width: '13%' }}>الموظف المستلم</th>
                                            <th className="header-blue" style={{ width: '13%' }}>رقم الدفتر المسلم</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pageRows.map((row) => (
                                            <tr key={row.index}>
                                                <td>{row.index}</td>
                                                <td className="font-mono">{row.from?.toLocaleString()}</td>
                                                <td className="font-mono">{row.to?.toLocaleString()}</td>
                                                <td></td>
                                                <td></td>
                                                <td className="header-yellow"></td>
                                                <td className="header-blue"></td>
                                                <td className="header-blue"></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="page-number">صفحة {pageIdx + 1} من {pages.length}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    const printRoot = document.getElementById('print-root');
    if (!printRoot) return modalContent; // Fallback

    return createPortal(modalContent, printRoot);
};

export default InvoiceBookletPrintModal;
