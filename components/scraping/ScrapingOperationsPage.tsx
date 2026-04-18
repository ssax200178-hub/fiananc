import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAppContext } from '../../AppContext';

const CLOUD_SERVER_URL = 'https://tawseel-cloud-scraper.onrender.com';

const BRANCHES = [
  { id: 'all', label: 'جميع الفروع' },
  { id: 'tenant.main', label: 'صنعاء (الرئيسي)' },
  { id: 'tenant.aden', label: 'عدن' },
  { id: 'tenant.ibb', label: 'إب' },
  { id: 'tenant.mukalla', label: 'المكلا' },
  { id: 'tenant.taizzhw', label: 'تعز - الحوبان' },
  { id: 'tenant.marib', label: 'مارب' },
  { id: 'tenant.dhamar', label: 'ذمار' },
  { id: 'tenant.taizz', label: 'تعز - المدينة' },
  { id: 'tenant.hudaydah', label: 'الحديدة' },
  { id: 'tenant.seiyun', label: 'سيئون' },
];

interface JobResult {
  success: boolean;
  message: string;
  timestamp: string;
}

interface JobState {
  loading: boolean;
  result: JobResult | null;
}

const ScrapingOperationsPage: React.FC = () => {
  const { automationConfig } = useAppContext();

  const apiSecret = automationConfig?.apiSecret || 'tawseel-scraper-2024';
  const serverUrl = automationConfig?.cloudServerUrl || CLOUD_SERVER_URL;

  // Worker live status from Firestore
  const [workerStatus, setWorkerStatus] = useState<string>('idle');
  const [workerMessage, setWorkerMessage] = useState<string>('');

  // Per-operation state
  const [mainJob, setMainJob] = useState<JobState>({ loading: false, result: null });
  const [driverCreditsJob, setDriverCreditsJob] = useState<JobState>({ loading: false, result: null });
  const [invoiceBooksJob, setInvoiceBooksJob] = useState<JobState>({ loading: false, result: null });
  const [restaurantStatementsJob, setRestaurantStatementsJob] = useState<JobState>({ loading: false, result: null });

  // Filters
  const [driverCreditsBranch, setDriverCreditsBranch] = useState<string>('all');
  const [invoiceBooksBranch, setInvoiceBooksBranch] = useState<string>('all');
  const [invoiceBooksFrom, setInvoiceBooksFrom] = useState<string>('1');
  const [invoiceBooksTo, setInvoiceBooksTo] = useState<string>('999999');
  const [statementsBranch, setStatementsBranch] = useState<string>('all');
  const [statementsFromDate, setStatementsFromDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(0); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [statementsToDate, setStatementsToDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Debug State
  const [debugResult, setDebugResult] = useState<any>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  // Listen to Firestore worker status
  useEffect(() => {
    if (!db) return;
    const ref = doc(db, 'app', 'v1_data', 'settings', 'scraping_config');
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setWorkerStatus(data.workerStatus || 'idle');
        setWorkerMessage(data.statusMessage || '');
      }
    });
    return () => unsub();
  }, []);

  const callServer = async (
    endpoint: string,
    body: Record<string, any>,
    setJob: React.Dispatch<React.SetStateAction<JobState>>
  ) => {
    setJob({ loading: true, result: null });
    try {
      const res = await fetch(`${serverUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiSecret,
        },
        body: JSON.stringify(body),
      });

      const textResponse = await res.text();
      let data;
      try {
        data = JSON.parse(textResponse);
      } catch (parseError) {
        throw new Error(`تعذر قراءة رد الخادم. (الخطأ: غير صالح كـ JSON). يرجى التأكد من أن التحديثات قد رُفعت إلى الخادم السحابي بنجاح.`);
      }

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setJob({
        loading: false,
        result: {
          success: true,
          message: data.message || '✅ تم إرسال الأمر بنجاح',
          timestamp: new Date().toLocaleTimeString('ar-SA'),
        },
      });
    } catch (err: any) {
      setJob({
        loading: false,
        result: {
          success: false,
          message: `❌ ${err.message}`,
          timestamp: new Date().toLocaleTimeString('ar-SA'),
        },
      });
    }
  };

  const runDebugDriversTable = async () => {
    setDebugLoading(true);
    setDebugResult(null);
    try {
      const res = await fetch(`${serverUrl}/debug-drivers-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiSecret },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setDebugResult(data);
    } catch (err: any) {
      setDebugResult({ error: "الرابط غير موجود في الخادم السحابي، هل تأكدت من رفع التحديثات؟ (" + err.message + ")" });
    } finally {
      setDebugLoading(false);
    }
  };

  const isWorkerBusy = workerStatus === 'running';

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
          <span className="material-symbols-outlined text-4xl text-blue-500">cloud_download</span>
          دليل عمليات السحب الشامل
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 font-bold">
          واجهة مخصصة لتنفيذ ومراقبة عمليات سحب البيانات من منصة تَوصيل، مع إمكانية الفلترة وتحديد نطاق العمليات.
        </p>
      </div>

      {/* Server & Worker Status */}
      <div className={`flex items-center gap-3 p-4 rounded-2xl border font-bold text-sm shadow-sm ${
        isWorkerBusy
          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
          : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
      }`}>
        <span className={`material-symbols-outlined text-2xl ${isWorkerBusy ? 'animate-spin' : ''}`}>
          {isWorkerBusy ? 'sync' : 'cloud_done'}
        </span>
        <div>
          <div>{isWorkerBusy ? 'الخادم يعمل الآن...' : 'الخادم جاهز للاستقبال'}</div>
          {workerMessage && (
            <div className="text-xs opacity-80 mt-0.5">{workerMessage}</div>
          )}
        </div>
        <div className="mr-auto text-xs opacity-60 font-mono truncate max-w-[280px]">{serverUrl}</div>
      </div>

      {/* ─── 1. السحب الرئيسي الشامل ─── */}
      <OperationCard
        icon="hub"
        iconColor="text-indigo-500"
        bgColor="bg-indigo-50 dark:bg-indigo-900/20"
        borderColor="border-indigo-200 dark:border-indigo-800"
        title="السحب الرئيسي الشامل (تحديث يومي)"
        sourceUrl="https://tawseel.app/admin/accounting/report/monthly (وما يشابهها)"
        description="هذه العملية الشاملة تسحب جميع البيانات الأساسية: أرصدة جميع المتاجر، أرصدة البنوك، أرصدة وتفاصيل الموصلين، أرصدة الموظفين المصرحين، تفاصيل المحافظ وتفاصيل الاتصال الخاصة بالمتاجر."
        notes={[
          "يسحب من كل الأنظمة وجميع الفروع.",
          "هذه العملية هي الأطول والأكثر شمولاً (تستغرق من 3 إلى 5 دقائق).",
          "تستخدم كمرجع أساسي لأرصدة النظام قبل أي عمليات مطابقة."
        ]}
        badge="start-job"
        job={mainJob}
        disabled={isWorkerBusy && !mainJob.loading}
        onRun={() => callServer('/start-job', { trigger: 'manual' }, setMainJob)}
        buttonLabel="تشغيل السحب الكامل لجميع البيانات"
        buttonIcon="rocket_launch"
      />

      {/* ─── 2. كشف أرصدة الموصلين (Driver Credits) ─── */}
      <OperationCard
        icon="two_wheeler"
        iconColor="text-orange-500"
        bgColor="bg-orange-50 dark:bg-orange-900/20"
        borderColor="border-orange-200 dark:border-orange-800"
        title="كشف أرصدة وتفاصيل الموصلين (الكباتن)"
        sourceUrl="https://tawseel.app/admin/accounting/delivery/credit"
        description="يسحب هذه العملية جدول الأرصدة المالية الخاصة بكل كابتن (موصل). ويدعم اختيار الفرع لمعالجة بيانات منطقة محددة."
        notes={[
          "يتم السحب بنوعي العملة تلقائياً: ريال جديد (كود 7) وريال قديم (كود 8).",
          "إذا قمت باختيار 'جميع الفروع'، سيمر الخادم على كل فرع بالتسلسل لضمان عدم حظر الحساب.",
          "البيانات المستخرجة يتم حفظها في جدول منفصل (scraped_driver_credits)."
        ]}
        badge="/scrape-driver-credits"
        job={driverCreditsJob}
        disabled={isWorkerBusy && !driverCreditsJob.loading}
        onRun={() => callServer('/scrape-driver-credits', { branch: driverCreditsBranch }, setDriverCreditsJob)}
        buttonLabel="سحب أرصدة الموصلين"
        buttonIcon="payments"
      >
        <FilterRow label="الفرع المستهدف" icon="location_on">
          <BranchSelect value={driverCreditsBranch} onChange={setDriverCreditsBranch} />
        </FilterRow>
      </OperationCard>

      {/* ─── 3. دفاتر الفواتير (Invoice Books) ─── */}
      <OperationCard
        icon="menu_book"
        iconColor="text-purple-500"
        bgColor="bg-purple-50 dark:bg-purple-900/20"
        borderColor="border-purple-200 dark:border-purple-800"
        title="تقرير حالة دفاتر الفواتير (Invoice Books)"
        sourceUrl="https://tawseel.app/admin/report/booksinvoice"
        description="يسحب ملخصات الدفاتر (نطاقات الأرقام، الكميات المصروفة، التواريخ) بالإضافة إلى سحب التفاصيل لكل دفتر على حدة لمعرفة حالة كل دفتر (مكتمل، غير مكتمل، تم تسليمه)."
        notes={[
          "هذه العملية مهمة لمطابقة الفواتير الورقية، حيث توضح الدفاتر التي لم يتم إرجاعها بعد.",
          "يمكنك تحديد نطاق أرقام الفواتير لتقليل حجم البيانات المسحوبة وتسريع العملية.",
          "إذا وضعت من 1 إلى 999999 سيتم جلب كل تاريخ الدفاتر."
        ]}
        badge="/scrape-invoice-books"
        job={invoiceBooksJob}
        disabled={isWorkerBusy && !invoiceBooksJob.loading}
        onRun={() => callServer('/scrape-invoice-books', {
          fromInvoice: invoiceBooksFrom,
          toInvoice: invoiceBooksTo,
          branch: invoiceBooksBranch,
        }, setInvoiceBooksJob)}
        buttonLabel="سحب حالة دفاتر الفواتير"
        buttonIcon="library_books"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FilterRow label="الفرع" icon="location_on">
            <BranchSelect value={invoiceBooksBranch} onChange={setInvoiceBooksBranch} />
          </FilterRow>
          <FilterRow label="من فاتورة رقم" icon="first_page">
            <input
              type="number"
              min={1}
              value={invoiceBooksFrom}
              onChange={e => setInvoiceBooksFrom(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-center focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              placeholder="1"
            />
          </FilterRow>
          <FilterRow label="إلى فاتورة رقم" icon="last_page">
            <input
              type="number"
              min={1}
              value={invoiceBooksTo}
              onChange={e => setInvoiceBooksTo(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-center focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              placeholder="999999"
            />
          </FilterRow>
        </div>
      </OperationCard>

      {/* ─── 4. كشوفات المطاعم (Restaurant Statements) ─── */}
      <OperationCard
        icon="receipt_long"
        iconColor="text-rose-500"
        bgColor="bg-rose-50 dark:bg-rose-900/20"
        borderColor="border-rose-200 dark:border-rose-800"
        title="كشوفات حساب المطاعم (تفصيلي)"
        sourceUrl="https://tawseel.app/admin/accounting/market/statement"
        description="تسحب هذه العملية قيود الكشف الحسابي لكل مطعم مسجل في قاعدة البيانات (المدين، الدائن، الرصيد التراكمي وتاريخ القيد) حسب نطاق زمني محدد."
        notes={[
          "تحذير: هذه العملية ثقيلة جداً وقد تستغرق أكثر من 15 دقيقة إذا كان النطاق الزمني طويلاً.",
          "تستخدم لغرض مطابقة المديونيات ومعرفة حركة الحساب الدقيقة للمتجر.",
          "يفضل اختيار فترة لا تتجاوز الشهر لتجنب الإرهاق العالي للخادم."
        ]}
        badge="/scrape-restaurant-statements"
        job={restaurantStatementsJob}
        disabled={isWorkerBusy && !restaurantStatementsJob.loading}
        onRun={() => callServer('/scrape-restaurant-statements', {
          fromDate: statementsFromDate,
          toDate: statementsToDate,
        }, setRestaurantStatementsJob)}
        buttonLabel="سحب كشوفات حساب المطاعم"
        buttonIcon="bar_chart"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FilterRow label="من تاريخ" icon="calendar_today">
            <input
              type="date"
              value={statementsFromDate}
              onChange={e => setStatementsFromDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
            />
          </FilterRow>
          <FilterRow label="إلى تاريخ" icon="event">
            <input
              type="date"
              value={statementsToDate}
              onChange={e => setStatementsToDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
            />
          </FilterRow>
        </div>
      </OperationCard>

      {/* ─── Debug: Drivers Table Structure ─── */}
      <details className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 overflow-hidden shadow-sm">
        <summary className="px-5 py-4 cursor-pointer flex items-center gap-3 text-sm font-black text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors select-none">
          <span className="material-symbols-outlined text-slate-400">bug_report</span>
          أداة فحص واجهات السحب (للمطورين وتشخيص الأخطاء)
          <span className="mr-auto text-xs font-normal text-slate-400">POST /debug-drivers-table</span>
        </summary>
        <div className="p-5 border-t border-slate-200 dark:border-slate-700 space-y-3">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
            تُستخدم هذه الأداة للتحقق من تغير بنية الجداول في نظام تَوصيل (تغيير اسم العمود أو ترتيبه) والذي قد يؤدي إلى فشل عمليات السحب.
          </p>
          <button
            onClick={runDebugDriversTable}
            disabled={debugLoading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white rounded-xl text-xs font-black disabled:opacity-50 transition-all hover:bg-slate-700"
          >
            <span className={`material-symbols-outlined text-sm ${debugLoading ? 'animate-spin' : ''}`}>
              {debugLoading ? 'sync' : 'search'}
            </span>
            {debugLoading ? 'جاري الفحص المباشر...' : 'فحص بنية جدول الكباتن الآن'}
          </button>

          {debugResult && (
            <div className="mt-3">
              {debugResult.error ? (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-xs font-bold text-red-700 dark:text-red-300">
                  ❌ {debugResult.error}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-xs font-bold">
                    <span className={`px-2 py-1 rounded-lg ${debugResult.isLoginPage ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {debugResult.isLoginPage ? '⚠️ خطأ: الجلسة منتهية - تم التحويل لصفحة تسجيل الدخول' : '✅ تم الوصول للصفحة والتحقق من الجلسة بنجاح'}
                    </span>
                    <span className="text-slate-500">{debugResult.tablesFound} جدول بيانات تم العثور عليه</span>
                  </div>
                  {debugResult.tables?.map((table: any, ti: number) => (
                    <div key={ti} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-xs font-black text-slate-700 dark:text-slate-200">
                        جدول #{ti + 1}: <code className="text-blue-600 dark:text-blue-400">#{table.tableId}</code>
                        <span className="mr-2 font-normal text-slate-400">{table.tableClass}</span>
                      </div>
                      {table.headers.length > 0 && (
                        <div className="px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-xs">
                          <span className="font-black text-indigo-700 dark:text-indigo-300">رؤوس الأعمدة المُكتشفة: </span>
                          <span className="font-mono text-slate-600 dark:text-slate-300">
                            {table.headers.map((h: string, i: number) => `[${i}] ${h}`).join(' | ')}
                          </span>
                        </div>
                      )}
                      {table.sampleRows.map((row: any[], ri: number) => (
                        <div key={ri} className="px-3 py-2 border-t border-slate-100 dark:border-slate-700 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          بيانات الصف {ri + 1}: {row.map((c: any) => `[${c.col}]"${c.text}"`).join(' | ')}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </details>

      {/* Help Note */}
      <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-400 space-y-2">
        <div className="flex items-center gap-2 text-slate-800 dark:text-white font-black mb-3">
          <span className="material-symbols-outlined text-blue-500">help</span>
          معلومات تقنية لعملية السحب
        </div>
        <ul className="space-y-2 list-none">
          {[
            'يجب أن يكون الخادم السحابي (Render) متاحاً وأن تكون الجلسة صالحة قبل تشغيل أي عملية.',
            'رسالة الخطأ "Unexpected token" تعني أن الخادم قام بإرجاع صفحة HTML بدلاً من JSON، وهو ما يحدث عادة عندما يكون رابط العملية غير موجود (التحديث لم يرفع بعد) أو عند وجود خطأ داخلي في الخادم.',
            'عمليات السحب تعمل بالخلفية بشكل كامل، فلا داعي لإبقاء هذه الصفحة مفتوحة بعد ظهور رسالة "تم إرسال الأمر".',
            'يمكنك دائماً متابعة السجل الحي للعملية من "مركز السحب والأتمتة".'
          ].map((note, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="material-symbols-outlined text-blue-400 text-sm mt-0.5">info</span>
              <span className="leading-relaxed">{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────

interface OperationCardProps {
  icon: string;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  title: string;
  sourceUrl: string;
  description: string;
  notes: string[];
  badge: string;
  job: JobState;
  disabled: boolean;
  onRun: () => void;
  buttonLabel: string;
  buttonIcon: string;
  children?: React.ReactNode;
}

const OperationCard: React.FC<OperationCardProps> = ({
  icon, iconColor, bgColor, borderColor,
  title, sourceUrl, description, notes, badge,
  job, disabled, onRun, buttonLabel, buttonIcon,
  children
}) => (
  <div className={`rounded-2xl border ${borderColor} ${bgColor} overflow-hidden shadow-sm`}>
    {/* Card Header */}
    <div className="px-5 py-4 flex items-center gap-4 border-b border-black/5 dark:border-white/5 bg-white/40 dark:bg-slate-900/40">
      <div className="size-12 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm border border-black/5 dark:border-white/10 shrink-0">
        <span className={`material-symbols-outlined text-2xl ${iconColor}`}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-black text-slate-900 dark:text-white text-base">{title}</h3>
        <p className="text-[11px] font-mono text-blue-600 dark:text-blue-400 mt-1 truncate" dir="ltr" title={sourceUrl}>
          {sourceUrl}
        </p>
      </div>
      <span className="hidden md:inline-block text-[10px] font-mono bg-black/10 dark:bg-white/10 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-lg shrink-0">
        POST {badge}
      </span>
    </div>

    {/* Card Body */}
    <div className="p-5 space-y-4">
      {/* Description & Notes */}
      <div className="space-y-3">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 leading-relaxed">{description}</p>
        <div className="bg-white/60 dark:bg-slate-900/50 rounded-xl p-3 border border-black/5 dark:border-white/5">
          <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm text-amber-500">sticky_note_2</span>
            ملاحظات حول العملية:
          </h4>
          <ul className="space-y-1.5 list-disc list-inside text-xs font-bold text-slate-600 dark:text-slate-400">
            {notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      </div>

      {/* Filters */}
      {children && (
        <div className="bg-white/80 dark:bg-slate-900/70 rounded-xl p-4 border border-black/5 dark:border-white/5">
          <div className="text-xs font-black text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">tune</span>
            تخصيص السحب (الفلاتر)
          </div>
          {children}
        </div>
      )}

      {/* Result */}
      {job.result && (
        <div className={`flex items-start gap-3 p-3 rounded-xl text-sm font-bold border animate-fade-in ${
          job.result.success
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
        }`}>
          <span className="material-symbols-outlined text-xl shrink-0 mt-0.5">
            {job.result.success ? 'check_circle' : 'error'}
          </span>
          <div className="flex-1">
            <div>{job.result.message}</div>
            <div className="text-xs opacity-70 mt-0.5">{job.result.timestamp}</div>
          </div>
          <button
            onClick={() => {/* clear result - handled via key */}}
            className="opacity-50 hover:opacity-100 transition-opacity"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      )}

      {/* Action Button */}
      <button
        onClick={onRun}
        disabled={disabled || job.loading}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] ${
          job.loading
            ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
            : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 shadow-lg'
        }`}
      >
        <span className={`material-symbols-outlined text-lg ${job.loading ? 'animate-spin' : ''}`}>
          {job.loading ? 'sync' : buttonIcon}
        </span>
        {job.loading ? 'جاري إرسال الطلب للخادم السحابي...' : buttonLabel}
      </button>
    </div>
  </div>
);

const FilterRow: React.FC<{ label: string; icon: string; children: React.ReactNode }> = ({ label, icon, children }) => (
  <div>
    <label className="block text-[11px] font-black text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
      <span className="material-symbols-outlined text-sm">{icon}</span>
      {label}
    </label>
    {children}
  </div>
);

const BranchSelect: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
  >
    {BRANCHES.map(b => (
      <option key={b.id} value={b.id}>{b.label}</option>
    ))}
  </select>
);

export default ScrapingOperationsPage;
