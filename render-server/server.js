const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const axios = require("axios");
const moment = require("moment");
const cheerio = require("cheerio");

// ============================================================
// Firebase Admin Init (from Environment Variable)
// ============================================================
let serviceAccount;
try {
  const cleanEnv = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  
  if (cleanEnv && !cleanEnv.startsWith("{")) {
    const decoded = Buffer.from(cleanEnv, "base64").toString("utf-8");
    serviceAccount = JSON.parse(decoded);
    console.log("🔑 Service Account recognized as Base64 format");
  } else {
    serviceAccount = JSON.parse(cleanEnv || "{}");
    console.log("🔑 Service Account recognized as plain JSON format");
  }

  if (serviceAccount && serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key
      .replace(/\\\\n/g, "\n")
      .replace(/\\n/g, "\n");
    
    console.log(`🔐 Key processed. Email: ${serviceAccount.client_email}`);
  }
} catch (parseErr) {
  console.error("❌ CRITICAL: Failed to parse FIREBASE_SERVICE_ACCOUNT:", parseErr.message);
  process.exit(1);
}

if (serviceAccount && serviceAccount.project_id) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Admin initialized for project:", serviceAccount.project_id);
  } catch (initErr) {
    console.error("❌ Firebase Initialization Error:", initErr.message);
    process.exit(1);
  }
} else {
  console.error("⚠️ FIREBASE_SERVICE_ACCOUNT is missing or invalid!");
  process.exit(1);
}

const db = admin.firestore();

// ============================================================
// Helper: Verify Firestore Connection (Dry Run)
// ============================================================
async function verifyFirestoreConnection() {
  console.log("📡 Testing Firestore connection...");
  try {
    const testDoc = await db.doc("app/v1_data/settings/scraping_config").get();
    if (testDoc.exists) {
      console.log("✅ Firestore Connectivity Verified! Key is 100% valid.");
    } else {
      console.log("⚠️ Firestore Connection works, but 'scraping_config' doc not found.");
    }
    return true;
  } catch (err) {
    console.error("❌ FIRESTORE CONNECTION FAILED:", err.message);
    if (err.message.includes("UNAUTHENTICATED")) {
      console.error("💡 HINT: The private_key in your Service Account is likely corrupted or disabled.");
    }
    return false;
  }
}

// ============================================================
// Express Setup
// ============================================================
const app = express();
app.use(cors());
app.use(express.json());

const API_SECRET = process.env.API_SECRET || "tawseel-scraper-2024";

const BASE_URL = "https://tawseel.app";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Browser-like headers to pass Cloudflare checks
const BROWSER_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "X-Requested-With": "XMLHttpRequest",
  "Referer": `${BASE_URL}/admin/accounting/report/monthly`,
  "Origin": BASE_URL,
  "Connection": "keep-alive",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  "Sec-CH-UA": '"Chromium";v="131", "Not_A Brand";v="24"',
  "Sec-CH-UA-Mobile": "?0",
  "Sec-CH-UA-Platform": '"Windows"'
};

// Only fetch restaurants by default. Add others here if needed.
const DATA_TYPES = {
  restaurant: "2000",
  bank: "6000",
  driver: "3000",
  employee: "25000"
};

// ============================================================
// Helper: Refresh Session (Auto Login)
// ============================================================
async function refreshTawseelSession(email, password) {
  if (!email || !password) throw new Error("Missing email or password for auto-login");

  console.log("🔑 Attempting auto-login for:", email);

  const loginPage = await axios.get(`${BASE_URL}/login`, {
    headers: BROWSER_HEADERS
  });

  const $ = cheerio.load(loginPage.data);
  const token = $('input[name="_token"]').val();
  const initCookies = (loginPage.headers["set-cookie"] || []).map(c => c.split(";")[0]).join("; ");

  if (!token) throw new Error("Could not extract CSRF token from login page");

  const formData = new URLSearchParams({ _token: token, email, password });
  
  const authResponse = await axios.post(`${BASE_URL}/login`, formData.toString(), {
    headers: {
      ...BROWSER_HEADERS,
      "Cookie": initCookies,
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": `${BASE_URL}/login`
    },
    maxRedirects: 0,
    validateStatus: (s) => s >= 200 && s < 400
  });

  const authCookies = authResponse.headers["set-cookie"];
  if (!authCookies || authCookies.length === 0) {
    throw new Error("Login failed: No cookies returned. Check credentials or Cloudflare.");
  }

  const newSessionString = authCookies.map(c => c.split(";")[0]).join("; ");

  await db.doc("app/v1_data/settings/tawseel_session").set({
    cookies: newSessionString,
    sessionStatus: "active",
    updatedAt: new Date().toISOString(),
    statusMessage: "تم تحديث الجلسة تلقائياً بواسطة الخادم السحابي"
  }, { merge: true });

  console.log("✅ Session refreshed and saved to Firestore");
  return newSessionString;
}

