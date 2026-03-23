
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fetchStagingPayments() {
  console.log('Fetching payments from "app_staging"...');
  const snapshot = await db.collection('app_staging').doc('v1_data').collection('phone_payments').get();
  
  const payments = [];
  snapshot.forEach(doc => {
    payments.push({ id: doc.id, ...doc.data() });
  });

  console.log(JSON.stringify(payments, null, 2));
}

fetchStagingPayments().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
