/**
 * Sheeloha Player Hook
 * 
 * بعد انتهاء تشغيل الطاروق:
 * - تشغيل الطاروق بمستوى 35%
 * - تصفيق إيقاعي كل 0.96 ثانية بمستوى 35%
 * - تكرار لا نهائي حتى يضغط أحد "خلوها"
 * - عند خلوها: إيقاف فوري + تصفيق ختامي مرة واحدة بمستوى 25%
 * 
 * يدعم الويب (HTML5 Audio) والجوال (expo-audio مع انتظار التحميل)
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

// دالة مساعدة: إنشاء مشغل على الجوال مع انتظار التحميل
function createNativePlayerAsync(url: string, volume: number): Promise<AudioPlayer | null> {
  return new Promise((resolve) => {
    try {
      const player = createAudioPlayer(url);
      player.volume = volume;

      // انتظار التحميل عبر playbackStatusUpdate
      const onStatus = (status: { isLoaded: boolean }) => {
        if (status.isLoaded) {
          player.removeListener("playbackStatusUpdate", onStatus);
          resolve(player);
        }
      };
      player.addListener("playbackStatusUpdate", onStatus);

      // timeout: إذا لم يتحمل خلال 3 ثوان، شغّله على أي حال
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

  // Native players
  const nativeTaroukRef = useRef<AudioPlayer | null>(null);
  const nativeClapRef = useRef<AudioPlayer | null>(null);

  // Web players
  const webTaroukRef = useRef<HTMLAudioElement | null>(null);
  const webClapRef = useRef<HTMLAudioElement | null>(null);

  const isWeb = Platform.OS === "web";

  /**
   * تنظيف كل شيء
   */
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
      if (webTaroukRef.current) {
        try { webTaroukRef.current.pause(); webTaroukRef.current.src = ""; } catch (_) {}
        webTaroukRef.current = null;
      }
      if (webClapRef.current) {
        try { webClapRef.current.pause(); webClapRef.current.src = ""; } catch (_) {}
        webClapRef.current = null;
      }
    } else {
      if (nativeTaroukRef.current) {
        try { nativeTaroukRef.current.pause(); } catch (_) {}
        try { nativeTaroukRef.current.release(); } catch (_) {}
        nativeTaroukRef.current = null;
      }
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
    const roundMs = taroukDuration * 1000;

    console.log("[Sheeloha] Round start, duration:", taroukDuration, "s, platform:", Platform.OS);

    // تنظيف المشغلات السابقة (بدون إيقاف isPlaying)
    if (clapTimerRef.current) {
      clearInterval(clapTimerRef.current);
      clapTimerRef.current = null;
    }
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }

    if (isWeb) {
      // ===== الويب: HTML5 Audio =====
      // تنظيف السابق
      if (webTaroukRef.current) {
        try { webTaroukRef.current.pause(); webTaroukRef.current.src = ""; } catch (_) {}
      }

      // طاروق
      const taroukAudio = new Audio(taroukUrl);
      taroukAudio.volume = 0.35;
      webTaroukRef.current = taroukAudio;
      try { await taroukAudio.play(); } catch (e) { console.error("[Sheeloha] Web tarouk play error:", e); }
      console.log("[Sheeloha] Web tarouk playing");

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
      // ===== الجوال: expo-audio مع انتظار التحميل =====
      // تنظيف السابق
      if (nativeTaroukRef.current) {
        try { nativeTaroukRef.current.pause(); } catch (_) {}
        try { nativeTaroukRef.current.release(); } catch (_) {}
      }

      // طاروق: إنشاء + انتظار التحميل + تشغيل
      const tp = await createNativePlayerAsync(taroukUrl, 0.35);
      if (!isPlayingRef.current) {
        // تم الإيقاف أثناء الانتظار
        if (tp) { try { tp.release(); } catch (_) {} }
        return;
      }
      nativeTaroukRef.current = tp;
      if (tp) {
        tp.play();
        console.log("[Sheeloha] Native tarouk playing");
      }

      // تصفيق كل 0.96 ثانية
      const CLAP_INTERVAL = 960;
      const playNativeClap = async () => {
        if (!isPlayingRef.current) return;
        try {
          // تحرير السابق
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

    // بعد انتهاء مدة الطاروق: ابدأ جولة جديدة
    loopTimerRef.current = setTimeout(() => {
      if (!isPlayingRef.current) return;
      playOneRound();
    }, roundMs + 200);
  }, [isWeb]);

  /**
   * تشغيل الشيلوها
   */
  const play = useCallback(async (data: SheelohaData) => {
    console.log("[Sheeloha] play() called, duration:", data.taroukDuration, "s, platform:", Platform.OS);

    // إيقاف أي شيلوها سابقة
    isPlayingRef.current = false;
    cleanup();

    // ضبط audio mode على الجوال
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

    // ابدأ أول جولة
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

    // تصفيق ختامي مرة واحدة بمستوى 25%
    if (finalClapUrl) {
      try {
        if (isWeb) {
          const fa = new Audio(finalClapUrl);
          fa.volume = 0.25;
          fa.play().catch(() => {});
          console.log("[Sheeloha] Web final clap at 25%");
        } else {
          const fp = await createNativePlayerAsync(finalClapUrl, 0.25);
          if (fp) {
            fp.play();
            console.log("[Sheeloha] Native final clap at 25%");
            setTimeout(() => { try { fp.release(); } catch (_) {} }, 10000);
          }
        }
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
