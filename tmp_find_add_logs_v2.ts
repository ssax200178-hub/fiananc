
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function findAddLogs() {
  console.log('Fetching logs from "app"...');
  const snapshot = await db.collection('app').doc('v1_data').collection('activity_logs')
    .orderBy('timestamp', 'desc')
    .limit(500)
    .get();

  const logs = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.action === 'إضافة سداد هاتف' || data.details.includes('سداد هاتف')) {
        logs.push({ id: doc.id, ...data });
    }
  });

  console.log(JSON.stringify(logs, null, 2));
}

findAddLogs().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