// ============================================================
// Helper: Test if Session is Valid
// ============================================================
async function testSession(cookies) {
  try {
    const dateFrom = moment().startOf("year").format("YYYY-MM-DD");
    const dateTo = moment().format("YYYY-MM-DD");
    const testUrl = `${BASE_URL}/admin/accounting/report/monthly?branch%5B%5D=tenant.*&accounting_types=0&financial_statement=0&currency=-1&clause=-1&entry_type=-1&fromdate=${dateFrom}&todate=${dateTo}&account=2000&all_branch=0&cost_center=-1`;
    
    const res = await axios.get(testUrl, {
      headers: { ...BROWSER_HEADERS, "Cookie": cookies },
      timeout: 30000,
      maxRedirects: 0,
      validateStatus: (s) => s === 200
    });
    
    return !!(res.data && res.data.data);
  } catch (e) {
    return false;
  }
}

// ============================================================
// Core: Run Full Scraping Job
// ============================================================
async function runScrapeJob() {
  const timestamp = new Date().toISOString();
  const configRef = db.doc("app/v1_data/settings/scraping_config");

  await configRef.set({ workerStatus: "running", statusMessage: "جاري تأكيد صلاحية الجلسة..." }, { merge: true });

  // 1. Get session
  const sessionDoc = await db.doc("app/v1_data/settings/tawseel_session").get();
  const sessionData = sessionDoc.data() || {};
  let cookies = sessionData.cookies;

  // 2. Test session validity
  let isValid = false;
  if (cookies) {
    isValid = await testSession(cookies);
  }

  if (!isValid) {
    await configRef.set({ statusMessage: "⚠️ الجلسة منتهية، جاري تسجيل الدخول تلقائياً..." }, { merge: true });
    try {
      cookies = await refreshTawseelSession(sessionData.email, sessionData.plainPassword);
    } catch (loginErr) {
      await configRef.set({
        workerStatus: "error",
        statusMessage: `❌ فشل تسجيل الدخول التلقائي: ${loginErr.message}`
      }, { merge: true });
      throw loginErr;
    }
  }

  await configRef.set({ statusMessage: "🔄 جاري سحب الأرصدة المالية (بيانات JSON)..." }, { merge: true });

  // 3. Fetch financial data for each category
  const dateFrom = moment().startOf("year").format("YYYY-MM-DD");
  const dateTo = moment().format("YYYY-MM-DD");
  let totalRecords = 0;
  let batchOps = db.batch();
  let batchCount = 0;
  let restaurantIds = [];

  for (const [type, code] of Object.entries(DATA_TYPES)) {
    console.log(`📊 Fetching ${type} (account ${code})...`);
    await configRef.set({ statusMessage: `جاري سحب: ${type === "bank" ? "البنوك" : type === "restaurant" ? "المطاعم" : type === "driver" ? "الكباتن" : "الموظفين"}...` }, { merge: true });

    try {
      const url = `${BASE_URL}/admin/accounting/report/monthly?branch%5B%5D=tenant.*&accounting_types=0&financial_statement=0&currency=-1&clause=-1&entry_type=-1&fromdate=${dateFrom}&todate=${dateTo}&account=${code}&all_branch=0&cost_center=-1`;

      // Retry up to 3 times with increasing delays
      let response = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`  📡 Attempt ${attempt}/3 for ${type}...`);
          response = await axios.get(url, {
            headers: { ...BROWSER_HEADERS, "Cookie": cookies },
            timeout: 180000,
            maxRedirects: 5
          });
          break;
        } catch (retryErr) {
          console.log(`  ⚠️ Attempt ${attempt} failed: ${retryErr.message}`);
          if (attempt < 3) {
            const waitMs = attempt * 10000;
            console.log(`  ⏳ Waiting ${waitMs/1000}s before retry...`);
            await new Promise(r => setTimeout(r, waitMs));
          } else {
            throw retryErr;
          }
        }
      }

      if (response.data && response.data.data) {
        const rawData = response.data.data;
        console.log(`  ✅ ${type}: ${rawData.length} records`);

        for (const item of rawData) {
          // API returns objects: { analytical_id, analytical_name, debtor, creditor, payment_deferent, branch_name, currency_name, ... }
          const accNum = item.analytical_id;
          const accName = item.analytical_name || "";
          if (!accNum || String(accName).includes("إجمالي")) continue;

          const docId = `${type}_${accNum}`.replace(/[\/ ]/g, "_");
          const docRef = db.collection("app").doc("v1_data").collection("system_balances").doc(docId);

          const debit = Number(item.debtor) || 0;
          const credit = Number(item.creditor) || 0;
          const balance = Number(item.payment_deferent) || 0;

          batchOps.set(docRef, {
            accountNumber: String(accNum),
            accountName: accName,
            branch: item.branch_name || "",
            currency: item.currency_name || "",
            debit, credit, balance, type,
            transactionCount: item.count || 0,
            lastUpdated: timestamp
          }, { merge: true });

          batchCount++;
          totalRecords++;

          // Collect restaurant IDs for detailed scraping later
          if (type === "restaurant" && accNum) {
            restaurantIds.push(accNum);
          }

          if (batchCount >= 450) {
            await batchOps.commit();
            batchOps = db.batch();
            batchCount = 0;
          }
        }
      }
    } catch (err) {
      console.error(`  ❌ Error fetching ${type}:`, err.message);
    }
  }

  // 4. Scrape Drivers Details
  await configRef.set({ statusMessage: "جاري سحب القائمة التفصيلية للكباتن..." }, { merge: true });
  let totalDrivers = 0;
  try {
    totalDrivers = await scrapeDriversDetails(cookies, configRef);
  } catch (err) {
    console.error("Drivers details scraping failed:", err.message);
  }

  // 5. Scrape Market Details
  let totalMarkets = 0;
  if (restaurantIds.length > 0) {
    await configRef.set({ statusMessage: "جاري تفقد صفحات المطاعم لجلب التفاصيل الإضافية (أوقات الدوام وغيرها)..." }, { merge: true });
    try {
      totalMarkets = await scrapeMarketsDetails(cookies, restaurantIds, configRef);
    } catch (err) {
      console.error("Market details scraping failed:", err.message);
    }
  }

  // 6. Commit remaining & update sync metadata
  const syncRef = db.collection("app").doc("v1_data").collection("sync_metadata").doc("tawseel_sync");
  batchOps.set(syncRef, {
    lastSync: timestamp,
    status: "success",
    totalCount: totalRecords,
    driversCount: totalDrivers,
    marketsCount: totalMarkets,
    fromDate: dateFrom,
    toDate: dateTo
  });

  await batchOps.commit();

  // 7. Mark as done
  await configRef.set({
    workerStatus: "done",
    statusMessage: `✅ اكتمل بنجاح! تم سحب ${totalRecords} سجل مالي، و ${totalDrivers} كابتن، و ${totalMarkets} تفاصيل متجر.`,
    lastSuccess: timestamp
  }, { merge: true });

  console.log(`🎉 DONE: ${totalRecords} records, ${totalDrivers} drivers, ${totalMarkets} markets saved.`);
  return { totalRecords, totalDrivers, totalMarkets };
}

