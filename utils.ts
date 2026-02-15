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

    let clean = value.toString().trim();
    // Remove currency symbols and standard text
    clean = clean.replace(/[^\d.,-]/g, '');

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
        // Heuristic: If matches exactly standard thousands format (1,234 or 12,345,678), treat as integer
        // BUT, user explicitly wants decimals. "1,5" -> 1.5. "1,234" -> 1234?
        // Let's check the part AFTER the last comma.
        const parts = clean.split(',');
        const lastPart = parts[parts.length - 1];

        // If last part is NOT 3 digits, it's definitely a decimal (e.g. 1,5 or 12,34)
        if (lastPart.length !== 3) {
            clean = clean.replace(/,/g, '.');
        } else {
            // Ambiguous: 1,234. Could be 1.234 or 1234.
            // In a financial tool allowing decimals, usually entering "1,234" implies thousands.
            // Entering "1,234.00" makes it clear.
            // We will assume it is thousands separator here to be safe, unless there are multiple commas (1,234,567)
            // If only one comma and 3 digits: 1,234 -> 1234
            clean = clean.replace(/,/g, '');
        }
    }
    // Case 3: Only Dot (Standard JS) -> Keep as is

    return parseFloat(clean);
}
