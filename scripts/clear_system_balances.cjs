const admin = require('firebase-admin');
const path = require('path');

async function clearData() {
    try {
        const serviceAccountPath = path.resolve(__dirname, 'firebase-service-account.json');

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
            projectId: 'financial-tawseelone'
        });
        const db = admin.firestore();

        // Environment prefix
        const envs = ['app_staging', 'app'];

        for (const env of envs) {
            console.log(`\n⏳ Clearing system_balances in ${env}/v1_data...`);
            const balancesRef = db.collection(env).doc('v1_data').collection('system_balances');

            // Delete all system_balances
            const bSnapshot = await balancesRef.get();
            if (bSnapshot.empty) {
                console.log(`✅ No system balances found in ${env}.`);
            } else {
                const bBatch = db.batch();
                bSnapshot.docs.forEach(doc => {
                    bBatch.delete(doc.ref);
                });
                await bBatch.commit();
                console.log(`✅ Deleted ${bSnapshot.size} system balances from ${env}.`);
            }

            console.log(`⏳ Clearing sync_metadata in ${env}/v1_data...`);
            const syncRef = db.collection(env).doc('v1_data').collection('sync_metadata');
            const sSnapshot = await syncRef.get();
            if (sSnapshot.empty) {
                console.log(`✅ No sync_metadata found in ${env}.`);
            } else {
                const sBatch = db.batch();
                sSnapshot.docs.forEach(doc => {
                    sBatch.delete(doc.ref);
                });
                await sBatch.commit();
                console.log(`✅ Deleted ${sSnapshot.size} sync_metadata from ${env}.`);
            }
        }

        console.log('\n✨ All cleanup finished successfully!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error during cleanup:', error.message);
        process.exit(1);
    }
}

clearData();
