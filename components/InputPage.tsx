import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext, Currency, ReconData } from '../AppContext';
import { parseNumber } from '../utils';

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
    addToHistory,
    theme
  } = useAppContext();

  // Local UI state
  const [companyRows, setCompanyRows] = useState(0);
  const [restaurantRows, setRestaurantRows] = useState(0);
  const [inputMode, setInputMode] = useState<'manual' | 'file'>('manual');

  const [companyFileName, setCompanyFileName] = useState<string | null>(null);
  const [restaurantFileName, setRestaurantFileName] = useState<string | null>(null);

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
    const dataToSave: ReconData = {
      ...currentData,
      id: newId,
      date: new Date().toLocaleDateString('ar-SA'),
      status: 'draft' as const,
      companyFileName: companyFileName || '',
      restaurantFileName: restaurantFileName || '',
      totalAmount: 0, // Will be calculated in AnalysisPage
      calculatedVariance: 0,
      manualLinks: currentData.manualLinks || {}
    };

    // Persist to history immediately
    addToHistory(dataToSave);

    updateCurrentData(dataToSave);
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

    if (side === 'company') setCompanyFileName(file.name);
    else setRestaurantFileName(file.name);

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

      // 1. Get JSON data with headers (raw array of arrays)
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      // Find the first non-empty row to use as headers
      let headerRowIndex = 0;
      while (headerRowIndex < jsonData.length) {
        const row = jsonData[headerRowIndex];
        if (row && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
          break;
        }
        headerRowIndex++;
      }

      if (headerRowIndex >= jsonData.length) {
        throw new Error('الملف لا يحتوي على بيانات');
      }

      const headers = (jsonData[headerRowIndex] as any[]).map(h => h ? String(h).trim() : '');
      const dataRows = jsonData.slice(headerRowIndex + 1);

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

  const handleMappingConfirm = (mapping: { amount: string; date: string; reference: string; partyRef: string }) => {
    // Find indices of selected columns
    const amountIdx = pendingFileHeaders.indexOf(mapping.amount);
    const dateIdx = pendingFileHeaders.indexOf(mapping.date);
    const refIdx = pendingFileHeaders.indexOf(mapping.reference);
    const partyRefIdx = mapping.partyRef ? pendingFileHeaders.indexOf(mapping.partyRef) : -1;

    if (amountIdx === -1 || dateIdx === -1 || refIdx === -1) {
      alert('خطأ في تحديد الأعمدة');
      return;
    }

    // Extract and format data: Amount \t Date \t Reference [\t PartyRef]
    const formattedLines = pendingFileData.map((row: any[]) => {
      // 1. Clean Amount
      let amt = row[amountIdx];
      if (typeof amt === 'string') {
        // Allow dots, commas, and negative signs
        amt = amt.replace(/[^0-9.,-]/g, '');
      }

      // Use efficient parsing that handles "1.234,56" or "1,234.56"
      const parsedAmt = parseNumber(amt);
      amt = isNaN(parsedAmt) ? '0' : String(parsedAmt);

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
        date = date.trim();
      } else {
        date = '';
      }

      // 3. Force Reference to String
      const ref = row[refIdx] !== undefined ? String(row[refIdx]).trim() : '';

      // 4. Optional Party Reference
      let line = `${amt}\t${date}\t${ref}`;
      if (partyRefIdx !== -1) {
        const pRef = row[partyRefIdx] !== undefined ? String(row[partyRefIdx]).trim() : '';
        line += `\t${pRef}`;
      }

      return line;
    }).filter(line => line.trim().length > 2); // Filter empty result lines

    const finalText = formattedLines.join('\n');

    if (modalTargetSide === 'company') updateCurrentData({ companyRaw: finalText, companyFileName: companyFileName || '' });
    else if (modalTargetSide === 'restaurant') updateCurrentData({ restaurantRaw: finalText, restaurantFileName: restaurantFileName || '' });

    alert(`تم استيراد ${formattedLines.length} سجل بنجاح.`);

    // Reset
    setMappingModalOpen(false);
    setPendingFileData([]);
    setPendingFileHeaders([]);
    setModalTargetSide(null);
  };


  // Helper: Group history items by date
  const groupedHistory = useMemo(() => {
    const groups: Record<string, ReconData[]> = {};
    history.forEach(item => {
      const date = item.date || 'غير محدد';
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0])); // Recent dates first
  }, [history]);

  // Removed hardcoded COLORS object - using colors.css variables instead

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f172a] text-slate-900 dark:text-slate-200 font-sans selection:bg-indigo-500/30 transition-colors duration-500">
      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-600/10 blur-[120px] rounded-full"></div>
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 lg:px-8 py-8">

        {/* --- Hero Header --- */}
        <header className="mb-10 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm tracking-widest uppercase">
                <span className="h-[2px] w-8 bg-indigo-500"></span>
                نظام المطابقة الذكي
              </div>
              <h1 className="text-4xl lg:text-5xl font-black text-slate-900 dark:text-white leading-tight tracking-tight">
                مطابقة <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-violet-500 dark:from-indigo-400 dark:to-violet-400">المطاعم</span>
              </h1>
              <p className="text-slate-400 text-lg max-w-2xl">
                أدخل بيانات الشركة والمطعم لبدء عملية التحليل واستخراج الفروقات بدقة متناهية.
              </p>
            </div>

            <div className="flex items-center gap-3">
            </div>
          </div>
        </header>

        <div className="space-y-8">

          {/* --- Main Content Area --- */}
          <div className="space-y-8">

            {/* Restaurant Name Section */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/10 blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-indigo-600/20 transition-all duration-700"></div>

              <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
                <div className="size-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                  <span className="material-symbols-outlined text-3xl">restaurant</span>
                </div>
                <div className="flex-1 w-full space-y-1.5">
                  <label className="text-slate-400 font-bold px-1 flex items-center gap-2">
                    اسم المنشأة / المطعم
                    <span className="text-indigo-500 font-bold">*</span>
                  </label>
                  <input
                    value={currentData.restaurantName}
                    onChange={(e) => updateCurrentData({ restaurantName: e.target.value })}
                    className="w-full h-16 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-2xl px-6 text-xl font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-sm dark:shadow-inner"
                    placeholder="مثال: مطعم النخبة - فرع الرياض"
                  />
                </div>
              </div>
            </div>

            {/* Input Panels Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {/* Company Input Panel */}
              <InputPanel
                title="سجلات الشركة"
                icon="corporate_fare"
                subtitle="البيانات المالية المسجلة في النظام"
                color="indigo"
                rowCount={companyRows}
                value={currentData.companyRaw}
                onChange={(val: string) => updateCurrentData({ companyRaw: val })}
                placeholders={['15000\t2024-10-24\tINV-001', '23050\t2024-10-25\tINV-002']}
                mode={inputMode}
                onFileUpload={(e: any) => handleFileUpload('company', e)}
                fileName={companyFileName}
                isUploading={isUploading}
              />

              {/* Restaurant Input Panel */}
              <InputPanel
                title="سجلات المطعم"
                icon="storefront"
                subtitle="البيانات المستخرجة من بوابة المطعم"
                color="violet"
                rowCount={restaurantRows}
                value={currentData.restaurantRaw}
                onChange={(val: string) => updateCurrentData({ restaurantRaw: val })}
                placeholders={['15000\t2024-10-24\tREF-X1', '23050\t2024-10-25\tREF-X2']}
                mode={inputMode}
                onFileUpload={(e: any) => handleFileUpload('restaurant', e)}
                fileName={restaurantFileName}
                isUploading={isUploading}
              />
            </div>

            {/* Bottom Action Section */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-1 bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden hover:border-white/20 transition-all group">
              <div className="px-8 py-4 flex items-center gap-4 text-slate-400">
                <div className="size-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <span className="material-symbols-outlined">lightbulb</span>
                </div>
                <p className="text-sm font-medium leading-relaxed">
                  نصيحة: يمكنك لصق البيانات يدوياً أو رفع ملف الإكسل مباشرة في نفس اللوحة.
                </p>
              </div>

              <button
                onClick={handleStartAnalysis}
                disabled={!currentData.restaurantName || (!currentData.companyRaw && !currentData.restaurantRaw)}
                className="w-full md:w-auto px-12 py-6 bg-gradient-to-r from-indigo-600 to-violet-700 text-white font-black text-xl flex items-center justify-center gap-4 hover:from-indigo-500 hover:to-violet-600 disabled:opacity-30 disabled:grayscale transition-all shadow-xl shadow-indigo-600/20 active:scale-95 group"
              >
                بدء التحليل والمطابقة
                <span className="material-symbols-outlined group-hover:translate-x-[-4px] transition-transform">arrow_back_ios</span>
              </button>
            </div>

            {/* Features Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <PremiumFeature
                icon="verified"
                title="دقة متناهية"
                desc="تدقيق مزدوج للمبالغ والمراجع لضمان سلامة الجرد."
                color="indigo"
              />
              <PremiumFeature
                icon="auto_awesome"
                title="معالجة ذكية"
                desc="خوارزميات متطورة للتعامل مع تنسيقات التاريخ المختلفة."
                color="violet"
              />
              <PremiumFeature
                icon="security"
                title="أمان البيانات"
                desc="تشفير محلي للبيانات مع حفظ تلقائي في السجل السحابي."
                color="amber"
              />
            </div>
          </div>

          {/* --- History Section (Grouped Table) --- */}
          <section className="mt-12 animate-fade-in">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                <div className="size-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-500 shadow-lg shadow-amber-500/10">
                  <span className="material-symbols-outlined">history</span>
                </div>
                سجل المطابقات المؤرشفة
              </h3>
            </div>

            {history.length === 0 ? (
              <div className="bg-white dark:bg-white/5 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-3xl p-16 flex flex-col items-center justify-center text-slate-400 text-center gap-4">
                <span className="material-symbols-outlined text-6xl opacity-20">inventory_2</span>
                <div className="space-y-1">
                  <p className="text-xl font-bold text-slate-600 dark:text-slate-300">لا يوجد سجل مطابقات حالياً</p>
                  <p className="text-sm opacity-60">سيظهر هنا تاريخ كافة العمليات التي تقوم بها</p>
                </div>
              </div>
            ) : (
              <div className="space-y-10">
                {groupedHistory.map(([date, items]) => (
                  <div key={date} className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="h-px flex-1 bg-slate-200 dark:bg-white/10"></div>
                      <span className="px-4 py-1.5 rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 text-xs font-black tracking-widest uppercase">{date}</span>
                      <div className="h-px flex-1 bg-slate-200 dark:bg-white/10"></div>
                    </div>

                    <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-[2rem] overflow-hidden shadow-xl">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                              <th className="px-8 py-5 text-right text-xs font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">اسم المنشأة</th>
                              <th className="px-8 py-5 text-right text-xs font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">الملفات المستخدمة</th>
                              <th className="px-8 py-5 text-center text-xs font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">الحالة</th>
                              <th className="px-8 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">الفارق</th>
                              <th className="px-8 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest whitespace-nowrap w-24">إجراءات</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {items.map((item) => {
                              const isMatched = Math.abs(item.calculatedVariance || 0) < 0.1 && (item.status === 'matched');
                              return (
                                <tr
                                  key={item.id}
                                  onClick={() => loadFromHistory(item.id)}
                                  className="group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
                                >
                                  <td className="px-8 py-6 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                      <div className="size-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold group-hover:scale-110 transition-transform">
                                        {item.restaurantName?.[0] || 'R'}
                                      </div>
                                      <span className="text-sm font-black text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                        {item.restaurantName || "بدون اسم"}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-8 py-6">
                                    <div className="flex items-center gap-3">
                                      {item.companyFileName ? (
                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 dark:bg-white/5 text-[10px] font-bold text-slate-500 dark:text-slate-400 max-w-[150px] truncate border border-slate-200 dark:border-white/5">
                                          <span className="material-symbols-outlined text-sm text-indigo-500">description</span>
                                          {item.companyFileName}
                                        </div>
                                      ) : (
                                        <span className="text-[10px] text-slate-300 dark:text-slate-700 italic">لا يوجد ملف شركة</span>
                                      )}
                                      {item.restaurantFileName && (
                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 dark:bg-white/5 text-[10px] font-bold text-slate-500 dark:text-slate-400 max-w-[150px] truncate border border-slate-200 dark:border-white/5">
                                          <span className="material-symbols-outlined text-sm text-violet-500">description</span>
                                          {item.restaurantFileName}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-8 py-6 text-center">
                                    {isMatched ? (
                                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase">
                                        <span className="material-symbols-outlined text-sm">verified</span>
                                        مطابق
                                      </div>
                                    ) : (
                                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[10px] font-black uppercase">
                                        <span className="material-symbols-outlined text-sm">warning</span>
                                        فروقات
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-8 py-6 text-left whitespace-nowrap">
                                    <span className={`text-sm font-black font-mono dir-ltr ${isMatched ? 'text-slate-400' : 'text-amber-600 dark:text-amber-500'}`}>
                                      {item.calculatedVariance?.toLocaleString()} <span className="text-[10px] opacity-60 font-sans">{currency}</span>
                                    </span>
                                  </td>
                                  <td className="px-8 py-6 text-left">
                                    <button className="size-9 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 transition-all active:scale-90">
                                      <span className="material-symbols-outlined text-lg">open_in_new</span>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <ColumnMappingModal
        isOpen={mappingModalOpen}
        onClose={() => setMappingModalOpen(false)}
        headers={pendingFileHeaders}
        side={modalTargetSide}
        onConfirm={handleMappingConfirm}
      />
    </div>
  );
};

// --- Sub-components with Premium Styling ---

const InputPanel = ({ title, icon, subtitle, color, rowCount, value, onChange, placeholders, mode, onFileUpload, fileName, isUploading }: any) => {
  const colorStyles: any = {
    indigo: {
      bg: 'bg-indigo-500/10',
      text: 'text-indigo-400',
      border: 'group-hover:border-indigo-500/50',
      glow: 'shadow-indigo-500/20',
      badge: 'bg-indigo-500 text-white'
    },
    violet: {
      bg: 'bg-violet-500/10',
      text: 'text-violet-400',
      border: 'group-hover:border-violet-500/50',
      glow: 'shadow-violet-500/20',
      badge: 'bg-violet-500 text-white'
    }
  };

  const style = colorStyles[color];

  return (
    <div className={`flex flex-col gap-6 bg-white dark:bg-white/5 dark:backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-[2rem] p-8 shadow-xl transition-all duration-300 group`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`size-14 rounded-2xl ${style.bg} flex items-center justify-center ${style.text} shadow-lg ${style.glow}`}>
            <span className="material-symbols-outlined text-2xl">{icon}</span>
          </div>
          <div className="space-y-0.5">
            <h3 className="text-xl font-black text-slate-800 dark:text-white leading-none">{title}</h3>
            <p className="text-xs text-slate-500 font-medium">{subtitle}</p>
          </div>
        </div>
        <div className={`px-3 py-1.5 rounded-xl ${style.badge} text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg`}>
          <span>الأسطر:</span>
          <span className="text-white font-mono">{rowCount}</span>
        </div>
      </div>

      {/* Textarea area */}
      <div className="relative group/ta">
        <div className="absolute top-4 right-4 text-[10px] font-black text-slate-600 uppercase tracking-widest z-10 flex items-center gap-1">
          <span className="material-symbols-outlined text-xs">code</span> إدخال البيانات
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5 rounded-2xl p-6 pt-12 min-h-[260px] resize-none font-mono text-sm leading-relaxed text-indigo-900 dark:text-indigo-100 placeholder:text-slate-300 dark:placeholder:text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-inner custom-scrollbar"
          placeholder={`الصق البيانات من إكسل هنا أو ارفع ملف... \nمثال:\n${placeholders[0]}\n${placeholders[1]}`}
        />
      </div>

      {/* File Upload Strip */}
      <div className="relative">
        <input
          type="file"
          onChange={onFileUpload}
          accept=".csv,.txt,.xlsx"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div className={`flex items-center justify-center gap-3 py-4 border-2 border-dashed border-slate-200/50 dark:border-white/10 hover:border-${color}-400/50 dark:hover:border-${color}-400/30 rounded-2xl transition-all hover:bg-slate-50 dark:hover:bg-white/[0.02] cursor-pointer`}>
          {isUploading ? (
            <>
              <span className={`material-symbols-outlined ${style.text} animate-spin text-xl`}>sync</span>
              <span className="text-sm font-bold text-slate-600 dark:text-white">جاري المعالجة...</span>
            </>
          ) : fileName ? (
            <>
              <span className={`material-symbols-outlined text-emerald-500 text-xl`}>task_alt</span>
              <span className="text-sm font-bold text-slate-600 dark:text-white">تم قراءة:</span>
              <span className="text-sm font-bold text-slate-400 truncate max-w-[200px]">{fileName}</span>
              <span className="text-[10px] text-slate-400">(اضغط لتحديث)</span>
            </>
          ) : (
            <>
              <span className={`material-symbols-outlined ${style.text} text-xl`}>cloud_upload</span>
              <span className="text-sm font-bold text-slate-600 dark:text-white">رفع ملف Excel أو CSV</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const PremiumFeature = ({ icon, title, desc, color }: any) => {
  const colors: any = {
    indigo: 'from-indigo-500/20 to-indigo-500/5 text-indigo-400',
    violet: 'from-violet-500/20 to-violet-500/5 text-violet-400',
    amber: 'from-amber-500/20 to-amber-500/5 text-amber-500'
  };
  return (
    <div className={`p-6 bg-gradient-to-br ${colors[color]} border border-slate-200 dark:border-white/5 rounded-2xl space-y-3 shadow-sm`}>
      <span className="material-symbols-outlined text-3xl font-light">{icon}</span>
      <h3 className="font-black text-slate-800 dark:text-white text-base">{title}</h3>
      <p className="text-xs text-slate-500 leading-relaxed font-medium">{desc}</p>
    </div>
  );
};


export default InputPage;