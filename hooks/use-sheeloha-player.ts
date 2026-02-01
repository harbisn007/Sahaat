import { useState, useCallback, useRef, useEffect } from "react";
import { Platform } from "react-native";
import { createAudioPlayer, AudioModule, AudioPlayer } from "expo-audio";

/**
 * Clapping Delay Configuration
 * Value represents delay between claps in seconds
 * 0 = No clapping
 * 0.05 - 1.50 = Delay between claps (controlled by SpeedWheel)
 */
export type ClappingDelay = number;

// ملف التصفيقة الواحدة القصيرة - للتصفيق المتكرر
const SINGLE_CLAP_URI = require("@/assets/sounds/single-clap-short.mp3");

// ملف الأربع تصفيقات - للنهاية فقط
const END_CLAPS_URI = require("@/assets/sounds/sheeloha-claps.mp3");

/**
 * Sheeloha Effect Configuration - صوت المنادي من بعيد
 * صوت واحد واضح وعالٍ ولكن يبدو قادماً من مسافة بعيدة
 * 
 * التأثير الجديد:
 * - صوت واحد فقط (بدون جوقة)
 * - مستوى صوت مرتفع (0.85) ليبدو كمنادي بصوت عالٍ
 * - تأثير البُعد عبر Web Audio API (reverb + lowpass filter)
 */
const SHEELOHA_CONFIG = {
  // مستوى صوت المنادي (عالٍ ليبدو كمنادي)
  voiceVolume: 0.85,
  // مستوى صوت التصفيق المتكرر
  repeatingClapVolume: 0.55,
  // مستوى صوت التصفيق النهائي
  endClapVolume: 0.45,
  // إعدادات تأثير البُعد (للويب فقط - Native لا يدعم Web Audio API)
  distanceEffect: {
    // Reverb settings
    reverbDecay: 1.5,      // مدة الصدى (ثواني)
    reverbWet: 0.25,       // نسبة الصدى (0-1)
    // Lowpass filter - لتقليل الترددات العالية (يعطي إحساس البُعد)
    lowpassFrequency: 3500, // Hz - ترددات أقل = صوت أبعد
  },
};

interface SheelohaPlayerState {
  isPlaying: boolean;
  isProcessing: boolean;
}

// Web Audio Context for distance effect
let webAudioContext: AudioContext | null = null;

/**
 * Create a simple convolver reverb for distance effect
 */
function createReverbImpulse(context: AudioContext, duration: number, decay: number): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = sampleRate * duration;
  const impulse = context.createBuffer(2, length, sampleRate);
  
  for (let channel = 0; channel < 2; channel++) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      // Exponential decay with random noise
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  
  return impulse;
}

/**
 * Hook for playing Sheeloha effect - صوت المنادي من بعيد
 * - صوت واحد واضح (بدون جوقة)
 * - تأثير البُعد (reverb + lowpass)
 * - تصفيق متكرر حسب عجلة الإيقاع
 * - 4 تصفيقات عند نهاية الصوت
 */
