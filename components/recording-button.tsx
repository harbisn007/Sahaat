import { Text, View, Animated, Platform } from "react-native";
import { useEffect, useRef, useCallback, useState } from "react";
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
  buttonId?: string;
  width?: number;
  borderRadius?: number;
}

export function RecordingButton({
  isRecording,
  isPreparing,
  label,
  onPressIn,
  onPressOut,
  onCancelRecording,
  backgroundColor,
  pressAndHold = false,
  iconComponent,
  showLabel = true,
  minHeight = 48,
  buttonId = "default",
  width,
  borderRadius: customBorderRadius,
}: RecordingButtonProps) {
  const colors = useColors();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const deleteIconOpacity = useRef(new Animated.Value(0)).current;
  const deleteIconScale = useRef(new Animated.Value(0.5)).current;
  const deleteIconRotation = useRef(new Animated.Value(0)).current;
  
  // Use state for UI updates (causes re-render)
  const [isTouchActive, setIsTouchActive] = useState(false);
  
  // Track touch position for swipe detection using refs
  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);
  const wasCancelledRef = useRef<boolean>(false);
  const touchStartTimeRef = useRef<number>(0);
  const swipeThreshold = 60;
  const minRecordingDuration = 500;

  // Reset state when recording stops
  useEffect(() => {
    if (!isRecording && !isPreparing) {
      setIsTouchActive(false);
      wasCancelledRef.current = false;
      deleteIconOpacity.setValue(0);
      deleteIconScale.setValue(0.5);
      deleteIconRotation.setValue(0);
      pulseAnim.setValue(1);
    }
  }, [isRecording, isPreparing]);

  // Pulse animation and delete icon animation while recording
  useEffect(() => {
    if (isRecording && isTouchActive) {
      const pulseAnimation = Animated.loop(
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
      );
      pulseAnimation.start();
      
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
      
      const swingAnimation = Animated.loop(
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
      );
      swingAnimation.start();

      return () => {
        pulseAnimation.stop();
        swingAnimation.stop();
      };
    }
  }, [isRecording, isTouchActive]);

  const rotateInterpolation = deleteIconRotation.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-15deg', '0deg', '15deg'],
  });

  // Handle touch start
  const handleTouchStart = useCallback((event: any) => {
    // Don't start if already recording or preparing
    if (isRecording || isPreparing || isTouchActive) {
      console.log(`[RecordingButton:${buttonId}] Ignoring touch - busy state`);
      return;
    }

    const touch = event.nativeEvent;
    startYRef.current = touch.pageY;
    currentYRef.current = touch.pageY;
    wasCancelledRef.current = false;
    touchStartTimeRef.current = Date.now();
    
    // Set active state (triggers re-render)
    setIsTouchActive(true);
    
    console.log(`[RecordingButton:${buttonId}] Touch start at Y:`, startYRef.current);
    
    if (onPressIn) {
      onPressIn();
    }
  }, [isRecording, isPreparing, isTouchActive, onPressIn, buttonId]);

  // Handle touch move
  const handleTouchMove = useCallback((event: any) => {
    if (!isTouchActive) return;
    
    const touch = event.nativeEvent;
    currentYRef.current = touch.pageY;
    const swipeDistance = startYRef.current - currentYRef.current;
    
    // Check if swiped up enough to cancel (only if recording)
    if (swipeDistance > swipeThreshold && !wasCancelledRef.current && isRecording) {
      console.log(`[RecordingButton:${buttonId}] SWIPE UP detected! Distance:`, swipeDistance);
      wasCancelledRef.current = true;
      
      if (onCancelRecording) {
        console.log(`[RecordingButton:${buttonId}] Calling onCancelRecording`);
        onCancelRecording();
      }
      setIsTouchActive(false);
    }
  }, [isTouchActive, isRecording, onCancelRecording, buttonId]);

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    if (!isTouchActive) {
      console.log(`[RecordingButton:${buttonId}] Touch end ignored - not active`);
      return;
    }

    const touchDuration = Date.now() - touchStartTimeRef.current;
    console.log(`[RecordingButton:${buttonId}] Touch end. duration:`, touchDuration, "isRecording:", isRecording);
    
    // If recording never started (still preparing), just cancel
    if (!isRecording) {
      console.log(`[RecordingButton:${buttonId}] Recording never started, cancelling silently`);
      if (onCancelRecording) {
        onCancelRecording();
      }
      setIsTouchActive(false);
      return;
    }
    
    // If touch was too short, cancel the recording
    if (touchDuration < minRecordingDuration) {
      console.log(`[RecordingButton:${buttonId}] Touch too short (${touchDuration}ms), cancelling`);
      if (onCancelRecording) {
        onCancelRecording();
      }
      setIsTouchActive(false);
      return;
    }
    
    if (wasCancelledRef.current) {
      console.log(`[RecordingButton:${buttonId}] Recording was cancelled by swipe`);
      setIsTouchActive(false);
      return;
    }
    
    // Calculate final swipe distance
    const swipeDistance = startYRef.current - currentYRef.current;
    console.log(`[RecordingButton:${buttonId}] Final swipe distance:`, swipeDistance);
    
    if (swipeDistance > swipeThreshold) {
      console.log(`[RecordingButton:${buttonId}] Swipe detected on release, cancelling`);
      if (onCancelRecording) {
        onCancelRecording();
      }
    } else {
      console.log(`[RecordingButton:${buttonId}] No swipe, sending message`);
      if (onPressOut) {
        onPressOut();
      }
    }
    
    setIsTouchActive(false);
  }, [isTouchActive, isRecording, onPressOut, onCancelRecording, buttonId]);

  // Handle touch cancel
  const handleTouchCancel = useCallback(() => {
    if (!isTouchActive) return;
    
    console.log(`[RecordingButton:${buttonId}] Touch cancelled`);
    
    if (onCancelRecording) {
      onCancelRecording();
    }
    setIsTouchActive(false);
  }, [isTouchActive, onCancelRecording, buttonId]);

  if (pressAndHold) {
    // Determine UI states
    const showDeleteUI = isRecording && isTouchActive;
    const showPreparingUI = isPreparing && isTouchActive && !isRecording;
    const isActive = showDeleteUI || showPreparingUI;
    
    return (
      <Animated.View style={{ transform: [{ scale: showDeleteUI ? pulseAnim : 1 }], alignSelf: 'center' }}>
        {/* Delete Icon - appears above the button when recording */}
        {showDeleteUI && (
          <Animated.View 
            style={{ 
              position: 'absolute',
              top: -50,
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
                padding: 10,
                borderRadius: 25,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
                elevation: 5,
              }}
            >
              <MaterialIcons 
                name="delete" 
                size={24} 
                color="#FFFFFF" 
              />
            </View>
            <Text 
              style={{ 
                color: '#FF6666', 
                fontSize: 9, 
                marginTop: 2,
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
          onTouchCancel={handleTouchCancel}
          style={{
            backgroundColor: isActive ? colors.error : backgroundColor || colors.primary,
            opacity: isTouchActive ? 0.7 : ((isPreparing && !isTouchActive) ? 0.6 : 1),
            borderRadius: customBorderRadius ?? 14,
            borderWidth: backgroundColor === '#2d1f0e' ? 1 : 0,
            borderColor: '#c8860a',
            paddingVertical: 8,
            paddingHorizontal: 4,
            alignItems: "center",
            justifyContent: "center",
            minHeight,
            transform: [{ scale: isTouchActive ? 0.95 : 1 }],
            ...(width ? { width } : {}),
          }}
        >
          {iconComponent ? (
            <View style={{ alignItems: 'center', gap: 2 }}>
              {iconComponent}
              {showLabel && minHeight < 50 && (
                <View style={{ alignItems: 'center' }}>
                  {showPreparingUI ? (
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
                  ) : showDeleteUI ? (
                    <Text 
                      style={{ 
                        color: '#FFFFFF',
                        fontSize: 10,
                        fontWeight: '800',
                        textAlign: 'center',
                      }}
                    >
                      تسجيل...
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
              {showPreparingUI ? "جاري..." : showDeleteUI ? "تسجيل..." : label}
            </Text>
          )}
        </View>
      </Animated.View>
    );
  }

  // Simple button mode (non press-and-hold)
  return (
    <View
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        backgroundColor: backgroundColor || colors.primary,
        borderRadius: customBorderRadius ?? 8,
        paddingVertical: 8,
        paddingHorizontal: 4,
        alignItems: "center",
        justifyContent: "center",
        minHeight,
      }}
    >
      {iconComponent ? (
        <View style={{ alignItems: 'center', gap: 2 }}>
          {iconComponent}
          {showLabel && (
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
  );
}