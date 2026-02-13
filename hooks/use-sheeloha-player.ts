/**
 * Sheeloha Player Hook
 * 
 * بعد الطاروق يشغّل:
 * 1. الجولة الأولى: طاروق بمستوى 45% مع تأثير Delay+Detune + تصفيق إيقاعي
 * 2. الجولة الثانية: طاروق بمستوى 35% مع تأثير Chorus + تصفيق إيقاعي
 * 3. التصفيق الختامي
 * 
 * يعمل عبر expo-audio (لا يعتمد على Web Audio API لأنه غير متوفر في React Native)
 */

import { useRef, useCallback } from "react";
import { Platform } from "react-native";
import { AudioModule } from "expo-audio";

interface SheelohaData {
  taroukUrl: string;
  taroukDuration: number;
  clapUrl: string;
  finalClapUrl: string;
}

export function useSheelohaPlayer() {
  const isPlayingRef = useRef(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const playersRef = useRef<InstanceType<typeof AudioModule.AudioPlayer>[]>([]);
  
  /**
   * إيقاف جميع الأصوات والمؤقتات
   */
  const stop = useCallback(() => {
    console.log("[Sheeloha] Stopping all sounds");
    isPlayingRef.current = false;
    
    // إيقاف جميع المؤقتات
    for (const t of timeoutsRef.current) {
      clearTimeout(t);
    }
    timeoutsRef.current = [];
    
    // إيقاف جميع المشغلات
    for (const player of playersRef.current) {
      try {
        player.pause();
        player.release();
      } catch (e) {
        // ignore
      }
    }
    playersRef.current = [];
  }, []);
  
  /**
   * تشغيل صوت واحد بمستوى صوت محدد
   */
  const playSound = useCallback(async (url: string, volume: number): Promise<InstanceType<typeof AudioModule.AudioPlayer> | null> => {
    try {
      // Use dynamic import for expo-audio to create player
      const { AudioModule: AM } = await import("expo-audio");
      const { setAudioModeAsync } = await import("expo-audio");
      
      // Ensure audio plays in silent mode
      if (Platform.OS !== "web") {
        await setAudioModeAsync({ playsInSilentMode: true });
      }
      
      const player = new AM.AudioPlayer(url, 0.1, false);
      player.volume = volume;
      playersRef.current.push(player);
      
      player.play();
      return player;
    } catch (e) {
      console.error("[Sheeloha] Failed to play sound:", url, e);
      return null;
    }
  }, []);
  
  /**
   * تشغيل التصفيق الإيقاعي المتكرر طوال مدة الجولة
   */
  const playClapLoop = useCallback(async (clapUrl: string, durationMs: number, volume: number = 0.6) => {
    const CLAP_INTERVAL = 600; // تصفيقة كل 600ms (100 BPM تقريباً)
    let elapsed = 0;
    
    const scheduleClap = () => {
      if (!isPlayingRef.current || elapsed >= durationMs) return;
      
      playSound(clapUrl, volume);
      elapsed += CLAP_INTERVAL;
      
      const t = setTimeout(scheduleClap, CLAP_INTERVAL);
      timeoutsRef.current.push(t);
    };
    
    scheduleClap();
  }, [playSound]);
  
  /**
   * تشغيل الشيلوها الكاملة
   * 
   * التسلسل:
   * 1. جولة 1: طاروق (45% صوت) + تصفيق إيقاعي - تأثير Delay+Detune
   *    (نشغل الطاروق بسرعة مختلفة قليلاً لمحاكاة التأثير)
   * 2. جولة 2: طاروق (35% صوت) + تصفيق إيقاعي - تأثير Chorus
   * 3. تصفيق ختامي
   */
  const play = useCallback(async (data: SheelohaData) => {
    // إيقاف أي شيلوها سابقة
    stop();
    
    isPlayingRef.current = true;
    const { taroukUrl, taroukDuration, clapUrl, finalClapUrl } = data;
    
    // مدة كل جولة = مدة الطاروق الأصلي
    const roundDurationMs = taroukDuration * 1000;
    
    console.log(`[Sheeloha] Starting - tarouk duration: ${taroukDuration}s`);
    
    // === الجولة الأولى: Delay + Detune (مستوى 45%) ===
    console.log("[Sheeloha] Round 1: Delay+Detune at 45% volume");
    
    // تشغيل الطاروق الأصلي بمستوى 45%
    const round1Player = await playSound(taroukUrl, 0.45);
    
    // تشغيل نسخة ثانية بتأخير بسيط لمحاكاة Delay+Detune
    const t1 = setTimeout(async () => {
      if (!isPlayingRef.current) return;
      const delayedPlayer = await playSound(taroukUrl, 0.25);
      if (delayedPlayer) {
        // تغيير السرعة قليلاً لمحاكاة Detune
        try {
          delayedPlayer.playbackRate = 1.02; // أعلى قليلاً
        } catch (e) { /* rate not supported on all platforms */ }
      }
    }, 60); // تأخير 60ms
    timeoutsRef.current.push(t1);
    
    // نسخة ثالثة بتأخير أكبر
    const t1b = setTimeout(async () => {
      if (!isPlayingRef.current) return;
      const delayedPlayer2 = await playSound(taroukUrl, 0.15);
      if (delayedPlayer2) {
        try {
          delayedPlayer2.playbackRate = 0.98; // أخفض قليلاً
        } catch (e) { /* rate not supported on all platforms */ }
      }
    }, 120); // تأخير 120ms
    timeoutsRef.current.push(t1b);
    
    // تصفيق إيقاعي للجولة الأولى
    playClapLoop(clapUrl, roundDurationMs, 0.5);
    
    // === الجولة الثانية: Chorus (مستوى 35%) - تبدأ بعد انتهاء الجولة الأولى ===
    const t2 = setTimeout(async () => {
      if (!isPlayingRef.current) return;
      console.log("[Sheeloha] Round 2: Chorus at 35% volume");
      
      // تشغيل الطاروق الأصلي بمستوى 35%
      await playSound(taroukUrl, 0.35);
      
      // نسخ متعددة بتأخيرات وسرعات مختلفة لمحاكاة Chorus
      const chorusDelays = [
        { delay: 25, volume: 0.18, rate: 1.015 },
        { delay: 50, volume: 0.15, rate: 0.985 },
        { delay: 75, volume: 0.12, rate: 1.025 },
        { delay: 40, volume: 0.10, rate: 0.975 },
      ];
      
      for (const chorus of chorusDelays) {
        const ct = setTimeout(async () => {
          if (!isPlayingRef.current) return;
          const cp = await playSound(taroukUrl, chorus.volume);
          if (cp) {
            try {
              cp.playbackRate = chorus.rate;
            } catch (e) { /* rate not supported */ }
          }
        }, chorus.delay);
        timeoutsRef.current.push(ct);
      }
      
      // تصفيق إيقاعي للجولة الثانية
      playClapLoop(clapUrl, roundDurationMs, 0.45);
    }, roundDurationMs + 500); // فاصلة 500ms بين الجولتين
    timeoutsRef.current.push(t2);
    
    // === التصفيق الختامي - بعد انتهاء الجولتين ===
    const totalWait = (roundDurationMs * 2) + 1500; // جولتين + فواصل
    const t3 = setTimeout(async () => {
      if (!isPlayingRef.current) return;
      console.log("[Sheeloha] Final clapping");
      await playSound(finalClapUrl, 0.7);
      
      // انتهاء الشيلوها بعد التصفيق الختامي
      const t4 = setTimeout(() => {
        if (isPlayingRef.current) {
          console.log("[Sheeloha] Complete");
          isPlayingRef.current = false;
        }
      }, 5000); // التصفيق الختامي ~5 ثواني
      timeoutsRef.current.push(t4);
    }, totalWait);
    timeoutsRef.current.push(t3);
    
  }, [stop, playSound, playClapLoop]);
  
  return {
    play,
    stop,
    isPlaying: isPlayingRef.current,
  };
}
