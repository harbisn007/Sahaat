import { Pressable, Text, View, Animated, Platform } from "react-native";
import { useEffect, useRef, useState, useCallback } from "react";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

interface RecordingButtonProps {
  isRecording: boolean;
  isPreparing: boolean;
  label?: string;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  onCancelRecording?: () => void;
  backgroundColor?: string;
  pressAndHold?: boolean;
  recordingDuration?: string;
  icon?: string;
  iconComponent?: React.ReactNode;
  iconSize?: number;
  showLabel?: boolean;
  minHeight?: number;
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
  
  // Track touch position for swipe detection
  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);
  const wasCancelledRef = useRef<boolean>(false);
  const swipeThreshold = 60; // pixels to swipe up to trigger delete

  useEffect(() => {
    if (isRecording) {
      wasCancelledRef.current = false;
      
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
      
      // Show delete icon immediately when recording starts
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
    } else {
      pulseAnim.setValue(1);
      setShowDeleteIcon(false);
      deleteIconOpacity.setValue(0);
      deleteIconScale.setValue(0.5);
      deleteIconRotation.setValue(0);
      wasCancelledRef.current = false;
    }
  }, [isRecording]);

  // Rotation interpolation for swinging effect
  const rotateInterpolation = deleteIconRotation.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-15deg', '0deg', '15deg'],
  });

  // Handle touch start - record starting position
  const handleTouchStart = useCallback((event: any) => {
    const touch = event.nativeEvent;
    startYRef.current = touch.pageY;
    currentYRef.current = touch.pageY;
    wasCancelledRef.current = false;
    console.log("[RecordingButton] Touch start at Y:", startYRef.current);
    
    if (onPressIn) {
      onPressIn();
    }
  }, [onPressIn]);

  // Handle touch move - track swipe
  const handleTouchMove = useCallback((event: any) => {
    if (!isRecording) return;
    
    const touch = event.nativeEvent;
    currentYRef.current = touch.pageY;
    const swipeDistance = startYRef.current - currentYRef.current; // positive = swipe up
    
    // Check if swiped up enough to cancel
    if (swipeDistance > swipeThreshold && !wasCancelledRef.current) {
      console.log("[RecordingButton] SWIPE UP detected! Distance:", swipeDistance);
      wasCancelledRef.current = true;
      
      if (onCancelRecording) {
        console.log("[RecordingButton] Calling onCancelRecording");
        onCancelRecording();
      }
    }
  }, [isRecording, onCancelRecording]);

  // Handle touch end - send or cancel based on swipe
  const handleTouchEnd = useCallback(() => {
    console.log("[RecordingButton] Touch end. wasCancelled:", wasCancelledRef.current);
    
    if (wasCancelledRef.current) {
      console.log("[RecordingButton] Recording was cancelled, not sending");
      return;
    }
    
    // Calculate final swipe distance
    const swipeDistance = startYRef.current - currentYRef.current;
    console.log("[RecordingButton] Final swipe distance:", swipeDistance);
    
    if (swipeDistance > swipeThreshold) {
      console.log("[RecordingButton] Swipe detected on release, cancelling");
      if (onCancelRecording) {
        onCancelRecording();
      }
    } else {
      console.log("[RecordingButton] No swipe, sending message");
      if (onPressOut) {
        onPressOut();
      }
    }
  }, [onPressOut, onCancelRecording]);

  if (pressAndHold) {
    return (
      <Animated.View style={{ transform: [{ scale: pulseAnim }], width: '100%' }}>
        {/* Delete Icon - appears above the button (for swipe up) */}
        {showDeleteIcon && (
          <Animated.View 
            style={{ 
              position: 'absolute',
              top: -70,
              left: 0,
              right: 0,
              alignItems: 'center',
              opacity: deleteIconOpacity,
              transform: [
                { scale: deleteIconScale },
                { rotate: rotateInterpolation },
              ],
              zIndex: 10,
            }}
          >
            <View 
              style={{
                backgroundColor: 'rgba(255,0,0,0.8)',
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
                color: '#FF6666', 
                fontSize: 10, 
                marginTop: 4,
                fontWeight: '700',
              }}
            >
              اسحب للأعلى للحذف
            </Text>
          </Animated.View>
        )}
        <View
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            backgroundColor: isRecording ? colors.error : backgroundColor || colors.primary,
            opacity: isPreparing ? 0.6 : 1,
            borderRadius: 8,
            paddingVertical: 8,
            paddingHorizontal: 4,
            alignItems: "center",
            justifyContent: "center",
            minHeight,
          }}
        >
          {(icon || iconComponent) ? (
            <View style={{ alignItems: 'center', gap: 2 }}>
              {iconComponent ? iconComponent : <Text style={{ fontSize: iconSize, color: '#FFD700' }}>{icon}</Text>}
              {showLabel && minHeight < 50 && (
                <View style={{ alignItems: 'center' }}>
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
        </View>
      </Animated.View>
    );
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
