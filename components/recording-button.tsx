import { TouchableOpacity, Text, View, Animated, Platform } from "react-native";
import { useEffect, useRef, useState } from "react";
import { useColors } from "@/hooks/use-colors";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

interface RecordingButtonProps {
  isRecording: boolean;
  isPreparing: boolean;
  label?: string; // اختياري الآن
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  onCancelRecording?: () => void; // جديد: إلغاء التسجيل بالسحب
  backgroundColor?: string;
  pressAndHold?: boolean;
  recordingDuration?: string;
  icon?: string; // أيقونة المايكروفون (مثل "🎙️" أو "🎤")
  iconSize?: number; // حجم الأيقونة
  showLabel?: boolean; // إظهار النص أم لا
}

export function RecordingButton({
  isRecording,
  isPreparing,
  label,
  onPress,
  onPressIn,
  onPressOut,
  onCancelRecording,
  backgroundColor,
  pressAndHold = false,
  recordingDuration,
  icon,
  iconSize = 24,
  showLabel = true,
}: RecordingButtonProps) {
  const colors = useColors();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [showCancelHint, setShowCancelHint] = useState(false);
  const cancelHintOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

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
      
      // Show cancel hint after 1 second
      setTimeout(() => {
        setShowCancelHint(true);
        Animated.timing(cancelHintOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }, 1000);
    } else {
      pulseAnim.setValue(1);
      setShowCancelHint(false);
      cancelHintOpacity.setValue(0);
      translateY.setValue(0);
    }
  }, [isRecording]);
  
  // Pan gesture for canceling recording
  const panGesture = Gesture.Pan()
    .enabled(isRecording && pressAndHold)
    .onUpdate((event) => {
      // Only respond to downward swipes
      if (event.translationY > 0) {
        translateY.setValue(event.translationY);
      }
    })
    .onEnd((event) => {
      // Cancel if swiped down more than 50px
      if (event.translationY > 50) {
        if (onCancelRecording) {
          onCancelRecording();
        }
      }
      // Reset position
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    });

  if (pressAndHold) {
    const buttonContent = (
      <Animated.View style={{ transform: [{ scale: pulseAnim }, { translateY }], flex: 1 }}>
        {showCancelHint && (
          <Animated.View 
            style={{ 
              position: 'absolute',
              top: -30,
              left: 0,
              right: 0,
              alignItems: 'center',
              opacity: cancelHintOpacity,
              zIndex: 10,
            }}
          >
            <View 
              style={{
                backgroundColor: 'rgba(0,0,0,0.7)',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 10 }}>
                ↓ اسحب للأسفل لإلغاء
              </Text>
            </View>
          </Animated.View>
        )}
        <TouchableOpacity
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={isPreparing}
          activeOpacity={0.8}
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
          {icon ? (
            <View className="items-center gap-1">
              <Text style={{ fontSize: iconSize }}>{icon}</Text>
              {showLabel && (
                <Text className="text-background font-bold" style={{ fontSize: 10 }}>
                  {isPreparing 
                    ? "جاري..." 
                    : isRecording 
                      ? recordingDuration || "00:00" 
                      : label}
                </Text>
              )}
              {!showLabel && isRecording && (
                <Text className="text-background font-bold" style={{ fontSize: 10 }}>
                  {recordingDuration || "00:00"}
                </Text>
              )}
            </View>
          ) : (
            <Text className="text-background font-bold text-xs text-center">
              {isPreparing 
                ? "جاري..." 
                : isRecording 
                  ? recordingDuration || "00:00" 
                  : label}
            </Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
    
    // Wrap with GestureDetector on Native only
    if (Platform.OS !== "web") {
      return <GestureDetector gesture={panGesture}>{buttonContent}</GestureDetector>;
    }
    
    return buttonContent;
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
