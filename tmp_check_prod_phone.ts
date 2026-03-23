
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkSinglePhone() {
  const snapshot = await db.collection('app').doc('v1_data').collection('branch_phones').get();
  snapshot.forEach(doc => {
    console.log('Production Single Record:', JSON.stringify(doc.data(), null, 2));
  });
}

checkSinglePhone().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
