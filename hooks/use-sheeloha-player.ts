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

interface PreparedPlayers {
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
  const preparedUrlRef = useRef<string>("");
  const preparedPlayersRef = useRef<PreparedPlayers | null>(null);

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

  const prepare = useCallback((taroukUrl: string, taroukDuration: number) => {
    if (preparedUrlRef.current === taroukUrl) return;
    preparedUrlRef.current = taroukUrl;

    // حرر القديم إن وجد
    if (preparedPlayersRef.current) {
      preparedPlayersRef.current.players.forEach(p => {
        try { p.release(); } catch (_) {}
      });
      preparedPlayersRef.current = null;
    }

    try {
      // جهّز الخمسة players وشغّلهم بصوت صفر لإجبار التحميل
      const players = CROWD_FIXED.map(({ volume, rate }) => {
        const p = createAudioPlayer(taroukUrl);
        p.volume = 0;
        p.setPlaybackRate(rate);
        p.play();
        setTimeout(() => {
          try { p.pause(); p.currentTime = 0; p.volume = volume; } catch (_) {}
        }, 500);
        return p;
      });

      preparedPlayersRef.current = { players, taroukUrl, taroukDuration };

      // حررهم بعد 30 ثانية
      setTimeout(() => {
        if (preparedPlayersRef.current?.taroukUrl === taroukUrl) {
          preparedPlayersRef.current.players.forEach(p => {
            try { p.release(); } catch (_) {}
          });
          preparedPlayersRef.current = null;
          preparedUrlRef.current = "";
        }
      }, 30000);
    } catch (_) {}
  }, []);

  const playCrowd = useCallback((taroukUrl: string, taroukDuration: number, isFirstLoop: boolean) => {
    // أول loop — استخدم المُجهَّزين إن وجدوا
    if (isFirstLoop && preparedPlayersRef.current?.taroukUrl === taroukUrl) {
      const { players } = preparedPlayersRef.current;
      preparedPlayersRef.current = null;
      preparedUrlRef.current = "";

      players.forEach(player => {
        if (!isPlayingRef.current) return;
        try {
          player.currentTime = 0;
          player.play();
          playersRef.current.push(player);
          setTimeout(() => {
            try { player.pause(); player.release(); } catch (_) {}
            playersRef.current = playersRef.current.filter(p => p !== player);
          }, (taroukDuration + 2) * 1000);
        } catch (_) {}
      });
      return;
    }

    // باقي الـ loops
    CROWD_FIXED.forEach(({ volume, rate }) => {
      if (!isPlayingRef.current) return;
      try {
        const player = createAudioPlayer(taroukUrl);
        player.volume = volume;
        player.setPlaybackRate(rate);
        player.play();
        playersRef.current.push(player);
        setTimeout(() => {
          try { player.pause(); player.release(); } catch (_) {}
          playersRef.current = playersRef.current.filter(p => p !== player);
        }, (taroukDuration + 2) * 1000);
      } catch (_) {}
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

    const loopDuration = (taroukDuration * 1000) + LOOP_GAP;
    let loopCount = 0;
    const startLoop = () => {
      if (!isPlayingRef.current) return;
      playCrowd(taroukUrl, taroukDuration, loopCount === 0);
      loopCount++;
      const t = setTimeout(startLoop, loopDuration);
      timersRef.current.push(t);
    };

    startLoop();

    const clapDelay = setTimeout(() => {
      if (!isPlayingRef.current) return;
      playClap();
      const clapInterval = setInterval(playClap, CLAP_INTERVAL);
      intervalsRef.current.push(clapInterval);
    }, 300);
    timersRef.current.push(clapDelay);

  }, [cleanup, playCrowd]);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return { play, stop, prepare, isPlaying: isPlayingState };
}
