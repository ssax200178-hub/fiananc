import { createContext, useContext } from 'react';

// --- Types ---

export type Theme = 'light' | 'dark';
export type UserRole = 'admin' | 'user' | 'super_admin';
export type Currency = 'SAR' | 'YER' | 'USD';

export type UserPermission =
    // Dashboard
    | 'dashboard_view'
    | 'notifications_view'
    | 'notifications_payments'
    | 'notifications_liquidity'
    // Restaurants
    | 'restaurants_view'
    | 'restaurants_add'
    | 'restaurants_edit'
    | 'restaurants_delete'
    | 'restaurants_import'
    // Funds
    | 'funds_view'
    | 'funds_add'
    | 'funds_edit'
    | 'funds_delete'
    // Recon
    | 'recon_view'
    | 'recon_add'
    // Payments
    | 'payments_view'
    | 'payments_manage'
    // Archives
    | 'archives_view'
    | 'archives_details'
    | 'archives_download'
    | 'archives_delete'
    // Activity Logs
    | 'logs_view'
    // Users
    | 'users_view'
    | 'users_add'
    | 'users_edit'
    | 'users_delete'
    | 'users_permissions'
    | 'employees_import'
    // Settings
    | 'settings_manage'
    | 'developer_access'
    // Tips
    | 'tips_view'
    | 'tips_add'
    | 'tips_delete'
    // Loans
    | 'loans_view'
    | 'loans_add'
    | 'loans_edit'
    | 'loans_delete'
    | 'loans_approve'
    | 'salary_view'
    // Branches
    | 'branches_view'
    | 'branches_add'
    | 'branches_edit'
    | 'branches_delete'
    // Exchange Rates
    | 'exchange_rates_manage'
    // Loan Reports
    | 'loan_reports_view'
    // Invoice Disbursement (legacy)
    | 'invoice_manage'
    // Invoice Batches (new granular)
    | 'invoice_batches_view'
    | 'invoice_batches_create'
    | 'invoice_batches_edit'
    | 'invoice_batches_delete'
    | 'batch_items_create'
    | 'batch_items_edit'
    | 'batch_items_delete'
    | 'financial_details_view'
    | 'financial_details_manage'
    | 'reports_view'
    // Phone Payments
    | 'phone_payments_manage'
    // Phone Providers
    | 'phone_providers_manage'
    // Tools
    | 'tools_manage'
    // Deductions
    | 'deductions_view'
    | 'deductions_manage'
    // Journal Entries
    | 'journal_entries_manage'
    | 'chart_of_accounts_manage'
    // Legacy (kept for migration)
    | 'view_dashboard'
    | 'manage_restaurants'
    | 'manage_funds'
    | 'delete_funds'
    | 'view_history'
    | 'view_activity_logs'
    | 'manage_users'
    | 'manage_settings'
    | 'manage_tips';

export interface PermissionItem {
    key: UserPermission;
    label: string;
    icon: string;
    description: string;
}

