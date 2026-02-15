import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc, onSnapshot, collection, query, where, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { auth, db, firebaseConfig } from './firebase';
import InputPage from './components/InputPage';
import AnalysisPage from './components/AnalysisPage';
import FundsPage from './components/FundsPage';
import Layout from './components/Layout';
import SettingsPage from './components/SettingsPage';
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';
import RestaurantsPage from './components/RestaurantsPage';
import RestaurantDetailsPage from './components/RestaurantDetailsPage';
import ActivityLogsPage from './components/ActivityLogsPage';
import RestaurantPaymentsPage from './components/RestaurantPaymentsPage';
import ArchivesPage from './components/ArchivesPage';
import { generateId, saveToStorage, loadFromStorage } from './utils';
import {
  AppContext,
  AppContextType,
  User,
  UserRole,
  ReconData,
  BankDefinition,
  FundsCurrency,
  FundLineItem,
  FundSnapshot,
  FinancialTip,
  TipType,
  Restaurant,
  TransferAccount,
  ActivityLog,
  UserPermission
} from './AppContext';

// Helper to scroll to top
const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

const defaultData: ReconData = {
  id: '',
  restaurantName: '',
  count: 0,
  restaurantRaw: '',
  companyRaw: '',
  date: new Date().toLocaleDateString('ar-SA'),
  totalAmount: 0,
  calculatedVariance: 0,
  status: 'draft',
  manualLinks: {}
};

const ROOT_COLLECTION = import.meta.env.VITE_APP_ENV === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';

