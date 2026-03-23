import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkBranches() {
    console.log('Checking branches in "app_staging"...');
    const snapshot = await db.collection('app_staging').doc('v1_data').collection('branches').limit(5).get();
    if (snapshot.empty) {
        console.log('No branches found in staging.');
        return;
    }
    snapshot.forEach(doc => {
        console.log(`Branch: ${doc.id} - ${doc.data().name}`);
    });
}

checkBranches().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
