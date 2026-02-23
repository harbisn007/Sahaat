/**
 * Sheeloha Player Hook - النسخة المحدّثة
 *
 * عند الضغط على زر "شيلوها":
 * - يشغّل آخر صوت طاروق بتأثير الطاروق (echo + reverb + pitch)
 * - يصاحبه صوت تصفيق يتكرر بسرعة 0.96 ثانية بين كل تصفيقة
 * - يستمر حتى الضغط على "خلوها"
 */

import { useRef, useCallback, useState } from "react";
import * as ExpoAudio from "expo-audio";
const { createAudioPlayer, AudioModule } = ExpoAudio;
type AudioPlayer = ExpoAudio.AudioPlayer;
import { Platform } from "react-native";
import { playWithTaroukEffects, TAROUK_EFFECTS } from "@/lib/audio-effects";

// رابط صوت التصفيق المفرد
const CLAP_SOUND_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663292181877/bXZOlcZxcTqODWQb.mp3";

// سرعة تكرار التصفيق بالثواني
const CLAP_REPEAT_SPEED = 0.96;

interface SheelohaData {
  taroukUrl?: string;    // رابط آخر صوت طاروق (الصيغة الجديدة)
  sheelohaUrl?: string;  // للتوافق مع الاستدعاء القديم
  taroukDuration?: number;
}

export function useSheelohaPlayer() {
  const isPlayingRef = useRef(false);
  const [isPlayingState, setIsPlayingState] = useState(false);

  // Native players
  const taroukPlayerRef = useRef<AudioPlayer | null>(null);
  const clapIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clapPlayersRef = useRef<AudioPlayer[]>([]);

  // Web audio
  const webStopRef = useRef<(() => void) | null>(null);
  const webClapIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isWeb = Platform.OS === "web";

  // ---- تنظيف شامل ----
  const cleanup = useCallback(() => {
    if (clapIntervalRef.current) {
      clearInterval(clapIntervalRef.current);
      clapIntervalRef.current = null;
    }
    if (webClapIntervalRef.current) {
      clearInterval(webClapIntervalRef.current);
      webClapIntervalRef.current = null;
    }
    clapPlayersRef.current.forEach((p) => {
      try { p.pause(); } catch (_) {}
      try { p.release(); } catch (_) {}
    });
    clapPlayersRef.current = [];
    if (taroukPlayerRef.current) {
      try { taroukPlayerRef.current.pause(); } catch (_) {}
      try { taroukPlayerRef.current.release(); } catch (_) {}
      taroukPlayerRef.current = null;
    }
    if (webStopRef.current) {
      try { webStopRef.current(); } catch (_) {}
      webStopRef.current = null;
    }
    isPlayingRef.current = false;
    setIsPlayingState(false);
  }, []);

  // ---- تشغيل تصفيقة واحدة (native) ----
  const playOneClap = useCallback(() => {
    try {
      const p = createAudioPlayer(CLAP_SOUND_URL);
      p.volume = TAROUK_EFFECTS.volume.clap;
      p.play();
      clapPlayersRef.current.push(p);
      setTimeout(() => {
        try { p.pause(); } catch (_) {}
        try { p.release(); } catch (_) {}
        clapPlayersRef.current = clapPlayersRef.current.filter((x) => x !== p);
      }, 4000);
    } catch (e) {
      console.warn("[SheelohaPlayer] clap error:", e);
    }
  }, []);

  // ---- تشغيل ----
  const play = useCallback(
    async (data: SheelohaData) => {
      console.log("[SheelohaPlayer] play() called:", data);
      cleanup();

      // رابط الصوت - يدعم الصيغتين
      const audioUrl = data.taroukUrl || data.sheelohaUrl || "";
      if (!audioUrl) {
        console.warn("[SheelohaPlayer] No audio URL provided");
        return;
      }

      isPlayingRef.current = true;
      setIsPlayingState(true);

      try {
        if (isWeb) {
          // Web: تشغيل الطاروق بتأثيراته + تصفيق متكرر
          const result = await playWithTaroukEffects(audioUrl, () => {
            if (webClapIntervalRef.current) {
              clearInterval(webClapIntervalRef.current);
              webClapIntervalRef.current = null;
            }
          });
          if (result) webStopRef.current = result.stop;

          const playWebClap = () => {
            if (!isPlayingRef.current) return;
            try {
              const audio = new Audio(CLAP_SOUND_URL);
              audio.volume = TAROUK_EFFECTS.volume.clap;
              audio.play().catch(() => {});
            } catch (_) {}
          };
          playWebClap();
          webClapIntervalRef.current = setInterval(() => {
            if (!isPlayingRef.current) {
              clearInterval(webClapIntervalRef.current!);
              webClapIntervalRef.current = null;
              return;
            }
            playWebClap();
          }, CLAP_REPEAT_SPEED * 1000);
        } else {
          // Native: تشغيل الطاروق + تصفيق متكرر
          try {
            await AudioModule.setAudioModeAsync({
              playsInSilentMode: true,
              allowsRecording: false,
            });
          } catch (e) {
            console.warn("[SheelohaPlayer] setAudioMode error:", e);
          }

          const player = createAudioPlayer(audioUrl);
          taroukPlayerRef.current = player;
          player.volume = TAROUK_EFFECTS.volume.master;

          await new Promise((r) => setTimeout(r, 300));
          try {
            if (typeof (player as any).setPlaybackRate === "function") {
              (player as any).setPlaybackRate(TAROUK_EFFECTS.pitch.playbackRate);
            }
          } catch (_) {}

          player.play();
          console.log("[SheelohaPlayer] Tarouk playing with effects");

          // تصفيق أولي فوري ثم كل 0.96 ثانية
          playOneClap();
          clapIntervalRef.current = setInterval(() => {
            if (!isPlayingRef.current) {
              clearInterval(clapIntervalRef.current!);
              clapIntervalRef.current = null;
              return;
            }
            playOneClap();
          }, CLAP_REPEAT_SPEED * 1000);
        }
      } catch (error) {
        console.error("[SheelohaPlayer] play error:", error);
        cleanup();
      }
    },
    [cleanup, isWeb, playOneClap]
  );

  const stop = useCallback(() => {
    console.log("[SheelohaPlayer] stop() called");
    cleanup();
  }, [cleanup]);

  return { play, stop, isPlaying: isPlayingState };
}