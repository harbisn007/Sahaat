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

// Clapping sound asset - local file
const CLAP_SOUND_URI = require("@/assets/sounds/sheeloha-claps.mp3");

/**
 * Sheeloha Effect Configuration
 * 5 voice copies with stereo panning (Layering)
 */
const SHEELOHA_CONFIG = {
  voiceCopies: 5,
  delayBetweenCopies: 15, // ms
  volume: 0.50,
  panValues: [0, -0.3, 0.3, -0.6, 0.6],
};

interface SheelohaPlayerState {
  isPlaying: boolean;
  isProcessing: boolean;
}

/**
 * Hook for playing Sheeloha effect
 * - 5 overlapping voice copies
 * - Clapping sound that repeats based on clappingDelay
 * 
 * تم إعادة كتابته باستخدام createAudioPlayer لتجنب مشاكل useAudioPlayer
 */
export function useSheelohaPlayer() {
  const [state, setState] = useState<SheelohaPlayerState>({
    isPlaying: false,
    isProcessing: false,
  });

  // Store players for cleanup
  const playersRef = useRef<AudioPlayer[]>([]);
  const clapPlayerRef = useRef<AudioPlayer | null>(null);
  
  // Store timeouts and intervals for cleanup
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
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
   * Start clapping sound that repeats based on delay
   * @param delaySeconds - Delay between claps (0 = no clapping)
   * @param durationMs - Total duration to play claps
   */
  const startClapping = useCallback(async (delaySeconds: number, durationMs: number) => {
    if (delaySeconds <= 0) {
      console.log("[useSheelohaPlayer] No clapping (delay = 0)");
      return;
    }
    
    const delayMs = delaySeconds * 1000;
    console.log(`[useSheelohaPlayer] Starting clapping: delay=${delayMs}ms, duration=${durationMs}ms`);
    
    if (Platform.OS === "web") {
      // Web: Create audio elements for clapping
      const playClap = () => {
        const clapAudio = new Audio("/sounds/sheeloha-claps.mp3");
        clapAudio.volume = 0.40;
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
        console.log("[useSheelohaPlayer] Clapping stopped");
      }, stopTime);
      timeoutsRef.current.push(timeout);
    } else {
      // Native: Create clap player
      try {
        const clapPlayer = createAudioPlayer(CLAP_SOUND_URI);
        clapPlayerRef.current = clapPlayer;
        clapPlayer.volume = 0.40;
        
        const playClap = () => {
          try {
            clapPlayer.seekTo(0);
            clapPlayer.play();
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
          console.log("[useSheelohaPlayer] Clapping stopped");
        }, stopTime);
        timeoutsRef.current.push(timeout);
      } catch (e) {
        console.warn("[useSheelohaPlayer] Failed to create clap player:", e);
      }
    }
  }, []);

  /**
   * Play on Web using HTML5 Audio
   */
  const playOnWeb = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] Playing on web:", audioUri);
    setState({ isPlaying: true, isProcessing: true });
    
    try {
      // Create audio elements for voice copies
      const audioElements: HTMLAudioElement[] = [];
      
      for (let i = 0; i < SHEELOHA_CONFIG.voiceCopies; i++) {
        const audio = new Audio(audioUri);
        audio.volume = SHEELOHA_CONFIG.volume;
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
      const totalDelay = (SHEELOHA_CONFIG.voiceCopies - 1) * SHEELOHA_CONFIG.delayBetweenCopies;
      const totalDuration = durationMs + totalDelay;
      
      console.log(`[useSheelohaPlayer] Voice duration: ${durationMs}ms, total: ${totalDuration}ms`);
      
      setState({ isPlaying: true, isProcessing: false });
      
      // Play voice copies with staggered start
      audioElements.forEach((audio, index) => {
        const timeout = setTimeout(() => {
          audio.play().catch(console.warn);
          console.log(`[useSheelohaPlayer] Voice copy ${index + 1} started`);
        }, index * SHEELOHA_CONFIG.delayBetweenCopies);
        timeoutsRef.current.push(timeout);
      });
      
      // Start clapping
      startClapping(clappingDelay, totalDuration);
      
      // End after voice finishes
      const endTimeout = setTimeout(() => {
        setState({ isPlaying: false, isProcessing: false });
        console.log("[useSheelohaPlayer] Playback complete");
      }, totalDuration + 500);
      timeoutsRef.current.push(endTimeout);
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Web playback error:", error);
      setState({ isPlaying: false, isProcessing: false });
    }
  }, [startClapping]);

  /**
   * Play on Native using expo-audio with createAudioPlayer
   */
  const playOnNative = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] ========== Playing on native ==========");
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
      
      // 2. إنشاء 5 players للأصوات
      console.log("[useSheelohaPlayer] Creating voice players...");
      const players: AudioPlayer[] = [];
      
      for (let i = 0; i < SHEELOHA_CONFIG.voiceCopies; i++) {
        const player = createAudioPlayer(audioUri);
        player.volume = SHEELOHA_CONFIG.volume;
        players.push(player);
        playersRef.current.push(player);
        console.log(`[useSheelohaPlayer] Player ${i + 1} created`);
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
      
      const totalDelay = (SHEELOHA_CONFIG.voiceCopies - 1) * SHEELOHA_CONFIG.delayBetweenCopies;
      const totalDuration = durationMs + totalDelay;
      
      console.log(`[useSheelohaPlayer] Voice duration: ${durationMs}ms, total: ${totalDuration}ms`);
      
      setState({ isPlaying: true, isProcessing: false });
      
      // 5. تشغيل الأصوات بتأخير متتالي
      players.forEach((player, index) => {
        const timeout = setTimeout(() => {
          try {
            player.play();
            console.log(`[useSheelohaPlayer] Voice copy ${index + 1} started`);
          } catch (e) {
            console.warn(`[useSheelohaPlayer] Failed to play voice ${index + 1}:`, e);
          }
        }, index * SHEELOHA_CONFIG.delayBetweenCopies);
        timeoutsRef.current.push(timeout);
      });
      
      // 6. بدء التصفيق
      startClapping(clappingDelay, totalDuration);
      
      // 7. إنهاء بعد انتهاء الصوت
      const endTimeout = setTimeout(() => {
        setState({ isPlaying: false, isProcessing: false });
        cleanupPlayers();
        console.log("[useSheelohaPlayer] Playback complete");
      }, totalDuration + 500);
      timeoutsRef.current.push(endTimeout);
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Native playback error:", error);
      setState({ isPlaying: false, isProcessing: false });
      cleanupPlayers();
    }
  }, [startClapping, cleanupPlayers]);

  /**
   * Main play function
   * @param audioUri - URL of the audio to play (last Tarouk message)
   * @param clappingDelay - Delay between claps in seconds (0 = no clapping)
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
