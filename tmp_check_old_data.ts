
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkOldPayments() {
  console.log('Checking payments in "app_staging"...');
  const snapshot = await db.collection('app_staging').doc('v1_data').collection('phone_payments').get();
  
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let oldDocs = [];
  let newDocs = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    const createdAt = data.createdAt?.toDate?.() || data.createdAt;
    if (new Date(createdAt).getTime() < today.getTime()) {
      oldDocs.push({ id: doc.id, ...data });
    } else {
      newDocs.push({ id: doc.id, ...data });
    }
  });

  console.log(`Summary: ${oldDocs.length} old documents, ${newDocs.length} new documents (from today)`);
  if (oldDocs.length > 0) {
    console.log('Old docs found:');
    console.log(JSON.stringify(oldDocs, null, 2));
  }
}

checkOldPayments().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
