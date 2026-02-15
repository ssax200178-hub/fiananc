import { createContext, useContext } from 'react';

// --- Types ---

export type Theme = 'light' | 'dark';
export type UserRole = 'admin' | 'user' | 'super_admin';

export type UserPermission =
    | 'view_dashboard'
    | 'manage_restaurants'
    | 'manage_funds'
    | 'delete_funds'
    | 'view_history'
    | 'view_activity_logs'
    | 'manage_users'
    | 'manage_settings'
    | 'manage_tips';

export interface User {
    id: string;
    username: string;
    name: string; // Employee Name
    role: UserRole;
    isActive: boolean; // Activation Status
    email?: string; // Add email for Firebase
    permissions?: UserPermission[]; // Detailed permissions
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

export interface FundSnapshot {
    id: string;
    date: string; // DD/MM/YYYY
    fullTimestamp: string;
    user: string;
    type?: 'local' | 'foreign' | 'full';

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

// Financial Tips Types
export type TipType = 'tip' | 'alert' | 'guidance' | 'warning';

export interface FinancialTip {
    id: string;
    text: string;
    type: TipType;
    icon: string;
    isActive: boolean;
    createdAt: string;
}

// Restaurant Directory Types
export interface TransferAccount {
    id: string;
    type: string; // e.g., بنكي, محفظة, إلخ
    accountNumber: string;
    beneficiaryName: string;
    isPrimary?: boolean;
}

export interface Restaurant {
    id: string;
    branch: string;
    restaurantAccountNumber: string;
    name: string;
    ownerName: string;
    phone: string;
    secondaryPhone?: string;
    secondaryPhoneOwner?: string;
    transferAccounts: TransferAccount[];
    paymentPeriod: 'monthly' | 'semi-monthly';
    currencyType: 'old_riyal' | 'new_riyal';
    balance?: number;
    createdAt: string;
    isActive: boolean;
}

export interface ActivityLog {
    id: string;
    userId: string;
    userName: string;
    action: string;
    details: string;
    timestamp: string;
    category: 'auth' | 'restaurant' | 'funds' | 'recon' | 'settings' | 'general' | 'tips';
}

export interface AppContextType {
    // Auth
    currentUser: User | null;
    users: User[];
    theme: Theme;
    colors: { positive: string; negative: string; matched: string };
    toggleTheme: () => void;
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => void;
    changePassword: (newPassword: string) => Promise<void>;
    addUser: (username: string, password: string, name: string, role: UserRole) => Promise<void>;
    deleteUser: (id: string) => void;
    toggleUserStatus: (id: string) => void;
    updateUser: (id: string, updates: { username?: string; name?: string; password?: string; permissions?: UserPermission[] }) => Promise<boolean>;

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
    updateBankDefinition: (id: string, updates: Partial<BankDefinition>) => void; // Admin+ only
    deleteBankDefinition: (id: string) => void; // Admin+ only

    // Funds Snapshots
    fundSnapshots: FundSnapshot[];
    saveFundSnapshot: (snapshot: FundSnapshot) => void;
    deleteFundSnapshot: (id: string) => void; // Super_admin only
    editFundSnapshot: (id: string) => FundLineItem[]; // Returns line items for editing

    // Fund Draft (shared across devices)
    fundDraftItems: FundLineItem[];
    saveFundDraft: (items: FundLineItem[]) => void;
    clearFundDraft: () => void;

    // Financial Tips
    financialTips: FinancialTip[];
    addFinancialTip: (text: string, type: TipType, icon: string) => Promise<void>;
    updateFinancialTip: (id: string, updates: Partial<FinancialTip>) => Promise<void>;
    deleteFinancialTip: (id: string) => Promise<void>;

    // Restaurant Directory
    restaurants: Restaurant[];
    addRestaurant: (data: Omit<Restaurant, 'id' | 'createdAt' | 'isActive'>) => Promise<string>;
    updateRestaurant: (id: string, updates: Partial<Restaurant>) => Promise<void>;
    deleteRestaurant: (id: string) => Promise<void>;
    mergeRestaurants: () => Promise<void>;
    getCurrencyByBranch: (branch?: string) => 'old_riyal' | 'new_riyal';

    // System Activity Logs
    activityLogs: ActivityLog[];
    addLog: (action: string, details: string, category: ActivityLog['category']) => Promise<void>;

    isLoading: boolean;
}

export const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error("useAppContext must be used within App provider");
    return context;
};