// ============================================================
// Scraper: Drivers Details
// ============================================================
async function scrapeDriversDetails(cookies, configRef) {
  const timestamp = new Date().toISOString();
  let page = 1;
  let totalDrivers = 0;
  let hasMore = true;
  let batchOps = db.batch();
  let batchCount = 0;

  while (hasMore) {
    try {
      console.log(`📡 Fetching Drivers List - Page ${page}`);
      const res = await axios.get(`${BASE_URL}/delivery/men?page=${page}`, {
        headers: { ...BROWSER_HEADERS, "Cookie": cookies },
        timeout: 60000
      });
      
      const $ = cheerio.load(res.data);
      const rows = $("table#sampleTable tbody tr");
      
      if (rows.length === 0) {
        hasMore = false;
        break;
      }
      
      let parsedOnPage = 0;
      rows.each((i, row) => {
        const cells = $(row).find("td");
        if (cells.length >= 10) {
          const id = $(cells[0]).text().trim();
          if (!id) return;
          
          const docRef = db.collection("app").doc("v1_data").collection("scraped_drivers").doc(`driver_${id}`);
          
          batchOps.set(docRef, {
            id,
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
            contractType: $(cells[12]).text().trim(),
            lastUpdated: timestamp
          }, { merge: true });
          
          batchCount++;
          totalDrivers++;
          parsedOnPage++;
        }
      });

      if (batchCount >= 450) {
        await batchOps.commit();
        batchOps = db.batch();
        batchCount = 0;
      }
      
      if (parsedOnPage === 0) hasMore = false;
      page++;
      
      // Delay to avoid overwhelming the server
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`❌ Failed on Drivers Page ${page}:`, e.message);
      hasMore = false; // Stop on error
    }
  }
  
  if (batchCount > 0) {
    await batchOps.commit();
  }
  console.log(`✅ Finished drivers list. Total: ${totalDrivers}`);
  return totalDrivers;
}

