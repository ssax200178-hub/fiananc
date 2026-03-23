
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function inspectData(env) {
    console.log(`\n--- Inspecting environment: ${env} ---`);
    const docRef = db.doc(`${env}/v1_data`);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
        const data = docSnap.data();
        console.log("Fields in v1_data:");
        Object.keys(data).forEach(key => {
            if (Array.isArray(data[key])) {
                console.log(`- ${key}: [Array of ${data[key].length}]`);
            } else if (typeof data[key] === 'object') {
                console.log(`- ${key}: {Object}`);
            } else {
                console.log(`- ${key}: ${data[key]}`);
            }
        });
    } else {
        console.log("v1_data document NOT FOUND");
    }

    const subcollections = await docRef.listCollections();
    console.log("Subcollections of v1_data:");
    subcollections.forEach(sub => {
        console.log(`- ${sub.id}`);
    });
}

async function run() {
    await inspectData('app_staging');
    await inspectData('app');
}

run().catch(console.error);