export interface PermissionGroup {
    id: string;
    label: string;
    icon: string;
    color: string;
    permissions: PermissionItem[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
    {
        id: 'dashboard', label: 'لوحة التحكم', icon: 'dashboard', color: 'blue',
        permissions: [
            { key: 'dashboard_view', label: 'عرض لوحة التحكم', icon: 'visibility', description: 'السماح بمراجعة الملخص المالي العام' },
        ]
    },
    {
        id: 'restaurants', label: 'دليل المطاعم', icon: 'storefront', color: 'orange',
        permissions: [
            { key: 'restaurants_view', label: 'عرض المطاعم', icon: 'visibility', description: 'مشاهدة قائمة المطاعم وبياناتها' },
            { key: 'restaurants_add', label: 'إضافة مطعم', icon: 'add_business', description: 'إضافة مطعم جديد للنظام' },
            { key: 'restaurants_edit', label: 'تعديل بيانات مطعم', icon: 'edit', description: 'تعديل بيانات وحسابات المطاعم' },
            { key: 'restaurants_delete', label: 'حذف مطعم', icon: 'delete', description: 'حذف مطعم من النظام' },
            { key: 'restaurants_import', label: 'استيراد من إكسل', icon: 'upload_file', description: 'استيراد بيانات مطاعم من ملف إكسل' },
        ]
    },
    {
        id: 'funds', label: 'مطابقة الصناديق', icon: 'account_balance', color: 'green',
        permissions: [
            { key: 'funds_view', label: 'عرض الصناديق', icon: 'visibility', description: 'مشاهدة صفحة مطابقة الصناديق' },
            { key: 'funds_add', label: 'إضافة مطابقة', icon: 'add_circle', description: 'إجراء وحفظ مطابقة جديدة' },
            { key: 'funds_edit', label: 'تعديل مطابقة', icon: 'edit', description: 'تعديل لقطات الرصيد المحفوظة' },
            { key: 'funds_delete', label: 'حذف مطابقة', icon: 'delete', description: 'حذف سجلات مطابقة محفوظة' },
        ]
    },
    {
        id: 'recon', label: 'مطابقة المطاعم', icon: 'restaurant', color: 'purple',
        permissions: [
            { key: 'recon_view', label: 'عرض المطابقة', icon: 'visibility', description: 'مشاهدة صفحة مطابقة المطاعم' },
            { key: 'recon_add', label: 'إضافة تسوية', icon: 'add_circle', description: 'إضافة تسوية مطابقة جديدة' },
        ]
    },
    {
        id: 'payments', label: 'سداد المطاعم', icon: 'payments', color: 'teal',
        permissions: [
            { key: 'payments_view', label: 'عرض صفحة السداد', icon: 'visibility', description: 'مشاهدة صفحة سداد المطاعم' },
            { key: 'payments_manage', label: 'إدارة عمليات السداد', icon: 'manage_accounts', description: 'إجراء وتأكيد عمليات السداد' },
        ]
    },
    {
        id: 'archives', label: 'أرشيف الكشوفات', icon: 'inventory_2', color: 'amber',
        permissions: [
            { key: 'archives_view', label: 'عرض الأرشيف', icon: 'visibility', description: 'مشاهدة قائمة الكشوفات المؤرشفة' },
            { key: 'archives_details', label: 'عرض التفاصيل', icon: 'description', description: 'مشاهدة تفاصيل البيانات داخل الأرشيف' },
            { key: 'archives_download', label: 'تحميل الملفات', icon: 'download', description: 'تحميل الكشوفات كملفات ZIP' },
            { key: 'archives_delete', label: 'حذف الأرشيف', icon: 'delete', description: 'حذف سجلات الأرشيف نهائياً' },
        ]
    },
    {
        id: 'loans', label: 'طلبات السلف', icon: 'payments', color: 'indigo',
        permissions: [
            { key: 'loans_view', label: 'عرض السلف', icon: 'visibility', description: 'مشاهدة قائمة طلبات السلف' },
            { key: 'loans_add', label: 'إضافة سلفة', icon: 'add_circle', description: 'إمكانية إضافة طلبات سلف جديدة' },
            { key: 'loans_edit', label: 'تعديل سلفة', icon: 'edit', description: 'إمكانية تعديل بيانات طلبات السلف القائمة' },
            { key: 'loans_delete', label: 'حذف سلفة', icon: 'delete', description: 'إمكانية حذف طلبات السلف' },
            { key: 'loans_approve', label: 'اعتماد السلف', icon: 'how_to_reg', description: 'اعتماد وترحيل طلبات السلف إلى السجل' },
            { key: 'salary_view', label: 'عرض الرواتب', icon: 'attach_money', description: 'رؤية المعلومات المالية الخاصة بالموظفين (الرواتب)' },
        ]
    },
    {
        id: 'deductions', label: 'الخصميات والإنذارات', icon: 'money_off', color: 'pink',
        permissions: [
            { key: 'deductions_view', label: 'عرض الخصميات', icon: 'money_off', description: 'مشاهدة سجل الخصميات والإنذارات للموظفين' },
            { key: 'deductions_manage', label: 'إدارة الخصميات', icon: 'edit_calendar', description: 'إضافة وتعديل وحذف الخصميات والإنذارات' },
        ]
    },
    {
        id: 'logs', label: 'سجل النشاط', icon: 'history_edu', color: 'slate',
        permissions: [
            { key: 'logs_view', label: 'عرض سجل النشاط', icon: 'visibility', description: 'مراقبة كافة تحركات الموظفين' },
        ]
    },
    {
        id: 'users', label: 'إدارة الموظفين', icon: 'group', color: 'red',
        permissions: [
            { key: 'users_view', label: 'عرض الموظفين', icon: 'visibility', description: 'مشاهدة قائمة الموظفين' },
            { key: 'users_add', label: 'إضافة موظف', icon: 'person_add', description: 'إضافة موظف جديد للنظام' },
            { key: 'users_edit', label: 'تعديل بيانات موظف', icon: 'edit', description: 'تعديل بيانات الموظفين' },
            { key: 'users_delete', label: 'حذف موظف', icon: 'person_remove', description: 'حذف حساب موظف من النظام' },
            { key: 'users_permissions', label: 'إدارة الصلاحيات', icon: 'admin_panel_settings', description: 'منح أو سحب صلاحيات الموظفين' },
            { key: 'employees_import', label: 'استيراد موظفين', icon: 'upload_file', description: 'استيراد بيانات الموظفين من ملف إكسل' },
        ]
    },
    {
        id: 'branches', label: 'إدارة الفروع', icon: 'domain', color: 'teal',
        permissions: [
            { key: 'branches_view', label: 'عرض الفروع', icon: 'visibility', description: 'مشاهدة قائمة الفروع' },
            { key: 'branches_add', label: 'إضافة فرع', icon: 'add_circle', description: 'إضافة فرع جديد' },
            { key: 'branches_edit', label: 'تعديل فرع', icon: 'edit', description: 'تعديل بيانات الفروع' },
            { key: 'branches_delete', label: 'حذف فرع', icon: 'delete', description: 'حذف فرع من النظام' },
        ]
    },
    {
        id: 'settings', label: 'إعدادات الإدارة', icon: 'settings_suggest', color: 'cyan',
        permissions: [
            { key: 'settings_manage', label: 'إدارة الإعدادات', icon: 'tune', description: 'التحكم في إعدادات النظام العامة' },
            { key: 'exchange_rates_manage', label: 'إدارة أسعار الصرف', icon: 'currency_exchange', description: 'تعديل أسعار صرف العملات' },
            { key: 'developer_access', label: 'صلاحيات المطورين', icon: 'terminal', description: 'الوصول إلى أدوات المطورين وملاحظات النظام' },
        ]
    },
    {
        id: 'tips', label: 'التوجيهات المالية', icon: 'lightbulb', color: 'amber',
        permissions: [
            { key: 'tips_view', label: 'عرض التوجيهات', icon: 'visibility', description: 'مشاهدة النصائح والتوجيهات المالية' },
            { key: 'tips_add', label: 'إضافة توجيه', icon: 'add_circle', description: 'إضافة نصيحة أو توجيه مالي جديد' },
            { key: 'tips_delete', label: 'حذف توجيه', icon: 'delete', description: 'حذف نصيحة أو توجيه مالي' },
        ]
    },
    {
        id: 'invoices', label: 'دفاتر الفواتير', icon: 'receipt_long', color: 'blue',
        permissions: [
            { key: 'invoice_manage', label: 'إدارة صرف الفواتير (قديم)', icon: 'manage_accounts', description: 'صلاحية قديمة: إدارة دفعات الفواتير' },
            { key: 'invoice_batches_view', label: 'عرض الدفعات', icon: 'visibility', description: 'مشاهدة قائمة دفعات الفواتير' },
            { key: 'invoice_batches_create', label: 'إنشاء دفعة', icon: 'add_circle', description: 'إنشاء دفعة فواتير جديدة' },
            { key: 'invoice_batches_edit', label: 'تعديل دفعة', icon: 'edit', description: 'تعديل بيانات دفعة فواتير' },
            { key: 'invoice_batches_delete', label: 'حذف دفعة', icon: 'delete', description: 'حذف دفعة فواتير' },
            { key: 'batch_items_create', label: 'إضافة صرف لفرع', icon: 'add_business', description: 'إضافة صرف دفاتر لفرع' },
            { key: 'batch_items_edit', label: 'تعديل صرف', icon: 'edit_note', description: 'تعديل بيانات صرف دفاتر' },
            { key: 'batch_items_delete', label: 'حذف صرف', icon: 'delete_sweep', description: 'حذف سجل صرف دفاتر' },
            { key: 'financial_details_view', label: 'عرض التفاصيل المالية', icon: 'attach_money', description: 'رؤية المبالغ والعملات في جداول الدفاتر' },
            { key: 'financial_details_manage', label: 'إدارة القيود', icon: 'receipt', description: 'تعديل أرقام القيود وتأكيد الترحيل' },
            { key: 'reports_view', label: 'عرض التقارير', icon: 'analytics', description: 'عرض تقارير صرف الدفاتر' },
        ]
    },
    {
        id: 'phone_payments', label: 'سداد الهواتف', icon: 'phone_iphone', color: 'purple',
        permissions: [
            { key: 'phone_payments_manage', label: 'إدارة سداد الهواتف', icon: 'manage_accounts', description: 'تسجيل وإدارة مدفوعات هواتف الفروع والدراجات النارية' },
            { key: 'phone_providers_manage', label: 'إدارة المزودين', icon: 'settings_remote', description: 'إضافة وتعديل مزودي خدمة الاتصالات' },
        ]
    },
    {
        id: 'journal_entries', label: 'القيود المحاسبية', icon: 'edit_note', color: 'violet',
        permissions: [
            { key: 'journal_entries_manage', label: 'إدارة القيود', icon: 'receipt_long', description: 'إنشاء ومعاينة وحفظ القيود المحاسبية (بسيطة ومركبة وجماعية)' },
            { key: 'chart_of_accounts_manage', label: 'إدارة دليل الحسابات', icon: 'account_tree', description: 'استيراد وإضافة وتعديل وحذف الحسابات الرئيسية والتحليلية' },
        ]
    },
    {
        id: 'tools', label: 'الأدوات الإضافية', icon: 'build', color: 'slate',
        permissions: [
            { key: 'tools_manage', label: 'إدارة الأدوات', icon: 'handyman', description: 'استخدام أدوات النظام مثل تحويل الأرصدة ومزامنة العملة' },
        ]
    },
    {
        id: 'system', label: 'الإشعارات والتنبيهات', icon: 'notifications_active', color: 'rose',
        permissions: [
            { key: 'notifications_view', label: 'عرض جرس الإشعارات', icon: 'notifications', description: 'إظهار أيقونة الجرس في الشريط العلوي' },
            { key: 'notifications_payments', label: 'تنبيهات سداد المطاعم', icon: 'payments', description: 'تلقي إشعارات بقرب مواعيد سداد المطاعم' },
            { key: 'notifications_liquidity', label: 'تنبيهات عجز السيولة', icon: 'warning', description: 'تلقي إشعارات بوجود عجز في سيولة الصناديق' },
        ]
    },
];

// Migration map: old permission -> new permissions
export const OLD_TO_NEW_PERMISSIONS: Record<string, UserPermission[]> = {
    'view_dashboard': ['dashboard_view'],
    'manage_restaurants': ['restaurants_view', 'restaurants_add', 'restaurants_edit', 'restaurants_delete', 'restaurants_import'],
    'manage_funds': ['funds_view', 'funds_add', 'funds_edit', 'recon_view', 'recon_add', 'payments_view', 'payments_manage', 'archives_view'],
    'delete_funds': ['funds_delete'],
    'view_history': ['archives_view'],
    'view_activity_logs': ['logs_view'],
    'manage_users': ['users_view', 'users_add', 'users_edit', 'users_delete', 'users_permissions', 'employees_import'],
    'manage_settings': ['settings_manage', 'developer_access'],
    'manage_tips': ['tips_view', 'tips_add', 'tips_delete'],
};

// All new permission keys (for defaults)
export const ALL_NEW_PERMISSIONS: UserPermission[] = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key));

