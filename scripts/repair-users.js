const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// INSTRUCTIONS:
// 1. Download your Firebase Service Account JSON from Firebase Console
// 2. Rename it to 'serviceAccount.json' and place it in this folder
// 3. Run: node scripts/repair-users.js

const serviceAccount = require('../serviceAccount.json');

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function repair() {
    const docPath = 'app/v1_data'; // Change to 'app_staging/v1_data' if needed
    const docRef = db.doc(docPath);

    const newUsers = [
        {
            id: 'admin_abdullah',
            username: 'Abdullah178',
            name: 'Abdullah System Engineer',
            role: 'super_admin',
            isActive: true,
            email: 'Abdullah178@financial.com',
            permissions: [
                'view_dashboard', 'manage_restaurants', 'manage_funds', 'delete_funds',
                'view_history', 'view_activity_logs', 'manage_users', 'manage_settings', 'manage_tips'
            ]
        },
        {
            id: 'admin_ali',
            username: 'ail2',
            name: 'علي الخميسي',
            role: 'admin',
            isActive: true,
            email: 'ail2@financial.com',
            permissions: ['view_dashboard', 'manage_restaurants', 'manage_funds', 'view_history', 'manage_tips']
        },
        {
            id: 'u_wahib',
            username: 'wahib12',
            name: 'Wahib',
            role: 'user',
            isActive: true,
            email: 'wahib12@financial.com',
            permissions: ['view_dashboard', 'view_history']
        },
        {
            id: 'u_fars32',
            username: 'fars32',
            name: 'Fars 32',
            role: 'user',
            isActive: true,
            email: 'fars32@financial.com',
            permissions: ['view_dashboard', 'view_history']
        },
        {
            id: 'u_fars46',
            username: 'fars46',
            name: 'Fars 46',
            role: 'user',
            isActive: true,
            email: 'fars46@financial.com',
            permissions: ['view_dashboard', 'view_history']
        }
    ];

    try {
        await docRef.set({ customUsers: newUsers }, { merge: true });
        console.log('✅ Users repaired successfully in:', docPath);
    } catch (error) {
        console.error('❌ Repair failed:', error);
    }
}

repair();
