import { useState, useRef, useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { useAudioPlayer } from "expo-audio";

/**
 * Clapping Delay Configuration
 * Value represents delay between claps in seconds
 * 0 = No clapping
 * 0.05 - 1.50 = Delay between claps (controlled by SpeedWheel)
 */
export type ClappingDelay = number; // 0 to 1.50 in 0.05 increments

// Clapping sound asset - original file
const CLAP_SOUND_URI = require("@/assets/sounds/sheeloha-claps.mp3");

/**
 * Sheeloha Effect Configuration
 * 5 voice copies with stereo panning (Layering)
 * Single round only (no second round)
 * Clapping continues until the end of the voice
 */
const SHEELOHA_CONFIG = {
  // Number of overlapping voice copies (creates "crowd" effect)
  voiceCopies: 5,
  // Delay between each copy start (in ms) - creates layering/chorus effect
  delayBetweenCopies: 15,
  // Volume: 50% (clear but not overwhelming)
  volume: 0.50,
  // Playback rate: 1.0 = original speed
  playbackRate: 1.0,
  // Stereo pan values for Web Audio API (-1 = left, 0 = center, 1 = right)
  panValues: [0, -0.3, 0.3, -0.6, 0.6],
};

interface SheelohaPlayerState {
  isPlaying: boolean;
  isProcessing: boolean;
}

/**
 * Hook for playing Sheeloha effect with advanced audio processing
 */
export function useSheelohaPlayer() {
  const [state, setState] = useState<SheelohaPlayerState>({
    isPlaying: false,
    isProcessing: false,
  });

  // Use expo-audio players for native (5 players for voice)
  const player1 = useAudioPlayer("");
  const player2 = useAudioPlayer("");
  const player3 = useAudioPlayer("");
  const player4 = useAudioPlayer("");
  const player5 = useAudioPlayer("");
  
  // Single clap player for native - preloaded
  const clapPlayer = useAudioPlayer(CLAP_SOUND_URI);
  
  // Store timeouts and intervals for cleanup
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const webAudioRef = useRef<HTMLAudioElement[]>([]);
  const webAudioContextRef = useRef<AudioContext | null>(null);
  
  // Preloaded clap audio for web (to avoid first clap being different)
  const preloadedClapRef = useRef<HTMLAudioElement | null>(null);
  
  // Preload clap sound on mount for both platforms
  useEffect(() => {
    if (Platform.OS === "web") {
      // Preload clap audio for web
      const audio = new Audio("/sounds/sheeloha-claps.mp3");
      audio.preload = "auto";
      audio.load();
      preloadedClapRef.current = audio;
      console.log("[useSheelohaPlayer] Web clap sound preloaded");
    } else if (clapPlayer) {
      try {
        clapPlayer.volume = 0.40;
        console.log("[useSheelohaPlayer] Native clap sound preloaded");
      } catch (error) {
        console.warn("[useSheelohaPlayer] Failed to preload clap:", error);
      }
    }
  }, [clapPlayer]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      intervalsRef.current.forEach(clearInterval);
      webAudioRef.current.forEach(audio => {
        audio.pause();
        audio.src = "";
      });
      if (webAudioContextRef.current) {
        webAudioContextRef.current.close();
      }
    };
  }, []);

  /**
   * Stop all sheeloha sounds
   */
  const stopSheeloha = useCallback(() => {
    console.log("[useSheelohaPlayer] Stopping sheeloha");
    
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
    if (Platform.OS !== "web") {
      [player1, player2, player3, player4, player5].forEach(player => {
        try {
          player.pause();
        } catch (e) {
          // Ignore
        }
      });
      try {
        clapPlayer.pause();
        clapPlayer.seekTo(0);
      } catch (e) {
        // Ignore
      }
    }
    
    setState({ isPlaying: false, isProcessing: false });
  }, [player1, player2, player3, player4, player5, clapPlayer]);

  /**
   * Play clapping sound with specified delay until duration ends
   * FIXED: Clapping starts with voice and ends with voice
   * @param delaySeconds - Delay between claps (from SpeedWheel: 0 = no clapping, 0.05-1.50)
   * @param duration - Total duration to play claps (in ms) - matches voice duration
   * @param volume - Volume level (0-1)
   * @param startDelay - Delay before starting clapping (to sync with voice start)
   */
  const startClapping = useCallback((
    delaySeconds: number, 
    duration: number, 
    volume: number,
    startDelay: number = 0
  ) => {
    if (delaySeconds <= 0) {
      console.log("[useSheelohaPlayer] No clapping (delay = 0)");
      return;
    }
    
    const delayMs = delaySeconds * 1000;
    console.log(`[useSheelohaPlayer] Starting clapping: delay=${delayMs}ms, duration=${duration}ms, volume=${volume}, startDelay=${startDelay}ms`);
    
    // Delay the start of clapping to sync with voice
    const startTimeout = setTimeout(() => {
      if (Platform.OS === "web") {
        // Web: Create audio elements for clapping
        const playClap = () => {
          const clapAudio = new Audio("/sounds/sheeloha-claps.mp3");
          clapAudio.volume = volume;
          clapAudio.play().catch(console.warn);
          webAudioRef.current.push(clapAudio);
        };
        
        // Play first clap
        playClap();
        
        // Set interval for subsequent claps based on SpeedWheel value
        const interval = setInterval(playClap, delayMs);
        intervalsRef.current.push(interval);
        
        // Stop clapping when voice ends (duration already accounts for startDelay)
        const timeout = setTimeout(() => {
          clearInterval(interval);
          console.log("[useSheelohaPlayer] Clapping stopped (voice ended)");
        }, duration);
        timeoutsRef.current.push(timeout);
      } else {
        // Native: Use clapPlayer
        const playClap = () => {
          try {
            clapPlayer.seekTo(0);
            clapPlayer.volume = volume;
            clapPlayer.play();
          } catch (e) {
            console.warn("[useSheelohaPlayer] Failed to play clap:", e);
          }
        };
        
        // Play first clap
        playClap();
        
        // Set interval for subsequent claps based on SpeedWheel value
        const interval = setInterval(playClap, delayMs);
        intervalsRef.current.push(interval);
        
        // Stop clapping when voice ends
        const timeout = setTimeout(() => {
          clearInterval(interval);
          console.log("[useSheelohaPlayer] Clapping stopped (voice ended)");
        }, duration);
        timeoutsRef.current.push(timeout);
      }
    }, startDelay);
    timeoutsRef.current.push(startTimeout);
  }, [clapPlayer]);

  /**
   * Get audio duration by loading the file first
   * This ensures we get the real duration, not a default value
   */
  const getAudioDuration = useCallback(async (audioUri: string): Promise<number> => {
    return new Promise((resolve) => {
      if (Platform.OS === "web") {
        const audio = new Audio(audioUri);
        audio.addEventListener("loadedmetadata", () => {
          const duration = audio.duration * 1000;
          console.log(`[useSheelohaPlayer] Got audio duration: ${duration}ms`);
          resolve(duration);
        });
        audio.addEventListener("error", () => {
          console.warn("[useSheelohaPlayer] Failed to get duration, using fallback");
          resolve(60000); // 60 seconds fallback
        });
        audio.load();
      } else {
        // For native, we'll get duration after loading
        resolve(0); // Will be updated after player.replace()
      }
    });
  }, []);

  /**
   * Play on Web using HTML5 Audio with stereo panning
   * Creates 5 layered voice copies with stereo distribution
   */
  const playOnWeb = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] Playing on web with stereo panning");
    setState({ isPlaying: true, isProcessing: true });
    
    try {
      // Create AudioContext for stereo panning
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      webAudioContextRef.current = audioContext;
      
      // Fetch and decode audio
      const response = await fetch(audioUri);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const duration = audioBuffer.duration * 1000;
      console.log(`[useSheelohaPlayer] Voice duration: ${duration}ms`);
      
      // Calculate total delay for all voice copies
      const totalVoiceDelay = (SHEELOHA_CONFIG.voiceCopies - 1) * SHEELOHA_CONFIG.delayBetweenCopies;
      
      // Create 5 voice copies with stereo panning
      for (let i = 0; i < SHEELOHA_CONFIG.voiceCopies; i++) {
        const timeout = setTimeout(() => {
          // Create source
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          
          // Create gain node for volume
          const gainNode = audioContext.createGain();
          gainNode.gain.value = SHEELOHA_CONFIG.volume;
          
          // Create stereo panner for positioning
          const pannerNode = audioContext.createStereoPanner();
          pannerNode.pan.value = SHEELOHA_CONFIG.panValues[i];
          
          // Connect: source -> gain -> panner -> destination
          source.connect(gainNode);
          gainNode.connect(pannerNode);
          pannerNode.connect(audioContext.destination);
          
          // Play
          source.start(0);
          console.log(`[useSheelohaPlayer] Voice copy ${i + 1} started, pan: ${SHEELOHA_CONFIG.panValues[i]}`);
        }, i * SHEELOHA_CONFIG.delayBetweenCopies);
        timeoutsRef.current.push(timeout);
      }
      
      // Start clapping synchronized with voice
      // Clapping starts when first voice starts (no delay)
      // Clapping ends when last voice copy ends (duration + totalVoiceDelay)
      startClapping(clappingDelay, duration + totalVoiceDelay, 0.40, 0);
      
      // End after all voice copies finish (single round only)
      const endTimeout = setTimeout(() => {
        setState({ isPlaying: false, isProcessing: false });
        console.log("[useSheelohaPlayer] Playback complete (single round)");
      }, duration + totalVoiceDelay + 500);
      timeoutsRef.current.push(endTimeout);
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Web playback error:", error);
      
      // Fallback to simple HTML5 Audio without panning
      console.log("[useSheelohaPlayer] Falling back to simple audio");
      const audioElements: HTMLAudioElement[] = [];
      
      for (let i = 0; i < SHEELOHA_CONFIG.voiceCopies; i++) {
        const audio = new Audio(audioUri);
        audio.volume = SHEELOHA_CONFIG.volume;
        audioElements.push(audio);
        webAudioRef.current.push(audio);
      }
      
      // Get duration properly
      await new Promise<void>((resolve) => {
        audioElements[0].addEventListener("loadedmetadata", () => resolve());
        audioElements[0].load();
      });
      
      const duration = audioElements[0].duration * 1000;
      const totalVoiceDelay = (SHEELOHA_CONFIG.voiceCopies - 1) * SHEELOHA_CONFIG.delayBetweenCopies;
      
      // Play with staggered start
      audioElements.forEach((audio, index) => {
        const timeout = setTimeout(() => {
          audio.play().catch(console.warn);
        }, index * SHEELOHA_CONFIG.delayBetweenCopies);
        timeoutsRef.current.push(timeout);
      });
      
      // Start clapping
      startClapping(clappingDelay, duration + totalVoiceDelay, 0.40, 0);
      
      // End after voice finishes
      const endTimeout = setTimeout(() => {
        setState({ isPlaying: false, isProcessing: false });
      }, duration + totalVoiceDelay + 500);
      timeoutsRef.current.push(endTimeout);
    }
  }, [startClapping]);

  /**
   * Wait for player to load and get real duration
   * On native, player.duration may not be available immediately after replace()
   * We need to wait for it to be loaded properly
   */
  const waitForPlayerDuration = useCallback(async (player: any, maxWait: number = 5000): Promise<number> => {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let resolved = false;
      
      const checkDuration = () => {
        if (resolved) return;
        
        const duration = player.duration;
        console.log(`[useSheelohaPlayer] Checking duration: ${duration}`);
        
        // On native, duration is in seconds
        if (duration && duration > 0 && duration < 600) { // Max 10 minutes
          resolved = true;
          const durationMs = duration * 1000;
          console.log(`[useSheelohaPlayer] Got player duration: ${duration}s = ${durationMs}ms`);
          resolve(durationMs);
          return;
        }
        
        if (Date.now() - startTime > maxWait) {
          resolved = true;
          console.warn("[useSheelohaPlayer] Timeout waiting for duration, using fallback 60s");
          resolve(60000); // 60 seconds fallback for long audio
          return;
        }
        
        // Check again in 100ms (increased from 50ms for native stability)
        setTimeout(checkDuration, 100);
      };
      
      // Start checking after a small delay to let the player load
      setTimeout(checkDuration, 100);
    });
  }, []);

  /**
   * Play on Native using expo-audio
   * Creates 5 layered voice copies
   * FIXED: Uses minimum duration guarantee to ensure isPlaying stays true
   */
  const playOnNative = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] Playing on native");
    setState({ isPlaying: true, isProcessing: true });
    
    try {
      const players = [player1, player2, player3, player4, player5];
      
      // Load first player and wait for duration
      console.log("[useSheelohaPlayer] Loading audio...");
      await player1.replace({ uri: audioUri });
      player1.volume = SHEELOHA_CONFIG.volume;
      
      // Wait for the real duration
      let duration = await waitForPlayerDuration(player1);
      console.log(`[useSheelohaPlayer] Voice duration from player: ${duration}ms`);
      
      // SAFETY: Ensure minimum duration of 5 seconds to prevent early state reset
      // This handles cases where duration detection fails on native
      const MIN_DURATION = 5000; // 5 seconds minimum
      if (duration < MIN_DURATION) {
        console.warn(`[useSheelohaPlayer] Duration too short (${duration}ms), using minimum ${MIN_DURATION}ms`);
        duration = MIN_DURATION;
      }
      
      // Load remaining players
      for (let i = 1; i < players.length; i++) {
        try {
          await players[i].replace({ uri: audioUri });
          players[i].volume = SHEELOHA_CONFIG.volume;
        } catch (e) {
          console.warn(`[useSheelohaPlayer] Failed to load player ${i + 1}:`, e);
        }
      }
      
      // Calculate total delay for all voice copies
      const totalVoiceDelay = (SHEELOHA_CONFIG.voiceCopies - 1) * SHEELOHA_CONFIG.delayBetweenCopies;
      const totalPlaybackTime = duration + totalVoiceDelay;
      console.log(`[useSheelohaPlayer] Total playback time: ${totalPlaybackTime}ms`);
      
      // Play voice copies with staggered start
      players.forEach((player, index) => {
        const timeout = setTimeout(() => {
          try {
            player.play();
            console.log(`[useSheelohaPlayer] Voice copy ${index + 1} started`);
          } catch (e) {
            console.warn("[useSheelohaPlayer] Failed to play:", e);
          }
        }, index * SHEELOHA_CONFIG.delayBetweenCopies);
        timeoutsRef.current.push(timeout);
      });
      
      // Start clapping synchronized with voice
      // Clapping continues until all voice copies end
      startClapping(clappingDelay, totalPlaybackTime, 0.40, 0);
      
      // End after all voice copies finish (single round only)
      // Add 500ms buffer to ensure audio completes
      const endTimeout = setTimeout(() => {
        setState({ isPlaying: false, isProcessing: false });
        console.log("[useSheelohaPlayer] Playback complete (single round)");
      }, totalPlaybackTime + 500);
      timeoutsRef.current.push(endTimeout);
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Native playback error:", error);
      setState({ isPlaying: false, isProcessing: false });
    }
  }, [player1, player2, player3, player4, player5, startClapping, waitForPlayerDuration]);

  /**
   * Main play function
   * @param audioUri - URL of the audio to play (last Tarouk message)
   * @param clappingDelay - Delay between claps in seconds (from SpeedWheel: 0 = no clapping)
   */
  const playSheeloha = useCallback(async (audioUri: string, clappingDelay: ClappingDelay = 0) => {
    console.log("[useSheelohaPlayer] playSheeloha called with:", audioUri, "delay:", clappingDelay);
    
    if (!audioUri) {
      console.warn("[useSheelohaPlayer] No audio URI provided!");
      return;
    }
    
    if (Platform.OS === "web") {
      await playOnWeb(audioUri, clappingDelay);
    } else {
      await playOnNative(audioUri, clappingDelay);
    }
  }, [playOnWeb, playOnNative]);

  return {
    isPlaying: state.isPlaying,
    isProcessing: state.isProcessing,
    playSheeloha,
    stopSheeloha,
  };
}
