import { useCallback, useRef, useEffect } from "react";
import { Platform } from "react-native";

/**
 * Hook لتشغيل صوت الجرس عند طلب انضمام جديد
 * 
 * على Native: يستخدم expo-audio createAudioPlayer مع URI من Asset
 * على Web: يستخدم HTMLAudioElement
 * 
 * ملاحظة: يتم import expo-audio ديناميكياً لتجنب مشاكل الويب
 */
export function useNotificationBell() {
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioInitializedRef = useRef(false);

  // تهيئة Web Audio مسبقاً
  useEffect(() => {
    if (Platform.OS === "web") {
      try {
        const audio = new Audio("/sounds/notif3.mp3");
        audio.preload = "auto";
        audio.volume = 1.0;
        webAudioRef.current = audio;
        console.log("[NotificationBell] Web audio pre-loaded");
      } catch (e) {
        console.warn("[NotificationBell] Failed to pre-load web audio:", e);
      }
    }

    return () => {
      if (Platform.OS === "web" && webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current = null;
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
        // Import expo-audio ديناميكياً
        const { createAudioPlayer, AudioModule } = require("expo-audio");

        // ضبط audio mode مرة واحدة
        if (!audioInitializedRef.current) {
          try {
            await AudioModule.setAudioModeAsync({
              playsInSilentMode: true,
              allowsRecording: false,
            });
            audioInitializedRef.current = true;
            console.log("[NotificationBell] Audio mode set");
          } catch (e) {
            console.warn("[NotificationBell] Audio mode error:", e);
          }
        }

        // استخدام require() كمصدر - هذا يعطي رقم asset module
        const bellSource = require("@/assets/sounds/notif3.mp3");
        
        console.log("[NotificationBell] Creating native player with source:", typeof bellSource, bellSource);
        
        // إنشاء player جديد في كل مرة
        const player = createAudioPlayer(bellSource);
        
        // الاستماع لانتهاء التشغيل باستخدام didJustFinish
        player.addListener("playbackStatusUpdate", (status: any) => {
          if (status.didJustFinish) {
            console.log("[NotificationBell] Native bell finished, releasing player");
            try {
              player.release();
            } catch (e) {
              // تجاهل
            }
          }
        });

        // انتظار قصير للتحميل
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // تشغيل الصوت
        player.play();
        console.log("[NotificationBell] Native bell play() called");
      }
    } catch (error) {
      console.error("[NotificationBell] Error playing bell:", error);
    }
  }, []);

  return { playBell };
}
