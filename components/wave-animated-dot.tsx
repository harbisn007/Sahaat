import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Extrapolate,
} from "react-native-reanimated";
import { useEffect, useRef } from "react";

export function WaveAnimatedDot({ delay }: { delay: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const animation = withRepeat(
      withTiming(progress, {
        duration: 2500,
        toValue: 1,
      }),
      1,
      false
    );
    progress.animate(animation);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      progress.value,
      [0, 0.25, 0.5, 0.75, 1],
      [0, -25, 0, -15, 0],
      Extrapolate.CLAMP
    );

    const opacity = interpolate(
      progress.value,
      [0, 0.2, 0.5, 0.8, 1],
      [0.4, 1, 1, 1, 0.4],
      Extrapolate.CLAMP
    );

    const scale = interpolate(
      progress.value,
      [0, 0.25, 0.5, 0.75, 1],
      [0.8, 1.2, 1, 1.1, 0.8],
      Extrapolate.CLAMP
    );

    return {
      transform: [
        { translateY },
        { scale },
        { translateX: delay * 2 },
      ],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        {
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: "#D4AF37",
          marginHorizontal: 4,
        },
        animatedStyle,
      ]}
    />
  );
}