export interface User {
    id: string;
    username: string;
    name: string; // Employee Name
    role: UserRole;
    isActive: boolean; // Activation Status
    email?: string; // Add email for Firebase
    firebaseUid?: string; // Firebase Auth UID (for security rules)
    permissions?: UserPermission[]; // Detailed permissions
    lastSeenAt?: string; // ISO timestamp of last login
}

export interface ReconData {
    id: string;
    restaurantName: string;
    companyRaw: string;
    restaurantRaw: string;
    companyFileName?: string;
    restaurantFileName?: string;
    date: string;
    totalAmount: number;
    calculatedVariance: number;
    status: 'matched' | 'diff' | 'draft' | 'review' | 'approved' | 'archived';
    manualLinks: Record<string, string>;
    count?: number;
    // Phase 1.2: Ignored auto-links (pairs that were auto-linked but user explicitly unlinked)
    ignoredAutoLinks?: Record<string, string>; // { companyTxnId: restaurantTxnId }
    // Phase 2.4: Dismissed items (items zeroed out with a note)
    dismissedItems?: Record<string, string>; // { txnId: dismissNote }
    // Phase 5: Variance resolution
    commissionRate?: number;
    resolutions?: Record<string, { captainName: string; accountingRef: string; note: string; resolved: boolean }>;
    // Phase 6.2: Notes on individual entries
    entryNotes?: Record<string, string>; // { txnId: noteText }
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
    draftCount?: number; // Added for Phase 7
    draftAmount?: number; // Added for Phase 7
    lastModifierName?: string;
    lastModifiedAt?: number;
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
    subType?: 'old_riyal' | 'new_riyal';
    snapshots?: Record<string, { type: string; noteUrl: string; timestamp: string }>;
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
export const ACCOUNT_TYPES = [
    'بنكي',
    'محفظة',
    'كريمي',
    'كريمي ميز (Pro)',
    'بنك التضامن',
    'بنك اليمن والكويت',
    'محفظة m-money',
    'ون كاش',
    'جوال موني',
    'بي بلس',
    'جيب',
    'أخرى'
];

export const APPROVAL_PERIODS = [
    'يناير 1', 'يناير 2', 'فبراير 1', 'فبراير 2', 'مارس 1', 'مارس 2',
    'أبريل 1', 'أبريل 2', 'مايو 1', 'مايو 2', 'يونيو 1', 'يونيو 2',
    'يوليو 1', 'يوليو 2', 'أغسطس 1', 'أغسطس 2', 'سبتمبر 1', 'سبتمبر 2',
    'أكتوبر 1', 'أكتوبر 2', 'نوفمبر 1', 'نوفمبر 2', 'ديسمبر 1', 'ديسمبر 2'
];

export interface TransferAccount {
    id: string;
    type: string; // e.g., بنكي, محفظة, إلخ
    accountNumber: string;
    beneficiaryName: string;
    isPrimary?: boolean;
    parentAccountId?: string; // id الحساب الرئيسي إذا كان فرعياً
    isActive?: boolean;
    uniqueCode?: string; // الرقم المميز لكريمي
    approvalPeriod?: string; // فترة الاعتماد
    status?: 'pending' | 'approved' | 'error'; // حالة الاعتماد
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
    createdAt: string;
    isActive: boolean;
    classification?: string;
    clientType?: string;
    logoUrl?: string;
    balance?: number; // Current payment balance
    systemAccountNumber?: string; // رقم الحساب في النظام الأساسي (tawseel.app)
}

export interface LiquidityMapping {
    id: string;
    publicName: string;
    restaurantAccountTypes: string[];
    bankDefIds: string[];
}

export interface ActivityLog {
    id: string;
    userId: string;
    userName: string;
    action: string;
    details: string;
    timestamp: string;
    category: 'auth' | 'restaurant' | 'funds' | 'recon' | 'settings' | 'general' | 'tips' | 'users';
}

export type TransferPurpose = 'new_contract' | 'update_contact' | 'update_transfer';

export type FeedbackType = 'bug' | 'suggestion' | 'improvement';

export interface DevFeedbackSettings {
    allowImageAttachments: boolean;
    allowAudioRecordings: boolean;
    whatsappNumber?: string;
    supportPhone?: string;
    updatedAt: string;
    updatedBy: string;
}

export interface Feedback {
    id: string;
    userId: string;
    userName: string;
    branch: string;
    message: string;
    type?: FeedbackType;
    attachments?: {
        imageUrl?: string;
        audioUrl?: string;
    };
    status: 'new' | 'in-progress' | 'resolved' | 'closed';
    createdAt: string;
    resolvedAt?: string;
    resolvedBy?: string;
    adminNotes?: string;
}

export interface FeatureFlags {
    [key: string]: boolean;
}

// الخصميات والإنذارات
export type DeductionType = 'verbal_warning' | 'quarter_day' | 'half_day' | 'full_day_warning' | 'full_day';

export interface Deduction {
    id: string;
    employeeId: string;
    employeeName: string;
    branch: string;
    type: DeductionType;
    amount: number;       // المبلغ المخصوم (0 للإنذار الشفهي)
    date: string;         // تاريخ الخصم DD/MM/YYYY
    month: string;        // الشهر المالي (يناير 1، فبراير 2...) لتسهيل الربط مع الرواتب
    notes: string;
    isExempted?: boolean;   // معفى من الغرامة
    exemptedAt?: string;
    exemptedByName?: string;
    exemptionReason?: string;
    createdAt: string;
    createdBy: string;    // userId
}

// صرف دفاتر الفواتير — دفعات رئيسية
export interface InvoiceBatch {
    id: string;
    name: string;                          // اسم الدفعة
    rangeFrom: number;                     // بداية النطاق الكلي
    rangeTo: number;                       // نهاية النطاق الكلي
    totalBooklets: number;                 // عدد الدفاتر الكلي (افتراضي 4000)
    totalAmountPrint: number;              // مبلغ طباعة الفواتير
    totalAmountStamp: number;              // أجور التختيم
    totalAmountTransport: number;          // أجور النقل
    totalAmount: number;                   // المبلغ الإجمالي (مجموع ما سبق)
    issueDate: string;                     // تاريخ الإصدار
    createdAt: string;
    createdBy: string;
    notes?: string;
    accountNumber?: string;                // رقم حساب المخزون/الدفعة
}

// صرف دفاتر الفواتير — عناصر الصرف للفروع
export interface InvoiceBatchItem {
    id: string;
    batchId: string;
    branchId: string;
    branchName: string;
    rangeFrom: number;                     // بداية النطاق الفرعي
    rangeTo: number;                       // نهاية النطاق الفرعي
    bookletCount: number;                  // عدد الدفاتر
    bookletPrice: number;                  // سعر الدفتر
    amountOld: number;                     // المبلغ بالريال القديم
    amountNew?: number;                    // المبلغ بالريال الجديد
    exchangeRateOld: number;               // سعر صرف الريال القديم
    exchangeRateNew: number;               // سعر صرف الريال الجديد
    entryNumber?: string;                  // رقم القيد
    contraEntryNumber?: string;            // القيد المقابل
    disbursementDescription: string;       // بيان قيد صرف الفواتير
    exchangeRateDescription: string;       // بيان قيد سعر صرف الفواتير
    disbursementDate: string;              // تاريخ الصرف
    isPosted: boolean;                     // هل تم ترحيل القيد
    createdBy: string;
    updatedAt?: string;
}

// Legacy Invoice type (kept for backward compatibility)
export interface Invoice {
    id: string;
    batchId: string;
    branchId: string;
    branchName: string;
    invoiceNumber: string;
    amount: number;
    exchangeRate?: number;
    notes?: string;
}

// سداد هواتف الفروع
export interface BranchPhone {
    id: string;
    branchId: string;
    phoneId: string;            // المعرف الخاص بالرقم (مثال: رقم مالي)
    systemAccountName?: string; // اسم الحساب في النظام
    phoneNumber: string;
    employeeId?: string;        // الموظف المستلم (اختياري)
    employeeName?: string;
    currency: 'new_riyal' | 'old_riyal';  // العملة الافتراضية لهذا الرقم
    provider?: string;           // المزود الافتراضي (يمكن تركه لوقت السداد)
    isActive: boolean;
    notes?: string;
    createdAt: string;
}

export interface PhoneProvider {
    id: string;
    name: string;                // سبأفون، MTN، يمن موبايل، ...
    isActive: boolean;
    systemAccountId?: string;    // ID of the corresponding system account for dropdowns
}

export interface PhonePayment {
    id: string;
    branchId: string;
    branchName: string;
    branchPhoneId?: string;                // معرف الوثيقة في Firestore للرقم
    phoneId?: string;                      // معرف الرقم المالي (Custom ID)
    systemAccountName?: string;             // اسم الحساب في النظام (لحظة السداد)
    employeeId?: string;
    employeeName?: string;
    phoneNumber: string;
    amount: number;
    currency: 'new_riyal' | 'old_riyal';
    provider: string;                      // المزود (سبأفون، MTN، يمن موبايل)
    paymentDate: string;                   // تاريخ السداد
    refNumber?: string;                    // الرقم المرجعي (لمنع التكرار)
    isRefunded?: boolean;                  // هل هي عملية مستردة؟
    refundRefId?: string;                  // رابط لعملية السداد الأصلية في حال كان استرداداً
    pdfImported?: boolean;                 // هل تم استيرادها من PDF؟
    isBooked?: boolean;                    // هل تم قيدها محاسبياً؟
    bookedAt?: string;                     // تاريخ القيد
    paidBy: string;                        // userId
    notes?: string;
    createdAt: string;
}

export interface TransferRequest {
    id: string;
    restaurantId: string;
    restaurantName: string; // added to be safe
    amount: number;
    status: 'pending' | 'completed' | 'rejected';
    // Core Restaurant Data
    branch: string;
    restaurantAccountNumber: string;
    name: string;
    ownerName: string;
    phone: string;
    // Transfer Details
    transferType: string;
    transferAccountNumber: string;
    transferBeneficiary: string;
    // Metadata
    approvalPeriod: string; // فترة الاعتماد e.g., "نوفمبر 1"
    isVerified: boolean; // تم التأكد من البيانات
    purpose: TransferPurpose; // الغرض
    uniqueNumber?: string;
    createdAt: string;
    createdBy?: string;
    createdByName?: string;
    processedBy?: string;
    processedByName?: string;
    processedAt?: string;
    updatedAt?: string;
}

// Simplified payment accounts

export interface PaymentAccount {
    id: string;
    accountName: string;
    isMain: boolean;
    parentId?: string; // Link to main account if this is sub
    useUniqueNumber: boolean;
    isActive: boolean;
    createdAt: string;
    systemAccountNumber?: string; // Account Number from Chart of Accounts
}

export interface LoanRequest {
    id: string;
    employeeId: string;
    employeeName: string;
    branch: string;
    date: string; // DD/MM/YYYY
    requestedAmount: number; // السلفة المطلوبة
    balance: number; // الرصيد
    status: 'debtor' | 'creditor'; // مدين / دائن
    basicSalary: number; // الراتب (بالعملة المحلية بعد التحويل)
    extraSalary: number; // الإضافي
    totalSalary: number; // الراتب مع الإضافي
    notes: string;
    isApproved?: boolean;
    approvedAt?: string;
    approvedByName?: string;
    isRejected?: boolean;
    rejectedAt?: string;
    rejectedByName?: string;
    rejectionReason?: string;
    createdAt: string;
    // حقول العملة الجديدة
    currency?: 'old_rial' | 'new_rial'; // العملة المحلية المستخدمة
    exchangeRateAtRequest?: number; // سعر الصرف وقت الطلب (إذا كان المصدر SAR)
}

export interface Employee {
    id: string;
    branch: string;
    systemAccountNumber: string; // رقم حساب الموظف في النظام
    name: string;
    phone: string;
    transferAccounts: TransferAccount[];
    createdAt: string;
    isActive: boolean;
    // الحقول الحالية للراتب (تبقى للتوافق + تستخدم عند المصدر YER)
    basicSalary?: number;
    extraSalary?: number;
    // حقول العملات الجديدة
    salaryCurrency?: 'old_rial' | 'new_rial';   // العملة المحلية المستهدفة
    salarySourceCurrency?: 'YER' | 'SAR';        // عملة مصدر الراتب
    basicSalaryInSource?: number;                 // الراتب الأساسي بعملة المصدر (SAR)
    extraSalaryInSource?: number;                 // الراتب الإضافي بعملة المصدر (SAR)
    position?: string;
}

// كيان الفرع الديناميكي
export interface Branch {
    id: string;
    name: string;                                  // الاسم المعروض
    currencyType: 'old_rial' | 'new_rial';         // العملة المحلية للفرع
    defaultSalarySource?: 'YER' | 'SAR';           // مصدر الراتب الافتراضي
    isActive: boolean;
    createdAt: string;
    // إعدادات القيد المحاسبي (الطرف الدائن / مدين)
    branchNumber?: string;           // رقم الفرع في النظام المحاسبي
    creditAccountNumber?: string;    // رقم الحساب الدائن الرئيسي (مثال: 25000)
    creditSubAccountNumber?: string; // رقم الحساب التحليلي الفرعي (مثال: 126)
    creditCostCenter?: string;       // اسم مركز التكلفة (عهد الموظفين)
    creditCostCenterId?: string;     // رقم مركز التكلفة (6)
}

// أسعار الصرف
export interface ExchangeRates {
    SAR_TO_OLD_RIAL: number;
    SAR_TO_NEW_RIAL: number;
    updatedAt: string;
    updatedBy: string;
}

export interface ExchangeRateHistory {
    id: string;
    SAR_TO_OLD_RIAL: number;
    SAR_TO_NEW_RIAL: number;
    updatedAt: string;
    updatedBy: string;
}

// أرصدة النظام المستخرجة من tawseel.app
export interface SystemBalance {
    id: string;              // معرف فريد (bank_accountNumber_currency أو rest_accountNumber_currency)
    accountNumber: string;   // رقم الحساب في النظام الأساسي
    accountName: string;     // اسم الحساب
    name: string;            // اسم الحساب (بديل)
    branch: string;          // الفرع
    currency: string;        // العملة (ريال قديم، ريال جديد، ريال سعودي...)
    debit: number;           // مدين
    credit: number;          // دائن
    balance: number;         // الرصيد
    difference: number;      // الفارق
    lastUpdated: string;     // آخر تحديث
    type: 'bank' | 'restaurant';  // نوع الحساب
}

// إعدادات ربط حسابات المطابقة بأرقام حسابات النظام الأساسي
export interface AccountMapping {
    id: string;
    bankDefId: string;              // معرف الحساب البنكي في المطابقة (BankDefinition.id)
    bankDefName: string;            // اسم الحساب البنكي في المطابقة
    systemAccountNumber: string;    // رقم الحساب المرتبط من النظام الأساسي
    type: 'bank' | 'restaurant';   // نوع الحساب
}

// بيانات المزامنة
export interface SyncMetadata {
    lastSync: string;
    status: 'success' | 'failed';
    bankCount: number;
    restaurantCount: number;
}

// Operational Sheets Types
export interface SheetRow {
    restaurantId: string;
    restaurantName: string;
    branch: string;
    data: Record<string, any>; // Dynamic columns
}

export interface OperationalSheet {
    id: string;
    name: string;
    date: string; // ISO or DD/MM/YYYY
    createdBy: string;
    rows: SheetRow[];
    columns: string[]; // Dynamic column headers defined by user
    createdAt: string;
}

export interface AppContextType {
    // Auth
    currentUser: User | null;
    users: User[];
    theme: Theme;
    currency: Currency;
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

