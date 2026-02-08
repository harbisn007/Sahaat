import { useCallback, useRef, useEffect } from "react";
import { createAudioPlayer, AudioModule, AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

const BELL_SOUND = require("@/assets/sounds/notif3.mp3");

/**
 * Hook لتشغيل صوت الجرس عند طلب انضمام جديد
 * يستخدم نفس نمط use-audio-player.ts الذي يعمل بنجاح
 * - على الويب: HTMLAudioElement
 * - على Native: createAudioPlayer من expo-audio
 */
export function useNotificationBell() {
  const nativePlayerRef = useRef<AudioPlayer | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioModeSetRef = useRef(false);

  // تهيئة وضع الصوت على Native مرة واحدة
  useEffect(() => {
    const initAudioMode = async () => {
      if (Platform.OS !== "web" && !audioModeSetRef.current) {
        try {
          await AudioModule.setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: false,
          });
          audioModeSetRef.current = true;
          console.log("[NotificationBell] Audio mode set for native");
        } catch (e) {
          console.warn("[NotificationBell] Failed to set audio mode:", e);
        }
      }
    };
    initAudioMode();

    // تهيئة Web Audio
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
      // تنظيف
      if (Platform.OS === "web" && webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current = null;
      }
      if (nativePlayerRef.current) {
        try {
          nativePlayerRef.current.pause();
          nativePlayerRef.current.release();
        } catch (e) {
          // تجاهل
        }
        nativePlayerRef.current = null;
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
          // إنشاء audio جديد إذا لم يكن موجوداً
          const audio = new Audio("/sounds/notif3.mp3");
          audio.volume = 1.0;
          webAudioRef.current = audio;
          await audio.play();
          console.log("[NotificationBell] Web bell played (new instance)");
        }
      } else {
        // ========== NATIVE (Android/iOS) ==========
        // تنظيف player سابق
        if (nativePlayerRef.current) {
          try {
            nativePlayerRef.current.pause();
            nativePlayerRef.current.release();
          } catch (e) {
            // تجاهل
          }
          nativePlayerRef.current = null;
        }

        // ضبط audio mode إذا لم يتم بعد
        if (!audioModeSetRef.current) {
          try {
            await AudioModule.setAudioModeAsync({
              playsInSilentMode: true,
              allowsRecording: false,
            });
            audioModeSetRef.current = true;
          } catch (e) {
            console.warn("[NotificationBell] Audio mode error:", e);
          }
        }

        // إنشاء player جديد وتشغيله
        console.log("[NotificationBell] Creating native player...");
        const player = createAudioPlayer(BELL_SOUND);
        nativePlayerRef.current = player;

        // الاستماع لانتهاء التشغيل لتنظيف الموارد
        player.addListener("playbackStatusUpdate", (status) => {
          if (status.isLoaded && !status.playing && status.currentTime > 0) {
            if (status.duration > 0 && status.currentTime >= status.duration - 0.1) {
              console.log("[NotificationBell] Native bell finished");
              try {
                player.release();
              } catch (e) {
                // تجاهل
              }
              if (nativePlayerRef.current === player) {
                nativePlayerRef.current = null;
              }
            }
          }
        });

        // انتظار قصير للتحميل ثم التشغيل
        await new Promise(resolve => setTimeout(resolve, 300));
        
        if (nativePlayerRef.current === player) {
          player.play();
          console.log("[NotificationBell] Native bell play command sent");
        }
      }
    } catch (error) {
      console.error("[NotificationBell] Error playing bell:", error);
    }
  }, []);

  return { playBell };
}
