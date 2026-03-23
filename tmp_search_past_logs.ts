
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function searchPastLogs() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  console.log('Searching logs in "app_staging" since ' + sevenDaysAgo.toISOString());
  const snapshot = await db.collection('app_staging').doc('v1_data').collection('activity_logs')
    .where('timestamp', '>=', sevenDaysAgo.toISOString())
    .get();

  console.log(`Found ${snapshot.size} total logs in staging for the last 7 days.`);
  
  const addLogs = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.action === 'إضافة سداد هاتف' || data.details.includes('سداد هاتف')) {
        addLogs.push({ id: doc.id, ...data });
    }
  });

  console.log(`Found ${addLogs.length} matching logs.`);
  console.log(JSON.stringify(addLogs, null, 2));
}

searchPastLogs().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
