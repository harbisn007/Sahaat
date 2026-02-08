import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { AvatarType } from "@/lib/user-context";

import { AVATAR_OPTIONS, getAvatarSourceById } from "@/lib/avatars";

interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string, avatar: AvatarType) => Promise<void>;
  currentName: string;
  currentAvatar: AvatarType | null;
}

export function EditProfileModal({
  visible,
  onClose,
  onSave,
  currentName,
  currentAvatar,
}: EditProfileModalProps) {
  const [name, setName] = useState(currentName);
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarType>(currentAvatar || "male");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  const handleModalShow = () => {
    setName(currentName);
    setSelectedAvatar(currentAvatar || "male");
    setError(null);
  };

  const handleSave = async () => {
    // Validate name
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError("الاسم يجب أن يكون حرفين على الأقل");
      return;
    }
    if (trimmedName.length > 20) {
      setError("الاسم يجب أن لا يتجاوز 20 حرف");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(trimmedName, selectedAvatar);
      onClose();
    } catch (err) {
      console.error("Failed to save profile:", err);
      setError("فشل في حفظ التغييرات");
    } finally {
      setIsSaving(false);
    }
  };

  const getAvatarSource = (avatar: AvatarType) => getAvatarSourceById(avatar);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={handleModalShow}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View
            className="w-full max-w-sm rounded-3xl p-6"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.98)" }}
          >
            {/* Header */}
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-xl font-bold text-foreground">تعديل الملف الشخصي</Text>
              <TouchableOpacity onPress={onClose} disabled={isSaving}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Avatar Selection */}
              <View className="mb-6">
                <Text className="text-sm text-muted mb-3 text-center">اختر صورتك</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                  {AVATAR_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => setSelectedAvatar(opt.id)}
                      style={{
                        borderWidth: 3,
                        borderColor: selectedAvatar === opt.id ? '#8B4513' : 'transparent',
                        borderRadius: 35,
                        padding: 2,
                      }}
                    >
                      <Image
                        source={opt.source}
                        style={{ width: 56, height: 56, borderRadius: 28 }}
                        resizeMode="cover"
                      />
                      {selectedAvatar === opt.id && (
                        <View
                          style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: '#8B4513', borderRadius: 10, padding: 2 }}
                        >
                          <MaterialIcons name="check" size={14} color="white" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Name Input */}
              <View className="mb-6">
                <Text className="text-sm text-muted mb-2 text-center">اسمك</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="أدخل اسمك"
                  placeholderTextColor="#999"
                  className="bg-surface rounded-xl px-4 py-3 text-foreground text-center text-base"
                  style={{ borderWidth: 1, borderColor: "#E5E7EB" }}
                  maxLength={20}
                  editable={!isSaving}
                />
                <Text className="text-xs text-muted text-center mt-1">
                  {name.length}/20 حرف
                </Text>
              </View>

              {/* Error Message */}
              {error && (
                <View className="mb-4 p-3 rounded-xl bg-red-50">
                  <Text className="text-red-600 text-center text-sm">{error}</Text>
                </View>
              )}

              {/* Save Button */}
              <TouchableOpacity
                onPress={handleSave}
                disabled={isSaving}
                className={`py-4 rounded-full items-center ${isSaving ? "opacity-50" : ""}`}
                style={{ backgroundColor: "#8B4513" }}
              >
                <Text className="text-white font-bold text-lg">
                  {isSaving ? "جاري الحفظ..." : "حفظ التغييرات"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
