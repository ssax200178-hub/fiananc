const fs = require('fs');
const path = require('path');

try {
    const keyPath = path.join(__dirname, '../service-account.json');
    if (!fs.existsSync(keyPath)) {
        console.error('❌ File service-account.json not found in the main directory!');
        process.exit(1);
    }
    
    const obj = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    console.log('Project ID:', obj.project_id);
    console.log('Client Email:', obj.client_email);
    
    // Convert to Base64
    const b64 = Buffer.from(JSON.stringify(obj)).toString('base64');
    
    const outPath = path.join(__dirname, 'final-base64.txt');
    fs.writeFileSync(outPath, b64);
    
    console.log('✅ Base64 string generated successfully!');
    console.log(`✅ Saved to: ${outPath}`);
    console.log('\n--- ماذا تفعل الآن؟ ---');
    console.log('1. افتح الملف final-base64.txt وانسخ كل النص الموجود بداخله.');
    console.log('2. اذهب إلى موقع Render -> إعدادات الخادم (Environment).');
    console.log('3. احذف القيمة القديمة للمتغير FIREBASE_SERVICE_ACCOUNT والصق النص الجديد.');
    console.log('4. احفظ التغييرات وانتظر حتى يعيد Render التشغيل تلقائياً.');
} catch (e) {
    console.error('❌ Error:', e.message);
}
