import React, { useRef, useCallback } from "react";
import { View, Text, Animated, PanResponder } from "react-native";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Speed values: 0 (no clapping), then 0.65 to 1.50 with 0.05 step
 * 0 = No clapping sound
 * 0.65 - 1.50 = Delay between claps in seconds
 */
const SPEED_VALUES: number[] = [0]; // Start with 0 (no clapping)
for (let i = 65; i <= 150; i += 5) {
  SPEED_VALUES.push(i / 100);
}
// SPEED_VALUES = [0, 0.65, 0.70, 0.75, ..., 1.45, 1.50] (19 values)

const ITEM_HEIGHT = 16;
const VISIBLE_ITEMS = 3;
const WHEEL_HEIGHT = 48; // Same height as buttons (minHeight: 48)

interface SpeedWheelProps {
  value: number;
  onChange: (value: number) => void;
  width?: number; // Optional width for responsive sizing
}

export function SpeedWheel({ value, onChange, width = 50 }: SpeedWheelProps) {
  // Find current index
  const currentIndex = SPEED_VALUES.findIndex(v => Math.abs(v - value) < 0.001);
  const indexRef = useRef(currentIndex >= 0 ? currentIndex : 0);
  
  // Animated value for smooth scrolling
  const scrollY = useRef(new Animated.Value(-indexRef.current * ITEM_HEIGHT)).current;
  const lastOffsetY = useRef(-indexRef.current * ITEM_HEIGHT);
  
  // Haptic feedback
  const triggerHaptic = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);
  
  // Snap to nearest value
  const snapToIndex = useCallback((targetIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(SPEED_VALUES.length - 1, targetIndex));
    const targetY = -clampedIndex * ITEM_HEIGHT;
    
    Animated.spring(scrollY, {
      toValue: targetY,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start();
    
    lastOffsetY.current = targetY;
    indexRef.current = clampedIndex;
    
    if (clampedIndex !== currentIndex) {
      triggerHaptic();
      onChange(SPEED_VALUES[clampedIndex]);
    }
  }, [scrollY, onChange, currentIndex, triggerHaptic]);
  
  // Pan responder for drag gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        scrollY.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        const newY = lastOffsetY.current + gestureState.dy;
        scrollY.setValue(newY);
      },
      onPanResponderRelease: (_, gestureState) => {
        const newY = lastOffsetY.current + gestureState.dy;
        const targetIndex = Math.round(-newY / ITEM_HEIGHT);
        snapToIndex(targetIndex);
      },
    })
  ).current;
  
  // Format value for display
  const formatValue = (val: number): string => {
    if (val === 0) return "٠";
    return val.toFixed(2).replace(".", "٫");
  };
  
  // Responsive font sizes
  const isSmall = width < 45;
  const normalFontSize = isSmall ? 10 : 12;
  const selectedFontSize = isSmall ? 12 : 14;
  const labelFontSize = isSmall ? 7 : 9;
  
  return (
    <View style={{ alignItems: "center" }}>
      <View 
        style={{
          height: WHEEL_HEIGHT,
          width: width,
          overflow: "hidden",
          backgroundColor: "#5D4037",
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "#8B7355",
        }} 
        {...panResponder.panHandlers}
      >
        {/* Highlight for selected item */}
        <View 
          style={{
            position: "absolute",
            top: ITEM_HEIGHT,
            left: 2,
            right: 2,
            height: ITEM_HEIGHT,
            backgroundColor: "#FFD700",
            borderRadius: 4,
          }} 
        />
        
        {/* Scrollable items */}
        <Animated.View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            transform: [
              { translateY: scrollY },
              { translateY: ITEM_HEIGHT }, // Offset to center
            ],
          }}
        >
          {SPEED_VALUES.map((val, index) => {
            const isSelected = index === indexRef.current;
            return (
              <View 
                key={index} 
                style={{
                  height: ITEM_HEIGHT,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: isSelected ? selectedFontSize : normalFontSize,
                    fontWeight: isSelected ? "900" : "700",
                    color: isSelected ? "#5D4037" : "#FFD700",
                  }}
                >
                  {formatValue(val)}
                </Text>
              </View>
            );
          })}
        </Animated.View>
        
        {/* Fade overlays */}
        <View 
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: ITEM_HEIGHT,
            top: 0,
            backgroundColor: "rgba(93, 64, 55, 0.7)",
          }} 
          pointerEvents="none" 
        />
        <View 
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: ITEM_HEIGHT,
            bottom: 0,
            backgroundColor: "rgba(93, 64, 55, 0.7)",
          }} 
          pointerEvents="none" 
        />
      </View>
      
      {/* Label */}
      <Text 
        style={{
          marginTop: 4,
          fontSize: labelFontSize,
          fontWeight: "900",
          color: "#9BA1A6",
          textAlign: "center",
        }}
      >
        الصفقة (الإيقاع)
      </Text>
    </View>
  );
}
