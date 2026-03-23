
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function listAllCollections() {
  console.log('Listing collections under "app/v1_data"...');
  const docRef = db.collection('app').doc('v1_data');
  const collections = await docRef.listCollections();
  collections.forEach(c => console.log(' - ' + c.id));

  console.log('Listing collections under "app_staging/v1_data"...');
  const docRefStaging = db.collection('app_staging').doc('v1_data');
  const collectionsStaging = await docRefStaging.listCollections();
  collectionsStaging.forEach(c => console.log(' - ' + c.id));
}

listAllCollections().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
