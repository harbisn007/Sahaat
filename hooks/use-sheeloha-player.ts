/**
 * Sheeloha Player Hook
 * 
 * يستخدم نفس طريقة use-audio-player بالضبط (التي تعمل على الجوال):
 * - createAudioPlayer(url) + playbackStatusUpdate listener + setTimeout(500) + play()
 * - على الجوال: مشغل واحد (rate مختلف) + تصفيق
 * - على الويب: 3 نسخ بطبقات مختلفة (تأثير مجموعة) + تصفيق
 * - تكرار لا نهائي حتى خلوها
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

const SHEELOHA_VOLUME = 0.35;
const CLAP_VOLUME = 0.35;
const CLAP_INTERVAL = 960;
const FINAL_CLAP_VOLUME = 0.25;

// طبقات مختلفة لتأثير المجموعة (الويب فقط)
const WEB_VOICES = [
  { rate: 0.92, delay: 0, volume: 0.30 },   // صوت غليظ
  { rate: 1.00, delay: 150, volume: 0.35 },  // صوت طبيعي
  { rate: 1.10, delay: 80, volume: 0.28 },   // صوت رفيع
];

// الجوال: rate واحد مختلف عن الأصلي
const NATIVE_RATE = 1.12;

export function useSheelohaPlayer() {
  const isPlayingRef = useRef(false);
  const [isPlayingState, setIsPlayingState] = useState(false);
  const dataRef = useRef<SheelohaData | null>(null);
  const clapTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Native
  const nativePlayerRef = useRef<AudioPlayer | null>(null);
  const nativeClapRef = useRef<AudioPlayer | null>(null);

  // Web - عدة نسخ
  const webPlayersRef = useRef<HTMLAudioElement[]>([]);
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
      for (const a of webPlayersRef.current) {
        try { a.pause(); a.src = ""; } catch (_) {}
      }
      webPlayersRef.current = [];
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

  const playOneRound = useCallback(async () => {
    if (!isPlayingRef.current || !dataRef.current) return;

    const { taroukUrl, taroukDuration, clapUrl } = dataRef.current;

    // تنظيف المشغلات السابقة (بدون إيقاف isPlaying)
    if (clapTimerRef.current) { clearInterval(clapTimerRef.current); clapTimerRef.current = null; }
    if (loopTimerRef.current) { clearTimeout(loopTimerRef.current); loopTimerRef.current = null; }

    if (isWeb) {
      // ===== الويب: 3 نسخ بطبقات مختلفة = تأثير مجموعة =====
      for (const a of webPlayersRef.current) {
        try { a.pause(); a.src = ""; } catch (_) {}
      }
      webPlayersRef.current = [];

      for (const voice of WEB_VOICES) {
        setTimeout(() => {
          if (!isPlayingRef.current) return;
          try {
            const audio = new Audio(taroukUrl);
            audio.volume = voice.volume;
            audio.playbackRate = voice.rate;
            webPlayersRef.current.push(audio);
            audio.play().catch(() => {});
          } catch (_) {}
        }, voice.delay);
      }

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

      // حساب مدة الجولة بناءً على أبطأ rate
      const roundMs = (taroukDuration / 0.92) * 1000;
      loopTimerRef.current = setTimeout(() => {
        if (!isPlayingRef.current) return;
        playOneRound();
      }, roundMs + 300);

    } else {
      // ===== الجوال: نفس طريقة use-audio-player بالضبط =====
      if (nativePlayerRef.current) {
        try { nativePlayerRef.current.pause(); } catch (_) {}
        try { nativePlayerRef.current.release(); } catch (_) {}
        nativePlayerRef.current = null;
      }

      // 1. إنشاء player بنفس طريقة use-audio-player
      console.log("[Sheeloha] Creating native player with URI...");
      const player = createAudioPlayer(taroukUrl);
      nativePlayerRef.current = player;
      player.volume = SHEELOHA_VOLUME;

      // 2. الاستماع لأحداث الـ player (نفس use-audio-player)
      player.addListener("playbackStatusUpdate", (status: any) => {
        // إذا انتهى التشغيل - نبدأ جولة جديدة
        if (status.isLoaded && !status.playing && status.currentTime > 0) {
          if (status.duration > 0 && status.currentTime >= status.duration - 0.1) {
            console.log("[Sheeloha] Native round finished, starting next...");
            if (isPlayingRef.current) {
              // جولة جديدة بعد تأخير بسيط
              loopTimerRef.current = setTimeout(() => {
                if (isPlayingRef.current) playOneRound();
              }, 300);
            }
          }
        }
      });

      // 3. انتظار 500ms بالضبط مثل use-audio-player
      await new Promise(resolve => setTimeout(resolve, 500));

      // 4. التحقق أننا لا زلنا نشغل
      if (!isPlayingRef.current || !nativePlayerRef.current) {
        console.log("[Sheeloha] Cancelled before play");
        return;
      }

      // 5. ضبط rate بعد التحميل
      try { player.playbackRate = NATIVE_RATE; } catch (_) {}

      // 6. تشغيل
      console.log("[Sheeloha] Playing native audio...");
      player.play();

      // تصفيق
      clapTimerRef.current = setInterval(async () => {
        if (!isPlayingRef.current) return;
        try {
          if (nativeClapRef.current) {
            try { nativeClapRef.current.pause(); } catch (_) {}
            try { nativeClapRef.current.release(); } catch (_) {}
          }
          const cp = createAudioPlayer(clapUrl);
          nativeClapRef.current = cp;
          cp.volume = CLAP_VOLUME;
          await new Promise(r => setTimeout(r, 300));
          if (!isPlayingRef.current) {
            try { cp.release(); } catch (_) {}
            return;
          }
          cp.play();
        } catch (_) {}
      }, CLAP_INTERVAL);
    }
  }, [isWeb]);

  const play = useCallback(async (data: SheelohaData) => {
    console.log("[Sheeloha] play() called");

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
      } catch (_) {}
    }

    dataRef.current = null;
  }, [cleanup, isWeb]);

  return {
    play,
    stop,
    isPlaying: isPlayingState,
  };
}
