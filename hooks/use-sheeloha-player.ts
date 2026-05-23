import { useRef, useCallback, useState } from "react";
import * as ExpoAudio from "expo-audio";

const { createAudioPlayer, AudioModule } = ExpoAudio;
type AudioPlayer = ExpoAudio.AudioPlayer;

const CLAP_ASSET = require("@/assets/sounds/single-clap-short.mp3");
const CLAP_INTERVAL = 960;
const LOOP_GAP = 150;

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

export function useSheelohaPlayer() {
  const [isPlayingState, setIsPlayingState] = useState(false);
  const isPlayingRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const playersRef = useRef<AudioPlayer[]>([]);
  const preparedUrlRef = useRef<string | null>(null);

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
      } catch (e) {}
    });
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



    // شغّل الخمسة أصوات مباشرة
    playCrowd(taroukUrl, taroukDuration);

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
    cleanup();
  }, [cleanup]);

  const prepare = useCallback((taroukUrl: string) => {
    if (preparedUrlRef.current === taroukUrl) return;
    preparedUrlRef.current = taroukUrl;
    try {
      const preloader = createAudioPlayer(taroukUrl);
      setTimeout(() => {
        try { preloader.release(); } catch (_) {}
      }, 30000);
    } catch (_) {}
  }, []);

  return { play, stop, prepare, isPlaying: isPlayingState };
}
