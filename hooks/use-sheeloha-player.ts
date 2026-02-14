/**
 * Sheeloha Player Hook
 * 
 * بعد انتهاء تشغيل الطاروق:
 * - تشغيل الطاروق بمستوى 35% (نسخة واحدة فقط - بسيط وموثوق)
 * - تصفيق إيقاعي كل 0.96 ثانية بمستوى 35%
 * - تكرار لا نهائي حتى يضغط أحد "خلوها"
 * - عند خلوها: إيقاف فوري + تصفيق ختامي مرة واحدة بمستوى 25%
 * 
 * مبسّط للعمل على الجوال: مشغّلان فقط (طاروق + تصفيق)
 * بدلاً من إنشاء عشرات المشغلات التي تفشل على Android/iOS
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
  const taroukPlayerRef = useRef<AudioPlayer | null>(null);
  const clapPlayerRef = useRef<AudioPlayer | null>(null);
  const dataRef = useRef<SheelohaData | null>(null);
  const clapTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * تنظيف كل شيء
   */
  const cleanup = useCallback(() => {
    // إيقاف المؤقتات
    if (clapTimerRef.current) {
      clearInterval(clapTimerRef.current);
      clapTimerRef.current = null;
    }
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    // إيقاف وتحرير المشغلات
    if (taroukPlayerRef.current) {
      try { taroukPlayerRef.current.pause(); } catch (_) { /* */ }
      try { taroukPlayerRef.current.release(); } catch (_) { /* */ }
      taroukPlayerRef.current = null;
    }
    if (clapPlayerRef.current) {
      try { clapPlayerRef.current.pause(); } catch (_) { /* */ }
      try { clapPlayerRef.current.release(); } catch (_) { /* */ }
      clapPlayerRef.current = null;
    }
  }, []);

  /**
   * تشغيل جولة واحدة: طاروق واحد + تصفيق متكرر
   */
  const playOneRound = useCallback(() => {
    if (!isPlayingRef.current || !dataRef.current) return;

    const { taroukUrl, taroukDuration, clapUrl } = dataRef.current;
    const roundMs = taroukDuration * 1000;

    console.log("[Sheeloha] Round start, duration:", taroukDuration, "s");

    // تنظيف المشغلات السابقة (لكن لا نوقف isPlaying)
    if (taroukPlayerRef.current) {
      try { taroukPlayerRef.current.pause(); } catch (_) { /* */ }
      try { taroukPlayerRef.current.release(); } catch (_) { /* */ }
    }
    if (clapPlayerRef.current) {
      try { clapPlayerRef.current.pause(); } catch (_) { /* */ }
      try { clapPlayerRef.current.release(); } catch (_) { /* */ }
    }
    if (clapTimerRef.current) {
      clearInterval(clapTimerRef.current);
      clapTimerRef.current = null;
    }

    // === مشغل واحد للطاروق بمستوى 35% ===
    try {
      const tp = createAudioPlayer(taroukUrl);
      tp.volume = 0.35;
      taroukPlayerRef.current = tp;
      tp.play();
      console.log("[Sheeloha] Tarouk playing at 35%");
    } catch (e) {
      console.error("[Sheeloha] Failed to create tarouk player:", e);
    }

    // === تصفيق إيقاعي: كل 0.96 ثانية ===
    // ننشئ مشغل تصفيق جديد كل مرة (لأن seek(0) غير موثوق على كل المنصات)
    const CLAP_INTERVAL = 960;
    
    const playClap = () => {
      if (!isPlayingRef.current) return;
      try {
        // تحرير المشغل السابق
        if (clapPlayerRef.current) {
          try { clapPlayerRef.current.release(); } catch (_) { /* */ }
        }
        const cp = createAudioPlayer(clapUrl);
        cp.volume = 0.35;
        clapPlayerRef.current = cp;
        cp.play();
      } catch (e) {
        console.error("[Sheeloha] Clap error:", e);
      }
    };

    // أول تصفيقة بعد 0.96 ثانية
    clapTimerRef.current = setInterval(playClap, CLAP_INTERVAL);

    // === بعد انتهاء مدة الطاروق: ابدأ جولة جديدة ===
    loopTimerRef.current = setTimeout(() => {
      if (!isPlayingRef.current) return;
      playOneRound();
    }, roundMs + 200);
  }, []);

  /**
   * تشغيل الشيلوها
   */
  const play = useCallback(async (data: SheelohaData) => {
    console.log("[Sheeloha] play() called, tarouk duration:", data.taroukDuration, "s");
    
    // إيقاف أي شيلوها سابقة
    isPlayingRef.current = false;
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

    // ابدأ أول جولة
    playOneRound();
  }, [cleanup, playOneRound]);

  /**
   * إيقاف الشيلوها + تصفيق ختامي
   */
  const stop = useCallback(() => {
    if (!isPlayingRef.current && !taroukPlayerRef.current && !clapPlayerRef.current) {
      return;
    }

    console.log("[Sheeloha] Stopping (khalooha)");
    isPlayingRef.current = false;

    const finalClapUrl = dataRef.current?.finalClapUrl;

    cleanup();

    // تصفيق ختامي مرة واحدة بمستوى 25%
    if (finalClapUrl) {
      try {
        const fp = createAudioPlayer(finalClapUrl);
        fp.volume = 0.25;
        fp.play();
        console.log("[Sheeloha] Final clap at 25%");
        setTimeout(() => { try { fp.release(); } catch (_) { /* */ } }, 10000);
      } catch (e) {
        console.error("[Sheeloha] Final clap error:", e);
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
