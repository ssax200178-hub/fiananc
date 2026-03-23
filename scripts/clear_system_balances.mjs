import admin from 'firebase-admin';

async function clearData() {
    try {
        admin.initializeApp({
            projectId: 'financial-tawseelone'
        });
        const db = admin.firestore();

        // Environment prefix
        const envs = ['app_staging', 'app'];

        for (const env of envs) {
            console.log(`\n\u23F3 Clearing system_balances in \${env}/v1_data...`);
            const balancesRef = db.collection(env).doc('v1_data').collection('system_balances');

            // Delete all system_balances
            const bSnapshot = await balancesRef.get();
            if (bSnapshot.empty) {
                console.log(`\u2705 No system balances found in \${env}.`);
            } else {
                const bBatch = db.batch();
                bSnapshot.docs.forEach(doc => {
                    bBatch.delete(doc.ref);
                });
                await bBatch.commit();
                console.log(`\u2705 Deleted \${bSnapshot.size} system balances from \${env}.`);
            }

            console.log(`\u23F3 Clearing sync_metadata in \${env}/v1_data...`);
            const syncRef = db.collection(env).doc('v1_data').collection('sync_metadata');
            const sSnapshot = await syncRef.get();
            if (sSnapshot.empty) {
                console.log(`\u2705 No sync_metadata found in \${env}.`);
            } else {
                const sBatch = db.batch();
                sSnapshot.docs.forEach(doc => {
                    sBatch.delete(doc.ref);
                });
                await sBatch.commit();
                console.log(`\u2705 Deleted \${sSnapshot.size} sync_metadata from \${env}.`);
            }
        }

        console.log('\n\u2728 All cleanup finished successfully!');
        process.exit(0);
    } catch (error) {
        console.error('\n\u274C Error during cleanup:', error.message);
        process.exit(1);
    }
}

clearData();