// ============================================================
// Scraper: Market Details (Working Hours, Phone, etc)
// ============================================================
async function scrapeMarketsDetails(cookies, restaurantIds, configRef) {
  let totalMarkets = 0;
  let batchOps = db.batch();
  let batchCount = 0;
  const timestamp = new Date().toISOString();

  for (let i = 0; i < restaurantIds.length; i++) {
    const marketId = restaurantIds[i];
    
    // Update progress every 50 records
    if (i % 50 === 0) {
        await configRef.set({ statusMessage: `جاري سحب تفاصيل المتاجر (${i}/${restaurantIds.length})...` }, { merge: true });
    }

    try {
      const res = await axios.get(`${BASE_URL}/admin/market/${marketId}/edit`, {
        headers: { ...BROWSER_HEADERS, "Cookie": cookies },
        timeout: 15000,
        validateStatus: (s) => (s >= 200 && s < 300) || s === 404
      });
      
      if (res.status === 404) {
        // Not all IDs are editable markets, skip gracefully
        continue;
      }

      const $ = cheerio.load(res.data);
      
      const name = $('input[name="name"]').val() || $('input#name').val() || "";
      const phone = $('input[name="phone"]').val() || $('input#phone').val() || "";
      const commission = $('input[name="admin_commission"]').val() || "";
      const status = $('select[name="status"] option:selected').text().trim() || "";
      
      // Attempt to extract working hours
      let workingHours = $('input[name="working_hours"]').val() || $('input[name="hours"]').val() || "";
      if (!workingHours) {
        // Fallback: look for label containing "دوام" or "وقت"
        $('label').each((idx, el) => {
          const text = $(el).text();
          if (text.includes('دوام') || text.includes('وقت')) {
            const inputId = $(el).attr('for');
            if (inputId) {
              const val = $(`#${inputId}`).val();
              if (val) workingHours = val;
            } else {
              const val = $(el).next('input').val();
              if (val) workingHours = val;
            }
          }
        });
      }

      const docRef = db.collection("app").doc("v1_data").collection("scraped_markets").doc(`market_${marketId}`);
      batchOps.set(docRef, {
        id: marketId,
        name,
        phone,
        commission,
        status,
        workingHours,
        lastUpdated: timestamp
      }, { merge: true });

      batchCount++;
      totalMarkets++;

      if (batchCount >= 450) {
        await batchOps.commit();
        batchOps = db.batch();
        batchCount = 0;
      }
    } catch (e) {
      console.error(`❌ Market ${marketId} Error:`, e.message);
    }
    
    // Very short delay to prevent locking up Tawseel server
    await new Promise(r => setTimeout(r, 200));
  }

  if (batchCount > 0) {
    await batchOps.commit();
  }
  return totalMarkets;
}

