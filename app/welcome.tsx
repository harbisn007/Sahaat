import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useUser } from "@/lib/user-context";
import { useColors } from "@/hooks/use-colors";

export default function WelcomeScreen() {
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { setUsername } = useUser();
  const colors = useColors();

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

    setIsLoading(true);
    try {
      await setUsername(trimmedName);
      router.replace("/(tabs)");
    } catch (error) {
      Alert.alert("خطأ", "حدث خطأ أثناء حفظ الاسم");
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
        <View className="flex-1 justify-center items-center px-6">
          {/* Logo/Title */}
          <View className="items-center mb-12">
            <Text className="text-4xl font-bold text-foreground mb-3">
              ساحات المحاورة
            </Text>
            <Text className="text-base text-muted text-center">
              منصة تفاعلية للمحادثات الصوتية
            </Text>
          </View>

          {/* Input Card */}
          <View className="w-full max-w-sm bg-surface rounded-2xl p-6 shadow-sm border border-border">
            <Text className="text-lg font-semibold text-foreground mb-4 text-center">
              مرحباً بك!
            </Text>
            <Text className="text-sm text-muted mb-4 text-center">
              الرجاء إدخال اسمك للبدء
            </Text>
            
            <TextInput
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground text-base mb-4"
              placeholder="اسمك هنا"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
              maxLength={20}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              editable={!isLoading}
              style={{ textAlign: "right" }}
            />

            <TouchableOpacity
              className="w-full bg-primary rounded-xl py-3 items-center"
              onPress={handleSubmit}
              disabled={isLoading || name.trim().length < 3}
              style={{
                opacity: isLoading || name.trim().length < 3 ? 0.5 : 1,
              }}
            >
              <Text className="text-background font-semibold text-base">
                {isLoading ? "جاري الحفظ..." : "دخول"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Helper Text */}
          <Text className="text-xs text-muted mt-6 text-center">
            يجب أن يكون الاسم بين 3 و 20 حرف
          </Text>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
