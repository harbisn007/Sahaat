import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Image, ScrollView } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useUser } from "@/lib/user-context";
import { useColors } from "@/hooks/use-colors";
import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AVATAR_STORAGE_KEY = "@sahaat_muhawara:userAvatar";

// Default avatars
const DEFAULT_AVATARS = {
  male: require("@/assets/images/avatar-male.png"),
  female: require("@/assets/images/avatar-female.png"),
};

export default function WelcomeScreen() {
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [customAvatarUri, setCustomAvatarUri] = useState<string | null>(null);
  const { setUsername } = useUser();
  const colors = useColors();

  const handleSelectAvatar = (avatarType: "male" | "female") => {
    setSelectedAvatar(avatarType);
    setCustomAvatarUri(null);
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled) {
        setCustomAvatarUri(result.assets[0].uri);
        setSelectedAvatar(null);
      }
    } catch (error) {
      Alert.alert("خطأ", "فشل في اختيار الصورة");
    }
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    
    if (trimmedName.length < 3) {
      Alert.alert("خطأ", "يجب أن يكون الاسم 3 أحرف على الأقل");
      return;
    }

    if (trimmedName.length > 20) {
      Alert.alert("خطأ", "يجب أن لا يزيد الاسم عن 20 حرف");
      return;
    }

    if (!selectedAvatar && !customAvatarUri) {
      Alert.alert("خطأ", "يجب أن تختار صورة شخصية");
      return;
    }

    setIsLoading(true);
    try {
      // Save username
      await setUsername(trimmedName);

      // Save avatar info
      const avatarData = {
        type: selectedAvatar || "custom",
        customUri: customAvatarUri || null,
      };
      await AsyncStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(avatarData));

      router.replace("/(tabs)");
    } catch (error) {
      Alert.alert("خطأ", "حدث خطأ أثناء حفظ البيانات");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6">
          <View className="flex-1 justify-center items-center">
            {/* Logo/Title */}
            <View className="items-center mb-8">
              <Text className="text-4xl font-bold text-foreground mb-3">
                ساحات المحاورة
              </Text>
              <Text className="text-base text-muted text-center">
                منصة تفاعلية للمحادثات الصوتية
              </Text>
            </View>

            {/* Input Card */}
            <View className="w-full max-w-sm bg-surface rounded-2xl p-6 shadow-sm border border-border mb-6">
              <Text className="text-lg font-semibold text-foreground mb-4 text-center">
                مرحباً بك!
              </Text>
              <Text className="text-sm text-muted mb-6 text-center">
                الرجاء إدخال اسمك واختيار صورة شخصية
              </Text>
              
              {/* Name Input */}
              <TextInput
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground text-base mb-6"
                placeholder="اسمك هنا"
                placeholderTextColor={colors.muted}
                value={name}
                onChangeText={setName}
                maxLength={20}
                autoFocus
                returnKeyType="done"
                editable={!isLoading}
                style={{ textAlign: "right" }}
              />

              {/* Avatar Selection */}
              <Text className="text-sm font-semibold text-foreground mb-3 text-center">
                اختر صورة شخصية
              </Text>

              <View className="flex-row justify-center gap-4 mb-4">
                {/* Male Avatar */}
                <TouchableOpacity
                  onPress={() => handleSelectAvatar("male")}
                  disabled={isLoading}
                  style={{
                    borderWidth: selectedAvatar === "male" ? 3 : 2,
                    borderColor: selectedAvatar === "male" ? colors.primary : colors.border,
                    borderRadius: 12,
                    padding: 4,
                    opacity: isLoading ? 0.5 : 1,
                  }}
                >
                  <Image
                    source={DEFAULT_AVATARS.male}
                    style={{ width: 70, height: 70, borderRadius: 8 }}
                  />
                </TouchableOpacity>

                {/* Female Avatar */}
                <TouchableOpacity
                  onPress={() => handleSelectAvatar("female")}
                  disabled={isLoading}
                  style={{
                    borderWidth: selectedAvatar === "female" ? 3 : 2,
                    borderColor: selectedAvatar === "female" ? colors.primary : colors.border,
                    borderRadius: 12,
                    padding: 4,
                    opacity: isLoading ? 0.5 : 1,
                  }}
                >
                  <Image
                    source={DEFAULT_AVATARS.female}
                    style={{ width: 70, height: 70, borderRadius: 8 }}
                  />
                </TouchableOpacity>

                {/* Custom Avatar */}
                <TouchableOpacity
                  onPress={handlePickImage}
                  disabled={isLoading}
                  style={{
                    borderWidth: customAvatarUri ? 3 : 2,
                    borderColor: customAvatarUri ? colors.primary : colors.border,
                    borderRadius: 12,
                    padding: 4,
                    width: 78,
                    height: 78,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: colors.background,
                    opacity: isLoading ? 0.5 : 1,
                  }}
                >
                  {customAvatarUri ? (
                    <Image
                      source={{ uri: customAvatarUri }}
                      style={{ width: 70, height: 70, borderRadius: 8 }}
                    />
                  ) : (
                    <Text className="text-2xl">+</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                className="w-full bg-primary rounded-xl py-3 items-center mt-6"
                onPress={handleSubmit}
                disabled={isLoading || name.trim().length < 3 || (!selectedAvatar && !customAvatarUri)}
                style={{
                  opacity: isLoading || name.trim().length < 3 || (!selectedAvatar && !customAvatarUri) ? 0.5 : 1,
                }}
              >
                <Text className="text-background font-semibold text-base">
                  {isLoading ? "جاري الحفظ..." : "دخول"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Helper Text */}
            <Text className="text-xs text-muted text-center">
              يجب أن يكون الاسم بين 3 و 20 حرف وتختار صورة شخصية
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
