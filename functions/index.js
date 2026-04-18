const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const axios = require("axios");
const moment = require("moment");
const cheerio = require("cheerio");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

// ------------------------------------------------------------------
// 1. DATA TYPES CONFIG
// ------------------------------------------------------------------
const DATA_TYPES = {
  restaurant: "2000",
  bank: "6000",
  driver: "3000",
  employee: "25000"
};

const BASE_URL = "https://tawseel.app";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ------------------------------------------------------------------
// Helper: Refresh Session
// ------------------------------------------------------------------
async function refreshTawseelSession(email, password) {
  if (!email || !password) throw new Error("Missing email or password for auto-login");

  // Step 1: Get CSRF token
  const loginPage = await axios.get(`${BASE_URL}/login`, {
    headers: { "User-Agent": USER_AGENT }
  });

  const $ = cheerio.load(loginPage.data);
  const token = $('input[name="_token"]').val();
  const initCookies = loginPage.headers["set-cookie"] ? loginPage.headers["set-cookie"].map(c => c.split(";")[0]).join("; ") : "";

  // Step 2: Post Login
  const authResponse = await axios.post(`${BASE_URL}/login`, new URLSearchParams({
    _token: token,
    email: email,
    password: password
  }), {
    headers: {
      "User-Agent": USER_AGENT,
      "Cookie": initCookies,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    maxRedirects: 0,
    validateStatus: function (status) {
      return status >= 200 && status < 400; // Accept 302 redirect as success
    }
  });

  const authCookies = authResponse.headers["set-cookie"];
  if (!authCookies) throw new Error("Login failed: No authentication cookies returned. Possibly blocked by Cloudflare.");

  const newSessionString = authCookies.map(c => c.split(";")[0]).join("; ");
  
  // Save new session to Firestore
  await db.doc("app/v1_data/settings/session_data").set({
    cookies: newSessionString,
    updatedAt: new Date().toISOString(),
    sessionStatus: "active"
  }, { merge: true });

  return newSessionString;
}

// ------------------------------------------------------------------
// Helper: Extract Markets Info
// ------------------------------------------------------------------
async function extractMarketsInfo(cookies) {
  try {
    const response = await axios.get(`${BASE_URL}/admin/markets`, {
      headers: { "Cookie": cookies, "User-Agent": USER_AGENT }
    });
    
    const $ = cheerio.load(response.data);
    const markets = [];
    
    // Look for rows that look like market entries (This targets a generalized Laravel DataTable or table)
    $('table tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length > 3) {
        const id = $(cells[0]).text().trim(); // Might be ID or Account Num
        const img = $(row).find('img').attr('src') || '';
        markets.push({
          id,
          name: $(cells[1]).text().trim(),
          address: $(row).text().match(/العنوان/i) ? 'مضاف' : '',
          imageUrl: img,
          commission: $(row).text().match(/نسبة/i) ? $(row).text() : '',
          timings: '00:00 - 23:59', // Placeholder unless found structurally
          status: 'نشط'
        });
      }
    });
    return markets;
  } catch (error) {
    console.error("Failed to extract specific market details:", error.message);
    return [];
  }
}

