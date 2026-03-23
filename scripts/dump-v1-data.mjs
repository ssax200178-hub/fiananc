
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function dumpData(env) {
    console.log(`\n--- Dumping ${env}/v1_data ---`);
    const docSnap = await db.doc(`${env}/v1_data`).get();
    if (!docSnap.exists) {
        console.log("Document does not exist!");
        return;
    }

    const data = docSnap.data();
    fs.writeFileSync(`v1_data_${env}.json`, JSON.stringify(data, null, 2));
    console.log(`Saved to v1_data_${env}.json`);

    // Also check if any other fields exist that might be relevant
    console.log("Root fields:", Object.keys(data));
}

async function run() {
    await dumpData('app_staging');
    await dumpData('app');
}

run().catch(console.error);
