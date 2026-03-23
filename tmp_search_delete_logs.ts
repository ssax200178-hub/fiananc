
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function searchDeleteLogs() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  console.log('Searching "حذف" (delete) logs in "app" since ' + sevenDaysAgo.toISOString());
  const snapshot = await db.collection('app').doc('v1_data').collection('activity_logs')
    .where('timestamp', '>=', sevenDaysAgo.toISOString())
    .get();

  const deleteLogs = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.action.includes('حذف') || data.details.includes('حذف')) {
        deleteLogs.push({ id: doc.id, ...data });
    }
  });

  console.log(`Found ${deleteLogs.length} delete-related logs.`);
  console.log(JSON.stringify(deleteLogs, null, 2));
}

searchDeleteLogs().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
