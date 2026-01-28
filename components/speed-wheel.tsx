import React, { useRef, useCallback } from "react";
import { View, Text, StyleSheet, Animated, PanResponder } from "react-native";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Speed values from 0 to 1.50 with 0.05 step
 * 0 = No clapping sound
 * 0.05 - 1.50 = Delay between claps in seconds
 */
const SPEED_VALUES: number[] = [];
for (let i = 0; i <= 150; i += 5) {
  SPEED_VALUES.push(i / 100);
}
// SPEED_VALUES = [0, 0.05, 0.10, 0.15, ..., 1.45, 1.50] (31 values)

const ITEM_HEIGHT = 28;
const VISIBLE_ITEMS = 3;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

interface SpeedWheelProps {
  value: number;
  onChange: (value: number) => void;
}

export function SpeedWheel({ value, onChange }: SpeedWheelProps) {
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
  
  return (
    <View style={styles.container}>
      <View style={styles.wheelContainer} {...panResponder.panHandlers}>
        {/* Highlight for selected item */}
        <View style={styles.selectedHighlight} />
        
        {/* Scrollable items */}
        <Animated.View
          style={[
            styles.itemsContainer,
            {
              transform: [
                { translateY: scrollY },
                { translateY: ITEM_HEIGHT }, // Offset to center
              ],
            },
          ]}
        >
          {SPEED_VALUES.map((val, index) => {
            const isSelected = index === indexRef.current;
            return (
              <View key={index} style={styles.item}>
                <Text
                  style={[
                    styles.itemText,
                    isSelected && styles.selectedText,
                  ]}
                >
                  {formatValue(val)}
                </Text>
              </View>
            );
          })}
        </Animated.View>
        
        {/* Fade overlays */}
        <View style={[styles.fadeOverlay, styles.fadeTop]} pointerEvents="none" />
        <View style={[styles.fadeOverlay, styles.fadeBottom]} pointerEvents="none" />
      </View>
      
      {/* Label */}
      <Text style={styles.label}>التأخير</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  wheelContainer: {
    height: WHEEL_HEIGHT,
    width: 50,
    overflow: "hidden",
    backgroundColor: "#5D4037",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#8B7355",
  },
  selectedHighlight: {
    position: "absolute",
    top: ITEM_HEIGHT,
    left: 2,
    right: 2,
    height: ITEM_HEIGHT,
    backgroundColor: "#FFD700",
    borderRadius: 4,
  },
  itemsContainer: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  itemText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFD700",
  },
  selectedText: {
    color: "#5D4037",
    fontWeight: "900",
    fontSize: 14,
  },
  fadeOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
  },
  fadeTop: {
    top: 0,
    backgroundColor: "rgba(93, 64, 55, 0.7)",
  },
  fadeBottom: {
    bottom: 0,
    backgroundColor: "rgba(93, 64, 55, 0.7)",
  },
  label: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "900",
    color: "#9BA1A6",
    textAlign: "center",
  },
});
