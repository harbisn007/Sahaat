import { useState, useRef, useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { useAudioPlayer } from "expo-audio";

/**
 * Clapping Delay Configuration
 * Value represents delay between claps in seconds
 * 0 = No clapping
 * 0.05 - 1.50 = Delay between claps
 */
export type ClappingDelay = number; // 0 to 1.50 in 0.05 increments

// Clapping sound asset - short single clap (0.5 seconds)
const CLAP_SOUND_URI = require("@/assets/sounds/sheeloha-claps.mp3");

/**
 * Sheeloha Effect Configuration
 * 5 voice copies + clapping (based on selected delay)
 * All sounds at 45% volume (distant effect)
 * Original playback speed (1.0x)
 */
const SHEELOHA_CONFIG = {
  // Number of overlapping voice copies
  voiceCopies: 5,
  // Fixed delay between each copy start (in ms) - no echo effect
  delayBetweenCopies: 20,
  // Volume: 45% (distant sound effect)
  volume: 0.45,
  // Playback rate: 1.0 = original speed
  playbackRate: 1.0,
  // Stereo pan values: all center (0)
  panValues: [0, 0, 0, 0, 0],
};

interface SheelohaPlayerState {
  isPlaying: boolean;
  isProcessing: boolean;
}

/**
 * Hook for playing Sheeloha effect with advanced audio processing
 * NEW LOGIC: Two sequential rounds
 * Round 1: 5 voice copies + 3 clap copies at 35% volume
 * Round 2: 5 voice copies + 3 clap copies at 15% volume
 */
export function useSheelohaPlayer() {
  const [state, setState] = useState<SheelohaPlayerState>({
    isPlaying: false,
    isProcessing: false,
  });

  // Use expo-audio players for native (5 players for voice per round)
  const player1 = useAudioPlayer("");
  const player2 = useAudioPlayer("");
  const player3 = useAudioPlayer("");
  const player4 = useAudioPlayer("");
  const player5 = useAudioPlayer("");
  
  // Single clap player for native
  const clapPlayer = useAudioPlayer(CLAP_SOUND_URI);
  
  // Track if clap player is preloaded and ready
  const clapPreloadedRef = useRef<boolean>(false);
  
  // Store timeouts and intervals for cleanup
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const webAudioRef = useRef<HTMLAudioElement[]>([]);
  
  // Preload clap sound on mount
  useEffect(() => {
    if (Platform.OS !== "web" && clapPlayer) {
      try {
        clapPlayer.volume = 0.35;
        clapPreloadedRef.current = true;
        console.log("[useSheelohaPlayer] Clap sound preloaded");
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
      } catch (e) {
        // Ignore
      }
    }
    
    setState({ isPlaying: false, isProcessing: false });
  }, [player1, player2, player3, player4, player5, clapPlayer]);

  /**
   * Play clapping sound with specified delay (in seconds)
   * @param delaySeconds - Delay between claps (0 = no clapping)
   * @param duration - Total duration to play claps (in ms)
   * @param volume - Volume level (0-1)
   */
  const startClapping = useCallback((delaySeconds: number, duration: number, volume: number) => {
    if (delaySeconds <= 0) {
      console.log("[useSheelohaPlayer] No clapping (delay = 0)");
      return;
    }
    
    const delayMs = delaySeconds * 1000;
    console.log(`[useSheelohaPlayer] Starting clapping with ${delayMs}ms delay`);
    
    if (Platform.OS === "web") {
      // Web: Create audio elements for clapping
      const playClap = () => {
        const clapAudio = new Audio("/sounds/sheeloha-claps.mp3");
        clapAudio.volume = volume;
        clapAudio.play().catch(console.warn);
        webAudioRef.current.push(clapAudio);
      };
      
      // Play first clap immediately
      playClap();
      
      // Set interval for subsequent claps
      const interval = setInterval(playClap, delayMs);
      intervalsRef.current.push(interval);
      
      // Stop after duration
      const timeout = setTimeout(() => {
        clearInterval(interval);
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
      
      // Play first clap immediately
      playClap();
      
      // Set interval for subsequent claps
      const interval = setInterval(playClap, delayMs);
      intervalsRef.current.push(interval);
      
      // Stop after duration
      const timeout = setTimeout(() => {
        clearInterval(interval);
      }, duration);
      timeoutsRef.current.push(timeout);
    }
  }, [clapPlayer]);

  /**
   * Play on Web using HTML5 Audio
   */
  const playOnWeb = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] Playing on web");
    setState({ isPlaying: true, isProcessing: true });
    
    try {
      // Create 5 audio elements for voice copies
      const audioElements: HTMLAudioElement[] = [];
      
      for (let i = 0; i < SHEELOHA_CONFIG.voiceCopies; i++) {
        const audio = new Audio(audioUri);
        audio.volume = SHEELOHA_CONFIG.volume;
        audio.playbackRate = SHEELOHA_CONFIG.playbackRate;
        audioElements.push(audio);
        webAudioRef.current.push(audio);
      }
      
      // Get duration from first audio
      await new Promise<void>((resolve) => {
        audioElements[0].addEventListener("loadedmetadata", () => resolve());
        audioElements[0].load();
      });
      
      const duration = audioElements[0].duration * 1000;
      
      // Play voice copies with staggered start
      audioElements.forEach((audio, index) => {
        const timeout = setTimeout(() => {
          audio.play().catch(console.warn);
        }, index * SHEELOHA_CONFIG.delayBetweenCopies);
        timeoutsRef.current.push(timeout);
      });
      
      // Start clapping
      startClapping(clappingDelay, duration * 2, 0.35);
      
      // Round 2 after first round finishes
      const round2Timeout = setTimeout(() => {
        // Play second round at lower volume
        audioElements.forEach((audio, index) => {
          const audio2 = new Audio(audioUri);
          audio2.volume = 0.15;
          audio2.playbackRate = SHEELOHA_CONFIG.playbackRate;
          webAudioRef.current.push(audio2);
          
          const timeout = setTimeout(() => {
            audio2.play().catch(console.warn);
          }, index * SHEELOHA_CONFIG.delayBetweenCopies);
          timeoutsRef.current.push(timeout);
        });
        
        // Second round clapping at lower volume
        startClapping(clappingDelay, duration, 0.15);
      }, duration);
      timeoutsRef.current.push(round2Timeout);
      
      // End after both rounds
      const endTimeout = setTimeout(() => {
        setState({ isPlaying: false, isProcessing: false });
      }, duration * 2 + 1000);
      timeoutsRef.current.push(endTimeout);
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Web playback error:", error);
      setState({ isPlaying: false, isProcessing: false });
    }
  }, [startClapping]);

  /**
   * Play a single round on native
   */
  const playRoundOnNative = useCallback(async (
    audioUri: string, 
    volume: number, 
    clappingDelay: ClappingDelay,
    clapVolume: number
  ) => {
    const players = [player1, player2, player3, player4, player5];
    
    // Load and configure all players
    for (const player of players) {
      try {
        await player.replace({ uri: audioUri });
        player.volume = volume;
        // playbackRate not directly settable on expo-audio AudioPlayer
      } catch (e) {
        console.warn("[useSheelohaPlayer] Failed to load player:", e);
      }
    }
    
    // Get duration
    const duration = (player1.duration || 10) * 1000;
    
    // Play with staggered start
    players.forEach((player, index) => {
      const timeout = setTimeout(() => {
        try {
          player.play();
        } catch (e) {
          console.warn("[useSheelohaPlayer] Failed to play:", e);
        }
      }, index * SHEELOHA_CONFIG.delayBetweenCopies);
      timeoutsRef.current.push(timeout);
    });
    
    // Start clapping
    startClapping(clappingDelay, duration, clapVolume);
    
    return duration;
  }, [player1, player2, player3, player4, player5, startClapping]);

  /**
   * Play on Native using expo-audio
   */
  const playOnNative = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] Playing on native");
    setState({ isPlaying: true, isProcessing: true });
    
    try {
      // Round 1: 45% volume voice, 35% volume claps
      const duration = await playRoundOnNative(audioUri, 0.45, clappingDelay, 0.35);
      
      // Round 2 after first round
      const round2Timeout = setTimeout(async () => {
        await playRoundOnNative(audioUri, 0.15, clappingDelay, 0.15);
      }, duration);
      timeoutsRef.current.push(round2Timeout);
      
      // End after both rounds
      const endTimeout = setTimeout(() => {
        setState({ isPlaying: false, isProcessing: false });
      }, duration * 2 + 1000);
      timeoutsRef.current.push(endTimeout);
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Native playback error:", error);
      setState({ isPlaying: false, isProcessing: false });
    }
  }, [playRoundOnNative]);

  /**
   * Main play function
   * @param audioUri - URL of the audio to play
   * @param clappingDelay - Delay between claps in seconds (0 = no clapping)
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
