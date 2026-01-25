import { Pressable, Text, View, Animated, Platform } from "react-native";
import { useEffect, useRef, useState } from "react";
import { useColors } from "@/hooks/use-colors";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

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
  iconComponent?: React.ReactNode; // أيقونة SVG مخصصة
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
  iconComponent,
  iconSize = 24,
  showLabel = true,
  minHeight = 48,
}: RecordingButtonProps) {
  const colors = useColors();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [showDeleteIcon, setShowDeleteIcon] = useState(false);
  const deleteIconOpacity = useRef(new Animated.Value(0)).current;
  const deleteIconScale = useRef(new Animated.Value(0.5)).current;
  const deleteIconRotation = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const [isNearDelete, setIsNearDelete] = useState(false);

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
      
      // Show delete icon after 0.5 second
      setTimeout(() => {
        setShowDeleteIcon(true);
        // Animate delete icon appearance
        Animated.parallel([
          Animated.timing(deleteIconOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.spring(deleteIconScale, {
            toValue: 1,
            friction: 5,
            useNativeDriver: true,
          }),
        ]).start();
        
        // Start swinging animation
        Animated.loop(
          Animated.sequence([
            Animated.timing(deleteIconRotation, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(deleteIconRotation, {
              toValue: -1,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(deleteIconRotation, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ])
        ).start();
      }, 500);
    } else {
      pulseAnim.setValue(1);
      setShowDeleteIcon(false);
      deleteIconOpacity.setValue(0);
      deleteIconScale.setValue(0.5);
      deleteIconRotation.setValue(0);
      translateY.setValue(0);
      setIsNearDelete(false);
    }
  }, [isRecording]);
  
  // Pan gesture for canceling recording
  const panGesture = Gesture.Pan()
    .enabled(isRecording && pressAndHold)
    .onUpdate((event) => {
      // Only respond to downward swipes
      if (event.translationY > 0) {
        translateY.setValue(event.translationY);
        // Check if near delete zone (more than 60px)
        setIsNearDelete(event.translationY > 60);
      }
    })
    .onEnd((event) => {
      // Cancel if swiped down more than 80px (into delete zone)
      if (event.translationY > 80) {
        if (onCancelRecording) {
          onCancelRecording();
        }
      }
      // Reset position
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
      setIsNearDelete(false);
    });

  // Rotation interpolation for swinging effect
  const rotateInterpolation = deleteIconRotation.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-15deg', '0deg', '15deg'],
  });

  if (pressAndHold) {
    const buttonContent = (
      <Animated.View style={{ transform: [{ scale: pulseAnim }, { translateY }], width: '100%' }}>
        {/* Delete Icon - appears below the button */}
        {showDeleteIcon && (
          <Animated.View 
            style={{ 
              position: 'absolute',
              bottom: -70,
              left: 0,
              right: 0,
              alignItems: 'center',
              opacity: deleteIconOpacity,
              transform: [
                { scale: deleteIconScale },
                { rotate: rotateInterpolation },
                { scale: isNearDelete ? 1.3 : 1 },
              ],
              zIndex: 10,
            }}
          >
            <View 
              style={{
                backgroundColor: isNearDelete ? '#FF0000' : 'rgba(255,0,0,0.8)',
                padding: 12,
                borderRadius: 30,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
                elevation: 5,
              }}
            >
              <MaterialIcons 
                name="delete" 
                size={28} 
                color="#FFFFFF" 
              />
            </View>
            <Text 
              style={{ 
                color: isNearDelete ? '#FF0000' : '#FF6666', 
                fontSize: 10, 
                marginTop: 4,
                fontWeight: '700',
              }}
            >
              اسحب هنا للحذف
            </Text>
          </Animated.View>
        )}
        <Pressable
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={isPreparing}
          style={({ pressed }) => ({
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
          {(icon || iconComponent) ? (
            <View className="items-center gap-0.5">
              {iconComponent ? iconComponent : <Text style={{ fontSize: iconSize, color: '#FFD700' }}>{icon}</Text>}
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
