/**
 * Sheeloha Player - تشغيل محلي بدون خادم
 *
 * وضعان:
 * 1. isMixed=true  → ملف واحد مدموج من السيرفر (5 أصوات مدمجة) - مشغّل واحد فقط
 * 2. isMixed=false → 5 نسخ محلية بسرعات مختلفة (fallback)
 * التصفيق: ملف محلي يتكرر كل 0.96 ثانية في كلا الوضعين
 */

import { useRef, useCallback, useState } from "react";
import * as ExpoAudio from "expo-audio";

const { createAudioPlayer, AudioModule } = ExpoAudio;
type AudioPlayer = ExpoAudio.AudioPlayer;

const CLAP_ASSET = require("@/assets/sounds/single-clap-short.mp3");
const CLAP_INTERVAL = 960; // ms بين كل تصفيقة
const LOOP_GAP = 150;      // ms صمت بين كل تكرار

// 5 أصوات ثابتة بجرس مختلف (fallback فقط)
const CROWD_FIXED = [
  { volume: 0.40, rate: 1.07 },
  { volume: 0.30, rate: 1.06 },
  { volume: 0.38, rate: 1.08 },
  { volume: 0.38, rate: 1.05 },
  { volume: 0.48, rate: 1.09 },
];

interface SheelohaData {
  taroukUrl: string;
  taroukDuration: number;
  sheelohaUrl?: string;
  isMixed?: boolean; // true = ملف مدموج من السيرفر
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

  // وضع fallback: 5 مشغّلات بسرعات مختلفة
  const playCrowd = useCallback((taroukUrl: string, taroukDuration: number) => {
    CROWD_FIXED.forEach(({ volume, rate }) => {
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
    });
  }, []);

  // وضع mixed: مشغّل واحد للملف المدموج
  const playMixed = useCallback((mixedUrl: string, taroukDuration: number) => {
    if (!isPlayingRef.current) return;
    try {
      const player = createAudioPlayer(mixedUrl);
      player.volume = 1.0;
      player.play();
      playersRef.current.push(player);
      setTimeout(() => {
        try { player.release(); } catch (_) {}
        playersRef.current = playersRef.current.filter(p => p !== player);
      }, (taroukDuration + 2) * 1000);
    } catch (e) {
      console.error("[SheelohaPlayer] mixed error:", e);
    }
  }, []);

  const play = useCallback(async (data: SheelohaData) => {
    const taroukUrl = data.taroukUrl || "";
    const taroukDuration = data.taroukDuration || 3;
    const isMixed = data.isMixed === true;

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
      if (isMixed) {
        // وضع mixed: ملف واحد مدموج
        playMixed(taroukUrl, taroukDuration);
      } else {
        // وضع fallback: 5 مشغّلات
        playCrowd(taroukUrl, taroukDuration);
      }
      const t = setTimeout(startLoop, loopDuration);
      timersRef.current.push(t);
    };
    startLoop();

  }, [cleanup, playCrowd, playMixed]);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return { play, stop, isPlaying: isPlayingState };
}
