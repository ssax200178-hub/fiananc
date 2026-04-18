import { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { onSnapshot, doc, collection, query, orderBy, limit, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { AppContextType, ReconData, FundLineItem, FundSnapshot, FinancialTip, Restaurant, ActivityLog, TransferRequest, Employee, Deduction, LoanRequest, LiquidityMapping, OperationalSheet, Branch, ExchangeRates, DevFeedbackSettings, FeatureFlags, User, UserRole, UserPermission, BankDefinition, OLD_TO_NEW_PERMISSIONS, PaymentAccount, SystemBalance, AccountMapping, SyncMetadata, AppCurrency, AutomationConfig } from '../../AppContext';
import { generateId, saveToStorage, loadFromStorage, safeCompare } from '../../utils';

import { useUsers } from './useUsers';
import { useRestaurants } from './useRestaurants';
import { useFunds } from './useFunds';
import { useReconciliation } from './useReconciliation';
import { useSettings } from './useSettings';
import { useInvoices } from './useInvoices';
import { usePhonePayments } from './usePhonePayments';
import { usePaymentAccounts } from './usePaymentAccounts';
import { useJournalEntries } from './useJournalEntries';
import { appStateService } from '../services/appStateService';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';



export const useAppData = (navigate: any) => {
    const [isLoading, setIsLoading] = useState(true);
    const [theme, setTheme] = useState<'light' | 'dark'>('dark');
    const [currency, setCurrency] = useState<'SAR' | 'YER' | 'USD'>('YER');
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
    const [selectedEmployeeDrawerId, setSelectedEmployeeDrawerId] = useState<string | null>(null);
    const presencesRef = useRef<Record<string, string>>({});

    const [isMainDataLoaded, setIsMainDataLoaded] = useState(false);
    const [isSnapshotsLoaded, setIsSnapshotsLoaded] = useState(false);
    const [isDraftLoaded, setIsDraftLoaded] = useState(false);
    const hasMigrated = useRef(false);
    const hasSyncedUid = useRef<Set<string>>(new Set());

    // We need early access to `currentUser` and `users` for addLog and persistState.
    // Instead of hooks doing it, we will keep a ref to `currentUser` to avoid stale closures.
    const currentUserRef = useRef<User | null>(null);
    const usersRef = useRef<User[]>([]);

    const addLog = useCallback(async (action: string, details: string, category: ActivityLog['category']) => {
        await appStateService.addLog(action, details, category, currentUserRef.current);
    }, []);

    const persistState = useCallback(async (overrides: any = {}) => {
        if (!isMainDataLoaded && Object.keys(overrides).length > 0) return;
        try {
            // Mapping local 'users' to Firestore 'customUsers'
            const usersToFilter = overrides.users || usersRef.current;
            const customUsersToSave = usersToFilter.filter((u: User) => u.id !== '0');

            const payload: any = {
                ...overrides,
                customUsers: customUsersToSave,
                updatedAt: new Date().toISOString()
            };

            // Remove local-only or redundant fields
            delete payload.users;
            delete payload.history;
            delete payload.fundSnapshots;

            return await appStateService.saveDataToFirebase(payload);
        } catch (error) {
            console.error("Failed to persist state:", error);
            alert("حدث خطأ أثناء حفظ التغييرات. يرجى المحاولة مرة أخرى.");
            throw error;
        }
    }, [isMainDataLoaded]);

    // Hook Initialization
    const usersHook = useUsers(persistState, addLog);
    const restaurantsHook = useRestaurants(usersHook.currentUser, addLog, setIsLoading);
    const fundsHook = useFunds(usersHook.currentUser, addLog, persistState, appStateService.saveDataToFirebase);
    const reconciliationHook = useReconciliation(usersHook.currentUser, addLog, navigate);
    const settingsHook = useSettings(usersHook.currentUser, addLog, persistState, appStateService.saveDataToFirebase);
    const invoicesHook = useInvoices(usersHook.currentUser);
    const phonePaymentsHook = usePhonePayments(usersHook.currentUser);
    const paymentAccountsHook = usePaymentAccounts(usersHook.currentUser, addLog);
    const journalEntriesHook = useJournalEntries(usersHook.currentUser);

    // Keep refs updated for closures
    useEffect(() => {
        currentUserRef.current = usersHook.currentUser;
        usersRef.current = usersHook.users;
    }, [usersHook.currentUser, usersHook.users]);

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        // Persist to Firebase immediately
        persistState({ theme: newTheme });
    };

    // --- Theme Application ---
    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }, [theme]);

    useEffect(() => {
        saveToStorage('draft-recon-data', reconciliationHook.currentData);
    }, [reconciliationHook.currentData]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (!firebaseUser) {
                usersHook.setCurrentUser(null);
                usersHook.setUsers([]);
                setIsLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

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

        const docRef = doc(db, ROOT_COLLECTION, DATA_PATH);
        const historyRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'history_records');
        const snapshotsRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'fund_snapshots');
        const tipsRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'financial_tips');
        const restaurantsRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'restaurants');
        const paymentAccountsRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'payment_accounts');
        const draftRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'fund_draft', 'current');

        // Initial Cache Hydration
        const cachedBalances = localStorage.getItem('cache_system_balances');
        if (cachedBalances) {
            try { settingsHook.setSystemBalances(JSON.parse(cachedBalances)); } catch (e) {}
        }
        const cachedRestaurants = localStorage.getItem('cache_restaurants');
        if (cachedRestaurants) {
            try { restaurantsHook.setRestaurants(JSON.parse(cachedRestaurants)); } catch (e) {}
        }

        const timeoutId = setTimeout(() => {
            if (isLoading) setIsLoading(false);
        }, 10000);

        const unsubscribeMain = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.bankDefinitions) fundsHook.setBankDefinitions(data.bankDefinitions);
                else fundsHook.setBankDefinitions([]);

                // Cache some metadata
                localStorage.setItem('cache_theme', data.theme || 'dark');
                localStorage.setItem('cache_currency', data.currency || 'YER');

                const migrations: any = {};
                let migrationPerformed = false;
                if (data.fundSnapshots && data.fundSnapshots.length > 0 && !hasMigrated.current) {
                    data.fundSnapshots.forEach(async (snap: FundSnapshot) => await setDoc(doc(snapshotsRef, snap.id), snap));
                    migrations.fundSnapshots = [];
                    migrationPerformed = true;
                }
                if (data.history && data.history.length > 0 && !hasMigrated.current) {
                    data.history.forEach(async (item: ReconData) => await setDoc(doc(historyRef, item.id), item));
                    migrations.history = [];
                    migrationPerformed = true;
                }
                if (migrationPerformed) {
                    hasMigrated.current = true;
                    appStateService.saveDataToFirebase(migrations);
                }

                const defaultUsers: User[] = [{ id: '0', username: 'abdr200178', name: 'عبدالرحمن الصغير', role: 'super_admin', isActive: true, email: 'abdr200178@financial.com' }];
                const customUsers = data.customUsers || [];
                let needsPersist = false;
                const migratedCustomUsers = customUsers.map((u: User) => {
                    if (!u.permissions || u.permissions.length === 0) return u;
                    const oldKeys = Object.keys(OLD_TO_NEW_PERMISSIONS);
                    const hasOldPerms = u.permissions.some((p: string) => oldKeys.includes(p));
                    if (!hasOldPerms) return u;
                    const newPerms = new Set<UserPermission>(u.permissions as UserPermission[]);
                    u.permissions.forEach((p: string) => {
                        const mapped = OLD_TO_NEW_PERMISSIONS[p];
                        if (mapped) mapped.forEach(np => newPerms.add(np));
                    });
                    oldKeys.forEach(k => newPerms.delete(k as UserPermission));
                    needsPersist = true;
                    return { ...u, permissions: Array.from(newPerms) };
                });

                const merged = [...defaultUsers, ...migratedCustomUsers].map(u => ({
                    ...u,
                    lastSeenAt: presencesRef.current[u.id] || u.lastSeenAt
                }));
                const isFromCache = docSnap.metadata.fromCache;
                usersHook.setUsers(merged);

                if (needsPersist && !isFromCache) {
                    appStateService.saveDataToFirebase({ customUsers: migratedCustomUsers });
                }

                if (auth.currentUser) {
                    const email = auth.currentUser.email;
                    const found = merged.find(u => {
                        const uEmail = u.email?.trim().toLowerCase();
                        const uUsernameEmail = u.username ? `${u.username.trim()} @financial.com`.toLowerCase() : null;
                        const currentEmail = email?.trim().toLowerCase();
                        return uEmail === currentEmail || uUsernameEmail === currentEmail;
                    });

                    if (found) {
                        if (found.isActive === false) {
                            if (isFromCache) return;
                            setIsMainDataLoaded(true);
                            alert('🔴 عذراً، هذا الحساب غير نشط حالياً.');
                            signOut(auth);
                            usersHook.setCurrentUser(null);
                            return;
                        }
                        usersHook.setCurrentUser(found);

                        if (!hasSyncedUid.current.has('lastSeen_' + found.id)) {
                            hasSyncedUid.current.add('lastSeen_' + found.id);
                            const nowStr = new Date().toISOString();
                            const presenceRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'user_presence', found.id);
                            setDoc(presenceRef, { lastSeenAt: nowStr }, { merge: true }).catch(console.error);
                        }

                        if (found.role === 'super_admin' && found.id !== '0' && found.name !== 'عبدالرحمن الصغير' && !isFromCache && !hasSyncedUid.current.has('admin_sync')) {
                            hasSyncedUid.current.add('admin_sync');
                        }
                    } else {
                        if (isFromCache) return;
                        setIsMainDataLoaded(true);
                        alert('🚫 غير مصرح لك بدخول هذا النظام.');
                        signOut(auth);
                        usersHook.setCurrentUser(null);
                        return;
                    }
                }

                if (data.theme && data.theme !== theme) setTheme(data.theme);
                if (data.currency) setCurrency(data.currency);
            } else {
                appStateService.saveDataToFirebase({ bankDefinitions: [], customUsers: [], theme: 'dark', currency: 'YER' });
            }
            setIsMainDataLoaded(true);
        }, () => setIsMainDataLoaded(true));

        const unsubscribeHistory = onSnapshot(historyRef, (snapshot) => {
            const items: ReconData[] = [];
            snapshot.forEach(doc => items.push({ ...doc.data(), id: doc.id } as ReconData));
            reconciliationHook.setHistory(items.sort((a, b) => safeCompare(b.id, a.id)));
        });

        const unsubscribeSnapshots = onSnapshot(snapshotsRef, (snapshot) => {
            const items: FundSnapshot[] = [];
            snapshot.forEach(doc => items.push(doc.data() as FundSnapshot));
            fundsHook.setFundSnapshots(items.sort((a, b) => safeCompare(b.fullTimestamp || b.id, a.fullTimestamp || a.id)));
            setIsSnapshotsLoaded(true);
            clearTimeout(timeoutId);
        }, () => setIsSnapshotsLoaded(true));

        const unsubscribeTips = onSnapshot(tipsRef, (snapshot) => {
            const items: FinancialTip[] = [];
            snapshot.forEach(doc => items.push(doc.data() as FinancialTip));
            settingsHook.setFinancialTips(items.sort((a, b) => safeCompare(b.createdAt, a.createdAt)));
        });

        const unsubscribeRestaurants = onSnapshot(restaurantsRef, (snapshot) => {
            const items: Restaurant[] = [];
            snapshot.forEach(doc => items.push({ ...doc.data(), id: doc.id } as Restaurant));
            const sortedItems = items.sort((a, b) => safeCompare(b.createdAt, a.createdAt));
            restaurantsHook.setRestaurants(sortedItems);
            localStorage.setItem('cache_restaurants', JSON.stringify(sortedItems));
        });

        const unsubscribePaymentAccounts = onSnapshot(paymentAccountsRef, (snapshot) => {
            const items: PaymentAccount[] = [];
            snapshot.forEach(doc => items.push({ ...doc.data(), id: doc.id } as PaymentAccount));
            paymentAccountsHook.setPaymentAccounts(items.sort((a, b) => safeCompare(b.createdAt, a.createdAt)));
        });

        const unsubscribeDraft = onSnapshot(draftRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.items && Array.isArray(data.items)) fundsHook.setFundDraftItems(data.items);
            }
            setIsDraftLoaded(true);
        }, () => setIsDraftLoaded(true));

        const qLogs = query(collection(db, ROOT_COLLECTION, DATA_PATH, 'activity_logs'), orderBy('timestamp', 'desc'), limit(1000));
        const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
            setActivityLogs(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as ActivityLog));
        });

        const requestsRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'transfer_requests');
        const unsubscribeRequests = onSnapshot(requestsRef, (snapshot) => {
            const items: TransferRequest[] = [];
            snapshot.forEach(doc => items.push({ ...doc.data(), id: doc.id } as TransferRequest));
            restaurantsHook.setTransferRequests(items.sort((a, b) => safeCompare(b.createdAt, a.createdAt)));
        });

        const employeesRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'employees');
        const unsubscribeEmployees = onSnapshot(employeesRef, (snapshot) => {
            const items: Employee[] = [];
            snapshot.forEach(doc => items.push({ ...doc.data(), id: doc.id } as Employee));
            settingsHook.setEmployees(items.sort((a, b) => safeCompare(b.createdAt, a.createdAt)));
        });

        const deductionsRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'deductions');
        const unsubscribeDeductions = onSnapshot(deductionsRef, (snapshot) => {
            const items: Deduction[] = [];
            snapshot.forEach(doc => items.push({ ...doc.data(), id: doc.id } as Deduction));
            settingsHook.setDeductions(items.sort((a, b) => safeCompare(b.createdAt, a.createdAt)));
        });

        const loansRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'loan_requests');
        const unsubscribeLoans = onSnapshot(loansRef, (snapshot) => {
            const items: LoanRequest[] = [];
            snapshot.forEach(doc => items.push({ ...doc.data(), id: doc.id } as LoanRequest));
            settingsHook.setLoanRequests(items.sort((a, b) => safeCompare(b.createdAt, a.createdAt)));
        });

        const mappingsRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'liquidity_mappings');
        const unsubscribeMappings = onSnapshot(mappingsRef, (snapshot) => {
            const items: LiquidityMapping[] = [];
            snapshot.forEach(doc => items.push({ ...doc.data(), id: doc.id } as LiquidityMapping));
            settingsHook.setLiquidityMappings(items);
        });

        const sheetsRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'operational_sheets');
        const unsubscribeSheets = onSnapshot(sheetsRef, (snapshot) => {
            const items: OperationalSheet[] = [];
            snapshot.forEach(doc => items.push({ ...doc.data(), id: doc.id } as OperationalSheet));
            settingsHook.setOperationalSheets(items.sort((a, b) => safeCompare(b.createdAt, a.createdAt)));
        });

        const presenceRefCollection = collection(db, ROOT_COLLECTION, DATA_PATH, 'user_presence');
        const unsubscribePresence = onSnapshot(presenceRefCollection, (snapshot) => {
            snapshot.forEach(d => { presencesRef.current[d.id] = d.data().lastSeenAt; });
            usersHook.setUsers(prev => prev.map(u => ({ ...u, lastSeenAt: presencesRef.current[u.id] || u.lastSeenAt })));
        });

        const branchesRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'branches');
        const unsubscribeBranches = onSnapshot(branchesRef, (snapshot) => {
            const items: Branch[] = [];
            snapshot.forEach(doc => items.push({ ...doc.data(), id: doc.id } as Branch));
            settingsHook.setBranches(items.sort((a, b) => safeCompare(a.name, b.name)));
        });

        const exchangeRatesRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'exchange_rates', 'current');
        const unsubscribeExchangeRates = onSnapshot(exchangeRatesRef, (snapshot) => {
            if (snapshot.exists()) settingsHook.setExchangeRates(snapshot.data() as ExchangeRates);
        });

        const feedbackSettingsRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'settings', 'developerFeedback');
        const unsubscribeFeedbackSettings = onSnapshot(feedbackSettingsRef, (snapshot) => {
            if (snapshot.exists()) settingsHook.setDevFeedbackSettings(snapshot.data() as DevFeedbackSettings);
        });

        const featureFlagsRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'settings', 'feature_flags');
        const unsubscribeFeatureFlags = onSnapshot(featureFlagsRef, (snapshot) => {
            if (snapshot.exists()) settingsHook.setFeatureFlags(snapshot.data() as FeatureFlags);
            else settingsHook.setFeatureFlags({});
        });

        const automationConfigRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'settings', 'automation_config');
        const unsubscribeAutomationConfig = onSnapshot(automationConfigRef, (snapshot) => {
            if (snapshot.exists()) settingsHook.setAutomationConfig(snapshot.data() as AutomationConfig);
            else settingsHook.setAutomationConfig(null);
        });

        // System Balances (أرصدة النظام الأساسي)
        const systemBalancesRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'system_balances');
        const unsubscribeSystemBalances = onSnapshot(systemBalancesRef, (snapshot) => {
            const items: SystemBalance[] = [];
            snapshot.forEach(doc => {
                const data = doc.data() as SystemBalance;
                if (!data.accountName?.includes('إضافة فرع جديد') && !data.accountName?.includes('إضافة صف')) {
                    items.push({ ...data, id: doc.id });
                }
            });
            settingsHook.setSystemBalances(items);
            localStorage.setItem('cache_system_balances', JSON.stringify(items));
        });

        // Account Mappings (ربط الحسابات)
        const accountMappingsRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'account_mappings');
        const unsubscribeAccountMappings = onSnapshot(accountMappingsRef, (snapshot) => {
            const items: AccountMapping[] = [];
            snapshot.forEach(doc => items.push({ ...doc.data(), id: doc.id } as AccountMapping));
            settingsHook.setAccountMappings(items);
        });

        // Custom Currencies (العملات المخصصة)
        const customCurrenciesRef = collection(db, ROOT_COLLECTION, DATA_PATH, 'custom_currencies');
        const unsubscribeCustomCurrencies = onSnapshot(customCurrenciesRef, (snapshot) => {
            const items: AppCurrency[] = [];
            snapshot.forEach(doc => items.push({ ...doc.data(), id: doc.id } as AppCurrency));
            settingsHook.setCustomCurrencies(items);
        });

        // Sync Metadata (حالة المزامنة)
        const syncMetadataRef = doc(db, ROOT_COLLECTION, DATA_PATH, 'sync_metadata', 'tawseel_sync');
        const unsubscribeSyncMetadata = onSnapshot(syncMetadataRef, (snapshot) => {
            if (snapshot.exists()) settingsHook.setSyncMetadata(snapshot.data() as SyncMetadata);
        });

        return () => {
            clearTimeout(timeoutId);
            unsubscribeMain();
            unsubscribeHistory();
            unsubscribeSnapshots();
            unsubscribeTips();
            unsubscribeRestaurants();
            unsubscribePaymentAccounts();
            unsubscribeDraft();
            unsubscribeLogs();
            unsubscribeRequests();
            unsubscribeEmployees();
            unsubscribeDeductions();
            unsubscribeLoans();
            unsubscribeMappings();
            unsubscribeSheets();
            unsubscribeBranches();
            unsubscribeExchangeRates();
            unsubscribeFeedbackSettings();
            unsubscribeFeatureFlags();
            unsubscribePresence();
            unsubscribeSystemBalances();
            unsubscribeAccountMappings();
            unsubscribeSyncMetadata();
            unsubscribeCustomCurrencies();
            unsubscribeAutomationConfig();
        };
    }, [auth.currentUser]);

    return {
        isLoading,
        theme, toggleTheme,
        currency,
        activityLogs, addLog,

        ...usersHook,
        ...restaurantsHook,
        ...fundsHook,
        ...reconciliationHook,
        ...settingsHook,
        ...invoicesHook,
        ...phonePaymentsHook,
        ...paymentAccountsHook,
        ...journalEntriesHook,
        selectedEmployeeDrawerId,
        setSelectedEmployeeDrawerId
    };
};