    // Invoice Batches (New – دفاتر الفواتير)
    invoiceBatches: InvoiceBatch[];
    addInvoiceBatch: (batch: Omit<InvoiceBatch, 'id' | 'createdAt' | 'createdBy'>) => Promise<string>;
    updateInvoiceBatch: (id: string, updates: Partial<InvoiceBatch>) => Promise<void>;
    deleteInvoiceBatch: (id: string) => Promise<void>;

    // Invoice Batch Items
    invoiceBatchItems: InvoiceBatchItem[];
    allInvoiceBatchItems: InvoiceBatchItem[];
    addInvoiceBatchItem: (item: Omit<InvoiceBatchItem, 'id' | 'createdBy'>) => Promise<string>;
    updateInvoiceBatchItem: (id: string, updates: Partial<InvoiceBatchItem>) => Promise<void>;
    deleteInvoiceBatchItem: (id: string) => Promise<void>;
    loadBatchItems: (batchId: string) => void;

    // Phone Payments (New)
    phonePayments: PhonePayment[];
    addPhonePayment: (payment: Omit<PhonePayment, 'id' | 'createdAt' | 'paidBy'>) => Promise<string>;
    updatePhonePayment: (id: string, updates: Partial<PhonePayment>) => Promise<void>;
    deletePhonePayment: (id: string) => Promise<void>;

