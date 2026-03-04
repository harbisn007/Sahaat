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
import auth from '@react-native-firebase/auth';

const welcomeBackground = require("@/assets/images/welcome-background.png");

const STORAGE_KEYS = {
  USER_UUID: 'user_uuid',
  USER_NAME: 'user_name',
  USER_AVATAR: 'user_avatar',
  USER_PHONE: 'user_phone',
  TERMS_ACCEPTED: 'terms_accepted',
};

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

type Screen = "choice" | "register" | "recover" | "otp";

export default function WelcomeScreen() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { loginAsGuest } = useUser();
  const trpcUtils = trpc.useUtils();
  const upsertUserByPhone = trpc.auth.upsertUserByPhone.useMutation();

  const [screen, setScreen] = useState<Screen>("choice");
  const [isCheckingUUID, setIsCheckingUUID] = useState(true);
  const previousScreenRef = useRef<Screen>("choice");

  const [name, setName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarType | null>(null);
  const [customAvatarUri, setCustomAvatarUri] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [otp, setOtp] = useState("");
  const confirmResultRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const doNavigate = () => {
    if (redirect) router.replace(redirect as any);
    else router.replace("/(tabs)");
  };

  // فحص UUID عند فتح التطبيق
  useEffect(() => {
    const checkAutoLogin = async () => {
      try {
        const accepted = await AsyncStorage.getItem(STORAGE_KEYS.TERMS_ACCEPTED);
        if (accepted !== 'true') {
          setShowTermsModal(true);
          setIsCheckingUUID(false);
          return;
        }
        const uuid = await AsyncStorage.getItem(STORAGE_KEYS.USER_UUID);
        const savedName = await AsyncStorage.getItem(STORAGE_KEYS.USER_NAME);
        const savedAvatar = await AsyncStorage.getItem(STORAGE_KEYS.USER_AVATAR);
        if (uuid && savedName && savedAvatar) {
          await loginAsGuest(savedName, savedAvatar as AvatarType);
          doNavigate();
          return;
        }
      } catch (e) {
        console.error("[Welcome] Auto-login error:", e);
      }
      setIsCheckingUUID(false);
    };
    checkAutoLogin();
  }, []);

  const handleAcceptTerms = async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.TERMS_ACCEPTED, 'true');
    setShowTermsModal(false);
  };

  const handlePickImage = async () => {
    try {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) { Alert.alert("خطأ", "يجب السماح بالوصول إلى الصور"); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled && result.assets[0]) {
        setCustomAvatarUri(result.assets[0].uri);
        setSelectedAvatar(result.assets[0].uri as AvatarType);
      }
    } catch { Alert.alert("خطأ", "حدث خطأ أثناء اختيار الصورة"); }
  };

  const validateName = (text: string) => {
    const t = text.trim();
    if (!t.length) return { valid: false, message: "يرجى إدخال اسم" };
    const letters = (t.match(/[\u0600-\u06FFa-zA-Z]/g) || []).length;
    if (letters < 3) return { valid: false, message: "يجب أن يحتوي الاسم على 3 حروف على الأقل" };
    if (t.length > 20) return { valid: false, message: "يجب أن لا يزيد الاسم عن 20 حرف" };
    return { valid: true, message: "" };
  };

  const validatePhone = () => {
    const d = phoneNumber.replace(/\D/g, '');
    return d.length >= 7 && d.length <= 15;
  };

  const handleSendOTP = async () => {
    if (!validatePhone()) { Alert.alert("خطأ", "يرجى إدخال رقم جوال صحيح"); return; }
    if (screen === "register") {
      const v = validateName(name);
      if (!v.valid) { Alert.alert("خطأ", v.message); return; }
      if (!selectedAvatar) { Alert.alert("خطأ", "يجب اختيار صورة شخصية"); return; }
    }
    setIsLoading(true);
    try {
      const fullPhone = `${selectedCountry.code}${phoneNumber.replace(/^0/, '')}`;
      if (screen === "recover") {
        const existing = await trpcUtils.auth.getUserByPhone.fetch({ phoneNumber: fullPhone });
        if (!existing) { Alert.alert("خطأ", "هذا الرقم غير مسجّل. سجّل حساب جديد أولاً."); return; }
      }
      auth().signOut().catch(() => {});
      const confirmation = await auth().signInWithPhoneNumber(fullPhone);
      confirmResultRef.current = confirmation;
      previousScreenRef.current = screen;
      setScreen("otp");
      Alert.alert("تم الإرسال", `تم إرسال كود التحقق إلى ${fullPhone}`);
    } catch (error: any) {
      const code = error?.code || '';
      let msg = `فشل إرسال كود التحقق: ${code || error?.message}`;
      if (code === 'auth/too-many-requests') msg = 'محاولات كثيرة. انتظر قليلاً.';
      Alert.alert("خطأ", msg);
    } finally { setIsLoading(false); }
  };

  const handleVerifyOTP = async () => {
    if (!confirmResultRef.current) { Alert.alert("خطأ", "يرجى إعادة إرسال الكود"); return; }
    if (otp.length < 6) { Alert.alert("خطأ", "يرجى إدخال الكود المكون من 6 أرقام"); return; }
    setIsLoading(true);
    try {
      const result = await confirmResultRef.current.confirm(otp);
      if (!result?.user) { Alert.alert("خطأ", "فشل التحقق. حاول مرة أخرى."); return; }
      const firebaseUid = result.user.uid;
      const fullPhone = `${selectedCountry.code}${phoneNumber.replace(/^0/, '')}`;

      if (previousScreenRef.current === "recover") {
        const existing = await trpcUtils.auth.getUserByPhone.fetch({ phoneNumber: fullPhone });
        if (!existing) { Alert.alert("خطأ", "لم يتم العثور على الحساب."); return; }
        await AsyncStorage.setItem(STORAGE_KEYS.USER_UUID, firebaseUid);
        await AsyncStorage.setItem(STORAGE_KEYS.USER_NAME, existing.name || "مستخدم");
        await AsyncStorage.setItem(STORAGE_KEYS.USER_AVATAR, existing.avatar || "male");
        await AsyncStorage.setItem(STORAGE_KEYS.USER_PHONE, fullPhone);
        await loginAsGuest(existing.name || "مستخدم", (existing.avatar || "male") as AvatarType);
      } else {
        const displayName = name.trim() || "مستخدم";
        const avatar = (selectedAvatar || "male") as string;
        await AsyncStorage.setItem(STORAGE_KEYS.USER_UUID, firebaseUid);
        await AsyncStorage.setItem(STORAGE_KEYS.USER_NAME, displayName);
        await AsyncStorage.setItem(STORAGE_KEYS.USER_AVATAR, avatar);
        await AsyncStorage.setItem(STORAGE_KEYS.USER_PHONE, fullPhone);
        await loginAsGuest(displayName, avatar as AvatarType);
        await upsertUserByPhone.mutateAsync({ phoneNumber: fullPhone, name: displayName, avatar, openId: firebaseUid });
      }
      doNavigate();
    } catch (error: any) {
      const code = error?.code || '';
      let msg = code === 'auth/invalid-verification-code' ? 'كود التحقق غير صحيح.'
        : code === 'auth/session-expired' ? 'انتهت صلاحية الكود. أعد الإرسال.'
        : code === 'auth/too-many-requests' ? 'محاولات كثيرة. انتظر قليلاً.'
        : `خطأ: ${code || error?.message}`;
      Alert.alert("خطأ", msg);
    } finally { setIsLoading(false); }
  };

  const isRegisterValid = name.trim().length >= 3 && !!selectedAvatar && validatePhone();
  const fullPhoneDisplay = `${selectedCountry.code} ${phoneNumber}`;

  const goldBtn = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity onPress={onPress} disabled={disabled}
      style={{ backgroundColor: disabled ? 'rgba(200,134,10,0.3)' : '#c8860a', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}>
      <Text style={{ color: '#1c1208', fontSize: 18, fontWeight: '900' }}>{label}</Text>
    </TouchableOpacity>
  );

  const outlineBtn = (label: string, onPress: () => void) => (
    <TouchableOpacity onPress={onPress}
      style={{ borderWidth: 1.5, borderColor: '#c8860a', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
      <Text style={{ color: '#d4af37', fontSize: 18, fontWeight: '900' }}>{label}</Text>
    </TouchableOpacity>
  );

  const phoneInput = () => (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
      <TextInput value={phoneNumber} onChangeText={setPhoneNumber} placeholder="رقم الجوال"
        placeholderTextColor="rgba(212,175,55,0.3)" keyboardType="phone-pad"
        style={{ flex: 1, backgroundColor: '#2d1f0e', borderWidth: 1, borderColor: '#c8860a', borderRadius: 12, padding: 14, color: '#d4af37', fontSize: 16, textAlign: 'right' }} />
      <TouchableOpacity onPress={() => setShowCountryPicker(true)}
        style={{ backgroundColor: '#2d1f0e', borderWidth: 1, borderColor: '#c8860a', borderRadius: 12, padding: 14, justifyContent: 'center', alignItems: 'center', minWidth: 80 }}>
        <Text style={{ fontSize: 20 }}>{selectedCountry.flag}</Text>
        <Text style={{ color: '#d4af37', fontSize: 12 }}>{selectedCountry.code}</Text>
      </TouchableOpacity>
    </View>
  );

  if (isCheckingUUID) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1c1208' }}><ActivityIndicator size="large" color="#c8860a" /></View>;
  }

  return (
    <ImageBackground source={welcomeBackground} style={{ flex: 1 }} imageStyle={{ opacity: 0.15 }}>
      {/* Modal الشروط */}
      <Modal visible={showTermsModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#2d1f0e', borderRadius: 16, padding: 24, width: '100%', borderWidth: 1, borderColor: '#c8860a' }}>
            <Text style={{ color: '#d4af37', fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 16 }}>إقرار وتعهد</Text>
            <ScrollView style={{ maxHeight: 250, marginBottom: 16 }}>
              <Text style={{ color: 'rgba(212,175,55,0.85)', fontSize: 13, lineHeight: 22, textAlign: 'right' }}>
                بالدخول إلى هذا التطبيق، أقر وأتعهد بما يلي:{'\n\n'}
                • الالتزام بآداب المحاورة الشعرية والاحترام المتبادل{'\n'}
                • عدم استخدام ألفاظ نابية أو مسيئة{'\n'}
                • احترام الثقافة والتراث الشعري العربي{'\n'}
                • عدم نشر أي محتوى مخالف للأنظمة والقوانين{'\n'}
                • الالتزام بقواعد المنصة وسياسات الاستخدام
              </Text>
            </ScrollView>
            <TouchableOpacity onPress={handleAcceptTerms}
              style={{ backgroundColor: '#c8860a', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: '#1c1208', fontSize: 16, fontWeight: '900' }}>أوافق وأتعهد</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Country Picker */}
      <Modal visible={showCountryPicker} transparent animationType="slide">
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setShowCountryPicker(false)}>
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#2d1f0e', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' }}>
            <Text style={{ color: '#d4af37', fontSize: 18, fontWeight: '900', textAlign: 'center', padding: 16 }}>اختر الدولة</Text>
            <FlatList data={COUNTRY_CODES} keyExtractor={i => i.code} renderItem={({ item }) => (
              <TouchableOpacity onPress={() => { setSelectedCountry(item); setShowCountryPicker(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(200,134,10,0.2)' }}>
                <Text style={{ fontSize: 24, marginRight: 12 }}>{item.flag}</Text>
                <Text style={{ color: '#d4af37', fontSize: 16, flex: 1, textAlign: 'right' }}>{item.name}</Text>
                <Text style={{ color: 'rgba(212,175,55,0.6)', fontSize: 14, marginLeft: 8 }}>{item.code}</Text>
              </TouchableOpacity>
            )} />
          </View>
        </Pressable>
      </Modal>

      <ScreenContainer>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

          {/* ══ شاشة الاختيار ══ */}
          {screen === "choice" && (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
              <Text style={{ fontSize: 36, fontWeight: '900', color: '#d4af37', marginBottom: 8, textAlign: 'center' }}>طواريق</Text>
              <Text style={{ fontSize: 14, color: 'rgba(212,175,55,0.7)', marginBottom: 56, textAlign: 'center' }}>منصة تفاعلية للمحاورة الشعرية</Text>
              <View style={{ width: '100%' }}>
                {goldBtn("تسجيل جديد", () => setScreen("register"))}
                {outlineBtn("استعادة حساب", () => setScreen("recover"))}
              </View>
              <Text style={{ color: 'rgba(212,175,55,0.35)', fontSize: 11, marginTop: 24, textAlign: 'center' }}>
                استعادة الحساب: إذا غيرت جهازك أو حذفت التطبيق
              </Text>
            </View>
          )}

          {/* ══ شاشة التسجيل ══ */}
          {screen === "register" && (
            <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
              <TouchableOpacity onPress={() => setScreen("choice")} style={{ marginBottom: 16 }}>
                <Text style={{ color: '#c8860a', fontSize: 14 }}>→ رجوع</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#d4af37', textAlign: 'center', marginBottom: 24 }}>تسجيل جديد</Text>

              {/* الافتار */}
              <Text style={{ color: 'rgba(212,175,55,0.7)', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>اختر صورتك الشخصية</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 4 }}>
                  {AVATAR_OPTIONS.map((avatar) => (
                    <TouchableOpacity key={avatar.id} onPress={() => { setSelectedAvatar(avatar.id as AvatarType); setCustomAvatarUri(null); }}
                      style={{ width: 70, height: 70, borderRadius: 35, borderWidth: selectedAvatar === avatar.id ? 3 : 1, borderColor: selectedAvatar === avatar.id ? '#c8860a' : 'rgba(200,134,10,0.3)', overflow: 'hidden' }}>
                      <Image source={getAvatarSourceById(avatar.id)} style={{ width: '100%', height: '100%' }} />
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity onPress={handlePickImage}
                    style={{ width: 70, height: 70, borderRadius: 35, borderWidth: customAvatarUri ? 3 : 1, borderColor: customAvatarUri ? '#c8860a' : 'rgba(200,134,10,0.3)', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(200,134,10,0.1)', overflow: 'hidden' }}>
                    {customAvatarUri ? <Image source={{ uri: customAvatarUri }} style={{ width: '100%', height: '100%' }} /> : <MaterialCommunityIcons name="camera-plus" size={28} color="rgba(212,175,55,0.6)" />}
                  </TouchableOpacity>
                </View>
              </ScrollView>

              {/* الاسم */}
              <Text style={{ color: 'rgba(212,175,55,0.7)', fontSize: 13, textAlign: 'right', marginBottom: 8 }}>الاسم</Text>
              <TextInput value={name} onChangeText={setName} placeholder="أدخل اسمك (3-20 حرف)"
                placeholderTextColor="rgba(212,175,55,0.3)"
                style={{ backgroundColor: '#2d1f0e', borderWidth: 1, borderColor: '#c8860a', borderRadius: 12, padding: 14, color: '#d4af37', fontSize: 16, textAlign: 'right', marginBottom: 16 }}
                maxLength={20} />

              {/* الجوال */}
              <Text style={{ color: 'rgba(212,175,55,0.7)', fontSize: 13, textAlign: 'right', marginBottom: 8 }}>رقم الجوال</Text>
              {phoneInput()}

              <TouchableOpacity onPress={handleSendOTP} disabled={!isRegisterValid || isLoading}
                style={{ backgroundColor: isRegisterValid && !isLoading ? '#c8860a' : 'rgba(200,134,10,0.3)', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
                {isLoading ? <ActivityIndicator color="#1c1208" /> : <Text style={{ color: '#1c1208', fontSize: 18, fontWeight: '900' }}>إرسال كود التحقق</Text>}
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* ══ شاشة الاستعادة ══ */}
          {screen === "recover" && (
            <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
              <TouchableOpacity onPress={() => setScreen("choice")} style={{ marginBottom: 24 }}>
                <Text style={{ color: '#c8860a', fontSize: 14 }}>→ رجوع</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#d4af37', textAlign: 'center', marginBottom: 8 }}>استعادة حساب</Text>
              <Text style={{ color: 'rgba(212,175,55,0.6)', fontSize: 13, textAlign: 'center', marginBottom: 32 }}>أدخل رقم الجوال المسجّل</Text>
              {phoneInput()}
              <TouchableOpacity onPress={handleSendOTP} disabled={!validatePhone() || isLoading}
                style={{ backgroundColor: validatePhone() && !isLoading ? '#c8860a' : 'rgba(200,134,10,0.3)', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
                {isLoading ? <ActivityIndicator color="#1c1208" /> : <Text style={{ color: '#1c1208', fontSize: 18, fontWeight: '900' }}>إرسال كود التحقق</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ══ شاشة OTP ══ */}
          {screen === "otp" && (
            <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
              <TouchableOpacity onPress={() => setScreen(previousScreenRef.current)} style={{ marginBottom: 24 }}>
                <Text style={{ color: '#c8860a', fontSize: 14 }}>→ رجوع</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#d4af37', textAlign: 'center', marginBottom: 8 }}>كود التحقق</Text>
              <Text style={{ color: 'rgba(212,175,55,0.6)', fontSize: 13, textAlign: 'center', marginBottom: 32 }}>
                أرسل كود مكون من 6 أرقام إلى{'\n'}{fullPhoneDisplay}
              </Text>
              <TextInput value={otp} onChangeText={setOtp} placeholder="------"
                placeholderTextColor="rgba(212,175,55,0.3)" keyboardType="number-pad" maxLength={6}
                style={{ backgroundColor: '#2d1f0e', borderWidth: 1.5, borderColor: '#c8860a', borderRadius: 12, padding: 16, color: '#d4af37', fontSize: 28, textAlign: 'center', letterSpacing: 8, marginBottom: 24 }} />
              <TouchableOpacity onPress={handleVerifyOTP} disabled={otp.length < 6 || isLoading}
                style={{ backgroundColor: otp.length >= 6 && !isLoading ? '#c8860a' : 'rgba(200,134,10,0.3)', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 16 }}>
                {isLoading ? <ActivityIndicator color="#1c1208" /> : <Text style={{ color: '#1c1208', fontSize: 18, fontWeight: '900' }}>تحقق وادخل</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSendOTP} disabled={isLoading}>
                <Text style={{ color: 'rgba(212,175,55,0.6)', fontSize: 14, textAlign: 'center' }}>إعادة إرسال الكود</Text>
              </TouchableOpacity>
            </View>
          )}

        </KeyboardAvoidingView>
      </ScreenContainer>
    </ImageBackground>
  );
}
