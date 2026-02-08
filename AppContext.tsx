import { createContext, useContext } from 'react';

// --- Types ---

export type Currency = 'SAR' | 'YER' | 'USD';
export type Theme = 'light' | 'dark';
export type UserRole = 'admin' | 'user' | 'super_admin';

export interface User {
    id: string;
    username: string;
    name: string; // Employee Name
    passwordHash: string;
    role: UserRole;
    isActive: boolean; // Activation Status
}

export interface ReconData {
    id: string;
    restaurantName: string;
    companyRaw: string;
    restaurantRaw: string;
    date: string;
    totalAmount: number;
    calculatedVariance: number;
    status: 'matched' | 'diff' | 'draft';
    manualLinks: Record<string, string>;
}

// Funds Data Types
export type FundsCurrency = 'old_riyal' | 'new_riyal' | 'sar' | 'blue_usd' | 'white_usd' | 'custom';

export interface BankDefinition {
    id: string;
    name: string;
    currency: FundsCurrency;
    customCurrencyName?: string; // For custom currencies
    accountNumber?: string; // Account number for display
    isActive: boolean;
}

export interface FundLineItem {
    id: string; // unique for this session/row
    bankDefId: string;
    bankName: string; // Snapshot of name
    sysBalance: number;
    bankBalance: number;
    variance: number;
    notes: string;
    isCompleted: boolean;
    completedAt?: string; // Time string "03:20 PM"
}

// Color Customization System
export interface ColorScheme {
    header: string;          // الشريط العلوي
    sidebar: string;         // القائمة الجانبية
    active: string;          // العنصر النشط
    link: string;            // الروابط والبحث
    background: string;      // خلفية البيانات
    success: string;         // الحالات الإيجابية
}

// Particles Background Configuration
export type ParticleType = 'dollar' | 'stars' | 'circles' | 'all' | 'none';

export interface ParticlesConfig {
    enabled: boolean;
    type: ParticleType;
    count: number;
    speed: number;
    interactionStrength: number;
}

export interface FundSnapshot {
    id: string;
    date: string; // DD/MM/YYYY
    fullTimestamp: string;
    user: string;

    // Local Currencies
    oldRiyalItems: FundLineItem[];
    newRiyalItems: FundLineItem[];
    totalVarianceOld: number;
    totalVarianceNew: number;

    // Foreign Currencies
    sarItems?: FundLineItem[];
    blueUsdItems?: FundLineItem[];
    whiteUsdItems?: FundLineItem[];
    customCurrencyItems?: FundLineItem[];
    totalVarianceSar?: number;
    totalVarianceBlueUsd?: number;
    totalVarianceWhiteUsd?: number;
    totalVarianceCustom?: number;

    // Status & Permissions
    status?: 'draft' | 'completed' | 'approved';
    canEdit?: boolean;
}

export interface AppContextType {
    theme: Theme;
    toggleTheme: () => void;
    currency: Currency;
    setCurrency: (c: Currency) => void;

    // Color Customization
    colorScheme: ColorScheme;
    updateColorScheme: (colors: Partial<ColorScheme>) => void;
    resetColors: () => void;

    // Particles Background
    particlesConfig: ParticlesConfig;
    updateParticlesConfig: (config: Partial<ParticlesConfig>) => void;

    // Auth
    currentUser: User | null;
    users: User[];
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => void;
    addUser: (username: string, password: string, name: string, role: UserRole) => Promise<void>;
    deleteUser: (id: string) => void;
    toggleUserStatus: (id: string) => void;
    updateUser: (id: string, updates: { username?: string; name?: string; password?: string }) => Promise<boolean>;

    // Restaurant Recon Data
    currentData: ReconData;
    updateCurrentData: (data: Partial<ReconData>) => void;
    resetCurrentData: () => void;
    history: ReconData[];
    addToHistory: (data: ReconData) => void;
    updateHistoryItem: (id: string, data: Partial<ReconData>) => void;
    loadFromHistory: (id: string) => void;

    // Funds / Bank Configuration
    bankDefinitions: BankDefinition[];
    addBankDefinition: (name: string, currency: FundsCurrency, accountNumber?: string, customCurrencyName?: string) => void;
    toggleBankDefinition: (id: string) => void;
    deleteBankDefinition: (id: string) => void; // Admin+ only

    // Funds Snapshots
    fundSnapshots: FundSnapshot[];
    saveFundSnapshot: (snapshot: FundSnapshot) => void;
    deleteFundSnapshot: (id: string) => void; // Super_admin only
    editFundSnapshot: (id: string) => FundLineItem[]; // Returns line items for editing
}

export const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error("useAppContext must be used within App provider");
    return context;
};
