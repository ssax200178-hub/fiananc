
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function findAddLogs() {
  console.log('Searching for "إضافة سداد هاتف" logs in "app"...');
  const snapshot = await db.collection('app').doc('v1_data').collection('activity_logs')
    .where('action', '==', 'إضافة سداد هاتف')
    .orderBy('timestamp', 'desc')
    .limit(200)
    .get();

  const logs = [];
  snapshot.forEach(doc => {
    logs.push({ id: doc.id, ...doc.data() });
  });

  console.log(JSON.stringify(logs, null, 2));
}

findAddLogs().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
