
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkAdenData() {
  console.log('--- Checking ADEN Branch ID ---');
  const branchesSnapshot = await db.collection('app').doc('v1_data').collection('branches').get();
  let adenId = null;
  branchesSnapshot.forEach(doc => {
    if (doc.data().name === 'عدن') adenId = doc.id;
  });
  console.log('Aden Branch ID (app):', adenId);

  if (adenId) {
    console.log('\n--- Checking Saved Numbers (branch_phones) in "app" ---');
    const phonesSnapshot = await db.collection('app').doc('v1_data').collection('branch_phones')
      .where('branchId', '==', adenId).get();
    console.log(`Found ${phonesSnapshot.size} saved numbers in "app"`);
    phonesSnapshot.forEach(doc => {
      console.log(` - ID: ${doc.data().phoneId}, Num: ${doc.data().phoneNumber}, Name: ${doc.data().systemAccountName}`);
    });
  }

  const branchesSnapshotStaging = await db.collection('app_staging').doc('v1_data').collection('branches').get();
  let adenIdStaging = null;
  branchesSnapshotStaging.forEach(doc => {
    if (doc.data().name === 'عدن') adenIdStaging = doc.id;
  });
  console.log('\nAden Branch ID (app_staging):', adenIdStaging);

  if (adenIdStaging) {
    console.log('\n--- Checking Saved Numbers (branch_phones) in "app_staging" ---');
    const phonesSnapshotStaging = await db.collection('app_staging').doc('v1_data').collection('branch_phones')
      .where('branchId', '==', adenIdStaging).get();
    console.log(`Found ${phonesSnapshotStaging.size} saved numbers in "app_staging"`);
    phonesSnapshotStaging.forEach(doc => {
      console.log(` - ID: ${doc.data().phoneId}, Num: ${doc.data().phoneNumber}, Name: ${doc.data().systemAccountName}`);
    });
  }
}

checkAdenData().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
