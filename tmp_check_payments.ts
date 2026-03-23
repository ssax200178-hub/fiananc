
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkPayments() {
  console.log('Fetching payments from "app"...');
  const snapshotApp = await db.collection('app').doc('v1_data').collection('phone_payments').get();
  console.log(`Found ${snapshotApp.size} payments in "app"`);

  console.log('Fetching payments from "app_staging"...');
  const snapshotStaging = await db.collection('app_staging').doc('v1_data').collection('phone_payments').get();
  console.log(`Found ${snapshotStaging.size} payments in "app_staging"`);

  if (snapshotApp.size > 0) {
      console.log('Sample from "app":');
      const sample = snapshotApp.docs[0].data();
      console.log(JSON.stringify(sample, null, 2));
  }
}

checkPayments().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
