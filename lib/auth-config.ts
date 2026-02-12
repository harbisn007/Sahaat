/**
 * دوال التحقق من إعداد المصادقة
 * ملف منفصل لتجنب تحميل expo-auth-session/expo-crypto عند بدء التطبيق
 */

export function isGoogleAuthConfigured(): boolean {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  return !!clientId && clientId.length > 10;
}

export function isAppleAuthConfigured(): boolean {
  const serviceId = process.env.EXPO_PUBLIC_APPLE_SERVICE_ID;
  return !!serviceId && serviceId.length > 5;
}

export function isAuthConfigured(): boolean {
  return isGoogleAuthConfigured() || isAppleAuthConfigured();
}
