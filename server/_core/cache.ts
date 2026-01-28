/**
 * نظام التخزين المؤقت (Cache)
 * 
 * هذا الملف يوفر طبقة تخزين مؤقت في الذاكرة (In-Memory Cache)
 * يمكن استبداله بـ Redis في الإنتاج للتوسع الأفقي
 * 
 * للتحويل إلى Redis:
 * 1. تثبيت: pnpm add ioredis
 * 2. استبدال Map بـ Redis client
 * 3. تحديث الدوال لاستخدام Redis commands
 */

// التخزين المؤقت في الذاكرة (للتطوير)
// في الإنتاج، يمكن استبداله بـ Redis
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class InMemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // تنظيف المدخلات المنتهية كل دقيقة
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * تخزين قيمة مع وقت انتهاء
   * @param key المفتاح
   * @param value القيمة
   * @param ttlSeconds وقت الانتهاء بالثواني
   */
  async set<T>(key: string, value: T, ttlSeconds: number = 60): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * الحصول على قيمة من التخزين المؤقت
   * @param key المفتاح
   * @returns القيمة أو null إذا لم توجد أو انتهت صلاحيتها
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value as T;
  }

  /**
   * حذف قيمة من التخزين المؤقت
   * @param key المفتاح
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  /**
   * حذف جميع المفاتيح التي تبدأ بنمط معين
   * @param pattern النمط (مثل "room:*")
   */
  async deletePattern(pattern: string): Promise<void> {
    const prefix = pattern.replace("*", "");
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * التحقق من وجود مفتاح
   * @param key المفتاح
   */
  async exists(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * تنظيف المدخلات المنتهية
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * الحصول على إحصائيات التخزين المؤقت
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * إيقاف التنظيف التلقائي
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// إنشاء instance واحد
export const cache = new InMemoryCache();

// ============ دوال مساعدة للتخزين المؤقت ============

/**
 * مفاتيح التخزين المؤقت
 */
export const CACHE_KEYS = {
  // بيانات الساحة
  room: (roomId: number) => "room:" + roomId,
  roomParticipants: (roomId: number) => "room:" + roomId + ":participants",
  roomMessages: (roomId: number) => "room:" + roomId + ":messages",
  roomReactions: (roomId: number) => "room:" + roomId + ":reactions",
  roomRecordings: (roomId: number) => "room:" + roomId + ":recordings",
  
  // قائمة الساحات
  allRooms: () => "rooms:all",
  
  // بيانات المستخدم
  user: (userId: number) => "user:" + userId,
  userActiveRoom: (userId: number) => "user:" + userId + ":activeRoom",
};

/**
 * أوقات انتهاء الصلاحية (بالثواني)
 */
export const CACHE_TTL = {
  room: 30,           // 30 ثانية
  participants: 10,   // 10 ثوانٍ
  messages: 5,        // 5 ثوانٍ
  reactions: 5,       // 5 ثوانٍ
  recordings: 2,      // 2 ثانية (يحتاج سرعة)
  allRooms: 10,       // 10 ثوانٍ
  user: 60,           // دقيقة
};

/**
 * الحصول على قيمة من التخزين المؤقت أو تنفيذ الدالة
 * @param key المفتاح
 * @param ttl وقت الانتهاء
 * @param fn الدالة لتنفيذها إذا لم توجد القيمة
 */
export async function cacheOrFetch<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>
): Promise<T> {
  // محاولة الحصول من التخزين المؤقت
  const cached = await cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }
  
  // تنفيذ الدالة وتخزين النتيجة
  const result = await fn();
  await cache.set(key, result, ttl);
  return result;
}

/**
 * إبطال التخزين المؤقت للساحة
 * @param roomId معرف الساحة
 */
export async function invalidateRoomCache(roomId: number): Promise<void> {
  await cache.deletePattern("room:" + roomId + ":*");
  await cache.delete(CACHE_KEYS.room(roomId));
  await cache.delete(CACHE_KEYS.allRooms());
}

/**
 * إبطال التخزين المؤقت للمستخدم
 * @param userId معرف المستخدم
 */
export async function invalidateUserCache(userId: number): Promise<void> {
  await cache.deletePattern("user:" + userId + ":*");
  await cache.delete(CACHE_KEYS.user(userId));
}
