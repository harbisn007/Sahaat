import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Image, ScrollView, ImageBackground } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useUser } from "@/lib/user-context";
import { useColors } from "@/hooks/use-colors";
import * as ImagePicker from "expo-image-picker";
import type { AvatarType } from "@/lib/user-context";

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
  const { setUserData } = useUser();
  const colors = useColors();

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

  const handleSubmit = async () => {
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
      await setUserData(trimmedName, selectedAvatar);
      // Redirect to the original page if provided, otherwise go to tabs
      if (redirect) {
        router.replace(redirect as any);
      } else {
        router.replace("/(tabs)");
      }
    } catch (error) {
      Alert.alert("خطأ", "حدث خطأ أثناء حفظ البيانات");
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = validateName(name).valid && selectedAvatar !== null;

  return (
    <ImageBackground 
      source={welcomeBackground} 
      style={{ flex: 1 }} 
      resizeMode="cover"
    >
    <ScreenContainer containerClassName="bg-transparent">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView 
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
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
                  style={{
                    borderWidth: 3,
                    borderColor: selectedAvatar === 'male' ? colors.primary : 'transparent',
                    borderRadius: 50,
                    padding: 3,
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
                  style={{
                    borderWidth: 3,
                    borderColor: selectedAvatar === 'female' ? colors.primary : 'transparent',
                    borderRadius: 50,
                    padding: 3,
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
                  style={{
                    borderWidth: 3,
                    borderColor: customAvatarUri ? colors.primary : 'transparent',
                    borderRadius: 50,
                    padding: 3,
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
                onSubmitEditing={handleSubmit}
                editable={!isLoading}
                style={{ textAlign: "right" }}
              />

              <TouchableOpacity
                className="w-full bg-primary rounded-xl py-3 items-center"
                onPress={handleSubmit}
                disabled={isLoading || !isFormValid}
                style={{
                  opacity: isLoading || !isFormValid ? 0.5 : 1,
                }}
              >
                <Text className="text-background font-semibold text-base">
                  {isLoading ? "جاري الحفظ..." : "دخول"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Helper Text */}
            <Text className="text-xs text-muted mt-6 text-center">
              يجب اختيار صورة وإدخال اسم (3-20 حرف)
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
    </ImageBackground>
  );
}
