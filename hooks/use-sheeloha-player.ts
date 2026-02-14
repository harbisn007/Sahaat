/**
 * Sheeloha Player Hook
 * 
 * بعد انتهاء تشغيل الطاروق:
 * - تشغيل 3 نسخ من الطاروق بطبقات صوت مختلفة وتأخيرات بسيطة
 *   لإعطاء تأثير مجموعة/جمهور يردد (وليس شخص واحد)
 * - تصفيق إيقاعي كل 0.96 ثانية بمستوى 35%
 * - تكرار لا نهائي حتى يضغط أحد "خلوها"
 * - عند خلوها: إيقاف فوري + تصفيق ختامي مرة واحدة بمستوى 25%
 * 
 * النسخ الثلاث:
 *   1. rate=0.92  vol=0.30  delay=0ms   (صوت أخفض/أغلظ)
 *   2. rate=1.08  vol=0.28  delay=80ms  (صوت أعلى/أرفع)
 *   3. rate=1.00  vol=0.22  delay=150ms (صوت طبيعي متأخر قليلاً)
 */

import { useRef, useCallback } from "react";
import { createAudioPlayer, AudioModule, AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

interface SheelohaData {
  taroukUrl: string;
  taroukDuration: number;
  clapUrl: string;
  finalClapUrl: string;
}

// تعريف أصوات المجموعة: كل صوت بطبقة وتأخير مختلف
const CROWD_VOICES = [
  { rate: 0.92, volume: 0.30, delay: 0 },     // صوت غليظ - يبدأ فوراً
  { rate: 1.08, volume: 0.28, delay: 80 },     // صوت رفيع - متأخر 80ms
  { rate: 1.00, volume: 0.22, delay: 150 },    // صوت طبيعي - متأخر 150ms
];

// دالة مساعدة: إنشاء مشغل على الجوال مع انتظار التحميل
function createNativePlayerAsync(url: string, volume: number, rate?: number): Promise<AudioPlayer | null> {
  return new Promise((resolve) => {
    try {
      const player = createAudioPlayer(url);
      player.volume = volume;
      if (rate && rate !== 1) {
        try { player.playbackRate = rate; } catch (_) { /* */ }
      }

      const onStatus = (status: { isLoaded: boolean }) => {
        if (status.isLoaded) {
          player.removeListener("playbackStatusUpdate", onStatus);
          resolve(player);
        }
      };
      player.addListener("playbackStatusUpdate", onStatus);

      setTimeout(() => {
        player.removeListener("playbackStatusUpdate", onStatus);
        resolve(player);
      }, 3000);
    } catch (e) {
      console.error("[Sheeloha] createNativePlayerAsync failed:", e);
      resolve(null);
    }
  });
}

export function useSheelohaPlayer() {
  const isPlayingRef = useRef(false);
  const dataRef = useRef<SheelohaData | null>(null);
  const clapTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Native players (عدة نسخ)
  const nativePlayersRef = useRef<AudioPlayer[]>([]);
  const nativeClapRef = useRef<AudioPlayer | null>(null);

  // Web players
  const webPlayersRef = useRef<HTMLAudioElement[]>([]);
  const webClapRef = useRef<HTMLAudioElement | null>(null);

  const isWeb = Platform.OS === "web";

  /**
   * تنظيف كل شيء
   */
  const cleanup = useCallback(() => {
    // مؤقتات
    if (clapTimerRef.current) {
      clearInterval(clapTimerRef.current);
      clapTimerRef.current = null;
    }
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    for (const t of voiceTimersRef.current) clearTimeout(t);
    voiceTimersRef.current = [];

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
      for (const p of nativePlayersRef.current) {
        try { p.pause(); } catch (_) {}
        try { p.release(); } catch (_) {}
      }
      nativePlayersRef.current = [];
      if (nativeClapRef.current) {
        try { nativeClapRef.current.pause(); } catch (_) {}
        try { nativeClapRef.current.release(); } catch (_) {}
        nativeClapRef.current = null;
      }
    }
  }, [isWeb]);

  /**
   * تشغيل جولة واحدة
   */
  const playOneRound = useCallback(async () => {
    if (!isPlayingRef.current || !dataRef.current) return;

    const { taroukUrl, taroukDuration, clapUrl } = dataRef.current;
    // أبطأ rate يحدد أطول مدة
    const slowestRate = Math.min(...CROWD_VOICES.map(v => v.rate));
    const roundMs = (taroukDuration / slowestRate) * 1000;

    console.log("[Sheeloha] Round start, voices:", CROWD_VOICES.length, ", effective duration:", (roundMs / 1000).toFixed(2), "s");

    // تنظيف السابق (بدون إيقاف isPlaying)
    if (clapTimerRef.current) {
      clearInterval(clapTimerRef.current);
      clapTimerRef.current = null;
    }
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    for (const t of voiceTimersRef.current) clearTimeout(t);
    voiceTimersRef.current = [];

    if (isWeb) {
      // تنظيف المشغلات السابقة
      for (const a of webPlayersRef.current) {
        try { a.pause(); a.src = ""; } catch (_) {}
      }
      webPlayersRef.current = [];

      // ===== الويب: 3 نسخ HTML5 Audio =====
      for (const voice of CROWD_VOICES) {
        const t = setTimeout(() => {
          if (!isPlayingRef.current) return;
          try {
            const audio = new Audio(taroukUrl);
            audio.volume = voice.volume;
            audio.playbackRate = voice.rate;
            webPlayersRef.current.push(audio);
            audio.play().catch(() => {});
          } catch (_) {}
        }, voice.delay);
        voiceTimersRef.current.push(t);
      }
      console.log("[Sheeloha] Web crowd voices started");

      // تصفيق كل 0.96 ثانية
      const CLAP_INTERVAL = 960;
      const playWebClap = () => {
        if (!isPlayingRef.current) return;
        try {
          const clapAudio = new Audio(clapUrl);
          clapAudio.volume = 0.35;
          webClapRef.current = clapAudio;
          clapAudio.play().catch(() => {});
        } catch (_) {}
      };
      clapTimerRef.current = setInterval(playWebClap, CLAP_INTERVAL);

    } else {
      // تنظيف المشغلات السابقة
      for (const p of nativePlayersRef.current) {
        try { p.pause(); } catch (_) {}
        try { p.release(); } catch (_) {}
      }
      nativePlayersRef.current = [];

      // ===== الجوال: 3 نسخ expo-audio مع انتظار التحميل =====
      for (const voice of CROWD_VOICES) {
        const t = setTimeout(async () => {
          if (!isPlayingRef.current) return;
          const p = await createNativePlayerAsync(taroukUrl, voice.volume, voice.rate);
          if (!isPlayingRef.current) {
            if (p) { try { p.release(); } catch (_) {} }
            return;
          }
          if (p) {
            nativePlayersRef.current.push(p);
            p.play();
          }
        }, voice.delay);
        voiceTimersRef.current.push(t);
      }
      console.log("[Sheeloha] Native crowd voices started");

      // تصفيق كل 0.96 ثانية
      const CLAP_INTERVAL = 960;
      const playNativeClap = async () => {
        if (!isPlayingRef.current) return;
        try {
          if (nativeClapRef.current) {
            try { nativeClapRef.current.release(); } catch (_) {}
          }
          const cp = await createNativePlayerAsync(clapUrl, 0.35);
          if (!isPlayingRef.current) {
            if (cp) { try { cp.release(); } catch (_) {} }
            return;
          }
          nativeClapRef.current = cp;
          if (cp) cp.play();
        } catch (_) {}
      };
      clapTimerRef.current = setInterval(playNativeClap, CLAP_INTERVAL);
    }

    // بعد انتهاء الجولة: ابدأ جولة جديدة
    loopTimerRef.current = setTimeout(() => {
      if (!isPlayingRef.current) return;
      playOneRound();
    }, roundMs + 200);
  }, [isWeb]);

  /**
   * تشغيل الشيلوها
   */
  const play = useCallback(async (data: SheelohaData) => {
    console.log("[Sheeloha] play() called, duration:", data.taroukDuration, "s, voices:", CROWD_VOICES.length);

    isPlayingRef.current = false;
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
    dataRef.current = data;

    await playOneRound();
  }, [cleanup, playOneRound, isWeb]);

  /**
   * إيقاف الشيلوها + تصفيق ختامي
   */
  const stop = useCallback(async () => {
    if (!isPlayingRef.current) return;

    console.log("[Sheeloha] Stopping (khalooha)");
    isPlayingRef.current = false;

    const finalClapUrl = dataRef.current?.finalClapUrl;
    cleanup();

    if (finalClapUrl) {
      try {
        if (isWeb) {
          const fa = new Audio(finalClapUrl);
          fa.volume = 0.25;
          fa.play().catch(() => {});
        } else {
          const fp = await createNativePlayerAsync(finalClapUrl, 0.25);
          if (fp) {
            fp.play();
            setTimeout(() => { try { fp.release(); } catch (_) {} }, 10000);
          }
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
    isPlaying: isPlayingRef.current,
  };
}
