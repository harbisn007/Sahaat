import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useColors } from "@/hooks/use-colors";

interface CreateRoomModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (roomName: string) => Promise<void>;
}

export function CreateRoomModal({ visible, onClose, onSubmit }: CreateRoomModalProps) {
  const [roomName, setRoomName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const colors = useColors();

  const handleSubmit = async () => {
    const trimmedName = roomName.trim();

    if (trimmedName.length < 3) {
      Alert.alert("خطأ", "يجب أن يكون اسم الساحة 3 أحرف على الأقل");
      return;
    }

    if (trimmedName.length > 100) {
      Alert.alert("خطأ", "يجب أن لا يزيد اسم الساحة عن 100 حرف");
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit(trimmedName);
      setRoomName("");
      onClose();
    } catch (error) {
      Alert.alert("خطأ", "حدث خطأ أثناء إنشاء الساحة");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setRoomName("");
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 justify-center items-center bg-black/50 px-6">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="w-full max-w-sm"
        >
          <View className="bg-background rounded-2xl p-6 shadow-lg">
            {/* Title */}
            <Text className="text-xl font-bold text-foreground mb-4 text-center">
              إنشاء ساحة جديدة
            </Text>

            {/* Input */}
            <TextInput
              className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-foreground text-base mb-4"
              placeholder="اسم الساحة"
              placeholderTextColor={colors.muted}
              value={roomName}
              onChangeText={setRoomName}
              maxLength={100}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              editable={!isLoading}
              style={{ textAlign: "right" }}
            />

            {/* Buttons */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 bg-surface border border-border rounded-xl py-3 items-center"
                onPress={handleClose}
                disabled={isLoading}
                style={{ opacity: isLoading ? 0.5 : 1 }}
              >
                <Text className="text-foreground font-semibold">إلغاء</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="flex-1 bg-primary rounded-xl py-3 items-center"
                onPress={handleSubmit}
                disabled={isLoading || roomName.trim().length < 3}
                style={{
                  opacity: isLoading || roomName.trim().length < 3 ? 0.5 : 1,
                }}
              >
                <Text className="text-background font-semibold">
                  {isLoading ? "جاري الإنشاء..." : "إنشاء"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
