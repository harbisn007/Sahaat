import { Text, View, Animated, Platform } from "react-native";
import { useEffect, useRef, useCallback } from "react";
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
  buttonId?: string; // Unique identifier for this button
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
  
  // Track touch position for swipe detection using refs
  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);
  const wasCancelledRef = useRef<boolean>(false);
  const isActiveRef = useRef<boolean>(false); // Track if THIS button started the recording
  const touchStartTimeRef = useRef<number>(0); // Track when touch started
  const swipeThreshold = 60; // pixels to swipe up to trigger delete
  const minRecordingDuration = 500; // Minimum 500ms before allowing send

  // Reset state when recording stops
  useEffect(() => {
    if (!isRecording) {
      isActiveRef.current = false;
      wasCancelledRef.current = false;
      deleteIconOpacity.setValue(0);
      deleteIconScale.setValue(0.5);
      deleteIconRotation.setValue(0);
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Pulse animation while recording
  useEffect(() => {
    if (isRecording && isActiveRef.current) {
      // Pulse animation
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
      
      // Show delete icon
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
      
      // Swing animation for delete icon
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
  }, [isRecording]);

  // Rotation interpolation for swinging effect
  const rotateInterpolation = deleteIconRotation.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-15deg', '0deg', '15deg'],
  });

  // Handle touch start - record starting position
  const handleTouchStart = useCallback((event: any) => {
    // Don't start if already recording (another button is active)
    if (isRecording || isPreparing) {
      console.log(`[RecordingButton:${buttonId}] Ignoring touch - already recording`);
      return;
    }

    const touch = event.nativeEvent;
    startYRef.current = touch.pageY;
    currentYRef.current = touch.pageY;
    wasCancelledRef.current = false;
    isActiveRef.current = true; // Mark THIS button as active
    touchStartTimeRef.current = Date.now(); // Record start time
    
    console.log(`[RecordingButton:${buttonId}] Touch start at Y:`, startYRef.current);
    
    if (onPressIn) {
      onPressIn();
    }
  }, [isRecording, isPreparing, onPressIn, buttonId]);

  // Handle touch move - track swipe
  const handleTouchMove = useCallback((event: any) => {
    // Only process if THIS button started the recording
    if (!isActiveRef.current || !isRecording) return;
    
    const touch = event.nativeEvent;
    currentYRef.current = touch.pageY;
    const swipeDistance = startYRef.current - currentYRef.current; // positive = swipe up
    
    // Check if swiped up enough to cancel
    if (swipeDistance > swipeThreshold && !wasCancelledRef.current) {
      console.log(`[RecordingButton:${buttonId}] SWIPE UP detected! Distance:`, swipeDistance);
      wasCancelledRef.current = true;
      
      if (onCancelRecording) {
        console.log(`[RecordingButton:${buttonId}] Calling onCancelRecording`);
        onCancelRecording();
      }
    }
  }, [isRecording, onCancelRecording, buttonId]);

  // Handle touch end - send or cancel based on swipe
  const handleTouchEnd = useCallback(() => {
    // Only process if THIS button started the recording
    if (!isActiveRef.current) {
      console.log(`[RecordingButton:${buttonId}] Touch end ignored - not active button`);
      return;
    }

    const touchDuration = Date.now() - touchStartTimeRef.current;
    console.log(`[RecordingButton:${buttonId}] Touch end. wasCancelled:`, wasCancelledRef.current, "duration:", touchDuration);
    
    // If touch was too short (quick tap), cancel the recording
    if (touchDuration < minRecordingDuration) {
      console.log(`[RecordingButton:${buttonId}] Touch too short (${touchDuration}ms < ${minRecordingDuration}ms), cancelling`);
      if (onCancelRecording) {
        onCancelRecording();
      }
      isActiveRef.current = false;
      return;
    }
    
    if (wasCancelledRef.current) {
      console.log(`[RecordingButton:${buttonId}] Recording was cancelled, not sending`);
      isActiveRef.current = false;
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
    
    isActiveRef.current = false;
  }, [onPressOut, onCancelRecording, buttonId]);

  // Handle touch cancel (finger moved outside)
  const handleTouchCancel = useCallback(() => {
    if (!isActiveRef.current) return;
    
    console.log(`[RecordingButton:${buttonId}] Touch cancelled`);
    if (isRecording && onCancelRecording) {
      onCancelRecording();
    }
    isActiveRef.current = false;
  }, [isRecording, onCancelRecording, buttonId]);

  if (pressAndHold) {
    const showDeleteUI = isRecording && isActiveRef.current;
    
    return (
      <Animated.View style={{ transform: [{ scale: showDeleteUI ? pulseAnim : 1 }], width: '100%' }}>
        {/* Delete Icon - appears above the button (for swipe up) */}
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
            backgroundColor: (isRecording && isActiveRef.current) ? colors.error : backgroundColor || colors.primary,
            opacity: isPreparing ? 0.6 : 1,
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
                  ) : (isRecording && isActiveRef.current) ? (
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
              {!showLabel && (isRecording && isActiveRef.current) && (
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
                : (isRecording && isActiveRef.current)
                  ? recordingDuration || "00:00" 
                  : label}
            </Text>
          )}
        </View>
      </Animated.View>
    );
  }

  // Non-press-and-hold version (not used currently)
  return (
    <View
      style={{
        backgroundColor: backgroundColor || colors.primary,
        opacity: isPreparing ? 0.6 : 1,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: "center",
      }}
    >
      <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 }}>
        {isPreparing ? "جاري التحضير..." : isRecording ? "⏹ إيقاف التسجيل" : label}
      </Text>
    </View>
  );
}
