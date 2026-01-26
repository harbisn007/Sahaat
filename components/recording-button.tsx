import { useEffect, useRef, useState, useCallback } from "react";
import { useColors } from "@/hooks/use-colors";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Animated, View, Text } from "react-native";

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
  const currentSwipeDistanceRef = useRef(0);
  const hasStartedGestureRef = useRef(false);
  const shouldDeleteRef = useRef(false);

  // Callbacks for runOnJS
  const updateTranslateY = useCallback((value: number) => {
    currentSwipeDistanceRef.current = value;
    translateY.setValue(value);
    deleteIconTranslateY.setValue(value);
  }, [translateY, deleteIconTranslateY]);

  const updateIsOverDeleteZone = useCallback((value: boolean) => {
    setIsOverDeleteZone(value);
    shouldDeleteRef.current = value;
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
    currentSwipeDistanceRef.current = 0;
    hasStartedGestureRef.current = false;
    shouldDeleteRef.current = false;
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
      currentSwipeDistanceRef.current = 0;
      hasStartedGestureRef.current = false;
      shouldDeleteRef.current = false;
      
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
      currentSwipeDistanceRef.current = 0;
      hasStartedGestureRef.current = false;
      shouldDeleteRef.current = false;
    }
  }, [isRecording]);
  
  // Pan gesture - WhatsApp style (swipe UP to delete)
  const panGesture = Gesture.Pan()
    .enabled(isRecording && pressAndHold)
    .onUpdate((event) => {
      // Upward movement (negative translationY)
      if (event.translationY < 0) {
        // First time moving - show delete icon
        if (!hasStartedGestureRef.current) {
          hasStartedGestureRef.current = true;
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
        
        runOnJS(updateTranslateY)(event.translationY);
        
        // Check if over delete zone
        // Delete icon is at position deleteZoneY
        // If finger is at deleteZoneY ± deleteZoneSize/2, it's over the zone
        const fingerY = Math.abs(event.translationY);
        const deleteIconY = Math.abs(deleteZoneY);
        const isOver = fingerY >= deleteIconY - deleteZoneSize && 
                       fingerY <= deleteIconY + deleteZoneSize;
        runOnJS(updateIsOverDeleteZone)(isOver);
      }
    })
    .onEnd((event) => {
      console.log("[RecordingButton] Gesture ended. translationY:", event.translationY, "shouldDelete:", shouldDeleteRef.current);
      
      // If over delete zone when releasing, delete
      if (shouldDeleteRef.current) {
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
              zIndex: 1000,
            }}
          >
            <View
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: isOverDeleteZone ? '#FF4444' : '#FF6666',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialIcons name="delete-outline" size={28} color="white" />
            </View>
          </Animated.View>
        )}

        {/* Recording Button */}
        <View
          style={{
            backgroundColor: backgroundColor || colors.primary,
            borderRadius: 8,
            minHeight,
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            paddingHorizontal: 8,
            paddingVertical: 8,
          }}
        >
          {iconComponent || (
            <MaterialIcons name={(icon as any) || 'mic'} size={iconSize} color="#FFD700" />
          )}
          {showLabel && label && (
            <Text style={{ color: '#FFD700', marginTop: 4, fontSize: 12, fontWeight: '600' }}>
              {label}
            </Text>
          )}
          {recordingDuration && (
            <Text style={{ color: '#FFD700', marginTop: 2, fontSize: 10 }}>
              {recordingDuration}
            </Text>
          )}
        </View>
      </Animated.View>
    );

    return (
      <GestureDetector gesture={panGesture}>
        {buttonContent}
      </GestureDetector>
    );
  }

  // Simple press button (not press and hold)
  return (
    <View
      style={{
        backgroundColor: backgroundColor || colors.primary,
        borderRadius: 8,
        minHeight,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingHorizontal: 8,
        paddingVertical: 8,
      }}
    >
      {iconComponent || (
        <MaterialIcons name={(icon as any) || 'mic'} size={iconSize} color="#FFD700" />
      )}
      {showLabel && label && (
        <Text style={{ color: '#FFD700', marginTop: 4, fontSize: 12, fontWeight: '600' }}>
          {label}
        </Text>
      )}
    </View>
  );
}
