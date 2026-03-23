
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const serviceAccount = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function fixPermissions(env) {
    console.log(`🚀 Starting fix-permissions for environment: ${env}...`);

    // 1. Get all auth users
    const authUsers = [];
    let pageToken;
    do {
        const result = await auth.listUsers(1000, pageToken);
        authUsers.push(...result.users);
        pageToken = result.pageToken;
    } while (pageToken);

    console.log(`✅ Found ${authUsers.length} users in Firebase Auth.`);

    // 2. Get main v1_data doc
    const docRef = db.doc(`${env}/v1_data`);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
        console.error(`❌ Error: Document ${env}/v1_data not found.`);
        return;
    }

    const data = docSnap.data();
    const systemUsers = [
        ...(data.customUsers || []),
        ...(data.users || [])
    ];

    // De-duplicate by id
    const uniqueUsers = Array.from(new Map(systemUsers.map(u => [u.id, u])).values());
    console.log(`✅ Found ${uniqueUsers.length} unique system users.`);

    const batch = db.batch();
    let count = 0;

    for (const user of uniqueUsers) {
        // Match by email or username-based email
        const userEmail = (user.email || '').trim().toLowerCase();
        const altEmail = user.username ? `${user.username.trim()}@financial.com`.toLowerCase() : null;

        const matchingAuth = authUsers.find(au =>
            (au.email && au.email.toLowerCase() === userEmail) ||
            (au.email && au.email.toLowerCase() === altEmail)
        );

        if (matchingAuth) {
            const roleRef = db.collection(`${env}/v1_data/user_roles`).doc(matchingAuth.uid);
            batch.set(roleRef, {
                role: user.role,
                permissions: user.permissions || [],
                isActive: user.isActive,
                email: matchingAuth.email,
                updatedAt: new Date().toISOString(),
                systemUserId: user.id
            });
            count++;
            console.log(`🔗 Linked: ${user.name} (${user.role}) -> ${matchingAuth.uid}`);
        } else {
            console.warn(`⚠️ Warning: No matching Auth user for ${user.name} (${userEmail})`);
        }
    }

    if (count > 0) {
        await batch.commit();
        console.log(`\n✨ Successfully synced ${count} user roles in ${env}.`);
    } else {
        console.log(`\n⚠️ No user roles synced for ${env}.`);
    }
}

async function run() {
    await fixPermissions('app_staging');
    await fixPermissions('app');
}

run().catch(console.error);
