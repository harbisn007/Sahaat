import { useState, useRef, useCallback } from "react";
import { createAudioPlayer, AudioModule, AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

/**
 * Hook لتشغيل الأصوات - يستخدم createAudioPlayer لتحكم أفضل
 * 
 * المشاكل التي تم حلها:
 * 1. استخدام createAudioPlayer بدلاً من useAudioPlayer لتجنب مشاكل lifecycle
 * 2. إنشاء player جديد لكل صوت بدلاً من replace
 * 3. تنظيف الـ player القديم قبل إنشاء جديد
 */
export function useAudioPlayerHook() {
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);

  // تنظيف الـ player الحالي
  const cleanup = useCallback(() => {
    try {
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
          } catch (e) {
            console.log("[useAudioPlayerHook] Cleanup error (ignored):", e);
          }
          playerRef.current = null;
        }
      }
    } catch (e) {
      console.log("[useAudioPlayerHook] Cleanup error:", e);
    }
  }, []);

  const play = useCallback(async (uri: string) => {
    try {
      console.log("[useAudioPlayerHook] ========== PLAY REQUESTED ==========");
      console.log("[useAudioPlayerHook] URI:", uri.substring(0, 100));
      console.log("[useAudioPlayerHook] Platform:", Platform.OS);
      
      // إذا كان نفس الـ URI يعمل حالياً، تجاهل الطلب
      if (currentUri === uri && isPlaying) {
        console.log("[useAudioPlayerHook] Same URI already playing, ignoring");
        return;
      }

      // تنظيف أي تشغيل سابق
      console.log("[useAudioPlayerHook] Cleaning up previous player...");
      cleanup();

      setCurrentUri(uri);
      setIsPlaying(true);

      if (Platform.OS === "web") {
        // ========== WEB: استخدام HTML5 Audio ==========
        console.log("[useAudioPlayerHook] Using Web Audio API");
        
        const audio = new Audio(uri);
        audio.volume = 1.0;
        webAudioRef.current = audio;
        
        audio.onended = () => {
          console.log("[useAudioPlayerHook] Web audio ended");
          setCurrentUri(null);
          setIsPlaying(false);
        };
        
        audio.onerror = (e) => {
          console.error("[useAudioPlayerHook] Web audio error:", e);
          setCurrentUri(null);
          setIsPlaying(false);
        };
        
        await audio.play();
        console.log("[useAudioPlayerHook] Web audio playing successfully");
        
      } else {
        // ========== NATIVE: استخدام expo-audio ==========
        console.log("[useAudioPlayerHook] Using expo-audio (Native)");
        
        // 1. ضبط audio mode للتشغيل
        try {
          console.log("[useAudioPlayerHook] Setting audio mode...");
          await AudioModule.setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: false,
          });
          console.log("[useAudioPlayerHook] Audio mode set successfully");
        } catch (e) {
          console.warn("[useAudioPlayerHook] Failed to set audio mode:", e);
        }
        
        // 2. إنشاء player جديد مع الـ URI مباشرة
        console.log("[useAudioPlayerHook] Creating new AudioPlayer with URI...");
        const newPlayer = createAudioPlayer(uri);
        playerRef.current = newPlayer;
        
        // 3. الاستماع لأحداث الـ player
        newPlayer.addListener("playbackStatusUpdate", (status) => {
          console.log("[useAudioPlayerHook] Status update:", {
            isLoaded: status.isLoaded,
            isPlaying: status.playing,
            currentTime: status.currentTime,
            duration: status.duration,
          });
          
          // إذا انتهى التشغيل
          if (status.isLoaded && !status.playing && status.currentTime > 0) {
            if (status.duration > 0 && status.currentTime >= status.duration - 0.1) {
              console.log("[useAudioPlayerHook] Playback finished");
              setCurrentUri(null);
              setIsPlaying(false);
            }
          }
        });
        
        // 4. انتظار تحميل الصوت
        console.log("[useAudioPlayerHook] Waiting for audio to load...");
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 5. التحقق من أن الـ player جاهز
        if (!playerRef.current) {
          console.error("[useAudioPlayerHook] Player was cleaned up before playback");
          return;
        }
        
        // 6. بدء التشغيل
        console.log("[useAudioPlayerHook] Starting playback...");
        newPlayer.play();
        console.log("[useAudioPlayerHook] Play command sent!");
        console.log("[useAudioPlayerHook] ========== PLAY COMPLETE ==========");
      }
    } catch (error) {
      console.error("[useAudioPlayerHook] ========== PLAY ERROR ==========");
      console.error("[useAudioPlayerHook] Error:", error);
      setCurrentUri(null);
      setIsPlaying(false);
    }
  }, [currentUri, isPlaying, cleanup]);

  const stop = useCallback(() => {
    try {
      console.log("[useAudioPlayerHook] Stop requested");
      cleanup();
      setCurrentUri(null);
      setIsPlaying(false);
    } catch (error) {
      console.error("[useAudioPlayerHook] Failed to stop audio:", error);
    }
  }, [cleanup]);

  return {
    isPlaying,
    currentUri,
    play,
    stop,
  };
}
