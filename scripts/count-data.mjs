
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function countSubcollections(env) {
    console.log(`\n--- Counting subcollections for: ${env} ---`);
    const docRef = db.doc(`${env}/v1_data`);
    const subcollections = await docRef.listCollections();

    for (const sub of subcollections) {
        const snapshot = await sub.get();
        console.log(`- ${sub.id}: ${snapshot.size} documents`);
    }
}

async function run() {
    await countSubcollections('app_staging');
    await countSubcollections('app');
}

run().catch(console.error);
