import { useState, useCallback, useRef, useEffect } from "react";
import { Platform } from "react-native";
import { useAudioPlayer } from "expo-audio";

/**
 * Sheeloha Effect Configuration
 * - Plays the same audio 3 times overlapping
 * - Each copy has a slight delay (chorus effect)
 * - Distance effect makes sounds appear farther
 */
const SHEELOHA_CONFIG = {
  // Number of overlapping copies
  copies: 3,
  // Delay between each copy start (in ms)
  delayBetweenCopies: 80,
  // Volume for each copy (decreasing for distance effect)
  volumes: [0.8, 0.6, 0.4],
};

interface SheelohaPlayerState {
  isPlaying: boolean;
  isProcessing: boolean;
}

/**
 * Hook for playing Sheeloha effect
 * Plays the latest Tarouk message 3 times overlapping with distance effect
 */
export function useSheelohaPlayer() {
  const [state, setState] = useState<SheelohaPlayerState>({
    isPlaying: false,
    isProcessing: false,
  });

  // Use expo-audio players for native
  const player1 = useAudioPlayer("");
  const player2 = useAudioPlayer("");
  const player3 = useAudioPlayer("");
  
  // Store timeouts for cleanup
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Store web audio elements
  const webAudioRef = useRef<HTMLAudioElement[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(t => clearTimeout(t));
      webAudioRef.current.forEach(a => {
        try { a.pause(); a.src = ""; } catch(e) {}
      });
    };
  }, []);

  /**
   * Stop all playing audio
   */
  const stopSheeloha = useCallback(() => {
    console.log("[useSheelohaPlayer] Stopping all audio");
    
    // Clear timeouts
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
    
    // Stop web audio
    webAudioRef.current.forEach(a => {
      try { a.pause(); a.currentTime = 0; } catch(e) {}
    });
    webAudioRef.current = [];
    
    // Stop native players
    if (Platform.OS !== "web") {
      try {
        player1.pause();
        player2.pause();
        player3.pause();
      } catch(e) {}
    }
    
    setState({ isPlaying: false, isProcessing: false });
  }, [player1, player2, player3]);

  /**
   * Play on Web using simple HTML5 Audio (most reliable)
   */
  const playOnWeb = useCallback(async (audioUri: string) => {
    console.log("[useSheelohaPlayer] Playing on Web:", audioUri);
    
    stopSheeloha();
    setState({ isPlaying: true, isProcessing: false });
    
    const audios: HTMLAudioElement[] = [];
    let finishedCount = 0;
    
    for (let i = 0; i < SHEELOHA_CONFIG.copies; i++) {
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.volume = SHEELOHA_CONFIG.volumes[i];
      
      audio.onended = () => {
        finishedCount++;
        console.log(`[useSheelohaPlayer] Copy ${i+1} ended (${finishedCount}/${SHEELOHA_CONFIG.copies})`);
        if (finishedCount >= SHEELOHA_CONFIG.copies) {
          setState({ isPlaying: false, isProcessing: false });
        }
      };
      
      audio.onerror = (e) => {
        console.error(`[useSheelohaPlayer] Audio ${i+1} error:`, e);
      };
      
      audio.src = audioUri;
      audios.push(audio);
      
      // Schedule with delay
      const delay = i * SHEELOHA_CONFIG.delayBetweenCopies;
      const timeout = setTimeout(() => {
        console.log(`[useSheelohaPlayer] Starting copy ${i+1} at +${delay}ms, volume: ${audio.volume}`);
        audio.play().catch(e => {
          console.error(`[useSheelohaPlayer] Play error for copy ${i+1}:`, e);
        });
      }, delay);
      
      timeoutsRef.current.push(timeout);
    }
    
    webAudioRef.current = audios;
  }, [stopSheeloha]);

  /**
   * Play on Native using expo-audio
   */
  const playOnNative = useCallback(async (audioUri: string) => {
    console.log("[useSheelohaPlayer] Playing on Native:", audioUri);
    
    stopSheeloha();
    setState({ isPlaying: true, isProcessing: false });
    
    const players = [player1, player2, player3];
    
    for (let i = 0; i < SHEELOHA_CONFIG.copies; i++) {
      const delay = i * SHEELOHA_CONFIG.delayBetweenCopies;
      
      const timeout = setTimeout(() => {
        console.log(`[useSheelohaPlayer] Starting native copy ${i+1} at +${delay}ms`);
        try {
          players[i].replace(audioUri);
          players[i].volume = SHEELOHA_CONFIG.volumes[i];
          players[i].play();
        } catch (e) {
          console.error(`[useSheelohaPlayer] Native play error for copy ${i+1}:`, e);
        }
      }, delay);
      
      timeoutsRef.current.push(timeout);
    }
    
    // Auto-stop after estimated duration (10 seconds max)
    const stopTimeout = setTimeout(() => {
      setState({ isPlaying: false, isProcessing: false });
    }, 10000);
    timeoutsRef.current.push(stopTimeout);
    
  }, [stopSheeloha, player1, player2, player3]);

  /**
   * Main play function
   */
  const playSheeloha = useCallback(async (audioUri: string) => {
    console.log("[useSheelohaPlayer] playSheeloha called with:", audioUri);
    
    if (!audioUri) {
      console.warn("[useSheelohaPlayer] No audio URI provided!");
      return;
    }
    
    if (Platform.OS === "web") {
      await playOnWeb(audioUri);
    } else {
      await playOnNative(audioUri);
    }
  }, [playOnWeb, playOnNative]);

  return {
    isPlaying: state.isPlaying,
    isProcessing: state.isProcessing,
    playSheeloha,
    stopSheeloha,
  };
}
