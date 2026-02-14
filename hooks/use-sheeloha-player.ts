/**
 * Sheeloha Player Hook
 * 
 * بعد الطاروق مباشرة:
 * - تشغيل الطاروق بتأثير كورس (عدة نسخ بتأخيرات وسرعات مختلفة) بمستوى 35%
 * - تصفيق إيقاعي كل 0.96 ثانية بمستوى 35%
 * - تكرار لا نهائي حتى يضغط أحد "خلوها"
 * - عند خلوها: إيقاف فوري + تصفيق ختامي مرة واحدة بمستوى 25%
 * 
 * يستخدم createAudioPlayer (نفس الطريقة المستخدمة في use-audio-player.ts)
 */

import { useRef, useCallback } from "react";
import { createAudioPlayer, AudioModule, AudioPlayer } from "expo-audio";

interface SheelohaData {
  taroukUrl: string;
  taroukDuration: number;
  clapUrl: string;
  finalClapUrl: string;
}

export function useSheelohaPlayer() {
  const isPlayingRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const playersRef = useRef<AudioPlayer[]>([]);
  const dataRef = useRef<SheelohaData | null>(null);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * إنشاء مشغل صوت وإضافته للقائمة
   */
  const makePlayer = useCallback((url: string, volume: number): AudioPlayer | null => {
    try {
      const p = createAudioPlayer(url);
      p.volume = volume;
      playersRef.current.push(p);
      return p;
    } catch (e) {
      console.error("[Sheeloha] makePlayer failed:", e);
      return null;
    }
  }, []);

  /**
   * تنظيف جميع المؤقتات والمشغلات
   */
  const cleanup = useCallback(() => {
    // إيقاف جميع المؤقتات
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    // إيقاف وتحرير جميع المشغلات
    for (const p of playersRef.current) {
      try { p.pause(); } catch (_) { /* */ }
      try { p.release(); } catch (_) { /* */ }
    }
    playersRef.current = [];
  }, []);

  /**
   * تشغيل جولة واحدة من الشيلوها (كورس + تصفيق)
   * تُعيد Promise تنتهي بعد مدة الطاروق
   */
  const playOneRound = useCallback(() => {
    const data = dataRef.current;
    if (!data || !isPlayingRef.current) return;

    const { taroukUrl, taroukDuration, clapUrl } = data;
    const roundMs = taroukDuration * 1000;

    console.log("[Sheeloha] Starting round, duration:", taroukDuration, "s");

    // === الكورس: عدة نسخ من الطاروق بتأخيرات وسرعات مختلفة ===
    // النسخة الرئيسية (الأعلى صوتاً)
    const main = makePlayer(taroukUrl, 0.35);
    if (main) main.play();

    // نسخ الكورس بتأخيرات بسيطة
    const chorusVoices = [
      { delay: 30,  volume: 0.20, rate: 1.015 },
      { delay: 60,  volume: 0.18, rate: 0.985 },
      { delay: 90,  volume: 0.15, rate: 1.03  },
      { delay: 45,  volume: 0.12, rate: 0.97  },
    ];

    for (const v of chorusVoices) {
      const t = setTimeout(() => {
        if (!isPlayingRef.current) return;
        const p = makePlayer(taroukUrl, v.volume);
        if (p) {
          try { p.playbackRate = v.rate; } catch (_) { /* بعض المنصات لا تدعم */ }
          p.play();
        }
      }, v.delay);
      timersRef.current.push(t);
    }

    // === التصفيق الإيقاعي كل 0.96 ثانية ===
    const CLAP_INTERVAL = 960; // 0.96 ثانية
    let clapElapsed = 0;

    const scheduleClap = () => {
      if (!isPlayingRef.current || clapElapsed >= roundMs) return;
      const cp = makePlayer(clapUrl, 0.35);
      if (cp) cp.play();
      clapElapsed += CLAP_INTERVAL;
      const ct = setTimeout(scheduleClap, CLAP_INTERVAL);
      timersRef.current.push(ct);
    };
    // أول تصفيقة بعد 0.96 ثانية (ليس فوراً)
    const firstClapTimer = setTimeout(scheduleClap, CLAP_INTERVAL);
    timersRef.current.push(firstClapTimer);

    // === بعد انتهاء مدة الطاروق: ابدأ جولة جديدة ===
    loopTimerRef.current = setTimeout(() => {
      if (!isPlayingRef.current) return;
      // تنظيف المشغلات القديمة لتوفير الذاكرة (لكن لا نوقف التشغيل)
      // نحتفظ فقط بالمشغلات الأخيرة
      const oldPlayers = playersRef.current.splice(0, playersRef.current.length);
      for (const op of oldPlayers) {
        try { op.pause(); } catch (_) { /* */ }
        try { op.release(); } catch (_) { /* */ }
      }
      // ابدأ جولة جديدة
      playOneRound();
    }, roundMs + 200); // فاصل 200ms بين الجولات
  }, [makePlayer]);

  /**
   * تشغيل الشيلوها - تبدأ فوراً وتتكرر حتى خلوها
   */
  const play = useCallback(async (data: SheelohaData) => {
    // إيقاف أي شيلوها سابقة
    cleanup();
    
    // ضبط audio mode
    try {
      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
    } catch (_) { /* */ }

    isPlayingRef.current = true;
    dataRef.current = data;

    console.log("[Sheeloha] Starting - tarouk:", data.taroukDuration, "s, clap interval: 0.96s");
    
    // ابدأ أول جولة فوراً
    playOneRound();
  }, [cleanup, playOneRound]);

  /**
   * إيقاف الشيلوها + تشغيل التصفيق الختامي
   */
  const stop = useCallback(() => {
    if (!isPlayingRef.current && playersRef.current.length === 0) {
      // لا شيء يعمل
      return;
    }
    
    console.log("[Sheeloha] Stopping (khalooha)");
    isPlayingRef.current = false;
    
    const finalClapUrl = dataRef.current?.finalClapUrl;
    
    // تنظيف كل شيء
    cleanup();
    
    // تشغيل التصفيق الختامي مرة واحدة بمستوى 25%
    if (finalClapUrl) {
      try {
        const finalPlayer = createAudioPlayer(finalClapUrl);
        finalPlayer.volume = 0.25;
        finalPlayer.play();
        console.log("[Sheeloha] Playing final clap at 25%");
        // تحرير بعد 10 ثوان (مدة كافية للتصفيق الختامي)
        setTimeout(() => {
          try { finalPlayer.release(); } catch (_) { /* */ }
        }, 10000);
      } catch (e) {
        console.error("[Sheeloha] Failed to play final clap:", e);
      }
    }
    
    dataRef.current = null;
  }, [cleanup]);

  return {
    play,
    stop,
    isPlaying: isPlayingRef.current,
  };
}
