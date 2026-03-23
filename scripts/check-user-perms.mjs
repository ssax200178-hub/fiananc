
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkUsers(env) {
    console.log(`\n--- Users in ${env} ---`);
    const docSnap = await db.doc(`${env}/v1_data`).get();
    if (!docSnap.exists) return;

    const data = docSnap.data();
    const allUsers = [...(data.users || []), ...(data.customUsers || [])];

    allUsers.forEach(u => {
        console.log(`User: ${u.name} (${u.email}) - Role: ${u.role}`);
        console.log(`Perms: ${JSON.stringify(u.permissions || [])}`);
        console.log('---');
    });
}

async function run() {
    await checkUsers('app_staging');
    await checkUsers('app');
}

run().catch(console.error);
