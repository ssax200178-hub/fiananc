import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkData() {
    const stagingDocRef = db.collection('app_staging').doc('v1_data');
    
    console.log('Checking invoiceBatches in staging...');
    const batchesSnapshot = await stagingDocRef.collection('invoiceBatches').get();
    console.log(`Found ${batchesSnapshot.docs.length} batches.`);
    
    console.log('Checking invoiceBatchItems in staging...');
    const itemsSnapshot = await stagingDocRef.collection('invoiceBatchItems').get();
    console.log(`Found ${itemsSnapshot.docs.length} items.`);
}

checkData().then(() => process.exit(0)).catch(err => {
    console.error('Check failed:', err);
    process.exit(1);
});