export function useSheelohaPlayer() {
  const [state, setState] = useState<SheelohaPlayerState>({
    isPlaying: false,
    isProcessing: false,
  });

  // Store players for cleanup
  const mainPlayerRef = useRef<AudioPlayer | null>(null);
  const repeatingClapPlayerRef = useRef<AudioPlayer | null>(null);
  const endClapPlayerRef = useRef<AudioPlayer | null>(null);
  
  // Store timeouts and intervals for cleanup
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const webAudioRef = useRef<HTMLAudioElement[]>([]);
  const webAudioSourcesRef = useRef<MediaElementAudioSourceNode[]>([]);
  
  // Track if players have been released
  const isReleasedRef = useRef(false);
  
  // Cleanup all players
  const cleanupPlayers = useCallback(() => {
    if (isReleasedRef.current) return;
    isReleasedRef.current = true;
    
    if (mainPlayerRef.current) {
      try {
        mainPlayerRef.current.pause();
        mainPlayerRef.current.release();
      } catch (e) {
        // Ignore - player may already be released
      }
      mainPlayerRef.current = null;
    }
    
    if (repeatingClapPlayerRef.current) {
      try {
        repeatingClapPlayerRef.current.pause();
        repeatingClapPlayerRef.current.release();
      } catch (e) {
        // Ignore
      }
      repeatingClapPlayerRef.current = null;
    }
    
    if (endClapPlayerRef.current) {
      try {
        endClapPlayerRef.current.pause();
        endClapPlayerRef.current.release();
      } catch (e) {
        // Ignore
      }
      endClapPlayerRef.current = null;
    }
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      intervalsRef.current.forEach(clearInterval);
      webAudioRef.current.forEach(audio => {
        audio.pause();
        audio.src = "";
      });
      webAudioSourcesRef.current = [];
      cleanupPlayers();
    };
  }, [cleanupPlayers]);

  /**
   * Stop all sheeloha sounds immediately
   */
  const stopSheeloha = useCallback(() => {
    console.log("[useSheelohaPlayer] Stopping all sounds");
    
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
    webAudioSourcesRef.current = [];
    
    // Stop native players
    cleanupPlayers();
    
    setState({ isPlaying: false, isProcessing: false });
  }, [cleanupPlayers]);

  /**
   * Play audio with distance effect on Web
   * يستخدم Web Audio API لإضافة تأثير البُعد (reverb + lowpass)
   */
  const playWithDistanceEffect = useCallback(async (audioElement: HTMLAudioElement) => {
    // Initialize Web Audio Context if needed
    if (!webAudioContext) {
      webAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const context = webAudioContext;
    
    // Create audio source from element
    const source = context.createMediaElementSource(audioElement);
    webAudioSourcesRef.current.push(source);
    
    // Create lowpass filter for distance effect
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = SHEELOHA_CONFIG.distanceEffect.lowpassFrequency;
    lowpass.Q.value = 0.5;
    
    // Create convolver for reverb
    const convolver = context.createConvolver();
    convolver.buffer = createReverbImpulse(
      context,
      SHEELOHA_CONFIG.distanceEffect.reverbDecay,
      2.5
    );
    
    // Create gain nodes for dry/wet mix
    const dryGain = context.createGain();
    dryGain.gain.value = 1 - SHEELOHA_CONFIG.distanceEffect.reverbWet;
    
    const wetGain = context.createGain();
    wetGain.gain.value = SHEELOHA_CONFIG.distanceEffect.reverbWet;
    
    // Connect the audio graph:
    // source -> lowpass -> dryGain -> destination
    //                   -> convolver -> wetGain -> destination
    source.connect(lowpass);
    
    lowpass.connect(dryGain);
    dryGain.connect(context.destination);
    
    lowpass.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(context.destination);
    
    console.log("[useSheelohaPlayer] Distance effect applied (lowpass + reverb)");
  }, []);

  /**
   * Start repeating clapping sound based on delay
   * @param delaySeconds - Delay between claps (0 = no clapping)
   * @param durationMs - Total duration to play claps
   */
  const startRepeatingClap = useCallback(async (delaySeconds: number, durationMs: number) => {
    if (delaySeconds <= 0) {
      console.log("[useSheelohaPlayer] No repeating clapping (delay = 0)");
      return;
    }
    
    const delayMs = delaySeconds * 1000;
    console.log(`[useSheelohaPlayer] Starting repeating clapping: delay=${delayMs}ms, duration=${durationMs}ms`);
    
    if (Platform.OS === "web") {
      // Web: Create audio elements for clapping with distance effect
      const playClap = async () => {
        const clapAudio = new Audio("/sounds/single-clap-short.mp3");
        clapAudio.volume = SHEELOHA_CONFIG.repeatingClapVolume;
        clapAudio.crossOrigin = "anonymous";
        webAudioRef.current.push(clapAudio);
        
        // Apply distance effect
        try {
          await playWithDistanceEffect(clapAudio);
        } catch (e) {
          // Fallback to normal playback if Web Audio fails
          console.warn("[useSheelohaPlayer] Distance effect failed for clap, using normal playback");
        }
        
        clapAudio.play().catch(console.warn);
      };
      
      // Play first clap
      playClap();
      
      // Set interval for subsequent claps
      const interval = setInterval(playClap, delayMs);
      intervalsRef.current.push(interval);
      
      // Stop clapping 0.10 seconds before voice ends
      const stopTime = Math.max(0, durationMs - 100);
      const timeout = setTimeout(() => {
        clearInterval(interval);
        console.log("[useSheelohaPlayer] Repeating clapping stopped");
      }, stopTime);
      timeoutsRef.current.push(timeout);
    } else {
      // Native: Create clap player with single clap sound
      // Note: Native doesn't support Web Audio API, so we use lower volume to simulate distance
      try {
        const clapPlayer = createAudioPlayer(SINGLE_CLAP_URI);
        repeatingClapPlayerRef.current = clapPlayer;
        clapPlayer.volume = SHEELOHA_CONFIG.repeatingClapVolume;
        
        const playClap = () => {
          try {
            if (repeatingClapPlayerRef.current && !isReleasedRef.current) {
              repeatingClapPlayerRef.current.seekTo(0);
              repeatingClapPlayerRef.current.play();
            }
          } catch (e) {
            console.warn("[useSheelohaPlayer] Failed to play clap:", e);
          }
        };
        
        // Wait for clap to load
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Play first clap
        playClap();
        
        // Set interval for subsequent claps
        const interval = setInterval(playClap, delayMs);
        intervalsRef.current.push(interval);
        
        // Stop clapping 0.10 seconds before voice ends
        const stopTime = Math.max(0, durationMs - 100);
        const timeout = setTimeout(() => {
          clearInterval(interval);
          console.log("[useSheelohaPlayer] Repeating clapping stopped");
        }, stopTime);
        timeoutsRef.current.push(timeout);
      } catch (e) {
        console.warn("[useSheelohaPlayer] Failed to create clap player:", e);
      }
    }
  }, [playWithDistanceEffect]);

  /**
   * Play 4 claps at the end of the audio
   * @param durationMs - When to play the claps (near the end of voices)
   */
  const playEndClaps = useCallback(async (durationMs: number) => {
    console.log(`[useSheelohaPlayer] Will play end claps at ${durationMs}ms`);
    
    const timeout = setTimeout(async () => {
      console.log("[useSheelohaPlayer] Playing end claps NOW (4 claps)");
      
      if (Platform.OS === "web") {
        const clapAudio = new Audio("/sounds/sheeloha-claps.mp3");
        clapAudio.volume = SHEELOHA_CONFIG.endClapVolume;
        clapAudio.crossOrigin = "anonymous";
        webAudioRef.current.push(clapAudio);
        
        // Apply distance effect
        try {
          await playWithDistanceEffect(clapAudio);
        } catch (e) {
          console.warn("[useSheelohaPlayer] Distance effect failed for end claps");
        }
        
        clapAudio.play().catch(console.warn);
      } else {
        try {
          if (!isReleasedRef.current) {
            const endClapPlayer = createAudioPlayer(END_CLAPS_URI);
            endClapPlayerRef.current = endClapPlayer;
            endClapPlayer.volume = SHEELOHA_CONFIG.endClapVolume;
            
            // Wait for clap to load
            await new Promise(resolve => setTimeout(resolve, 100));
            endClapPlayer.play();
            console.log("[useSheelohaPlayer] End claps played (4 claps)");
          }
        } catch (e) {
          console.warn("[useSheelohaPlayer] Failed to play end claps:", e);
        }
      }
    }, durationMs);
    
    timeoutsRef.current.push(timeout);
  }, [playWithDistanceEffect]);

  /**
   * Play on Web - صوت المنادي من بعيد
   * صوت واحد مع تأثير البُعد (reverb + lowpass)
   */
  const playOnWeb = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] Playing on web (صوت المنادي من بعيد):", audioUri);
    setState({ isPlaying: true, isProcessing: true });
    
    try {
      // Create single audio element (no chorus)
      const audio = new Audio(audioUri);
      audio.volume = SHEELOHA_CONFIG.voiceVolume;
      audio.crossOrigin = "anonymous";
      webAudioRef.current.push(audio);
      
      // Wait for audio to load to get duration
      await new Promise<void>((resolve, reject) => {
        audio.addEventListener("loadedmetadata", () => resolve());
        audio.addEventListener("error", () => reject(new Error("Failed to load audio")));
        audio.load();
      });
      
      const durationMs = audio.duration * 1000;
      
      console.log(`[useSheelohaPlayer] Voice duration: ${durationMs}ms`);
      
      // Apply distance effect (reverb + lowpass)
      try {
        await playWithDistanceEffect(audio);
        console.log("[useSheelohaPlayer] Distance effect applied to main voice");
      } catch (e) {
        console.warn("[useSheelohaPlayer] Distance effect failed, using normal playback:", e);
      }
      
      setState({ isPlaying: true, isProcessing: false });
      
      // Play the single voice
      audio.play().catch(console.warn);
      console.log("[useSheelohaPlayer] Main voice started (single voice with distance effect)");
      
      // Start repeating clapping based on wheel speed
      startRepeatingClap(clappingDelay, durationMs);
      
      // Play 4 claps at the end
      playEndClaps(durationMs - 200);
      
      // End after voice finishes
      const endTimeout = setTimeout(() => {
        setState({ isPlaying: false, isProcessing: false });
        console.log("[useSheelohaPlayer] Playback complete");
      }, durationMs + 1500);
      timeoutsRef.current.push(endTimeout);
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Web playback error:", error);
      setState({ isPlaying: false, isProcessing: false });
    }
  }, [startRepeatingClap, playEndClaps, playWithDistanceEffect]);

  /**
   * Play on Native - صوت المنادي من بعيد
   * صوت واحد (Native لا يدعم Web Audio API للتأثيرات)
   */
  const playOnNative = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] ========== Playing on native (صوت المنادي من بعيد) ==========");
    console.log("[useSheelohaPlayer] URI:", audioUri.substring(0, 100));
    setState({ isPlaying: true, isProcessing: true });
    isReleasedRef.current = false;
    
    try {
      // 1. ضبط audio mode للتشغيل
      try {
        await AudioModule.setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
        });
        console.log("[useSheelohaPlayer] Audio mode set");
      } catch (e) {
        console.warn("[useSheelohaPlayer] Failed to set audio mode:", e);
      }
      
      // 2. إنشاء player واحد للصوت (بدون جوقة)
      console.log("[useSheelohaPlayer] Creating single voice player (distant caller effect)...");
      const player = createAudioPlayer(audioUri);
      player.volume = SHEELOHA_CONFIG.voiceVolume;
      mainPlayerRef.current = player;
      
      // 3. انتظار تحميل الصوت
      console.log("[useSheelohaPlayer] Waiting for audio to load...");
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 4. الحصول على المدة
      let durationMs = (player.duration || 0) * 1000;
      if (durationMs <= 0) {
        console.warn("[useSheelohaPlayer] Could not get duration, using 10 seconds fallback");
        durationMs = 10000;
      }
      
      console.log(`[useSheelohaPlayer] Voice duration: ${durationMs}ms`);
      
      setState({ isPlaying: true, isProcessing: false });
      
      // 5. تشغيل الصوت الواحد
      try {
        if (!isReleasedRef.current) {
          player.play();
          console.log("[useSheelohaPlayer] Main voice started (single voice)");
        }
      } catch (e) {
        console.warn("[useSheelohaPlayer] Failed to play voice:", e);
      }
      
      // 6. تشغيل التصفيق المتكرر حسب سرعة العجلة
      startRepeatingClap(clappingDelay, durationMs);
      
      // 7. تشغيل 4 تصفيقات عند نهاية الصوت
      playEndClaps(durationMs - 200);
      
      // 8. إنهاء بعد انتهاء الصوت والتصفيق
      const endTimeout = setTimeout(() => {
        setState({ isPlaying: false, isProcessing: false });
        cleanupPlayers();
        console.log("[useSheelohaPlayer] Playback complete");
      }, durationMs + 1500);
      timeoutsRef.current.push(endTimeout);
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Native playback error:", error);
      setState({ isPlaying: false, isProcessing: false });
      cleanupPlayers();
    }
  }, [startRepeatingClap, playEndClaps, cleanupPlayers]);

  /**
   * Main play function
   * @param audioUri - URL of the audio to play (last Tarouk message)
   * @param clappingDelay - التأخير بين التصفيقات (من عجلة الإيقاع)
   */
  const playSheeloha = useCallback(async (audioUri: string, clappingDelay: ClappingDelay = 0) => {
    console.log("[useSheelohaPlayer] playSheeloha called:", { audioUri, clappingDelay });
    
    if (!audioUri) {
      console.warn("[useSheelohaPlayer] No audio URI provided!");
      return;
    }
    
    // Stop any currently playing sheeloha first
    stopSheeloha();
    
    // Reset released flag
    isReleasedRef.current = false;
    
    // Small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (Platform.OS === "web") {
      await playOnWeb(audioUri, clappingDelay);
    } else {
      await playOnNative(audioUri, clappingDelay);
    }
  }, [stopSheeloha, playOnWeb, playOnNative]);

  return {
    isPlaying: state.isPlaying,
    isProcessing: state.isProcessing,
    playSheeloha,
    stopSheeloha,
  };
}