// ------------------------------------------------------------------
// 2. MAIN CLOUD SCRAPER LOGIC
// ------------------------------------------------------------------
async function runCloudScraper() {
  const timestamp = new Date().toISOString();
  
  // Update status to running
  const configRef = db.doc("app/v1_data/settings/scraping_config");
  await configRef.set({ workerStatus: "running", statusMessage: "جاري تأكيد الجلسة..." }, { merge: true });

  try {
    // 1. Get Session Data
    const sessionDoc = await db.doc("app/v1_data/settings/session_data").get();
    const sessionOpts = sessionDoc.data() || {};
    let cookies = sessionOpts.cookies;

    // 2. Test/Refresh Session
    const dateFrom = moment().startOf("year").format("YYYY-MM-DD");
    const dateTo = moment().format("YYYY-MM-DD");
    
    let isSessionValid = false;
    if (cookies) {
       try {
           const testUrl = `${BASE_URL}/admin/accounting/report/monthly?account=2000&fromdate=${dateFrom}&todate=${dateTo}`;
           const testRes = await axios.get(testUrl, {
               headers: { "Cookie": cookies, "User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest" },
               maxRedirects: 0
           });
           if (testRes.status === 200 && testRes.data && testRes.data.data) {
               isSessionValid = true;
           }
       } catch (e) {}
    }

    if (!isSessionValid) {
       await configRef.set({ statusMessage: "الجلسة منتهية، جاري تحديث الدخول تلقائياً..." }, { merge: true });
       cookies = await refreshTawseelSession(sessionOpts.email, sessionOpts.plainPassword);
    }

    await configRef.set({ statusMessage: "جاري سحب الأرصدة للبنوك والمطاعم والموظفين..." }, { merge: true });

    const root = 'app'; // Can add staging logic if needed
    const batch = db.batch();
    let recordsCount = 0;

    // 3. Loop through categories (DataTables JSON)
    for (const [type, code] of Object.entries(DATA_TYPES)) {
      const url = `${BASE_URL}/admin/accounting/report/monthly?branch%5B%5D=tenant.*&accounting_types=0&financial_statement=0&currency=-1&clause=-1&entry_type=-1&fromdate=${dateFrom}&todate=${dateTo}&account=${code}&all_branch=0&cost_center=-1`;

      const response = await axios.get(url, {
        headers: { "Cookie": cookies, "User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest" }
      });

      if (response.data && response.data.data) {
        const rawData = response.data.data;
        
        rawData.forEach(item => {
           const accNum = item[2]; // Custom to Tawseel columns
           if (!accNum || accNum === "إجمالي") return;
           
           const docId = `${type}_${accNum}`.replace(/[\/ ]/g, "_");
           const docRef = db.collection(root).doc("v1_data").collection("system_balances").doc(docId);
           
           batch.set(docRef, {
               accountNumber: accNum,
               accountName: item[1] || "",
               branch: item[6] || "",
               debit: parseFloat(String(item[11]).replace(/,/g, "")) || 0,
               credit: parseFloat(String(item[12]).replace(/,/g, "")) || 0,
               type: type,
               lastUpdated: timestamp
           }, { merge: true });
           recordsCount++;
        });
      }
    }
    
    // 4. Extract Markets Info (HTML)
    await configRef.set({ statusMessage: "جاري سحب تفاصيل المطاعم الوصفية (صور، نسب)..." }, { merge: true });
    const marketDetails = await extractMarketsInfo(cookies);
    marketDetails.forEach(market => {
       if(!market.id) return;
       const docRef = db.collection(root).doc("v1_data").collection("scraped_markets").doc(market.id.replace(/[\/ ]/g, "_"));
       batch.set(docRef, {
           ...market,
           lastUpdated: timestamp
       }, { merge: true });
    });

    // 5. Commit batch and finish
    await batch.commit();

    await configRef.set({
      workerStatus: "done",
      statusMessage: "اكتمل بنجاح",
      lastSuccess: timestamp
    }, { merge: true });
    
    console.log(`✅ Cloud Scraper completed successfully. Processed ${recordsCount} account records and ${marketDetails.length} markets.`);

  } catch (error) {
    console.error("Cloud Scraper Failed:", error);
    await configRef.set({
      workerStatus: "error",
      statusMessage: `فشل السحب: ${error.message}`
    }, { merge: true });
  }
}

// ------------------------------------------------------------------
// 3. FIRESTORE TRIGGER (Run on "forceRunTrigger" change)
// ------------------------------------------------------------------
exports.onAutomationTrigger = onDocumentUpdated("app/v1_data/settings/scraping_config", async (event) => {
    const newValue = event.data.after.data();
    const previousValue = event.data.before.data();

    // Check if a manual run was triggered via Dashboard
    if (newValue.forceRunTrigger !== previousValue.forceRunTrigger && newValue.forceRunTrigger) {
        console.log("⚡ Automation triggered via Cloud Functions! (JSON Method)");
        await runCloudScraper();
    }
});

// REST Endpoint fallback just in case we need direct HTTP call
exports.triggerCloudScraper = onRequest({ timeoutSeconds: 300, memory: "512MiB" }, async (req, res) => {
  return cors(req, res, async () => {
     try {
         await runCloudScraper();
         res.status(200).send({ success: true, message: "Started background sync successfully" });
     } catch (e) {
         res.status(500).send({ error: e.message });
     }
  });
});
