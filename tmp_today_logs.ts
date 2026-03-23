
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkTodayLogs() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  console.log('Fetching logs from "app" since ' + today.toISOString());
  const snapshot = await db.collection('app').doc('v1_data').collection('activity_logs')
    .where('timestamp', '>=', today.toISOString())
    .orderBy('timestamp', 'desc')
    .get();

  const logs = [];
  snapshot.forEach(doc => {
    logs.push({ id: doc.id, ...doc.data() });
  });

  console.log(JSON.stringify(logs, null, 2));
}

checkTodayLogs().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
