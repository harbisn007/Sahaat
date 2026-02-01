import { useState, useCallback, useRef, useEffect } from "react";
import { Platform } from "react-native";
import { createAudioPlayer, AudioModule, AudioPlayer } from "expo-audio";

/**
 * Clapping Delay Configuration
 * الآن لا يُستخدم للتكرار - التصفيق يعمل مرة واحدة عند النهاية
 */
export type ClappingDelay = number;

// Clapping sound asset - local file (أربع تصفيقات قصيرة)
const CLAP_SOUND_URI = require("@/assets/sounds/sheeloha-claps.mp3");

/**
 * Sheeloha Effect Configuration - Natural Chorus
 * 5 أصوات بأبعاد مختلفة (بدون تأثير آلي/معدني)
 * 
 * التأثير الجديد:
 * - نسخة 1: الصوت الأساسي (قريب جداً) - وسط
 * - نسخة 2 و 3: صوت متوسط البُعد - يمين ويسار
 * - نسخة 4 و 5: صوت بعيد - يمين ويسار أبعد
 */
const SHEELOHA_CONFIG = {
  voiceCopies: 5,
  // إعدادات كل نسخة: [التأخير بالمللي ثانية, مستوى الصوت, التوزيع الستيريو]
  voiceSettings: [
    { delay: 0,   volume: 1.00, pan: 0 },      // نسخة 1: قريب جداً - وسط
    { delay: 50,  volume: 0.70, pan: -0.3 },   // نسخة 2: متوسط - يسار قليل
    { delay: 50,  volume: 0.70, pan: 0.3 },    // نسخة 3: متوسط - يمين قليل
    { delay: 100, volume: 0.45, pan: -0.6 },   // نسخة 4: بعيد - يسار
    { delay: 100, volume: 0.45, pan: 0.6 },    // نسخة 5: بعيد - يمين
  ],
  clapVolume: 0.35, // مستوى صوت التصفيق 35%
};

interface SheelohaPlayerState {
  isPlaying: boolean;
  isProcessing: boolean;
}

/**
 * Hook for playing Sheeloha effect - Natural Chorus
 * - 5 أصوات بأبعاد مختلفة (تأثير جوقة طبيعية)
 * - تصفيق مرة واحدة عند نهاية الصوت
 */
