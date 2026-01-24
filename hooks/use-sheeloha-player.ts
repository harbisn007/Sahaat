import { useState, useCallback, useRef } from "react";
import { Platform } from "react-native";

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
  // Volume reduction for distance effect (0-1)
  distanceVolume: 0.7,
  // Additional volume reduction per copy
  volumeDecay: 0.15,
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

  // Store audio elements for cleanup
  const audioElementsRef = useRef<HTMLAudioElement[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  /**
   * Stop all playing audio and cleanup
   */
  const stopSheeloha = useCallback(() => {
    console.log("[useSheelohaPlayer] Stopping all audio");
    
    // Clear all timeouts
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    timeoutsRef.current = [];
    
    // Stop and cleanup all audio elements
    audioElementsRef.current.forEach(audio => {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.src = "";
      } catch (e) {
        console.warn("[useSheelohaPlayer] Error stopping audio:", e);
      }
    });
    audioElementsRef.current = [];
    
    setState({
      isPlaying: false,
      isProcessing: false,
    });
  }, []);

  /**
   * Play Sheeloha effect on Web using HTML5 Audio
   */
  const playSheelohaWeb = useCallback(async (audioUri: string) => {
    console.log("[useSheelohaPlayer] Playing on Web:", audioUri.substring(0, 50));
    
    // Cleanup previous playback
    stopSheeloha();
    
    setState({ isPlaying: false, isProcessing: true });
    
    try {
      const audioElements: HTMLAudioElement[] = [];
      let completedCount = 0;
      
      // Create 3 audio elements with staggered start
      for (let i = 0; i < SHEELOHA_CONFIG.copies; i++) {
        const audio = new Audio(audioUri);
        
        // Calculate volume with distance effect and decay
        const volume = SHEELOHA_CONFIG.distanceVolume - (i * SHEELOHA_CONFIG.volumeDecay);
        audio.volume = Math.max(0.2, volume);
        
        // Add low-pass filter effect for distance (if supported)
        // Note: This requires Web Audio API for full effect
        
        audio.onended = () => {
          completedCount++;
          console.log(`[useSheelohaPlayer] Copy ${i + 1} finished (${completedCount}/${SHEELOHA_CONFIG.copies})`);
          
          // All copies finished
          if (completedCount >= SHEELOHA_CONFIG.copies) {
            console.log("[useSheelohaPlayer] All copies finished");
            setState({ isPlaying: false, isProcessing: false });
            audioElementsRef.current = [];
          }
        };
        
        audio.onerror = (e) => {
          console.error(`[useSheelohaPlayer] Error playing copy ${i + 1}:`, e);
        };
        
        audioElements.push(audio);
        
        // Schedule playback with delay
        const delay = i * SHEELOHA_CONFIG.delayBetweenCopies;
        const timeout = setTimeout(() => {
          console.log(`[useSheelohaPlayer] Starting copy ${i + 1} with volume ${audio.volume.toFixed(2)}`);
          audio.play().catch(e => console.error("[useSheelohaPlayer] Play error:", e));
        }, delay);
        
        timeoutsRef.current.push(timeout);
      }
      
      audioElementsRef.current = audioElements;
      setState({ isPlaying: true, isProcessing: false });
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Failed to play:", error);
      setState({ isPlaying: false, isProcessing: false });
    }
  }, [stopSheeloha]);

  /**
   * Play Sheeloha effect on Native using expo-audio
   * Note: Native implementation is simpler due to platform limitations
   */
  const playSheelohaAudioApi = useCallback(async (audioUri: string) => {
    console.log("[useSheelohaPlayer] Playing with Web Audio API:", audioUri.substring(0, 50));
    
    stopSheeloha();
    setState({ isPlaying: false, isProcessing: true });
    
    try {
      // Use Web Audio API for better control
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContext();
      
      // Fetch and decode audio
      const response = await fetch(audioUri);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      let completedCount = 0;
      
      // Create 3 sources with staggered start and distance effect
      for (let i = 0; i < SHEELOHA_CONFIG.copies; i++) {
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // Create gain node for volume control (distance effect)
        const gainNode = audioContext.createGain();
        const volume = SHEELOHA_CONFIG.distanceVolume - (i * SHEELOHA_CONFIG.volumeDecay);
        gainNode.gain.value = Math.max(0.2, volume);
        
        // Create low-pass filter for distance effect (muffled sound)
        const filter = audioContext.createBiquadFilter();
        filter.type = "lowpass";
        // Reduce high frequencies more for each copy (sounds farther)
        filter.frequency.value = 8000 - (i * 1500);
        
        // Connect: source -> filter -> gain -> output
        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        source.onended = () => {
          completedCount++;
          if (completedCount >= SHEELOHA_CONFIG.copies) {
            console.log("[useSheelohaPlayer] All copies finished (Web Audio API)");
            setState({ isPlaying: false, isProcessing: false });
            audioContext.close();
          }
        };
        
        // Start with delay
        const delaySeconds = (i * SHEELOHA_CONFIG.delayBetweenCopies) / 1000;
        source.start(audioContext.currentTime + delaySeconds);
        console.log(`[useSheelohaPlayer] Started copy ${i + 1} at +${delaySeconds}s, volume: ${volume.toFixed(2)}, filter: ${filter.frequency.value}Hz`);
      }
      
      setState({ isPlaying: true, isProcessing: false });
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Web Audio API error:", error);
      // Fallback to simple HTML5 Audio
      playSheelohaWeb(audioUri);
    }
  }, [stopSheeloha, playSheelohaWeb]);

  /**
   * Main play function - chooses implementation based on platform
   */
  const playSheeloha = useCallback(async (audioUri: string) => {
    console.log("[useSheelohaPlayer] playSheeloha called");
    
    if (!audioUri) {
      console.warn("[useSheelohaPlayer] No audio URI provided");
      return;
    }
    
    if (Platform.OS === "web") {
      // Try Web Audio API first for better effects
      try {
        await playSheelohaAudioApi(audioUri);
      } catch (e) {
        // Fallback to simple HTML5 Audio
        await playSheelohaWeb(audioUri);
      }
    } else {
      // Native: Use simpler approach with expo-audio
      // For now, use the same web approach (works on native web view)
      await playSheelohaWeb(audioUri);
    }
  }, [playSheelohaAudioApi, playSheelohaWeb]);

  return {
    isPlaying: state.isPlaying,
    isProcessing: state.isProcessing,
    playSheeloha,
    stopSheeloha,
  };
}
