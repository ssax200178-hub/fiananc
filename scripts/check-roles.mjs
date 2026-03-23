
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const serviceAccount = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkRoles() {
    const collections = ['app', 'app_staging'];
    for (const root of collections) {
        console.log(`Checking ${root}/v1_data/user_roles...`);
        const snapshot = await db.collection(`${root}/v1_data/user_roles`).get();
        console.log(`- Count: ${snapshot.size}`);
        snapshot.docs.forEach(doc => {
            console.log(`  - ${doc.id}: ${JSON.stringify(doc.data())}`);
        });
    }
}

checkRoles().catch(console.error);
