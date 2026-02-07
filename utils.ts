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
 * تشفير كلمة المرور باستخدام SHA-256
 * @param password - كلمة المرور النصية
 * @returns Promise بـ hash مشفر
 */
export async function hashPassword(password: string): Promise<string> {
    try {
        if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex;
        } else {
            // Fallback for non-secure contexts (e.g. HTTP IP)
            console.warn("Secure context not available - using basic hash fallback");
            let hash = 0;
            for (let i = 0; i < password.length; i++) {
                const char = password.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return hash.toString(16);
        }
    } catch (e) {
        console.error("Hashing error", e);
        return password.split('').reverse().join(''); // Last resort fallback
    }
}

/**
 * حفظ البيانات في LocalStorage
 * @param key - مفتاح التخزين
 * @param data - البيانات للحفظ (سيتم تحويلها لـ JSON)
 */
export function saveToStorage<T>(key: string, data: T): void {
    try {
        const jsonData = JSON.stringify(data);
        localStorage.setItem(key, jsonData);
    } catch (error) {
        console.error('خطأ في حفظ البيانات:', error);
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
        return JSON.parse(jsonData) as T;
    } catch (error) {
        console.error('خطأ في تحميل البيانات:', error);
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
    const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    return !isNaN(num) && isFinite(num);
}
