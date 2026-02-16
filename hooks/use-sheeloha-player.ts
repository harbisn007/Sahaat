/**
 * Sheeloha Player Hook - النسخة النهائية
 * 
 * يشغل ملف الشيلوها الجاهز من الخادم (طاروق + echo + تصفيق)
 * - مستوى الصوت: 35%
 * - يستمر التشغيل حتى الضغط على "خلوها"
 * - عند "خلوها": إيقاف فوري
 */

import { useRef, useCallback, useState } from "react";
import { createAudioPlayer, AudioModule, AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

interface SheelohaData {
  sheelohaUrl: string; // رابط ملف الشيلوها الجاهز من الخادم
  taroukDuration: number;
}

const SHEELOHA_VOLUME = 0.35; // 35%

export function useSheelohaPlayer() {
  const isPlayingRef = useRef(false);
  const [isPlayingState, setIsPlayingState] = useState(false);
  const dataRef = useRef<SheelohaData | null>(null);

  const sheelohaPlayerRef = useRef<AudioPlayer | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);

  const isWeb = Platform.OS === "web";

  const cleanup = useCallback(() => {
    if (isWeb) {
      if (webAudioRef.current) {
        try { webAudioRef.current.pause(); } catch (_) {}
        webAudioRef.current = null;
      }
    } else {
      if (sheelohaPlayerRef.current) {
        try { sheelohaPlayerRef.current.pause(); } catch (_) {}
        try { sheelohaPlayerRef.current.release(); } catch (_) {}
        sheelohaPlayerRef.current = null;
      }
    }

    isPlayingRef.current = false;
    setIsPlayingState(false);
    dataRef.current = null;
  }, [isWeb]);

  const play = useCallback(
    async (data: SheelohaData) => {
      console.log("[Sheeloha] play() called:", data);
      
      // تنظيف أي تشغيل سابق
      cleanup();

      dataRef.current = data;
      isPlayingRef.current = true;
      setIsPlayingState(true);

      try {
        if (isWeb) {
          // Web: استخدام HTML5 Audio
          const audio = new Audio(data.sheelohaUrl);
          audio.volume = SHEELOHA_VOLUME;
          audio.loop = true; // تكرار حتى الضغط على "خلوها"
          webAudioRef.current = audio;
          
          audio.onerror = (e) => {
            console.error("[Sheeloha] Web audio error:", e);
            cleanup();
          };

          await audio.play();
          console.log("[Sheeloha] Web audio started");
        } else {
          // Native: استخدام expo-audio
          try {
            await AudioModule.setAudioModeAsync({
              playsInSilentMode: true,
              allowsRecording: false,
            });
          } catch (e) {
            console.warn("[Sheeloha] Failed to set audio mode:", e);
          }

          const player = createAudioPlayer(data.sheelohaUrl);
          sheelohaPlayerRef.current = player;
          player.volume = SHEELOHA_VOLUME;
          player.loop = true; // تكرار حتى الضغط على "خلوها"
          player.play();
          console.log("[Sheeloha] Native audio started");
        }
      } catch (error) {
        console.error("[Sheeloha] Play error:", error);
        cleanup();
      }
    },
    [cleanup, isWeb]
  );

  const stop = useCallback(() => {
    console.log("[Sheeloha] stop() called");
    cleanup();
  }, [cleanup]);

  return {
    play,
    stop,
    isPlaying: isPlayingState,
  };
}
