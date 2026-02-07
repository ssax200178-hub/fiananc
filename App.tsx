import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';
import InputPage from './components/InputPage';
import AnalysisPage from './components/AnalysisPage';
import FundsPage from './components/FundsPage';
import Layout from './components/Layout';
import SettingsPage from './components/SettingsPage';
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';
import ParticlesBackground from './components/ParticlesBackground';
import { hashPassword, generateId, saveToStorage, loadFromStorage } from './utils';
import {
  AppContext,
  AppContextType,
  User,
  UserRole,
  Theme,
  Currency,
  ReconData,
  BankDefinition,
  FundSnapshot,
  ColorScheme,
  ParticlesConfig,
  ParticleType
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
  companyRaw: '',
  restaurantRaw: '',
  date: new Date().toLocaleDateString('ar-SA'),
  totalAmount: 0,
  calculatedVariance: 0,
  status: 'draft',
  manualLinks: {}
};

const App: React.FC = () => {
  // --- State ---
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>('dark');
  const [currency, setCurrency] = useState<Currency>('YER');
  const [isInitialized, setIsInitialized] = useState(false);

  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // Restaurant Recon State
  const [currentData, setCurrentData] = useState<ReconData>({ ...defaultData, id: generateId() });
  const [history, setHistory] = useState<ReconData[]>([]);

  // Funds / Bank Recon State
  const [bankDefinitions, setBankDefinitions] = useState<BankDefinition[]>([]);
  const [fundSnapshots, setFundSnapshots] = useState<FundSnapshot[]>([]);

  // Color Customization State
  const [colorScheme, setColorScheme] = useState<ColorScheme>({
    header: '#C62828',      // الأحمر القاني - الشريط العلوي
    sidebar: '#263238',     // الأزرق الداكن (النيلي) - القائمة الجانبية
    active: '#FFB300',      // الأصفر الذهبي - العنصر النشط
    link: '#4FC3F7',        // الأزرق السماوي - الروابط
    background: '#F5F5F5',  // الرمادي الفاتح - خلفية البيانات
    success: '#4CAF50'      // الأخضر الحيوي - الحالات الإيجابية
  });

  // Particles Background State
  const [particlesConfig, setParticlesConfig] = useState<ParticlesConfig>({
    enabled: false,
    type: 'dollar',
    count: 500,
    speed: 1,
    interactionStrength: 1
  });

  // --- Effects ---

  // Initialize default users and load data on first mount
  useEffect(() => {
    const initializeApp = async () => {
      // Create default users with hashed passwords
      const defaultUsers: User[] = [
        {
          id: '0',
          username: 'abdr200178',
          name: 'مدير النظام',
          passwordHash: await hashPassword('200178'),
          role: 'super_admin',
          isActive: true
        },
        {
          id: '1',
          username: 'admin',
          name: 'مسؤول',
          passwordHash: await hashPassword('admin123'),
          role: 'admin',
          isActive: true
        },
        {
          id: '2',
          username: 'user',
          name: 'موظف',
          passwordHash: await hashPassword('user123'),
          role: 'user',
          isActive: true
        }
      ];

      // Load saved data from localStorage
      const savedData = loadFromStorage('reconciliation-data', {
        history: [],
        bankDefinitions: [],
        fundSnapshots: [],
        customUsers: [],
        theme: 'dark' as Theme,
        currency: 'YER' as Currency,
        colorScheme: {
          header: '#C62828',
          sidebar: '#263238',
          active: '#FFB300',
          link: '#4FC3F7',
          background: '#F5F5F5',
          success: '#4CAF50'
        },
        particlesConfig: {
          enabled: false,
          type: 'dollar' as ParticleType,
          count: 500,
          speed: 1,
          interactionStrength: 1
        }
      });

      // Merge default users with custom users
      const allUsers = [...defaultUsers, ...savedData.customUsers.map(u => ({ ...u, isActive: u.isActive ?? true }))];

      setUsers(allUsers);
      setHistory(savedData.history);
      setBankDefinitions(savedData.bankDefinitions || []);
      setFundSnapshots(savedData.fundSnapshots || []);
      setTheme(savedData.theme);
      setCurrency(savedData.currency);
      if (savedData.colorScheme) setColorScheme(savedData.colorScheme);
      if (savedData.particlesConfig) setParticlesConfig(savedData.particlesConfig);
      setIsInitialized(true);
    };

    initializeApp();
  }, []);

  // Apply theme to document root
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Use Effect for Auto-save
  useEffect(() => {
    if (!isInitialized) return;

    const customUsers = users.filter(u => !['0', '1', '2'].includes(u.id));
    const dataToSave = {
      history,
      bankDefinitions,
      fundSnapshots,
      customUsers,
      theme,
      currency,
      colorScheme,
      particlesConfig
    };
    saveToStorage('reconciliation-data', dataToSave);
  }, [history, bankDefinitions, fundSnapshots, users, theme, currency, colorScheme, particlesConfig, isInitialized]);

  // Apply color scheme when it changes
  useEffect(() => {
    applyColorScheme(colorScheme);
  }, [colorScheme, theme]);

  // --- Actions ---
  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  // Auth Actions
  const login = async (username: string, password: string): Promise<boolean> => {
    const cleanUsername = username.trim().toLowerCase();

    // Emergency Bypass for main user (Explicit Check)
    if (cleanUsername === 'abdr200178' && password === '200178') {
      const mainUser = users.find(u => u.id === '0');
      if (mainUser) {
        setCurrentUser(mainUser);
        return true;
      }
    }

    const user = users.find(u => u.username.toLowerCase() === cleanUsername);

    if (user) {
      if (user.isActive === false) {
        alert('هذا الحساب غير نشط. يرجى مراجعة المسؤول.');
        return false;
      }

      const passwordHash = await hashPassword(password);
      if (passwordHash === user.passwordHash) {
        setCurrentUser(user);
        return true;
      } else {
        console.error("Password Mismatch for", cleanUsername);
      }
    } else {
      console.error("User not found:", cleanUsername);
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const addUser = async (username: string, password: string, name: string, role: UserRole) => {
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      alert('اسم المستخدم موجود بالفعل');
      return;
    }
    const newUser: User = {
      id: generateId(),
      username,
      name,
      passwordHash: await hashPassword(password),
      role,
      isActive: true
    };
    setUsers(prev => [...prev, newUser]);
  };

  const deleteUser = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  const toggleUserStatus = (id: string) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, isActive: !u.isActive } : u));
  };

  const updateUserName = (id: string, name: string) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, name } : u));
  };

  // Restaurant Recon Actions
  const updateCurrentData = (data: Partial<ReconData>) => {
    setCurrentData(prev => ({ ...prev, ...data }));
  };

  const resetCurrentData = () => {
    setCurrentData({ ...defaultData, id: generateId() });
  };

  const addToHistory = (data: ReconData) => {
    setHistory(prev => [data, ...prev]);
  };

  const updateHistoryItem = (id: string, data: Partial<ReconData>) => {
    setHistory(prev => prev.map(item => item.id === id ? { ...item, ...data } : item));
  };

  const loadFromHistory = (id: string) => {
    const item = history.find(i => i.id === id);
    if (item) {
      setCurrentData(item);
      navigate('/analysis');
    }
  };

  // Funds Actions
  const addBankDefinition = (name: string, currency: 'old_riyal' | 'new_riyal') => {
    const newDef: BankDefinition = {
      id: generateId(),
      name,
      currency,
      isActive: true
    };
    setBankDefinitions(prev => [...prev, newDef]);
  };

  const toggleBankDefinition = (id: string) => {
    setBankDefinitions(prev => prev.map(def => def.id === id ? { ...def, isActive: !def.isActive } : def));
  };

  const saveFundSnapshot = (snapshot: FundSnapshot) => {
    setFundSnapshots(prev => [snapshot, ...prev]);
  };

  // --- Color Customization Functions ---
  const applyColorScheme = (colors: ColorScheme) => {
    const root = document.documentElement;
    root.style.setProperty('--color-header', colors.header);
    root.style.setProperty('--color-sidebar', colors.sidebar);
    root.style.setProperty('--color-active', colors.active);
    root.style.setProperty('--color-link', colors.link);
    root.style.setProperty('--color-background', colors.background);
    root.style.setProperty('--color-success', colors.success);

    // Apply background to body for particles visibility
    document.body.style.backgroundColor = colors.background;
  };

  const updateColorScheme = (colors: Partial<ColorScheme>) => {
    const newColors = { ...colorScheme, ...colors };
    setColorScheme(newColors);
    applyColorScheme(newColors);
  };

  const resetColors = () => {
    const defaultColors: ColorScheme = {
      header: '#C62828',
      sidebar: '#263238',
      active: '#FFB300',
      link: '#4FC3F7',
      background: '#F5F5F5',
      success: '#4CAF50'
    };
    setColorScheme(defaultColors);
    applyColorScheme(defaultColors);
  };

  // --- Particles Configuration Functions ---
  const updateParticlesConfig = (config: Partial<ParticlesConfig>) => {
    setParticlesConfig(prev => ({ ...prev, ...config }));
  };

  const contextValue: AppContextType = {
    theme,
    toggleTheme,
    currency,
    setCurrency,
    colorScheme,
    updateColorScheme,
    resetColors,
    particlesConfig,
    updateParticlesConfig,
    currentUser,
    users,
    login,
    logout,
    addUser,
    deleteUser,
    toggleUserStatus,
    updateUserName,
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
    fundSnapshots,
    saveFundSnapshot
  };

  return (
    <AppContext.Provider value={contextValue}>
      <ParticlesBackground />
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={!currentUser ? <LoginPage /> : <Navigate to="/" />} />

        {/* Protected Routes with Sidebar Layout */}
        <Route path="/" element={currentUser ? <Layout /> : <Navigate to="/login" />}>
          <Route index element={<DashboardPage />} />
          <Route path="input" element={<InputPage />} />
          <Route path="analysis" element={<AnalysisPage />} />
          <Route path="funds" element={<FundsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </AppContext.Provider>
  );
};

export default App;