    // Branch Phones (Saved Numbers)
    branchPhones: BranchPhone[];
    addBranchPhone: (phone: Omit<BranchPhone, 'id' | 'createdAt'>) => Promise<string>;
    updateBranchPhone: (id: string, updates: Partial<BranchPhone>) => Promise<void>;
    deleteBranchPhone: (id: string) => Promise<void>;

    // Phone Providers
    phoneProviders: PhoneProvider[];
    addPhoneProvider: (provider: Omit<PhoneProvider, 'id'>) => Promise<string>;
    updatePhoneProvider: (id: string, updates: Partial<PhoneProvider>) => Promise<void>;
    deletePhoneProvider: (id: string) => Promise<void>;

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

    // Transfer Requests (Staging)
    transferRequests: TransferRequest[];
    addTransferRequest: (data: Omit<TransferRequest, 'id' | 'createdAt'>) => Promise<void>;
    updateTransferRequest: (id: string, updates: Partial<TransferRequest>) => Promise<void>;
    deleteTransferRequest: (id: string) => Promise<void>;
    processTransferRequest: (request: TransferRequest) => Promise<void>;
    revertTransferRequest: (id: string) => Promise<void>;

    // Employees Data
    employees: Employee[];
    addEmployee: (data: Omit<Employee, 'id' | 'createdAt' | 'isActive'>) => Promise<void>;
    updateEmployee: (id: string, data: Partial<Employee>) => Promise<boolean>;
    deleteEmployee: (id: string) => Promise<void>;

