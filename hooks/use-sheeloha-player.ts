/**
 * Sheeloha Player Hook - النسخة المبسطة
 * 
 * يشغل الطاروق الأصلي + تصفيق متكرر (0.96s) من ملفات محلية
 * - الطاروق: يشتغل بنفس الصوت الأصلي (بدون تأثيرات معقدة)
 * - التصفيق: يتكرر كل 0.96 ثانية
 * - يستمر التكرار حتى الضغط على "خلوها"
 * - عند "خلوها": تصفيق نهائي فوري
 */

import { useRef, useCallback, useState } from "react";
import { createAudioPlayer, AudioModule, AudioPlayer } from "expo-audio";
import { Platform, Alert } from "react-native";
import { Asset } from "expo-asset";

interface SheelohaData {
  taroukUrl: string;
  taroukDuration: number;
}

const CLAP_VOLUME = 0.4;
const CLAP_INTERVAL = 960; // 0.96 ثانية
const FINAL_CLAP_VOLUME = 0.3;

export function useSheelohaPlayer() {
  const isPlayingRef = useRef(false);
  const [isPlayingState, setIsPlayingState] = useState(false);
  const dataRef = useRef<SheelohaData | null>(null);
  const clapTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const taroukPlayerRef = useRef<AudioPlayer | null>(null);
  const clapPlayerRef = useRef<AudioPlayer | null>(null);

  const isWeb = Platform.OS === "web";

  // تحميل ملفات الأصوات المحلية
  const getClapUrl = useCallback(async () => {
    if (isWeb) {
      return require("../assets/sounds/clap.mp3");
    }
    const asset = Asset.fromModule(require("../assets/sounds/clap.mp3"));
    await asset.downloadAsync();
    return asset.localUri || asset.uri;
  }, [isWeb]);

  const getFinalClapUrl = useCallback(async () => {
    if (isWeb) {
      return require("../assets/sounds/final-clap.mp3");
    }
    const asset = Asset.fromModule(require("../assets/sounds/final-clap.mp3"));
    await asset.downloadAsync();
    return asset.localUri || asset.uri;
  }, [isWeb]);

  const cleanup = useCallback(() => {
    if (clapTimerRef.current) {
      clearInterval(clapTimerRef.current);
      clapTimerRef.current = null;
    }
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }

    if (taroukPlayerRef.current) {
      try { taroukPlayerRef.current.pause(); } catch (_) {}
      try { taroukPlayerRef.current.release(); } catch (_) {}
      taroukPlayerRef.current = null;
    }
    if (clapPlayerRef.current) {
      try { clapPlayerRef.current.pause(); } catch (_) {}
      try { clapPlayerRef.current.release(); } catch (_) {}
      clapPlayerRef.current = null;
    }
  }, []);

  const playOneRound = useCallback(async () => {
    if (!isPlayingRef.current || !dataRef.current) return;

    const { taroukUrl, taroukDuration } = dataRef.current;

    // تنظيف المشغلات السابقة
    if (clapTimerRef.current) { clearInterval(clapTimerRef.current); clapTimerRef.current = null; }
    if (loopTimerRef.current) { clearTimeout(loopTimerRef.current); loopTimerRef.current = null; }

    if (taroukPlayerRef.current) {
      try { taroukPlayerRef.current.pause(); } catch (_) {}
      try { taroukPlayerRef.current.release(); } catch (_) {}
      taroukPlayerRef.current = null;
    }

    try {
      console.log("[Sheeloha] Starting new round with tarouk:", taroukUrl);
      
      // إنشاء مشغل الطاروق
      const player = createAudioPlayer(taroukUrl);
      taroukPlayerRef.current = player;
      player.volume = 1.0;

      // الاستماع لأحداث الـ player
      player.addListener("playbackStatusUpdate", (status: any) => {
        if (status.isLoaded && !status.playing && status.currentTime > 0) {
          if (status.duration > 0 && status.currentTime >= status.duration - 0.1) {
            console.log("[Sheeloha] Round finished, starting next...");
            if (isPlayingRef.current) {
              loopTimerRef.current = setTimeout(() => {
                if (isPlayingRef.current) playOneRound();
              }, 300);
            }
          }
        }
      });

      // انتظار التحميل
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!isPlayingRef.current || !taroukPlayerRef.current) {
        console.log("[Sheeloha] Cancelled before play");
        return;
      }

      // تشغيل الطاروق
      console.log("[Sheeloha] Playing tarouk...");
      player.play();

      // تشغيل التصفيق المتكرر
      const clapUrl = await getClapUrl();
      clapTimerRef.current = setInterval(async () => {
        if (!isPlayingRef.current) return;
        try {
          // إيقاف التصفيق السابق بدون تحرير
          if (clapPlayerRef.current) {
            try { clapPlayerRef.current.pause(); } catch (_) {}
          }
          const cp = createAudioPlayer(clapUrl);
          clapPlayerRef.current = cp;
          cp.volume = CLAP_VOLUME;
          await new Promise(r => setTimeout(r, 100));
          if (!isPlayingRef.current) {
            return;
          }
          cp.play();
        } catch (e) {
          console.error("[Sheeloha] Clap error:", e);
        }
      }, CLAP_INTERVAL);

    } catch (e) {
      console.error("[Sheeloha] playOneRound error:", e);
      Alert.alert("خطأ", "فشل تشغيل الشيلوها");
    }
  }, [getClapUrl]);

  const play = useCallback(async (data: SheelohaData) => {
    console.log("[Sheeloha] play() called with data:", data);

    isPlayingRef.current = false;
    setIsPlayingState(false);
    cleanup();

    try {
      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
    } catch (_) {}

    isPlayingRef.current = true;
    setIsPlayingState(true);
    dataRef.current = data;

    await playOneRound();
  }, [cleanup, playOneRound]);

  const stop = useCallback(async () => {
    if (!isPlayingRef.current) return;

    console.log("[Sheeloha] Stopping (khalooha)");
    isPlayingRef.current = false;
    setIsPlayingState(false);

    cleanup();

    // تشغيل التصفيق النهائي فوراً
    try {
      const finalClapUrl = await getFinalClapUrl();
      const fp = createAudioPlayer(finalClapUrl);
      fp.volume = FINAL_CLAP_VOLUME;
      await new Promise(r => setTimeout(r, 500));
      fp.play();
      setTimeout(() => { try { fp.release(); } catch (_) {} }, 10000);
    } catch (e) {
      console.error("[Sheeloha] Final clap error:", e);
    }

    dataRef.current = null;
  }, [cleanup, getFinalClapUrl]);

  return {
    play,
    stop,
    isPlaying: isPlayingState,
  };
}
