import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from "react-native-reanimated";

interface RecordingIndicatorProps {
  isVisible: boolean;
  recordingType: "comment" | "tarouk";
}

/**
 * Animated recording indicator that shows "طاروق..." with animated dots
 * The dots appear one by one and then disappear, creating a pulsing effect
 */
export function RecordingIndicator({ isVisible, recordingType }: RecordingIndicatorProps) {
  const [dotCount, setDotCount] = useState(0);

  // Animate dots: 0 -> 1 -> 2 -> 3 -> 0 -> ...
  useEffect(() => {
    if (!isVisible) {
      setDotCount(0);
      return;
    }

    const interval = setInterval(() => {
      setDotCount((prev) => (prev + 1) % 4);
    }, 400); // Change every 400ms

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  const label = recordingType === "tarouk" ? "طاروق" : "تعليق";
  const dots = ".".repeat(dotCount);

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={styles.text}>
          {label}
          <Text style={styles.dots}>{dots}</Text>
        </Text>
      </View>
      {/* Arrow pointing down */}
      <View style={styles.arrow} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: -45,
    left: "50%",
    transform: [{ translateX: -40 }],
    alignItems: "center",
    zIndex: 100,
  },
  bubble: {
    backgroundColor: "#DC2626", // Red color
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 80,
    alignItems: "center",
  },
  text: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
  },
  dots: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    minWidth: 24,
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#DC2626",
    marginTop: -1,
  },
});
