import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Calendar, Search, Filter, AlertCircle, FileText, ChevronDown, CheckCircle, XCircle } from 'lucide-react';
import InlineActivityLog from './InlineActivityLog';

const BRANCHES = [
  { id: 'tenant.main', name: 'صنعاء' },
  { id: 'tenant.aden', name: 'عدن' },
  { id: 'tenant.ibb', name: 'إب' },
  { id: 'tenant.mukalla', name: 'المكلا' },
  { id: 'tenant.taizzhw', name: 'تعز - الحوبان' },
  { id: 'tenant.marib', name: 'مارب' },
  { id: 'tenant.dhamar', name: 'ذمار' },
  { id: 'tenant.taizz', name: 'تعز - المدينة' },
  { id: 'tenant.hudaydah', name: 'الحديدة' },
  { id: 'tenant.seiyun', name: 'سيئون' }
];

export default function InvoiceBooksPage() {
  const [fromInvoice, setFromInvoice] = useState('1000001');
  const [toInvoice, setToInvoice] = useState('1100000');
  const [selectedBranch, setSelectedBranch] = useState('tenant.main');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  
  const [booksData, setBooksData] = useState<any[]>([]);
  const [driverData, setDriverData] = useState<any[]>([]);
  const [lastFetchTime, setLastFetchTime] = useState('');

  const fetchData = async () => {
    try {
      // 1. Fetch Main Books Report
      const booksRef = collection(db, 'app/v1_data/scraped_invoice_books');
      let qBooks = query(booksRef);
      const snapshot = await getDocs(qBooks);
      
      let fetchedBooks: any[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (selectedBranch === 'all' || data.tenant === selectedBranch) {
          fetchedBooks.push({ id: doc.id, ...data });
        }
      });
      setBooksData(fetchedBooks);

      // 2. Fetch Drivers with pending books
      const indBooksRef = collection(db, 'app/v1_data/scraped_individual_books');
      const indSnapshot = await getDocs(indBooksRef);
      
      let pendingDriversMap: Record<string, any> = {};
      
      indSnapshot.forEach(doc => {
        const data = doc.data();
        // If the book is not completed, track the driver
        if (data.status !== 'مكتملة' && data.driverName) {
          if (!pendingDriversMap[data.driverName]) {
            pendingDriversMap[data.driverName] = {
              driverName: data.driverName,
              branch: data.branch,
              tenant: data.tenant,
              unreceivedCount: 0,
              incompleteCount: 0,
              reviewedCount: 0,
              books: []
            };
          }
          
          pendingDriversMap[data.driverName].books.push(data.bookId);
          
          if (data.status === 'غير مستلمة') pendingDriversMap[data.driverName].unreceivedCount++;
          if (data.status === 'غير مكتملة') pendingDriversMap[data.driverName].incompleteCount++;
          if (data.status === 'راجع') pendingDriversMap[data.driverName].reviewedCount++;
        }
      });

      // 3. Fetch Driver Credits (Last Payment, Last Order, Balance)
      const creditsRef = collection(db, 'app/v1_data/scraped_driver_credits');
      const credSnapshot = await getDocs(creditsRef);
      credSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.driverName && pendingDriversMap[data.driverName]) {
          pendingDriversMap[data.driverName].lastPaymentDate = data.lastPaymentDate || 'غير معروف';
          pendingDriversMap[data.driverName].lastOrderDate = data.lastOrderDate || 'غير معروف';
          pendingDriversMap[data.driverName].accountBalance = data.accountBalance || '0';
          pendingDriversMap[data.driverName].currency = data.currency || '';
          pendingDriversMap[data.driverName].status = data.status || '';
        }
      });

      setDriverData(Object.values(pendingDriversMap));
      setLastFetchTime(new Date().toLocaleTimeString());
    } catch (e) {
      console.error("Error fetching books data:", e);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedBranch]);

  // Function to trigger the scraping job
  const handleScrape = async () => {
    if (!fromInvoice || !toInvoice) {
      alert("الرجاء إدخال أرقام الفواتير (من - إلى)");
      return;
    }

    setLoading(true);
    setStatusMsg("جاري بدء عملية السحب...");
    
    try {
      // Assuming server runs on port 10000 locally
      const apiUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:10000/scrape-invoice-books'
        : 'https://tawseel-scraper-api.onrender.com/scrape-invoice-books'; // replace with actual render url later

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'tawseel-scraper-2024'
        },
        body: JSON.stringify({
          fromInvoice,
          toInvoice,
          branch: selectedBranch
        })
      });

      const data = await response.json();
      if (data.success) {
        setStatusMsg("تم إرسال أمر السحب بنجاح. يرجى الانتظار...");
      } else {
        setStatusMsg("فشل السحب: " + (data.error || "خطأ غير معروف"));
      }
    } catch (err: any) {
      console.error(err);
      setStatusMsg("خطأ في الاتصال بخادم السحب: " + err.message);
    }
    setLoading(false);
  };

  const handleScrapeCredits = async () => {
    setLoading(true);
    setStatusMsg("جاري سحب بيانات أرصدة الموصلين وأخر سداد...");
    try {
      const apiUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:10000/scrape-driver-credits'
        : 'https://tawseel-scraper-api.onrender.com/scrape-driver-credits';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'tawseel-scraper-2024'
        },
        body: JSON.stringify({ branch: selectedBranch })
      });

      const data = await response.json();
      if (data.success) {
        setStatusMsg("تم بدء سحب الأرصدة. انتظر دقيقة ثم قم بتحديث العرض.");
      } else {
        setStatusMsg("فشل السحب: " + (data.error || "خطأ غير معروف"));
      }
    } catch (err: any) {
      console.error(err);
      setStatusMsg("خطأ: " + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex items-center gap-4 mb-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-100/60">
        <div className="p-3 bg-emerald-50 rounded-xl">
          <FileText className="h-8 w-8 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">تقرير دفاتر الفواتير المختصر</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">تتبع الفواتير المنصرفة والغير منصرفة، ودمجها مع أرصدة المناديب لمراقبة الانقطاعات</p>
        </div>
      </div>

      {/* Filters Card */}
      <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">إختر الفرع</label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full h-11 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none"
            >
              <option value="all">جميع الفروع</option>
              {BRANCHES.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">من فاتورة رقم</label>
            <input
              type="number"
              value={fromInvoice}
              onChange={(e) => setFromInvoice(e.target.value)}
              className="w-full h-11 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              placeholder="مثال: 1000001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">إلى فاتورة رقم</label>
            <input
              type="number"
              value={toInvoice}
              onChange={(e) => setToInvoice(e.target.value)}
              className="w-full h-11 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              placeholder="مثال: 1100000"
            />
          </div>
          <div>
            <button
              onClick={handleScrape}
              disabled={loading}
              className="w-full h-11 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-500 text-white rounded-xl hover:from-emerald-700 hover:to-teal-600 transition-all shadow-md font-medium"
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Search className="h-5 w-5" />
              )}
              {loading ? "جاري المعالجة..." : "بحث / سحب البيانات"}
            </button>
          </div>
        </div>

        {statusMsg && (
          <div className="mt-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4" />
            {statusMsg}
          </div>
        )}
      </div>

      {/* Main Table / Data View */}
      <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-400" />
            تقرير مختصر الدفاتر
          </h3>
          <button onClick={fetchData} className="text-sm text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors font-medium flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            تحديث العرض ({lastFetchTime || 'الآن'})
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50/80 text-gray-600 font-medium border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-center">التسلسل</th>
                <th className="px-4 py-3 text-center">الفرع</th>
                <th className="px-4 py-3 text-center">الفواتير لكل ألف</th>
                <th className="px-4 py-3 text-center">عدد الفواتير المنصرفة</th>
                <th className="px-4 py-3 text-center">تاريخ أول/آخر دفتر</th>
                <th className="px-4 py-3 text-center">الدفاتر المكتملة</th>
                <th className="px-4 py-3 text-center">غير المكتملة</th>
                <th className="px-4 py-3 text-center">المراجعة</th>
                <th className="px-4 py-3 text-center">غير المستلمة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {booksData.length > 0 ? booksData.map((row, idx) => (
                <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-4 text-center text-gray-500">{idx + 1}</td>
                  <td className="px-4 py-4 text-center font-medium text-gray-900">{row.branchName}</td>
                  <td className="px-4 py-4 text-center text-gray-600" dir="ltr">{row.invoiceRange}</td>
                  <td className="px-4 py-4 text-center font-bold text-gray-800">{row.totalInvoices}</td>
                  <td className="px-4 py-4 text-center text-gray-500 text-xs">
                    <div>{row.firstDisburseDate}</div>
                    <div className="text-gray-400">إلى</div>
                    <div>{row.lastDisburseDate}</div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                      {row.completedBooks || 0}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      {row.incompleteBooks || 0}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {row.reviewedBooks || 0}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                      {row.unreceivedBooks || 0}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    لا توجد بيانات مسحوبة بعد. قم بإدخال النطاق واضغط على زر السحب.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Driver Sync Section */}
      <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-100 shadow-sm overflow-hidden mt-8">
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-amber-50/30 flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              تتبع الموصلين المنقطعين (لديهم دفاتر)
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              يتم دمج تقرير الدفاتر المتأخرة مع أرصدة الموصلين لمعرفة آخر سداد لهم
            </p>
          </div>
          <button 
            onClick={handleScrapeCredits}
            disabled={loading}
            className="text-sm text-orange-600 bg-orange-100 px-3 py-1.5 rounded-lg hover:bg-orange-200 transition-colors font-medium flex items-center gap-1 shadow-sm"
          >
            <Calendar className="h-4 w-4" />
            سحب / تحديث بيانات السداد
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-orange-50/50 text-gray-600 font-medium border-b border-gray-100">
              <tr>
                <th className="px-4 py-3">اسم الموصل</th>
                <th className="px-4 py-3 text-center">الفرع</th>
                <th className="px-4 py-3 text-center">حالة السائق</th>
                <th className="px-4 py-3 text-center">الدفاتر المتأخرة</th>
                <th className="px-4 py-3 text-center">الرصيد الحالي</th>
                <th className="px-4 py-3 text-center">تاريخ آخر طلب</th>
                <th className="px-4 py-3 text-center">آخر قيد سداد</th>
                <th className="px-4 py-3 text-center">أرقام الدفاتر</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {driverData.length > 0 ? driverData.map((d, i) => (
                <tr key={i} className="hover:bg-gray-50/50">
                  <td className="px-4 py-4 font-bold text-gray-900">{d.driverName}</td>
                  <td className="px-4 py-4 text-center text-gray-600">{d.branch}</td>
                  <td className="px-4 py-4 text-center">
                    {d.status === 'نشط' ? (
                       <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full text-xs">نشط</span>
                    ) : d.status === 'موقف مؤقتا' ? (
                       <span className="text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded-full text-xs">موقف</span>
                    ) : (
                       <span className="text-gray-500 font-medium text-xs">{d.status || '-'}</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-800 font-bold text-xs">
                      {d.unreceivedCount + d.incompleteCount + d.reviewedCount}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center font-bold text-gray-800" dir="ltr">
                    {d.accountBalance ? `${d.accountBalance} ${d.currency === 'ريال قديم' ? 'ق' : 'ج'}` : '-'}
                  </td>
                  <td className="px-4 py-4 text-center text-xs font-medium text-gray-600">
                    {d.lastOrderDate && d.lastOrderDate !== 'غير معروف' ? d.lastOrderDate.split(' ')[0] : '-'}
                  </td>
                  <td className="px-4 py-4 text-center">
                    {d.lastPaymentDate && d.lastPaymentDate !== 'غير معروف' ? (
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md text-xs font-medium">
                        {d.lastPaymentDate.split(' ')[0]}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center text-xs text-gray-500 max-w-[150px] truncate" title={d.books.join(', ')}>
                    {d.books.slice(0, 2).join(', ')} {d.books.length > 2 ? '...' : ''}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    لا يوجد موصلين لديهم دفاتر متأخرة أو لم يتم سحب البيانات الفردية بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