const App: React.FC = () => {
  // --- State ---
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true); // Global loading state
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [currency, setCurrency] = useState<'SAR' | 'YER' | 'USD'>('YER');

  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]); // Synced from Firestore

  // Restaurant Recon State
  // Initialize currentData from LocalStorage (Draft)
  const [currentData, setCurrentData] = useState<ReconData>(() =>
    loadFromStorage('draft-recon-data', { ...defaultData, id: generateId() })
  );

  const [history, setHistory] = useState<ReconData[]>([]);

  // Funds / Bank Recon State
  const [bankDefinitions, setBankDefinitions] = useState<BankDefinition[]>([]);
  const [fundDraftItems, setFundDraftItems] = useState<FundLineItem[]>([]);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [fundSnapshots, setFundSnapshots] = useState<FundSnapshot[]>([]);
  const [financialTips, setFinancialTips] = useState<FinancialTip[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  // Official Colors
  const officialColors = {
    header: '#C62828',
    sidebar: '#263238',
    active: '#FFB300',
    link: '#4FC3F7',
    background: '#F5F5F5',
    success: '#4CAF50'
  };

  // --- Effects ---

  // Persist Current Data (Draft) to LocalStorage whenever it changes
  useEffect(() => {
    saveToStorage('draft-recon-data', currentData);
  }, [currentData]);


  // 1. Auth Listener — Triggers data loading when user signs in, clears state on sign out
  useEffect(() => {
    console.log("🔌 [FIREBASE] Setting up Auth Listener...");
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("👤 [FIREBASE] Auth State Changed:", firebaseUser ? firebaseUser.email : "Logged Out");
      if (firebaseUser) {
        // User is signed in — Firestore subscriptions (useEffect below) will
        // detect auth.currentUser and load data + set currentUser.
        // We keep isLoading=true until Firestore finishes loading.
        console.log("✅ [FIREBASE] User authenticated:", firebaseUser.email);
      } else {
        // User signed out — clear everything
        setCurrentUser(null);
        setUsers([]);
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Data Subscriptions
  // Track loading states separately to ensure everything is ready
  const [isMainDataLoaded, setIsMainDataLoaded] = useState(false);
  const [isSnapshotsLoaded, setIsSnapshotsLoaded] = useState(false);

  useEffect(() => {
    if (isMainDataLoaded && isSnapshotsLoaded && isDraftLoaded) {
      setIsLoading(false);
    }
  }, [isMainDataLoaded, isSnapshotsLoaded, isDraftLoaded]);

  useEffect(() => {
    if (!auth.currentUser) return;

    setIsLoading(true);
    setIsMainDataLoaded(false);
    setIsSnapshotsLoaded(false);
    setIsDraftLoaded(false);

    console.log("📡 [FIREBASE] Subscribing to Firestore collections...");

    const docRef = doc(db, ROOT_COLLECTION, DATA_PATH);
    const historyRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'history_records');
    const snapshotsRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'fund_snapshots');
    const tipsRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'financial_tips');
    const restaurantsRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'restaurants');
    const draftRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'fund_draft', 'current');

    // Set a timeout to clear loading if it takes too long
    const timeoutId = setTimeout(() => {
      if (isLoading) {
        console.warn("⚠️ [FIREBASE] Data load timed out. Might be offline.");
        // Force load completion on timeout to allow app usage
        setIsLoading(false);
      }
    }, 10000);

    // A. Main Data (Settings, Users, BankDefs)
    const unsubscribeMain = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.bankDefinitions) {
          setBankDefinitions(data.bankDefinitions);
        } else {
          // If field is missing (e.g. data reset), treat as empty
          setBankDefinitions([]);
        }

        // --- Migration Check: If old data exists in main doc, move it! ---
        if (data.fundSnapshots && data.fundSnapshots.length > 0) {
          console.log("📦 Migrating fundSnapshots to sub-collection...");
          data.fundSnapshots.forEach(async (snap: FundSnapshot) => {
            await setDoc(doc(snapshotsRef, snap.id), snap);
          });
          saveDataToFirebase({ fundSnapshots: [] });
        }
        if (data.history && data.history.length > 0) {
          console.log("📦 Migrating history to sub-collection...");
          data.history.forEach(async (item: ReconData) => {
            await setDoc(doc(historyRef, item.id), item);
          });
          saveDataToFirebase({ history: [] });
        }

        // Users Logic — Always set currentUser after loading users
        const defaultUsers: User[] = [
          { id: '0', username: 'abdr200178', name: 'عبدالرحمن الصغير', role: 'super_admin', isActive: true, email: 'abdr200178@financial.com' },
        ];
        const customUsers = data.customUsers || [];
        const merged = [...defaultUsers, ...customUsers];
        const isFromCache = docSnap.metadata.fromCache;
        setUsers(merged);

        if (!isFromCache) {
          console.log(`📊 [SERVER] Loaded ${customUsers.length} custom users. Total accounts: ${merged.length}`);
          if (customUsers.length > 0) {
            console.log("👥 Custom Users IDs:", customUsers.map((u: User) => u.username || u.id).join(', '));
          }
        }

        // Match the currently authenticated Firebase user to our users list
        if (auth.currentUser) {
          const email = auth.currentUser.email;
          console.log("🔍 [AUTH] Looking for user with email:", email, "in", merged.length, "users", isFromCache ? "(FROM CACHE)" : "(FROM SERVER)");
          // Match by email OR by mapping username to the expected email format
          const found = merged.find(u => {
            const uEmail = u.email?.trim().toLowerCase();
            const uUsernameEmail = u.username ? `${u.username.trim()}@financial.com`.toLowerCase() : null;
            const currentEmail = email?.trim().toLowerCase();
            return uEmail === currentEmail || uUsernameEmail === currentEmail;
          });

          if (found) {
            console.log("✅ [AUTH] Matched user:", found.name, "(", found.role, ")");

            // Check if account is disabled
            if (found.isActive === false) {
              // SECURITY: If status is inactive but it's from cache, wait for server update!
              if (isFromCache) {
                console.log("⏳ [AUTH] User inactive in cache, waiting for server confirmation...");
                return; // Stay in loading state
              }

              console.warn("🚫 [AUTH] User account is disabled. FORCING LOGOUT.");
              setIsMainDataLoaded(true);
              alert('🔴 عذراً، هذا الحساب غير نشط حالياً. يرجى مراجعة الإدارة.');
              signOut(auth);
              setCurrentUser(null);
              return;
            }

            setCurrentUser(found);
            // Sync admin identity if stale
            if (found.role === 'super_admin' && found.name !== 'عبدالرحمن الصغير') {
              (async () => {
                try {
                  const updatedUser = { ...found, name: 'عبدالرحمن الصغير' };
                  setCurrentUser(updatedUser);
                  // The context is available here
                  // @ts-ignore
                  if (typeof updateUser === 'function') {
                    // @ts-ignore
                    await updateUser(found.id, { name: 'عبدالرحمن الصغير' });
                  }
                } catch (e) {
                  console.error("Migration failed:", e);
                }
              })();
            }

          } else {
            // SECURITY: If not found but it's from cache, wait for server!
            if (isFromCache) {
              console.log("⏳ [AUTH] User not found in cache, waiting for server...");
              return; // Stay in loading state
            }

            console.error("❌ [AUTH] Unauthorized login attempt:", email);
            setIsMainDataLoaded(true);
            alert('🚫 غير مصرح لك بدخول هذا النظام. يرجى التواصل مع المدير.');
            signOut(auth);
            setCurrentUser(null);
            return;
          }
        }

        if (data.theme) setTheme(data.theme);
        if (data.currency) setCurrency(data.currency);
      } else {
        // Initialize Defaults
        saveDataToFirebase({
          bankDefinitions: [],
          customUsers: [],
          theme: 'dark',
          currency: 'YER'
        });
      }
      setIsMainDataLoaded(true);
    }, (error) => {
      console.error("Error fetching main data:", error);
      setIsMainDataLoaded(true); // Proceed even on error to avoid indefinite loading
    });

    // B. History Sub-collection
    const unsubscribeHistory = onSnapshot(historyRef, (snapshot) => {
      const items: ReconData[] = [];
      snapshot.forEach(doc => items.push(doc.data() as ReconData));
      setHistory(items.sort((a, b) => b.id.localeCompare(a.id)));
    });

    // C. Fund Snapshots Sub-collection
    const unsubscribeSnapshots = onSnapshot(snapshotsRef, (snapshot) => {
      const items: FundSnapshot[] = [];
      snapshot.forEach(doc => items.push(doc.data() as FundSnapshot));
      setFundSnapshots(items.sort((a, b) => b.id.localeCompare(a.id)));
      setIsSnapshotsLoaded(true);
      clearTimeout(timeoutId);
    }, (error) => {
      console.error("Error fetching snapshots:", error);
      setIsSnapshotsLoaded(true);
    });

    // D. Financial Tips Sub-collection
    const unsubscribeTips = onSnapshot(tipsRef, (snapshot) => {
      const items: FinancialTip[] = [];
      snapshot.forEach(doc => items.push(doc.data() as FinancialTip));
      setFinancialTips(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    });

    // E. Restaurant Directory Sub-collection
    const unsubscribeRestaurants = onSnapshot(restaurantsRef, (snapshot) => {
      const items: Restaurant[] = [];
      snapshot.forEach(doc => items.push(doc.data() as Restaurant));
      setRestaurants(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    });

    // F. Fund Draft (working draft shared across devices)
    const unsubscribeDraft = onSnapshot(draftRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.items && Array.isArray(data.items)) {
          setFundDraftItems(data.items);
        }
      }
      setIsDraftLoaded(true);
    }, (error) => {
      console.error("Error fetching fund draft:", error);
      setIsDraftLoaded(true);
    });

    // G. Activity Logs Sub-collection
    const qLogs = query(collection(db, ROOT_COLLECTION, DATA_PATH, 'activity_logs'), orderBy('timestamp', 'desc'), limit(1000));
    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      setActivityLogs(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as ActivityLog));
    });

    return () => {
      clearTimeout(timeoutId);
      unsubscribeMain();
      unsubscribeHistory();
      unsubscribeSnapshots();
      unsubscribeTips();
      unsubscribeRestaurants();
      unsubscribeDraft();
      unsubscribeLogs();
    };
  }, [auth.currentUser]);

  // Apply color scheme (official)
  const applyColorScheme = (colors: any) => {
    const root = document.documentElement;
    root.style.setProperty('--color-sidebar', colors.sidebar);
    root.style.setProperty('--color-header', colors.header);
    root.style.setProperty('--color-active', colors.active);
    root.style.setProperty('--color-link', colors.link);
    root.style.setProperty('--color-bg-light', colors.background);
    root.style.setProperty('--color-success', colors.success);

    // Also set old names for backward compatibility if any components still use them
    root.style.setProperty('--sidebar-bg', colors.sidebar);
    root.style.setProperty('--header-bg', colors.header);
    root.style.setProperty('--accent-color', colors.active);
    root.style.setProperty('--link-color', colors.link);
    root.style.setProperty('--bg-light', colors.background);
    root.style.setProperty('--success-color', colors.success);
  };

  useEffect(() => {
    applyColorScheme(officialColors);
  }, []);


  // --- Helper: Save to Firebase ---
  const saveDataToFirebase = async (data: any) => {
    try {
      return await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH), data, { merge: true });
    } catch (e) {
      console.error("❌ [FIREBASE] Save failed:", e);
      throw e;
    }
  };

  const persistState = async (overrides: any = {}) => {
    // CRITICAL BUG FIX: Never persist state if main data hasn't finished loading yet!
    // This prevents accidental wipes of customUsers when settings (like theme) are toggled before data load.
    if (!isMainDataLoaded && Object.keys(overrides).length > 0) {
      console.warn("⚠️ [AUTH] persistState blocked: Main data not yet loaded.");
      return;
    }

    // Filter out default users from customUsers list
    const customUsersToSave = (overrides.users || users).filter((u: User) => !['0'].includes(u.id));

    const payload = {
      customUsers: customUsersToSave,
      currency,
      ...overrides,
      // Ensure customUsers field is ALWAYS prioritized and preserved
      updatedAt: new Date().toISOString()
    };
    // Exclude history and fundSnapshots from the main doc payload
    delete (payload as any).history;
    delete (payload as any).fundSnapshots;

    return await saveDataToFirebase(payload);
  };

  // --- Actions ---

  // Actions

  // Auth Actions
  const login = async (username: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      // Map username to email
      let email = username;
      if (!username.includes('@')) {
        if (username.toLowerCase() === 'abdr200178') email = 'abdr200178@financial.com';
        else if (username.toLowerCase() === 'admin') email = 'admin@financial.com';
        else email = `${username}@financial.com`;
      }

      console.log("🔐 [AUTH] Attempting sign in with:", email);
      await signInWithEmailAndPassword(auth, email, password);
      // SUCCESS — Don't try to find user in `users` array here.
      // The Auth Listener + Firestore onSnapshot will handle:
      //   1. Auth state changes → triggers Firestore subscriptions
      //   2. Firestore loads customUsers → matches email → sets currentUser
      //   3. isLoading is cleared after all data loads
      console.log("✅ [AUTH] Sign in successful for:", email);
      // Log will be added after currentUser is set by Firestore
      setTimeout(() => addLog('تسجيل دخول', `تم تسجيل دخول: ${email}`, 'auth'), 2000);
      return true;
    } catch (error: any) {
      console.error("❌ [AUTH] Login Error:", error.code, error.message);
      setIsLoading(false);
      // Show user-friendly error messages
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        return false; // LoginPage will show "اسم المستخدم أو كلمة المرور غير صحيحة"
      } else if (error.code === 'auth/wrong-password') {
        return false;
      } else if (error.code === 'auth/too-many-requests') {
        alert('⚠️ تم تجاوز عدد المحاولات المسموح. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.');
        return false;
      } else {
        alert(`فشل تسجيل الدخول: ${error.message}`);
        return false;
      }
    }
  };

  const logout = () => {
    if (currentUser) {
      addLog('تسجيل خروج', `خرج المستخدم ${currentUser.name} من النظام`, 'auth');
    }
    signOut(auth);
  };

  const changePassword = async (newPassword: string) => {
    if (!auth.currentUser) {
      throw new Error('يجب تسجيل الدخول أولاً لتغيير كلمة المرور');
    }
    try {
      const { updatePassword } = await import('firebase/auth');
      await updatePassword(auth.currentUser, newPassword);
      addLog('تغيير كلمة المرور', `قام المستخدم ${currentUser?.name} بتغيير كلمة المرور الخاصة به`, 'auth');
    } catch (error: any) {
      console.error("Error changing password:", error);
      if (error.code === 'auth/requires-recent-login') {
        throw new Error('يرجى تسجيل الدخول مرة أخرى لإتمام عملية تغيير كلمة المرور لأغراض أمنية');
      }
      throw error;
    }
  };

  const addUser = async (username: string, password: string, name: string, role: UserRole, permissions?: UserPermission[]) => {
    setIsLoading(true);
    // Initialize a secondary Firebase App with a UNIQUE name to prevent conflicts
    const secondaryAppName = `Secondary-${Date.now()}`;
    const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      // Normalize username and derive email
      const cleanUsername = username.trim().toLowerCase();

      // VALDIATION: Ensure username is English only (no spaces, no special chars except dots/underscores)
      const usernameRegex = /^[a-z0-9._-]+$/;
      if (!cleanUsername.includes('@') && !usernameRegex.test(cleanUsername)) {
        throw new Error("يجب أن يكون 'اسم المستخدم' باللغة الإنجليزية وبدون مسافات (مثال: ali_2024)");
      }

      const userEmail = cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@financial.com`;

      // 0. Manual Check for existing in Auth/Firestore (Local search)
      const existing = users.find(u => u.username.toLowerCase() === cleanUsername || u.email?.toLowerCase() === userEmail.toLowerCase());
      if (existing) {
        throw new Error(`اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل: ${userEmail}`);
      }

      // 1. Create User in Firebase Auth
      await createUserWithEmailAndPassword(secondaryAuth, userEmail, password);

      // Default permissions based on role if not provided
      const defaultPermissions: UserPermission[] = permissions || (
        role === 'super_admin' ? [
          'view_dashboard', 'manage_restaurants', 'manage_funds', 'delete_funds',
          'view_history', 'view_activity_logs', 'manage_users', 'manage_settings', 'manage_tips'
        ] :
          role === 'admin' ? [
            'view_dashboard', 'manage_restaurants', 'manage_funds', 'view_history', 'manage_tips'
          ] :
            ['view_dashboard', 'view_history']
      );

      // 2. Add to our local/synced user list
      const newUser: User = {
        id: generateId(),
        username: cleanUsername,
        name,
        role,
        isActive: true,
        email: userEmail,
        permissions: defaultPermissions
      };

      const updatedUsers = [...users, newUser];
      setUsers(updatedUsers);

      // CRITICAL: Await persistence with explicit customUsers override to avoid staleness
      const customUsersToPersist = updatedUsers.filter(u => u.id !== '0');
      await persistState({ customUsers: customUsersToPersist, users: updatedUsers });

      addLog('إضافة مستخدم', `تم إضافة مستخدم جديد: ${name} (${role})`, 'settings');

      // 3. Clean up secondary auth
      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);

    } catch (error: any) {
      console.error("Error creating user:", error);
      let errorMsg = error.message;
      if (error.code === 'auth/email-already-in-use') {
        errorMsg = "البريد الإلكتروني مستخدم مسبقاً في النظام. (قد يكون هناك حساب مخفي)";
      }
      alert(`❌ فشل إنشاء المستخدم: ${errorMsg}`);
      try { await deleteApp(secondaryApp); } catch (e) { }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteUser = (id: string) => {
    if (currentUser?.id === id) {
      alert('❌ لا يمكنك حذف حسابك الخاص!');
      return;
    }
    if (id === '0') {
      alert('❌ لا يمكن حذف مدير النظام الافتراضي!');
      return;
    }
    const userToDelete = users.find(u => u.id === id);
    const updatedUsers = users.filter(u => u.id !== id);
    setUsers(updatedUsers);
    persistState({ users: updatedUsers });
    addLog('حذف مستخدم', `تم حذف المستخدم: ${userToDelete?.name || id}`, 'settings');
  };

  const toggleUserStatus = (id: string) => {
    const userToToggle = users.find(u => u.id === id);
    if (!userToToggle) return;

    const newStatus = !userToToggle.isActive;
    const updatedUsers = users.map(u => u.id === id ? { ...u, isActive: newStatus } : u);
    setUsers(updatedUsers);
    persistState({ users: updatedUsers });
    addLog('تغيير حالة مستخدم', `تم ${newStatus ? 'تنشيط' : 'تعطيل'} المستخدم: ${userToToggle.name}`, 'settings');
  };

  const updateUser = async (id: string, updates: { username?: string; name?: string; password?: string; permissions?: UserPermission[] }) => {
    if (updates.password) {
      alert("تنبيه: تغيير كلمة المرور هنا لا يؤثر على حساب الدخول في هذه النسخة.");
    }

    const userToUpdate = users.find(u => u.id === id);
    const updatedUsers = users.map(u => {
      if (u.id === id) {
        return {
          ...u,
          ...(updates.username && { username: updates.username }),
          ...(updates.name && { name: updates.name }),
          ...(updates.permissions && { permissions: updates.permissions }),
        };
      }
      return u;
    });
    setUsers(updatedUsers);
    persistState({ users: updatedUsers });
    addLog('تحديث مستخدم', `تم تحديث بيانات المستخدم: ${userToUpdate?.name || id}`, 'settings');
    return true;
  };

  // Restaurant Recon Actions
  const updateCurrentData = (data: Partial<ReconData>) => {
    setCurrentData(prev => ({ ...prev, ...data }));
  };

  const resetCurrentData = () => {
    setCurrentData({ ...defaultData, id: generateId() });
  };

  const addToHistory = async (data: ReconData) => {
    // Save to sub-collection
    try {
      await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'history_records', data.id), data);
      addLog('إضافة تسوية', `تم إضافة تسوية جديدة: ${data.id}`, 'recon');
    } catch (e) { console.error("Error saving history:", e); }
  };

  const updateHistoryItem = async (id: string, data: Partial<ReconData>) => {
    try {
      await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'history_records', id), data, { merge: true });
      addLog('تحديث تسوية', `تم تحديث التسوية: ${id}`, 'recon');
    } catch (e) { console.error("Error updating history:", e); }
  };

  const loadFromHistory = (id: string) => {
    const item = history.find(i => i.id === id);
    if (item) {
      setCurrentData(item);
      navigate('/analysis');
      addLog('تحميل تسوية', `تم تحميل التسوية: ${id} من السجل`, 'recon');
    }
  };

  // Funds Actions
  const addBankDefinition = (name: string, currency: FundsCurrency, accountNumber?: string, customCurrencyName?: string) => {
    const newDef: BankDefinition = {
      id: generateId(),
      name,
      currency,
      accountNumber,
      customCurrencyName,
      isActive: true
    };
    const newBanks = [...bankDefinitions, newDef];
    setBankDefinitions(newBanks);
    persistState({ bankDefinitions: newBanks });
    addLog('إضافة تعريف بنك', `تم إضافة تعريف بنك جديد: ${name}`, 'funds');
  };

  const toggleBankDefinition = (id: string) => {
    const bankToToggle = bankDefinitions.find(def => def.id === id);
    if (!bankToToggle) return;
    const newStatus = !bankToToggle.isActive;
    const newBanks = bankDefinitions.map(def => def.id === id ? { ...def, isActive: newStatus } : def);
    setBankDefinitions(newBanks);
    // Explicitly save the bankDefinitions array to the main doc
    saveDataToFirebase({ bankDefinitions: newBanks });
    addLog('تغيير حالة تعريف بنك', `تم ${newStatus ? 'تنشيط' : 'تعطيل'} تعريف البنك: ${bankToToggle.name}`, 'funds');
  };

  const updateBankDefinition = (id: string, updates: Partial<BankDefinition>) => {
    const bankToUpdate = bankDefinitions.find(def => def.id === id);
    const newBanks = bankDefinitions.map(def => def.id === id ? { ...def, ...updates } : def);
    setBankDefinitions(newBanks);
    saveDataToFirebase({ bankDefinitions: newBanks });
    addLog('تحديث تعريف بنك', `تم تحديث تعريف البنك: ${bankToUpdate?.name || id}`, 'funds');
  };

  const saveFundSnapshot = async (snapshot: FundSnapshot) => {
    try {
      await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'fund_snapshots', snapshot.id), snapshot);
      addLog('حفظ لقطة رصيد', `تم حفظ لقطة رصيد جديدة بتاريخ: ${snapshot.date}`, 'funds');
    } catch (e) { console.error("Error saving snapshot:", e); }
  };

  const deleteBankDefinition = (id: string) => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'super_admin')) {
      alert('❌ صلاحية محدودة!');
      return;
    }
    if (!confirm('تأكيد الحذف؟')) return;
    const bankToDelete = bankDefinitions.find(def => def.id === id);
    const newBanks = bankDefinitions.filter(def => def.id !== id);
    setBankDefinitions(newBanks);
    persistState({ bankDefinitions: newBanks });
    addLog('حذف تعريف بنك', `تم حذف تعريف البنك: ${bankToDelete?.name || id}`, 'funds');
  };

  const deleteFundSnapshot = async (id: string) => {
    if (!currentUser || currentUser.role !== 'super_admin') {
      alert('❌ صلاحية محدودة!');
      return;
    }
    if (!confirm('تأكيد الحذف؟')) return;
    try {
      await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'fund_snapshots', id));
      addLog('حذف لقطة رصيد', `تم حذف لقطة رصيد: ${id}`, 'funds');
    } catch (e) { console.error("Error deleting snapshot:", e); }
  };

  const editFundSnapshot = (id: string): FundLineItem[] => {
    if (!currentUser || currentUser.role !== 'super_admin') {
      alert('❌ صلاحية محدودة!');
      return [];
    }
    const snap = fundSnapshots.find((s: FundSnapshot) => s.id === id);
    if (!snap) return [];

    const allItems = [
      ...snap.oldRiyalItems,
      ...snap.newRiyalItems,
      ...(snap.sarItems || []),
      ...(snap.blueUsdItems || []),
      ...(snap.whiteUsdItems || []),
      ...(snap.customCurrencyItems || [])
    ];

    // Remove from snapshots (DELETE) and return items to edit
    deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'fund_snapshots', id))
      .then(() => addLog('تعديل لقطة رصيد', `بدء تعديل لقطة رصيد: ${id} (تم حذف الأصل)`, 'funds'))
      .catch(e => console.error("Error deleting snapshot for edit:", e));

    return allItems;
  };


  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    saveDataToFirebase({ theme: newTheme });
  };

  // --- Fund Draft Sync Functions ---
  const draftSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const saveFundDraft = (items: FundLineItem[]) => {
    // Debounced save to Firestore (500ms)
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(async () => {
      try {
        await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'fund_draft', 'current'), {
          items,
          lastUpdated: new Date().toISOString(),
          lastUpdatedBy: currentUser?.name || currentUser?.username || 'Unknown'
        });
        console.log('✅ [FIREBASE] Fund draft saved to Firestore');
        addLog('حفظ مسودة رصيد', 'تم حفظ مسودة الرصيد الحالية', 'funds');
      } catch (e) {
        console.error('❌ [FIREBASE] Error saving fund draft:', e);
      }
    }, 500);
  };

  const clearFundDraft = async () => {
    try {
      await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'fund_draft', 'current'), {
        items: [],
        lastUpdated: new Date().toISOString(),
        lastUpdatedBy: currentUser?.name || currentUser?.username || 'Unknown'
      });
      addLog('مسح مسودة رصيد', 'تم مسح مسودة الرصيد الحالية', 'funds');
    } catch (e) {
      console.error('❌ [FIREBASE] Error clearing fund draft:', e);
    }
  };

  const addFinancialTip = async (text: string, type: TipType, icon: string) => {
    try {
      const newTip: FinancialTip = {
        id: generateId(),
        text,
        type,
        icon,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'financial_tips', newTip.id), newTip);
      addLog('إضافة نصيحة مالية', `تم إضافة نصيحة مالية جديدة: "${text.substring(0, 30)}..."`, 'tips');
    } catch (e) { console.error("Error adding tip:", e); }
  };

  const updateFinancialTip = async (id: string, updates: Partial<FinancialTip>) => {
    try {
      await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'financial_tips', id), updates, { merge: true });
      addLog('تحديث نصيحة مالية', `تم تحديث النصيحة المالية: ${id}`, 'tips');
    } catch (e) { console.error("Error updating tip:", e); }
  };

  const deleteFinancialTip = async (id: string) => {
    if (!confirm('تأكيد حذف هذه النصيحة؟')) return;
    try {
      await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'financial_tips', id));
      addLog('حذف نصيحة مالية', `تم حذف النصيحة المالية: ${id}`, 'tips');
    } catch (e) { console.error("Error deleting tip:", e); }
  };

  const getCurrencyByBranch = (branch?: string): 'old_riyal' | 'new_riyal' => {
    if (!branch) return 'old_riyal'; // Default
    const oldRiyalBranches = ['صنعاء', 'إب', 'ذمار', 'الحديدة', 'تعز - الحوبان'];
    const newRiyalBranches = ['عدن', 'المكلا', 'تعز - المدينة'];

    if (oldRiyalBranches.some(b => branch.includes(b))) return 'old_riyal';
    if (newRiyalBranches.some(b => branch.includes(b))) return 'new_riyal';
    return 'old_riyal'; // Default
  };

  const addRestaurant = async (data: Omit<Restaurant, 'id' | 'createdAt' | 'isActive'>) => {
    // Check if restaurant with same accountNumber already exists
    const existing = restaurants.find(r => r.restaurantAccountNumber === data.restaurantAccountNumber);

    if (existing) {
      // Merge transfer accounts
      const existingAccIds = new Set(existing.transferAccounts.map(a => `${a.type}-${a.accountNumber}`));
      const newAccounts = data.transferAccounts.filter(a => !existingAccIds.has(`${a.type}-${a.accountNumber}`));

      if (newAccounts.length > 0) {
        const updatedAccounts = [...existing.transferAccounts, ...newAccounts];
        await updateRestaurant(existing.id, {
          transferAccounts: updatedAccounts,
          // Update other fields if they were missing or "better" (optional, keeping current for safety)
          ownerName: existing.ownerName || data.ownerName,
          phone: existing.phone || data.phone,
          currencyType: existing.currencyType || getCurrencyByBranch(existing.branch)
        });
        addLog('إضافة مطعم', `تم دمج حسابات تحويل جديدة للمطعم: ${existing.name}`, 'restaurant');
      }
      return existing.id;
    }

    const id = generateId();
    const newRestaurant: Restaurant = {
      ...data,
      id,
      isActive: true,
      currencyType: data.currencyType || getCurrencyByBranch(data.branch),
      balance: data.balance || 0,
      createdAt: new Date().toISOString()
    };
    try {
      await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'restaurants', id), newRestaurant);
      addLog('إضافة مطعم', `تم إضافة مطعم جديد: ${data.name}`, 'restaurant');
      return id;
    } catch (e) {
      console.error("Error adding restaurant:", e);
      throw e;
    }
  };

  const mergeRestaurants = async () => {
    const groups: Record<string, Restaurant[]> = {};
    restaurants.forEach((r: Restaurant) => {
      if (!groups[r.restaurantAccountNumber]) groups[r.restaurantAccountNumber] = [];
      groups[r.restaurantAccountNumber].push(r);
    });

    const duplicates = Object.values(groups).filter(g => g.length > 1);
    if (duplicates.length === 0) return;

    for (const group of duplicates) {
      // Sort by creation or just pick the first
      const [target, ...toDelete] = group;

      const allAccountsMap = new Map<string, TransferAccount>();
      group.forEach((r: Restaurant) => {
        r.transferAccounts?.forEach(acc => {
          const key = `${acc.type}-${acc.accountNumber}`;
          if (!allAccountsMap.has(key) || acc.isPrimary) {
            allAccountsMap.set(key, acc);
          }
        });
      });

      const mergedAccounts = Array.from(allAccountsMap.values());

      // Update target
      await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'restaurants', target.id), {
        transferAccounts: mergedAccounts
      }, { merge: true });

      // Delete duplicates
      for (const d of toDelete) {
        await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'restaurants', d.id));
      }
    }
    console.log(`✅ Merged ${duplicates.length} duplicate groups`);
    addLog('دمج المطاعم', `تم دمج ${duplicates.length} مجموعة مطاعم مكررة`, 'restaurant');
  };

  const addLog = async (action: string, details: string, category: ActivityLog['category']) => {
    try {
      const log: ActivityLog = {
        id: generateId(),
        userId: currentUser?.id || 'system',
        userName: currentUser?.name || 'النظام',
        action,
        details,
        timestamp: new Date().toISOString(),
        category
      };
      await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'activity_logs', log.id), log);
    } catch (e) {
      console.error("Error adding log:", e);
    }
  };

  const updateRestaurant = async (id: string, updates: Partial<Restaurant>) => {
    try {
      const finalUpdates = { ...updates };
      // If branch changed, potentially update currencyType if not explicitly provided
      if (updates.branch && !updates.currencyType) {
        finalUpdates.currencyType = getCurrencyByBranch(updates.branch);
      }

      await setDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'restaurants', id), finalUpdates, { merge: true });
      const restaurantToUpdate = restaurants.find(r => r.id === id);
      addLog('تحديث مطعم', `تم تحديث بيانات المطعم: ${restaurantToUpdate?.name || id}`, 'restaurant');
    } catch (e) {
      console.error("Error updating restaurant:", e);
      throw e; // Re-throw so UI can handle it
    }
  };

  const deleteRestaurant = async (id: string) => {
    if (!confirm('تأكيد حذف هذا المطعم وكافة بياناته؟')) return;
    try {
      await deleteDoc(doc(db, ROOT_COLLECTION, DATA_PATH, 'restaurants', id));
      const restaurantToDelete = restaurants.find(r => r.id === id);
      addLog('حذف مطعم', `تم حذف المطعم: ${restaurantToDelete?.name || id}`, 'restaurant');
    } catch (e) { console.error("Error deleting restaurant:", e); }
  };

  // Loading Timeout Logic
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading) {
      timer = setTimeout(() => setShowRetry(true), 8000); // Show retry after 8 seconds
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#102218] text-[#13ec6d] flex-col gap-4">
        <span className="material-symbols-outlined text-6xl animate-spin">sync</span>
        <p className="font-bold text-xl">جاري الاتصال بقاعدة البيانات...</p>
        <p className="text-sm opacity-70">يتم تحميل البيانات لأول مرة، قد يستغرق ذلك بضع ثوانٍ...</p>
        {showRetry && (
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            إعادة المحاولة
          </button>
        )}
      </div>
    );
  }

  return (
    <AppContext.Provider value={{
      currentUser,
      users,
      theme,
      colors: {
        positive: '#d97706', // amber-600
        negative: '#dc2626', // red-600
        matched: '#10b981'   // emerald-500
      },
      toggleTheme,
      login,
      logout,
      changePassword,
      addUser,
      deleteUser,
      toggleUserStatus,
      updateUser,
      currentData,
      updateCurrentData,
      resetCurrentData,
      history,
      addToHistory,
      updateHistoryItem,
      loadFromHistory,
      bankDefinitions,
      addBankDefinition,
      toggleBankDefinition,
      updateBankDefinition,
      deleteBankDefinition,
      fundSnapshots,
      saveFundSnapshot,
      deleteFundSnapshot,
      editFundSnapshot,
      fundDraftItems,
      saveFundDraft,
      clearFundDraft,
      financialTips,
      addFinancialTip,
      updateFinancialTip,
      deleteFinancialTip,
      restaurants,
      addRestaurant,
      updateRestaurant,
      deleteRestaurant,
      mergeRestaurants,
      getCurrencyByBranch,
      activityLogs,
      addLog,
      isLoading
    }}>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={!currentUser ? <LoginPage /> : <Navigate to="/" />} />

        {/* Protected Routes with Sidebar Layout */}
        <Route path="/" element={currentUser ? <Layout /> : <Navigate to="/login" />}>
          <Route index element={<DashboardPage />} />

          <Route path="input" element={
            (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('manage_funds')) ? <InputPage /> : <Navigate to="/" />
          } />

          <Route path="analysis" element={
            (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('view_history')) ? <AnalysisPage /> : <Navigate to="/" />
          } />

          <Route path="funds" element={
            (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('manage_funds')) ? <FundsPage /> : <Navigate to="/" />
          } />

          <Route path="restaurants" element={
            (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('manage_restaurants')) ? <RestaurantsPage /> : <Navigate to="/" />
          } />

          <Route path="restaurants/:id" element={
            (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('manage_restaurants')) ? <RestaurantDetailsPage /> : <Navigate to="/" />
          } />

          <Route path="activity-logs" element={
            (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('view_activity_logs')) ? <ActivityLogsPage /> : <Navigate to="/" />
          } />

          <Route path="restaurant-payments" element={
            (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('manage_funds')) ? <RestaurantPaymentsPage /> : <Navigate to="/" />
          } />

          <Route path="archives" element={
            (currentUser?.role === 'super_admin' || currentUser?.permissions?.includes('manage_funds')) ? <ArchivesPage /> : <Navigate to="/" />
          } />

          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </AppContext.Provider>
  );
};

export default App;