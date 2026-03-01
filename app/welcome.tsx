import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Image, ScrollView, ImageBackground, Keyboard, ActivityIndicator, Modal, Pressable, FlatList } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useUser } from "@/lib/user-context";
import { useColors } from "@/hooks/use-colors";
import * as ImagePicker from "expo-image-picker";
import type { AvatarType } from "@/lib/user-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { AVATAR_OPTIONS, getAvatarSourceById } from "@/lib/avatars";
import { trpc } from "@/lib/trpc";

// Firebase - React Native
import auth from '@react-native-firebase/auth';

const welcomeBackground = require("@/assets/images/welcome-background.png");

// قائمة مفاتيح الدول الشائعة
const COUNTRY_CODES = [
  { code: "+966", flag: "🇸🇦", name: "السعودية" },
  { code: "+971", flag: "🇦🇪", name: "الإمارات" },
  { code: "+965", flag: "🇰🇼", name: "الكويت" },
  { code: "+974", flag: "🇶🇦", name: "قطر" },
  { code: "+973", flag: "🇧🇭", name: "البحرين" },
  { code: "+968", flag: "🇴🇲", name: "عُمان" },
  { code: "+962", flag: "🇯🇴", name: "الأردن" },
  { code: "+961", flag: "🇱🇧", name: "لبنان" },
  { code: "+963", flag: "🇸🇾", name: "سوريا" },
  { code: "+964", flag: "🇮🇶", name: "العراق" },
  { code: "+20", flag: "🇪🇬", name: "مصر" },
  { code: "+212", flag: "🇲🇦", name: "المغرب" },
  { code: "+213", flag: "🇩🇿", name: "الجزائر" },
  { code: "+216", flag: "🇹🇳", name: "تونس" },
  { code: "+249", flag: "🇸🇩", name: "السودان" },
  { code: "+218", flag: "🇱🇾", name: "ليبيا" },
  { code: "+967", flag: "🇾🇪", name: "اليمن" },
  { code: "+1", flag: "🇺🇸", name: "أمريكا" },
  { code: "+44", flag: "🇬🇧", name: "بريطانيا" },
  { code: "+49", flag: "🇩🇪", name: "ألمانيا" },
  { code: "+33", flag: "🇫🇷", name: "فرنسا" },
  { code: "+90", flag: "🇹🇷", name: "تركيا" },
  { code: "+92", flag: "🇵🇰", name: "باكستان" },
  { code: "+91", flag: "🇮🇳", name: "الهند" },
];

type Screen = "choice" | "login" | "register" | "otp";

