/**
 * إعدادات التطبيق
 * يمكن تعديل هذه القيم للتحكم في أداء التطبيق
 */

export const CONFIG = {
  // إعدادات الـ Polling
  polling: {
    // فترة الـ polling عند عدم توفر WebSocket (بالمللي ثانية)
    roomData: 3000,        // بيانات الساحة
    audioMessages: 2000,   // الرسائل الصوتية
    reactions: 2000,       // التفاعلات
    activeRecordings: 500, // حالة التسجيل (يحتاج سرعة عالية)
    khalooha: 1000,        // خلوها
    joinRequests: 2000,    // طلبات الانضمام
  },
  
  // إعدادات الـ Polling عند توفر WebSocket (أبطأ كـ fallback)
  pollingWithSocket: {
    roomData: 10000,       // 10 ثوانٍ
    audioMessages: 10000,
    reactions: 10000,
    activeRecordings: 5000,
    khalooha: 10000,
    joinRequests: 10000,
  },
  
  // إعدادات WebSocket
  socket: {
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
  },
  
  // إعدادات التسجيل الصوتي
  recording: {
    maxDuration: 60, // بالثواني
  },
  

};

/**
 * الحصول على فترة الـ polling المناسبة
 * @param key مفتاح الإعداد
 * @param isSocketConnected هل WebSocket متصل؟
 */
export function getPollingInterval(
  key: keyof typeof CONFIG.polling,
  isSocketConnected: boolean
): number {
  if (isSocketConnected) {
    return CONFIG.pollingWithSocket[key];
  }
  return CONFIG.polling[key];
}
