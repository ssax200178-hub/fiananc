// مساعد توصيل ون - استخراج الأرصدة المتطور جداً
console.log("%c[Tawseel Helper] Extension attempt...", "color: #e91e63; font-weight: bold;");

function scrapeData() {
    console.log("[Tawseel Helper] Scraping started...");
    const rows = Array.from(document.querySelectorAll('tr'));

    if (rows.length === 0) {
        alert("⚠️ لم يتم العثور على أي صفوف (tr) في الصفحة. هل الجدول محمل؟");
        return;
    }

    let count = 0;
    const data = rows.map(r => {
        const cells = Array.from(r.querySelectorAll('td, th'));
        if (cells.length < 6) return null;

        const id = cells[0].innerText.trim();
        const balance = cells[5].innerText.replace(/,/g, '').trim();

        if (!id || id === "رقم الحساب" || isNaN(parseFloat(balance))) return null;

        count++;
        return `${id}\t${balance}`;
    }).filter(Boolean).join('\n');

    if (data) {
        if (window.opener) {
            window.opener.postMessage(data, "*");
            alert(`✅ نجاح: تم استخراج ${count} مطعم وإرسالها للمطابقة!`);
        } else {
            const el = document.createElement('textarea');
            el.value = data;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            alert(`✅ تم استخراج ${count} مطعم ونسخها للذاكرة!\n\nيمكنك الآن لصقها يدوياً في خانة المطابقة.`);
        }
    } else {
        alert("❌ لم يتم العثور على أرصدة صالحة للاستخراج في هذا الجدول.\n\nتأكد من اختيار 'التقرير التجميعي الشامل' وظهور الأرقام.");
    }
}

function initHelper() {
    if (document.getElementById('tawseel-helper-btn')) return;

    // محاولة الوصول للجسم أو أي إطار
    const target = document.body || document.documentElement;
    if (!target) return;

    const btn = document.createElement('button');
    btn.id = 'tawseel-helper-btn';
    btn.innerHTML = '🚀 سحب بيانات المطاعم';
    btn.style.cssText = `
        position: fixed;
        bottom: 40px;
        right: 40px;
        z-index: 2147483647 !important;
        padding: 15px 30px;
        background-color: #e91e63 !important;
        color: white !important;
        border: 4px solid white !important;
        border-radius: 50px !important;
        cursor: pointer !important;
        font-weight: 900 !important;
        box-shadow: 0 10px 30px rgba(233, 30, 99, 0.6) !important;
        font-family: sans-serif !important;
        font-size: 18px !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
    `;

    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        scrapeData();
    };

    btn.onmouseover = () => {
        btn.style.transform = 'scale(1.1) translateY(-5px)';
        btn.style.backgroundColor = '#c2185b';
    };

    btn.onmouseout = () => {
        btn.style.transform = 'scale(1) translateY(0)';
        btn.style.backgroundColor = '#e91e63';
    };

    target.appendChild(btn);
    console.log("%c[Tawseel Helper] Floating button injected successfully.", "color: green; font-weight: bold;");
}

// مراقبة التغييرات والتحقق الدوري
const observer = new MutationObserver(initHelper);
if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
}
setInterval(initHelper, 2000); // فحص كل ثانيتين كخطة احتياطية
initHelper();
