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
  recordingDuration,
  iconComponent,
  showLabel = true,
  minHeight = 48,
  buttonId = "default",
}: RecordingButtonProps) {
  const colors = useColors();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const deleteIconOpacity = useRef(new Animated.Value(0)).current;
  const deleteIconScale = useRef(new Animated.Value(0.5)).current;
  const deleteIconRotation = useRef(new Animated.Value(0)).current;
  
  // Use state for UI updates (causes re-render)
  const [isButtonActive, setIsButtonActive] = useState(false);
  
  // Track touch position for swipe detection using refs
  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);
  const wasCancelledRef = useRef<boolean>(false);
  const touchStartTimeRef = useRef<number>(0);
  const recordingStartedRef = useRef<boolean>(false);
  const swipeThreshold = 60;
  const minRecordingDuration = 500;

  // Reset state when recording stops
  useEffect(() => {
    if (!isRecording && !isPreparing) {
      setIsButtonActive(false);
      wasCancelledRef.current = false;
      recordingStartedRef.current = false;
      deleteIconOpacity.setValue(0);
      deleteIconScale.setValue(0.5);
      deleteIconRotation.setValue(0);
      pulseAnim.setValue(1);
    }
  }, [isRecording, isPreparing]);

  // Track when recording actually starts
  useEffect(() => {
    if (isRecording && isButtonActive) {
      recordingStartedRef.current = true;
    }
  }, [isRecording, isButtonActive]);

  // Pulse animation while recording
  useEffect(() => {
    if (isRecording && isButtonActive) {
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
  }, [isRecording, isButtonActive]);

  const rotateInterpolation = deleteIconRotation.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-15deg', '0deg', '15deg'],
  });

  // Handle touch start
  const handleTouchStart = useCallback((event: any) => {
    // Don't start if already recording or preparing
    if (isRecording || isPreparing || isButtonActive) {
      console.log(`[RecordingButton:${buttonId}] Ignoring touch - busy state`);
      return;
    }

    const touch = event.nativeEvent;
    startYRef.current = touch.pageY;
    currentYRef.current = touch.pageY;
    wasCancelledRef.current = false;
    recordingStartedRef.current = false;
    touchStartTimeRef.current = Date.now();
    
    // Set active state (triggers re-render)
    setIsButtonActive(true);
    
    console.log(`[RecordingButton:${buttonId}] Touch start at Y:`, startYRef.current);
    
    if (onPressIn) {
      onPressIn();
    }
  }, [isRecording, isPreparing, isButtonActive, onPressIn, buttonId]);

  // Handle touch move
  const handleTouchMove = useCallback((event: any) => {
    if (!isButtonActive) return;
    
    const touch = event.nativeEvent;
    currentYRef.current = touch.pageY;
    const swipeDistance = startYRef.current - currentYRef.current;
    
    // Check if swiped up enough to cancel (only if recording actually started)
    if (swipeDistance > swipeThreshold && !wasCancelledRef.current && recordingStartedRef.current) {
      console.log(`[RecordingButton:${buttonId}] SWIPE UP detected! Distance:`, swipeDistance);
      wasCancelledRef.current = true;
      
      if (onCancelRecording) {
        console.log(`[RecordingButton:${buttonId}] Calling onCancelRecording`);
        onCancelRecording();
      }
      setIsButtonActive(false);
    }
  }, [isButtonActive, onCancelRecording, buttonId]);

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    if (!isButtonActive) {
      console.log(`[RecordingButton:${buttonId}] Touch end ignored - not active`);
      return;
    }

    const touchDuration = Date.now() - touchStartTimeRef.current;
    console.log(`[RecordingButton:${buttonId}] Touch end. duration:`, touchDuration, "recordingStarted:", recordingStartedRef.current);
    
    // If recording never actually started (still preparing), just cancel
    if (!recordingStartedRef.current) {
      console.log(`[RecordingButton:${buttonId}] Recording never started, cancelling silently`);
      if (onCancelRecording) {
        onCancelRecording();
      }
      setIsButtonActive(false);
      return;
    }
    
    // If touch was too short, cancel the recording
    if (touchDuration < minRecordingDuration) {
      console.log(`[RecordingButton:${buttonId}] Touch too short (${touchDuration}ms), cancelling`);
      if (onCancelRecording) {
        onCancelRecording();
      }
      setIsButtonActive(false);
      return;
    }
    
    if (wasCancelledRef.current) {
      console.log(`[RecordingButton:${buttonId}] Recording was cancelled by swipe`);
      setIsButtonActive(false);
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
    
    setIsButtonActive(false);
  }, [isButtonActive, onPressOut, onCancelRecording, buttonId]);

  // Handle touch cancel
  const handleTouchCancel = useCallback(() => {
    if (!isButtonActive) return;
    
    console.log(`[RecordingButton:${buttonId}] Touch cancelled`);
    
    if (onCancelRecording) {
      onCancelRecording();
    }
    setIsButtonActive(false);
  }, [isButtonActive, onCancelRecording, buttonId]);

  if (pressAndHold) {
    // Use state for UI visibility (triggers re-render)
    const showDeleteUI = isRecording && isButtonActive;
    const showPreparingUI = isPreparing && isButtonActive;
    const isActive = showDeleteUI || showPreparingUI;
    
    return (
      <Animated.View style={{ transform: [{ scale: showDeleteUI ? pulseAnim : 1 }], width: '100%' }}>
        {/* Delete Icon - appears above the button */}
        {showDeleteUI && (
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
          onTouchCancel={handleTouchCancel}
          style={{
            backgroundColor: isActive ? colors.error : backgroundColor || colors.primary,
            opacity: (isPreparing && !isButtonActive) ? 0.6 : 1,
            borderRadius: 8,
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
              {!showLabel && showDeleteUI && (
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
              {showPreparingUI 
                ? "جاري..." 
                : showDeleteUI
                  ? recordingDuration || "00:00" 
                  : label}
            </Text>
          )}
        </View>
      </Animated.View>
    );
  }

  // Non-press-and-hold version
  return (
    <View
      style={{
        backgroundColor: backgroundColor || colors.primary,
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 4,
        alignItems: "center",
        justifyContent: "center",
        minHeight,
      }}
    >
      <Text 
        style={{ 
          color: '#FFFFFF',
          fontSize: 10,
          fontWeight: '800',
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </View>
  );
}
