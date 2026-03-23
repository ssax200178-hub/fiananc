
import admin from 'firebase-admin';

async function test() {
    try {
        admin.initializeApp({
            projectId: 'financial-tawseelone'
        });
        const db = admin.firestore();
        await db.collection('app_staging').doc('test_write').set({ worked: true, timestamp: new Date() });
        console.log('✅ Write worked!');
    } catch (error) {
        console.error('❌ Write failed:', error.message);
    }
}

test();
