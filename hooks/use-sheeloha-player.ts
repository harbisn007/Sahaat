import { useRef, useCallback, useState } from "react";
import * as ExpoAudio from "expo-audio";

const { createAudioPlayer, AudioModule } = ExpoAudio;
type AudioPlayer = ExpoAudio.AudioPlayer;

const CLAP_ASSET = require("@/assets/sounds/single-clap-short.mp3");
const CLAP_INTERVAL = 960;

interface SheelohaData {
  // رابط ملفّ الصفّ الممزوج (المُولَّد على الخادم). نقبل أيضاً taroukUrl للتوافق مع المستدعين القدامى.
  sheelohaUrl?: string;
  taroukUrl?: string;
  taroukDuration?: number;
}

/**
 * النظام الجديد: ملفّ صفّ واحد ممزوج (٥ أصوات مدموجة) يُشغَّل بمشغّل واحد ويُكرَّر بسلاسة (loop)
 * حتى يوقفه "خلوها". التصفيق يبقى كما هو: حلقة منفصلة. لا CROWD_FIXED ولا ٥ مشغّلات حيّة،
 * فلا يمكن أن يخرج صوت عن السرب ولا أن يتدهور إلى الطاروق الأصلي وحده.
 */
export function useSheelohaPlayer() {
  const [isPlayingState, setIsPlayingState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPlayingRef = useRef(false);
  const crowdPlayerRef = useRef<AudioPlayer | null>(null);
  const clapIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clapPlayersRef = useRef<AudioPlayer[]>([]);
  const preparedUrlRef = useRef<string | null>(null);
  const preparedPlayerRef = useRef<AudioPlayer | null>(null);

  const cleanup = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlayingState(false);
    if (clapIntervalRef.current) {
      clearInterval(clapIntervalRef.current);
      clapIntervalRef.current = null;
    }
    clapPlayersRef.current.forEach(p => {
      try { p.pause(); } catch (_) {}
      try { p.release(); } catch (_) {}
    });
    clapPlayersRef.current = [];
    if (crowdPlayerRef.current) {
      try { crowdPlayerRef.current.pause(); } catch (_) {}
      try { crowdPlayerRef.current.release(); } catch (_) {}
      crowdPlayerRef.current = null;
    }
  }, []);

  // تجهيز مشغّل الصفّ مسبقاً (تحميل الملفّ الممزوج) لتشغيل أسرع. اختياري.
  const prepare = useCallback((crowdUrl: string) => {
    if (!crowdUrl || preparedUrlRef.current === crowdUrl) return;
    if (preparedPlayerRef.current) {
      try { preparedPlayerRef.current.release(); } catch (_) {}
      preparedPlayerRef.current = null;
    }
    try {
      const player = createAudioPlayer(crowdUrl);
      player.loop = true;
      player.volume = 1.0;
      preparedPlayerRef.current = player;
      preparedUrlRef.current = crowdUrl;
    } catch (_) {}
  }, []);

  const play = useCallback(async (data: SheelohaData) => {
    const crowdUrl = data.sheelohaUrl || data.taroukUrl || "";

    cleanup();
    setError(null);
    if (!crowdUrl) { setError("لا يوجد ملفّ للشيلوها"); return; }

    isPlayingRef.current = true;
    setIsPlayingState(true);

    try {
      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
    } catch (_) {}
    if (!isPlayingRef.current) return;

    // مشغّل الصفّ: ملفّ واحد ممزوج يُكرَّر بسلاسة
    try {
      let player: AudioPlayer;
      if (preparedPlayerRef.current && preparedUrlRef.current === crowdUrl) {
        player = preparedPlayerRef.current;
        preparedPlayerRef.current = null;
        preparedUrlRef.current = null;
      } else {
        player = createAudioPlayer(crowdUrl);
        player.volume = 1.0;
      }
      player.loop = true;
      player.play();
      crowdPlayerRef.current = player;
    } catch (e: any) {
      setError(e?.message || "تعذّر تشغيل الشيلوها");
      cleanup();
      return;
    }

    // التصفيق: يبقى كما هو — حلقة منفصلة كل 960ms
    const playClap = () => {
      if (!isPlayingRef.current) return;
      try {
        const clap = createAudioPlayer(CLAP_ASSET);
        clap.volume = 0.25;
        clap.play();
        clapPlayersRef.current.push(clap);
        setTimeout(() => {
          try { clap.release(); } catch (_) {}
          clapPlayersRef.current = clapPlayersRef.current.filter(p => p !== clap);
        }, 1000);
      } catch (_) {}
    };
    playClap();
    clapIntervalRef.current = setInterval(playClap, CLAP_INTERVAL);
  }, [cleanup]);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return { play, stop, prepare, isPlaying: isPlayingState, error };
}