    // Deductions
    deductions: Deduction[];
    addDeduction: (data: Omit<Deduction, 'id' | 'createdAt' | 'createdBy'>) => Promise<string>;
    updateDeduction: (id: string, updates: Partial<Deduction>) => Promise<void>;
    deleteDeduction: (id: string) => Promise<void>;
    exemptDeduction: (id: string, reason: string) => Promise<void>;

    // Loans
    loanRequests: LoanRequest[];
    addLoanRequest: (request: Omit<LoanRequest, 'id' | 'createdAt'>) => Promise<void>;
    updateLoanRequest: (id: string, data: Partial<LoanRequest>) => Promise<void>;
    deleteLoanRequest: (id: string) => Promise<void>;
    approveLoanRequest: (id: string) => Promise<void>;
    rejectLoanRequest: (id: string, reason?: string) => Promise<void>;

    // Liquidity Mappings
    liquidityMappings: LiquidityMapping[];
    saveLiquidityMapping: (mapping: LiquidityMapping) => Promise<void>;
    deleteLiquidityMapping: (id: string) => Promise<void>;

    // Operational Sheets
    operationalSheets: OperationalSheet[];
    createOperationalSheet: (name: string, columns: string[]) => Promise<string>;
    updateSheetRow: (sheetId: string, restaurantId: string, field: string, value: any) => Promise<void>;
    deleteOperationalSheet: (id: string) => Promise<void>;

