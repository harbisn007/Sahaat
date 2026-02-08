import { useAudioPlayer, AudioModule } from "expo-audio";
import { Platform } from "react-native";

const notificationBellSound = require("@/assets/sounds/notif3.mp3");

/**
 * Hook لتشغيل صوت الجرس عند طلب انضمام جديد
 * يعمل على الويب و Android و iOS
 */
export function useNotificationBell() {
  const player = useAudioPlayer(notificationBellSound);

  const playBell = async () => {
    try {
      if (Platform.OS !== "web") {
        // على الجوال (Android/iOS)، ضبط وضع الصوت أولاً
        try {
          await AudioModule.setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: false,
          });
        } catch (e) {
          console.warn("[NotificationBell] Failed to set audio mode:", e);
        }
      }
      
      // إعادة الصوت للبداية قبل التشغيل (لتشغيله مرة أخرى إذا كان قد انتهى)
      try {
        player.seekTo(0);
      } catch (e) {
        // تجاهل - بعض المنصات لا تدعم seekTo
      }
      
      await player.play();
      console.log("[NotificationBell] Bell played successfully");
    } catch (error) {
      console.error("[NotificationBell] Error playing sound:", error);
    }
  };

  return { playBell };
}
