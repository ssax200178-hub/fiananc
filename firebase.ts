import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
    apiKey: "AIzaSyDztqh81sRGi27TBCQ9Kh0XSSTawWeyItU",
    authDomain: "financial-tawseelone.firebaseapp.com",
    projectId: "financial-tawseelone",
    storageBucket: "financial-tawseelone.firebasestorage.app",
    messagingSenderId: "928095450928",
    appId: "1:928095450928:web:865ddde7f9fbb63f7afaf5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Enable Offline Persistence
enableIndexedDbPersistence(db)
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('Persistence failed: Multiple tabs open');
        } else if (err.code == 'unimplemented') {
            console.warn('Persistence not supported by browser');
        }
    });
