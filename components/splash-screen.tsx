import { View, Image } from "react-native";
import { WaveAnimatedDot } from "./wave-animated-dot";

export function SplashScreen() {
  return (
    <View className="flex-1 bg-black justify-center items-center">
      {/* الصورة الخلفية */}
      <Image
        source={require("@/assets/images/splash-image.jpg")}
        className="absolute inset-0"
        resizeMode="cover"
      />

      {/* النقاط النحاسية المتحركة في الأسفل */}
      <View className="absolute bottom-24 flex-row justify-center items-center">
        {[0, 1, 2, 3, 4, 5, 6].map((index) => (
          <WaveAnimatedDot key={index} delay={index * 100} />
        ))}
      </View>
    </View>
  );
}