// ============================================================
// Scraper: Invoice Books Report
// ============================================================
async function scrapeInvoiceBooks(fromInvoice, toInvoice, targetBranch) {
  const timestamp = new Date().toISOString();
  
  // 1. Get Session
  const sessionDoc = await db.doc("app/v1_data/settings/tawseel_session").get();
  const sessionData = sessionDoc.data() || {};
  let cookies = sessionData.cookies;
  if (!cookies) throw new Error("No active session. Please start the main scrape job first to login.");

  // Get CSRF Token
  let token = "";
  try {
    const initRes = await axios.get(`${BASE_URL}/admin/report/booksinvoice`, {
      headers: { ...BROWSER_HEADERS, "Cookie": cookies },
      timeout: 30000
    });
    const $ = cheerio.load(initRes.data);
    token = $('input[name="_token"]').val() || "";
  } catch (e) {
    console.error("Failed to fetch token for booksinvoice:", e.message);
  }

  // Define Branches
  const BRANCHES = targetBranch === "all" ? [
    "tenant.main", "tenant.aden", "tenant.ibb", "tenant.mukalla", 
    "tenant.taizzhw", "tenant.marib", "tenant.dhamar", "tenant.taizz", 
    "tenant.hudaydah", "tenant.seiyun"
  ] : [targetBranch];

  let totalParsed = 0;
  let batchOps = db.batch();
  let batchCount = 0;
  let tenantBooksMap = {};

  for (const tenant of BRANCHES) {
    console.log(`📡 Fetching Invoice Books for ${tenant}...`);
    try {
      const url = `${BASE_URL}/admin/report/booksinvoice?_token=${token}&frominvoice=${fromInvoice}&toinvoice=${toInvoice}&tenant=${tenant}`;
      const res = await axios.get(url, {
        headers: { ...BROWSER_HEADERS, "Cookie": cookies },
        timeout: 60000
      });

      const $ = cheerio.load(res.data);
      const rows = $("table#laravel_datatable tbody tr");

      rows.each((i, row) => {
        const cells = $(row).find("th, td");
        if (cells.length >= 14) {
          const sequence = $(cells[0]).text().trim();
          if (!sequence || sequence === "التسلسل") return; // Skip header or empty

          const branchName = $(cells[1]).text().trim();
          const invoiceRange = $(cells[2]).text().trim();
          const totalInvoices = $(cells[3]).text().trim();
          const undisbursedInvoices = $(cells[4]).text().trim();
          const firstDisburseDate = $(cells[5]).text().trim();
          const lastDisburseDate = $(cells[6]).text().trim();
          const disbursedBooksCount = $(cells[7]).text().trim();
          
          // Helper to extract numeric text, it might be inside <a>
          const completedBooks = $(cells[8]).text().trim();
          const incompleteBooks = $(cells[9]).text().trim();
          const reviewedBooks = $(cells[10]).text().trim();
          const unreviewedBooks = $(cells[11]).text().trim();
          const receivedBooks = $(cells[12]).text().trim();
          const unreceivedBooks = $(cells[13]).text().trim();

          // Helper to extract IDs from onclick="openBookModel([123,456])"
          const extractIds = (cell) => {
            const onclick = $(cell).find('a').attr('onclick') || "";
            const match = onclick.match(/openBookModel\(\[(.*?)\]\)/);
            if (match && match[1]) {
              return match[1].split(',').map(s => s.trim()).filter(Boolean);
            }
            return [];
          };

          const completedIds = extractIds(cells[8]);
          const incompleteIds = extractIds(cells[9]);
          const reviewedIds = extractIds(cells[10]);
          const unreviewedIds = extractIds(cells[11]);
          const receivedIds = extractIds(cells[12]);
          const unreceivedIds = extractIds(cells[13]);

          const docId = `book_${tenant}_${invoiceRange}`.replace(/[\/ \-]/g, "_");
          const docRef = db.collection("app").doc("v1_data").collection("scraped_invoice_books").doc(docId);

          batchOps.set(docRef, {
            tenant,
            branchName,
            invoiceRange,
            totalInvoices,
            undisbursedInvoices,
            firstDisburseDate,
            lastDisburseDate,
            disbursedBooksCount,
            completedBooks,
            incompleteBooks,
            reviewedBooks,
            unreviewedBooks,
            receivedBooks,
            unreceivedBooks,
            arrays: {
              completedIds,
              incompleteIds,
              reviewedIds,
              unreviewedIds,
              receivedIds,
              unreceivedIds
            },
            lastUpdated: timestamp
          }, { merge: true });

          batchCount++;
          totalParsed++;
          
          // Collect all IDs for this row to fetch details later
          const allRowIds = [...new Set([
            ...completedIds, ...incompleteIds, ...reviewedIds, 
            ...unreviewedIds, ...receivedIds, ...unreceivedIds
          ])];
          
          if (!tenantBooksMap[tenant]) tenantBooksMap[tenant] = [];
          tenantBooksMap[tenant].push(...allRowIds);
        }
      });

      if (batchCount >= 450) {
        await batchOps.commit();
        batchOps = db.batch();
        batchCount = 0;
      }
      
      // Delay between branches to prevent ban
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.error(`❌ Failed fetching books for ${tenant}:`, e.message);
    }
  }

  if (batchCount > 0) {
    await batchOps.commit();
    batchOps = db.batch();
    batchCount = 0;
  }

  console.log(`✅ Finished main table scrape. Now fetching details for individual books...`);

  // Phase 2: Fetch details for individual books
  for (const tenant of Object.keys(tenantBooksMap)) {
    const ids = [...new Set(tenantBooksMap[tenant])];
    console.log(`📡 Fetching ${ids.length} individual book details for ${tenant}...`);
    
    // Chunk into arrays of 50 to avoid request too large
    const chunkSize = 50;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      
      try {
        const formData = new URLSearchParams();
        formData.append("_token", token);
        chunk.forEach(id => formData.append("books[]", id));

        const detailsRes = await axios.post(`${BASE_URL}/admin/report/bookslist`, formData.toString(), {
          headers: { 
            ...BROWSER_HEADERS, 
            "Cookie": cookies,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest"
          },
          timeout: 45000
        });

        const $d = cheerio.load(detailsRes.data);
        const detailRows = $d("tbody#body tr");

        detailRows.each((idx, row) => {
          const cells = $d(row).find("th, td");
          if (cells.length >= 12) {
            const bookId = $d(cells[1]).text().trim();
            if (!bookId) return;

            const bookRef = db.collection("app").doc("v1_data").collection("scraped_individual_books").doc(bookId);
            batchOps.set(bookRef, {
              bookId,
              status: $d(cells[2]).text().trim(),
              branch: $d(cells[3]).text().trim(),
              disbursedBy: $d(cells[4]).text().trim(),
              reviewedBy: $d(cells[5]).text().trim(),
              reviewerNote: $d(cells[6]).text().trim(),
              driverName: $d(cells[7]).text().trim(),
              bookStart: $d(cells[8]).text().trim(),
              bookEnd: $d(cells[9]).text().trim(),
              disburseDate: $d(cells[10]).text().trim(),
              returnDate: $d(cells[11]).text().trim(),
              tenant,
              lastUpdated: timestamp
            }, { merge: true });

            batchCount++;
          }
        });

        if (batchCount >= 400) {
          await batchOps.commit();
          batchOps = db.batch();
          batchCount = 0;
        }

        await new Promise(r => setTimeout(r, 1000)); // Delay between chunks
      } catch (e) {
        console.error(`❌ Failed fetching book details chunk for ${tenant}:`, e.message);
      }
    }
  }

  if (batchCount > 0) {
    await batchOps.commit();
  }
  
  console.log(`✅ Finished invoice books scrape completely. Total main rows: ${totalParsed}`);
  return { totalParsed };
}