export default function WelcomeScreen() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const colors = useColors();
  const { loginAsGuest } = useUser();
  const scrollViewRef = useRef<ScrollView>(null);
  const trpcUtils = trpc.useUtils();

  // الشاشة الحالية
  const [screen, setScreen] = useState<Screen>("choice");

  // بيانات التسجيل
  const [name, setName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarType | null>(null);
  const [customAvatarUri, setCustomAvatarUri] = useState<string | null>(null);

  // بيانات الجوال
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  // OTP
  const [otp, setOtp] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  // Terms
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    const checkTerms = async () => {
      const accepted = await AsyncStorage.getItem('terms_accepted');
      if (accepted === 'true') {
        setTermsAccepted(true);
      } else {
        setShowTermsModal(true);
      }
    };
    checkTerms();
  }, []);

  const handleAcceptTerms = async () => {
    await AsyncStorage.setItem('terms_accepted', 'true');
    setTermsAccepted(true);
    setShowTermsModal(false);
  };

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
      Alert.alert("خطأ", "حدث خطأ أثناء اختيار الصورة");
    }
  };

  const validateName = (text: string): { valid: boolean; message: string } => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return { valid: false, message: "يرجى إدخال اسم" };
    const arabicLetters = (trimmed.match(/[\u0600-\u06FF]/g) || []).length;
    const englishLetters = (trimmed.match(/[a-zA-Z]/g) || []).length;
    const totalLetters = arabicLetters + englishLetters;
    if (totalLetters < 3) return { valid: false, message: "يجب أن يحتوي الاسم على 3 حروف على الأقل" };
    if (trimmed.length > 20) return { valid: false, message: "يجب أن لا يزيد الاسم عن 20 حرف" };
    return { valid: true, message: "" };
  };

  const validatePhone = (): boolean => {
    const digits = phoneNumber.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  };

  // إرسال كود OTP
  const handleSendOTP = async () => {
    if (!validatePhone()) {
      Alert.alert("خطأ", "يرجى إدخال رقم جوال صحيح");
      return;
    }

    if (screen === "register") {
      const nameValidation = validateName(name);
      if (!nameValidation.valid) {
        Alert.alert("خطأ", nameValidation.message);
        return;
      }
      if (!selectedAvatar) {
        Alert.alert("خطأ", "يجب اختيار صورة شخصية");
        return;
      }
    }

    setIsLoading(true);
    try {
      const fullPhone = `${selectedCountry.code}${phoneNumber.replace(/^0/, '')}`;
      
      // التحقق من تكرار الرقم عند التسجيل
      if (screen === "register") {
        try {
          const existingUser = await trpcUtils.auth.getUserByPhone.fetch({ phoneNumber: fullPhone });
          if (existingUser) {
            Alert.alert("خطأ", "هذا الرقم مسجّل مسبقاً. استخدم خيار الدخول بدلاً من التسجيل.");
            setIsLoading(false);
            return;
          }
        } catch (e) {
          // لا يوجد مستخدم — نكمل التسجيل
        }
      }

      // التحقق عند الدخول إن الرقم مسجّل
      if (screen === "login") {
        try {
          const existingUser = await trpcUtils.auth.getUserByPhone.fetch({ phoneNumber: fullPhone });
          if (!existingUser) {
            Alert.alert("خطأ", "هذا الرقم غير مسجّل. سجّل حساب جديد أولاً.");
            setIsLoading(false);
            return;
          }
        } catch (e) {
          Alert.alert("خطأ", "هذا الرقم غير مسجّل. سجّل حساب جديد أولاً.");
          setIsLoading(false);
          return;
        }
      }

      console.log("[OTP] Sending to:", fullPhone);
      const confirmation = await auth().signInWithPhoneNumber(fullPhone);
      setVerificationId(confirmation.verificationId);
      setConfirmResult(confirmation);
      setOtpSent(true);
      setScreen("otp");
      Alert.alert("تم الإرسال", `تم إرسال كود التحقق إلى ${fullPhone}`);
    } catch (error: any) {
      console.error("[OTP] Send error:", error?.code, error?.message);
      Alert.alert("خطأ", `فشل إرسال كود التحقق: ${error?.code || error?.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // التحقق من الكود
  const handleVerifyOTP = async () => {
    if (!confirmResult) {
      Alert.alert("خطأ", "يرجى إعادة إرسال الكود");
      return;
    }
    if (otp.length < 6) {
      Alert.alert("خطأ", "يرجى إدخال الكود المكون من 6 أرقام");
      return;
    }

    setIsLoading(true);
    try {
      // استخدام confirm() مباشرة — الطريقة الصحيحة
      const result = await confirmResult.confirm(otp);
      
      if (!result || !result.user) {
        Alert.alert("خطأ", "فشل التحقق. حاول مرة أخرى.");
        return;
      }
      
      const firebaseUid = result.user.uid;

      const fullPhone = `${selectedCountry.code}${phoneNumber.replace(/^0/, '')}`;

      if (screen === "login") {
        // دخول — ابحث عن الحساب برقم الجوال
        const existingUser = await trpcUtils.auth.getUserByPhone.fetch({ phoneNumber: fullPhone });

        if (existingUser) {
          // حساب موجود → ادخل بنفس البيانات
          await loginAsGuest(existingUser.name || "مستخدم", (existingUser.avatar || "male") as AvatarType);
        } else {
          // لا يوجد حساب → أنشئ واحداً جديداً
          const displayName = `مستخدم`;
          await loginAsGuest(displayName, "male");
          await trpcUtils.auth.upsertUserByPhone.fetch({
            phoneNumber: fullPhone,
            name: displayName,
            avatar: "male",
            openId: firebaseUid,
          });
        }
      } else {
        // تسجيل جديد → احفظ الحساب
        const displayName = name.trim() || "مستخدم";
        const avatar = selectedAvatar || "male";
        await loginAsGuest(displayName, avatar as AvatarType);
        await trpcUtils.auth.upsertUserByPhone.fetch({
          phoneNumber: fullPhone,
          name: displayName,
          avatar: avatar as string,
          openId: firebaseUid,
        });
      }

      if (redirect) {
        router.replace(redirect as any);
      } else {
        router.replace("/(tabs)");
      }
    } catch (error: any) {
      console.error("[OTP] Verify error:", error?.code, error?.message, JSON.stringify(error));
      const errorCode = error?.code || '';
      let errorMsg = '';
      if (errorCode === 'auth/invalid-verification-code') {
        errorMsg = 'كود التحقق غير صحيح. تأكد من الكود وحاول مرة أخرى.';
      } else if (errorCode === 'auth/session-expired') {
        errorMsg = 'انتهت صلاحية الكود. اضغط إعادة إرسال الكود.';
      } else if (errorCode === 'auth/too-many-requests') {
        errorMsg = 'محاولات كثيرة. انتظر قليلاً وحاول مرة أخرى.';
      } else {
        errorMsg = `خطأ: ${error?.code || ''} - ${error?.message || 'خطأ غير معروف'}`;
      }
      Alert.alert("خطأ", errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const fullPhoneDisplay = `${selectedCountry.code} ${phoneNumber}`;
  const isRegisterValid = name.trim().length >= 3 && !!selectedAvatar && validatePhone();
  const isLoginValid = validatePhone();

  // ══ شاشة الاختيار ══
  if (screen === "choice") {
    return (
      <ImageBackground source={welcomeBackground} style={{ flex: 1 }} imageStyle={{ opacity: 0.15 }}>
        <ScreenContainer>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <Text style={{ fontSize: 32, fontWeight: '900', color: '#d4af37', marginBottom: 8, textAlign: 'center' }}>
              ساحات الطواريق
            </Text>
            <Text style={{ fontSize: 14, color: 'rgba(212,175,55,0.7)', marginBottom: 48, textAlign: 'center' }}>
              منصة تفاعلية للمحاورة الشعرية
            </Text>

            <TouchableOpacity
              onPress={() => setScreen("register")}
              style={{
                backgroundColor: '#c8860a',
                borderRadius: 14,
                paddingVertical: 16,
                paddingHorizontal: 40,
                width: '100%',
                alignItems: 'center',
                marginBottom: 16,
                shadowColor: '#c8860a',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 8,
                elevation: 6,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>تسجيل جديد</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>إنشاء حساب جديد</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setScreen("login")}
              style={{
                backgroundColor: '#2d1f0e',
                borderRadius: 14,
                paddingVertical: 16,
                paddingHorizontal: 40,
                width: '100%',
                alignItems: 'center',
                borderWidth: 2,
                borderColor: '#c8860a',
              }}
            >
              <Text style={{ color: '#d4af37', fontWeight: '900', fontSize: 18 }}>دخول</Text>
              <Text style={{ color: 'rgba(212,175,55,0.6)', fontSize: 12, marginTop: 2 }}>لديك حساب مسبق</Text>
            </TouchableOpacity>
          </View>

          {/* Terms Modal */}
          <Modal visible={showTermsModal} transparent animationType="fade" onRequestClose={() => {}}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400, borderWidth: 3, borderColor: '#DC2626' }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <Pressable
                    onPress={() => setTermsChecked(!termsChecked)}
                    style={{ width: 24, height: 24, borderWidth: 2, borderColor: '#DC2626', borderRadius: 4, marginLeft: 10, marginTop: 2, justifyContent: 'center', alignItems: 'center', backgroundColor: termsChecked ? '#EF4444' : 'transparent' }}
                  >
                    {termsChecked && <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>✓</Text>}
                  </Pressable>
                  <Text style={{ flex: 1, color: '#000', fontSize: 15, lineHeight: 26, textAlign: 'left' }}>
                    أقر وأتعهد عند استخدامي لتطبيق / منصة طواريق بالالتزام التام بقواعد الذوق العام وتجنب أي طرح يسبب الفرقة او يسيء للنظام العام او القيم الدينية او يسيء لأي مكون من مكونات المجتمع وان لا أقوم بأي فعل من افعال الجرائم المعلوماتية، وأتحمل المسؤولية الكاملة عن كل ما يصدر من حسابي من رسائل أو وسائط، وأقر بأن إدارة المنصة لها الحق في تزويد الجهات المعنية ببياناتي عند حدوث أي مخالفة نظامية.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleAcceptTerms}
                  disabled={!termsChecked}
                  style={{ backgroundColor: termsChecked ? '#22C55E' : '#9CA3AF', borderRadius: 8, paddingVertical: 12, marginTop: 16, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>موافق</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </ScreenContainer>
      </ImageBackground>
    );
  }

  // ══ شاشة تسجيل جديد ══
  if (screen === "register") {
    return (
      <ImageBackground source={welcomeBackground} style={{ flex: 1 }} imageStyle={{ opacity: 0.15 }}>
        <ScreenContainer>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <ScrollView ref={scrollViewRef} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">

              {/* Back */}
              <TouchableOpacity onPress={() => setScreen("choice")} style={{ marginBottom: 16 }}>
                <Text style={{ color: '#c8860a', fontSize: 16 }}>→ رجوع</Text>
              </TouchableOpacity>

              <Text style={{ fontSize: 24, fontWeight: '900', color: '#d4af37', textAlign: 'center', marginBottom: 24 }}>تسجيل جديد</Text>

              {/* Avatar */}
              <Text style={{ color: 'rgba(212,175,55,0.8)', textAlign: 'center', marginBottom: 12 }}>اختر صورتك الشخصية</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
                {AVATAR_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => { setSelectedAvatar(opt.id); setCustomAvatarUri(null); }}
                    style={{ borderWidth: 3, borderColor: selectedAvatar === opt.id ? '#c8860a' : 'transparent', borderRadius: 35, padding: 2 }}
                  >
                    <Image source={opt.source} style={{ width: 60, height: 60, borderRadius: 30 }} />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={handlePickImage}
                  style={{ borderWidth: 3, borderColor: customAvatarUri ? '#c8860a' : '#444', borderRadius: 35, padding: 2, width: 66, height: 66, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2d1f0e' }}
                >
                  {customAvatarUri ? (
                    <Image source={{ uri: customAvatarUri }} style={{ width: 60, height: 60, borderRadius: 30 }} />
                  ) : (
                    <MaterialCommunityIcons name="camera-plus" size={28} color="#c8860a" />
                  )}
                </TouchableOpacity>
              </View>

              {/* Name */}
              <Text style={{ color: 'rgba(212,175,55,0.8)', marginBottom: 6, textAlign: 'right' }}>الاسم</Text>
              <TextInput
                style={{ backgroundColor: '#2d1f0e', borderWidth: 1, borderColor: '#c8860a', borderRadius: 12, padding: 12, color: '#d4af37', fontSize: 16, textAlign: 'right', marginBottom: 16 }}
                placeholder="اسمك هنا"
                placeholderTextColor="rgba(212,175,55,0.4)"
                value={name}
                onChangeText={setName}
                maxLength={20}
              />

              {/* Phone */}
              <Text style={{ color: 'rgba(212,175,55,0.8)', marginBottom: 6, textAlign: 'right' }}>رقم الجوال</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
                <TextInput
                  style={{ flex: 1, backgroundColor: '#2d1f0e', borderWidth: 1, borderColor: '#c8860a', borderRadius: 12, padding: 12, color: '#d4af37', fontSize: 16, textAlign: 'left' }}
                  placeholder="5XXXXXXXX"
                  placeholderTextColor="rgba(212,175,55,0.4)"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  maxLength={15}
                />
                <TouchableOpacity
                  onPress={() => setShowCountryPicker(true)}
                  style={{ backgroundColor: '#2d1f0e', borderWidth: 1, borderColor: '#c8860a', borderRadius: 12, padding: 12, alignItems: 'center', justifyContent: 'center', minWidth: 80 }}
                >
                  <Text style={{ color: '#d4af37', fontSize: 18 }}>{selectedCountry.flag}</Text>
                  <Text style={{ color: 'rgba(212,175,55,0.7)', fontSize: 12 }}>{selectedCountry.code}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={handleSendOTP}
                disabled={isLoading || !isRegisterValid}
                style={{ backgroundColor: isRegisterValid ? '#c8860a' : '#444', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
              >
                {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>إرسال كود التحقق</Text>}
              </TouchableOpacity>

              <View style={{ height: 100 }} />
            </ScrollView>
          </KeyboardAvoidingView>

          {/* Country Picker Modal */}
          <Modal visible={showCountryPicker} transparent animationType="slide" onRequestClose={() => setShowCountryPicker(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
              <View style={{ backgroundColor: '#1c1208', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#c8860a' }}>
                  <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                    <Text style={{ color: '#c8860a', fontSize: 16 }}>إغلاق</Text>
                  </TouchableOpacity>
                  <Text style={{ color: '#d4af37', fontWeight: 'bold', fontSize: 16 }}>اختر الدولة</Text>
                </View>
                <FlatList
                  data={COUNTRY_CODES}
                  keyExtractor={(item) => item.code}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => { setSelectedCountry(item); setShowCountryPicker(false); }}
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 0.5, borderBottomColor: 'rgba(200,134,10,0.2)' }}
                    >
                      <Text style={{ fontSize: 24, marginRight: 12 }}>{item.flag}</Text>
                      <Text style={{ flex: 1, color: '#d4af37', fontSize: 16 }}>{item.name}</Text>
                      <Text style={{ color: 'rgba(212,175,55,0.6)', fontSize: 14 }}>{item.code}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>
          </Modal>
        </ScreenContainer>
      </ImageBackground>
    );
  }

  // ══ شاشة دخول ══
  if (screen === "login") {
    return (
      <ImageBackground source={welcomeBackground} style={{ flex: 1 }} imageStyle={{ opacity: 0.15 }}>
        <ScreenContainer>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>

              <TouchableOpacity onPress={() => setScreen("choice")} style={{ marginBottom: 24 }}>
                <Text style={{ color: '#c8860a', fontSize: 16 }}>→ رجوع</Text>
              </TouchableOpacity>

              <Text style={{ fontSize: 24, fontWeight: '900', color: '#d4af37', textAlign: 'center', marginBottom: 32 }}>دخول</Text>

              <Text style={{ color: 'rgba(212,175,55,0.8)', marginBottom: 6, textAlign: 'right' }}>رقم الجوال</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
                <TextInput
                  style={{ flex: 1, backgroundColor: '#2d1f0e', borderWidth: 1, borderColor: '#c8860a', borderRadius: 12, padding: 12, color: '#d4af37', fontSize: 16, textAlign: 'left' }}
                  placeholder="5XXXXXXXX"
                  placeholderTextColor="rgba(212,175,55,0.4)"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  maxLength={15}
                />
                <TouchableOpacity
                  onPress={() => setShowCountryPicker(true)}
                  style={{ backgroundColor: '#2d1f0e', borderWidth: 1, borderColor: '#c8860a', borderRadius: 12, padding: 12, alignItems: 'center', justifyContent: 'center', minWidth: 80 }}
                >
                  <Text style={{ fontSize: 24 }}>{selectedCountry.flag}</Text>
                  <Text style={{ color: 'rgba(212,175,55,0.7)', fontSize: 12 }}>{selectedCountry.code}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={handleSendOTP}
                disabled={isLoading || !isLoginValid}
                style={{ backgroundColor: isLoginValid ? '#c8860a' : '#444', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
              >
                {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>إرسال كود التحقق</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>

          {/* Country Picker Modal */}
          <Modal visible={showCountryPicker} transparent animationType="slide" onRequestClose={() => setShowCountryPicker(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
              <View style={{ backgroundColor: '#1c1208', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#c8860a' }}>
                  <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                    <Text style={{ color: '#c8860a', fontSize: 16 }}>إغلاق</Text>
                  </TouchableOpacity>
                  <Text style={{ color: '#d4af37', fontWeight: 'bold', fontSize: 16 }}>اختر الدولة</Text>
                </View>
                <FlatList
                  data={COUNTRY_CODES}
                  keyExtractor={(item) => item.code}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => { setSelectedCountry(item); setShowCountryPicker(false); }}
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 0.5, borderBottomColor: 'rgba(200,134,10,0.2)' }}
                    >
                      <Text style={{ fontSize: 24, marginRight: 12 }}>{item.flag}</Text>
                      <Text style={{ flex: 1, color: '#d4af37', fontSize: 16 }}>{item.name}</Text>
                      <Text style={{ color: 'rgba(212,175,55,0.6)', fontSize: 14 }}>{item.code}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>
          </Modal>
        </ScreenContainer>
      </ImageBackground>
    );
  }

  // ══ شاشة إدخال OTP ══
  return (
    <ImageBackground source={welcomeBackground} style={{ flex: 1 }} imageStyle={{ opacity: 0.15 }}>
      <ScreenContainer>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>

          <TouchableOpacity onPress={() => setScreen(screen === "otp" ? "login" : screen)} style={{ marginBottom: 24 }}>
            <Text style={{ color: '#c8860a', fontSize: 16 }}>→ رجوع</Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 24, fontWeight: '900', color: '#d4af37', textAlign: 'center', marginBottom: 8 }}>كود التحقق</Text>
          <Text style={{ color: 'rgba(212,175,55,0.6)', textAlign: 'center', marginBottom: 32 }}>
            أُرسل كود مكون من 6 أرقام إلى{'\n'}{fullPhoneDisplay}
          </Text>

          <TextInput
            style={{ backgroundColor: '#2d1f0e', borderWidth: 2, borderColor: '#c8860a', borderRadius: 14, padding: 16, color: '#d4af37', fontSize: 28, textAlign: 'center', letterSpacing: 8, marginBottom: 24 }}
            placeholder="------"
            placeholderTextColor="rgba(212,175,55,0.3)"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
          />

          <TouchableOpacity
            onPress={handleVerifyOTP}
            disabled={isLoading || otp.length < 6}
            style={{ backgroundColor: otp.length >= 6 ? '#c8860a' : '#444', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 16 }}
          >
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>تحقق وادخل</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSendOTP} disabled={isLoading}>
            <Text style={{ color: 'rgba(212,175,55,0.6)', textAlign: 'center', fontSize: 14 }}>إعادة إرسال الكود</Text>
          </TouchableOpacity>
        </View>

        {/* div مخفي للـ reCAPTCHA */}
        <View nativeID="recaptcha-container" />

      </ScreenContainer>
    </ImageBackground>
  );
}
