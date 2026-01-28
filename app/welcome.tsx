import { useState, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Image, ScrollView, ImageBackground, Keyboard, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useUser } from "@/lib/user-context";
import { useColors } from "@/hooks/use-colors";
import * as ImagePicker from "expo-image-picker";
import type { AvatarType } from "@/lib/user-context";
import { signInWithGoogle, signInWithApple, isGoogleAuthConfigured, isAppleAuthConfigured } from "@/lib/auth-service";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

// Import avatar images
const avatarMale = require("@/assets/images/avatar-male.png");
const avatarFemale = require("@/assets/images/avatar-female.png");

// Welcome background image
const welcomeBackground = require("@/assets/images/welcome-background.png");

export default function WelcomeScreen() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const [name, setName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarType | null>(null);
  const [customAvatarUri, setCustomAvatarUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const { loginAsGuest, loginWithGoogle, loginWithApple } = useUser();
  const colors = useColors();
  const scrollViewRef = useRef<ScrollView>(null);

  // التحقق من توفر Google/Apple
  const googleConfigured = isGoogleAuthConfigured();
  const appleConfigured = isAppleAuthConfigured();
  const showSocialLogin = googleConfigured || appleConfigured;

  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert("خطأ", "يجب السماح بالوصول إلى الصور");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setCustomAvatarUri(uri);
        setSelectedAvatar(uri);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("خطأ", "حدث خطأ أثناء اختيار الصورة");
    }
  };

  const handleSelectMale = () => {
    setSelectedAvatar('male');
    setCustomAvatarUri(null);
  };

  const handleSelectFemale = () => {
    setSelectedAvatar('female');
    setCustomAvatarUri(null);
  };

  // دالة للتحقق من صحة الاسم (3 حروف عربية/إنجليزية على الأقل)
  const validateName = (text: string): { valid: boolean; message: string } => {
    const trimmed = text.trim();
    
    // التحقق من أن الاسم ليس فارغاً
    if (trimmed.length === 0) {
      return { valid: false, message: "يرجى إدخال اسم" };
    }
    
    // عد الحروف العربية والإنجليزية فقط
    const arabicLetters = (trimmed.match(/[\u0600-\u06FF]/g) || []).length;
    const englishLetters = (trimmed.match(/[a-zA-Z]/g) || []).length;
    const totalLetters = arabicLetters + englishLetters;
    
    // عد الأرقام
    const numbers = (trimmed.match(/[0-9]/g) || []).length;
    
    // عد الرموز (كل شيء ليس حرفاً أو رقماً أو مسافة)
    const symbols = trimmed.replace(/[\u0600-\u06FFa-zA-Z0-9\s]/g, '').length;
    
    // رفض الأرقام وحدها (بدون حروف)
    if (numbers > 0 && totalLetters === 0) {
      return { valid: false, message: "لا يمكن أن يكون الاسم أرقاماً فقط" };
    }
    
    // رفض الرموز وحدها (بدون حروف)
    if (symbols > 0 && totalLetters === 0) {
      return { valid: false, message: "لا يمكن أن يكون الاسم رموزاً فقط" };
    }
    
    // يجب أن يحتوي على 3 حروف على الأقل
    if (totalLetters < 3) {
      return { valid: false, message: "يجب أن يحتوي الاسم على 3 حروف عربية أو إنجليزية على الأقل" };
    }
    
    if (trimmed.length > 20) {
      return { valid: false, message: "يجب أن لا يزيد الاسم عن 20 حرف" };
    }
    
    return { valid: true, message: "" };
  };

  // دخول كضيف
  const handleGuestLogin = async () => {
    Keyboard.dismiss();
    const trimmedName = name.trim();
    
    const validation = validateName(trimmedName);
    if (!validation.valid) {
      Alert.alert("خطأ", validation.message);
      return;
    }

    if (!selectedAvatar) {
      Alert.alert("خطأ", "يجب اختيار صورة شخصية");
      return;
    }

    setIsLoading(true);
    try {
      console.log("[WelcomeScreen] Starting guest login with:", { name: trimmedName, avatar: selectedAvatar });
      await loginAsGuest(trimmedName, selectedAvatar);
      console.log("[WelcomeScreen] Guest login successful, redirecting...");
      // Redirect to the original page if provided, otherwise go to tabs
      if (redirect) {
        router.replace(redirect as any);
      } else {
        router.replace("/(tabs)");
      }
    } catch (error: unknown) {
      console.error("[WelcomeScreen] Guest login failed:", error);
      const errorMessage = error instanceof Error ? error.message : "خطأ غير معروف";
      Alert.alert("خطأ", `حدث خطأ أثناء حفظ البيانات: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  // تسجيل دخول بـ Google
  const handleGoogleLogin = async () => {
    if (!googleConfigured) {
      Alert.alert(
        "غير متاح",
        "تسجيل الدخول بـ Google غير مُعد حالياً.\n\nيرجى إضافة EXPO_PUBLIC_GOOGLE_CLIENT_ID في ملف .env"
      );
      return;
    }

    setIsGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      
      if (result.success) {
        // إذا كان مستخدم جديد، نحتاج اسم وصورة
        // إذا كان مستخدم مسجل، ندخل مباشرة
        // حالياً نطلب الاسم والصورة دائماً
        
        if (result.name && result.avatar) {
          // استخدام بيانات Google
          await loginWithGoogle(result.userId, result.name, result.avatar);
        } else if (name.trim() && selectedAvatar) {
          // استخدام البيانات المدخلة
          await loginWithGoogle(result.userId, name.trim(), selectedAvatar);
        } else {
          // طلب إدخال الاسم والصورة
          Alert.alert(
            "أكمل بياناتك",
            "يرجى إدخال اسمك واختيار صورة شخصية ثم الضغط على زر Google مرة أخرى"
          );
          setIsGoogleLoading(false);
          return;
        }
        
        if (redirect) {
          router.replace(redirect as any);
        } else {
          router.replace("/(tabs)");
        }
      } else {
        if (result.error !== 'تم إلغاء تسجيل الدخول') {
          Alert.alert("خطأ", result.error || "فشل تسجيل الدخول بـ Google");
        }
      }
    } catch (error) {
      console.error("Google login error:", error);
      Alert.alert("خطأ", "حدث خطأ أثناء تسجيل الدخول بـ Google");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // تسجيل دخول بـ Apple
  const handleAppleLogin = async () => {
    if (!appleConfigured) {
      Alert.alert(
        "غير متاح",
        "تسجيل الدخول بـ Apple غير مُعد حالياً.\n\nيرجى إضافة EXPO_PUBLIC_APPLE_SERVICE_ID في ملف .env"
      );
      return;
    }

    if (Platform.OS === 'android') {
      Alert.alert("غير متاح", "تسجيل الدخول بـ Apple متاح فقط على iOS");
      return;
    }

    setIsAppleLoading(true);
    try {
      const result = await signInWithApple();
      
      if (result.success) {
        if (name.trim() && selectedAvatar) {
          await loginWithApple(result.userId, name.trim(), selectedAvatar);
        } else {
          Alert.alert(
            "أكمل بياناتك",
            "يرجى إدخال اسمك واختيار صورة شخصية ثم الضغط على زر Apple مرة أخرى"
          );
          setIsAppleLoading(false);
          return;
        }
        
        if (redirect) {
          router.replace(redirect as any);
        } else {
          router.replace("/(tabs)");
        }
      } else {
        if (result.error !== 'تم إلغاء تسجيل الدخول') {
          Alert.alert("خطأ", result.error || "فشل تسجيل الدخول بـ Apple");
        }
      }
    } catch (error) {
      console.error("Apple login error:", error);
      Alert.alert("خطأ", "حدث خطأ أثناء تسجيل الدخول بـ Apple");
    } finally {
      setIsAppleLoading(false);
    }
  };

  const handleInputFocus = () => {
    // Scroll to bottom when input is focused to ensure it's visible
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 300);
  };

  const isFormValid = validateName(name).valid && selectedAvatar !== null;
  const anyLoading = isLoading || isGoogleLoading || isAppleLoading;

  return (
    <ImageBackground 
      source={welcomeBackground} 
      style={{ flex: 1 }} 
      resizeMode="cover"
    >
    <ScreenContainer containerClassName="bg-transparent">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <ScrollView 
          ref={scrollViewRef}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 50 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 justify-center items-center px-6 py-8">
            {/* Logo/Title */}
            <View className="items-center mb-8">
              <Text className="text-4xl font-bold text-foreground mb-3">
                ساحات المحاورة
              </Text>
              <Text className="text-base text-muted text-center">
                منصة تفاعلية للمحاورة الشعرية
              </Text>
            </View>

            {/* Input Card */}
            <View className="w-full max-w-sm bg-surface rounded-2xl p-6 shadow-sm border border-border">
              <Text className="text-lg font-semibold text-foreground mb-4 text-center">
                مرحباً بك!
              </Text>
              
              {/* Avatar Selection */}
              <Text className="text-sm text-muted mb-3 text-center">
                اختر صورتك الشخصية
              </Text>
              
              <View className="flex-row justify-center items-center gap-4 mb-6">
                {/* Male Avatar */}
                <TouchableOpacity
                  onPress={handleSelectMale}
                  disabled={anyLoading}
                  style={{
                    borderWidth: 3,
                    borderColor: selectedAvatar === 'male' ? colors.primary : 'transparent',
                    borderRadius: 50,
                    padding: 3,
                    opacity: anyLoading ? 0.5 : 1,
                  }}
                >
                  <Image
                    source={avatarMale}
                    style={{ width: 70, height: 70, borderRadius: 35 }}
                  />
                </TouchableOpacity>

                {/* Female Avatar */}
                <TouchableOpacity
                  onPress={handleSelectFemale}
                  disabled={anyLoading}
                  style={{
                    borderWidth: 3,
                    borderColor: selectedAvatar === 'female' ? colors.primary : 'transparent',
                    borderRadius: 50,
                    padding: 3,
                    opacity: anyLoading ? 0.5 : 1,
                  }}
                >
                  <Image
                    source={avatarFemale}
                    style={{ width: 70, height: 70, borderRadius: 35 }}
                  />
                </TouchableOpacity>

                {/* Custom Avatar */}
                <TouchableOpacity
                  onPress={handlePickImage}
                  disabled={anyLoading}
                  style={{
                    borderWidth: 3,
                    borderColor: customAvatarUri ? colors.primary : 'transparent',
                    borderRadius: 50,
                    padding: 3,
                    opacity: anyLoading ? 0.5 : 1,
                  }}
                >
                  {customAvatarUri ? (
                    <Image
                      source={{ uri: customAvatarUri }}
                      style={{ width: 70, height: 70, borderRadius: 35 }}
                    />
                  ) : (
                    <View 
                      style={{ 
                        width: 70, 
                        height: 70, 
                        borderRadius: 35, 
                        backgroundColor: colors.border,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 24 }}>📷</Text>
                    </View>
                  )}
                  <Text className="text-xs text-muted text-center mt-1">رفع صورة</Text>
                </TouchableOpacity>
              </View>

              {/* Name Input */}
              <Text className="text-sm text-muted mb-2 text-center">
                أدخل اسمك
              </Text>
              
              <TextInput
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground text-base mb-4"
                placeholder="اسمك هنا"
                placeholderTextColor={colors.muted}
                value={name}
                onChangeText={setName}
                maxLength={20}
                returnKeyType="done"
                onSubmitEditing={handleGuestLogin}
                onFocus={handleInputFocus}
                editable={!anyLoading}
                style={{ textAlign: "right" }}
              />

              {/* Login Buttons */}
              <View className="flex-row items-center gap-3">
                {/* Guest Login Button */}
                <TouchableOpacity
                  className="flex-1 bg-primary rounded-xl py-3 items-center"
                  onPress={handleGuestLogin}
                  disabled={anyLoading || !isFormValid}
                  style={{
                    opacity: anyLoading || !isFormValid ? 0.5 : 1,
                  }}
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <Text className="text-background font-semibold text-base">
                      دخول كضيف
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Separator */}
                <Text className="text-muted text-sm">أو</Text>

                {/* Social Login Button - Combined Google/Apple */}
                <TouchableOpacity
                  className="rounded-xl py-3 px-4 items-center justify-center flex-row"
                  style={{
                    backgroundColor: (googleConfigured || appleConfigured) ? colors.surface : colors.border,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: anyLoading ? 0.5 : 1,
                    gap: 6,
                  }}
                  onPress={() => {
                    // إذا كان على iOS، نعرض خيارات
                    if (Platform.OS === 'ios' && appleConfigured && googleConfigured) {
                      Alert.alert(
                        'اختر طريقة الدخول',
                        '',
                        [
                          { text: 'Google', onPress: handleGoogleLogin },
                          { text: 'Apple', onPress: handleAppleLogin },
                          { text: 'إلغاء', style: 'cancel' },
                        ]
                      );
                    } else if (googleConfigured) {
                      handleGoogleLogin();
                    } else if (appleConfigured && Platform.OS !== 'android') {
                      handleAppleLogin();
                    } else {
                      // إذا لم يكن أي منهما مُعداً
                      handleGoogleLogin(); // سيعرض رسالة "غير متاح"
                    }
                  }}
                  disabled={anyLoading}
                >
                  {(isGoogleLoading || isAppleLoading) ? (
                    <ActivityIndicator color={colors.foreground} size="small" />
                  ) : (
                    <>
                      <Text className="text-foreground text-sm">دخول عبر</Text>
                      <MaterialCommunityIcons name="google" size={24} color="#4285F4" />
                      <Text className="text-muted text-sm">/</Text>
                      <MaterialCommunityIcons name="apple" size={24} color="#000" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Helper Text */}
            <Text className="text-xs text-muted mt-6 text-center">
              يجب اختيار صورة وإدخال اسم (3-20 حرف)
            </Text>
            
            {/* Social Login Note */}
            {!showSocialLogin && (
              <Text className="text-xs text-muted mt-2 text-center" style={{ color: colors.warning }}>
                تسجيل الدخول بـ Google/Apple غير مُعد حالياً
              </Text>
            )}
            
            {/* Extra space for keyboard */}
            <View style={{ height: 100 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
    </ImageBackground>
  );
}
