import { Pressable, Text, View, Animated, Platform } from "react-native";
import { useEffect, useRef, useState, useCallback } from "react";
import { useColors } from "@/hooks/use-colors";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
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
  const deleteIconTranslateY = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const [isOverDeleteZone, setIsOverDeleteZone] = useState(false);
  const deleteZoneY = -100; // Position of delete icon (above button)
  const deleteZoneSize = 60; // Size of delete zone
  let currentSwipeDistance = 0;
  let hasStartedGesture = false;

  // Callbacks for runOnJS
  const updateTranslateY = useCallback((value: number) => {
    currentSwipeDistance = value;
    translateY.setValue(value);
    deleteIconTranslateY.setValue(value);
  }, [translateY, deleteIconTranslateY]);

  const updateIsOverDeleteZone = useCallback((value: boolean) => {
    setIsOverDeleteZone(value);
  }, []);

  const handleDelete = useCallback(() => {
    console.log("[RecordingButton] DELETE triggered");
    if (onCancelRecording) {
      onCancelRecording();
    }
  }, [onCancelRecording]);

  const handleSend = useCallback(() => {
    console.log("[RecordingButton] SEND triggered");
    if (onPressOut) {
      onPressOut();
    }
  }, [onPressOut]);

  const resetPosition = useCallback(() => {
    currentSwipeDistance = 0;
    hasStartedGesture = false;
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
    Animated.spring(deleteIconTranslateY, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
    setIsOverDeleteZone(false);
  }, [translateY, deleteIconTranslateY]);

  const hideDeleteIcon = useCallback(() => {
    Animated.parallel([
      Animated.timing(deleteIconOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(deleteIconScale, {
        toValue: 0.5,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowDeleteIcon(false);
    });
  }, []);

  useEffect(() => {
    if (isRecording) {
      currentSwipeDistance = 0;
      hasStartedGesture = false;
      
      // Delete icon is hidden initially
      setShowDeleteIcon(false);
      deleteIconOpacity.setValue(0);
      deleteIconScale.setValue(0.5);
      deleteIconRotation.setValue(0);
      translateY.setValue(0);
      deleteIconTranslateY.setValue(0);
      
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
      
      // Start swinging animation for delete icon
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
      translateY.setValue(0);
      deleteIconTranslateY.setValue(0);
      setIsOverDeleteZone(false);
      currentSwipeDistance = 0;
      hasStartedGesture = false;
    }
  }, [isRecording]);
  
  // Pan gesture - WhatsApp style (swipe UP to delete)
  const panGesture = Gesture.Pan()
    .enabled(isRecording && pressAndHold)
    .onUpdate((event) => {
      // Upward movement (negative translationY)
      if (event.translationY < 0) {
        // First time moving - show delete icon
        if (!hasStartedGesture) {
          hasStartedGesture = true;
          setShowDeleteIcon(true);
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
        }
        
        updateTranslateY(event.translationY);
        
        // Check if over delete zone
        // Delete icon is at position deleteZoneY
        // If finger is at deleteZoneY ± deleteZoneSize/2, it's over the zone
        const fingerY = Math.abs(event.translationY);
        const deleteIconY = Math.abs(deleteZoneY);
        const isOver = fingerY >= deleteIconY - deleteZoneSize && 
                       fingerY <= deleteIconY + deleteZoneSize;
        updateIsOverDeleteZone(isOver);
      }
    })
    .onEnd((event) => {
      console.log("[RecordingButton] Gesture ended. translationY:", event.translationY, "isOver:", isOverDeleteZone);
      
      // If over delete zone when releasing, delete
      if (isOverDeleteZone) {
        console.log("[RecordingButton] OVER DELETE ZONE - DELETE");
        runOnJS(handleDelete)();
      } else {
        console.log("[RecordingButton] NOT OVER DELETE ZONE - SEND");
        runOnJS(handleSend)();
      }
      
      // Hide delete icon and reset
      runOnJS(hideDeleteIcon)();
      runOnJS(resetPosition)();
    });

  // Rotation interpolation for swinging effect
  const rotateInterpolation = deleteIconRotation.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-15deg', '0deg', '15deg'],
  });

  if (pressAndHold) {
    const buttonContent = (
      <Animated.View style={{ transform: [{ scale: pulseAnim }, { translateY }], width: '100%' }}>
        {/* Delete Icon - appears when finger moves up, follows finger */}
        {showDeleteIcon && (
          <Animated.View 
            style={{ 
              position: 'absolute',
              top: deleteZoneY,
              left: 0,
              right: 0,
              alignItems: 'center',
              opacity: deleteIconOpacity,
              transform: [
                { translateY: deleteIconTranslateY },
                { scale: deleteIconScale },
                { rotate: rotateInterpolation },
              ],
              zIndex: 10,
            }}
          >
            <View 
              style={{
                backgroundColor: isOverDeleteZone ? '#FF0000' : 'rgba(255,0,0,0.6)',
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
                name="close" 
                size={28} 
                color="#FFFFFF" 
              />
            </View>
            <Text 
              style={{ 
                color: isOverDeleteZone ? '#FF0000' : '#999999', 
                fontSize: 11, 
                marginTop: 6,
                fontWeight: '600',
              }}
            >
              اسحب للحذف
            </Text>
          </Animated.View>
        )}
        <Pressable
          onPressIn={onPressIn}
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
