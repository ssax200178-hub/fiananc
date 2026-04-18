import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

interface ScrapingConfig {
  pageDelay: number;
  branchDelay: number;
  typeDelay: number;
  targetBranch: string;
  maxPages: number;
  storageTarget: 'firebase' | 'local' | 'both';
}

interface Props {
  onTriggerScrape?: (type: string) => void;
  scrapingType: string;
  isCompact?: boolean; // Deprecated but kept for backward compatibility if used elsewhere
}

const ScrapingConfigPanel: React.FC<Props> = ({ onTriggerScrape, scrapingType }) => {
  const [config, setConfig] = useState<ScrapingConfig>({ 
    pageDelay: 5, 
    branchDelay: 10, 
    typeDelay: 15,
    targetBranch: 'all',
    maxPages: 0,
    storageTarget: 'both'
  });
  const [saving, setSaving] = useState(false);
  const [scrapingStatus, setScrapingStatus] = useState<string>('idle');

  // Hardcoded for now, or you could fetch from context
  const branches = ['all', 'tenant.main', 'tenant.aden', 'tenant.ibb', 'tenant.mukalla', 'tenant.taizzhw', 'tenant.marib', 'tenant.dhamar', 'tenant.taizz', 'tenant.hudaydah', 'tenant.seiyun'];
  const branchNames = {
    'all': 'جميع الفروع',
    'tenant.main': 'صنعاء',
    'tenant.aden': 'عدن',
    'tenant.ibb': 'إب',
    'tenant.mukalla': 'المكلا',
    'tenant.taizzhw': 'تعز - الحوبان',
    'tenant.marib': 'مارب',
    'tenant.dhamar': 'ذمار',
    'tenant.taizz': 'تعز - المدينة',
    'tenant.hudaydah': 'الحديدة',
    'tenant.seiyun': 'سيئون'
  };

  useEffect(() => {
    if (!db) return;
    const ref = doc(db, 'app', 'v1_data', 'settings', 'scraping_config');
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setConfig(prev => ({
          pageDelay: data.pageDelay ?? prev.pageDelay,
          branchDelay: data.branchDelay ?? prev.branchDelay,
          typeDelay: data.typeDelay ?? prev.typeDelay,
          targetBranch: data.targetBranch ?? prev.targetBranch,
          maxPages: data.maxPages ?? prev.maxPages,
          storageTarget: data.storageTarget ?? prev.storageTarget
        }));
        
        const newStatus = data.scrapingStatus || 'idle';
        setScrapingStatus(prevStatus => {
          // If status changes from running to done/error, refresh data automatically!
          if (prevStatus === 'running' && (newStatus === 'done' || newStatus === 'error' || newStatus === 'partial')) {
            if (onTriggerScrape) {
              onTriggerScrape(scrapingType); 
            }
          }
          return newStatus;
        });
      }
    }, (error) => {
      console.error('فشل الاستماع للإعدادات:', error);
    });

    return () => unsubscribe();
  }, [db, onTriggerScrape]);

  const saveConfig = async () => {
    if (!db) return;
    setSaving(true);
    try {
      const ref = doc(db, 'app', 'v1_data', 'settings', 'scraping_config');
      await setDoc(ref, {
        pageDelay: config.pageDelay,
        branchDelay: config.branchDelay,
        typeDelay: config.typeDelay,
        targetBranch: config.targetBranch,
        maxPages: config.maxPages,
        storageTarget: config.storageTarget,
        lastConfigUpdate: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.error('فشل حفظ الإعدادات:', e);
    } finally {
      setSaving(false);
    }
  };

  const triggerScrape = async () => {
    if (!db) return;
    
    // Save config first to make sure worker gets latest targeting
    await saveConfig();
    
    try {
      const ref = doc(db, 'app', 'v1_data', 'settings', 'scraping_config');
      await setDoc(ref, {
        scrapingTrigger: `scrape_${Date.now()}`,
        scrapingType: scrapingType,
        scrapingStatus: 'triggered',
        scrapingMessage: `طلب سحب ${scrapingType}...`,
        triggeredAt: new Date().toISOString()
      }, { merge: true });
      setScrapingStatus('triggered');
      onTriggerScrape?.(scrapingType);
    } catch (e) {
      console.error('فشل إطلاق السحب:', e);
    }
  };

  const statusColors: Record<string, string> = {
    idle: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    triggered: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    partial: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  };

  const statusLabels: Record<string, string> = {
    idle: 'جاهز',
    triggered: 'تم الطلب...',
    running: 'جاري السحب...',
    done: 'مكتمل ✅',
    error: 'خطأ ❌',
    partial: 'مكتمل جزئياً ⚠️',
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm w-full lg:w-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-blue-500">settings_applications</span>
          تخصيص السحب التلقائي
        </h3>
        <span className={`px-3 py-1 rounded-lg text-xs font-bold ${statusColors[scrapingStatus] || statusColors.idle}`}>
          {statusLabels[scrapingStatus] || scrapingStatus}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="col-span-2 md:col-span-2">
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">الفرع المستهدف</label>
          <select
            value={config.targetBranch}
            onChange={e => setConfig(prev => ({ ...prev, targetBranch: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          >
            {branches.map(b => (
               <option key={b} value={b}>{branchNames[b as keyof typeof branchNames] || b}</option>
            ))}
          </select>
        </div>
        
        <div className="col-span-2 md:col-span-1">
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">عدد الصفحات (0 = للكل)</label>
          <input
            type="number" min={0} max={100}
            value={config.maxPages}
            onChange={e => setConfig(prev => ({ ...prev, maxPages: Number(e.target.value) }))}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">بين الصفحات (ث)</label>
          <input
            type="number" min={1} max={60}
            value={config.pageDelay}
            onChange={e => setConfig(prev => ({ ...prev, pageDelay: Number(e.target.value) }))}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">بين الفروع (ث)</label>
          <input
            type="number" min={1} max={120}
            value={config.branchDelay}
            onChange={e => setConfig(prev => ({ ...prev, branchDelay: Number(e.target.value) }))}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">جهة الحفظ</label>
          <select
            value={config.storageTarget}
            onChange={e => setConfig(prev => ({ ...prev, storageTarget: e.target.value as any }))}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          >
            <option value="firebase">قاعدة السحاب (Firebase)</option>
            <option value="local">الجهاز المحلي (Computer)</option>
            <option value="both">كلاهما (Both)</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold
            hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">{saving ? 'sync' : 'save'}</span>
          حفظ
        </button>
        <button
          onClick={triggerScrape}
          disabled={scrapingStatus === 'running' || scrapingStatus === 'triggered'}
          className="px-5 py-2 bg-gradient-to-l from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-bold
            hover:shadow-lg hover:shadow-blue-500/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center gap-1.5 flex-1 justify-center"
        >
          <span className={`material-symbols-outlined text-sm ${scrapingStatus === 'running' ? 'animate-spin' : ''}`}>
            {scrapingStatus === 'running' ? 'sync' : 'play_arrow'}
          </span>
          سحب الآن
        </button>
      </div>
    </div>
  );
};

export default ScrapingConfigPanel;
