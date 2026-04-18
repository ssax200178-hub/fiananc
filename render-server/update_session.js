const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../service-account.json'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
    try {
        console.log('📝 Updating Tawseel session credentials...');
        
        await db.doc('app/v1_data/settings/tawseel_session').set({
            email: 'abdr-200178@tw.app',
            plainPassword: '12358520',
            sessionStatus: 'needs_refresh',
            updatedAt: new Date().toISOString(),
            statusMessage: 'تم تحديث بيانات الدخول - بانتظار تسجيل دخول جديد'
        }, { merge: true });

        console.log('✅ Credentials updated successfully!');
        console.log('📧 Email: abdr-200178@tw.app');
        console.log('🔑 Password: ****hidden****');
        console.log('\nالآن اذهب للداشبورد واضغط "سحب الآن" وسيستخدم الخادم البيانات الجديدة.');
        
    } catch (err) {
        console.error('❌ Failed:', err.message);
    }
    process.exit(0);
})();
