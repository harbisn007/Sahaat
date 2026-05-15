/**
 * Sheeloha Player - تشغيل محلي بدون خادم
 *
 * صوت الصفوف: 7 نسخ بسرعات مختلفة قليلاً مع pitch correction
 * التصفيق: ملف محلي يتكرر كل 0.96 ثانية
 * الـ loop: 0.15 ثانية صمت بين كل تكرار للطاروق
 *
 * Fallback Logic:
   * - إذا فشل تحميل الصوت → عرض خطأ واضح
   * - إذا تأخر التحميل → إعادة محاولة تلقائية
   *
 * تحسينات الأداء:
   * - تشغيل الأصوات الخمسة متزامناً (بدون setTimeout)
   * - تزامن كامل: 0ms تأخير بين الأصوات
   * - تشغيل فوري وآني لجميع الأصوات الخمسة
 */

import { useRef, useCallback, useState } from "react";
import * as ExpoAudio from "expo-audio";

const { createAudioPlayer, AudioModule } = ExpoAudio;
type AudioPlayer = ExpoAudio.AudioPlayer;

const CLAP_ASSET = require("@/assets/sounds/single-clap-short.mp3");
const CLAP_INTERVAL = 960; // ms بين كل تصفيقة
const LOOP_GAP = 150;      // ms صمت بين كل تكرار

// 5 أصوات ثابتة بجرس مختلف - بدون delay
const CROWD_FIXED = [
  { delay: 0,  volume: 0.40, rate: 1.07 }, // صوت 2
  { delay: 0,  volume: 0.30, rate: 1.06 }, // صوت 3
  { delay: 0,  volume: 0.38, rate: 1.08 }, // صوت 5
  { delay: 0,  volume: 0.38, rate: 1.05 }, // صوت 6
  { delay: 0,  volume: 0.48, rate: 1.09 }, // صوت 7
];

interface SheelohaData {
  taroukUrl: string;
  taroukDuration: number;
  sheelohaUrl?: string;
}

interface LoadResult {
  success: boolean;
  duration?: number;
  error?: string;
  timedOut?: boolean;
}

/**
 * Helper: استخدام setImmediate أو fallback إلى setTimeout
 * setImmediate ينفذ بعد I/O events مباشرة (أسرع من setTimeout)
 */
const scheduleImmediate = (callback: () => void) => {
  if (typeof setImmediate !== "undefined") {
    setImmediate(callback);
  } else {
    setTimeout(callback, 0);
  }
};

