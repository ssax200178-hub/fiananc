import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';

// ==========================================
// الثوابت
// ==========================================
const SESSION_DOC_PATH = 'app/v1_data/settings/tawseel_session';

// ==========================================
// الأنماط
// ==========================================
const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    maxWidth: '900px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '28px',
  },
  headerIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
  },
  title: {
    fontSize: '22px',
    fontWeight: 800,
    margin: 0,
  },
  subtitle: {
    fontSize: '13px',
    opacity: 0.6,
    margin: 0,
  },
  card: {
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  cardTitle: {
    fontSize: '15px',
    fontWeight: 700,
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '6px',
    opacity: 0.7,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(0,0,0,0.12)',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  },
  select: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(0,0,0,0.12)',
    fontSize: '14px',
    outline: 'none',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap' as const,
    marginTop: '20px',
  },
  buttonPrimary: {
    padding: '10px 24px',
    borderRadius: '10px',
    border: 'none',
    fontWeight: 700,
    fontSize: '14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s',
  },
  statusCard: {
    borderRadius: '14px',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  statusIcon: {
    width: '52px',
    height: '52px',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
  },
  logItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 0',
    borderBottom: '1px solid rgba(0,0,0,0.04)',
    fontSize: '13px',
  },
};

// ==========================================
// الأنواع
// ==========================================
interface SessionData {
  email?: string;
  encryptedPassword?: { encrypted: string; iv: string; tag: string };
  year?: string;
  sessionStatus?: 'active' | 'expired' | 'refreshing' | 'error' | 'none';
  lastRefresh?: string;
  expiresAt?: string;
  statusMessage?: string;
  lastStatusUpdate?: string;
  refreshTrigger?: string;
}

