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
  // CRITICAL: Trim whitespace that might have been added during copy-paste in Render UI
  const cleanEnv = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  
  // Method 1: Try Base64 decode first (most reliable)
  if (cleanEnv && !cleanEnv.startsWith("{")) {
    const decoded = Buffer.from(cleanEnv, "base64").toString("utf-8");
    serviceAccount = JSON.parse(decoded);
    console.log("🔑 Service Account recognized as Base64 format");
  } else {
    // Method 2: Direct JSON parse
    serviceAccount = JSON.parse(cleanEnv || "{}");
    console.log("🔑 Service Account recognized as plain JSON format");
  }

  // CRITICAL FIX: Always ensure private_key has real newlines
  if (serviceAccount && serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key
      .replace(/\\\\n/g, "\n")
      .replace(/\\n/g, "\n");
    
    const keyPreview = serviceAccount.private_key.substring(0, 30).replace(/\n/g, "[NL]");
    console.log(`🔐 Key processed. Email: ${serviceAccount.client_email}`);
    console.log(`🔐 Key Preview: ${keyPreview}...`);
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
    // Attempt a simple read to check authentication
    const testDoc = await db.doc("app/v1_data/settings/scraping_config").get();
    if (testDoc.exists) {
      console.log("✅ Firestore Connectivity Verified! Key is 100% valid.");
    } else {
      console.log("⚠️ Firestore Connection works, but 'scraping_config' doc not found. This is normal.");
    }
    return true;
  } catch (err) {
    console.error("❌ FIRESTORE CONNECTION FAILED (16 UNAUTHENTICATED?):", err.message);
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
  restaurant: "2000"
  // bank: "6000",
  // driver: "3000",
  // employee: "25000"
};

// ============================================================
// Helper: Parse Number (Arabic-safe)
// ============================================================
function parseNum(text) {
  if (!text || String(text).trim() === "-" || String(text).trim() === "") return 0;
  let cleaned = String(text).trim().replace(/,/g, "").replace(/٬/g, "").replace(/ /g, "");
  let isNeg = false;
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) { isNeg = true; cleaned = cleaned.slice(1, -1); }
  else if (cleaned.endsWith("-")) { isNeg = true; cleaned = cleaned.slice(0, -1); }
  else if (cleaned.startsWith("-")) { isNeg = true; cleaned = cleaned.slice(1); }
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : (isNeg ? -val : val);
}

