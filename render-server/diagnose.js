const admin = require('firebase-admin');
const axios = require('axios');
const moment = require('moment');
const cheerio = require('cheerio');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../service-account.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const BASE_URL = "https://tawseel.app";
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
  "Referer": `${BASE_URL}/admin`,
  "Connection": "keep-alive"
};

async function run() {
  console.log("📦 Getting session from Firestore...");
  const sessionDoc = await db.doc("app/v1_data/settings/tawseel_session").get();
  const cookies = (sessionDoc.data() || {}).cookies;
  if (!cookies) { console.error("❌ No cookies!"); process.exit(1); }
  console.log("✅ Got session cookies\n");

  const dateFrom = moment().startOf("year").format("YYYY-MM-DD");
  const dateTo = moment().format("YYYY-MM-DD");

  // =============================================
  // TEST 1: Employee financial data (try code 7000)
  // =============================================
  console.log("========================================");
  console.log("📊 TEST 1: Employees with code 7000 (instead of 25000)");
  console.log("========================================");
  
  try {
    const url = `${BASE_URL}/admin/accounting/report/monthly?branch%5B%5D=tenant.*&accounting_types=0&financial_statement=0&currency=-1&clause=-1&entry_type=-1&fromdate=${dateFrom}&todate=${dateTo}&account=7000&all_branch=0&cost_center=-1`;
    const start = Date.now();
    const response = await axios.get(url, {
      headers: { ...BROWSER_HEADERS, "Accept": "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest", "Cookie": cookies },
      timeout: 180000
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    
    if (response.data && response.data.data) {
      const rawData = response.data.data;
      console.log(`  ✅ ${rawData.length} records in ${elapsed}s`);
      if (rawData.length > 0) {
        const first = rawData[0];
        console.log(`  First record:`);
        Object.entries(first).forEach(([key, val]) => {
          console.log(`    "${key}" = ${JSON.stringify(val)}`);
        });
      }
    } else {
      console.log(`  ⚠️ No data returned`);
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}`);
  }

  // =============================================
  // TEST 2: Drivers page (/delivery/men)
  // =============================================
  console.log("\n========================================");
  console.log("📊 TEST 2: Drivers page (/delivery/men) - page 1");
  console.log("========================================");
  
  try {
    const response = await axios.get(`${BASE_URL}/delivery/men`, {
      headers: { ...BROWSER_HEADERS, "Cookie": cookies },
      timeout: 60000
    });
    
    const $ = cheerio.load(response.data);
    const drivers = [];
    
    $("table#sampleTable tbody tr").each((i, row) => {
      const cells = $(row).find("td");
      if (cells.length >= 10) {
        drivers.push({
          id: $(cells[0]).text().trim(),
          name: $(cells[1]).text().trim(),
          rating: $(cells[2]).text().trim(),
          pendingBooks: $(cells[4]).text().trim(),
          phone: $(cells[5]).text().trim(),
          vehicleType: $(cells[6]).text().trim(),
          availability: $(cells[7]).text().trim(),
          invoiceSuggestion: $(cells[8]).text().trim(),
          driverStatus: $(cells[9]).text().trim(),
          savingsBalance: $(cells[10]).text().trim(),
          allowanceCeiling: $(cells[11]).text().trim(),
          contractType: $(cells[12]).text().trim()
        });
      }
    });
    
    // Check pagination
    const lastPageLink = $("ul.pagination li.page-item a.page-link").last().attr("href") || "";
    const totalPagesMatch = $("ul.pagination li.page-item a.page-link").map((i, el) => $(el).text()).get();
    const maxPage = totalPagesMatch.filter(t => !isNaN(t)).map(Number).sort((a, b) => b - a)[0] || 1;
    
    console.log(`  ✅ Found ${drivers.length} drivers on page 1`);
    console.log(`  📄 Total pages: ${maxPage}`);
    
    if (drivers.length > 0) {
      console.log(`\n  --- First 3 drivers ---`);
      drivers.slice(0, 3).forEach((d, i) => {
        console.log(`  [${i}] ID: ${d.id} | Name: ${d.name} | Phone: ${d.phone} | Vehicle: ${d.vehicleType} | Status: ${d.driverStatus}`);
      });
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}`);
  }

  // =============================================
  // TEST 3: Accounting Market page
  // =============================================
  console.log("\n========================================");
  console.log("📊 TEST 3: Accounting Market (/admin/accounting/market)");
  console.log("========================================");
  
  try {
    const response = await axios.get(`${BASE_URL}/admin/accounting/market`, {
      headers: { ...BROWSER_HEADERS, "Cookie": cookies },
      timeout: 60000
    });
    
    const $ = cheerio.load(response.data);
    const accounts = [];
    
    $("table#data tbody tr").each((i, row) => {
      const cells = $(row).find("td");
      if (cells.length >= 6) {
        accounts.push({
          accountNum: $(cells[0]).text().trim(),
          mainAccount: $(cells[1]).text().trim(),
          name: $(cells[2]).text().trim(),
          debit: $(cells[3]).text().trim(),
          credit: $(cells[4]).text().trim(),
          difference: $(cells[5]).text().trim()
        });
      }
    });
    
    console.log(`  ✅ Found ${accounts.length} accounts`);
    accounts.forEach((a, i) => {
      console.log(`  [${i}] ${a.accountNum} | ${a.mainAccount} | ${a.name} | مدين: ${a.debit} | دائن: ${a.credit} | الفارق: ${a.difference}`);
    });
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}`);
  }

  // =============================================
  // TEST 4: Restaurant edit page (market details)
  // =============================================
  console.log("\n========================================");
  console.log("📊 TEST 4: Restaurant edit page (/admin/market/{id}/edit)");
  console.log("========================================");
  
  try {
    const response = await axios.get(`${BASE_URL}/admin/market/3288/edit`, {
      headers: { ...BROWSER_HEADERS, "Cookie": cookies },
      timeout: 60000
    });
    
    const $ = cheerio.load(response.data);
    const name = $('input[name="name"]').val() || $('input#name').val() || "";
    const phone = $('input[name="phone"]').val() || $('input#phone').val() || "";
    const commission = $('input[name="admin_commission"]').val() || "";
    
    console.log(`  ✅ Restaurant details:`);
    console.log(`    Name: ${name}`);
    console.log(`    Phone: ${phone}`);
    console.log(`    Commission: ${commission}%`);
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}`);
  }

  // =============================================
  // SUMMARY
  // =============================================
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║                📊 FULL MAP                           ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log("║ Financial API (/admin/accounting/report/monthly):     ║");
  console.log("║   restaurant = 2000 (1626 records)                   ║");
  console.log("║   bank       = 6000 (77 records)                     ║");
  console.log("║   driver     = 3000 (2138 records)                   ║");
  console.log("║   employee   = 7000 (see test above)                 ║");
  console.log("║                                                      ║");
  console.log("║ Detail Pages:                                        ║");
  console.log("║   Drivers list  = /delivery/men?page=N               ║");
  console.log("║   Market edit   = /admin/market/{id}/edit             ║");
  console.log("║   Accounting    = /admin/accounting/market            ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  process.exit(0);
}

run().catch(err => { console.error(err.message); process.exit(1); });
