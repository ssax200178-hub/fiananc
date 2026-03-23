"""
سكربت استخراج أرصدة النظام الأساسي (tawseel.app)
====================================================
يقوم بفتح Chrome عبر Selenium، والدخول لنظام tawseel.app
لاستخراج أرصدة الحسابات البنكية والمطاعم، ثم إرسالها لـ Firestore.

الاستخدام:
1. pip install -r requirements.txt
2. ضع ملف firebase-service-account.json في نفس المجلد
3. python tawseel_scraper.py
"""

import tkinter as tk
from tkinter import scrolledtext, messagebox, filedialog
import threading
import json
import os
import time
from datetime import datetime

# ============================================================
# Firebase Setup
# ============================================================
import firebase_admin
from firebase_admin import credentials, firestore

# ============================================================
# Selenium Setup
# ============================================================
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# Optional imports for fallback browsers
try:
    from selenium.webdriver.edge.service import Service as EdgeService
    from selenium.webdriver.edge.options import Options as EdgeOptions
    EDGE_AVAILABLE = True
except ImportError:
    EDGE_AVAILABLE = False

try:
    from webdriver_manager.chrome import ChromeDriverManager
    WDM_AVAILABLE = True
except ImportError:
    WDM_AVAILABLE = False

# ============================================================
# Configuration
# ============================================================
FIREBASE_PROJECT_ID = "financial-tawseelone"
ROOT_COLLECTION = "app"        # Production. Change to "app_staging" for testing
DATA_PATH = "v1_data"

BANK_REPORT_URL = (
    "https://tawseel.app/admin/accounting/report/monthly"
    "?branch%5B%5D=tenant.*&accounting_types=0&financial_statement=0"
    "&currency=-1&clause=-1&entry_type=-1"
    "&fromdate={from_date}&todate={to_date}"
    "&account=6000&all_branch=0&cost_center=-1"
)

RESTAURANT_REPORT_URL = (
    "https://tawseel.app/admin/accounting/report/monthly"
    "?branch%5B%5D=tenant.*&accounting_types=0&financial_statement=0"
    "&currency=-1&clause=-1&entry_type=-1"
    "&fromdate={from_date}&todate={to_date}"
    "&account=2000&all_branch=0&cost_center=-1"
)

LOGIN_URL = "https://tawseel.app/login"

# Chrome paths to search on Windows
CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.join(os.environ.get("LOCALAPPDATA", ""), r"Google\Chrome\Application\chrome.exe"),
]