// ============================================================
// Helper: Refresh Session (Auto Login)
// ============================================================
async function refreshTawseelSession(email, password) {
  if (!email || !password) throw new Error("Missing email or password for auto-login");

  console.log("🔑 Attempting auto-login for:", email);

  // Step 1: Get CSRF token from login page
  const loginPage = await axios.get(`${BASE_URL}/login`, {
    headers: BROWSER_HEADERS
  });

  const $ = cheerio.load(loginPage.data);
  const token = $('input[name="_token"]').val();
  const initCookies = (loginPage.headers["set-cookie"] || []).map(c => c.split(";")[0]).join("; ");

  if (!token) throw new Error("Could not extract CSRF token from login page");

  // Step 2: Submit login form
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

  // Save to Firestore
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
// Helper: Extract Market Details (HTML)
// ============================================================
async function extractMarketsInfo(cookies) {
  try {
    console.log("🍽️ Fetching market details from /admin/markets...");
    const response = await axios.get(`${BASE_URL}/admin/markets`, {
      headers: { ...BROWSER_HEADERS, "Cookie": cookies },
      timeout: 60000
    });

    const $ = cheerio.load(response.data);
    const markets = [];

    $("table tbody tr").each((i, row) => {
      const cells = $(row).find("td");
      if (cells.length > 3) {
        const img = $(row).find("img").attr("src") || "";
        markets.push({
          id: $(cells[0]).text().trim(),
          name: $(cells[1]).text().trim(),
          imageUrl: img.startsWith("http") ? img : (img ? `${BASE_URL}${img}` : ""),
          status: "نشط"
        });
      }
    });

    console.log(`📸 Found ${markets.length} markets with details`);
    return markets;
  } catch (error) {
    console.error("⚠️ Failed to extract market details:", error.message);
    return [];
  }
}

// ============================================================
// Core: Run Full Scraping Job
// ============================================================
async function runScrapeJob() {
  const timestamp = new Date().toISOString();
  const configRef = db.doc("app/v1_data/settings/scraping_config");

  // Update status
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
            timeout: 90000,
            maxRedirects: 5
          });
          break; // Success, exit retry loop
        } catch (retryErr) {
          console.log(`  ⚠️ Attempt ${attempt} failed: ${retryErr.message}`);
          if (attempt < 3) {
            const waitMs = attempt * 5000; // 5s, 10s
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
          const accNum = item[2];
          if (!accNum || String(accNum).includes("إجمالي")) continue;

          const docId = `${type}_${accNum}`.replace(/[\/ ]/g, "_");
          const docRef = db.collection("app").doc("v1_data").collection("system_balances").doc(docId);

          const debit = parseNum(item[11]);
          const credit = parseNum(item[12]);
          const extBal = item[13] ? parseNum(item[13]) : Math.abs(debit + credit);
          let balance = Math.abs(extBal);
          if (type === "restaurant" || type === "driver") {
            balance = debit > credit ? -balance : balance;
          } else {
            balance = credit > debit ? -balance : balance;
          }

          batchOps.set(docRef, {
            accountNumber: accNum,
            accountName: item[1] || "",
            branch: item[6] || "",
            debit, credit, balance, type,
            lastUpdated: timestamp
          }, { merge: true });

          batchCount++;
          totalRecords++;

          // Firestore batch limit is 500
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

  // 4. Extract market details
  await configRef.set({ statusMessage: "📸 جاري سحب تفاصيل المطاعم (صور، نسبة)..." }, { merge: true });
  const marketDetails = await extractMarketsInfo(cookies);
  
  for (const market of marketDetails) {
    if (!market.id) continue;
    const docRef = db.collection("app").doc("v1_data").collection("scraped_markets").doc(market.id.replace(/[\/ ]/g, "_"));
    batchOps.set(docRef, { ...market, lastUpdated: timestamp }, { merge: true });
    batchCount++;
    if (batchCount >= 450) {
      await batchOps.commit();
      batchOps = db.batch();
      batchCount = 0;
    }
  }

  // 5. Commit remaining & update sync metadata
  const syncRef = db.collection("app").doc("v1_data").collection("sync_metadata").doc("tawseel_sync");
  batchOps.set(syncRef, {
    lastSync: timestamp,
    status: "success",
    totalCount: totalRecords,
    marketDetailsCount: marketDetails.length,
    fromDate: dateFrom,
    toDate: dateTo
  });

  await batchOps.commit();

  // 6. Mark as done
  await configRef.set({
    workerStatus: "done",
    statusMessage: `✅ اكتمل بنجاح! تم سحب ${totalRecords} سجل مالي و ${marketDetails.length} مطعم.`,
    lastSuccess: timestamp
  }, { merge: true });

  console.log(`🎉 DONE: ${totalRecords} records + ${marketDetails.length} markets`);
  return { totalRecords, marketDetails: marketDetails.length };
}

// ============================================================
// API Routes
// ============================================================

// Health check (keeps Render awake if pinged)
app.get("/", (req, res) => {
  res.json({ status: "alive", service: "Tawseel Cloud Scraper", timestamp: new Date().toISOString() });
});

// Main scraping endpoint
app.post("/start-job", async (req, res) => {
  // Simple API key check
  const authHeader = req.headers["x-api-key"] || req.body.apiKey;
  if (authHeader !== API_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Respond immediately, run job in background
    res.json({ success: true, message: "تم استلام الأمر، جاري بدء السحب السحابي..." });

    // Run the actual job asynchronously
    runScrapeJob().catch(err => {
      console.error("Background job failed:", err.message);
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Status check endpoint
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
  
  // First, verify connection
  await verifyFirestoreConnection();

  app.listen(PORT, () => {
    console.log(`🚀 Server is LIVE on port ${PORT}`);
    console.log("📡 Ready for scraping requests.");
    console.log("-----------------------------------------");
  });
})();
