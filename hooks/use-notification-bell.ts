import { useAudioPlayer } from "expo-audio";
import { Platform } from "react-native";

const notificationBellSound = require("@/assets/sounds/notif3.mp3");

/**
 * Hook لتشغيل صوت الجرس عند طلب انضمام جديد
 * يعمل على الويب والجوال
 */
export function useNotificationBell() {
  const player = useAudioPlayer(notificationBellSound);

  const playBell = async () => {
    try {
      // تشغيل الصوت
      if (Platform.OS !== "web") {
        // على الجوال، تأكد من أن الصوت يعمل حتى في الوضع الصامت
        await player.play();
      } else {
        // على الويب
        await player.play();
      }
    } catch (error) {
      console.error("[NotificationBell] Error playing sound:", error);
    }
  };

  return { playBell };
}