// ============================================================
// Scraper: Driver Credit Balances
// ============================================================
async function scrapeDriverCredits(targetBranch) {
  const timestamp = new Date().toISOString();
  const sessionDoc = await db.doc("app/v1_data/settings/tawseel_session").get();
  const cookies = sessionDoc.data()?.cookies;
  if (!cookies) throw new Error("No active session. Please start the main scrape job first to login.");

  const BRANCHES = targetBranch === "all" ? [
    "tenant.main", "tenant.aden", "tenant.ibb", "tenant.mukalla", 
    "tenant.taizzhw", "tenant.marib", "tenant.dhamar", "tenant.taizz", 
    "tenant.hudaydah", "tenant.seiyun"
  ] : [targetBranch];

  const fromDate = moment().startOf("year").format("YYYY-MM-DD");
  const toDate = moment().format("YYYY-MM-DD");
  
  let totalParsed = 0;
  let batchOps = db.batch();
  let batchCount = 0;

  for (const tenant of BRANCHES) {
    for (const currancy_id of [7, 8]) { // 7: New Riyal, 8: Old Riyal
      console.log(`📡 Fetching Driver Credits for ${tenant} (Currency: ${currancy_id})...`);
      try {
        const url = `${BASE_URL}/admin/accounting/delivery/credit?posting=-1&zeroed=-1&availability=-2&assignability=-1&tenant=${tenant}&fromdate=${fromDate}&todate=${toDate}&currancy_id=${currancy_id}`;
        
        const res = await axios.get(url, {
          headers: { ...BROWSER_HEADERS, "Cookie": cookies },
          timeout: 45000
        });

        const $ = cheerio.load(res.data);
        const rows = $("table#data tbody tr");

        rows.each((i, row) => {
          const cells = $(row).find("td");
          if (cells.length >= 11) {
            const accNum = $(cells[0]).text().trim();
            const name = $(cells[1]).text().trim();
            if (!name) return;

            const docId = `driver_credit_${accNum}_${currancy_id}`;
            const docRef = db.collection("app").doc("v1_data").collection("scraped_driver_credits").doc(docId);
            
            batchOps.set(docRef, {
              accountId: accNum,
              driverName: name,
              phone: $(cells[2]).text().trim(),
              status: $(cells[3]).text().trim(),
              savingsBalance: $(cells[4]).text().trim(),
              availableBalance: $(cells[5]).text().trim(),
              branch: $(cells[6]).text().trim(),
              accountBalance: $(cells[7]).text().trim(),
              currency: $(cells[8]).text().trim(),
              lastOrderDate: $(cells[9]).text().trim(),
              lastPaymentDate: $(cells[10]).text().trim(),
              tenant,
              currencyId: currancy_id,
              lastUpdated: timestamp
            }, { merge: true });

            batchCount++;
            totalParsed++;
          }
        });

        if (batchCount >= 400) {
          await batchOps.commit();
          batchOps = db.batch();
          batchCount = 0;
        }

        // Delay between currencies
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.error(`❌ Failed fetching driver credits for ${tenant} (${currancy_id}):`, e.message);
      }
    }
    // Delay between branches
    await new Promise(r => setTimeout(r, 2000));
  }

  if (batchCount > 0) {
    await batchOps.commit();
  }
  
  console.log(`✅ Finished Driver Credits Scrape. Total rows: ${totalParsed}`);
  return { totalParsed };
}

