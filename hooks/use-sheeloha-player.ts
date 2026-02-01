import { useState, useCallback, useRef, useEffect } from "react";
import { Platform } from "react-native";
import { createAudioPlayer, AudioModule, AudioPlayer } from "expo-audio";

/**
 * Clapping Delay Configuration
 * Value represents delay between claps in seconds
 * 0 = No clapping
 * 0.05 - 1.50 = Delay between claps (controlled by SpeedWheel)
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
  repeatingClapVolume: 0.40, // مستوى صوت التصفيق المتكرر 40%
  endClapVolume: 0.35, // مستوى صوت التصفيق عند النهاية 35%
};

interface SheelohaPlayerState {
  isPlaying: boolean;
  isProcessing: boolean;
}

/**
 * Hook for playing Sheeloha effect - Natural Chorus
 * - 5 أصوات بأبعاد مختلفة (تأثير جوقة طبيعية)
 * - تصفيق متكرر حسب عجلة الإيقاع
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
  const endClapPlayerRef = useRef<AudioPlayer | null>(null);
  
  // Store timeouts and intervals for cleanup
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const webAudioRef = useRef<HTMLAudioElement[]>([]);
  
  // Track if players have been released
  const isReleasedRef = useRef(false);
  
  // Cleanup all players
  const cleanupPlayers = useCallback(() => {
    if (isReleasedRef.current) return;
    isReleasedRef.current = true;
    
    playersRef.current.forEach(player => {
      try {
        player.pause();
        player.release();
      } catch (e) {
        // Ignore - player may already be released
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
    
    if (endClapPlayerRef.current) {
      try {
        endClapPlayerRef.current.pause();
        endClapPlayerRef.current.release();
      } catch (e) {
        // Ignore
      }
      endClapPlayerRef.current = null;
    }
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      intervalsRef.current.forEach(clearInterval);
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
    
    // Clear all timeouts and intervals
    timeoutsRef.current.forEach(clearTimeout);
    intervalsRef.current.forEach(clearInterval);
    timeoutsRef.current = [];
    intervalsRef.current = [];
    
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
   * Start repeating clapping sound based on delay
   * @param delaySeconds - Delay between claps (0 = no clapping)
   * @param durationMs - Total duration to play claps
   */
  const startRepeatingClap = useCallback(async (delaySeconds: number, durationMs: number) => {
    if (delaySeconds <= 0) {
      console.log("[useSheelohaPlayer] No repeating clapping (delay = 0)");
      return;
    }
    
    const delayMs = delaySeconds * 1000;
    console.log(`[useSheelohaPlayer] Starting repeating clapping: delay=${delayMs}ms, duration=${durationMs}ms`);
    
    if (Platform.OS === "web") {
      // Web: Create audio elements for clapping
      const playClap = () => {
        const clapAudio = new Audio("/sounds/sheeloha-claps.mp3");
        clapAudio.volume = SHEELOHA_CONFIG.repeatingClapVolume;
        clapAudio.play().catch(console.warn);
        webAudioRef.current.push(clapAudio);
      };
      
      // Play first clap
      playClap();
      
      // Set interval for subsequent claps
      const interval = setInterval(playClap, delayMs);
      intervalsRef.current.push(interval);
      
      // Stop clapping 0.10 seconds before voice ends
      const stopTime = Math.max(0, durationMs - 100);
      const timeout = setTimeout(() => {
        clearInterval(interval);
        console.log("[useSheelohaPlayer] Repeating clapping stopped");
      }, stopTime);
      timeoutsRef.current.push(timeout);
    } else {
      // Native: Create clap player
      try {
        const clapPlayer = createAudioPlayer(CLAP_SOUND_URI);
        clapPlayerRef.current = clapPlayer;
        clapPlayer.volume = SHEELOHA_CONFIG.repeatingClapVolume;
        
        const playClap = () => {
          try {
            if (clapPlayerRef.current && !isReleasedRef.current) {
              clapPlayerRef.current.seekTo(0);
              clapPlayerRef.current.play();
            }
          } catch (e) {
            console.warn("[useSheelohaPlayer] Failed to play clap:", e);
          }
        };
        
        // Wait for clap to load
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Play first clap
        playClap();
        
        // Set interval for subsequent claps
        const interval = setInterval(playClap, delayMs);
        intervalsRef.current.push(interval);
        
        // Stop clapping 0.10 seconds before voice ends
        const stopTime = Math.max(0, durationMs - 100);
        const timeout = setTimeout(() => {
          clearInterval(interval);
          console.log("[useSheelohaPlayer] Repeating clapping stopped");
        }, stopTime);
        timeoutsRef.current.push(timeout);
      } catch (e) {
        console.warn("[useSheelohaPlayer] Failed to create clap player:", e);
      }
    }
  }, []);

  /**
   * Play clapping sound ONCE at the end
   * @param durationMs - When to play the clap (at the end of voices)
   */
  const playEndClap = useCallback(async (durationMs: number) => {
    console.log(`[useSheelohaPlayer] Will play end clap at ${durationMs}ms`);
    
    const timeout = setTimeout(async () => {
      console.log("[useSheelohaPlayer] Playing end clap NOW");
      
      if (Platform.OS === "web") {
        const clapAudio = new Audio("/sounds/sheeloha-claps.mp3");
        clapAudio.volume = SHEELOHA_CONFIG.endClapVolume;
        clapAudio.play().catch(console.warn);
        webAudioRef.current.push(clapAudio);
      } else {
        try {
          if (!isReleasedRef.current) {
            const endClapPlayer = createAudioPlayer(CLAP_SOUND_URI);
            endClapPlayerRef.current = endClapPlayer;
            endClapPlayer.volume = SHEELOHA_CONFIG.endClapVolume;
            
            // Wait for clap to load
            await new Promise(resolve => setTimeout(resolve, 100));
            endClapPlayer.play();
            console.log("[useSheelohaPlayer] End clap played");
          }
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
  const playOnWeb = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
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
      
      // Start repeating clapping based on wheel speed
      startRepeatingClap(clappingDelay, durationMs);
      
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
  }, [startRepeatingClap, playEndClap]);

  /**
   * Play on Native using expo-audio - Natural Chorus Effect
   */
  const playOnNative = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] ========== Playing on native (Natural Chorus) ==========");
    console.log("[useSheelohaPlayer] URI:", audioUri.substring(0, 100));
    setState({ isPlaying: true, isProcessing: true });
    isReleasedRef.current = false;
    
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
            if (!isReleasedRef.current) {
              player.play();
              console.log(`[useSheelohaPlayer] Voice ${index + 1} started (delay: ${settings.delay}ms, volume: ${settings.volume})`);
            }
          } catch (e) {
            console.warn(`[useSheelohaPlayer] Failed to play voice ${index + 1}:`, e);
          }
        }, settings.delay);
        timeoutsRef.current.push(timeout);
      });
      
      // 6. تشغيل التصفيق المتكرر حسب سرعة العجلة
      startRepeatingClap(clappingDelay, durationMs);
      
      // 7. تشغيل التصفيق مرة واحدة عند نهاية الصوت
      playEndClap(durationMs - 200); // قبل نهاية الصوت بـ 200ms
      
      // 8. إنهاء بعد انتهاء الصوت والتصفيق
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
  }, [startRepeatingClap, playEndClap, cleanupPlayers]);

  /**
   * Main play function
   * @param audioUri - URL of the audio to play (last Tarouk message)
   * @param clappingDelay - التأخير بين التصفيقات (من عجلة الإيقاع)
   */
  const playSheeloha = useCallback(async (audioUri: string, clappingDelay: ClappingDelay = 0) => {
    console.log("[useSheelohaPlayer] playSheeloha called:", { audioUri, clappingDelay });
    
    if (!audioUri) {
      console.warn("[useSheelohaPlayer] No audio URI provided!");
      return;
    }
    
    // Stop any currently playing sheeloha first
    stopSheeloha();
    
    // Reset released flag
    isReleasedRef.current = false;
    
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
