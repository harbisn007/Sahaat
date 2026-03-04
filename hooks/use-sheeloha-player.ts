/**
 * Sheeloha Player - تشغيل محلي بدون خادم
 *
 * صوت الصفوف: 4 نسخ بسرعات مختلفة قليلاً مع pitch correction
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

// 4 أصوات مختلفة الجرس — لا أحد منها يشبه الصوت الأصلي
const CROWD = [
  { delay: 0,  volume: 0.65, rate: 0.91 }, // صوت عميق مختلف
  { delay: 8,  volume: 0.60, rate: 0.88 }, // صوت عميق
  { delay: 12, volume: 0.58, rate: 1.15 }, // صوت خفيف
  { delay: 18, volume: 0.55, rate: 0.93 }, // صوت متوسط
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
    CROWD.forEach(({ delay, volume, rate }) => {
      const t = setTimeout(() => {
        if (!isPlayingRef.current) return;
        try {
          const player = createAudioPlayer(taroukUrl);
          player.volume = volume;
          // setPlaybackRate مع pitch correction = يغيّر جرس الصوت بشكل طبيعي
          player.setPlaybackRate(rate, 'medium');
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

    // 1. تصفيق كل 0.96 ثانية
    const playClap = () => {
      if (!isPlayingRef.current) return;
      try {
        const clap = createAudioPlayer(CLAP_ASSET);
        clap.volume = 0.15;
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