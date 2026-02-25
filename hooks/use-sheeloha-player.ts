/**
 * Sheeloha Player - تشغيل محلي بدون خادم
 *
 * صوت الصفوف: 4 نسخ من الطاروق بتأخيرات مختلفة (0، 40ms، 90ms، 150ms)
 * التصفيق: ملف محلي يتكرر كل 0.96 ثانية
 * الـ loop: 0.15 ثانية صمت بين كل تكرار للطاروق
 * يتوقف كله عند ضغط خلوها
 */

import { useRef, useCallback, useState } from "react";
import { Platform } from "react-native";
import * as ExpoAudio from "expo-audio";

const { createAudioPlayer, AudioModule } = ExpoAudio;
type AudioPlayer = ExpoAudio.AudioPlayer;

const CLAP_ASSET = require("@/assets/sounds/single-clap-short.mp3");
const CROWD_VOLUME = [0.50, 0.42, 0.38, 0.34]; // مستوى كل نسخة
const CROWD_DELAYS = [0, 40, 90, 150];           // تأخير كل نسخة بالـ ms
const CLAP_INTERVAL = 960;                        // ms بين كل تصفيقة
const LOOP_GAP = 150;                             // ms صمت بين كل تكرار للطاروق

interface SheelohaData {
  taroukUrl: string;
  taroukDuration: number;
  sheelohaUrl?: string; // للتوافق مع الكود القديم
}

export function useSheelohaPlayer() {
  const [isPlayingState, setIsPlayingState] = useState(false);
  const isPlayingRef = useRef(false);

  // مشغلات الأصوات
  const crowdPlayersRef = useRef<AudioPlayer[]>([]);
  const clapPlayerRef = useRef<AudioPlayer | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);

  const cleanup = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlayingState(false);

    // إيقاف كل الـ timers
    timersRef.current.forEach(t => clearTimeout(t));
    timersRef.current = [];
    intervalsRef.current.forEach(i => clearInterval(i));
    intervalsRef.current = [];

    // إيقاف مشغلات الصفوف
    crowdPlayersRef.current.forEach(p => {
      try { p.pause(); } catch (_) {}
      try { p.release(); } catch (_) {}
    });
    crowdPlayersRef.current = [];

    // إيقاف التصفيق
    if (clapPlayerRef.current) {
      try { clapPlayerRef.current.pause(); } catch (_) {}
      try { clapPlayerRef.current.release(); } catch (_) {}
      clapPlayerRef.current = null;
    }
  }, []);

  const playCrowd = useCallback((taroukUrl: string, taroukDuration: number) => {
    // تشغيل 4 نسخ بتأخيرات مختلفة
    CROWD_DELAYS.forEach((delay, i) => {
      const t = setTimeout(() => {
        if (!isPlayingRef.current) return;
        try {
          const player = createAudioPlayer(taroukUrl);
          player.volume = CROWD_VOLUME[i];
          player.play();
          crowdPlayersRef.current.push(player);
          // تحرير بعد انتهاء الصوت
          setTimeout(() => {
            try { player.release(); } catch (_) {}
            crowdPlayersRef.current = crowdPlayersRef.current.filter(p => p !== player);
          }, (taroukDuration + 1) * 1000);
        } catch (e) {
          console.error("[SheelohaPlayer] crowd error:", e);
        }
      }, delay);
      timersRef.current.push(t);
    });
  }, []);

  const play = useCallback(async (data: SheelohaData) => {
    const taroukUrl = data.taroukUrl || data.sheelohaUrl || "";
    const taroukDuration = data.taroukDuration || 3;

    console.log("[SheelohaPlayer] play:", taroukUrl, "duration:", taroukDuration);
    cleanup();

    if (!taroukUrl) return;

    isPlayingRef.current = true;
    setIsPlayingState(true);

    try {
      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
    } catch (_) {}

    // 1. تشغيل التصفيق المتكرر كل 0.96 ثانية
    const playClap = () => {
      if (!isPlayingRef.current) return;
      try {
        const clap = createAudioPlayer(CLAP_ASSET);
        clap.volume = 0.35;
        clap.play();
        clapPlayerRef.current = clap;
        setTimeout(() => {
          try { clap.release(); } catch (_) {}
        }, 1000);
      } catch (e) {
        console.error("[SheelohaPlayer] clap error:", e);
      }
    };

    playClap(); // أول تصفيقة فوراً
    const clapInterval = setInterval(playClap, CLAP_INTERVAL);
    intervalsRef.current.push(clapInterval);

    // 2. تشغيل صوت الصفوف في loop مع 0.15s فاصل
    const loopDuration = (taroukDuration * 1000) + LOOP_GAP;

    const startLoop = () => {
      if (!isPlayingRef.current) return;
      playCrowd(taroukUrl, taroukDuration);
      // إعادة التشغيل بعد انتهاء الطاروق + الفاصل
      const t = setTimeout(startLoop, loopDuration);
      timersRef.current.push(t);
    };

    startLoop();

  }, [cleanup, playCrowd]);

  const stop = useCallback(() => {
    console.log("[SheelohaPlayer] stop()");
    cleanup();
  }, [cleanup]);

  return { play, stop, isPlaying: isPlayingState };
}