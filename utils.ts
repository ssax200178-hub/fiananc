// ====================================
// Utility Functions
// ====================================

/**
 * توليد معرف فريد (UUID-like)
 * يجمع بين الوقت الحالي ورقم عشوائي لضمان التفرد
 */
export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * حفظ البيانات في LocalStorage
 * @param key - مفتاح التخزين
 * @param data - البيانات للحفظ (سيتم تحويلها لـ JSON)
 * @returns true إذا نجح الحفظ، false إذا فشل
 */
export function saveToStorage<T>(key: string, data: T): boolean {
    try {
        const jsonData = JSON.stringify(data);
        localStorage.setItem(key, jsonData);
        return true;
    } catch (error: any) {
        console.error('❌ [STORAGE] خطأ في حفظ البيانات:', error);
        return false;
    }
}

/**
 * تحميل البيانات من LocalStorage
 * @param key - مفتاح التخزين
 * @param defaultValue - القيمة الافتراضية إذا لم توجد بيانات
 * @returns البيانات المحملة أو القيمة الافتراضية
 */
export function loadFromStorage<T>(key: string, defaultValue: T): T {
    try {
        const jsonData = localStorage.getItem(key);
        if (jsonData === null) {
            return defaultValue;
        }
        const parsed = JSON.parse(jsonData) as T;
        return parsed;
    } catch (error) {
        console.error('❌ [STORAGE] خطأ في تحميل البيانات:', error);
        return defaultValue;
    }
}

/**
 * مسح البيانات من LocalStorage
 * @param key - مفتاح التخزين
 */
export function clearStorage(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.error('خطأ في مسح البيانات:', error);
    }
}

/**
 * التحقق من صحة البريد الإلكتروني (للاستخدام المستقبلي)
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * التحقق من قوة كلمة المرور
 * @param password - كلمة المرور للتحقق
 * @returns true إذا كانت قوية، false خلاف ذلك
 */
export function isStrongPassword(password: string): boolean {
    // على الأقل 6 أحرف
    return password.length >= 6;
}

/**
 * تنسيق الأرقام بالفواصل
 * @param num - الرقم للتنسيق
 * @returns الرقم منسق
 */
export function formatNumber(num: number): string {
    return num.toLocaleString('ar-SA');
}

/**
 * التحقق من صحة رقم
 * @param value - القيمة للتحقق
 * @returns true إذا كان رقم صحيح
 */
export function isValidNumber(value: string | number): boolean {
    if (value === undefined || value === null || value === '') return false;
    if (typeof value === 'number') return isFinite(value);

    const str = String(value).trim();
    // Must contain at least one digit to be a number
    if (!/\d/.test(str)) return false;

    const num = parseNumber(value);
    return !isNaN(num) && isFinite(num);
}

/**
 * تحويل النص إلى رقم مع دعم الفواصل العشرية المختلفة
 * يدعم: 1,234.56 (US) و 1.234,56 (EU)
 */
export function parseNumber(value: string | number | undefined | null): number {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return value;

    let str = value.toString().trim();

    // Normalize Arabic/Persian digits (٠١٢٣٤٥٦٧٨٩ → 0123456789)
    str = str.replace(/[٠-٩]/g, (d: string) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        .replace(/[۰-۹]/g, (d: string) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

    let clean = str.replace(/[^\d.,-]/g, '');

    if (!clean) return 0;

    // Case 1: Contains both . and , (e.g. 1,234.56 or 1.234,56)
    if (clean.includes('.') && clean.includes(',')) {
        const lastDot = clean.lastIndexOf('.');
        const lastComma = clean.lastIndexOf(',');

        if (lastComma > lastDot) {
            // Comma is decimal (1.234,56)
            clean = clean.replace(/\./g, '').replace(',', '.');
        } else {
            // Dot is decimal (1,234.56)
            clean = clean.replace(/,/g, '');
        }
    }
    // Case 2: Only Comma (e.g. 1,5 or 1,234)
    else if (clean.includes(',')) {
        const parts = clean.split(',');
        const lastPart = parts[parts.length - 1];

        // If last part is NOT 3 digits, it's definitely a decimal (e.g. 1,5 or 12,34)
        if (lastPart.length !== 3) {
            clean = clean.replace(/,/g, '.');
        } else {
            // Assume thousands separator for 3-digit tail (1,234 -> 1234)
            clean = clean.replace(/,/g, '');
        }
    }

    return parseFloat(clean);
}
/**
 * مقارنة نصوص وأرقام بأمان (تمنع الانهيار وتحسن فرز الأرقام)
 */
export function safeCompare(a: any, b: any, locale: string = 'ar'): number {
    if (a === b) return 0;
    if (a == null) return -1;
    if (b == null) return 1;

    // Check if both are numbers or strings that look like numbers
    const numA = typeof a === 'number' ? a : (typeof a === 'string' && !isNaN(parseFloat(a)) && isFinite(Number(a)) ? parseFloat(a) : NaN);
    const numB = typeof b === 'number' ? b : (typeof b === 'string' && !isNaN(parseFloat(b)) && isFinite(Number(b)) ? parseFloat(b) : NaN);

    if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
    }

    const strA = String(a).trim();
    const strB = String(b).trim();
    return strA.localeCompare(strB, locale);
}

/**
 * تنظيف الكائنات من القيم غير المعرفة (undefined) قبل إرسالها لـ Firestore
 */
export function cleanPayload(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(cleanPayload);
    } else if (obj !== null && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj)
                .filter(([_, value]) => value !== undefined)
                .map(([key, value]) => [key, cleanPayload(value)])
        );
    }
    return obj;
}


