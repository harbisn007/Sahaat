import { useState, useCallback, useRef, useEffect } from "react";
import { Platform } from "react-native";
import { useAudioPlayer } from "expo-audio";

/**
 * Clapping Speed Configuration
 * 0 = No clapping (DEFAULT)
 * 1 = Repeat clap every 1.27 seconds
 * 2 = Repeat clap every 1.12 seconds
 * 3 = 2 claps, pause 0.9s, 2 claps, pause 0.9s, etc.
 */
export type ClappingSpeed = 0 | 1 | 2 | 3;

// Clapping sound asset - short single clap (0.5 seconds)
const CLAP_SOUND_URI = require("@/assets/sounds/sheeloha-claps.mp3");

/**
 * Sheeloha Effect Configuration
 * - 5 overlapping copies
 * - Distant sound (quieter)
 * - Higher pitch (faster playback)
 * - Fixed delay between copies (50ms)
 * - Center stereo (no left/right movement)
 * - NO reverb/echo
 * - NO LOOP - plays once only
 */
const SHEELOHA_CONFIG = {
  // Number of overlapping copies
  copies: 5,
  // Fixed delay between each copy start (in ms)
  delayBetweenCopies: 50,
  // Volume for each copy - distant but audible
  volumes: [0.25, 0.20, 0.15, 0.12, 0.10],
  // Clap volume - distant like the voice copies (~25%)
  clapVolume: 0.25,
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
 * - Center stereo
 * - NO reverb
 * - Clapping patterns based on speed selection
 * - NO LOOP - plays once and stops
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
  
  // Single clap player for native
  const clapPlayer = useAudioPlayer(CLAP_SOUND_URI);
  
  // Store timeouts and intervals for cleanup
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  // Store web audio context and nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const panNodesRef = useRef<StereoPannerNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);
  // Store clap audio buffer for web
  const clapBufferRef = useRef<AudioBuffer | null>(null);
  // Track if clapping should continue
  const isPlayingRef = useRef<boolean>(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(t => clearTimeout(t));
      intervalsRef.current.forEach(i => clearInterval(i));
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
    
    isPlayingRef.current = false;
    
    // Clear timeouts and intervals
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
    intervalsRef.current.forEach(i => clearInterval(i));
    intervalsRef.current = [];
    
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
        clapPlayer.pause();
      } catch(e) {}
    }
    
    setState({ isPlaying: false, isProcessing: false });
  }, [player1, player2, player3, player4, player5, clapPlayer]);

  /**
   * Load clap sound for web
   */
  const loadClapSound = useCallback(async (ctx: AudioContext) => {
    if (clapBufferRef.current) return clapBufferRef.current;
    
    try {
      const clapUrl = "/assets/sounds/sheeloha-claps.mp3";
      console.log("[useSheelohaPlayer] Loading clap sound from:", clapUrl);
      
      const response = await fetch(clapUrl);
      if (!response.ok) {
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
   * Play single clap on web
   */
  const playSingleClapOnWeb = useCallback((ctx: AudioContext, clapBuffer: AudioBuffer) => {
    if (!isPlayingRef.current) return;
    
    const source = ctx.createBufferSource();
    source.buffer = clapBuffer;
    
    const gainNode = ctx.createGain();
    gainNode.gain.value = SHEELOHA_CONFIG.clapVolume;
    
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    sourceNodesRef.current.push(source);
    source.start();
  }, []);

  /**
   * Start clapping pattern based on speed (for duration of audio only)
   * Clapping continues until audio finishes (synced with voice)
   */
  const startClappingPattern = useCallback((
    ctx: AudioContext, 
    clapBuffer: AudioBuffer, 
    speed: ClappingSpeed,
    durationMs: number
  ) => {
    // Clapping continues for the full duration of audio
    // Will be stopped when voice copies finish via onended callback
    console.log("[useSheelohaPlayer] Starting clapping pattern, speed:", speed, "duration:", durationMs);
    
    // Speed 0: No clapping at all
    if (speed === 0) {
      console.log("[useSheelohaPlayer] No clapping (speed 0)");
      return;
    }
    
    // Play first clap immediately
    playSingleClapOnWeb(ctx, clapBuffer);
    
    // Clapping continues while isPlayingRef is true (synced with voice audio)
    // Will be stopped when voice copies finish via onended callback
    
    if (speed === 1) {
      // Speed 1: Repeat every 1.27 seconds (1270ms)
      const interval = setInterval(() => {
        if (isPlayingRef.current) {
          playSingleClapOnWeb(ctx, clapBuffer);
        } else {
          clearInterval(interval);
        }
      }, 1270);
      intervalsRef.current.push(interval);
      
    } else if (speed === 2) {
      // Speed 2: Repeat every 1.12 seconds (1120ms)
      const interval = setInterval(() => {
        if (isPlayingRef.current) {
          playSingleClapOnWeb(ctx, clapBuffer);
        } else {
          clearInterval(interval);
        }
      }, 1120);
      intervalsRef.current.push(interval);
      
    } else if (speed === 3) {
      // Speed 3: 2 claps, pause 0.9s, repeat
      const runPattern = () => {
        if (!isPlayingRef.current) return;
        
        playSingleClapOnWeb(ctx, clapBuffer);
        
        const clap2 = setTimeout(() => {
          if (isPlayingRef.current) playSingleClapOnWeb(ctx, clapBuffer);
        }, 100);
        timeoutsRef.current.push(clap2);
        
        // After 1000ms (100ms for claps + 900ms pause), repeat
        const nextCycle = setTimeout(() => {
          if (isPlayingRef.current) {
            runPattern();
          }
        }, 1000);
        timeoutsRef.current.push(nextCycle);
      };
      
      runPattern();
    }
  }, [playSingleClapOnWeb]);

  /**
   * Play on Web using Web Audio API (NO LOOP - plays once)
   */
  const playOnWeb = useCallback(async (audioUri: string, clappingSpeed: ClappingSpeed = 0) => {
    console.log("[useSheelohaPlayer] Playing on Web (no loop):", audioUri, "speed:", clappingSpeed);
    
    stopSheeloha();
    isPlayingRef.current = true;
    setState({ isPlaying: true, isProcessing: true });
    
    try {
      // Create or reuse AudioContext
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      
      // Resume context if suspended
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
      
      // Calculate total duration (accounting for playback rate)
      // Add extra delay for the last copy (4 * 50ms = 200ms)
      const lastCopyDelay = (SHEELOHA_CONFIG.copies - 1) * SHEELOHA_CONFIG.delayBetweenCopies;
      const audioDurationMs = (audioBuffer.duration / SHEELOHA_CONFIG.playbackRate) * 1000;
      const totalDurationMs = audioDurationMs + lastCopyDelay;
      
      console.log("[useSheelohaPlayer] Audio duration:", audioDurationMs, "ms, Total with delays:", totalDurationMs, "ms");
      
      let finishedCount = 0;
      
      // Create 5 voice copies with 50ms delay between each
      for (let i = 0; i < SHEELOHA_CONFIG.copies; i++) {
        const delay = i * SHEELOHA_CONFIG.delayBetweenCopies;
        
        const timeout = setTimeout(() => {
          if (!isPlayingRef.current) return;
          
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.playbackRate.value = SHEELOHA_CONFIG.playbackRate;
          
          const gainNode = ctx.createGain();
          gainNode.gain.value = SHEELOHA_CONFIG.volumes[i];
          
          const panNode = ctx.createStereoPanner();
          panNode.pan.value = SHEELOHA_CONFIG.panValues[i];
          
          source.connect(gainNode);
          gainNode.connect(panNode);
          panNode.connect(ctx.destination);
          
          sourceNodesRef.current.push(source);
          panNodesRef.current.push(panNode);
          gainNodesRef.current.push(gainNode);
          
          source.onended = () => {
            finishedCount++;
            // Stop clapping when ALL copies finish (last one ends)
            // This ensures clapping continues for the full duration of the overlapping voices
            if (finishedCount >= SHEELOHA_CONFIG.copies) {
              console.log("[useSheelohaPlayer] All voice copies finished, stopping clapping");
              isPlayingRef.current = false;
              // Clear clapping intervals
              intervalsRef.current.forEach(i => clearInterval(i));
              intervalsRef.current = [];
              setState({ isPlaying: false, isProcessing: false });
            }
          };
          
          source.start();
          
        }, delay);
        
        timeoutsRef.current.push(timeout);
      }
      
      // Start clapping pattern - it will continue until voice copies finish
      // Pass totalDurationMs so clapping knows when to stop
      if (clapBuffer) {
        startClappingPattern(ctx, clapBuffer, clappingSpeed, totalDurationMs);
      }
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Web Audio error:", error);
      isPlayingRef.current = false;
      setState({ isPlaying: false, isProcessing: false });
    }
  }, [stopSheeloha, loadClapSound, startClappingPattern]);

  /**
   * Play single clap on native
   */
  const playSingleClapOnNative = useCallback(() => {
    if (!isPlayingRef.current) return;
    try {
      clapPlayer.seekTo(0);
      clapPlayer.volume = SHEELOHA_CONFIG.clapVolume;
      clapPlayer.play();
    } catch (e) {
      console.error("[useSheelohaPlayer] Native clap error:", e);
    }
  }, [clapPlayer]);

  /**
   * Start clapping pattern on native (for duration of audio only)
   * Clapping continues until audio finishes (synced with voice)
   */
  const startClappingPatternNative = useCallback((speed: ClappingSpeed, durationMs: number) => {
    console.log("[useSheelohaPlayer] Starting native clapping pattern, speed:", speed, "duration:", durationMs);
    
    // Speed 0: No clapping at all
    if (speed === 0) {
      console.log("[useSheelohaPlayer] No clapping (speed 0)");
      return;
    }
    
    // Play first clap immediately
    playSingleClapOnNative();
    
    // Clapping continues while isPlayingRef is true (synced with voice audio)
    
    if (speed === 1) {
      // Speed 1: Repeat every 1.27 seconds (1270ms)
      const interval = setInterval(() => {
        if (isPlayingRef.current) {
          playSingleClapOnNative();
        } else {
          clearInterval(interval);
        }
      }, 1270);
      intervalsRef.current.push(interval);
      
    } else if (speed === 2) {
      // Speed 2: Repeat every 1.12 seconds (1120ms)
      const interval = setInterval(() => {
        if (isPlayingRef.current) {
          playSingleClapOnNative();
        } else {
          clearInterval(interval);
        }
      }, 1120);
      intervalsRef.current.push(interval);
      
    } else if (speed === 3) {
      // Speed 3: 2 claps, pause 0.9s, repeat
      const runPattern = () => {
        if (!isPlayingRef.current) return;
        
        playSingleClapOnNative();
        
        const clap2 = setTimeout(() => {
          if (isPlayingRef.current) playSingleClapOnNative();
        }, 100);
        timeoutsRef.current.push(clap2);
        
        // After 1000ms (100ms for claps + 900ms pause), repeat
        const nextCycle = setTimeout(() => {
          if (isPlayingRef.current) {
            runPattern();
          }
        }, 1000);
        timeoutsRef.current.push(nextCycle);
      };
      
      runPattern();
    }
  }, [playSingleClapOnNative]);

  /**
   * Play on Native using expo-audio (NO LOOP - plays once)
   */
  const playOnNative = useCallback(async (audioUri: string, clappingSpeed: ClappingSpeed = 0) => {
    console.log("[useSheelohaPlayer] Playing on Native (no loop):", audioUri, "speed:", clappingSpeed);
    
    stopSheeloha();
    isPlayingRef.current = true;
    setState({ isPlaying: true, isProcessing: false });
    
    const voicePlayers = [player1, player2, player3, player4, player5];
    let finishedCount = 0;
    
    // Start clapping pattern - will continue until first voice copy ends
    startClappingPatternNative(clappingSpeed, 60000); // Max 60s, will be stopped by onPlaybackStatusUpdate
    
    // Play 5 voice copies with 50ms delay
    for (let i = 0; i < SHEELOHA_CONFIG.copies; i++) {
      const delay = i * SHEELOHA_CONFIG.delayBetweenCopies;
      
      const timeout = setTimeout(() => {
        if (!isPlayingRef.current) return;
        
        try {
          voicePlayers[i].replace(audioUri);
          voicePlayers[i].volume = SHEELOHA_CONFIG.volumes[i];
          
          // Listen for when this copy finishes playing
          const checkFinished = setInterval(() => {
            if (!voicePlayers[i].playing) {
              clearInterval(checkFinished);
              finishedCount++;
              
              // Stop clapping when ALL copies finish (last one ends)
              if (finishedCount >= SHEELOHA_CONFIG.copies) {
                console.log("[useSheelohaPlayer] All native voice copies finished, stopping clapping");
                isPlayingRef.current = false;
                intervalsRef.current.forEach(interval => clearInterval(interval));
                intervalsRef.current = [];
                setState({ isPlaying: false, isProcessing: false });
              }
            }
          }, 100);
          
          voicePlayers[i].play();
        } catch (e) {
          console.error(`[useSheelohaPlayer] Native play error for copy ${i+1}:`, e);
        }
      }, delay);
      
      timeoutsRef.current.push(timeout);
    }
    
  }, [stopSheeloha, player1, player2, player3, player4, player5, startClappingPatternNative]);

  /**
   * Main play function
   * @param audioUri - URL of the audio to play
   * @param clappingSpeed - Speed of clapping (0=none default, 1=slow, 2=medium, 3=pattern)
   */
  const playSheeloha = useCallback(async (audioUri: string, clappingSpeed: ClappingSpeed = 0) => {
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