export function useSheelohaPlayer() {
  const [isPlayingState, setIsPlayingState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPlayingRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const playersRef = useRef<AudioPlayer[]>([]);
  const loadAttemptsRef = useRef(0);
  const playingLockRef = useRef(false); // منع race condition

  const cleanup = useCallback(() => {
    isPlayingRef.current = false;
    playingLockRef.current = false;
    setIsPlayingState(false);
    setError(null);
    timersRef.current.forEach(t => clearTimeout(t));
    timersRef.current = [];
    intervalsRef.current.forEach(i => clearInterval(i));
    intervalsRef.current = [];
    playersRef.current.forEach(p => {
      try { p.pause(); } catch (_) {}
      try { p.release(); } catch (_) {}
    });
    playersRef.current = [];
  }, []);

  /**
   * محاولة تحميل الصوت مع timeout وإعادة محاولة
   */
  const loadAudioWithRetry = useCallback(async (
    url: string,
    maxAttempts: number = 2
  ): Promise<LoadResult> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[SheelohaPlayer] Loading audio (attempt ${attempt}/${maxAttempts}):`, url);
        
        const preloader = createAudioPlayer(url);
        let resolved = false;
        let duration = 0;
        let timedOut = false;

        const done = () => {
          if (resolved) return;
          resolved = true;
          try { preloader.release(); } catch (_) {}
        };

        // انتظر حتى يكون الصوت جاهزاً
        const check = setInterval(() => {
          if (preloader.duration && preloader.duration > 0) {
            duration = preloader.duration;
            clearInterval(check);
            done();
          }
        }, 50);

        // timeout: 3 ثوانٍ (أطول من السابق 2 ثانية)
        const timeoutHandle = setTimeout(() => {
          clearInterval(check);
          timedOut = true;
          done();
        }, 3000);

        // انتظر النتيجة
        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            if (resolved) {
              clearInterval(checkInterval);
              clearTimeout(timeoutHandle);
              resolve();
            }
          }, 50);
        });

        if (duration > 0) {
          console.log(`[SheelohaPlayer] Audio loaded successfully: ${duration}s`);
          return { success: true, duration };
        }

        if (timedOut) {
          console.warn(`[SheelohaPlayer] Audio load timed out (attempt ${attempt}/${maxAttempts})`);
          if (attempt < maxAttempts) {
            // انتظر قليلاً قبل إعادة المحاولة
            await new Promise(r => setTimeout(r, 500));
            continue;
          }
          return {
            success: false,
            timedOut: true,
            error: "تأخر تحميل الصوت - قد تكون هناك مشكلة في الاتصال"
          };
        }

        return {
          success: false,
          error: `فشل تحميل الصوت (محاولة ${attempt}/${maxAttempts})`
        };

      } catch (e) {
        console.error(`[SheelohaPlayer] Load error (attempt ${attempt}/${maxAttempts}):`, e);
        
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }

        return {
          success: false,
          error: `خطأ في تحميل الصوت: ${e instanceof Error ? e.message : String(e)}`
        };
      }
    }

    return {
      success: false,
      error: "فشل تحميل الصوت بعد عدة محاولات"
    };
  }, []);

  /**
   * تشغيل الأصوات الخمسة بدون تأخير - متزامن تماماً
   * حذف setTimeout لتحقيق تزامن كامل (0ms تأخير بين الأصوات)
   */
  const playCrowd = useCallback((taroukUrl: string, taroukDuration: number) => {
    CROWD_FIXED.forEach(({ volume, rate }) => {
      if (!isPlayingRef.current) return;
      
      try {
        const player = createAudioPlayer(taroukUrl);
        player.volume = volume;
        player.setPlaybackRate(rate);
        player.play();
        playersRef.current.push(player);
        
        console.log(`[SheelohaPlayer] Playing crowd voice: volume=${volume}, rate=${rate}`);
        
        // تحرير الموارد بعد انتهاء الصوت
        const cleanupTimer = setTimeout(() => {
          try { player.pause(); } catch (_) {}
          try { player.release(); } catch (_) {}
          playersRef.current = playersRef.current.filter(p => p !== player);
        }, (taroukDuration + 2) * 1000);
        timersRef.current.push(cleanupTimer);
      } catch (e) {
        console.error("[SheelohaPlayer] crowd error:", e);
      }
    });
  }, []);

  const play = useCallback(async (data: SheelohaData) => {
    // منع race condition من Socket.io
    if (playingLockRef.current) {
      console.warn("[SheelohaPlayer] Already playing, ignoring duplicate call");
      return;
    }
    playingLockRef.current = true;

    const taroukUrl = data.taroukUrl || data.sheelohaUrl || "";
    const taroukDuration = data.taroukDuration || 3;

    console.log("[SheelohaPlayer] play:", taroukUrl);
    cleanup();
    
    if (!taroukUrl) {
      setError("لا يوجد صوت متاح للتشغيل");
      playingLockRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    setIsPlayingState(true);
    loadAttemptsRef.current = 0;

    try {
      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
    } catch (_) {}

    // محاولة تحميل الصوت مع retry
    const loadResult = await loadAudioWithRetry(taroukUrl, 2);

    if (!loadResult.success) {
      console.error("[SheelohaPlayer] Failed to load audio:", loadResult.error);
      setError(loadResult.error || "فشل تحميل الصوت");
      cleanup();
      playingLockRef.current = false;
      return;
    }

    // إذا أُوقف أثناء التحميل
    if (!isPlayingRef.current) {
      cleanup();
      playingLockRef.current = false;
      return;
    }

    // استخدم المدة المحملة أو القيمة الافتراضية
    const finalDuration = loadResult.duration || taroukDuration;

    console.log(`[SheelohaPlayer] Starting playback with duration: ${finalDuration}s`);

    // 1. تصفيق كل 0.96 ثانية
    const playClap = () => {
      if (!isPlayingRef.current) return;
      try {
        const clap = createAudioPlayer(CLAP_ASSET);
        clap.volume = 0.25;
        clap.play();
        playersRef.current.push(clap);
        setTimeout(() => {
          try { clap.release(); } catch (_) {}
          playersRef.current = playersRef.current.filter(p => p !== clap);
        }, 1000);
      } catch (e) {
        console.error("[SheelohaPlayer] clap error:", e);
      }
    };

    playClap();
    const clapInterval = setInterval(playClap, CLAP_INTERVAL);
    intervalsRef.current.push(clapInterval);

    // 2. صوت الصفوف في loop - تشغيل فوري
    const loopDuration = (finalDuration * 1000) + LOOP_GAP;
    const startLoop = () => {
      if (!isPlayingRef.current) return;
      playCrowd(taroukUrl, finalDuration);
      const t = setTimeout(startLoop, loopDuration);
      timersRef.current.push(t);
    };
    
    // تشغيل فوري للأصوات الخمسة (بدون delay)
    startLoop();

  }, [cleanup, playCrowd, loadAudioWithRetry]);

  const stop = useCallback(() => {
    console.log("[SheelohaPlayer] stop()");
    playingLockRef.current = false;
    cleanup();
  }, [cleanup]);

  return { play, stop, isPlaying: isPlayingState, error };
}
