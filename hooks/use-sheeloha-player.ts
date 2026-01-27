import { useState, useCallback, useRef, useEffect } from "react";
import { Platform } from "react-native";
import { useAudioPlayer } from "expo-audio";

/**
 * Clapping Speed Configuration
 * All speeds use original playback rate (1.0x)
 * The only difference is the clapping interval:
 * 0 = No clapping (DEFAULT)
 * 1 = Repeat clap every 1.25 seconds
 * 2 = Repeat clap every 1.19 seconds
 * 3 = Repeat clap every 1.14 seconds
 * 4 = Repeat clap every 0.9 seconds
 */
export type ClappingSpeed = 0 | 1 | 2 | 3 | 4;

/**
 * Clapping intervals for each speed option (in ms)
 */
const CLAPPING_INTERVALS: Record<ClappingSpeed, number> = {
  0: 0,     // No clapping
  1: 1250,  // 1.25 seconds
  2: 1190,  // 1.19 seconds
  3: 1140,  // 1.14 seconds
  4: 900,   // 0.9 seconds
};

// Clapping sound asset - short single clap (0.5 seconds)
const CLAP_SOUND_URI = require("@/assets/sounds/sheeloha-claps.mp3");

/**
 * Sheeloha Effect Configuration
 * 5 voice copies + clapping (based on selected speed)
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
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]); // For clapping intervals
  const checkIntervalsRef = useRef<ReturnType<typeof setInterval>[]>([]); // For checking player finished
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
      checkIntervalsRef.current.forEach(i => clearInterval(i));
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
    checkIntervalsRef.current.forEach(i => clearInterval(i));
    checkIntervalsRef.current = [];
    
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
   * Play single clap on web with chorus effect
   */
  const play3OverlappingClapsOnWeb = useCallback((ctx: AudioContext, clapBuffer: AudioBuffer, volume: number) => {
    if (!isPlayingRef.current) return;
    
    // Play single clap with chorus effect
    const source = ctx.createBufferSource();
    source.buffer = clapBuffer;
    
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    sourceNodesRef.current.push(source);
    source.start();
  }, []);

  /**
   * Start clapping pattern based on speed (single clap with chorus effect)
   * Plays single clap that repeats until voice finishes
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
    
    // Play first clap immediately
    play3OverlappingClapsOnWeb(ctx, clapBuffer, volume);
    
    // Get interval from config
    const intervalMs = CLAPPING_INTERVALS[speed];
    if (intervalMs === 0) return;
    
    const interval = setInterval(() => {
      if (isPlayingRef.current) {
        play3OverlappingClapsOnWeb(ctx, clapBuffer, volume);
      } else {
        clearInterval(interval);
      }
    }, intervalMs);
    intervalsRef.current.push(interval);
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
      
      // Start clapping pattern for this round (for speeds 1-4, not 0)
      if (clapBuffer && clappingSpeed > 0) {
        startClappingPattern(ctx, clapBuffer, clappingSpeed, volume);
      }
    });
  }, [startClappingPattern]);

  /**
   * Play on Web using Web Audio API - SINGLE ROUND
   */
  const playOnWeb = useCallback(async (audioUri: string, clappingSpeed: ClappingSpeed = 0) => {
    console.log("[useSheelohaPlayer] Playing on Web (1 round):", audioUri, "speed:", clappingSpeed);
    
    // Don't call stopSheeloha() here as it resets isPlaying to false
    // Just clear any existing timeouts/intervals and stop sources directly
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
    intervalsRef.current.forEach(i => clearInterval(i));
    intervalsRef.current = [];
    checkIntervalsRef.current.forEach(i => clearInterval(i));
    checkIntervalsRef.current = [];
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
      
      // SINGLE ROUND: 35% volume
      currentRoundRef.current = 1;
      await playRoundOnWeb(ctx, audioBuffer, clapBuffer, SHEELOHA_CONFIG.volume, clappingSpeed, 1);
      
      // All done
      isPlayingRef.current = false;
      currentRoundRef.current = 0;
      setState({ isPlaying: false, isProcessing: false });
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Web Audio error:", error);
      isPlayingRef.current = false;
      setState({ isPlaying: false, isProcessing: false });
    }
  }, [loadClapSound, playRoundOnWeb]);

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
    
    // Play single clap with chorus effect (single copy)
    if (!isPlayingRef.current) return;
    try {
      clapPlayer.seekTo(0);
      clapPlayer.volume = volume;
      clapPlayer.play();
    } catch (e) {
      console.error("[useSheelohaPlayer] Native clap error:", e);
    }
  }, [clapPlayer]);

  /**
   * Start clapping pattern on native (single clap with chorus effect)
   */
  const startClappingPatternNative = useCallback((speed: ClappingSpeed, volume: number) => {
    console.log("[useSheelohaPlayer] Starting native clapping pattern, speed:", speed, "volume:", volume);
    
    // Speed 0: No clapping at all
    if (speed === 0) {
      console.log("[useSheelohaPlayer] No clapping (speed 0)");
      return;
    }
    
    // Play first clap immediately
    play3OverlappingClapsOnNative(volume);
    
    // Get interval from config
    const intervalMs = CLAPPING_INTERVALS[speed];
    if (intervalMs === 0) return;
    
    const interval = setInterval(() => {
      if (isPlayingRef.current) {
        play3OverlappingClapsOnNative(volume);
      } else {
        clearInterval(interval);
      }
    }, intervalMs);
    intervalsRef.current.push(interval);
  }, [play3OverlappingClapsOnNative]);

  /**
   * Play a single round on Native
   * Returns a promise that resolves when all audio copies finish playing
   * Clapping continues while audio is playing and stops when audio stops
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
      let startedCount = 0;
      let finishedCount = 0;
      let resolvedAlready = false;
      
      // Start clapping pattern for this round
      startClappingPatternNative(clappingSpeed, volume);
      
      // Function to check if a player has finished
      const checkPlayerFinished = (playerIndex: number) => {
        const checkInterval = setInterval(() => {
          if (!isPlayingRef.current) {
            clearInterval(checkInterval);
            return;
          }
          
          const player = voicePlayers[playerIndex];
          // Check if player has stopped playing
          if (!player.playing) {
            clearInterval(checkInterval);
            finishedCount++;
            console.log(`[useSheelohaPlayer] Voice copy ${playerIndex + 1} finished, total finished: ${finishedCount}`);
            
            // When all 5 copies have finished, stop clapping and resolve
            if (finishedCount >= SHEELOHA_CONFIG.voiceCopies && !resolvedAlready) {
              console.log(`[useSheelohaPlayer] All voice copies finished, stopping clapping`);
              // Stop clapping
              intervalsRef.current.forEach(interval => clearInterval(interval));
              intervalsRef.current = [];
              
              resolvedAlready = true;
              resolve();
            }
          }
        }, 100); // Check every 100ms
        
        checkIntervalsRef.current.push(checkInterval);
      };
      
      // Play 5 voice copies with 50ms delay
      for (let i = 0; i < SHEELOHA_CONFIG.voiceCopies; i++) {
        const delay = i * SHEELOHA_CONFIG.delayBetweenCopies;
        
        const timeout = setTimeout(() => {
          if (!isPlayingRef.current) {
            if (!resolvedAlready) {
              resolvedAlready = true;
              resolve();
            }
            return;
          }
          
          try {
            voicePlayers[i].replace(audioUri);
            voicePlayers[i].volume = volume;
            voicePlayers[i].setPlaybackRate(SHEELOHA_CONFIG.playbackRate);
            voicePlayers[i].play();
            startedCount++;
            console.log(`[useSheelohaPlayer] Started voice copy ${i+1} for round ${roundNumber}`);
            
            // Start checking when this player finishes
            // Wait a bit before starting to check (give time for audio to load)
            const checkDelay = setTimeout(() => {
              checkPlayerFinished(i);
            }, 500);
            timeoutsRef.current.push(checkDelay);
            
          } catch (e) {
            console.error(`[useSheelohaPlayer] Native play error for copy ${i+1}:`, e);
            finishedCount++; // Count as finished if failed
          }
        }, delay);
        
        timeoutsRef.current.push(timeout);
      }
      
      // Safety timeout: if audio takes too long (max 30 seconds), force stop
      const safetyTimeout = setTimeout(() => {
        if (!resolvedAlready) {
          console.log(`[useSheelohaPlayer] Safety timeout reached, forcing stop`);
          intervalsRef.current.forEach(interval => clearInterval(interval));
          intervalsRef.current = [];
          checkIntervalsRef.current.forEach(interval => clearInterval(interval));
          checkIntervalsRef.current = [];
          resolvedAlready = true;
          resolve();
        }
      }, 30000);
      timeoutsRef.current.push(safetyTimeout);
    });
  }, [player1, player2, player3, player4, player5, startClappingPatternNative]);

  /**
   * Play on Native using expo-audio - SINGLE ROUND
   */
  const playOnNative = useCallback(async (audioUri: string, clappingSpeed: ClappingSpeed = 0) => {
    console.log("[useSheelohaPlayer] Playing on Native (1 round):", audioUri, "speed:", clappingSpeed);
    
    // Don't call stopSheeloha() here as it resets isPlaying to false
    // Just clear any existing timeouts/intervals and stop players directly
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
    intervalsRef.current.forEach(i => clearInterval(i));
    intervalsRef.current = [];
    checkIntervalsRef.current.forEach(i => clearInterval(i));
    checkIntervalsRef.current = [];
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
    
    // SINGLE ROUND: 35% volume
    currentRoundRef.current = 1;
    await playRoundOnNative(audioUri, SHEELOHA_CONFIG.volume, clappingSpeed, 1);
    
    // All done
    isPlayingRef.current = false;
    currentRoundRef.current = 0;
    setState({ isPlaying: false, isProcessing: false });
    
  }, [playRoundOnNative]);

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
