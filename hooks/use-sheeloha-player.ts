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

// Clapping sound asset - using the existing sheeloha-claps.mp3
const CLAP_SOUND_URI = require("@/assets/sounds/sheeloha-claps.mp3");

/**
 * Sheeloha Effect Configuration - Simplified
 * - 5 overlapping copies
 * - Distant sound (quieter)
 * - Higher pitch (faster playback)
 * - Fixed delay between copies (80ms)
 * - Center stereo (no left/right movement)
 * - NO reverb/echo
 */
const SHEELOHA_CONFIG = {
  // Number of overlapping copies
  copies: 5,
  // Fixed delay between each copy start (in ms)
  delayBetweenCopies: 15,
  // Volume for each copy - distant but audible
  volumes: [0.25, 0.20, 0.15, 0.12, 0.10],
  // Clap volumes - same as voice
  clapVolumes: [0.25, 0.20, 0.15, 0.12, 0.10],
  // Playback rate: 1.2 = 20% faster + higher pitch
  playbackRate: 1.2,
  // Stereo pan values: all center (0)
  panValues: [0, 0, 0, 0, 0],
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
 * - Integrated clapping sound with each copy
 */
export function useSheelohaPlayer() {
  const [state, setState] = useState<SheelohaPlayerState>({
    isPlaying: false,
    isProcessing: false,
  });

  // Use expo-audio players for native (5 players for voice + 5 for claps)
  const player1 = useAudioPlayer("");
  const player2 = useAudioPlayer("");
  const player3 = useAudioPlayer("");
  const player4 = useAudioPlayer("");
  const player5 = useAudioPlayer("");
  
  // Clap players for native
  const clapPlayer1 = useAudioPlayer(CLAP_SOUND_URI);
  const clapPlayer2 = useAudioPlayer(CLAP_SOUND_URI);
  const clapPlayer3 = useAudioPlayer(CLAP_SOUND_URI);
  const clapPlayer4 = useAudioPlayer(CLAP_SOUND_URI);
  const clapPlayer5 = useAudioPlayer(CLAP_SOUND_URI);
  
  // Store timeouts for cleanup
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Store web audio context and nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const panNodesRef = useRef<StereoPannerNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);
  // Store clap audio buffer for web
  const clapBufferRef = useRef<AudioBuffer | null>(null);

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
        clapPlayer1.pause();
        clapPlayer2.pause();
        clapPlayer3.pause();
        clapPlayer4.pause();
        clapPlayer5.pause();
      } catch(e) {}
    }
    
    setState({ isPlaying: false, isProcessing: false });
  }, [player1, player2, player3, player4, player5, clapPlayer1, clapPlayer2, clapPlayer3, clapPlayer4, clapPlayer5]);

  /**
   * Load clap sound for web
   */
  const loadClapSound = useCallback(async (ctx: AudioContext) => {
    if (clapBufferRef.current) return clapBufferRef.current;
    
    try {
      // For web, we need to fetch the clap sound from assets
      // The asset is bundled, so we use a relative path
      const clapUrl = "/assets/sounds/sheeloha-claps.mp3";
      console.log("[useSheelohaPlayer] Loading clap sound from:", clapUrl);
      
      const response = await fetch(clapUrl);
      if (!response.ok) {
        console.warn("[useSheelohaPlayer] Failed to load clap sound, trying alternative path");
        // Try alternative path
        const altResponse = await fetch("./assets/sounds/sheeloha-claps.mp3");
        if (!altResponse.ok) {
          console.error("[useSheelohaPlayer] Could not load clap sound");
          return null;
        }
        const arrayBuffer = await altResponse.arrayBuffer();
        clapBufferRef.current = await ctx.decodeAudioData(arrayBuffer);
      } else {
        const arrayBuffer = await response.arrayBuffer();
        clapBufferRef.current = await ctx.decodeAudioData(arrayBuffer);
      }
      
      console.log("[useSheelohaPlayer] Clap sound loaded, duration:", clapBufferRef.current?.duration);
      return clapBufferRef.current;
    } catch (error) {
      console.error("[useSheelohaPlayer] Error loading clap sound:", error);
      return null;
    }
  }, []);

  /**
   * Play clap sound on web
   */
  const playClapOnWeb = useCallback((ctx: AudioContext, clapBuffer: AudioBuffer, volume: number, pan: number) => {
    const source = ctx.createBufferSource();
    source.buffer = clapBuffer;
    
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    
    const panNode = ctx.createStereoPanner();
    panNode.pan.value = pan;
    
    source.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(ctx.destination);
    
    sourceNodesRef.current.push(source);
    source.start();
  }, []);

  /**
   * Play on Web using Web Audio API for advanced effects
   * - Pitch shift via playbackRate
   * - Stereo panning (Right → Left)
   * - NO reverb
   * - Integrated clapping sound
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
      
      // Load clap sound
      const clapBuffer = await loadClapSound(ctx);
      
      // Fetch and decode voice audio
      console.log("[useSheelohaPlayer] Fetching voice audio...");
      const response = await fetch(audioUri);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      
      console.log("[useSheelohaPlayer] Voice audio decoded, duration:", audioBuffer.duration);
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
          // Play clap sound first (if available) - DISABLED FOR TESTING
          // if (clapBuffer) {
          //   playClapOnWeb(ctx, clapBuffer, SHEELOHA_CONFIG.clapVolumes[i], SHEELOHA_CONFIG.panValues[i]);
          //   console.log(`[useSheelohaPlayer] Playing clap ${i+1} at +${delay}ms, volume: ${SHEELOHA_CONFIG.clapVolumes[i]}`);
          // }
          
          // Create voice source node
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
            console.log(`[useSheelohaPlayer] Voice copy ${i+1} ended (${finishedCount}/${SHEELOHA_CONFIG.copies})`);
            if (finishedCount >= SHEELOHA_CONFIG.copies) {
              setState({ isPlaying: false, isProcessing: false });
            }
          };
          
          console.log(`[useSheelohaPlayer] Starting voice copy ${i+1} at +${delay}ms, volume: ${SHEELOHA_CONFIG.volumes[i]}, pan: ${startPan}→${endPan}, rate: ${SHEELOHA_CONFIG.playbackRate}`);
          source.start();
          
        }, delay);
        
        timeoutsRef.current.push(timeout);
      }
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Web Audio error:", error);
      setState({ isPlaying: false, isProcessing: false });
    }
  }, [stopSheeloha, loadClapSound, playClapOnWeb]);

  /**
   * Play on Native using expo-audio
   * Note: Native doesn't support stereo panning easily, so we use basic playback
   * with volume reduction and playback rate
   * Includes clapping sound with each copy
   */
  const playOnNative = useCallback(async (audioUri: string, clappingSpeed: ClappingSpeed = 2) => {
    console.log("[useSheelohaPlayer] Playing on Native:", audioUri, "speed:", clappingSpeed);
    
    stopSheeloha();
    setState({ isPlaying: true, isProcessing: false });
    
    const voicePlayers = [player1, player2, player3, player4, player5];
    const clapPlayers = [clapPlayer1, clapPlayer2, clapPlayer3, clapPlayer4, clapPlayer5];
    
    // Get clapping delay based on speed
    const clappingDelay = CLAPPING_DELAYS[clappingSpeed];
    
    for (let i = 0; i < SHEELOHA_CONFIG.copies; i++) {
      const delay = i * clappingDelay;
      
      const timeout = setTimeout(() => {
        console.log(`[useSheelohaPlayer] Starting native copy ${i+1} at +${delay}ms`);
        try {
          // Play clap sound - DISABLED FOR TESTING
          // clapPlayers[i].volume = SHEELOHA_CONFIG.clapVolumes[i];
          // clapPlayers[i].seekTo(0);
          // clapPlayers[i].play();
          // console.log(`[useSheelohaPlayer] Playing clap ${i+1}, volume: ${SHEELOHA_CONFIG.clapVolumes[i]}`);
          
          // Play voice
          voicePlayers[i].replace(audioUri);
          voicePlayers[i].volume = SHEELOHA_CONFIG.volumes[i];
          voicePlayers[i].play();
          console.log(`[useSheelohaPlayer] Playing voice ${i+1}, volume: ${SHEELOHA_CONFIG.volumes[i]}`);
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
    
  }, [stopSheeloha, player1, player2, player3, player4, player5, clapPlayer1, clapPlayer2, clapPlayer3, clapPlayer4, clapPlayer5]);

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
