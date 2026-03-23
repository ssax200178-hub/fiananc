import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function migrateData() {
    const liveDocRef = db.collection('app').doc('v1_data');
    const stagingDocRef = db.collection('app_staging').doc('v1_data');

    console.log(`Migrating recent invoiceBatches...`);
    
    // Fetch top 20 batches
    const batchesSnapshot = await liveDocRef.collection('invoiceBatches')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get()
        .catch(async () => {
            return await liveDocRef.collection('invoiceBatches').limit(20).get();
        });
    
    console.log(`Found ${batchesSnapshot.docs.length} batches to migrate.`);

    let batch = db.batch();
    const batchIds: string[] = [];

    // Migrate Batches
    for (const doc of batchesSnapshot.docs) {
        batchIds.push(doc.id);
        const destRef = stagingDocRef.collection('invoiceBatches').doc(doc.id);
        batch.set(destRef, doc.data());
    }
    await batch.commit();
    console.log(`Migrated invoiceBatches successfully.`);

    if (batchIds.length === 0) {
        console.log('No batches found to migrate.');
        return;
    }

    // Now migrate items that belong to these batches
    console.log(`Migrating corresponding invoiceBatchItems...`);
    let itemsCount = 0;
    batch = db.batch();

    // Firestore `in` query is limited to 10 items, so we chunk the batchIds
    const chunkArray = (arr: any[], size: number) => 
        Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

    const idChunks = chunkArray(batchIds, 10);

    for (const chunk of idChunks) {
        const itemsSnapshot = await liveDocRef.collection('invoiceBatchItems')
            .where('batchId', 'in', chunk)
            .get();

        for (const doc of itemsSnapshot.docs) {
            const destRef = stagingDocRef.collection('invoiceBatchItems').doc(doc.id);
            batch.set(destRef, doc.data());
            itemsCount++;

            if (itemsCount % 400 === 0) {
                await batch.commit();
                console.log(`Committed ${itemsCount} items...`);
                batch = db.batch();
            }
        }
    }

    if (itemsCount % 400 !== 0) {
        await batch.commit();
    }
    
    console.log(`Migrated ${itemsCount} invoiceBatchItems successfully.`);
    console.log('Migration complete!');
}

migrateData().then(() => process.exit(0)).catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
