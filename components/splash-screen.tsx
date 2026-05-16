import { View, Image, Dimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import { useEffect } from "react";

const { width, height } = Dimensions.get("window");

function Dot({ delay }: { delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    setTimeout(() => {
      progress.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
    }, delay);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: progress.value * -12 }],
    opacity: 0.4 + progress.value * 0.6,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: "#C8860A",
          marginHorizontal: 5,
        },
        animatedStyle,
      ]}
    />
  );
}

export function SplashScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Image
        source={require("@/assets/images/Start.jpg")}
        style={{ position: "absolute", width, height }}
        resizeMode="contain"
      />
      <View
        style={{
          position: "absolute",
          bottom: height * 0.1,
          width: "100%",
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Dot key={i} delay={i * 120} />
        ))}
      </View>
    </View>
  );
}
