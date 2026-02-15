import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDztqh81sRGi27TBCQ9Kh0XSSTawWeyItU",
    authDomain: "financial-tawseelone.firebaseapp.com",
    projectId: "financial-tawseelone",
    storageBucket: "financial-tawseelone.firebasestorage.app",
    messagingSenderId: "928095450928",
    appId: "1:928095450928:web:865ddde7f9fbb63f7afaf5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function findUsers() {
    const logsRef = collection(db, 'app', 'v1_data', 'activity_logs');
    const q = query(logsRef, where('action', '==', 'إضافة مستخدم'));

    try {
        const snapshot = await getDocs(q);
        console.log('Search Results:');
        snapshot.forEach(doc => {
            console.log(JSON.stringify(doc.data()));
        });
        process.exit(0);
    } catch (e) {
        console.error('Search failed:', e);
        process.exit(1);
    }
}

findUsers();
