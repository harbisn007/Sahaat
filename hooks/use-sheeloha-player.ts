/**
 * Sheeloha Player - تشغيل محلي بدون خادم
 *
 * صوت الصفوف: 7 نسخ بسرعات مختلفة قليلاً مع pitch correction
 * التصفيق: ملف محلي يتكرر كل 0.96 ثانية
 * الـ loop: 0.15 ثانية صمت بين كل تكرار للطاروق
 */

import { useRef, useCallback, useState } from "react";
import * as ExpoAudio from "expo-audio";

const { createAudioPlayer, AudioModule } = ExpoAudio;
type AudioPlayer = ExpoAudio.AudioPlayer;

const CLAP_ASSET = require("@/assets/sounds/single-clap-short.mp3");
const CLAP_INTERVAL = 960; // ms بين كل تصفيقة
const LOOP_GAP = 150;      // ms صمت بين كل تكرار

// 7 أصوات ثابتة بجرس مختلف
const CROWD_FIXED = [
  { delay: 0,  volume: 0.50, rate: 1.10 }, // صوت 1
  { delay: 0,  volume: 0.40, rate: 1.07 }, // صوت 2
  { delay: 0,  volume: 0.30, rate: 1.06 }, // صوت 3
  { delay: 0,  volume: 0.45, rate: 1.10 }, // صوت 4
  { delay: 0,  volume: 0.38, rate: 1.08 }, // صوت 5
  { delay: 0,  volume: 0.38, rate: 1.05 }, // صوت 6
  { delay: 0,  volume: 0.48, rate: 1.09 }, // صوت 7
];

interface SheelohaData {
  taroukUrl: string;
  taroukDuration: number;
  sheelohaUrl?: string;
}

export function useSheelohaPlayer() {
  const [isPlayingState, setIsPlayingState] = useState(false);
  const isPlayingRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const playersRef = useRef<AudioPlayer[]>([]);

  const cleanup = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlayingState(false);
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

  const playCrowd = useCallback((taroukUrl: string, taroukDuration: number) => {
    CROWD_FIXED.forEach(({ delay, volume, rate }) => {
      const t = setTimeout(() => {
        if (!isPlayingRef.current) return;
        try {
          const player = createAudioPlayer(taroukUrl);
          player.volume = volume;
          player.setPlaybackRate(rate);
          player.play();
          playersRef.current.push(player);
          setTimeout(() => {
            try { player.release(); } catch (_) {}
            playersRef.current = playersRef.current.filter(p => p !== player);
          }, (taroukDuration + 2) * 1000);
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

    console.log("[SheelohaPlayer] play:", taroukUrl);
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

    // preload: حمّل الصوت مرة واحدة وانتظر جاهزيته
    await new Promise<void>((resolve) => {
      try {
        const preloader = createAudioPlayer(taroukUrl);
        let resolved = false;

        const done = () => {
          if (resolved) return;
          resolved = true;
          try { preloader.release(); } catch (_) {}
          resolve();
        };

        // انتظر حتى يكون الصوت جاهزاً
        const check = setInterval(() => {
          if (preloader.duration && preloader.duration > 0) {
            clearInterval(check);
            done();
          }
        }, 50);

        // timeout قصير — لا تنتظر أكثر من 2 ثانية
        setTimeout(() => {
          clearInterval(check);
          done();
        }, 2000);

      } catch (_) {
        resolve();
      }
    });

    // إذا أُوقف أثناء التحميل
    if (!isPlayingRef.current) return;

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
      } catch (_) {}
    };

    playClap();
    const clapInterval = setInterval(playClap, CLAP_INTERVAL);
    intervalsRef.current.push(clapInterval);

    // 2. صوت الصفوف في loop
    const loopDuration = (taroukDuration * 1000) + LOOP_GAP;
    const startLoop = () => {
      if (!isPlayingRef.current) return;
      playCrowd(taroukUrl, taroukDuration);
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
