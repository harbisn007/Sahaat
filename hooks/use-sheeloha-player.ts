import { useState, useCallback, useRef, useEffect } from "react";
import { Platform } from "react-native";
import { useAudioPlayer } from "expo-audio";

/**
 * Clapping Speed Configuration
 * 1 = Slow (20 BPM) - delay 3000ms between claps
 * 2 = Medium (50 BPM) - delay 1200ms between claps  
 * 3 = Fast (80 BPM) - delay 750ms between claps
 */
export type ClappingSpeed = 1 | 2 | 3;

const CLAPPING_DELAYS: Record<ClappingSpeed, number> = {
  1: 3000,  // 20 BPM = 3000ms per beat
  2: 1200,  // 50 BPM = 1200ms per beat
  3: 750,   // 80 BPM = 750ms per beat
};

/**
 * Sheeloha Effect Configuration - Advanced
 * - 5 overlapping copies
 * - Much more distant (quieter)
 * - Different pitch (higher)
 * - Slightly faster playback
 * - Stereo panning: Right → Left (moves from right to left during playback)
 * - NO reverb/echo
 */
const SHEELOHA_CONFIG = {
  // Number of overlapping copies
  copies: 5,
  // Delay between each copy start (in ms)
  delayBetweenCopies: 80,
  // Volume for each copy (much more distant - about 50% of previous values)
  volumes: [0.14, 0.10, 0.07, 0.04, 0.025],
  // Playback rate (slightly faster, also changes pitch)
  playbackRate: 1.15,
  // Stereo pan values: -1 = full left, 0 = center, 1 = full right
  // Start from right, move to left
  panValues: [0.8, 0.4, 0, -0.4, -0.8],
};

interface SheelohaPlayerState {
  isPlaying: boolean;
  isProcessing: boolean;
}

/**
 * Hook for playing Sheeloha effect with advanced audio processing
 * - Distant sound (low volume)
 * - Higher pitch + faster playback
 * - Stereo movement: Right → Left
 * - NO reverb
 * - Clapping speed support (1=slow, 2=medium, 3=fast)
 */
