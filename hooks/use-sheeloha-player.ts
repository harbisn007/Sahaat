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

// New crowd applause sound (continuous clapping)
const CROWD_APPLAUSE_URI = require("@/assets/sounds/crowd-applause.mp3");

/**
 * Sheeloha Effect Configuration - UPDATED
 * 5 voice copies with layering and stereo panning
 * Single round only (no second round)
 * Clapping continues until the end of the voice
 */
const SHEELOHA_CONFIG = {
  // Number of overlapping voice copies
  voiceCopies: 5,
  // Fixed delay between each copy start (in ms) - creates layering effect
  delayBetweenCopies: 15,
  // Volume: 50% (clear but not overwhelming)
  volume: 0.50,
  // Playback rate: 1.0 = original speed
  playbackRate: 1.0,
  // Stereo pan values: center, slight left, slight right, more left, more right
  // Creates width without echo
  panValues: [0, -0.3, 0.3, -0.5, 0.5],
};

interface SheelohaPlayerState {
  isPlaying: boolean;
  isProcessing: boolean;
}

/**
 * Hook for playing Sheeloha effect with advanced audio processing
 * NEW LOGIC: Single round only
 * - 5 voice copies with stereo panning for width
 * - Crowd applause sound that continues until voice ends
 * - No second round
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
  
  // Crowd applause player
  const applausePlayer = useAudioPlayer(CROWD_APPLAUSE_URI);
  
  // Track if applause player is preloaded and ready
  const applausePreloadedRef = useRef<boolean>(false);
  
  // Store timeouts for cleanup
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const webAudioRef = useRef<HTMLAudioElement[]>([]);
  
  // Preload applause sound on mount
  useEffect(() => {
    if (Platform.OS !== "web" && applausePlayer) {
      try {
        applausePlayer.volume = 0.40;
        applausePlayer.loop = true; // Loop until we stop it
        applausePreloadedRef.current = true;
        console.log("[useSheelohaPlayer] Crowd applause preloaded");
      } catch (error) {
        console.warn("[useSheelohaPlayer] Failed to preload applause:", error);
      }
    }
  }, [applausePlayer]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
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
    if (Platform.OS !== "web") {
      [player1, player2, player3, player4, player5].forEach(player => {
        try {
          player.pause();
        } catch (e) {
          // Ignore
        }
      });
      try {
        applausePlayer.pause();
        applausePlayer.seekTo(0);
      } catch (e) {
        // Ignore
      }
    }
    
    setState({ isPlaying: false, isProcessing: false });
  }, [player1, player2, player3, player4, player5, applausePlayer]);

  /**
   * Start crowd applause that continues until stopped
   * @param clappingDelay - If 0, no applause. Otherwise, play applause.
   * @param volume - Volume level (0-1)
   */
  const startApplause = useCallback((clappingDelay: number, volume: number) => {
    if (clappingDelay <= 0) {
      console.log("[useSheelohaPlayer] No applause (delay = 0)");
      return;
    }
    
    console.log(`[useSheelohaPlayer] Starting crowd applause at volume ${volume}`);
    
    if (Platform.OS === "web") {
      // Web: Create looping audio element
      const applauseAudio = new Audio("/sounds/crowd-applause.mp3");
      applauseAudio.volume = volume;
      applauseAudio.loop = true;
      applauseAudio.play().catch(console.warn);
      webAudioRef.current.push(applauseAudio);
    } else {
      // Native: Use applausePlayer
      try {
        applausePlayer.volume = volume;
        applausePlayer.loop = true;
        applausePlayer.seekTo(0);
        applausePlayer.play();
      } catch (e) {
        console.warn("[useSheelohaPlayer] Failed to play applause:", e);
      }
    }
  }, [applausePlayer]);

  /**
   * Stop applause
   */
  const stopApplause = useCallback(() => {
    console.log("[useSheelohaPlayer] Stopping applause");
    
    if (Platform.OS === "web") {
      // Find and stop applause audio
      webAudioRef.current.forEach(audio => {
        if (audio.loop) {
          audio.pause();
          audio.currentTime = 0;
        }
      });
    } else {
      try {
        applausePlayer.pause();
        applausePlayer.seekTo(0);
      } catch (e) {
        // Ignore
      }
    }
  }, [applausePlayer]);

  /**
   * Play on Web using HTML5 Audio
   */
  const playOnWeb = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] Playing on web");
    setState({ isPlaying: true, isProcessing: true });
    
    try {
      // Create 5 audio elements for voice copies with stereo panning
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
      console.log(`[useSheelohaPlayer] Voice duration: ${duration}ms`);
      
      // Start applause (will loop until we stop it)
      startApplause(clappingDelay, 0.40);
      
      // Play voice copies with staggered start for layering effect
      audioElements.forEach((audio, index) => {
        const timeout = setTimeout(() => {
          audio.play().catch(console.warn);
        }, index * SHEELOHA_CONFIG.delayBetweenCopies);
        timeoutsRef.current.push(timeout);
      });
      
      // Stop applause and end when voice finishes
      const endTimeout = setTimeout(() => {
        stopApplause();
        setState({ isPlaying: false, isProcessing: false });
      }, duration + 500); // Add small buffer
      timeoutsRef.current.push(endTimeout);
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Web playback error:", error);
      stopApplause();
      setState({ isPlaying: false, isProcessing: false });
    }
  }, [startApplause, stopApplause]);

  /**
   * Play on Native using expo-audio
   */
  const playOnNative = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] Playing on native");
    setState({ isPlaying: true, isProcessing: true });
    
    try {
      const players = [player1, player2, player3, player4, player5];
      
      // Load and configure all players
      for (const player of players) {
        try {
          await player.replace({ uri: audioUri });
          player.volume = SHEELOHA_CONFIG.volume;
        } catch (e) {
          console.warn("[useSheelohaPlayer] Failed to load player:", e);
        }
      }
      
      // Get duration
      const duration = (player1.duration || 10) * 1000;
      console.log(`[useSheelohaPlayer] Voice duration: ${duration}ms`);
      
      // Start applause (will loop until we stop it)
      startApplause(clappingDelay, 0.40);
      
      // Play voice copies with staggered start for layering effect
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
      
      // Stop applause and end when voice finishes
      const endTimeout = setTimeout(() => {
        stopApplause();
        setState({ isPlaying: false, isProcessing: false });
      }, duration + 500); // Add small buffer
      timeoutsRef.current.push(endTimeout);
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Native playback error:", error);
      stopApplause();
      setState({ isPlaying: false, isProcessing: false });
    }
  }, [player1, player2, player3, player4, player5, startApplause, stopApplause]);

  /**
   * Main play function
   * @param audioUri - URL of the audio to play
   * @param clappingDelay - Delay value (0 = no clapping, >0 = play applause)
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
