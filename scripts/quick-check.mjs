
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
    const doc = await db.doc('app/v1_data').get();
    const data = doc.data();
    const users = [...(data.users || []), ...(data.customUsers || [])];
    users.forEach(u => {
        if (u.name.includes('عبدالرحمن') || u.name.includes('عبدالله')) {
            console.log(`${u.name} [${u.role}]:`, u.permissions?.includes('branches_view') ? 'YES branches' : 'NO branches');
            console.log(`- All perms count: ${u.permissions?.length || 0}`);
        }
    });
}

run().catch(console.error);