/**
 * جلب آمن من SessionStorage مع دعم JSON
 */
export function safeSessionGet<T = string>(key: string, defaultValue: T): T {
    try {
        const value = sessionStorage.getItem(key);
        if (value === null) return defaultValue;
        try {
            return JSON.parse(value) as T;
        } catch {
            return value as unknown as T;
        }
    } catch (e) {
        console.warn(`[STORAGE] SessionStorage blocked for key: ${key}`);
        return defaultValue;
    }
}

/**
 * حفظ آمن في SessionStorage مع دعم JSON
 */
export function safeSessionSet(key: string, value: any): void {
    try {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        sessionStorage.setItem(key, stringValue);
    } catch (e) {
        // Silently fail if storage is blocked
    }
}
/**
 * جلب تنسيقات الألوان بناءً على اسم الفرع
 */
export function getBranchColorClasses(branch: string): string {
    const b = (branch || '').trim();

    const colors: Record<string, string> = {
        'صنعاء': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        'عدن': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        'إب': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        'ذمار': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
        'تعز - الحوبان': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800',
        'تعز - المدينة': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300 border-pink-200 dark:border-pink-800',
        'المكلا': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
        'الحديدة': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800',
    };

    return colors[b] || 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300 border-slate-200 dark:border-slate-800';
}

// ====================================
// دوال العملات والرواتب
// ====================================

import type { Employee, ExchangeRates, Deduction } from './AppContext';

export const ARABIC_MONTHS = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

/**
 * نتيجة حساب راتب الموظف
 */
export interface SalaryResult {
    basic: number;          // الراتب الأساسي بالعملة المحلية
    extra: number;          // الراتب الإضافي بالعملة المحلية
    total: number;          // الإجمالي بالعملة المحلية
    isConverted: boolean;   // هل تم التحويل من عملة أجنبية؟
    currency: 'old_rial' | 'new_rial'; // العملة المحلية النهائية
    sourceBasic?: number;   // الراتب الأساسي بعملة المصدر (SAR)
    sourceExtra?: number;   // الراتب الإضافي بعملة المصدر (SAR)
    exchangeRate?: number;  // سعر الصرف المستخدم
    deductionsTotal: number; // إجمالي الخصميات لهذا الموظف
}

/**
 * حساب راتب الموظف بالعملة المحلية (مع التحويل من SAR إذا لزم الأمر)
 * @param emp - بيانات الموظف
 * @param rates - أسعار الصرف
 * @param deductions - قائمة الخصميات
 * @param targetMonth - اسم الشهر العربي (مثلاً: "يناير") أو كود YYYY-MM
 */
export const calculateEmployeeSalary = (
    emp: Employee,
    rates: ExchangeRates,
    deductions: Deduction[] = [],
    targetMonth?: string
): SalaryResult => {
    const currency = emp.salaryCurrency || 'old_rial';

    // إذا لم يتم تحديد شهر، نستخدم الشهر الحالي بالعربية
    const currentMonthName = ARABIC_MONTHS[new Date().getMonth()];
    const filterMonth = targetMonth || currentMonthName;

    // حساب إجمالي الخصميات للموظف لهذا الشهر المحدد
    const deductionsTotal = deductions
        .filter(d => {
            if (d.employeeId !== emp.id) return false;

            // محاولة المطابقة بالاسم (يناير، فبراير...)
            if (d.month === filterMonth) return true;

            // إذا كان الفلتر بتنسيق YYYY-MM، نقارن بالتاريخ
            if (filterMonth.includes('-')) {
                const [day, month, year] = d.date.split('/');
                const deductionMonth = `${year}-${month}`;
                return deductionMonth === filterMonth;
            }

            return false;
        })
        .reduce((sum, d) => sum + (d.amount || 0), 0);

    // إذا كان المصدر YER أو غير محدد
    if (!emp.salarySourceCurrency || emp.salarySourceCurrency === 'YER') {
        const basic = emp.basicSalary || 0;
        const extra = emp.extraSalary || 0;
        const total = Math.max(0, (basic + extra) - deductionsTotal);
        return { basic, extra, total, isConverted: false, currency, deductionsTotal };
    }

    // المصدر SAR → نحول حسب العملة المحلية
    const rate = currency === 'old_rial' ? rates.SAR_TO_OLD_RIAL : rates.SAR_TO_NEW_RIAL;
    const sourceBasic = emp.basicSalaryInSource || 0;
    const sourceExtra = emp.extraSalaryInSource || 0;
    const basic = sourceBasic * rate;
    const extra = sourceExtra * rate;
    const total = Math.max(0, (basic + extra) - deductionsTotal);

    return {
        basic, extra, total,
        isConverted: true, currency,
        sourceBasic, sourceExtra, exchangeRate: rate,
        deductionsTotal
    };
};

/**
 * رمز العملة المختصر
 */
export const getCurrencySymbol = (currency?: 'old_rial' | 'new_rial' | 'SAR'): string => {
    switch (currency) {
        case 'old_rial': return 'ر.ق';
        case 'new_rial': return 'ر.ج';
        case 'SAR': return 'ر.س';
        default: return 'ر.ي';
    }
};

/**
 * تنسيق المبلغ مع رمز العملة
 */
export const formatSalary = (amount: number, currency?: 'old_rial' | 'new_rial' | 'SAR'): string => {
    return `${amount.toLocaleString()} ${getCurrencySymbol(currency)}`;
};