export function useSheelohaPlayer() {
  const [state, setState] = useState<SheelohaPlayerState>({
    isPlaying: false,
    isProcessing: false,
  });

  // Store players for cleanup
  const playersRef = useRef<AudioPlayer[]>([]);
  const clapPlayerRef = useRef<AudioPlayer | null>(null);
  
  // Store timeouts for cleanup
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const webAudioRef = useRef<HTMLAudioElement[]>([]);
  
  // Cleanup all players
  const cleanupPlayers = useCallback(() => {
    playersRef.current.forEach(player => {
      try {
        player.pause();
        player.release();
      } catch (e) {
        // Ignore
      }
    });
    playersRef.current = [];
    
    if (clapPlayerRef.current) {
      try {
        clapPlayerRef.current.pause();
        clapPlayerRef.current.release();
      } catch (e) {
        // Ignore
      }
      clapPlayerRef.current = null;
    }
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      webAudioRef.current.forEach(audio => {
        audio.pause();
        audio.src = "";
      });
      cleanupPlayers();
    };
  }, [cleanupPlayers]);

  /**
   * Stop all sheeloha sounds immediately
   */
  const stopSheeloha = useCallback(() => {
    console.log("[useSheelohaPlayer] Stopping all sounds");
    
    // Clear all timeouts
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    
    // Stop web audio
    webAudioRef.current.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    webAudioRef.current = [];
    
    // Stop native players
    cleanupPlayers();
    
    setState({ isPlaying: false, isProcessing: false });
  }, [cleanupPlayers]);

  /**
   * Play clapping sound ONCE at the end
   * @param durationMs - When to play the clap (at the end of voices)
   */
  const playEndClap = useCallback(async (durationMs: number) => {
    console.log(`[useSheelohaPlayer] Will play clap at ${durationMs}ms`);
    
    const timeout = setTimeout(async () => {
      console.log("[useSheelohaPlayer] Playing end clap NOW");
      
      if (Platform.OS === "web") {
        const clapAudio = new Audio("/sounds/sheeloha-claps.mp3");
        clapAudio.volume = SHEELOHA_CONFIG.clapVolume;
        clapAudio.play().catch(console.warn);
        webAudioRef.current.push(clapAudio);
      } else {
        try {
          const clapPlayer = createAudioPlayer(CLAP_SOUND_URI);
          clapPlayerRef.current = clapPlayer;
          clapPlayer.volume = SHEELOHA_CONFIG.clapVolume;
          
          // Wait for clap to load
          await new Promise(resolve => setTimeout(resolve, 100));
          clapPlayer.play();
          console.log("[useSheelohaPlayer] End clap played");
        } catch (e) {
          console.warn("[useSheelohaPlayer] Failed to play end clap:", e);
        }
      }
    }, durationMs);
    
    timeoutsRef.current.push(timeout);
  }, []);

  /**
   * Play on Web using HTML5 Audio - Natural Chorus Effect
   */
  const playOnWeb = useCallback(async (audioUri: string, _clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] Playing on web (Natural Chorus):", audioUri);
    setState({ isPlaying: true, isProcessing: true });
    
    try {
      // Create audio elements for voice copies with different settings
      const audioElements: HTMLAudioElement[] = [];
      
      for (let i = 0; i < SHEELOHA_CONFIG.voiceCopies; i++) {
        const audio = new Audio(audioUri);
        const settings = SHEELOHA_CONFIG.voiceSettings[i];
        audio.volume = settings.volume;
        audioElements.push(audio);
        webAudioRef.current.push(audio);
      }
      
      // Wait for first audio to load to get duration
      await new Promise<void>((resolve, reject) => {
        audioElements[0].addEventListener("loadedmetadata", () => resolve());
        audioElements[0].addEventListener("error", () => reject(new Error("Failed to load audio")));
        audioElements[0].load();
      });
      
      const durationMs = audioElements[0].duration * 1000;
      // أقصى تأخير هو 100ms للنسخ البعيدة
      const maxDelay = 100;
      const totalDuration = durationMs + maxDelay;
      
      console.log(`[useSheelohaPlayer] Voice duration: ${durationMs}ms, total: ${totalDuration}ms`);
      
      setState({ isPlaying: true, isProcessing: false });
      
      // Play voice copies with their specific delays
      audioElements.forEach((audio, index) => {
        const settings = SHEELOHA_CONFIG.voiceSettings[index];
        const timeout = setTimeout(() => {
          audio.play().catch(console.warn);
          console.log(`[useSheelohaPlayer] Voice ${index + 1} started (delay: ${settings.delay}ms, volume: ${settings.volume})`);
        }, settings.delay);
        timeoutsRef.current.push(timeout);
      });
      
      // Play clap ONCE at the end of voices
      playEndClap(durationMs - 200); // قبل نهاية الصوت بـ 200ms
      
      // End after voice finishes
      const endTimeout = setTimeout(() => {
        setState({ isPlaying: false, isProcessing: false });
        console.log("[useSheelohaPlayer] Playback complete");
      }, totalDuration + 1000); // إضافة وقت للتصفيق
      timeoutsRef.current.push(endTimeout);
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Web playback error:", error);
      setState({ isPlaying: false, isProcessing: false });
    }
  }, [playEndClap]);

  /**
   * Play on Native using expo-audio - Natural Chorus Effect
   */
  const playOnNative = useCallback(async (audioUri: string, _clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] ========== Playing on native (Natural Chorus) ==========");
    console.log("[useSheelohaPlayer] URI:", audioUri.substring(0, 100));
    setState({ isPlaying: true, isProcessing: true });
    
    try {
      // 1. ضبط audio mode للتشغيل
      try {
        await AudioModule.setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
        });
        console.log("[useSheelohaPlayer] Audio mode set");
      } catch (e) {
        console.warn("[useSheelohaPlayer] Failed to set audio mode:", e);
      }
      
      // 2. إنشاء 5 players للأصوات بإعدادات مختلفة
      console.log("[useSheelohaPlayer] Creating voice players with different distances...");
      const players: AudioPlayer[] = [];
      
      for (let i = 0; i < SHEELOHA_CONFIG.voiceCopies; i++) {
        const player = createAudioPlayer(audioUri);
        const settings = SHEELOHA_CONFIG.voiceSettings[i];
        player.volume = settings.volume;
        players.push(player);
        playersRef.current.push(player);
        console.log(`[useSheelohaPlayer] Player ${i + 1} created (volume: ${settings.volume}, delay: ${settings.delay}ms)`);
      }
      
      // 3. انتظار تحميل الأصوات
      console.log("[useSheelohaPlayer] Waiting for audio to load...");
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 4. الحصول على المدة
      let durationMs = (players[0].duration || 0) * 1000;
      if (durationMs <= 0) {
        console.warn("[useSheelohaPlayer] Could not get duration, using 10 seconds fallback");
        durationMs = 10000;
      }
      
      // أقصى تأخير هو 100ms للنسخ البعيدة
      const maxDelay = 100;
      const totalDuration = durationMs + maxDelay;
      
      console.log(`[useSheelohaPlayer] Voice duration: ${durationMs}ms, total: ${totalDuration}ms`);
      
      setState({ isPlaying: true, isProcessing: false });
      
      // 5. تشغيل الأصوات بتأخيرات مختلفة حسب البُعد
      players.forEach((player, index) => {
        const settings = SHEELOHA_CONFIG.voiceSettings[index];
        const timeout = setTimeout(() => {
          try {
            player.play();
            console.log(`[useSheelohaPlayer] Voice ${index + 1} started (delay: ${settings.delay}ms, volume: ${settings.volume})`);
          } catch (e) {
            console.warn(`[useSheelohaPlayer] Failed to play voice ${index + 1}:`, e);
          }
        }, settings.delay);
        timeoutsRef.current.push(timeout);
      });
      
      // 6. تشغيل التصفيق مرة واحدة عند نهاية الصوت
      playEndClap(durationMs - 200); // قبل نهاية الصوت بـ 200ms
      
      // 7. إنهاء بعد انتهاء الصوت والتصفيق
      const endTimeout = setTimeout(() => {
        setState({ isPlaying: false, isProcessing: false });
        cleanupPlayers();
        console.log("[useSheelohaPlayer] Playback complete");
      }, totalDuration + 1000); // إضافة وقت للتصفيق
      timeoutsRef.current.push(endTimeout);
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Native playback error:", error);
      setState({ isPlaying: false, isProcessing: false });
      cleanupPlayers();
    }
  }, [playEndClap, cleanupPlayers]);

  /**
   * Main play function
   * @param audioUri - URL of the audio to play (last Tarouk message)
   * @param clappingDelay - لم يعد مستخدماً (التصفيق مرة واحدة عند النهاية)
   */
  const playSheeloha = useCallback(async (audioUri: string, clappingDelay: ClappingDelay = 0) => {
    console.log("[useSheelohaPlayer] playSheeloha called:", { audioUri, clappingDelay });
    
    if (!audioUri) {
      console.warn("[useSheelohaPlayer] No audio URI provided!");
      return;
    }
    
    // Stop any currently playing sheeloha first
    stopSheeloha();
    
    // Small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (Platform.OS === "web") {
      await playOnWeb(audioUri, clappingDelay);
    } else {
      await playOnNative(audioUri, clappingDelay);
    }
  }, [stopSheeloha, playOnWeb, playOnNative]);

  return {
    isPlaying: state.isPlaying,
    isProcessing: state.isProcessing,
    playSheeloha,
    stopSheeloha,
  };
}