export function useSheelohaPlayer() {
  const [state, setState] = useState<SheelohaPlayerState>({
    isPlaying: false,
    isProcessing: false,
  });

  // Use expo-audio players for native (5 players)
  const player1 = useAudioPlayer("");
  const player2 = useAudioPlayer("");
  const player3 = useAudioPlayer("");
  const player4 = useAudioPlayer("");
  const player5 = useAudioPlayer("");
  
  // Store timeouts for cleanup
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Store web audio context and nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const panNodesRef = useRef<StereoPannerNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(t => clearTimeout(t));
      sourceNodesRef.current.forEach(s => {
        try { s.stop(); } catch(e) {}
      });
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch(e) {}
      }
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
    
    // Stop web audio sources
    sourceNodesRef.current.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    sourceNodesRef.current = [];
    panNodesRef.current = [];
    gainNodesRef.current = [];
    
    // Stop native players
    if (Platform.OS !== "web") {
      try {
        player1.pause();
        player2.pause();
        player3.pause();
        player4.pause();
        player5.pause();
      } catch(e) {}
    }
    
    setState({ isPlaying: false, isProcessing: false });
  }, [player1, player2, player3, player4, player5]);

  /**
   * Play on Web using Web Audio API for advanced effects
   * - Pitch shift via playbackRate
   * - Stereo panning (Right → Left)
   * - NO reverb
   */
  const playOnWeb = useCallback(async (audioUri: string, clappingSpeed: ClappingSpeed = 2) => {
    console.log("[useSheelohaPlayer] Playing on Web with advanced effects:", audioUri, "speed:", clappingSpeed);
    
    stopSheeloha();
    setState({ isPlaying: true, isProcessing: true });
    
    try {
      // Create or reuse AudioContext
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      
      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      
      // Fetch and decode audio
      console.log("[useSheelohaPlayer] Fetching audio...");
      const response = await fetch(audioUri);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      
      console.log("[useSheelohaPlayer] Audio decoded, duration:", audioBuffer.duration);
      setState({ isPlaying: true, isProcessing: false });
      
      let finishedCount = 0;
      const audioDuration = audioBuffer.duration / SHEELOHA_CONFIG.playbackRate;
      
      // Get clapping delay based on speed
      const clappingDelay = CLAPPING_DELAYS[clappingSpeed];
      console.log("[useSheelohaPlayer] Clapping delay:", clappingDelay, "ms (speed:", clappingSpeed, ")");
      
      // Create 5 copies with different settings
      for (let i = 0; i < SHEELOHA_CONFIG.copies; i++) {
        // Use clapping delay instead of fixed delay
        const delay = i * clappingDelay;
        
        const timeout = setTimeout(() => {
          // Create source node
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.playbackRate.value = SHEELOHA_CONFIG.playbackRate; // Faster + higher pitch
          
          // Create gain node (volume)
          const gainNode = ctx.createGain();
          gainNode.gain.value = SHEELOHA_CONFIG.volumes[i];
          
          // Create stereo panner node (Right → Left movement)
          const panNode = ctx.createStereoPanner();
          const startPan = SHEELOHA_CONFIG.panValues[i];
          panNode.pan.value = startPan;
          
          // Animate pan from right to left during playback
          // Start at startPan, move to opposite side
          const endPan = -startPan; // Flip the pan
          panNode.pan.setValueAtTime(startPan, ctx.currentTime);
          panNode.pan.linearRampToValueAtTime(endPan, ctx.currentTime + audioDuration);
          
          // Connect: source → gain → pan → destination
          // NO reverb/convolver - direct connection
          source.connect(gainNode);
          gainNode.connect(panNode);
          panNode.connect(ctx.destination);
          
          // Store for cleanup
          sourceNodesRef.current.push(source);
          panNodesRef.current.push(panNode);
          gainNodesRef.current.push(gainNode);
          
          // Handle end
          source.onended = () => {
            finishedCount++;
            console.log(`[useSheelohaPlayer] Copy ${i+1} ended (${finishedCount}/${SHEELOHA_CONFIG.copies})`);
            if (finishedCount >= SHEELOHA_CONFIG.copies) {
              setState({ isPlaying: false, isProcessing: false });
            }
          };
          
          console.log(`[useSheelohaPlayer] Starting copy ${i+1} at +${delay}ms, volume: ${SHEELOHA_CONFIG.volumes[i]}, pan: ${startPan}→${endPan}, rate: ${SHEELOHA_CONFIG.playbackRate}`);
          source.start();
          
        }, delay);
        
        timeoutsRef.current.push(timeout);
      }
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Web Audio error:", error);
      setState({ isPlaying: false, isProcessing: false });
    }
  }, [stopSheeloha]);

  /**
   * Play on Native using expo-audio
   * Note: Native doesn't support stereo panning easily, so we use basic playback
   * with volume reduction and playback rate
   */
  const playOnNative = useCallback(async (audioUri: string, clappingSpeed: ClappingSpeed = 2) => {
    console.log("[useSheelohaPlayer] Playing on Native:", audioUri, "speed:", clappingSpeed);
    
    stopSheeloha();
    setState({ isPlaying: true, isProcessing: false });
    
    const players = [player1, player2, player3, player4, player5];
    
    // Get clapping delay based on speed
    const clappingDelay = CLAPPING_DELAYS[clappingSpeed];
    
    for (let i = 0; i < SHEELOHA_CONFIG.copies; i++) {
      const delay = i * clappingDelay;
      
      const timeout = setTimeout(() => {
        console.log(`[useSheelohaPlayer] Starting native copy ${i+1} at +${delay}ms, volume: ${SHEELOHA_CONFIG.volumes[i]}`);
        try {
          players[i].replace(audioUri);
          players[i].volume = SHEELOHA_CONFIG.volumes[i];
          // Note: expo-audio supports playbackRate but may not work on all devices
          // players[i].rate = SHEELOHA_CONFIG.playbackRate;
          players[i].play();
        } catch (e) {
          console.error(`[useSheelohaPlayer] Native play error for copy ${i+1}:`, e);
        }
      }, delay);
      
      timeoutsRef.current.push(timeout);
    }
    
    // Auto-stop after estimated duration (longer for slow clapping)
    const maxDuration = 10000 + (SHEELOHA_CONFIG.copies * clappingDelay);
    const stopTimeout = setTimeout(() => {
      setState({ isPlaying: false, isProcessing: false });
    }, maxDuration);
    timeoutsRef.current.push(stopTimeout);
    
  }, [stopSheeloha, player1, player2, player3, player4, player5]);

  /**
   * Main play function
   * @param audioUri - URL of the audio to play
   * @param clappingSpeed - Speed of clapping (1=slow, 2=medium, 3=fast)
   */
  const playSheeloha = useCallback(async (audioUri: string, clappingSpeed: ClappingSpeed = 2) => {
    console.log("[useSheelohaPlayer] playSheeloha called with:", audioUri, "speed:", clappingSpeed);
    
    if (!audioUri) {
      console.warn("[useSheelohaPlayer] No audio URI provided!");
      return;
    }
    
    if (Platform.OS === "web") {
      await playOnWeb(audioUri, clappingSpeed);
    } else {
      await playOnNative(audioUri, clappingSpeed);
    }
  }, [playOnWeb, playOnNative]);

  return {
    isPlaying: state.isPlaying,
    isProcessing: state.isProcessing,
    playSheeloha,
    stopSheeloha,
  };
}
