import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

const branches = [
    { id: '1771637393438-0tqhulyxh', name: 'صنعاء' },
    { id: '1771637410695-xx3wz6y7s', name: 'إب' },
    { id: '1771637429793-5a5hz8w2u', name: 'ذمار' },
    { id: '1771637436637-69wfcar5l', name: 'الحديدة' },
    { id: '1771637469375-g80f7ik8i', name: 'تعز - الحوبان' }
];

async function generateDummyData() {
    console.log('Generating dummy data in "app_staging"...');

    const batchesCol = db.collection('app_staging').doc('v1_data').collection('invoiceBatches');
    const itemsCol = db.collection('app_staging').doc('v1_data').collection('invoiceBatchItems');

    const batchData = [
        {
            name: 'دفعة شهر مارس 2026 - أ',
            rangeFrom: 100001,
            rangeTo: 200000,
            totalBooklets: 2000,
            totalAmountPrint: 500000,
            totalAmountStamp: 50000,
            totalAmountTransport: 25000,
            issueDate: '2026-03-01',
            notes: 'بيانات تجريبية للاختبار'
        },
        {
            name: 'دفعة شهر مارس 2026 - ب',
            rangeFrom: 200001,
            rangeTo: 300000,
            totalBooklets: 2000,
            totalAmountPrint: 500000,
            totalAmountStamp: 50000,
            totalAmountTransport: 25000,
            issueDate: '2026-03-05',
            notes: 'بيانات تجريبية للاختبار - المجموعة الثانية'
        }
    ];

    for (const b of batchData) {
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const totalAmount = b.totalAmountPrint + b.totalAmountStamp + b.totalAmountTransport;
        
        await batchesCol.doc(batchId).set({
            ...b,
            id: batchId,
            totalAmount,
            createdAt: new Date().toISOString(),
            createdBy: 'system_mock'
        });

        console.log(`Created batch: ${b.name} (${batchId})`);

        // Create items for each branch in this batch
        let currentRange = b.rangeFrom;
        for (const branch of branches) {
            const itemId = `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const bookletCount = 100;
            const bookletPrice = totalAmount / b.totalBooklets;
            const amountOld = bookletCount * bookletPrice;
            const exchangeRateOld = 530;
            const exchangeRateNew = 1650;
            const amountNew = (amountOld / exchangeRateOld) * exchangeRateNew;

            await itemsCol.doc(itemId).set({
                id: itemId,
                batchId: batchId,
                branchId: branch.id,
                branchName: branch.name,
                rangeFrom: currentRange,
                rangeTo: currentRange + (bookletCount * 50) - 1, // Assuming 50 invoices per booklet
                bookletCount: bookletCount,
                bookletPrice: bookletPrice,
                amountOld: Math.round(amountOld),
                amountNew: Math.round(amountNew),
                exchangeRateOld: exchangeRateOld,
                exchangeRateNew: exchangeRateNew,
                disbursementDescription: `صرف دفاتر فواتير فرع ${branch.name} - ${b.name}`,
                exchangeRateDescription: `فارق سعر صرف دفاتر فرع ${branch.name}`,
                disbursementDate: b.issueDate,
                isPosted: false,
                createdBy: 'system_mock',
                updatedAt: new Date().toISOString()
            });
            
            console.log(`  Added item for branch: ${branch.name}`);
            currentRange += (bookletCount * 50);
        }
        // Small delay to ensure unique timestamps if needed
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('Dummy data generation complete.');
}

generateDummyData().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