// ============================================================
// Scraper: Restaurant Statements (Excel/PDF Base Data)
// ============================================================
async function scrapeRestaurantStatements(fromDate, toDate, targetMarkets = "all") {
  const timestamp = new Date().toISOString();
  const sessionDoc = await db.doc("app/v1_data/settings/tawseel_session").get();
  const cookies = sessionDoc.data()?.cookies;
  if (!cookies) throw new Error("No active session.");

  let totalParsed = 0;
  let batchOps = db.batch();
  let batchCount = 0;

  console.log(`📡 Fetching Restaurant List for Statements...`);
  
  // 1. Fetch the main page to extract the list of restaurants
  const mainUrl = `${BASE_URL}/admin/accounting/statement/market?fromdate=${fromDate}&todate=${toDate}&posting=-1&entry_type=-1&report=0&pamount=1&market=`;
  const mainRes = await axios.get(mainUrl, {
    headers: { ...BROWSER_HEADERS, "Cookie": cookies },
    timeout: 45000
  });

  const $main = cheerio.load(mainRes.data);
  let marketsToScrape = [];

  $main("select#market option").each((i, el) => {
    const val = $main(el).attr("value");
    const name = $main(el).text().trim();
    if (val && val !== "-1" && val !== "") {
      marketsToScrape.push({ id: val, name });
    }
  });

  if (targetMarkets !== "all") {
    // If specific array of market IDs provided
    marketsToScrape = marketsToScrape.filter(m => targetMarkets.includes(m.id));
  }

  console.log(`✅ Found ${marketsToScrape.length} restaurants to scrape.`);

  // 2. Iterate and fetch each statement
  for (const market of marketsToScrape) {
    console.log(`📡 Fetching Statement for ${market.name} (ID: ${market.id})...`);
    try {
      const url = `${BASE_URL}/admin/accounting/statement/market?fromdate=${fromDate}&todate=${toDate}&posting=-1&entry_type=-1&report=0&pamount=1&market=${market.id}`;
      
      const res = await axios.get(url, {
        headers: { ...BROWSER_HEADERS, "Cookie": cookies },
        timeout: 45000
      });

      const $ = cheerio.load(res.data);
      const rows = $("table#data tbody tr");
      
      let statementRows = [];

      rows.each((i, row) => {
        const cells = $(row).find("td");
        if (cells.length >= 9) {
          statementRows.push({
            entryNumber: $(cells[0]).text().trim(),
            orderNumber: $(cells[1]).text().trim(),
            invoiceNumber: $(cells[2]).text().trim(),
            debit: $(cells[3]).text().trim(),
            credit: $(cells[4]).text().trim(),
            cumulative: $(cells[5]).text().trim(),
            date: $(cells[6]).text().trim(),
            description: $(cells[7]).text().trim(),
            status: $(cells[8]).text().trim()
          });
        }
      });

      // Extract totals from tfoot if exists
      const tfootCells = $("table#data tfoot tr th");
      let totals = { debit: "0", credit: "0", finalBalance: "0" };
      if (tfootCells.length >= 4) {
        totals.credit = $(tfootCells[1]).text().trim() || "0";
        totals.debit = $(tfootCells[2]).text().trim() || "0";
        // Final balance is usually the last column. Try to parse it properly.
        totals.finalBalance = $(tfootCells[4]).text().trim() || $(tfootCells[3]).text().trim() || "0";
      }

      if (statementRows.length > 0) {
        // Document ID includes market and dates to keep history
        const docId = `market_${market.id}_${fromDate}_${toDate}`;
        const docRef = db.collection("app").doc("v1_data").collection("scraped_restaurant_statements").doc(docId);
        
        batchOps.set(docRef, {
          marketId: market.id,
          marketName: market.name,
          fromDate,
          toDate,
          totals,
          rows: statementRows,
          lastUpdated: timestamp
        }, { merge: true });

        batchCount++;
        totalParsed++;
      }

      if (batchCount >= 100) {
        await batchOps.commit();
        batchOps = db.batch();
        batchCount = 0;
      }

      // Delay to prevent rate limiting
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`❌ Failed fetching statement for ${market.name}:`, e.message);
    }
  }

  if (batchCount > 0) {
    await batchOps.commit();
  }
  
  console.log(`✅ Finished Restaurant Statements Scrape. Total restaurants processed: ${totalParsed}`);
  return { totalParsed, markets: marketsToScrape.length };
}

