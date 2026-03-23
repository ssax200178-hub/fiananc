
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// The 9 numbers identified earlier in staging
const adenBranchPhones = [
  { phoneId: "11064", phoneNumber: "779299291", systemAccountName: "تلفون فرع عدن", isActive: true, currency: "new_riyal", branchId: "1771637487420-0gtmvffxo" },
  { phoneId: "11074", phoneNumber: "782840028", systemAccountName: "شريحة 782840028 فرع عدن", isActive: true, currency: "new_riyal", branchId: "1771637487420-0gtmvffxo" },
  { phoneId: "11061", phoneNumber: "784585513", systemAccountName: "مرة واحدة في الشهر المتابعة", isActive: true, currency: "new_riyal", branchId: "1771637487420-0gtmvffxo" },
  { phoneId: "11062", phoneNumber: "779261413", systemAccountName: "خدمة عملاء فرع عدن", isActive: true, currency: "new_riyal", branchId: "1771637487420-0gtmvffxo" },
  { phoneId: "11179", phoneNumber: "782399387", systemAccountName: "شريحة 782399387 فرع عدن", isActive: true, currency: "new_riyal", branchId: "1771637487420-0gtmvffxo" },
  { phoneId: "11061", phoneNumber: "770676022", systemAccountName: "مره واحدة في الشهر", isActive: true, currency: "new_riyal", branchId: "1771637487420-0gtmvffxo" },
  { phoneId: "11080", phoneNumber: "778886383", systemAccountName: "مدير الفرع", isActive: true, currency: "new_riyal", branchId: "1771637487420-0gtmvffxo" },
  { phoneId: "11061", phoneNumber: "784585514", systemAccountName: "علاقات عامة مرة واحدة في الشهر", isActive: true, currency: "new_riyal", branchId: "1771637487420-0gtmvffxo" },
  { phoneId: "11178", phoneNumber: "782399386", systemAccountName: "شريحة 782399386 فرع عدن", isActive: true, currency: "new_riyal", branchId: "1771637487420-0gtmvffxo" }
];

async function restoreToStaging() {
  console.log('Restoring to "app_staging"...');
  const batch = db.batch();
  const collectionRef = db.collection('app_staging').doc('v1_data').collection('branch_phones');

  for (const phone of adenBranchPhones) {
    // Generate a unique ID if not present, or use a consistent one
    const docId = `restore_${phone.branchId}_${phone.phoneId}_${phone.phoneNumber}`;
    const docRef = collectionRef.doc(docId);
    batch.set(docRef, {
      ...phone,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
  console.log(`Successfully restored ${adenBranchPhones.length} numbers to staging.`);
}

restoreToStaging().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
