import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

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

async function fetchTodayLoans() {
    const today = "09/03/2026"; // DD/MM/YYYY format based on AppContext.tsx:653
    console.log(`Fetching loans for date: ${today}`);
    try {
        const q = query(
            collection(db, "app", "v1_data", "loan_requests"),
            where("isApproved", "==", true),
            where("date", "==", today)
        );
        const snapshot = await getDocs(q);
        const loans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (loans.length === 0) {
            console.log("No loans found for today.");
            // Try fetching all approved loans to see what we have
            const q2 = query(collection(db, "app", "v1_data", "loan_requests"), where("isApproved", "==", true));
            const snap2 = await getDocs(q2);
            console.log(`Total approved loans found: ${snap2.size}`);
            const allApproved = snap2.docs.map(d => ({ date: d.data().date, id: d.id }));
            console.log("Dates of approved loans:", JSON.stringify(allApproved.slice(0, 10), null, 2));
        } else {
            console.log("DATA_START");
            console.log(JSON.stringify(loans, null, 2));
            console.log("DATA_END");
        }
    } catch (err) {
        console.error("Error fetching data:", err);
    }
}

fetchTodayLoans().then(() => process.exit(0)).catch(err => {
    console.error("FATAL:", err);
    process.exit(1);
});
