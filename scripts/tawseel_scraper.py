"""
سكربت استخراج أرصدة النظام الأساسي (tawseel.app) V2 - النسخة المؤتمتة
===================================================================
يقوم بفتح Chrome عبر Selenium، والدخول لنظام tawseel.app
لاستخراج أرصدة: البنوك، المطاعم، الموظفين، والموصلين.
يدعم وضع "الخدمة" (Background Service) للاستجابة للأوامر من الموقع تلقائياً.
"""

import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, filedialog
import threading
import json
import os
import time
import calendar
import base64
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
ROOT_COLLECTION = "app"
DATA_PATH = "v1_data"

REPORT_URL_TEMPLATE = (
    "https://tawseel.app/admin/accounting/report/monthly"
    "?branch%5B%5D=tenant.*&accounting_types=0&financial_statement=0"
    "&currency=-1&clause=-1&entry_type=-1"
    "&fromdate={from_date}&todate={to_date}"
    "&account={account}&all_branch=0&cost_center=-1"
)

STATEMENT_URL_TEMPLATE = (
    "https://tawseel.app/admin/accounting/statement/market"
    "?fromdata={start_date}&todate={end_date}"
    "&posting=-1&entry_type=-1&report=0&pamount=1&market={market_id}"
)

LOGIN_URL = "https://tawseel.app/login"

