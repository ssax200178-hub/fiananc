import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function testRead() {
    console.log('Testing single read...');
    const doc = await db.collection('app').doc('v1_data').get();
    console.log('Read success:', doc.exists);
}

testRead().then(() => process.exit(0)).catch(err => {
    console.error('Read failed:', err);
    process.exit(1);
});
