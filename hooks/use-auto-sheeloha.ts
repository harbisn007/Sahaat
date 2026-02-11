import { useState, useRef, useCallback, useEffect } from "react";
import { createAudioPlayer, AudioModule, AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

/**
 * Hook لتشغيل ملف الشيلوها المدمج تلقائياً بعد الطاروق
 * 
 * الملف المدمج يحتوي على: صوت الصفوف (5 نسخ) + تصفيق إيقاعي + تصفيق ختامي
 * يتم إنشاؤه على الخادم ورفعه إلى S3
 * 
 * التشغيل: مرتين متتاليتين ثم يتوقف تلقائياً
 * الإيقاف: عبر زر خلوها (يوقف عند الجميع)
 */
export function useAutoSheeloha() {
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const repeatCountRef = useRef(0);
  const currentUrlRef = useRef<string | null>(null);
  const isStoppedRef = useRef(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // تنظيف
  const cleanup = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    
    if (Platform.OS === "web") {
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current.src = "";
        webAudioRef.current.onended = null;
        webAudioRef.current.onerror = null;
        webAudioRef.current = null;
      }
    } else {
      if (playerRef.current) {
        try {
          playerRef.current.pause();
          playerRef.current.release();
        } catch (e) {
          // ignore
        }
        playerRef.current = null;
      }
    }
    
    currentUrlRef.current = null;
    repeatCountRef.current = 0;
  }, []);

  // تنظيف عند unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  /**
   * تشغيل ملف الشيلوها المدمج مرة واحدة
   * يُستدعى داخلياً ويعيد Promise ينتهي عند انتهاء التشغيل
   */
  const playOnce = useCallback(async (url: string): Promise<boolean> => {
    return new Promise(async (resolve) => {
      try {
        if (isStoppedRef.current) {
          resolve(false);
          return;
        }

        if (Platform.OS === "web") {
          const audio = new Audio(url);
          audio.volume = 1.0;
          webAudioRef.current = audio;

          audio.onended = () => {
            console.log("[useAutoSheeloha] Web playback ended");
            resolve(true);
          };

          audio.onerror = (e) => {
            console.error("[useAutoSheeloha] Web playback error:", e);
            resolve(false);
          };

          await audio.play();
          console.log("[useAutoSheeloha] Web playback started");
        } else {
          // Native
          try {
            await AudioModule.setAudioModeAsync({
              playsInSilentMode: true,
              allowsRecording: false,
            });
          } catch (e) {
            console.warn("[useAutoSheeloha] Failed to set audio mode:", e);
          }

          const player = createAudioPlayer(url);
          playerRef.current = player;
          player.volume = 1.0;

          let hasResolved = false;
          player.addListener("playbackStatusUpdate", (status) => {
            if (hasResolved) return;
            if (status.isLoaded && !status.playing && status.currentTime > 0) {
              if (status.duration > 0 && status.currentTime >= status.duration - 0.1) {
                console.log("[useAutoSheeloha] Native playback ended");
                hasResolved = true;
                resolve(true);
              }
            }
          });

          // انتظار التحميل
          await new Promise(r => setTimeout(r, 500));

          if (isStoppedRef.current || !playerRef.current) {
            resolve(false);
            return;
          }

          player.play();
          console.log("[useAutoSheeloha] Native playback started");

          // Timeout fallback (30 ثانية كحد أقصى)
          const fallbackTimeout = setTimeout(() => {
            if (!hasResolved) {
              console.log("[useAutoSheeloha] Fallback timeout reached");
              hasResolved = true;
              resolve(true);
            }
          }, 30000);
          timeoutsRef.current.push(fallbackTimeout);
        }
      } catch (error) {
        console.error("[useAutoSheeloha] Play error:", error);
        resolve(false);
      }
    });
  }, []);

  /**
   * تشغيل ملف الشيلوها المدمج مرتين متتاليتين
   */
  const playSheeloha = useCallback(async (sheelohaUrl: string) => {
    if (!sheelohaUrl) {
      console.warn("[useAutoSheeloha] No sheeloha URL provided");
      return;
    }

    console.log("[useAutoSheeloha] Starting auto sheeloha (2 repeats):", sheelohaUrl.substring(0, 80));
    
    // إيقاف أي تشغيل سابق
    cleanup();
    isStoppedRef.current = false;
    currentUrlRef.current = sheelohaUrl;
    setIsPlaying(true);

    // تشغيل مرتين
    for (let i = 0; i < 2; i++) {
      if (isStoppedRef.current) {
        console.log(`[useAutoSheeloha] Stopped before repeat ${i + 1}`);
        break;
      }

      console.log(`[useAutoSheeloha] Playing repeat ${i + 1}/2`);
      repeatCountRef.current = i + 1;

      // تنظيف player السابق قبل التكرار
      if (i > 0) {
        if (Platform.OS === "web") {
          if (webAudioRef.current) {
            webAudioRef.current.pause();
            webAudioRef.current.src = "";
            webAudioRef.current = null;
          }
        } else {
          if (playerRef.current) {
            try {
              playerRef.current.pause();
              playerRef.current.release();
            } catch (e) { /* ignore */ }
            playerRef.current = null;
          }
        }
      }

      const success = await playOnce(sheelohaUrl);
      if (!success || isStoppedRef.current) {
        console.log(`[useAutoSheeloha] Playback stopped or failed at repeat ${i + 1}`);
        break;
      }
    }

    // انتهى التشغيل
    console.log("[useAutoSheeloha] Auto sheeloha complete");
    cleanup();
    setIsPlaying(false);
  }, [cleanup, playOnce]);

  /**
   * إيقاف الشيلوها فوراً
   */
  const stopSheeloha = useCallback(() => {
    console.log("[useAutoSheeloha] Stop requested");
    isStoppedRef.current = true;
    cleanup();
    setIsPlaying(false);
  }, [cleanup]);

  return {
    isPlaying,
    playSheeloha,
    stopSheeloha,
  };
}