class TawseelScraper:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Tawseel Automation V2 - نظام الأتمتة الشامل")
        self.root.geometry("900x800")
        self.root.configure(bg="#0f172a")

        self.driver = None
        self.db = None
        self.is_service_running = False
        self.listener = None
        self.last_handled_trigger = None
        self.headless_var = tk.BooleanVar(value=True) # Run hidden by default
        
        # Scraped Data
        self.data_store = {
            "bank": [],        # 6000
            "restaurant": [],  # 2000
            "driver": [],      # 3000
            "employee": []     # 25000
        }

        self._apply_styles()
        self._build_ui()

    def _apply_styles(self):
        style = ttk.Style()
        style.theme_use('default')
        style.configure("TNotebook", background="#0f172a", borderwidth=0)
        style.configure("TNotebook.Tab", background="#1e293b", foreground="#cbd5e1", padding=[15, 8], font=("Segoe UI", 10, "bold"))
        style.map("TNotebook.Tab", background=[("selected", "#38bdf8")], foreground=[("selected", "white")])
        style.configure("TFrame", background="#0f172a")
        style.configure("Header.TLabel", background="#0f172a", foreground="#38bdf8", font=("Segoe UI", 16, "bold"))

    # ============================================================
    # UI Construction
    # ============================================================
    def _build_ui(self):
        header = ttk.Label(self.root, text="🔄 مستخرج بيانات توصيل المتكامل (Scraper V2)", style="Header.TLabel", justify="center")
        header.pack(pady=15)

        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill="both", expand=True, padx=15, pady=5)

        # Tabs
        self.tab_automation = ttk.Frame(self.notebook) # New Primary Tab
        self.tab_settings = ttk.Frame(self.notebook)
        self.tab_restaurants = ttk.Frame(self.notebook)
        self.tab_banks = ttk.Frame(self.notebook)
        self.tab_staff = ttk.Frame(self.notebook)
        self.tab_sync = ttk.Frame(self.notebook)

        self.notebook.add(self.tab_automation, text="🤖 الأتمتة المباشرة")
        self.notebook.add(self.tab_settings, text="⚙️ الإعدادات")
        self.notebook.add(self.tab_restaurants, text="🍽️ المطاعم")
        self.notebook.add(self.tab_banks, text="🏦 البنوك")
        self.notebook.add(self.tab_staff, text="👥 الموظفين")
        self.notebook.add(self.tab_sync, text="☁️ المزامنة")

        self._build_automation_tab()
        self._build_settings_tab()
        self._build_restaurants_tab()
        self._build_banks_tab()
        self._build_staff_tab()
        self._build_sync_tab()

        # Shared Log Area at the bottom
        log_frame = tk.LabelFrame(
            self.root, text="📋 سجل العمليات",
            font=("Segoe UI", 10, "bold"), fg="#e2e8f0", bg="#1e293b",
            labelanchor="ne", padx=5, pady=5
        )
        log_frame.pack(fill="both", expand=False, padx=15, pady=10, side="bottom")

        self.log_text = scrolledtext.ScrolledText(
            log_frame, font=("Consolas", 9), bg="#050505", fg="#10b981",
            insertbackground="white", relief="flat", wrap="word", height=12, state="disabled"
        )
        self.log_text.pack(fill="both", expand=True)

    def _create_action_btn(self, parent, text, color, command):
        return tk.Button(
            parent, text=text, font=("Segoe UI", 10, "bold"), bg=color, fg="white",
            activebackground=color, relief="flat", pady=8, cursor="hand2",
            command=lambda: self._run_async(command)
        )

    def _build_automation_tab(self):
        frame = self.tab_automation
        
        status_frame = tk.LabelFrame(
            frame, text="📡 حالة خدمة الأتمتة (Background Service)",
            font=("Segoe UI", 10, "bold"), fg="#e2e8f0", bg="#1e293b", labelanchor="ne", padx=15, pady=20
        )
        status_frame.pack(fill="x", padx=20, pady=20)
        
        self.service_status_label = tk.Label(status_frame, text="الخدمة: 🔴 متوقفة", font=("Segoe UI", 12, "bold"), fg="#ef4444", bg="#1e293b")
        self.service_status_label.pack(pady=10)
        
        tk.Checkbutton(status_frame, text="تشغيل المتصفح في الخلفية (Headless Mode)", variable=self.headless_var, 
                       bg="#1e293b", fg="white", selectcolor="#0f172a", activebackground="#1e293b", activeforeground="white").pack(pady=5)

        self.btn_toggle_service = tk.Button(
            status_frame, text="✅ تشغيل خدمة الاستماع للطلبات", 
            font=("Segoe UI", 11, "bold"), bg="#10b981", fg="white", relief="flat", pady=10, cursor="hand2",
            command=self._toggle_service
        )
        self.btn_toggle_service.pack(fill="x", pady=10)
        
        info = tk.Label(frame, text="عند تشغيل الخدمة، سيقوم هذا البرنامج بمراقبة الموقع تلقائياً.\nبمجرد ضغطك على 'سحب فوري' من الموقع، سيبدأ السحب فوراً.", 
                        fg="#94a3b8", bg="#0f172a", font=("Segoe UI", 10), justify="center")
        info.pack(pady=10)
        
        # Dashboard like stats
        stats_frame = tk.Frame(frame, bg="#0f172a")
        stats_frame.pack(fill="x", padx=20, pady=10)
        
        self.last_run_label = tk.Label(stats_frame, text="آخر سحب: لا يوجد", fg="#cbd5e1", bg="#0f172a", font=("Segoe UI", 9))
        self.last_run_label.pack(side="right")

    def _build_settings_tab(self):
        frame = self.tab_settings
        
        # Date Range Settings
        date_frame = tk.LabelFrame(
            frame, text="📅 الفترة المالية الأساسية",
            font=("Segoe UI", 10, "bold"), fg="#e2e8f0", bg="#1e293b", labelanchor="ne", padx=15, pady=10
        )
        date_frame.pack(fill="x", padx=20, pady=10)
        
        dates_inner = tk.Frame(date_frame, bg="#1e293b")
        dates_inner.pack(fill="x")
        
        self.from_date_var = tk.StringVar(value=f"{datetime.now().year}-01-01")
        tk.Entry(dates_inner, textvariable=self.from_date_var, font=("Consolas", 10), width=15).pack(side="right", padx=5)
        tk.Label(dates_inner, text="من:", fg="white", bg="#1e293b").pack(side="right")
        
        self.to_date_var = tk.StringVar(value=datetime.now().strftime("%Y-%m-%d"))
        tk.Entry(dates_inner, textvariable=self.to_date_var, font=("Consolas", 10), width=15).pack(side="right", padx=(20, 5))
        tk.Label(dates_inner, text="إلى:", fg="white", bg="#1e293b").pack(side="right")

        # Firebase Settings
        fb_frame = tk.LabelFrame(
            frame, text="🔑 إعدادات Firebase",
            font=("Segoe UI", 10, "bold"), fg="#e2e8f0", bg="#1e293b", labelanchor="ne", padx=15, pady=10
        )
        fb_frame.pack(fill="x", padx=20, pady=5)
        
        self.sa_path_var = tk.StringVar()
        # Auto-detect service account
        default_sa = os.path.join(os.path.dirname(__file__), "firebase-service-account.json")
        if os.path.exists(default_sa): self.sa_path_var.set(default_sa)
        
        sa_inner = tk.Frame(fb_frame, bg="#1e293b")
        sa_inner.pack(fill="x", pady=5)
        tk.Entry(sa_inner, textvariable=self.sa_path_var, font=("Consolas", 9), width=50).pack(side="right", padx=10)
        tk.Button(sa_inner, text="الملف 📂", command=self._pick_sa_file, bg="#475569", fg="white").pack(side="right")
        self._create_action_btn(fb_frame, "اتصال بمسار Firebase", "#059669", self._connect_firebase).pack(fill="x", pady=5)

        # Login action
        self._create_action_btn(frame, "🌐 فتح المتصفح لتسجيل الدخول يدوياً (اختياري)", "#2563eb", self._step_login).pack(fill="x", padx=20, pady=10)

    def _build_restaurants_tab(self):
        frame = self.tab_restaurants
        self._create_action_btn(frame, "🔽 سحب بيانات المطاعم (2000)", "#f59e0b", lambda: self._step_extract_data("2000", "restaurant")).pack(fill="x", padx=20, pady=10)
        self.rest_status = tk.Label(frame, text="المطاعم المسحوبة: 0", font=("Segoe UI", 11, "bold"), fg="#fcd34d", bg="#0f172a")
        self.rest_status.pack(pady=10)

    def _build_banks_tab(self):
        frame = self.tab_banks
        self._create_action_btn(frame, "🏦 سحب بيانات البنوك (6000)", "#8b5cf6", lambda: self._step_extract_data("6000", "bank")).pack(fill="x", padx=20, pady=10)
        self.bank_status = tk.Label(frame, text="البنوك المسحوبة: 0", font=("Segoe UI", 11, "bold"), fg="#c4b5fd", bg="#0f172a")
        self.bank_status.pack(pady=10)

    def _build_staff_tab(self):
        frame = self.tab_staff
        self._create_action_btn(frame, "👥 سحب أرصدة الموظفين (25000)", "#0891b2", lambda: self._step_extract_data("25000", "employee")).pack(fill="x", padx=20, pady=5)
        self.emp_status = tk.Label(frame, text="الموظفين: 0", font=("Segoe UI", 11, "bold"), fg="#67e8f9", bg="#0f172a")
        self.emp_status.pack(pady=5)
        self._create_action_btn(frame, "🛵 سحب أرصدة الموصلين (3000)", "#4f46e5", lambda: self._step_extract_data("3000", "driver")).pack(fill="x", padx=20, pady=5)
        self.drv_status = tk.Label(frame, text="الموصلين: 0", font=("Segoe UI", 11, "bold"), fg="#a5b4fc", bg="#0f172a")
        self.drv_status.pack(pady=5)

    def _build_sync_tab(self):
        frame = self.tab_sync
        self._create_action_btn(frame, "🚀 مزامنة كافة البيانات إلى Firestore", "#10b981", self._step_send_to_firestore).pack(fill="x", padx=20, pady=10)
        self.fb_status = tk.Label(frame, text="حالة الرفع: بانتظار أمرك", font=("Segoe UI", 11), fg="#6ee7b7", bg="#0f172a")
        self.fb_status.pack(pady=10)

    # ============================================================
    # Automation Service Logic
    # ============================================================
    def _toggle_service(self):
        if self.is_service_running:
            self._log("🛑 جاري إيقاف الخدمة...")
            self.is_service_running = False
            if self.listener: 
                try: self.listener.unsubscribe()
                except: pass
            self.service_status_label.config(text="الخدمة: 🔴 متوقفة", fg="#ef4444")
            self.btn_toggle_service.config(text="✅ تشغيل خدمة الاستماع للطلبات", bg="#10b981")
        else:
            if not self.db: self._connect_firebase()
            if not self.db: 
                messagebox.showerror("خطأ", "يجب الاتصال بـ Firebase أولاً!")
                return
                
            self._log("📡 تم بدء خدمة الاستماع للطلبات من الموقع...")
            self.is_service_running = True
            self.service_status_label.config(text="الخدمة: 🟢 تعمل وبانتظار طلبات الموقع", fg="#10b981")
            self.btn_toggle_service.config(text="🛑 إيقاف خدمة الاستماع", bg="#ef4444")
            
            # Start listener in a background thread
            doc_ref = self.db.collection(ROOT_COLLECTION).document(DATA_PATH).collection("settings").document("automation_config")
            self.listener = doc_ref.on_snapshot(self._on_firestore_change)

    def _on_firestore_change(self, doc_snapshot, changes, read_time):
        if not self.is_service_running: return
        
        for doc in doc_snapshot:
            data = doc.to_dict()
            if not data: continue
            
            trigger = data.get("forceRunTrigger")
            status = data.get("workerStatus")
            
            # If there's a new trigger we haven't handled yet
            if trigger and trigger != self.last_handled_trigger and status != "done":
                self._log(f"🔔 تم رصد طلب سحب جديد من الموقع! (ID: {trigger[:8]})")
                self.last_handled_trigger = trigger
                # Update status to running immediately
                doc.reference.update({"workerStatus": "running", "statusMessage": "جاري التحميل..."})
                # Run the actual work in a separate thread so listener stays active
                self._run_async(lambda: self._automated_full_run(trigger))

    def _automated_full_run(self, trigger_id):
        try:
            self._log("🤖 بدء التشغيل الآلي الشامل...")
            self._update_remote_status("running", "جاري فتح المتصفح والدخول...")
            
            # 1. Login (Headless or not)
            success = self._step_login(automated=True)
            if not success: raise Exception("فشل فتح المتصفح أو الدخول")
            
            # 2. Extract Each Category
            categories = [
                ("6000", "البنوك", "bank"),
                ("2000", "المطاعم", "restaurant"),
                ("3000", "الموصلين", "driver"),
                ("25000", "الموظفين", "employee")
            ]
            
            for code, name, key in categories:
                self._update_remote_status("running", f"جاري استخراج {name}...")
                self._log(f"🔄 جاري سحب {name}...")
                self._step_extract_data(code, key)
                time.sleep(2)
            
            # 3. Sync to Firestore
            self._update_remote_status("running", "جاري رفع البيانات إلى Firestore...")
            self._log("🚀 جاري مزامنة النتائج...")
            self._step_send_to_firestore()
            
            # 4. Final Success Update
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self._update_remote_status("done", "اكتمل بنجاح", {
                "lastRun": datetime.now().isoformat(),
                "lastSuccess": datetime.now().isoformat(),
                "errorMessage": ""
            })
            self.last_run_label.config(text=f"آخر سحب: {now_str}")
            self._log("✨ انتهى التشغيل الآلي الشامل بنجاح.")
            
            # Close driver if headless
            if self.headless_var.get() and self.driver:
                self.driver.quit()
                self.driver = None
                
        except Exception as e:
            self._log(f"⚠️ فشل التشغيل الآلي: {e}")
            self._update_remote_status("error", f"خطأ: {str(e)}", {"errorMessage": str(e)})

    def _update_remote_status(self, status, message, extra=None):
        if not self.db: return
        payload = {"workerStatus": status, "statusMessage": message}
        if extra: payload.update(extra)
        
        doc_ref = self.db.collection(ROOT_COLLECTION).document(DATA_PATH).collection("settings").document("automation_config")
        doc_ref.update(payload)

    # ============================================================
    # Utilities
    # ============================================================
    def _log(self, msg: str):
        timestamp = datetime.now().strftime("%H:%M:%S")
        def _update():
            self.log_text.configure(state="normal")
            self.log_text.insert("end", f"[{timestamp}] {msg}\n")
            self.log_text.see("end")
            self.log_text.configure(state="disabled")
        self.root.after(0, _update)

    def _run_async(self, func):
        threading.Thread(target=func, daemon=True).start()

    def _pick_sa_file(self):
        path = filedialog.askopenfilename(title="اختر ملف حساب الخدمة", filetypes=[("JSON Files", "*.json")])
        if path:
            self.sa_path_var.set(path)

    def _parse_number(self, text: str) -> float:
        if not text or text.strip() in ("-", "—", ""): return 0.0
        cleaned = text.strip().replace(",", "").replace("٬", "").replace(" ", "")
        is_negative = False
        if cleaned.startswith("(") and cleaned.endswith(")"):
            is_negative, cleaned = True, cleaned[1:-1]
        elif cleaned.endswith("-"):
            is_negative, cleaned = True, cleaned[:-1]
        elif cleaned.startswith("-"):
            is_negative, cleaned = True, cleaned[1:]
        try:
            val = float(cleaned)
            return -val if is_negative else val
        except ValueError:
            return 0.0

    def _get_statement_dates(self):
        today = datetime.now()
        if today.day <= 15:
            year, month = today.year, today.month - 1
            if month == 0: year, month = year - 1, 12
            start_date = f"{year}-{month:02d}-16"
            last_day = calendar.monthrange(year, month)[1]
            end_date = f"{year}-{month:02d}-{last_day}"
        else:
            start_date = f"{today.year}-{today.month:02d}-01"
            end_date = f"{today.year}-{today.month:02d}-15"
        return start_date, end_date

    # ============================================================
    # Firebase
    # ============================================================
    def _connect_firebase(self):
        sa_path = self.sa_path_var.get().strip()
        try:
            if not firebase_admin._apps:
                firebase_admin.initialize_app(credentials.Certificate(sa_path), {"projectId": FIREBASE_PROJECT_ID})
            self.db = firestore.client()
            self._log(f"✅ متصل بـ Firebase: {FIREBASE_PROJECT_ID}")
            self.fb_status.config(text="Firebase: متصل")
        except Exception as e:
            self._log(f"❌ خطأ Firebase: {e}")

    # ============================================================
    # Browser
    # ============================================================
    def _step_login(self, automated=False):
        options = ChromeOptions()
        if automated and self.headless_var.get():
            options.add_argument("--headless")
            options.add_argument("--disable-gpu")
            options.add_argument("--window-size=1920,1080")
            
        options.add_argument("--start-maximized")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        
        try:
            if WDM_AVAILABLE:
                service = ChromeService(ChromeDriverManager().install())
                self.driver = webdriver.Chrome(service=service, options=options)
            else:
                self.driver = webdriver.Chrome(options=options)
                
            self.driver.get(LOGIN_URL)
            
            if automated:
                try:
                    WebDriverWait(self.driver, 15).until(EC.presence_of_element_located((By.CSS_SELECTOR, "nav")))
                    return True
                except:
                    self._log("⚠️ يتطلب تسجيل دخول يدوي")
                    return not self.headless_var.get()
            return True
        except Exception as e:
            self._log(f"❌ خطأ متصفح: {e}")
            return False

    # ============================================================
    # Data Extraction Core
    # ============================================================
    def _step_extract_data(self, account_code: str, type_name: str):
        if not self.driver: return
        
        url = REPORT_URL_TEMPLATE.format(
            from_date=self.from_date_var.get().strip(), 
            to_date=self.to_date_var.get().strip(), 
            account=account_code
        )
        
        labels = {
            "bank": ("البنوك", self.bank_status),
            "restaurant": ("المطاعم", self.rest_status),
            "driver": ("الموصلين", self.drv_status),
            "employee": ("الموظفين", self.emp_status)
        }
        ar_name, label = labels[type_name]
        
        try:
            self.driver.get(url)
            data = self._extract_table_data(type_name)
            self.data_store[type_name] = data
            label.config(text=f"{ar_name}: {len(data)} سجل")
        except Exception as e:
            self._log(f"❌ خطأ {ar_name}: {e}")

    def _extract_table_data(self, data_type: str) -> list:
        wait = WebDriverWait(self.driver, 30)
        try: wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "table tbody tr")))
        except: pass
        time.sleep(2)

        rows = self.driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
        data = []
        for row in rows:
            try:
                cells = row.find_elements(By.TAG_NAME, "td")
                if len(cells) < 13: continue
                
                name = cells[1].text.strip()
                num = cells[2].text.strip()
                if not num or "إجمالي" in name: continue

                debit = self._parse_number(cells[11].text)
                credit = self._parse_number(cells[12].text)
                ext_bal = self._parse_number(cells[13].text if len(cells) > 13 else "0")
                base = abs(ext_bal) if len(cells) > 13 else abs(debit + credit)

                balance = base
                if data_type in ('restaurant', 'driver'):
                    balance = -base if debit > credit else base
                else: 
                    balance = -base if credit > debit else base

                data.append({
                    "accountNumber": num, "accountName": name,
                    "branch": cells[6].text.strip() if len(cells)>6 else "",
                    "debit": debit, "credit": credit, "balance": balance,
                    "type": data_type, "lastUpdated": datetime.now().isoformat()
                })
            except: pass
        return data

    def _step_send_to_firestore(self):
        if not self.db: 
            self._log("⚠️ يرجى الاتصال بـ Firebase أولاً.")
            return
            
        total = sum(len(lst) for lst in self.data_store.values())
        if total == 0: 
            self._log("⚠️ لا توجد بيانات مسحوبة لإرسالها.")
            return

        try:
            self._log(f"🚀 جاري مزامنة {total} سجل إلى Firestore...")
            batch = self.db.batch()
            count = 0
            for t_type, records in self.data_store.items():
                for item in records:
                    doc_id = f"{t_type}_{item['accountNumber']}".replace("/", "_").replace(" ","")
                    ref = self.db.collection(ROOT_COLLECTION).document(DATA_PATH).collection("system_balances").document(doc_id)
                    batch.set(ref, item)
                    count += 1
                    if count % 400 == 0:
                        batch.commit()
                        batch = self.db.batch()
            
            sync_ref = self.db.collection(ROOT_COLLECTION).document(DATA_PATH).collection("sync_metadata").document("tawseel_sync")
            batch.set(sync_ref, {
                "lastSync": datetime.now().isoformat(),
                "status": "success",
                "counts": {k: len(v) for k, v in self.data_store.items()},
                "totalCount": total,
                "fromDate": self.from_date_var.get(),
                "toDate": self.to_date_var.get()
            })
            batch.commit()
            self._log(f"✅ تم الرفع بنجاح: {count} سجل")
            self.fb_status.config(text=f"تم الرفع: {count}")
        except Exception as e:
            err_msg = str(e)
            if "invalid_grant" in err_msg or "JWT" in err_msg:
                self._log("❌ خطأ أمني: ساعة جهازك غير مضبوطة!")
                self._log("💡 الحل: اذهب لإعدادات الساعة في الويندوز واضغط على 'Sync Now' (مزامنة الآن).")
            else:
                self._log(f"❌ خطأ مزامنة: {err_msg}")
            raise e

    def on_close(self):
        self.is_service_running = False
        if self.listener: self.listener.unsubscribe()
        if self.driver:
            try: self.driver.quit()
            except: pass
        self.root.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = TawseelScraper(root)
    root.protocol("WM_DELETE_WINDOW", app.on_close)
    root.mainloop()