    // Branches
    branches: Branch[];
    addBranch: (data: Omit<Branch, 'id' | 'createdAt'>) => Promise<void>;
    updateBranch: (id: string, updates: Partial<Branch>) => Promise<void>;
    deleteBranch: (id: string) => Promise<void>;

    // Exchange Rates
    exchangeRates: ExchangeRates;
    updateExchangeRates: (rates: Partial<ExchangeRates>) => Promise<void>;
    getExchangeRateHistory: () => Promise<ExchangeRateHistory[]>;

    // Developer Feedback Settings
    devFeedbackSettings: DevFeedbackSettings;
    updateDevFeedbackSettings: (settings: Partial<DevFeedbackSettings>) => Promise<void>;

    // Feature Flags
    featureFlags: Record<string, boolean>;
    updateFeatureFlags: (flags: Partial<Record<string, boolean>>) => Promise<void>;
    selectedEmployeeDrawerId: string | null;
    setSelectedEmployeeDrawerId: (id: string | null) => void;

    // Payment Accounts (New)
    paymentAccounts: PaymentAccount[];
    addPaymentAccount: (data: Omit<PaymentAccount, 'id' | 'createdAt' | 'isActive'>) => Promise<string>;
    updatePaymentAccount: (id: string, updates: Partial<PaymentAccount>) => Promise<void>;
    deletePaymentAccount: (id: string) => Promise<void>;

    // أرصدة النظام الأساسي (tawseel.app)
    systemBalances: SystemBalance[];
    accountMappings: AccountMapping[];
    syncMetadata: SyncMetadata | null;
    saveAccountMapping: (mapping: AccountMapping) => Promise<void>;
    deleteAccountMapping: (id: string) => Promise<void>;

    // القيود المحاسبية ودليل الحسابات
    chartAccounts: any[];
    journalEntries: any[];
    addChartAccount: (data: any) => Promise<string>;
    addChartAccountsBulk: (accounts: any[]) => Promise<number>;
    updateChartAccount: (id: string, updates: any) => Promise<void>;
    deleteChartAccount: (id: string) => Promise<void>;
    addJournalEntry: (data: any) => Promise<string>;
    deleteJournalEntry: (id: string) => Promise<void>;

    isLoading: boolean;
}

export const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error("useAppContext must be used within App provider");
    return context;
};
