
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const ALL_PERMISSIONS = [
    'dashboard_view',
    'restaurants_view', 'restaurants_add', 'restaurants_edit', 'restaurants_delete', 'restaurants_import',
    'funds_view', 'funds_add', 'funds_edit', 'funds_delete',
    'recon_view', 'recon_add',
    'payments_view', 'payments_manage',
    'archives_view', 'archives_details', 'archives_download', 'archives_delete',
    'logs_view',
    'users_view', 'users_add', 'users_edit', 'users_delete', 'users_permissions',
    'settings_manage',
    'tips_view', 'tips_add', 'tips_delete',
    'loans_view', 'loans_add', 'loans_edit', 'loans_delete', 'loans_approve',
    'salary_view',
    'branches_view', 'branches_add', 'branches_edit', 'branches_delete',
    'exchange_rates_manage',
    'loan_reports_view'
];

async function restoreAdminAccess(env) {
    console.log(`\n--- Restoring Admin Access for: ${env} ---`);
    const docRef = db.doc(`${env}/v1_data`);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
        console.log("Document does not exist!");
        return;
    }

    const data = docSnap.data();
    let customUsers = data.customUsers || [];
    let usersList = data.users || [];

    let updatedCount = 0;

    const updatePermissions = (u) => {
        if (u.role === 'admin' || u.role === 'super_admin') {
            const currentPerms = u.permissions || [];
            const missing = ALL_PERMISSIONS.filter(p => !currentPerms.includes(p));
            if (missing.length > 0) {
                u.permissions = Array.from(new Set([...currentPerms, ...ALL_PERMISSIONS]));
                updatedCount++;
                console.log(`✅ Granted ${missing.length} missing permissions to: ${u.name} (${u.role})`);
            }
        }
    };

    customUsers.forEach(updatePermissions);
    usersList.forEach(updatePermissions);

    if (updatedCount > 0) {
        await docRef.update({
            customUsers: customUsers,
            users: usersList,
            updatedAt: new Date().toISOString()
        });
        console.log(`🚀 Updated ${updatedCount} entries in main document.`);

        // Sync to user_roles subcollection
        const batch = db.batch();
        const allSystemUsers = [...customUsers, ...usersList];

        // Match with Auth users to get UIDs
        const authResult = await admin.auth().listUsers();
        const authUsers = authResult.users;

        let syncCount = 0;
        for (const user of allSystemUsers) {
            if (user.role === 'admin' || user.role === 'super_admin') {
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
                    }, { merge: true });
                    syncCount++;
                    console.log(`🔄 Synced user_roles for: ${user.name} -> ${matchingAuth.uid}`);
                }
            }
        }

        if (syncCount > 0) {
            await batch.commit();
            console.log(`✨ Successfully synced ${syncCount} users to user_roles subcollection.`);
        }
    } else {
        console.log("No admins needed permission updates.");
    }
}

async function run() {
    await restoreAdminAccess('app_staging');
    await restoreAdminAccess('app');
    console.log("\nDone!");
}

run().catch(console.error);