// ==========================================
// المكون الرئيسي
// ==========================================
const TawseelSessionPage: React.FC = () => {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [refreshLogs, setRefreshLogs] = useState<Array<{ time: string; status: string; message: string }>>([]);
  const [storageTarget, setStorageTarget] = useState<'firebase' | 'local' | 'both'>('both');
  const [scrapingMethod, setScrapingMethod] = useState<'worker' | 'cloud'>('worker');

  // الاستماع لتغييرات الجلسة
  useEffect(() => {
    const [collection, docPath, subCol, subDoc] = SESSION_DOC_PATH.split('/');
    const ref = doc(db, collection, docPath, subCol, subDoc);
    
    const unsub = onSnapshot(ref, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as SessionData;
        setSessionData(data);
        if (data.email) setEmail(data.email);
        if (data.year) setYear(data.year);
        
        // إضافة سجل تحديث
        if (data.lastStatusUpdate) {
          setRefreshLogs(prev => {
            const newLog = {
              time: data.lastStatusUpdate!,
              status: data.sessionStatus || 'unknown',
              message: data.statusMessage || ''
            };
            const updated = [newLog, ...prev.filter(l => l.time !== newLog.time)].slice(0, 5);
            return updated;
          });
        }
      }
    });

    // تحميل إعدادات الحفظ و طريقة السحب
    const configRef = doc(db, 'app', 'v1_data', 'settings', 'automation_config');
    getDoc(configRef).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        setStorageTarget(data.storageTarget || 'both');
        setScrapingMethod(data.scrapingMethod || 'worker');
      }
    });

    return () => unsub();
  }, []);

  // حفظ بيانات الدخول
  const handleSave = async () => {
    if (!email) {
      alert('يرجى إدخال البريد الإلكتروني');
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const [collection, docPath, subCol, subDoc] = SESSION_DOC_PATH.split('/');
      const ref = doc(db, collection, docPath, subCol, subDoc);
      
      const updateData: Record<string, any> = {
        email,
        year,
        updatedAt: new Date().toISOString(),
      };

      // كلمة المرور: نرسلها كنص عادي ويشفرها الـ Worker
      // نستخدم حقل plainPassword مؤقت، والـ Worker يشفره ويحذف هذا الحقل
      if (password) {
        updateData.plainPassword = password;
        updateData.passwordUpdatedAt = new Date().toISOString();
      }

      await setDoc(ref, updateData, { merge: true });
      
      // التحديث في الإعدادات العامة (automation_config)
      const configRef = doc(db, 'app', 'v1_data', 'settings', 'automation_config');
      await setDoc(configRef, { 
        storageTarget: storageTarget,
        scrapingMethod: scrapingMethod
      }, { merge: true });

      setSaveSuccess(true);
      setPassword(''); // مسح كلمة المرور من الذاكرة
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) {
      alert(`فشل الحفظ: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // تحديث الجلسة
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [collection, docPath, subCol, subDoc] = SESSION_DOC_PATH.split('/');
      const ref = doc(db, collection, docPath, subCol, subDoc);
      
      await setDoc(ref, {
        refreshTrigger: new Date().toISOString(),
        sessionStatus: 'refreshing',
        statusMessage: 'جاري تحديث الجلسة...',
      }, { merge: true });

      // سينتظر الـ Worker ويقوم بالتحديث
      // الحالة ستتغير عبر onSnapshot
    } catch (e: any) {
      alert(`فشل إرسال طلب التحديث: ${e.message}`);
    } finally {
      setTimeout(() => setIsRefreshing(false), 3000);
    }
  };

  // حالة الجلسة
  const getStatusInfo = () => {
    const status = sessionData?.sessionStatus || 'none';
    switch (status) {
      case 'active':
        return { color: '#10b981', bgColor: '#ecfdf5', icon: '🟢', text: 'الجلسة نشطة', darkBg: '#064e3b' };
      case 'expired':
        return { color: '#ef4444', bgColor: '#fef2f2', icon: '🔴', text: 'الجلسة منتهية', darkBg: '#7f1d1d' };
      case 'refreshing':
        return { color: '#f59e0b', bgColor: '#fffbeb', icon: '🟡', text: 'جاري التحديث...', darkBg: '#78350f' };
      case 'error':
        return { color: '#ef4444', bgColor: '#fef2f2', icon: '❌', text: 'خطأ في الجلسة', darkBg: '#7f1d1d' };
      default:
        return { color: '#6b7280', bgColor: '#f9fafb', icon: '⚪', text: 'لا توجد جلسة', darkBg: '#374151' };
    }
  };

  const statusInfo = getStatusInfo();

  const formatTimeAgo = (dateStr: string | undefined) => {
    if (!dateStr) return 'غير معروف';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'الآن';
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    return `منذ ${Math.floor(hours / 24)} يوم`;
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, i) => (currentYear - i).toString());

  return (
    <div style={styles.container} className="tawseel-session-page">
      {/* العنوان */}
      <div style={styles.header}>
        <div style={{ ...styles.headerIcon, background: 'linear-gradient(135deg, #C62828, #e53935)', color: '#fff' }}>
          🔐
        </div>
        <div>
          <h1 style={styles.title} className="dark:text-white">إدارة الجلسة</h1>
          <p style={styles.subtitle} className="dark:text-slate-400">ربط تسجيل الدخول مع موقع توصيل</p>
        </div>
      </div>

      {/* بطاقة حالة الجلسة */}
      <div 
        style={{ ...styles.statusCard, background: statusInfo.bgColor, border: `1px solid ${statusInfo.color}22` }}
        className={`dark:!bg-[${statusInfo.darkBg}] dark:!border-slate-700`}
      >
        <div style={{ ...styles.statusIcon, background: `${statusInfo.color}15` }}>
          <span style={{ fontSize: '28px' }}>{statusInfo.icon}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '16px', color: statusInfo.color }}>
            {statusInfo.text}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '4px' }} className="dark:text-slate-300">
            {sessionData?.statusMessage || 'لم يتم ربط الجلسة بعد'}
            {sessionData?.lastRefresh && (
              <span style={{ marginRight: '8px' }}>• آخر تحديث: {formatTimeAgo(sessionData.lastRefresh)}</span>
            )}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || sessionData?.sessionStatus === 'refreshing'}
          style={{
            ...styles.buttonPrimary,
            background: sessionData?.sessionStatus === 'refreshing' ? '#9ca3af' : '#C62828',
            color: '#fff',
            opacity: isRefreshing ? 0.7 : 1,
          }}
          title="تحديث الجلسة"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}>
            refresh
          </span>
          {isRefreshing ? 'جاري التحديث...' : 'تحديث الجلسة'}
        </button>
      </div>

      {/* بطاقة بيانات الدخول */}
      <div style={{ ...styles.card, background: '#fff' }} className="dark:!bg-slate-800 dark:!border-slate-700">
        <div style={styles.cardTitle} className="dark:text-white">
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#C62828' }}>person</span>
          بيانات تسجيل الدخول
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={styles.formGroup}>
            <label style={styles.label} className="dark:text-slate-400">البريد الإلكتروني</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              className="dark:!bg-slate-700 dark:!border-slate-600 dark:!text-white"
              placeholder="admin@tawseel.app"
              dir="ltr"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} className="dark:text-slate-400">كلمة المرور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              className="dark:!bg-slate-700 dark:!border-slate-600 dark:!text-white"
              placeholder={sessionData?.encryptedPassword ? '••••••• (محفوظة ومشفرة)' : 'أدخل كلمة المرور'}
              dir="ltr"
            />
            {sessionData?.encryptedPassword && (
              <span style={{ fontSize: '11px', color: '#10b981', marginTop: '4px', display: 'block' }}>
                🔒 كلمة المرور محفوظة ومشفرة - اتركها فارغة إلا إذا أردت تغييرها
              </span>
            )}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} className="dark:text-slate-400">السنة المالية</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              style={styles.select}
              className="dark:!bg-slate-700 dark:!border-slate-600 dark:!text-white"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} className="dark:text-slate-400">وجهة حفظ البيانات (Database)</label>
            <select
              value={storageTarget}
              onChange={(e) => setStorageTarget(e.target.value as any)}
              style={styles.select}
              className="dark:!bg-slate-700 dark:!border-slate-600 dark:!text-white"
            >
              <option value="firebase">قاعدة السحاب (Firebase)</option>
              <option value="local">الجهاز المحلي (Computer)</option>
              <option value="both">كلاهما (Both)</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} className="dark:text-slate-400">طريقة السحب (Scraping Method)</label>
            <select
              value={scrapingMethod}
              onChange={(e) => setScrapingMethod(e.target.value as any)}
              style={styles.select}
              className="dark:!bg-slate-700 dark:!border-slate-600 dark:!text-white"
            >
              <option value="worker">المتصفح المحلي - Worker (الطريقة المستقرة)</option>
              <option value="cloud">الربط السحابي المباشر - Cloud Proxy (تجريبي - فائق السرعة)</option>
            </select>
            {scrapingMethod === 'cloud' && (
              <span style={{ fontSize: '11px', color: '#f59e0b', marginTop: '6px', display: 'block' }}>
                ⚠️ يتم الآن استخدام النسخة السحابية. يمكنك الرجوع لـ Worker في أي وقت لضمان الأمان 100%.
              </span>
            )}
          </div>
        </div>

        <div style={styles.buttonRow}>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              ...styles.buttonPrimary,
              background: saveSuccess ? '#10b981' : '#C62828',
              color: '#fff',
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              {saveSuccess ? 'check_circle' : 'save'}
            </span>
            {isSaving ? 'جاري الحفظ...' : saveSuccess ? 'تم الحفظ ✓' : 'حفظ بيانات الدخول'}
          </button>
        </div>
      </div>

      {/* سجل التحديثات */}
      {refreshLogs.length > 0 && (
        <div style={{ ...styles.card, background: '#fff' }} className="dark:!bg-slate-800 dark:!border-slate-700">
          <div style={styles.cardTitle} className="dark:text-white">
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#6b7280' }}>history</span>
            سجل آخر التحديثات
          </div>
          
          {refreshLogs.map((log, i) => (
            <div key={i} style={styles.logItem} className="dark:!border-slate-700">
              <span style={{ 
                width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                background: log.status === 'active' ? '#10b981' : log.status === 'error' ? '#ef4444' : '#f59e0b'
              }} />
              <span style={{ flex: 1, opacity: 0.8 }} className="dark:text-slate-300">{log.message}</span>
              <span style={{ fontSize: '11px', opacity: 0.5 }} className="dark:text-slate-500">{formatTimeAgo(log.time)}</span>
            </div>
          ))}
        </div>
      )}

      {/* CSS Animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default TawseelSessionPage;
