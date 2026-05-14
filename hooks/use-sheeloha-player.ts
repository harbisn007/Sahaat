/**
 * Sheeloha Player - تشغيل محلي بدون خادم
 *
 * صوت الصفوف: 5 نسخ بسرعات مختلفة قليلاً
 * التصفيق: ملف محلي يتكرر كل 0.96 ثانية
 * الـ loop: 0.15 ثانية صمت بين كل تكرار للطاروق
 *
 * الفكرة: عند إرسال الطاروق → prepare() تُجهّز الـ 5 مشغّلات مسبقاً
 *         عند ضغط شيلوها → play() تشغّلها فوراً بدون preload
 */

import { useRef, useCallback, useState } from "react";
import * as ExpoAudio from "expo-audio";

const { createAudioPlayer, AudioModule } = ExpoAudio;
type AudioPlayer = ExpoAudio.AudioPlayer;

const CLAP_ASSET = require("@/assets/sounds/single-clap-short.mp3");
const CLAP_INTERVAL = 960; // ms بين كل تصفيقة
const LOOP_GAP = 150;      // ms صمت بين كل تكرار

// 5 أصوات ثابتة بجرس مختلف
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
}

interface PreparedCrowd {
  players: AudioPlayer[];
  taroukUrl: string;
  taroukDuration: number;
}

export function useSheelohaPlayer() {
  const [isPlayingState, setIsPlayingState] = useState(false);
  const isPlayingRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const playersRef = useRef<AudioPlayer[]>([]);
  // المشغّلات المجهّزة مسبقاً عند إرسال الطاروق
  const preparedRef = useRef<PreparedCrowd | null>(null);

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

  // تجهيز الـ 5 مشغّلات مسبقاً — يُستدعى عند إرسال الطاروق
  const prepare = useCallback((taroukUrl: string, taroukDuration: number) => {
    // حرّر المجهّزات القديمة إن وجدت
    if (preparedRef.current) {
      preparedRef.current.players.forEach(p => {
        try { p.pause(); } catch (_) {}
        try { p.release(); } catch (_) {}
      });
      preparedRef.current = null;
    }
    if (!taroukUrl) return;
    try {
      const players = CROWD_FIXED.map(({ volume, rate }) => {
        const player = createAudioPlayer(taroukUrl);
        player.volume = volume;
        player.setPlaybackRate(rate);
        return player;
      });
      preparedRef.current = { players, taroukUrl, taroukDuration };
    } catch (e) {
      console.error("[SheelohaPlayer] prepare error:", e);
    }
  }, []);

  // تشغيل الـ 5 مشغّلات المجهّزة في loop
  const playCrowdPrepared = useCallback((taroukUrl: string, taroukDuration: number, isFirstLoop: boolean) => {
    const prepared = isFirstLoop ? preparedRef.current : null;

    if (prepared && prepared.taroukUrl === taroukUrl && isFirstLoop) {
      // الدورة الأولى: استخدم المشغّلات الجاهزة
      console.log("[Sheeloha] Using PREPARED players, count:", prepared.players.length);
      prepared.players.forEach((player, index) => {
        if (!isPlayingRef.current) return;
        try {
          console.log(`[Sheeloha] Playing prepared player ${index + 1}`);
          player.currentTime = 0;
          player.play();
          playersRef.current.push(player);
          setTimeout(() => {
            try { player.release(); } catch (_) {}
            playersRef.current = playersRef.current.filter(p => p !== player);
          }, (taroukDuration + 2) * 1000);
        } catch (e) {
          console.error(`[Sheeloha] Player ${index + 1} failed:`, e);
        }
      });
      preparedRef.current = null; // استُهلكت
    } else {
      console.log("[Sheeloha] Using NEW players");
      // الدورات التالية: أنشئ مشغّلات جديدة
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
    }
  }, []);

  const play = useCallback(async (data: SheelohaData) => {
    const taroukUrl = data.taroukUrl || data.sheelohaUrl || "";
    const taroukDuration = data.taroukDuration || 3;

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
    let loopCount = 0;
    const startLoop = () => {
      if (!isPlayingRef.current) return;
      playCrowdPrepared(taroukUrl, taroukDuration, loopCount === 0);
      loopCount++;
      const t = setTimeout(startLoop, loopDuration);
      timersRef.current.push(t);
    };
    startLoop();

  }, [cleanup, playCrowdPrepared]);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return { play, stop, prepare, isPlaying: isPlayingState };
}
