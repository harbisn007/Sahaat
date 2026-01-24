import { Pressable, Text, View, Animated, Platform } from "react-native";
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
  minHeight?: number; // الحد الأدنى للارتفاع
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
  minHeight = 48,
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
        <Pressable
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={isPreparing}
          style={({ pressed }) => ({
            flex: 1,
            backgroundColor: pressed || isRecording ? colors.error : backgroundColor || colors.primary,
            opacity: isPreparing ? 0.6 : 1,
            borderRadius: 8,
            paddingVertical: 8,
            paddingHorizontal: 4,
            alignItems: "center",
            justifyContent: "center",
            minHeight,
          })}
        >
          {icon ? (
            <View className="items-center gap-0.5">
              <Text style={{ fontSize: iconSize }}>{icon}</Text>
              {showLabel && minHeight < 50 && (
                <View className="items-center">
                  {isPreparing ? (
                    <Text 
                      style={{ 
                        color: '#FFFFFF',
                        fontSize: 10,
                        fontWeight: '800',
                        textAlign: 'center',
                        letterSpacing: 0.3,
                      }}
                    >
                      جاري...
                    </Text>
                  ) : isRecording ? (
                    <Text 
                      style={{ 
                        color: '#FFFFFF',
                        fontSize: 10,
                        fontWeight: '800',
                        textAlign: 'center',
                      }}
                    >
                      {recordingDuration || "00:00"}
                    </Text>
                  ) : label?.includes('\n') ? (
                    label.split('\n').map((line, i) => (
                      <Text 
                        key={i}
                        style={{ 
                          color: '#FFFFFF',
                          fontSize: 10,
                          fontWeight: '800',
                          textAlign: 'center',
                          letterSpacing: 0.3,
                          lineHeight: 13,
                        }}
                      >
                        {line}
                      </Text>
                    ))
                  ) : (
                    <Text 
                      style={{ 
                        color: '#FFFFFF',
                        fontSize: 10,
                        fontWeight: '800',
                        textAlign: 'center',
                        letterSpacing: 0.3,
                      }}
                    >
                      {label}
                    </Text>
                  )}
                </View>
              )}
              {!showLabel && isRecording && (
                <Text 
                  style={{ 
                    color: '#FFFFFF',
                    fontSize: 10,
                    fontWeight: '800',
                    textAlign: 'center',
                  }}
                >
                  {recordingDuration || "00:00"}
                </Text>
              )}
            </View>
          ) : (
            <Text 
              style={{ 
                color: '#FFFFFF',
                fontSize: 10,
                fontWeight: '800',
                textAlign: 'center',
                letterSpacing: 0.3,
              }}
            >
              {isPreparing 
                ? "جاري..." 
                : isRecording 
                  ? recordingDuration || "00:00" 
                  : label}
            </Text>
          )}
        </Pressable>
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
      <Pressable
        className="rounded-xl py-4 items-center"
        style={({ pressed }) => ({
          backgroundColor: pressed || isRecording
            ? colors.error
            : backgroundColor || colors.primary,
          opacity: isPreparing ? 0.6 : 1,
        })}
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
      </Pressable>
    </Animated.View>
  );
}
