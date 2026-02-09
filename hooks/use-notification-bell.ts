import { useCallback, useRef, useEffect } from "react";
import { Platform } from "react-native";

// على Native: نستخدم نفس النمط الذي يعمل بنجاح في use-sheeloha-player
// require() يُحمّل كـ asset module number وهو مدعوم من createAudioPlayer
const BELL_SOUND = Platform.OS !== "web" ? require("@/assets/sounds/notif3.mp3") : null;

/**
 * Hook لتشغيل صوت الجرس عند طلب انضمام جديد
 * 
 * على Native: يستخدم expo-audio createAudioPlayer (نفس النمط المستخدم في sheeloha)
 * على Web: يستخدم HTMLAudioElement
 */
export function useNotificationBell() {
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const nativePlayerRef = useRef<any>(null);
  const audioModeSetRef = useRef(false);

  // تهيئة مسبقة
  useEffect(() => {
    if (Platform.OS === "web") {
      // Web: تحميل مسبق
      try {
        const audio = new Audio("/sounds/notif3.mp3");
        audio.preload = "auto";
        audio.volume = 1.0;
        webAudioRef.current = audio;
        console.log("[NotificationBell] Web audio pre-loaded");
      } catch (e) {
        console.warn("[NotificationBell] Failed to pre-load web audio:", e);
      }
    } else {
      // Native: ضبط audio mode وإنشاء player مسبقاً
      const initNative = async () => {
        try {
          const { createAudioPlayer, AudioModule } = require("expo-audio");
          
          // ضبط audio mode
          if (!audioModeSetRef.current) {
            try {
              await AudioModule.setAudioModeAsync({
                playsInSilentMode: true,
                allowsRecording: false,
              });
              audioModeSetRef.current = true;
              console.log("[NotificationBell] Audio mode set for native");
            } catch (e) {
              console.warn("[NotificationBell] Audio mode error:", e);
            }
          }

          // إنشاء player مسبقاً (نفس النمط في sheeloha)
          if (BELL_SOUND) {
            const player = createAudioPlayer(BELL_SOUND);
            player.volume = 1.0;
            nativePlayerRef.current = player;
            console.log("[NotificationBell] Native player created with asset:", typeof BELL_SOUND, BELL_SOUND);
          }
        } catch (e) {
          console.error("[NotificationBell] Failed to init native audio:", e);
        }
      };
      initNative();
    }

    return () => {
      if (Platform.OS === "web") {
        if (webAudioRef.current) {
          webAudioRef.current.pause();
          webAudioRef.current = null;
        }
      } else {
        if (nativePlayerRef.current) {
          try {
            nativePlayerRef.current.release();
          } catch (e) {
            // تجاهل
          }
          nativePlayerRef.current = null;
        }
      }
    };
  }, []);

  const playBell = useCallback(async () => {
    console.log("[NotificationBell] ===== playBell called =====");
    console.log("[NotificationBell] Platform:", Platform.OS);

    try {
      if (Platform.OS === "web") {
        // ========== WEB ==========
        if (webAudioRef.current) {
          webAudioRef.current.currentTime = 0;
          await webAudioRef.current.play();
          console.log("[NotificationBell] Web bell played");
        } else {
          const audio = new Audio("/sounds/notif3.mp3");
          audio.volume = 1.0;
          webAudioRef.current = audio;
          await audio.play();
          console.log("[NotificationBell] Web bell played (new instance)");
        }
      } else {
        // ========== NATIVE (Android/iOS) ==========
        // إذا لم يكن هناك player، أنشئ واحد جديد
        if (!nativePlayerRef.current && BELL_SOUND) {
          try {
            const { createAudioPlayer, AudioModule } = require("expo-audio");
            
            if (!audioModeSetRef.current) {
              await AudioModule.setAudioModeAsync({
                playsInSilentMode: true,
                allowsRecording: false,
              });
              audioModeSetRef.current = true;
            }
            
            const player = createAudioPlayer(BELL_SOUND);
            player.volume = 1.0;
            nativePlayerRef.current = player;
            console.log("[NotificationBell] Created new native player");
          } catch (e) {
            console.error("[NotificationBell] Failed to create player:", e);
            return;
          }
        }

        const player = nativePlayerRef.current;
        if (player) {
          // إعادة التشغيل من البداية
          try {
            player.seekTo(0);
          } catch (e) {
            // seekTo قد لا يكون متاحاً - نتجاهل
            console.log("[NotificationBell] seekTo not available, creating new player");
            // إنشاء player جديد
            try {
              player.release();
            } catch (re) { /* تجاهل */ }
            
            const { createAudioPlayer } = require("expo-audio");
            const newPlayer = createAudioPlayer(BELL_SOUND);
            newPlayer.volume = 1.0;
            nativePlayerRef.current = newPlayer;
            
            // انتظار قصير للتحميل
            await new Promise(resolve => setTimeout(resolve, 100));
            newPlayer.play();
            console.log("[NotificationBell] New native player created and playing");
            return;
          }
          
          // انتظار قصير ثم تشغيل
          await new Promise(resolve => setTimeout(resolve, 50));
          player.play();
          console.log("[NotificationBell] Native bell play() called");
        } else {
          console.error("[NotificationBell] No native player available!");
        }
      }
    } catch (error) {
      console.error("[NotificationBell] Error playing bell:", error);
    }
  }, []);

  return { playBell };
}
