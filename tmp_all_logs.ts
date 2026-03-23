
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkAllLogs() {
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  
  console.log('Fetching ALL logs from "app" since ' + twoDaysAgo.toISOString());
  const snapshot = await db.collection('app').doc('v1_data').collection('activity_logs')
    .where('timestamp', '>=', twoDaysAgo.toISOString())
    .orderBy('timestamp', 'desc')
    .get();

  const logs = [];
  snapshot.forEach(doc => {
    logs.push({ id: doc.id, ...doc.data() });
  });

  console.log(JSON.stringify(logs, null, 2));
}

checkAllLogs().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
