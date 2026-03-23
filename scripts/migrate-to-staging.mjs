
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// البحث عن ملف المفتاح في المجلد الرئيسي للمشروع أو مجلد السكربتات
const possiblePaths = [
    path.resolve('service-account.json'),
    path.resolve('serviceAccountKey.json'),
    path.join(__dirname, '..', 'service-account.json'),
    path.join(__dirname, '..', 'serviceAccountKey.json')
];

let serviceAccountPath = possiblePaths.find(p => fs.existsSync(p));

if (!serviceAccountPath) {
    console.error('❌ خطا: لم يتم العثور على ملف service-account.json');
    console.log('يرجى وضع ملف المفتاح في مجلد المشروع وتسميته service-account.json');
    process.exit(1);
}

console.log(`✅ استخدام ملف المفتاح: ${serviceAccountPath}`);

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * دالة لنسخ مجموعة كاملة بما فيها المجموعات الفرعية
 */
async function copyCollection(srcCollectionRef, destCollectionRef) {
    let query = srcCollectionRef;

    // إذا كانت المجموعة هي سجلات النشاط، نكتفي بآخر 50 سجل فقط لتجنب الضغط
    if (srcCollectionRef.id === 'activity_logs') {
        console.log(`⚠️ تجاوز السجلات الضخمة: جاري نسخ آخر 50 سجل فقط من ${srcCollectionRef.path}`);
        query = srcCollectionRef.orderBy('timestamp', 'desc').limit(50);
    }

    const snapshot = await query.get();
    if (snapshot.empty) return;

    console.log(`📦 جاري نسخ ${snapshot.size} مستندات من ${srcCollectionRef.path}...`);

    // تقسيم العمل لـ Batches (كل 100 مستند في دفعة واحدة لتفادي مشاكل الأداء)
    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += 100) {
        const chunk = docs.slice(i, i + 100);
        const batch = db.batch();

        for (const doc of chunk) {
            batch.set(destCollectionRef.doc(doc.id), doc.data());
        }

        await batch.commit();
        console.log(`   ✅ تم نسخ ${i + chunk.length}/${docs.length} مستندات.`);
    }

    // نسخ المجموعات الفرعية recursively
    for (const doc of snapshot.docs) {
        const subcollections = await doc.ref.listCollections();
        for (const sub of subcollections) {
            await copyCollection(sub, destCollectionRef.doc(doc.id).collection(sub.id));
        }
    }
}

async function runMigration() {
    console.log('🚀 بدء عملية نقل البيانات من الإنتاج (app) إلى الاختبار (app_staging)...');

    try {
        const sourceRoot = db.collection('app');
        const targetRoot = db.collection('app_staging');

        // البدء بالنسخ من الجذر
        await copyCollection(sourceRoot, targetRoot);

        console.log('\n✨ تم الانتهاء من نقل كافة البيانات بنجاح!');
        console.log('✅ تم نقل الموظفين والمطاعم والإشعارات والنشاطات إلى بيئة التست.');
    } catch (error) {
        console.error('\n❌ فشلت العملية:', error);
    }
}

runMigration();
