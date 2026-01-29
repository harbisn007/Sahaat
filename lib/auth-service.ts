/**
 * خدمة المصادقة - Google/Apple Sign-In
 * 
 * ملاحظة: يتطلب إعداد credentials من:
 * - Google: Google Cloud Console -> APIs & Services -> Credentials
 * - Apple: Apple Developer Account -> Certificates, Identifiers & Profiles
 * 
 * بعد الحصول على الـ credentials، أضفها في ملف .env:
 * - EXPO_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
 * - EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your_ios_client_id (اختياري)
 * - EXPO_PUBLIC_APPLE_SERVICE_ID=your_apple_service_id
 */

import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

// إكمال جلسة المصادقة عند العودة من المتصفح
WebBrowser.maybeCompleteAuthSession();

// Google OAuth endpoints
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  userInfoEndpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
};

// Apple OAuth endpoints
const APPLE_DISCOVERY = {
  authorizationEndpoint: 'https://appleid.apple.com/auth/authorize',
  tokenEndpoint: 'https://appleid.apple.com/auth/token',
};

// الحصول على redirect URI
function getRedirectUri(): string {
  return AuthSession.makeRedirectUri({
    scheme: 'sahaat-muhawara',
    path: 'oauth/callback',
  });
}

// التحقق من توفر credentials
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

// نتيجة تسجيل الدخول
export interface AuthResult {
  success: boolean;
  provider: 'google' | 'apple';
  userId: string;
  email?: string;
  name?: string;
  avatar?: string;
  error?: string;
}

/**
 * تسجيل الدخول بـ Google
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  
  if (!clientId) {
    return {
      success: false,
      provider: 'google',
      userId: '',
      error: 'Google Client ID غير مُعد. يرجى إضافة EXPO_PUBLIC_GOOGLE_CLIENT_ID في ملف .env',
    };
  }

  try {
    const redirectUri = getRedirectUri();
    
    const request = new AuthSession.AuthRequest({
      clientId,
      scopes: ['openid', 'profile', 'email'],
      redirectUri,
      responseType: AuthSession.ResponseType.Token,
    });

    const result = await request.promptAsync(GOOGLE_DISCOVERY);

    if (result.type === 'success' && result.authentication?.accessToken) {
      // الحصول على بيانات المستخدم
      const userInfoResponse = await fetch(GOOGLE_DISCOVERY.userInfoEndpoint, {
        headers: {
          Authorization: `Bearer ${result.authentication.accessToken}`,
        },
      });

      if (!userInfoResponse.ok) {
        throw new Error('فشل الحصول على بيانات المستخدم من Google');
      }

      const userInfo = await userInfoResponse.json();

      return {
        success: true,
        provider: 'google',
        userId: userInfo.sub, // Google's unique user ID
        email: userInfo.email,
        name: userInfo.name,
        avatar: userInfo.picture,
      };
    } else if (result.type === 'cancel') {
      return {
        success: false,
        provider: 'google',
        userId: '',
        error: 'تم إلغاء تسجيل الدخول',
      };
    } else {
      return {
        success: false,
        provider: 'google',
        userId: '',
        error: 'فشل تسجيل الدخول بـ Google',
      };
    }
  } catch (error) {
    console.error('[Auth] Google sign-in error:', error);
    return {
      success: false,
      provider: 'google',
      userId: '',
      error: error instanceof Error ? error.message : 'خطأ غير معروف',
    };
  }
}

/**
 * تسجيل الدخول بـ Apple
 */
export async function signInWithApple(): Promise<AuthResult> {
  const serviceId = process.env.EXPO_PUBLIC_APPLE_SERVICE_ID;
  
  if (!serviceId) {
    return {
      success: false,
      provider: 'apple',
      userId: '',
      error: 'Apple Service ID غير مُعد. يرجى إضافة EXPO_PUBLIC_APPLE_SERVICE_ID في ملف .env',
    };
  }

  // Apple Sign-In متاح فقط على iOS أو الويب
  if (Platform.OS === 'android') {
    return {
      success: false,
      provider: 'apple',
      userId: '',
      error: 'تسجيل الدخول بـ Apple غير متاح على Android',
    };
  }

  try {
    const redirectUri = getRedirectUri();
    const state = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      Math.random().toString()
    );

    const request = new AuthSession.AuthRequest({
      clientId: serviceId,
      scopes: ['name', 'email'],
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      state,
      extraParams: {
        response_mode: 'form_post',
      },
    });

    const result = await request.promptAsync(APPLE_DISCOVERY);

    if (result.type === 'success' && result.params?.code) {
      // ملاحظة: للحصول على بيانات المستخدم من Apple، تحتاج إلى:
      // 1. إرسال الـ code إلى الخادم
      // 2. الخادم يتبادل الـ code مع Apple للحصول على id_token
      // 3. فك تشفير id_token للحصول على بيانات المستخدم
      
      // حالياً نُرجع الـ code كـ userId مؤقتاً
      // في الإنتاج، يجب معالجة هذا على الخادم
      return {
        success: true,
        provider: 'apple',
        userId: result.params.code,
        // Apple لا يُرجع الاسم والبريد إلا في أول تسجيل دخول
      };
    } else if (result.type === 'cancel') {
      return {
        success: false,
        provider: 'apple',
        userId: '',
        error: 'تم إلغاء تسجيل الدخول',
      };
    } else {
      return {
        success: false,
        provider: 'apple',
        userId: '',
        error: 'فشل تسجيل الدخول بـ Apple',
      };
    }
  } catch (error) {
    console.error('[Auth] Apple sign-in error:', error);
    return {
      success: false,
      provider: 'apple',
      userId: '',
      error: error instanceof Error ? error.message : 'خطأ غير معروف',
    };
  }
}

/**
 * تسجيل الخروج من Google
 */
export async function signOutFromGoogle(): Promise<void> {
  // Google لا يتطلب تسجيل خروج صريح
  // يكفي حذف البيانات المحلية
  console.log('[Auth] Signed out from Google');
}

/**
 * تسجيل الخروج من Apple
 */
export async function signOutFromApple(): Promise<void> {
  // Apple لا يتطلب تسجيل خروج صريح
  // يكفي حذف البيانات المحلية
  console.log('[Auth] Signed out from Apple');
}
