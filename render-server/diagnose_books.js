const axios = require("axios");
const cheerio = require("cheerio");
const admin = require("firebase-admin");

// Initialize simple firebase to get session
const serviceAccount = require("./service-account.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
  "Connection": "keep-alive",
};

async function diagnose() {
  const sessionDoc = await db.doc("app/v1_data/settings/tawseel_session").get();
  const cookies = sessionDoc.data().cookies;
  
  console.log("Got cookies, fetching report page...");
  const url = "https://tawseel.app/admin/report/booksinvoice?frominvoice=1000001&toinvoice=1000050&tenant=tenant.main";
  
  try {
    const res = await axios.get(url, { headers: { ...BROWSER_HEADERS, "Cookie": cookies } });
    const html = res.data;
    console.log("Fetched HTML length:", html.length);
    
    // Look for the openBookModel function
    const scriptMatches = html.match(/function\s+openBookModel[\s\S]*?\{[\s\S]*?\}/g);
    if (scriptMatches) {
        console.log("Found JS function openBookModel:");
        console.log(scriptMatches[0]);
    } else {
        console.log("Could not find openBookModel function in HTML.");
        // Try searching for ajax calls
        const ajaxMatches = html.match(/\$\.ajax\([\s\S]*?\)/g);
        if (ajaxMatches) {
            console.log("Found AJAX calls:");
            ajaxMatches.forEach(m => console.log(m));
        }
    }

  } catch (e) {
    console.error("Error:", e.message);
  }
}

diagnose().then(() => process.exit());
