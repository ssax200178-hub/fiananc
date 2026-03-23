
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function countAllBranchPhones() {
  console.log('Counting branch_phones in "app"...');
  const snapshotApp = await db.collection('app').doc('v1_data').collection('branch_phones').get();
  console.log(`Total branch_phones in "app": ${snapshotApp.size}`);

  console.log('Counting branch_phones in "app_staging"...');
  const snapshotStaging = await db.collection('app_staging').doc('v1_data').collection('branch_phones').get();
  console.log(`Total branch_phones in "app_staging": ${snapshotStaging.size}`);
}

countAllBranchPhones().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