// ============================================================
// API Routes
// ============================================================

app.get("/", (req, res) => {
  res.json({ status: "alive", service: "Tawseel Cloud Scraper", timestamp: new Date().toISOString() });
});

app.post("/start-job", async (req, res) => {
  const authHeader = req.headers["x-api-key"] || req.body.apiKey;
  if (authHeader !== API_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    res.json({ success: true, message: "تم استلام الأمر، جاري بدء السحب السحابي..." });
    runScrapeJob().catch(err => {
      console.error("Background job failed:", err.message);
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/scrape-invoice-books", async (req, res) => {
  const authHeader = req.headers["x-api-key"] || req.body.apiKey;
  if (authHeader !== API_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { fromInvoice, toInvoice, branch } = req.body;
  if (!fromInvoice || !toInvoice) {
    return res.status(400).json({ error: "Missing fromInvoice or toInvoice" });
  }

  try {
    res.json({ success: true, message: "تم استلام الأمر، جاري سحب تقرير دفاتر الفواتير..." });
    scrapeInvoiceBooks(fromInvoice, toInvoice, branch || "all").catch(err => {
      console.error("Invoice books scrape failed:", err.message);
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/scrape-driver-credits", async (req, res) => {
  const authHeader = req.headers["x-api-key"] || req.body.apiKey;
  if (authHeader !== API_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { branch } = req.body;

  try {
    res.json({ success: true, message: "تم استلام الأمر، جاري سحب كشف أرصدة الموصلين..." });
    scrapeDriverCredits(branch || "all").catch(err => {
      console.error("Driver credits scrape failed:", err.message);
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/scrape-restaurant-statements", async (req, res) => {
  const authHeader = req.headers["x-api-key"] || req.body.apiKey;
  if (authHeader !== API_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { fromDate, toDate, markets } = req.body;
  if (!fromDate || !toDate) {
    return res.status(400).json({ error: "fromDate and toDate are required" });
  }

  try {
    res.json({ success: true, message: "تم استلام الأمر، جاري سحب كشوفات المطاعم..." });
    scrapeRestaurantStatements(fromDate, toDate, markets || "all").catch(err => {
      console.error("Restaurant statements scrape failed:", err.message);
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/status", async (req, res) => {
  try {
    const configDoc = await db.doc("app/v1_data/settings/scraping_config").get();
    const data = configDoc.data() || {};
    res.json({
      workerStatus: data.workerStatus || "idle",
      statusMessage: data.statusMessage || "",
      lastSuccess: data.lastSuccess || null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Start Server
const PORT = process.env.PORT || 10000;
(async () => {
  console.log("-----------------------------------------");
  console.log("🛠️  Tawseel Cloud Scraper Initializing...");
  
  await verifyFirestoreConnection();

  app.listen(PORT, () => {
    console.log(`🚀 Server is LIVE on port ${PORT}`);
    console.log("📡 Ready for scraping requests.");
    console.log("-----------------------------------------");
  });
})();
