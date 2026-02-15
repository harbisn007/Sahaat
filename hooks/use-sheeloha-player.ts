/**
 * Sheeloha Player Hook
 * 
 * يعمل بنفس طريقة use-audio-player (التي تعمل على الجوال):
 * - createAudioPlayer(url) + setTimeout(500) + play()
 * - مشغل واحد للطاروق (بـ rate مختلف) + مشغل واحد للتصفيق
 * - تكرار لا نهائي حتى خلوها
 * - عند خلوها: إيقاف + تصفيق ختامي
 */

import { useRef, useCallback, useState } from "react";
import { createAudioPlayer, AudioModule, AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

interface SheelohaData {
  taroukUrl: string;
  taroukDuration: number;
  clapUrl: string;
  finalClapUrl: string;
}

// Rate مختلف عن الأصلي ليبدو كشخص آخر
const SHEELOHA_RATE = 1.12;
const SHEELOHA_VOLUME = 0.35;
const CLAP_VOLUME = 0.35;
const CLAP_INTERVAL = 960;
const FINAL_CLAP_VOLUME = 0.25;

export function useSheelohaPlayer() {
  const isPlayingRef = useRef(false);
  const [isPlayingState, setIsPlayingState] = useState(false);
  const dataRef = useRef<SheelohaData | null>(null);
  const clapTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Native
  const nativePlayerRef = useRef<AudioPlayer | null>(null);
  const nativeClapRef = useRef<AudioPlayer | null>(null);

  // Web
  const webPlayerRef = useRef<HTMLAudioElement | null>(null);
  const webClapRef = useRef<HTMLAudioElement | null>(null);

  const isWeb = Platform.OS === "web";

  const cleanup = useCallback(() => {
    if (clapTimerRef.current) {
      clearInterval(clapTimerRef.current);
      clapTimerRef.current = null;
    }
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }

    if (isWeb) {
      if (webPlayerRef.current) {
        try { webPlayerRef.current.pause(); webPlayerRef.current.src = ""; } catch (_) {}
        webPlayerRef.current = null;
      }
      if (webClapRef.current) {
        try { webClapRef.current.pause(); webClapRef.current.src = ""; } catch (_) {}
        webClapRef.current = null;
      }
    } else {
      if (nativePlayerRef.current) {
        try { nativePlayerRef.current.pause(); } catch (_) {}
        try { nativePlayerRef.current.release(); } catch (_) {}
        nativePlayerRef.current = null;
      }
      if (nativeClapRef.current) {
        try { nativeClapRef.current.pause(); } catch (_) {}
        try { nativeClapRef.current.release(); } catch (_) {}
        nativeClapRef.current = null;
      }
    }
  }, [isWeb]);

  /**
   * تشغيل جولة واحدة من الشيلوها
   */
  const playOneRound = useCallback(async () => {
    if (!isPlayingRef.current || !dataRef.current) return;

    const { taroukUrl, taroukDuration, clapUrl } = dataRef.current;
    const roundMs = (taroukDuration / SHEELOHA_RATE) * 1000;

    console.log("[Sheeloha] Round start, duration:", taroukDuration, "s");

    // تنظيف المشغلات السابقة (بدون إيقاف isPlaying)
    if (clapTimerRef.current) { clearInterval(clapTimerRef.current); clapTimerRef.current = null; }
    if (loopTimerRef.current) { clearTimeout(loopTimerRef.current); loopTimerRef.current = null; }

    if (isWeb) {
      // ===== الويب =====
      if (webPlayerRef.current) {
        try { webPlayerRef.current.pause(); webPlayerRef.current.src = ""; } catch (_) {}
      }
      const audio = new Audio(taroukUrl);
      audio.volume = SHEELOHA_VOLUME;
      audio.playbackRate = SHEELOHA_RATE;
      webPlayerRef.current = audio;
      audio.play().catch(() => {});

      // تصفيق
      clapTimerRef.current = setInterval(() => {
        if (!isPlayingRef.current) return;
        try {
          const c = new Audio(clapUrl);
          c.volume = CLAP_VOLUME;
          webClapRef.current = c;
          c.play().catch(() => {});
        } catch (_) {}
      }, CLAP_INTERVAL);

    } else {
      // ===== الجوال: نفس طريقة use-audio-player بالضبط =====
      if (nativePlayerRef.current) {
        try { nativePlayerRef.current.pause(); } catch (_) {}
        try { nativePlayerRef.current.release(); } catch (_) {}
        nativePlayerRef.current = null;
      }

      // 1. إنشاء player بنفس طريقة use-audio-player
      console.log("[Sheeloha] Creating native player...");
      const player = createAudioPlayer(taroukUrl);
      nativePlayerRef.current = player;
      player.volume = SHEELOHA_VOLUME;
      try { player.playbackRate = SHEELOHA_RATE; } catch (_) {}

      // 2. انتظار 500ms بالضبط مثل use-audio-player
      await new Promise(resolve => setTimeout(resolve, 500));

      // 3. التحقق أننا لا زلنا نشغل
      if (!isPlayingRef.current || !nativePlayerRef.current) {
        console.log("[Sheeloha] Cancelled before play");
        return;
      }

      // 4. تشغيل
      console.log("[Sheeloha] Playing native audio...");
      player.play();

      // تصفيق: إنشاء player جديد كل مرة
      clapTimerRef.current = setInterval(async () => {
        if (!isPlayingRef.current) return;
        try {
          // تنظيف التصفيقة السابقة
          if (nativeClapRef.current) {
            try { nativeClapRef.current.pause(); } catch (_) {}
            try { nativeClapRef.current.release(); } catch (_) {}
          }
          const cp = createAudioPlayer(clapUrl);
          nativeClapRef.current = cp;
          cp.volume = CLAP_VOLUME;
          // انتظار قصير للتحميل
          await new Promise(r => setTimeout(r, 300));
          if (!isPlayingRef.current) {
            try { cp.release(); } catch (_) {}
            return;
          }
          cp.play();
        } catch (_) {}
      }, CLAP_INTERVAL);
    }

    // بعد انتهاء الجولة: جولة جديدة
    loopTimerRef.current = setTimeout(() => {
      if (!isPlayingRef.current) return;
      playOneRound();
    }, roundMs + 300);
  }, [isWeb]);

  /**
   * تشغيل الشيلوها
   */
  const play = useCallback(async (data: SheelohaData) => {
    console.log("[Sheeloha] play() called, duration:", data.taroukDuration, "s");

    isPlayingRef.current = false;
    setIsPlayingState(false);
    cleanup();

    if (!isWeb) {
      try {
        await AudioModule.setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
        });
      } catch (_) {}
    }

    isPlayingRef.current = true;
    setIsPlayingState(true);
    dataRef.current = data;

    await playOneRound();
  }, [cleanup, playOneRound, isWeb]);

  /**
   * إيقاف + تصفيق ختامي
   */
  const stop = useCallback(async () => {
    if (!isPlayingRef.current) return;

    console.log("[Sheeloha] Stopping (khalooha)");
    isPlayingRef.current = false;
    setIsPlayingState(false);

    const finalClapUrl = dataRef.current?.finalClapUrl;
    cleanup();

    if (finalClapUrl) {
      try {
        if (isWeb) {
          const fa = new Audio(finalClapUrl);
          fa.volume = FINAL_CLAP_VOLUME;
          fa.play().catch(() => {});
        } else {
          const fp = createAudioPlayer(finalClapUrl);
          fp.volume = FINAL_CLAP_VOLUME;
          await new Promise(r => setTimeout(r, 500));
          fp.play();
          setTimeout(() => { try { fp.release(); } catch (_) {} }, 10000);
        }
        console.log("[Sheeloha] Final clap at 25%");
      } catch (e) {
        console.error("[Sheeloha] Final clap error:", e);
      }
    }

    dataRef.current = null;
  }, [cleanup, isWeb]);

  return {
    play,
    stop,
    isPlaying: isPlayingState,
  };
}
