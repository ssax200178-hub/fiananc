import React, { useState, useEffect } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Calendar, Search, FileSpreadsheet, Printer } from 'lucide-react';

export default function RestaurantStatementsPage() {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // Start of month
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statements, setStatements] = useState<any[]>([]);

  // Load scraped statements from Firestore
  const fetchStatements = async () => {
    try {
      const stmtRef = collection(db, 'app/v1_data/scraped_restaurant_statements');
      const snapshot = await getDocs(stmtRef);
      const data: any[] = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        if (d.fromDate === fromDate && d.toDate === toDate) {
          data.push({ id: doc.id, ...d });
        }
      });
      setStatements(data);
    } catch (e) {
      console.error("Error fetching statements:", e);
    }
  };

  useEffect(() => {
    fetchStatements();
  }, [fromDate, toDate]);

  const handleScrape = async () => {
    setLoading(true);
    setStatusMsg("جاري الاتصال بالخادم لسحب كشوفات المطاعم...");
    try {
      const apiUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:10000/scrape-restaurant-statements'
        : 'https://tawseel-scraper-api.onrender.com/scrape-restaurant-statements';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'tawseel-scraper-2024'
        },
        body: JSON.stringify({ fromDate, toDate, markets: 'all' })
      });

      const data = await response.json();
      if (data.success) {
        setStatusMsg("تم بدء السحب بنجاح. قد تستغرق العملية بضع دقائق حسب عدد المطاعم. قم بتحديث الصفحة لاحقاً.");
      } else {
        setStatusMsg("فشل السحب: " + (data.error || "خطأ غير معروف"));
      }
    } catch (err: any) {
      console.error(err);
      setStatusMsg("خطأ: " + err.message);
    }
    setLoading(false);
  };

  // Export a single statement to CSV (which opens perfectly in Excel with BOM)
  const exportToExcel = (statement: any) => {
    // 1. Prepare Header
    let csvContent = "\uFEFF"; // UTF-8 BOM for Arabic support in Excel
    csvContent += `كشف حساب مطعم: ${statement.marketName}\n`;
    csvContent += `الفترة من: ${statement.fromDate} إلى: ${statement.toDate}\n\n`;
    
    // 2. Table Headers
    const headers = [
      "رقم القيد", "رقم الطلب", "رقم الفاتورة", "مدين", "دائن", 
      "التراكمي", "التاريخ", "البيان", "الحالة"
    ];
    csvContent += headers.join(",") + "\n";

    // 3. Rows
    statement.rows.forEach((row: any) => {
      const r = [
        row.entryNumber,
        row.orderNumber,
        row.invoiceNumber,
        `"${row.debit}"`,
        `"${row.credit}"`,
        `"${row.cumulative}"`,
        row.date,
        `"${row.description.replace(/"/g, '""')}"`, // escape quotes in description
        row.status
      ];
      csvContent += r.join(",") + "\n";
    });

    // 4. Totals Footer
    csvContent += `\n,,,"${statement.totals.debit}","${statement.totals.credit}","${statement.totals.finalBalance}",,,`;

    // 5. Download Trigger
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `كشف_حساب_${statement.marketName}_${statement.fromDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const printStatement = (statement: any) => {
    // Create a printable HTML view
    const printWindow = window.open('', '', 'height=800,width=1000');
    if (!printWindow) return;

    let html = `
      <html dir="rtl">
        <head>
          <title>طباعة كشف حساب - ${statement.marketName}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
            th { background-color: #f8f9fa; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .totals { font-weight: bold; background-color: #f8f9fa; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>كشف حساب مطعم</h2>
            <h3>${statement.marketName}</h3>
            <p>الفترة من: ${statement.fromDate} إلى ${statement.toDate}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>رقم القيد</th>
                <th>رقم الطلب</th>
                <th>رقم الفاتورة</th>
                <th>مدين</th>
                <th>دائن</th>
                <th>التراكمي</th>
                <th>التاريخ</th>
                <th style="width: 30%;">البيان</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
    `;

    statement.rows.forEach((row: any) => {
      html += `
        <tr>
          <td>${row.entryNumber}</td>
          <td>${row.orderNumber}</td>
          <td>${row.invoiceNumber}</td>
          <td>${row.debit}</td>
          <td>${row.credit}</td>
          <td dir="ltr">${row.cumulative}</td>
          <td>${row.date}</td>
          <td>${row.description}</td>
          <td>${row.status}</td>
        </tr>
      `;
    });

    html += `
            </tbody>
            <tfoot>
              <tr class="totals">
                <td colspan="3">الإجمالي</td>
                <td>${statement.totals.debit}</td>
                <td>${statement.totals.credit}</td>
                <td dir="ltr">${statement.totals.finalBalance}</td>
                <td colspan="3"></td>
              </tr>
            </tfoot>
          </table>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex items-center gap-4 mb-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-100/60">
        <div className="p-3 bg-blue-50 rounded-xl">
          <FileSpreadsheet className="h-8 w-8 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">كشوفات حساب المطاعم</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">سحب وتصدير كشوفات حساب المطاعم (Excel/PDF) لفترات السداد</p>
        </div>
      </div>

      {/* Control Panel */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100/60">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">من تاريخ</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">إلى تاريخ</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handleScrape}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Search className="h-5 w-5" />
              {loading ? 'جاري السحب...' : 'سحب الكشوفات من النظام'}
            </button>
            <button
              onClick={fetchStatements}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors font-bold"
              title="تحديث العرض"
            >
              تحديث
            </button>
          </div>
        </div>
        
        {statusMsg && (
          <div className="mt-4 p-3 bg-blue-50 text-blue-800 rounded-lg text-sm font-medium border border-blue-100">
            {statusMsg}
          </div>
        )}
      </div>

      {/* Statements List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100/60 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-bold text-gray-800">الكشوفات المسحوبة للفترة المحددة ({statements.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-600 font-medium">
              <tr>
                <th className="px-4 py-3">المطعم</th>
                <th className="px-4 py-3 text-center">إجمالي الدائن</th>
                <th className="px-4 py-3 text-center">إجمالي المدين</th>
                <th className="px-4 py-3 text-center">الرصيد النهائي</th>
                <th className="px-4 py-3 text-center">عدد الحركات</th>
                <th className="px-4 py-3 text-center">تصدير / طباعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {statements.length > 0 ? statements.map((stmt, i) => (
                <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-4 py-4 font-bold text-gray-900">{stmt.marketName}</td>
                  <td className="px-4 py-4 text-center text-emerald-600 font-bold" dir="ltr">{stmt.totals?.credit}</td>
                  <td className="px-4 py-4 text-center text-red-600 font-bold" dir="ltr">{stmt.totals?.debit}</td>
                  <td className="px-4 py-4 text-center text-gray-800 font-black" dir="ltr">{stmt.totals?.finalBalance}</td>
                  <td className="px-4 py-4 text-center text-gray-500 font-bold">{stmt.rows?.length || 0}</td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => exportToExcel(stmt)}
                        className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 font-medium transition-colors"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                        Excel
                      </button>
                      <button 
                        onClick={() => printStatement(stmt)}
                        className="flex items-center gap-1 bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                      >
                        <Printer className="h-4 w-4" />
                        طباعة / PDF
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    لا توجد كشوفات مسحوبة لهذه الفترة. قم بالضغط على "سحب الكشوفات" للبدء.
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
