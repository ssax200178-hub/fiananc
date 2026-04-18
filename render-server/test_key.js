const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../service-account.json'));

try {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('✅ Firebase Admin initialized for project:', serviceAccount.project_id);
} catch (e) {
    console.error('❌ Init failed:', e.message);
    process.exit(1);
}

const db = admin.firestore();

(async () => {
    try {
        console.log('📡 Testing Firestore connection with NEW key...');
        const doc = await db.doc('app/v1_data/settings/scraping_config').get();
        if (doc.exists) {
            console.log('🎉🎉🎉 SUCCESS! Firestore connection is PERFECT!');
            console.log('📄 Document data:', JSON.stringify(doc.data()).substring(0, 200));
        } else {
            console.log('✅ Connection works! (document does not exist yet, but auth is valid)');
        }
    } catch (err) {
        console.error('❌ FAILED:', err.message);
        if (err.message.includes('UNAUTHENTICATED')) {
            console.error('💀 This key is also REVOKED. You need to generate another one from Firebase Console.');
        }
    }
    process.exit(0);
})();
