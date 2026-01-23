import { TouchableOpacity, Text, View, Animated } from "react-native";
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
  recordingDuration?: string;
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
  recordingDuration,
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
      <Animated.View style={{ transform: [{ scale: pulseAnim }], flex: 1 }}>
        <TouchableOpacity
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={isPreparing}
          activeOpacity={0.8}
          delayPressIn={0}
          delayPressOut={0}
          style={{
            flex: 1,
            backgroundColor: isRecording ? colors.error : backgroundColor || colors.primary,
            opacity: isPreparing ? 0.6 : 1,
            borderRadius: 8,
            paddingVertical: 10,
            paddingHorizontal: 8,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text className="text-background font-bold text-xs text-center">
            {isPreparing 
              ? "جاري..." 
              : isRecording 
                ? recordingDuration || "00:00" 
                : label}
          </Text>
        </TouchableOpacity>
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
