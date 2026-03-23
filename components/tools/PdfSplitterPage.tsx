import React, { useState, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// تعيين مسار العامل المساعد لـ pdf.js (ضروري في بعض البيئات)
pdfjsLib.GlobalWorkerOptions.workerSrc = '//cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

// نوع بيانات الملف المرفوع
interface PdfFile {
    file: File;
    name: string;
}

// نوع نتيجة التقسيم (مجموعة من الصفحات)
interface PageGroup {
    restaurantName: string;
    pageIndices: number[];
}

const PdfSplitterPage: React.FC = () => {
    const [pdfFile, setPdfFile] = useState<PdfFile | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [splitMode, setSplitMode] = useState<'smart' | 'page'>('smart'); // التقصير للوضع الذكي
    const [progress, setProgress] = useState(0); // نسبة التقدم
    const [progressLabel, setProgressLabel] = useState(''); // رسالة التقدم التفصيلية
    const [extractedTexts, setExtractedTexts] = useState<{ page: number, text: string, name: string | null }[]>([]); // للنصوص المستخرجة
    const [showDebug, setShowDebug] = useState(false);

    // معالجة رفع الملف
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type === 'application/pdf') {
            setPdfFile({ file, name: file.name.replace('.pdf', '') });
            setError(null);
        } else {
            setError('الرجاء اختيار ملف PDF صالح');
        }
    };

    // استخراج اسم المطعم من النص باستخدام أنماط متعددة
    const extractRestaurantName = (text: string): string | null => {
        // تنظيف النص أولاً: توحيد المسافات وإزالة الزوائد
        const normalizedText = text
            .replace(/\s+/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '') // إزالة أحرف العرض الصفري
            .trim();

        // أنماط متعددة لاستخراج اسم المطعم من كشوفات بنكية مختلفة
        const patterns: RegExp[] = [
            /(?:المطعم|Restaurant|اسم المطعم|إسم المطعم|اسم المورد|إسم المورد)[:\s]*([^\n\r]+)/i,
            /(?:اسم العميل|إسم العميل|الاسم|الإسم|Client Name|Customer Name|Name)[:\s]*([^\n\r]+)/i,
            /(?:العميل|العميل:|الاسم:|الإسم:|Customer:|Client:|Beneficiary Name|Beneficiary Name:)[\s]*([^\n\r]+)/i,
            /(?:اسم الحساب|Account Name|Account Holder)[:\s]*([^\n\r]+)/i,
            /مطعم\s+([^\n\r]+)/i,
            /([^\n\r]+?)\s*\(مطعم\)/i,
            /(?:لصالح|To|Beneficiary|Transfer To|يتحول الى|يتحول إلى)[:\s]*([^\n\r]+)/i,
        ];

        for (const pattern of patterns) {
            const match = normalizedText.match(pattern);
            if (match && match[1]) {
                const name = match[1].trim();
                // تجاهل النتائج الفارغة أو القصيرة جداً (حرف واحد)
                if (name.length > 1) return name;
            }
        }
        return null;
    };

    // دالة التقسيم الرئيسية
    const handleSplit = useCallback(async () => {
        if (!pdfFile) return;

        setLoading(true);
        setError(null);
        setProgress(0);
        setProgressLabel('جاري تهيئة الملف...');
        setExtractedTexts([]);

        try {
            // 1. قراءة الملف كـ ArrayBuffer
            const arrayBuffer = await pdfFile.file.arrayBuffer();
            const originalPdf = await PDFDocument.load(arrayBuffer);
            const totalPages = originalPdf.getPageCount();

            if (totalPages === 0) {
                throw new Error('الملف لا يحتوي على صفحات');
            }

            // 2. استخراج النص من كل صفحة (للوضع الذكي)
            let pageTexts: string[] = [];
            let groups: PageGroup[] = [];

            if (splitMode === 'smart') {
                // تحميل PDF عبر pdf.js لاستخراج النص
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;

                let debugInfo = [];

                for (let i = 1; i <= totalPages; i++) {
                    setProgressLabel(`جاري استخراج وتحليل النصوص (الصفحة ${i} من ${totalPages})...`);
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const text = textContent.items.map((item: any) => item.str).join(' ');
                    pageTexts.push(text);
                    setProgress(Math.round((i / totalPages) * 50)); // 50% مخصص للاستخراج
                }

                // تجميع الصفحات المتتالية ذات اسم المطعم نفسه
                let currentGroup: { name: string; indices: number[]; isKnown: boolean } | null = null;
                for (let i = 0; i < totalPages; i++) {
                    const extractedName = extractRestaurantName(pageTexts[i]);
                    const isKnown = extractedName !== null;
                    const name = extractedName || `صفحة ${i + 1}`;

                    debugInfo.push({
                        page: i + 1,
                        text: pageTexts[i],
                        name: extractedName
                    });

                    // الصفحات غير المعروفة لا تُجمّع مع بعضها — كل صفحة منفصلة
                    if (!isKnown || !currentGroup || !currentGroup.isKnown || currentGroup.name !== name) {
                        // بداية مجموعة جديدة
                        if (currentGroup) {
                            groups.push({
                                restaurantName: currentGroup.name,
                                pageIndices: currentGroup.indices,
                            });
                        }
                        currentGroup = { name, indices: [i], isKnown };
                    } else {
                        // استمرار المجموعة الحالية (أسماء معروفة متطابقة فقط)
                        currentGroup.indices.push(i);
                    }
                }
                // إضافة المجموعة الأخيرة
                if (currentGroup) {
                    groups.push({
                        restaurantName: currentGroup.name,
                        pageIndices: currentGroup.indices,
                    });
                }
                setExtractedTexts(debugInfo);
            } else {
                // وضع "كل صفحة على حدة": كل صفحة مجموعة مستقلة
                setProgressLabel('جاري تهيئة الصفحات للتفريغ...');
                groups = Array.from({ length: totalPages }, (_, i) => ({
                    restaurantName: `صفحة ${i + 1}`,
                    pageIndices: [i],
                }));
                setProgress(50);
            }

            // 4. إنشاء ملفات PDF لكل مجموعة
            const zip = new JSZip();
            let processedGroups = 0;

            for (const group of groups) {
                setProgressLabel(`جاري إنشاء الملف (مجموعة ${processedGroups + 1} من ${groups.length})...`);
                const newPdf = await PDFDocument.create();
                const copiedPages = await newPdf.copyPages(originalPdf, group.pageIndices);
                copiedPages.forEach((page) => newPdf.addPage(page));

                const pdfBytes = await newPdf.save();
                // تنظيف اسم الملف من الأحرف غير المسموح بها
                const safeName = group.restaurantName.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 100);
                zip.file(`${safeName}.pdf`, pdfBytes);

                processedGroups++;
                setProgress(50 + Math.round((processedGroups / groups.length) * 50)); // من 50% إلى 100%
            }

            // 5. إنشاء ملف ZIP وتحميله
            setProgressLabel('جاري إنشاء الملف المضغوط (ZIP)...');
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            saveAs(zipBlob, `${pdfFile.name}_مقسم.zip`);

            setLoading(false);
            setProgress(100);
        } catch (err: any) {
            setError(err.message || 'حدث خطأ أثناء معالجة الملف');
            setLoading(false);
        }
    }, [pdfFile, splitMode]);

    const handleReset = () => {
        setPdfFile(null);
        setError(null);
        setProgress(0);
        setProgressLabel('');
        setExtractedTexts([]);
        setShowDebug(false);
    };

    return (
        <div className="p-8 max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 animate-fade-in" dir="rtl">
            <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-4 flex items-center gap-3">
                <span className="material-symbols-outlined text-red-600 scale-125">picture_as_pdf</span>
                أداة تقسيم وتسمية PDF
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8 font-bold text-lg">
                قم برفع كشف حساب بنكي موحد، وسيتم تقسيمه تلقائياً إلى ملفات منفصلة لكل مطعم.
            </p>

            {/* اختيار وضع التقسيم */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <label className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${splitMode === 'smart' ? 'border-red-500 bg-red-50 dark:bg-red-900/10' : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                    <input
                        type="radio"
                        value="smart"
                        checked={splitMode === 'smart'}
                        onChange={() => setSplitMode('smart')}
                        disabled={loading}
                        className="w-5 h-5 accent-red-600"
                    />
                    <span className="font-black text-slate-700 dark:text-slate-200 text-lg">تقسيم ذكي (بناءً على الاسم)</span>
                </label>

                <label className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${splitMode === 'page' ? 'border-red-500 bg-red-50 dark:bg-red-900/10' : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                    <input
                        type="radio"
                        value="page"
                        checked={splitMode === 'page'}
                        onChange={() => setSplitMode('page')}
                        disabled={loading}
                        className="w-5 h-5 accent-red-600"
                    />
                    <span className="font-black text-slate-700 dark:text-slate-200 text-lg">تقسيم كل صفحة على حدة</span>
                </label>
            </div>

            {/* رفع الملف */}
            <div className="relative group mb-8">
                <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    disabled={loading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="p-10 border-4 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl group-hover:border-red-400 dark:group-hover:border-red-900/50 transition-colors flex flex-col items-center gap-4 text-center">
                    <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-700 group-hover:text-red-500 transition-colors scale-150 mb-2">cloud_upload</span>
                    <div>
                        <p className="text-xl font-black text-slate-700 dark:text-slate-200">اضغط هنا أو اسحب الملف لرفعه</p>
                        <p className="text-sm text-slate-500 font-bold mt-1">يجب أن يكون الملف بصيغة PDF فقط</p>
                    </div>
                </div>
            </div>

            {/* عرض اسم الملف المرفوع */}
            {pdfFile && (
                <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/10 rounded-2xl border border-green-100 dark:border-green-900/20 flex items-center justify-between animate-slide-up">
                    <div className="flex items-center gap-3 text-green-700 dark:text-green-400 font-black">
                        <span className="material-symbols-outlined">check_circle</span>
                        <span>{pdfFile.file.name} ({(pdfFile.file.size / 1024).toFixed(2)} كيلوبايت)</span>
                    </div>
                    <button onClick={handleReset} className="text-slate-400 hover:text-red-500 transition-colors" disabled={loading}>
                        <span className="material-symbols-outlined">delete</span>
                    </button>
                </div>
            )}

            {/* أزرار التحكم */}
            {pdfFile && !loading && (
                <div className="flex gap-4">
                    <button
                        onClick={handleSplit}
                        className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl transition font-black text-xl shadow-xl shadow-red-600/20 flex items-center justify-center gap-3 active:scale-95"
                    >
                        <span className="material-symbols-outlined">call_split</span>
                        ابدأ التقسيم الآن
                    </button>
                </div>
            )}

            {/* عرض التقدم */}
            {loading && (
                <div className="mt-10 space-y-4 animate-fade-in">
                    <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                        <div
                            className="h-full bg-gradient-to-r from-red-600 to-orange-500 transition-all duration-300 shadow-[0_0_15px_rgba(220,38,38,0.5)]"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 font-black">
                        <p className="flex items-center gap-2">
                            <span className="animate-spin material-symbols-outlined text-sm">progress_activity</span>
                            {progressLabel}
                        </p>
                        <span className="text-2xl text-red-600">{progress}%</span>
                    </div>
                </div>
            )}

            {/* Debugging Extracted Text */}
            {extractedTexts.length > 0 && !loading && (
                <div className="mt-8">
                    <button
                        onClick={() => setShowDebug(!showDebug)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition font-bold text-sm w-full shadow-sm"
                    >
                        <span className="material-symbols-outlined text-sm">{showDebug ? 'visibility_off' : 'visibility'}</span>
                        {showDebug ? 'إخفاء تفاصيل الاستخراج (للمطورين)' : 'عرض تفاصيل الاستخراج لمعاينة النصوص والأسماء (للمطورين)'}
                    </button>

                    {showDebug && (
                        <div className="mt-4 space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                            {extractedTexts.map((info) => (
                                <div key={info.page} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">الصفحة {info.page}</span>
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${info.name ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {info.name ? `تم التعرف: ${info.name}` : 'لم يتم التعرف على اسم'}
                                        </span>
                                    </div>
                                    <textarea
                                        readOnly
                                        value={info.text}
                                        className="w-full h-24 text-xs font-mono p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 focus:outline-none"
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* عرض الأخطاء */}
            {error && (
                <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl border border-red-100 dark:border-red-900/50 flex items-center gap-3 font-black animate-shake">
                    <span className="material-symbols-outlined">warning</span>
                    {error}
                </div>
            )}

            {/* تعليمات إضافية */}
            <div className="mt-12 pt-8 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p className="font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-500 text-sm">info</span>
                        التقسيم الذكي
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">يستخرج اسم المطعم من أعلى كل صفحة ويجمع الصفحات المتتالية للمطعم نفسه لتسهيل الأرشفة والبحث.</p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p className="font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2">
                        <span className="material-symbols-outlined text-orange-500 text-sm">security</span>
                        خصوصية تامة
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">جميع المعالجة تتم محلياً على جهازك، ولا يتم رفع أي بيانات لخوادم خارجية لضمان أمن البيانات المالية.</p>
                </div>
            </div>
        </div>
    );
};

export default PdfSplitterPage;