class TawseelScraper:
    """Main scraper class with tkinter GUI."""

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("مستخرج أرصدة توصيل - Tawseel Balance Extractor")
        self.root.geometry("850x700")
        self.root.configure(bg="#0f172a")

        self.driver = None
        self.db = None
        self.bank_data = []
        self.restaurant_data = []

        self._build_ui()

    # ============================================================
    # UI Construction
    # ============================================================
    def _build_ui(self):
        """Build the tkinter interface."""
        # Header
        header = tk.Frame(self.root, bg="#1e293b", pady=12)
        header.pack(fill="x")
        tk.Label(
            header, text="🔄 مستخرج أرصدة توصيل",
            font=("Segoe UI", 18, "bold"), fg="#38bdf8", bg="#1e293b"
        ).pack()
        tk.Label(
            header, text="Tawseel Balance Extractor → Firestore",
            font=("Segoe UI", 10), fg="#94a3b8", bg="#1e293b"
        ).pack()

        # Firebase Service Account
        fb_frame = tk.LabelFrame(
            self.root, text="🔑 إعداد Firebase",
            font=("Segoe UI", 10, "bold"), fg="#e2e8f0", bg="#1e293b",
            labelanchor="ne", padx=10, pady=5
        )
        fb_frame.pack(fill="x", padx=15, pady=(10, 5))

        self.sa_path_var = tk.StringVar(value="")
        sa_path_frame = tk.Frame(fb_frame, bg="#1e293b")
        sa_path_frame.pack(fill="x")
        tk.Entry(
            sa_path_frame, textvariable=self.sa_path_var,
            font=("Consolas", 9), bg="#0f172a", fg="#e2e8f0",
            insertbackground="#38bdf8", relief="flat", bd=0
        ).pack(side="right", fill="x", expand=True, ipady=4, padx=(5, 0))
        tk.Button(
            sa_path_frame, text="📂 اختر ملف SA",
            font=("Segoe UI", 9, "bold"), bg="#334155", fg="white",
            activebackground="#475569", relief="flat",
            command=self._pick_sa_file
        ).pack(side="left")

        tk.Button(
            fb_frame, text="🔗 اتصال بـ Firestore",
            font=("Segoe UI", 10, "bold"), bg="#059669", fg="white",
            activebackground="#047857", relief="flat", pady=4,
            command=lambda: self._run_async(self._connect_firebase)
        ).pack(fill="x", pady=(5, 0))

        # Date Range
        date_frame = tk.LabelFrame(
            self.root, text="📅 نطاق التقرير",
            font=("Segoe UI", 10, "bold"), fg="#e2e8f0", bg="#1e293b",
            labelanchor="ne", padx=10, pady=5
        )
        date_frame.pack(fill="x", padx=15, pady=5)

        dates_inner = tk.Frame(date_frame, bg="#1e293b")
        dates_inner.pack(fill="x")

        tk.Label(dates_inner, text="من:", font=("Segoe UI", 9), fg="#94a3b8", bg="#1e293b").pack(side="right")
        self.from_date_var = tk.StringVar(value=f"{datetime.now().year}-01-01")
        tk.Entry(
            dates_inner, textvariable=self.from_date_var, width=12,
            font=("Consolas", 10), bg="#0f172a", fg="#e2e8f0",
            insertbackground="#38bdf8", relief="flat"
        ).pack(side="right", padx=5, ipady=3)

        tk.Label(dates_inner, text="إلى:", font=("Segoe UI", 9), fg="#94a3b8", bg="#1e293b").pack(side="right", padx=(15, 0))
        self.to_date_var = tk.StringVar(value=datetime.now().strftime("%Y-%m-%d"))
        tk.Entry(
            dates_inner, textvariable=self.to_date_var, width=12,
            font=("Consolas", 10), bg="#0f172a", fg="#e2e8f0",
            insertbackground="#38bdf8", relief="flat"
        ).pack(side="right", padx=5, ipady=3)

        # Action Buttons
        btn_frame = tk.Frame(self.root, bg="#0f172a")
        btn_frame.pack(fill="x", padx=15, pady=10)

        buttons = [
            ("1️⃣ فتح المتصفح وتسجيل الدخول", "#3b82f6", self._step_login),
            ("2️⃣ استخراج أرصدة البنوك (6000)", "#8b5cf6", self._step_extract_banks),
            ("3️⃣ استخراج أرصدة المطاعم (2000)", "#f59e0b", self._step_extract_restaurants),
            ("4️⃣ إرسال البيانات إلى Firestore", "#10b981", self._step_send_to_firestore),
        ]

        for text, color, cmd in buttons:
            tk.Button(
                btn_frame, text=text,
                font=("Segoe UI", 11, "bold"), bg=color, fg="white",
                activebackground=color, relief="flat", pady=6,
                command=lambda c=cmd: self._run_async(c)
            ).pack(fill="x", pady=2)

        # Status Labels
        status_frame = tk.Frame(self.root, bg="#0f172a")
        status_frame.pack(fill="x", padx=15)

        self.bank_status = tk.StringVar(value="البنوك: —")
        self.rest_status = tk.StringVar(value="المطاعم: —")
        self.fb_status = tk.StringVar(value="Firebase: غير متصل")

        for var, color in [(self.fb_status, "#f97316"), (self.bank_status, "#a78bfa"), (self.rest_status, "#fbbf24")]:
            tk.Label(
                status_frame, textvariable=var,
                font=("Segoe UI", 9, "bold"), fg=color, bg="#0f172a", anchor="e"
            ).pack(fill="x")

        # Log Area
        log_frame = tk.LabelFrame(
            self.root, text="📋 سجل العمليات",
            font=("Segoe UI", 10, "bold"), fg="#e2e8f0", bg="#1e293b",
            labelanchor="ne", padx=5, pady=5
        )
        log_frame.pack(fill="both", expand=True, padx=15, pady=(5, 15))

        self.log_text = scrolledtext.ScrolledText(
            log_frame, font=("Consolas", 9), bg="#0f172a", fg="#cbd5e1",
            insertbackground="#38bdf8", relief="flat", wrap="word",
            state="disabled"
        )
        self.log_text.pack(fill="both", expand=True)

    # ============================================================
    # Utility Methods
    # ============================================================
    def _log(self, msg: str):
        """Thread-safe logging to the text area."""
        timestamp = datetime.now().strftime("%H:%M:%S")

        def _update():
            self.log_text.configure(state="normal")
            self.log_text.insert("end", f"[{timestamp}] {msg}\n")
            self.log_text.see("end")
            self.log_text.configure(state="disabled")

        self.root.after(0, _update)

    def _run_async(self, func):
        """Run a function in a background thread."""
        thread = threading.Thread(target=func, daemon=True)
        thread.start()

    def _pick_sa_file(self):
        """Open file dialog to pick Firebase Service Account JSON."""
        path = filedialog.askopenfilename(
            title="اختر ملف Service Account JSON",
            filetypes=[("JSON Files", "*.json")],
            initialdir=os.path.dirname(os.path.abspath(__file__))
        )
        if path:
            self.sa_path_var.set(path)
            self._log(f"📂 تم اختيار ملف SA: {os.path.basename(path)}")

    def _parse_number(self, text: str) -> float:
        """Convert Arabic/English number string to float."""
        if not text or text.strip() in ("-", "—", ""):
            return 0.0
        # Remove commas and spaces
        cleaned = text.strip().replace(",", "").replace("٬", "").replace(" ", "")
        
        # Check for negative signs
        is_negative = False
        if cleaned.startswith("(") and cleaned.endswith(")"):
            is_negative = True
            cleaned = cleaned[1:-1]
        elif cleaned.endswith("-"):
            is_negative = True
            cleaned = cleaned[:-1]
        elif cleaned.startswith("-"):
            is_negative = True
            cleaned = cleaned[1:]
            
        try:
            val = float(cleaned)
            return -val if is_negative else val
        except ValueError:
            return 0.0

    # ============================================================
    # Firebase Connection
    # ============================================================
    def _connect_firebase(self):
        """Initialize Firebase Admin SDK."""
        sa_path = self.sa_path_var.get().strip()
        if not sa_path:
            # Try default path
            sa_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "firebase-service-account.json")
            if not os.path.exists(sa_path):
                self._log("❌ لم يتم تحديد ملف Service Account!")
                messagebox.showerror("خطأ", "يرجى اختيار ملف Service Account JSON أو وضعه في نفس المجلد بإسم firebase-service-account.json")
                return

        try:
            if not firebase_admin._apps:
                cred = credentials.Certificate(sa_path)
                firebase_admin.initialize_app(cred, {"projectId": FIREBASE_PROJECT_ID})

            self.db = firestore.client()
            self.fb_status.set("Firebase: ✅ متصل")
            self._log(f"✅ تم الاتصال بـ Firebase ({FIREBASE_PROJECT_ID})")
            self._log(f"📁 المسار: {ROOT_COLLECTION}/{DATA_PATH}/")
        except Exception as e:
            self._log(f"❌ فشل الاتصال بـ Firebase: {e}")
            messagebox.showerror("خطأ Firebase", str(e))

    # ============================================================
    # Step 1: Open Browser & Login (Multi-strategy)
    # ============================================================
    def _step_login(self):
        """Open browser and navigate to login page. Tries multiple strategies."""
        self._log("🌐 جاري البحث عن متصفح متاح...")

        # Strategy 1: Chrome with Selenium's built-in auto-detection
        if self._try_chrome_auto():
            return

        # Strategy 2: Chrome with webdriver-manager
        if self._try_chrome_wdm():
            return

        # Strategy 3: Chrome with explicit binary path
        if self._try_chrome_explicit():
            return

        # Strategy 4: Microsoft Edge fallback
        if self._try_edge():
            return

        self._log("❌ فشل فتح أي متصفح! تأكد من تثبيت Chrome أو Edge")
        messagebox.showerror("خطأ", "لم يتم العثور على متصفح متوافق.\nيرجى تثبيت Google Chrome أو Microsoft Edge.")

    def _configure_after_open(self):
        """Common setup after browser opens successfully."""
        try:
            self.driver.execute_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )
        except Exception:
            pass
        self.driver.get(LOGIN_URL)
        self._log("🔑 تم فتح صفحة تسجيل الدخول")
        self._log("⚠️ سجل الدخول يدوياً (قد يظهر CAPTCHA)")
        self._log("   بعد تسجيل الدخول بنجاح ← اضغط الزر التالي")

    def _try_chrome_auto(self) -> bool:
        """Strategy 1: Let Selenium auto-detect Chrome + ChromeDriver."""
        self._log("🔍 محاولة 1: Chrome (اكتشاف تلقائي)...")
        try:
            options = ChromeOptions()
            options.add_argument("--start-maximized")
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option("useAutomationExtension", False)

            self.driver = webdriver.Chrome(options=options)
            self._log("✅ تم فتح Chrome (اكتشاف تلقائي)")
            self._configure_after_open()
            return True
        except Exception as e:
            self._log(f"   ⚠️ فشل: {str(e)[:100]}")
            return False

    def _try_chrome_wdm(self) -> bool:
        """Strategy 2: Chrome with webdriver-manager to download correct driver."""
        if not WDM_AVAILABLE:
            return False
        self._log("🔍 محاولة 2: Chrome (webdriver-manager)...")
        try:
            options = ChromeOptions()
            options.add_argument("--start-maximized")
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option("useAutomationExtension", False)

            service = ChromeService(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=options)
            self._log("✅ تم فتح Chrome (webdriver-manager)")
            self._configure_after_open()
            return True
        except Exception as e:
            self._log(f"   ⚠️ فشل: {str(e)[:100]}")
            return False

    def _try_chrome_explicit(self) -> bool:
        """Strategy 3: Chrome with explicit binary path."""
        self._log("🔍 محاولة 3: Chrome (مسار يدوي)...")
        chrome_path = None
        for path in CHROME_PATHS:
            if os.path.exists(path):
                chrome_path = path
                break

        if not chrome_path:
            self._log("   ⚠️ لم يتم العثور على Chrome في المسارات المعروفة")
            return False

        try:
            self._log(f"   📂 وجد Chrome: {chrome_path}")
            options = ChromeOptions()
            options.binary_location = chrome_path
            options.add_argument("--start-maximized")
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option("useAutomationExtension", False)

            self.driver = webdriver.Chrome(options=options)
            self._log("✅ تم فتح Chrome (مسار يدوي)")
            self._configure_after_open()
            return True
        except Exception as e:
            self._log(f"   ⚠️ فشل: {str(e)[:100]}")
            return False

    def _try_edge(self) -> bool:
        """Strategy 4: Microsoft Edge as fallback."""
        if not EDGE_AVAILABLE:
            return False
        self._log("🔍 محاولة 4: Microsoft Edge (بديل)...")
        try:
            options = EdgeOptions()
            options.add_argument("--start-maximized")
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option("useAutomationExtension", False)

            self.driver = webdriver.Edge(options=options)
            self._log("✅ تم فتح Microsoft Edge كبديل")
            self._configure_after_open()
            return True
        except Exception as e:
            self._log(f"   ⚠️ فشل Edge: {str(e)[:100]}")
            return False

    # ============================================================
    # Step 2: Extract Bank Balances (account=6000)
    # ============================================================
    def _step_extract_banks(self):
        """Navigate to bank report and extract data."""
        if not self.driver:
            self._log("❌ Chrome غير مفتوح! اضغط الزر الأول أولاً")
            return

        from_date = self.from_date_var.get().strip()
        to_date = self.to_date_var.get().strip()
        url = BANK_REPORT_URL.format(from_date=from_date, to_date=to_date)

        self._log(f"🏦 جاري فتح تقرير البنوك...")
        self._log(f"   من: {from_date}  →  إلى: {to_date}")

        try:
            self.driver.get(url)
            self.bank_data = self._extract_table_data("bank")
            count = len(self.bank_data)
            self.bank_status.set(f"البنوك: ✅ {count} حساب")
            self._log(f"✅ تم استخراج {count} حساب بنكي")

            # Log first few items
            for item in self.bank_data[:5]:
                self._log(f"   📊 {item['accountNumber']} | {item['accountName']} | مدين: {item['debit']:,.0f} | دائن: {item['credit']:,.0f}")
            if count > 5:
                self._log(f"   ... و {count - 5} حساب آخر")

        except Exception as e:
            self._log(f"❌ فشل استخراج البنوك: {e}")

    # ============================================================
    # Step 3: Extract Restaurant Balances (account=2000)
    # ============================================================
    def _step_extract_restaurants(self):
        """Navigate to restaurant report and extract data."""
        if not self.driver:
            self._log("❌ Chrome غير مفتوح! اضغط الزر الأول أولاً")
            return

        from_date = self.from_date_var.get().strip()
        to_date = self.to_date_var.get().strip()
        url = RESTAURANT_REPORT_URL.format(from_date=from_date, to_date=to_date)

        self._log(f"🍽️ جاري فتح تقرير المطاعم...")
        self._log(f"   من: {from_date}  →  إلى: {to_date}")

        try:
            self.driver.get(url)
            self.restaurant_data = self._extract_table_data("restaurant")
            count = len(self.restaurant_data)
            self.rest_status.set(f"المطاعم: ✅ {count} مطعم")
            self._log(f"✅ تم استخراج {count} حساب مطعم")

            for item in self.restaurant_data[:5]:
                self._log(f"   📊 {item['accountNumber']} | {item['accountName']} | مدين: {item['debit']:,.0f}")
            if count > 5:
                self._log(f"   ... و {count - 5} مطعم آخر")

        except Exception as e:
            self._log(f"❌ فشل استخراج المطاعم: {e}")

    # ============================================================
    # Core: Extract Table Data from Page
    # ============================================================
    def _extract_table_data(self, data_type: str) -> list:
        """
        Wait for the report table to load, then extract rows.
        
        Expected table columns (may vary, we use index-based extraction):
        0: # (رقم)
        1: اسم الحساب
        2: رقم الحساب
        3: القائمة المالية (skip)
        4: رئيسي1 (skip)
        5: رئيسي2 (skip)
        6: الفرع
        7: رئيسي4 (skip)
        8: عملة الحساب (skip)
        9: العملة
        10: مركز التكلفة (skip)
        11: مدين
        12: دائن
        13: الرصيد
        """
        self._log("⏳ انتظار تحميل الجدول (30 ثانية كحد أقصى)...")

        # Wait for table to appear
        wait = WebDriverWait(self.driver, 30)
        try:
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "table tbody tr")))
        except Exception:
            self._log("⏳ الجدول لم يظهر بعد. محاولة الانتظار أكثر...")
            time.sleep(5)

        # Additional wait for dynamic data load
        time.sleep(3)

        rows = self.driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
        self._log(f"📋 تم العثور على {len(rows)} صف في الجدول")

        data = []
        for row in rows:
            try:
                cells = row.find_elements(By.TAG_NAME, "td")
                if len(cells) < 13:
                    continue  # Skip incomplete rows (headers, footers, etc.)

                account_name = cells[1].text.strip()
                account_number = cells[2].text.strip()
                branch = cells[6].text.strip() if len(cells) > 6 else ""
                currency = cells[9].text.strip() if len(cells) > 9 else ""
                debit = self._parse_number(cells[11].text if len(cells) > 11 else "0")
                credit = self._parse_number(cells[12].text if len(cells) > 12 else "0")
                extracted_bal = self._parse_number(cells[13].text if len(cells) > 13 else "0")

                # Calculate operational magnitude and correct sign based on type
                base_balance = abs(extracted_bal) if len(cells) > 13 else abs(debit + credit)

                if data_type == 'restaurant':
                    # For restaurants (Creditors): positive means we owe them (Payable)
                    balance = -base_balance if debit > credit else base_balance
                else:
                    # For banks (Debtors/Assets): positive means they have our money
                    balance = -base_balance if credit > debit else base_balance

                # Skip empty rows, total rows, or header-like rows
                if not account_number or account_number in ("#", "رقم الحساب", ""):
                    continue
                if "إجمالي" in account_name or "الإجمالي" in account_name:
                    continue

                item = {
                    "accountNumber": account_number,
                    "accountName": account_name,
                    "branch": branch,
                    "currency": currency,
                    "debit": debit,
                    "credit": credit,
                    "balance": balance,
                    "type": data_type,
                    "lastUpdated": datetime.now().isoformat()
                }
                data.append(item)

            except Exception as e:
                # Skip problematic rows silently
                continue

        return data

    # ============================================================
    # Step 4: Send Data to Firestore
    # ============================================================
    def _step_send_to_firestore(self):
        """Upload all extracted data to Firestore."""
        if not self.db:
            self._log("❌ Firebase غير متصل! اضغط زر الاتصال أولاً")
            messagebox.showerror("خطأ", "يرجى الاتصال بـ Firebase أولاً")
            return

        total = len(self.bank_data) + len(self.restaurant_data)
        if total == 0:
            self._log("⚠️ لا توجد بيانات لإرسالها! استخرج البيانات أولاً")
            messagebox.showwarning("تنبيه", "لا توجد بيانات لإرسالها")
            return

        self._log(f"🚀 جاري إرسال {total} حساب إلى Firestore...")

        try:
            batch = self.db.batch()
            count = 0

            # Write bank balances
            for item in self.bank_data:
                doc_id = f"bank_{item['accountNumber']}_{item['currency']}".replace("/", "_").replace(" ", "_")
                doc_ref = self.db.collection(ROOT_COLLECTION).document(DATA_PATH).collection("system_balances").document(doc_id)
                batch.set(doc_ref, item)
                count += 1

                # Firestore batch limit is 500
                if count % 400 == 0:
                    batch.commit()
                    self._log(f"   ✅ تم إرسال {count} حساب...")
                    batch = self.db.batch()

            # Write restaurant balances
            for item in self.restaurant_data:
                doc_id = f"rest_{item['accountNumber']}_{item['currency']}".replace("/", "_").replace(" ", "_")
                doc_ref = self.db.collection(ROOT_COLLECTION).document(DATA_PATH).collection("system_balances").document(doc_id)
                batch.set(doc_ref, item)
                count += 1

                if count % 400 == 0:
                    batch.commit()
                    self._log(f"   ✅ تم إرسال {count} حساب...")
                    batch = self.db.batch()

            # Update sync metadata
            sync_ref = self.db.collection(ROOT_COLLECTION).document(DATA_PATH).collection("sync_metadata").document("tawseel_sync")
            batch.set(sync_ref, {
                "lastSync": datetime.now().isoformat(),
                "status": "success",
                "bankCount": len(self.bank_data),
                "restaurantCount": len(self.restaurant_data),
                "totalCount": total,
                "fromDate": self.from_date_var.get().strip(),
                "toDate": self.to_date_var.get().strip()
            })

            # Final commit
            batch.commit()

            self._log(f"✅ تم إرسال جميع البيانات بنجاح! ({count} حساب)")
            self._log(f"   🏦 بنوك: {len(self.bank_data)}")
            self._log(f"   🍽️ مطاعم: {len(self.restaurant_data)}")
            self.fb_status.set(f"Firebase: ✅ تم الإرسال ({count})")

            messagebox.showinfo("نجاح ✅", f"تم إرسال {count} حساب إلى Firestore بنجاح!")

        except Exception as e:
            self._log(f"❌ فشل الإرسال: {e}")
            messagebox.showerror("خطأ", f"فشل إرسال البيانات:\n{e}")

    # ============================================================
    # Cleanup
    # ============================================================
    def on_close(self):
        """Clean up resources on window close."""
        if self.driver:
            try:
                self.driver.quit()
            except Exception:
                pass
        self.root.destroy()


# ============================================================
# Main Entry Point
# ============================================================
if __name__ == "__main__":
    root = tk.Tk()
    app = TawseelScraper(root)
    root.protocol("WM_DELETE_WINDOW", app.on_close)
    root.mainloop()
