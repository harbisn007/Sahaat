import { TouchableOpacity, Text, View, Animated, Pressable } from "react-native";
import { useEffect, useRef } from "react";
import { useColors } from "@/hooks/use-colors";

interface RecordingButtonProps {
  isRecording: boolean;
  isPreparing: boolean;
  label: string;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  backgroundColor?: string;
  pressAndHold?: boolean;
}

export function RecordingButton({
  isRecording,
  isPreparing,
  label,
  onPress,
  onPressIn,
  onPressOut,
  backgroundColor,
  pressAndHold = false,
}: RecordingButtonProps) {
  const colors = useColors();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      // Pulse animation while recording
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  if (pressAndHold) {
    return (
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <Pressable
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={isPreparing}
          style={({ pressed }) => ([
            {
              backgroundColor: isRecording ? colors.error : backgroundColor || colors.primary,
              opacity: isPreparing ? 0.6 : pressed ? 0.9 : 1,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: "center",
            },
          ])}
        >
          <View className="flex-row items-center gap-2">
            {isRecording && (
              <View className="w-3 h-3 rounded-full bg-background animate-pulse" />
            )}
            <Text className="text-background font-bold text-base">
              {isPreparing 
                ? "جاري التحضير..." 
                : isRecording 
                  ? "🎤 جاري التسجيل... (اترك للإرسال)" 
                  : `👆 اضغط مع الاستمرار ${label}`}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
      <TouchableOpacity
        className="rounded-xl py-4 items-center"
        style={{
          backgroundColor: isRecording
            ? colors.error
            : backgroundColor || colors.primary,
          opacity: isPreparing ? 0.6 : 1,
        }}
        onPress={onPress}
        disabled={isPreparing}
      >
        <View className="flex-row items-center gap-2">
          {isRecording && (
            <View className="w-3 h-3 rounded-full bg-background animate-pulse" />
          )}
          <Text className="text-background font-bold text-base">
            {isPreparing ? "جاري التحضير..." : isRecording ? "⏹ إيقاف التسجيل" : label}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
