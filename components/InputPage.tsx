import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext, Currency } from '../AppContext';

// Declare XLSX globally since we added it via script tag in index.html
declare var XLSX: any;

import ColumnMappingModal from './ColumnMappingModal';


const InputPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentData,
    updateCurrentData,
    history,
    loadFromHistory,
    currency,
    addToHistory
  } = useAppContext();

  // Local UI state
  const [companyRows, setCompanyRows] = useState(0);
  const [restaurantRows, setRestaurantRows] = useState(0);
  const [inputMode, setInputMode] = useState<'manual' | 'file'>('manual');

  const [isUploading, setIsUploading] = useState(false);

  // Modal State
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [pendingFileHeaders, setPendingFileHeaders] = useState<string[]>([]);
  const [pendingFileData, setPendingFileData] = useState<any[]>([]);
  const [modalTargetSide, setModalTargetSide] = useState<'company' | 'restaurant' | null>(null);


  // Logic to handle row counting
  React.useEffect(() => {
    // We filter empty lines to get accurate count
    setCompanyRows(currentData.companyRaw ? currentData.companyRaw.split('\n').filter(l => l.trim()).length : 0);
    setRestaurantRows(currentData.restaurantRaw ? currentData.restaurantRaw.split('\n').filter(l => l.trim()).length : 0);
  }, [currentData.companyRaw, currentData.restaurantRaw]);

  const handleStartAnalysis = () => {
    const newId = currentData.id || Date.now().toString();
    const dataToSave = {
      ...currentData,
      id: newId,
      date: new Date().toLocaleDateString('ar-SA'),
      status: 'draft' as const // Will be updated in AnalysisPage
    };
    updateCurrentData({ id: newId });
    // Navigate to analysis page
    navigate('/analysis');
  };

  // Improved File Upload Handler using SheetJS (XLSX)
  const handleFileUpload = async (side: 'company' | 'restaurant', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // File size validation (5MB max)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > MAX_FILE_SIZE) {
      alert('حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت');
      e.target.value = ''; // Reset input
      return;
    }

    // File type validation
    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/plain'
    ];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv|txt)$/i)) {
      alert('نوع الملف غير مدعوم. يرجى رفع ملف Excel (.xlsx) أو CSV فقط');
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    try {
      const data = await file.arrayBuffer();

      if (typeof XLSX === 'undefined') {
        throw new Error('مكتبة معالجة Excel غير محملة');
      }

      const workbook = XLSX.read(data, { type: 'array' });
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('الملف لا يحتوي على صفحات عمل');
      }

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet || Object.keys(worksheet).length === 0) {
        throw new Error('صفحة العمل فارغة');
      }

      // 1. Get JSON data with headers
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (jsonData.length < 2) { // Need at least header + 1 row
        throw new Error('الملف لا يحتوي على بيانات كافية');
      }

      const headers = jsonData[0] as string[];
      const dataRows = jsonData.slice(1); // The rest of the data

      // 2. Open Modal for Mapping
      setPendingFileHeaders(headers);
      setPendingFileData(dataRows);
      setModalTargetSide(side);
      setMappingModalOpen(true);

      // (Note: processing happens in handleMappingConfirm)

    } catch (err: any) {
      console.error("Error reading file:", err);
      const errorMessage = err.message || "حدث خطأ غير متوقع";
      alert(`خطأ في معالجة الملف: ${errorMessage}\nتأكد من أن الملف صالح ويحتوي على بيانات.`);
    } finally {
      setIsUploading(false);
      e.target.value = ''; // Reset input
    }
  };

  // Helper: Convert Excel Serial Date
  const excelDateToJSDate = (serial: number) => {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return date_info.toISOString().split('T')[0]; // Returns YYYY-MM-DD
  };

  const handleMappingConfirm = (mapping: { amount: string; date: string; reference: string }) => {
    // Find indices of selected columns
    const amountIdx = pendingFileHeaders.indexOf(mapping.amount);
    const dateIdx = pendingFileHeaders.indexOf(mapping.date);
    const refIdx = pendingFileHeaders.indexOf(mapping.reference);

    if (amountIdx === -1 || dateIdx === -1 || refIdx === -1) {
      alert('خطأ في تحديد الأعمدة');
      return;
    }

    // Extract and format data: Amount \t Date \t Reference
    const formattedLines = pendingFileData.map((row: any[]) => {
      // 1. Clean Amount
      let amt = row[amountIdx];
      if (typeof amt === 'string') {
        amt = amt.replace(/[^0-9.-]/g, ''); // Remove currency symbols, commas
      }
      if (!amt || isNaN(parseFloat(amt))) amt = '0';

      // 2. Parse Date (Handle Excel Serial)
      let date = row[dateIdx];
      if (typeof date === 'number') {
        // Assume Excel Serial Date if > 20000 (roughly year 1954)
        if (date > 20000) {
          try {
            date = excelDateToJSDate(date);
          } catch (e) { date = ''; }
        }
      } else if (typeof date === 'string') {
        // Try to normalize string dates if needed, or leave as is for AnalysisPage to handle
        date = date.trim();
      } else {
        date = '';
      }

      // 3. Force Reference to String
      const ref = row[refIdx] !== undefined ? String(row[refIdx]).trim() : '';

      return `${amt}\t${date}\t${ref}`;
    }).filter(line => line.trim().length > 2); // Filter empty result lines

    const finalText = formattedLines.join('\n');

    if (modalTargetSide === 'company') updateCurrentData({ companyRaw: finalText });
    else if (modalTargetSide === 'restaurant') updateCurrentData({ restaurantRaw: finalText });

    alert(`تم استيراد ${formattedLines.length} سجل بنجاح.`);

    // Reset
    setMappingModalOpen(false);
    setPendingFileData([]);
    setPendingFileHeaders([]);
    setModalTargetSide(null);
  };


  return (
    <div className="animate-fade-in py-8">
      {/* Note: Global Header removed, using Sidebar Layout */}

      <div className="flex flex-col max-w-[1400px] mx-auto flex-1">

        {/* Page Title */}
        <div className="flex flex-wrap justify-between gap-3 mb-8">
          <div className="flex min-w-72 flex-col gap-2">
            <h1 className="text-[#263238] dark:text-white text-3xl lg:text-4xl font-black leading-tight font-display">مطابقة المطاعم</h1>
            <p className="text-[#607D8B] dark:text-slate-400 text-base font-normal">إدخال البيانات للمطابقة بين سجلات الشركة والمطعم.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

          {/* Main Input Area */}
          <div className="lg:col-span-3 flex flex-col gap-8">
            <div className="bg-white dark:bg-[#162a1f] rounded-xl shadow-sm border border-[#f0f4f2] dark:border-[#223d2d] p-6 lg:p-8 flex flex-col gap-8">

              {/* Restaurant Name Input */}
              <div className="flex flex-col gap-2">
                <label className="flex flex-col flex-1">
                  <p className="text-[#263238] dark:text-slate-200 text-base font-bold pb-2">اسم المطعم المراد مطابقته</p>
                  <input
                    value={currentData.restaurantName}
                    onChange={(e) => updateCurrentData({ restaurantName: e.target.value })}
                    className="flex w-full max-w-[480px] rounded-lg text-[#263238] dark:text-white focus:outline-0 focus:ring-2 focus:ring-[#C62828] border border-[#CFD8DC] dark:border-slate-600 bg-white dark:bg-[#1e293b] focus:border-[#C62828] h-12 placeholder:text-[#B0BEC5] p-[15px] text-lg font-normal transition-all"
                    placeholder="أدخل اسم المطعم هنا..."
                  />
                </label>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center gap-4 bg-[#ECEFF1] dark:bg-[#1e293b] p-1.5 rounded-xl w-fit border border-[#CFD8DC] dark:border-slate-700">
                <button
                  onClick={() => setInputMode('manual')}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${inputMode === 'manual' ? 'bg-white dark:bg-[#0f172a] shadow-sm text-[#C62828]' : 'text-[#607D8B] dark:text-slate-400'}`}
                >
                  إدخال نصي (نسخ/لصق)
                </button>
                <button
                  onClick={() => setInputMode('file')}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${inputMode === 'file' ? 'bg-white dark:bg-[#0f172a] shadow-sm text-[#C62828]' : 'text-[#607D8B] dark:text-slate-400'}`}
                >
                  رفع ملف (Excel/CSV)
                </button>
              </div>

              {/* Input Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">

                {/* Company Records */}
                <InputSection
                  title="سجلات الشركة"
                  icon="corporate_fare"
                  rowCount={companyRows}
                  value={currentData.companyRaw}
                  onChange={(val: string) => updateCurrentData({ companyRaw: val })}
                  placeholders={['15000\t2024-10-24\tINV-001', '23050\t2024-10-25\tINV-002']}
                  mode={inputMode}
                  onFileUpload={(e: any) => handleFileUpload('company', e)}
                />

                {/* Restaurant Records */}
                <InputSection
                  title="سجلات المطعم"
                  icon="storefront"
                  rowCount={restaurantRows}
                  value={currentData.restaurantRaw}
                  onChange={(val: string) => updateCurrentData({ restaurantRaw: val })}
                  placeholders={['15000\t2024-10-24\tREF-X1', '23050\t2024-10-25\tREF-X2']}
                  mode={inputMode}
                  onFileUpload={(e: any) => handleFileUpload('restaurant', e)}
                  isAutoProcessing
                />

              </div>

              {/* Action Bar */}
              <div className="mt-4 flex flex-col gap-4 border-t border-[#f0f4f2] dark:border-slate-700 pt-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-sm text-[#607D8B] dark:text-slate-400 bg-[#E3F2FD] dark:bg-blue-900/20 px-4 py-2 rounded-lg border border-[#BBDEFB] dark:border-blue-900/30">
                    <span className="material-symbols-outlined text-[#1E88E5] text-xl">info</span>
                    {inputMode === 'manual' ? 'قم بنسخ الأعمدة (مبلغ، تاريخ، مرجع) من الإكسل ولصقها هنا.' : 'يمكنك رفع ملفات Excel (.xlsx) أو CSV مباشرة.'}
                  </div>
                  <button
                    onClick={handleStartAnalysis}
                    disabled={!currentData.restaurantName}
                    className="w-full md:w-auto px-10 py-4 disabled:opacity-50 disabled:cursor-not-allowed bg-[#C62828] dark:bg-[#c62828] text-white font-bold text-lg rounded-xl hover:bg-[#b71c1c] shadow-lg shadow-[#C62828]/20 flex items-center justify-center gap-3 transition-all"
                  >
                    <span className="material-symbols-outlined">analytics</span>
                    بدء عملية المطابقة
                  </button>
                </div>
              </div>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FeatureCard icon="verified_user" title="دقة المطابقة" description="يتم فحص رقم المرجع والمبالغ لضمان تطابق بنسبة 100%." />
              <FeatureCard icon="history_edu" title="أرشفة ذكية" description="تحفظ جميع عمليات المطابقة تلقائياً في السجل للرجوع إليها." />
              <FeatureCard icon="table_chart" title="إدخال مرن" description="إمكانية الخلط بين الرفع اليدوي والملفات لسهولة الاستخدام." />
            </div>
          </div>

          {/* Sidebar (History) */}
          <aside className="lg:col-span-1">
            <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-[#CFD8DC] dark:border-slate-700 flex flex-col h-[750px] overflow-hidden shadow-sm">
              <div className="p-5 border-b border-[#CFD8DC] dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 space-y-5">
                <h3 className="font-bold text-lg flex items-center gap-2 text-[#263238] dark:text-white">
                  <span className="material-symbols-outlined text-[#FFB300] dark:text-[#13ec6d]">history</span>
                  سجل المطابقات
                </h3>
                <div className="flex flex-col gap-2">
                  <div className="relative group">
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[#618972] text-xl transition-colors group-focus-within:text-[#13ec6d]">manage_search</span>
                    <input className="w-full pr-10 pl-4 py-3 bg-white dark:bg-[#112218] border border-[#dbe6e0] dark:border-[#223d2d] rounded-lg text-sm focus:ring-1 focus:ring-[#13ec6d] focus:border-[#13ec6d] transition-all placeholder:text-[#618972]/60 shadow-inner" placeholder="بحث شامل..." type="text" />
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 scroll-smooth">
                <div className="space-y-2">
                  {history.length === 0 && (
                    <div className="text-center p-4 text-[#618972] text-sm">لا توجد سجلات محفوظة بعد.</div>
                  )}
                  {history.map((item) => (
                    <HistoryItem
                      key={item.id}
                      name={item.restaurantName}
                      date={item.date}
                      // Show Variance if it exists and is not zero
                      variance={item.calculatedVariance}
                      status={item.status}
                      currency={currency}
                      onClick={() => loadFromHistory(item.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </aside>

        </div>
      </div>

      <ColumnMappingModal
        isOpen={mappingModalOpen}
        onClose={() => setMappingModalOpen(false)}
        headers={pendingFileHeaders}
        onConfirm={handleMappingConfirm}
      />
    </div>
  );

};

// Sub-components
const InputSection = ({ title, icon, rowCount, value, onChange, placeholders, isAutoProcessing, mode, onFileUpload }: any) => (
  <div className="flex flex-col gap-4">
    <div className="flex items-center justify-between">
      <h3 className="text-[#111814] dark:text-white text-lg font-bold flex items-center gap-2">
        <span className="material-symbols-outlined text-[#13ec6d] drop-shadow-[0_0_3px_rgba(19,236,109,0.6)]">{icon}</span>
        {title}
      </h3>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#13ec6d]/10 text-[#13ec6d] border border-[#13ec6d]/20">
          <span className="opacity-70">عدد الأسطر:</span>
          <span>{rowCount}</span>
        </div>
      </div>
    </div>

    {mode === 'manual' ? (
      <>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-[#618972] px-1 flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">edit_note</span> منطقة اللصق (المبلغ، التاريخ، المرجع)
          </label>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full border-[#dbe6e0] dark:border-[#223d2d] bg-white dark:bg-[#112218] rounded-lg text-sm focus:ring-1 focus:ring-[#13ec6d] focus:border-[#13ec6d] p-3 min-h-[300px] resize-none font-mono transition-all placeholder:opacity-40 leading-relaxed whitespace-pre"
            placeholder={`الصق البيانات هنا... \nمثال:\n${placeholders[0]}\n${placeholders[1]}`}
          ></textarea>
        </div>
      </>
    ) : (
      <div className="flex flex-col items-center justify-center h-[325px] border-2 border-dashed border-[#dbe6e0] dark:border-[#223d2d] rounded-xl bg-gray-50 dark:bg-[#112218] gap-4">
        <div className="p-4 bg-[#13ec6d]/10 rounded-full text-[#13ec6d]">
          <span className="material-symbols-outlined text-3xl">upload_file</span>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-[#111814] dark:text-white">اضغط لرفع ملف Excel (.xlsx) أو CSV</p>
          <p className="text-xs text-[#618972] mt-1">سيتم معالجة الملف واستخراج الأعمدة تلقائياً</p>
        </div>
        <input type="file" onChange={onFileUpload} accept=".csv,.txt,.xlsx" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#13ec6d]/10 file:text-[#13ec6d] hover:file:bg-[#13ec6d]/20 text-center" />
      </div>
    )}

    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[10px] text-[#618972] italic flex items-center gap-1">
        <span className="material-symbols-outlined text-[12px]">{isAutoProcessing ? 'auto_awesome' : 'lightbulb'}</span>
        {isAutoProcessing ? 'المعالجة الذكية نشطة.' : 'نصيحة: تأكد من ترتيب الأعمدة.'}
      </p>
    </div>
  </div>
);

const FeatureCard = ({ icon, title, description }: any) => (
  <div className="p-4 bg-white dark:bg-[#162a1f] rounded-lg border border-[#f0f4f2] dark:border-[#223d2d]">
    <div className="flex items-center gap-2 mb-2">
      <span className="material-symbols-outlined text-[#13ec6d] text-xl drop-shadow-[0_0_3px_rgba(19,236,109,0.6)]">{icon}</span>
      <h3 className="font-bold text-sm text-[#111814] dark:text-white">{title}</h3>
    </div>
    <p className="text-xs text-[#618972]">{description}</p>
  </div>
);

const HistoryItem = ({ name, date, variance, status, currency, onClick }: any) => (
  <div onClick={onClick} className="p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1a3124] transition-colors cursor-pointer border border-transparent hover:border-[#dbe6e0] dark:hover:border-[#223d2d]">
    <div className="flex justify-between items-start mb-1">
      <span className="text-sm font-bold truncate text-[#111814] dark:text-white max-w-[120px]">{name || 'بدون اسم'}</span>
      {Math.abs(variance) < 0.1 ? (
        <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded flex items-center gap-1">
          <span className="material-symbols-outlined text-[10px]">check_circle</span>
          متطابق
        </span>
      ) : (
        <span className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded flex items-center gap-1">
          <span className="material-symbols-outlined text-[10px]">error</span>
          فروقات
        </span>
      )}
    </div>
    <div className="flex items-center justify-between text-[11px] text-[#618972] mt-2">
      <span>{date}</span>
      {variance !== undefined && Math.abs(variance) > 0.01 && (
        <span className="font-bold font-mono text-red-500 dir-ltr">{variance.toLocaleString()} {currency}</span>
      )}
    </div>
  </div>
);

export default InputPage;