import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";

interface RecordingIndicatorProps {
  isVisible: boolean;
  recordingType: "comment" | "tarouk";
}

/**
 * Animated recording indicator that shows "طاروق..." with animated dots
 * The dots appear one by one and then disappear, creating a pulsing effect
 * Positioned directly above the user's avatar
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
    top: -28, // Closer to the image
    left: "50%",
    transform: [{ translateX: -28 }], // Centered (half of minWidth)
    alignItems: "center",
    zIndex: 100,
  },
  bubble: {
    backgroundColor: "#DC2626", // Red color
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 56,
    alignItems: "center",
  },
  text: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
  },
  dots: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
    minWidth: 16,
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#DC2626",
    marginTop: -1,
  },
});
