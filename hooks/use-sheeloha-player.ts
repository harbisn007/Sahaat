/**
 * Sheeloha Player Hook
 *
 * - يشغّل ملف الشيلوها الجاهز من الخادم (chorus + تصفيق 0.96)
 * - loop مستمر حتى الضغط على "خلوها"
 * - إيقاف فوري عند stop()
 */

import { useRef, useCallback, useState } from "react";
import * as ExpoAudio from "expo-audio";
const { createAudioPlayer, AudioModule } = ExpoAudio;
type AudioPlayer = ExpoAudio.AudioPlayer;
import { Platform } from "react-native";

const SHEELOHA_VOLUME = 0.8; // رفعنا الصوت لأن ffmpeg يخفضه

interface SheelohaData {
  sheelohaUrl: string;
  taroukUrl?: string;   // للتوافق
  taroukDuration?: number;
}

export function useSheelohaPlayer() {
  const isPlayingRef = useRef(false);
  const [isPlayingState, setIsPlayingState] = useState(false);

  const playerRef = useRef<AudioPlayer | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);

  const isWeb = Platform.OS === "web";

  const cleanup = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlayingState(false);

    if (isWeb) {
      if (webAudioRef.current) {
        try { webAudioRef.current.pause(); } catch (_) {}
        try { webAudioRef.current.src = ""; } catch (_) {}
        webAudioRef.current = null;
      }
    } else {
      if (playerRef.current) {
        try { playerRef.current.pause(); } catch (_) {}
        try { playerRef.current.release(); } catch (_) {}
        playerRef.current = null;
      }
    }
  }, [isWeb]);

  const play = useCallback(async (data: SheelohaData) => {
    console.log("[SheelohaPlayer] play():", data.sheelohaUrl || data.taroukUrl);
    cleanup();

    const audioUrl = data.sheelohaUrl || data.taroukUrl || "";
    if (!audioUrl) {
      console.warn("[SheelohaPlayer] No URL");
      return;
    }

    isPlayingRef.current = true;
    setIsPlayingState(true);

    try {
      if (isWeb) {
        const audio = new Audio(audioUrl);
        audio.volume = SHEELOHA_VOLUME;
        audio.loop = true;
        webAudioRef.current = audio;
        audio.onerror = (e) => {
          console.error("[SheelohaPlayer] Web error:", e);
          cleanup();
        };
        await audio.play();
        console.log("[SheelohaPlayer] Web playing (loop)");
      } else {
        try {
          await AudioModule.setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: false,
          });
        } catch (_) {}

        const player = createAudioPlayer(audioUrl);
        playerRef.current = player;
        player.volume = SHEELOHA_VOLUME;
        player.loop = true;
        player.play();
        console.log("[SheelohaPlayer] Native playing (loop)");
      }
    } catch (error) {
      console.error("[SheelohaPlayer] play error:", error);
      cleanup();
    }
  }, [cleanup, isWeb]);

  const stop = useCallback(() => {
    console.log("[SheelohaPlayer] stop()");
    cleanup();
  }, [cleanup]);

  return { play, stop, isPlaying: isPlayingState };
}
