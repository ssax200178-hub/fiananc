
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkLogs() {
  console.log('Fetching logs...');
  const snapshot = await db.collection('app').doc('v1_data').collection('activity_logs')
    .orderBy('timestamp', 'desc')
    .limit(50)
    .get();

  const logs = [];
  snapshot.forEach(doc => {
    logs.push({ id: doc.id, ...doc.data() });
  });

  console.log(JSON.stringify(logs, null, 2));
}

checkLogs().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
