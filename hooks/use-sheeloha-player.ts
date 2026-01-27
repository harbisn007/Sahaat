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
 * Sheeloha Effect Configuration - NEW LOGIC
 * Two rounds played sequentially:
 * Round 1: 5 voice copies (35%) + 3 clap copies (35%)
 * Round 2: 5 voice copies (15%) + 3 clap copies (15%)
 */
const SHEELOHA_CONFIG = {
  // Number of overlapping voice copies
  voiceCopies: 5,
  // Number of overlapping clap copies
  clapCopies: 3,
  // Fixed delay between each copy start (in ms)
  delayBetweenCopies: 50,
  // Round 1: Close sound (35% volume)
  round1Volume: 0.35,
  // Round 2: Distant sound (15% volume)
  round2Volume: 0.15,
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
  // Store web audio context and nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const panNodesRef = useRef<StereoPannerNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);
  // Store clap audio buffer for web
  const clapBufferRef = useRef<AudioBuffer | null>(null);
  // Track if clapping should continue
  const isPlayingRef = useRef<boolean>(false);
  // Track current round
  const currentRoundRef = useRef<number>(0);

  // Preload clap sound on mount (web and native)
  useEffect(() => {
    if (Platform.OS === "web") {
      const preloadClapSound = async () => {
        try {
          // Create AudioContext for preloading
          const ctx = new AudioContext();
          audioContextRef.current = ctx;
          
          const clapUrl = "/assets/sounds/sheeloha-claps.mp3";
          console.log("[useSheelohaPlayer] Preloading clap sound...");
          
          const response = await fetch(clapUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            clapBufferRef.current = await ctx.decodeAudioData(arrayBuffer);
            console.log("[useSheelohaPlayer] Clap sound preloaded successfully");
          } else {
            // Try alternative path
            const altResponse = await fetch("./assets/sounds/sheeloha-claps.mp3");
            if (altResponse.ok) {
              const arrayBuffer = await altResponse.arrayBuffer();
              clapBufferRef.current = await ctx.decodeAudioData(arrayBuffer);
              console.log("[useSheelohaPlayer] Clap sound preloaded from alt path");
            }
          }
        } catch (error) {
          console.error("[useSheelohaPlayer] Error preloading clap sound:", error);
        }
      };
      
      preloadClapSound();
    } else {
      // Native: Preload clap sound by playing it silently
      const preloadNativeClap = async () => {
        try {
          console.log("[useSheelohaPlayer] Preloading native clap sound...");
          // Set volume to 0 and play briefly to preload
          clapPlayer.volume = 0;
          clapPlayer.play();
          // Stop after a short delay
          setTimeout(() => {
            try {
              clapPlayer.pause();
              clapPlayer.seekTo(0);
              clapPreloadedRef.current = true;
              console.log("[useSheelohaPlayer] Native clap sound preloaded successfully");
            } catch (e) {
              // Ignore errors during preload cleanup
            }
          }, 100);
        } catch (error) {
          console.error("[useSheelohaPlayer] Error preloading native clap sound:", error);
        }
      };
      
      // Delay preload slightly to ensure player is ready
      setTimeout(preloadNativeClap, 500);
    }
  }, [clapPlayer]);

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
    currentRoundRef.current = 0;
    
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
   * Play 3 overlapping claps on web
   */
  const play3OverlappingClapsOnWeb = useCallback((ctx: AudioContext, clapBuffer: AudioBuffer, volume: number) => {
    if (!isPlayingRef.current) return;
    
    // Play 3 claps with 50ms delay between each
    for (let i = 0; i < SHEELOHA_CONFIG.clapCopies; i++) {
      const delay = i * SHEELOHA_CONFIG.delayBetweenCopies;
      
      const timeout = setTimeout(() => {
        if (!isPlayingRef.current) return;
        
        const source = ctx.createBufferSource();
        source.buffer = clapBuffer;
        
        const gainNode = ctx.createGain();
        gainNode.gain.value = volume;
        
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        sourceNodesRef.current.push(source);
        source.start();
      }, delay);
      
      timeoutsRef.current.push(timeout);
    }
  }, []);

  /**
   * Start clapping pattern based on speed
   * Plays 3 overlapping claps that repeat until voice finishes
   */
  const startClappingPattern = useCallback((
    ctx: AudioContext, 
    clapBuffer: AudioBuffer, 
    speed: ClappingSpeed,
    volume: number
  ) => {
    console.log("[useSheelohaPlayer] Starting clapping pattern, speed:", speed, "volume:", volume);
    
    // Speed 0: No clapping at all
    if (speed === 0) {
      console.log("[useSheelohaPlayer] No clapping (speed 0)");
      return;
    }
    
    // Play first set of 3 overlapping claps immediately
    play3OverlappingClapsOnWeb(ctx, clapBuffer, volume);
    
    if (speed === 1) {
      // Speed 1: Repeat every 1.27 seconds (1270ms)
      const interval = setInterval(() => {
        if (isPlayingRef.current) {
          play3OverlappingClapsOnWeb(ctx, clapBuffer, volume);
        } else {
          clearInterval(interval);
        }
      }, 1270);
      intervalsRef.current.push(interval);
      
    } else if (speed === 2) {
      // Speed 2: Repeat every 1.12 seconds (1120ms)
      const interval = setInterval(() => {
        if (isPlayingRef.current) {
          play3OverlappingClapsOnWeb(ctx, clapBuffer, volume);
        } else {
          clearInterval(interval);
        }
      }, 1120);
      intervalsRef.current.push(interval);
      
    } else if (speed === 3) {
      // Speed 3: 2 sets of 3 claps, pause 0.9s, repeat
      const runPattern = () => {
        if (!isPlayingRef.current) return;
        
        play3OverlappingClapsOnWeb(ctx, clapBuffer, volume);
        
        const clap2 = setTimeout(() => {
          if (isPlayingRef.current) play3OverlappingClapsOnWeb(ctx, clapBuffer, volume);
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
  }, [play3OverlappingClapsOnWeb]);

  /**
   * Play a single round on Web (5 voice copies + clapping)
   * Returns a promise that resolves when the round finishes
   */
  const playRoundOnWeb = useCallback(async (
    ctx: AudioContext,
    audioBuffer: AudioBuffer,
    clapBuffer: AudioBuffer | null,
    volume: number,
    clappingSpeed: ClappingSpeed,
    roundNumber: number
  ): Promise<void> => {
    return new Promise((resolve) => {
      console.log(`[useSheelohaPlayer] Playing round ${roundNumber} at ${volume * 100}% volume`);
      
      let finishedCount = 0;
      
      // Create 5 voice copies with 50ms delay between each
      for (let i = 0; i < SHEELOHA_CONFIG.voiceCopies; i++) {
        const delay = i * SHEELOHA_CONFIG.delayBetweenCopies;
        
        const timeout = setTimeout(() => {
          if (!isPlayingRef.current) {
            resolve();
            return;
          }
          
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.playbackRate.value = SHEELOHA_CONFIG.playbackRate;
          
          const gainNode = ctx.createGain();
          gainNode.gain.value = volume; // Same volume for all copies
          
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
            // When ALL copies finish, stop clapping and resolve
            if (finishedCount >= SHEELOHA_CONFIG.voiceCopies) {
              console.log(`[useSheelohaPlayer] Round ${roundNumber} finished`);
              // Stop clapping for this round
              intervalsRef.current.forEach(i => clearInterval(i));
              intervalsRef.current = [];
              resolve();
            }
          };
          
          source.start();
          
        }, delay);
        
        timeoutsRef.current.push(timeout);
      }
      
      // Start clapping pattern for this round
      if (clapBuffer && clappingSpeed > 0) {
        startClappingPattern(ctx, clapBuffer, clappingSpeed, volume);
      }
    });
  }, [startClappingPattern]);

  /**
   * Play on Web using Web Audio API - TWO SEQUENTIAL ROUNDS
   */
  const playOnWeb = useCallback(async (audioUri: string, clappingSpeed: ClappingSpeed = 0) => {
    console.log("[useSheelohaPlayer] Playing on Web (2 rounds):", audioUri, "speed:", clappingSpeed);
    
    // Don't call stopSheeloha() here as it resets isPlaying to false
    // Just clear any existing timeouts/intervals and stop sources directly
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
    intervalsRef.current.forEach(i => clearInterval(i));
    intervalsRef.current = [];
    sourceNodesRef.current.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    sourceNodesRef.current = [];
    panNodesRef.current = [];
    gainNodesRef.current = [];
    
    // Set playing state FIRST before any async operations
    isPlayingRef.current = true;
    setState({ isPlaying: true, isProcessing: true });
    console.log("[useSheelohaPlayer] State set to isPlaying: true");
    
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
      
      // ROUND 1: 35% volume
      currentRoundRef.current = 1;
      await playRoundOnWeb(ctx, audioBuffer, clapBuffer, SHEELOHA_CONFIG.round1Volume, clappingSpeed, 1);
      
      // Check if still playing (not stopped by user)
      if (!isPlayingRef.current) {
        setState({ isPlaying: false, isProcessing: false });
        return;
      }
      
      // ROUND 2: 15% volume (distant echo)
      currentRoundRef.current = 2;
      await playRoundOnWeb(ctx, audioBuffer, clapBuffer, SHEELOHA_CONFIG.round2Volume, clappingSpeed, 2);
      
      // All done
      isPlayingRef.current = false;
      currentRoundRef.current = 0;
      setState({ isPlaying: false, isProcessing: false });
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Web Audio error:", error);
      isPlayingRef.current = false;
      setState({ isPlaying: false, isProcessing: false });
    }
  }, [stopSheeloha, loadClapSound, playRoundOnWeb]);

  /**
   * Play 3 overlapping claps on native
   */
  const play3OverlappingClapsOnNative = useCallback((volume: number) => {
    if (!isPlayingRef.current) return;
    
    // If clap not preloaded yet, try to preload first
    if (!clapPreloadedRef.current) {
      console.log("[useSheelohaPlayer] Clap not preloaded, attempting preload...");
      try {
        clapPlayer.volume = 0;
        clapPlayer.play();
        setTimeout(() => {
          try {
            clapPlayer.pause();
            clapPlayer.seekTo(0);
            clapPreloadedRef.current = true;
          } catch (e) {}
        }, 50);
      } catch (e) {}
    }
    
    // Play 3 claps with 50ms delay between each
    for (let i = 0; i < SHEELOHA_CONFIG.clapCopies; i++) {
      const delay = i * SHEELOHA_CONFIG.delayBetweenCopies;
      
      const timeout = setTimeout(() => {
        if (!isPlayingRef.current) return;
        try {
          clapPlayer.seekTo(0);
          clapPlayer.volume = volume;
          clapPlayer.play();
        } catch (e) {
          console.error("[useSheelohaPlayer] Native clap error:", e);
        }
      }, delay);
      
      timeoutsRef.current.push(timeout);
    }
  }, [clapPlayer]);

  /**
   * Start clapping pattern on native
   */
  const startClappingPatternNative = useCallback((speed: ClappingSpeed, volume: number) => {
    console.log("[useSheelohaPlayer] Starting native clapping pattern, speed:", speed, "volume:", volume);
    
    // Speed 0: No clapping at all
    if (speed === 0) {
      console.log("[useSheelohaPlayer] No clapping (speed 0)");
      return;
    }
    
    // Play first set of 3 overlapping claps immediately
    play3OverlappingClapsOnNative(volume);
    
    if (speed === 1) {
      // Speed 1: Repeat every 1.27 seconds (1270ms)
      const interval = setInterval(() => {
        if (isPlayingRef.current) {
          play3OverlappingClapsOnNative(volume);
        } else {
          clearInterval(interval);
        }
      }, 1270);
      intervalsRef.current.push(interval);
      
    } else if (speed === 2) {
      // Speed 2: Repeat every 1.12 seconds (1120ms)
      const interval = setInterval(() => {
        if (isPlayingRef.current) {
          play3OverlappingClapsOnNative(volume);
        } else {
          clearInterval(interval);
        }
      }, 1120);
      intervalsRef.current.push(interval);
      
    } else if (speed === 3) {
      // Speed 3: 2 sets of 3 claps, pause 0.9s, repeat
      const runPattern = () => {
        if (!isPlayingRef.current) return;
        
        play3OverlappingClapsOnNative(volume);
        
        const clap2 = setTimeout(() => {
          if (isPlayingRef.current) play3OverlappingClapsOnNative(volume);
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
  }, [play3OverlappingClapsOnNative]);

  /**
   * Play a single round on Native
   * Returns a promise that resolves when the round finishes
   */
  const playRoundOnNative = useCallback(async (
    audioUri: string,
    volume: number,
    clappingSpeed: ClappingSpeed,
    roundNumber: number
  ): Promise<void> => {
    return new Promise((resolve) => {
      console.log(`[useSheelohaPlayer] Playing native round ${roundNumber} at ${volume * 100}% volume`);
      
      const voicePlayers = [player1, player2, player3, player4, player5];
      let finishedCount = 0;
      
      // Start clapping pattern for this round
      startClappingPatternNative(clappingSpeed, volume);
      
      // Play 5 voice copies with 50ms delay
      for (let i = 0; i < SHEELOHA_CONFIG.voiceCopies; i++) {
        const delay = i * SHEELOHA_CONFIG.delayBetweenCopies;
        
        const timeout = setTimeout(() => {
          if (!isPlayingRef.current) {
            resolve();
            return;
          }
          
          try {
            voicePlayers[i].replace(audioUri);
            voicePlayers[i].volume = volume; // Same volume for all copies
            
            // Listen for when this copy finishes playing
            const checkFinished = setInterval(() => {
              if (!voicePlayers[i].playing) {
                clearInterval(checkFinished);
                finishedCount++;
                
                // When ALL copies finish, stop clapping and resolve
                if (finishedCount >= SHEELOHA_CONFIG.voiceCopies) {
                  console.log(`[useSheelohaPlayer] Native round ${roundNumber} finished`);
                  intervalsRef.current.forEach(interval => clearInterval(interval));
                  intervalsRef.current = [];
                  resolve();
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
    });
  }, [player1, player2, player3, player4, player5, startClappingPatternNative]);

  /**
   * Play on Native using expo-audio - TWO SEQUENTIAL ROUNDS
   */
  const playOnNative = useCallback(async (audioUri: string, clappingSpeed: ClappingSpeed = 0) => {
    console.log("[useSheelohaPlayer] Playing on Native (2 rounds):", audioUri, "speed:", clappingSpeed);
    
    // Don't call stopSheeloha() here as it resets isPlaying to false
    // Just clear any existing timeouts/intervals and stop players directly
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
    intervalsRef.current.forEach(i => clearInterval(i));
    intervalsRef.current = [];
    try {
      player1.pause();
      player2.pause();
      player3.pause();
      player4.pause();
      player5.pause();
      clapPlayer.pause();
    } catch(e) {}
    
    // Set playing state FIRST before any async operations
    isPlayingRef.current = true;
    setState({ isPlaying: true, isProcessing: false });
    console.log("[useSheelohaPlayer] State set to isPlaying: true");
    
    // ROUND 1: 35% volume
    currentRoundRef.current = 1;
    await playRoundOnNative(audioUri, SHEELOHA_CONFIG.round1Volume, clappingSpeed, 1);
    
    // Check if still playing (not stopped by user)
    if (!isPlayingRef.current) {
      setState({ isPlaying: false, isProcessing: false });
      return;
    }
    
    // ROUND 2: 15% volume (distant echo)
    currentRoundRef.current = 2;
    await playRoundOnNative(audioUri, SHEELOHA_CONFIG.round2Volume, clappingSpeed, 2);
    
    // All done
    isPlayingRef.current = false;
    currentRoundRef.current = 0;
    setState({ isPlaying: false, isProcessing: false });
    
  }, [stopSheeloha, playRoundOnNative]);

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
