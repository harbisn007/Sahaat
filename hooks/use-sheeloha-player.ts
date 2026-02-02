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
 * Sheeloha Effect Configuration - 5 أصوات قادمة من بعيد
 * 
 * التأثير:
 * - 5 أصوات بتأخيرات مختلفة (تحاكي 5 أشخاص ينادون من بعيد)
 * - تأثير البُعد عبر lowpass filter فقط (بدون صدى)
 * - لا يوجد تأثير جوقة معدني
 * - صوت نظيف وطبيعي
 */
const SHEELOHA_CONFIG = {
  voiceCopies: 5,
  // تسريع الأصوات الخمسة بنسبة ثابتة
  playbackRate: 1.10, // تسريع 10%
  // إعدادات كل نسخة: نفس التأخير ونفس مستوى الصوت
  // كلهم يبدون قادمين من بعيد (نفس المسافة بالضبط)
  voiceSettings: [
    { delay: 0, volume: 0.85 },   // صوت 1
    { delay: 0, volume: 0.85 },   // صوت 2
    { delay: 0, volume: 0.85 },   // صوت 3
    { delay: 0, volume: 0.85 },   // صوت 4
    { delay: 0, volume: 0.85 },   // صوت 5
  ],
  // مستوى صوت التصفيق المتكرر
  repeatingClapVolume: 0.55,
  // مستوى صوت التصفيق النهائي
  endClapVolume: 0.45,
  // إعدادات تأثير البُعد (lowpass filter فقط - بدون صدى)
  distanceEffect: {
    // Lowpass filter - لتقليل الترددات العالية (يعطي إحساس البُعد)
    lowpassFrequency: 2800, // Hz - ترددات أقل = صوت أبعد
    lowpassQ: 0.7,          // Q factor - حدة الفلتر
  },
};

interface SheelohaPlayerState {
  isPlaying: boolean;
  isProcessing: boolean;
}

// Web Audio Context for distance effect
let webAudioContext: AudioContext | null = null;

// Single clap audio element for web (reused to prevent overlap)
let webClapAudio: HTMLAudioElement | null = null;
let webClapSource: MediaElementAudioSourceNode | null = null;

/**
 * Hook for playing Sheeloha effect - 5 أصوات قادمة من بعيد
 * - 5 أصوات بتأخيرات مختلفة
 * - تأثير البُعد (lowpass filter فقط - بدون صدى)
 * - تصفيق متكرر حسب عجلة الإيقاع
 * - 4 تصفيقات عند نهاية الصوت
 */
export function useSheelohaPlayer() {
  const [state, setState] = useState<SheelohaPlayerState>({
    isPlaying: false,
    isProcessing: false,
  });

  // Store players for cleanup
  const playersRef = useRef<AudioPlayer[]>([]);
  const repeatingClapPlayerRef = useRef<AudioPlayer | null>(null);
  const endClapPlayerRef = useRef<AudioPlayer | null>(null);
  
  // Store timeouts and intervals for cleanup
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const webAudioRef = useRef<HTMLAudioElement[]>([]);
  const webAudioSourcesRef = useRef<MediaElementAudioSourceNode[]>([]);
  
  // Track if players have been released
  const isReleasedRef = useRef(false);
  
  // Track if clap is currently playing (to prevent overlap)
  const isClapPlayingRef = useRef(false);
  
  // Cleanup all players
  const cleanupPlayers = useCallback(() => {
    if (isReleasedRef.current) return;
    isReleasedRef.current = true;
    
    playersRef.current.forEach(player => {
      try {
        player.pause();
        player.release();
      } catch (e) {
        // Ignore - player may already be released
      }
    });
    playersRef.current = [];
    
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
    
    // Stop single clap audio
    if (webClapAudio) {
      webClapAudio.pause();
      webClapAudio.currentTime = 0;
    }
    isClapPlayingRef.current = false;
    
    // Stop native players
    cleanupPlayers();
    
    setState({ isPlaying: false, isProcessing: false });
  }, [cleanupPlayers]);

  /**
   * Apply distance effect (lowpass filter only - no reverb)
   * يعطي إحساس أن الصوت قادم من بعيد
   */
  const applyDistanceEffect = useCallback((audioElement: HTMLAudioElement): boolean => {
    try {
      // Initialize Web Audio Context if needed
      if (!webAudioContext) {
        webAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const context = webAudioContext;
      
      // Create audio source from element
      const source = context.createMediaElementSource(audioElement);
      webAudioSourcesRef.current.push(source);
      
      // Create lowpass filter for distance effect (no reverb)
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = SHEELOHA_CONFIG.distanceEffect.lowpassFrequency;
      lowpass.Q.value = SHEELOHA_CONFIG.distanceEffect.lowpassQ;
      
      // Connect: source -> lowpass -> destination
      source.connect(lowpass);
      lowpass.connect(context.destination);
      
      console.log("[useSheelohaPlayer] Distance effect applied (lowpass only, no reverb)");
      return true;
    } catch (e) {
      console.warn("[useSheelohaPlayer] Failed to apply distance effect:", e);
      return false;
    }
  }, []);

  /**
   * Initialize single clap audio for web (reused to prevent overlap)
   */
  const initWebClapAudio = useCallback(() => {
    if (Platform.OS !== "web") return;
    
    if (!webClapAudio) {
      webClapAudio = new Audio("/sounds/single-clap-short.mp3");
      webClapAudio.volume = SHEELOHA_CONFIG.repeatingClapVolume;
      webClapAudio.crossOrigin = "anonymous";
      
      // Apply distance effect once
      try {
        if (!webAudioContext) {
          webAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        webClapSource = webAudioContext.createMediaElementSource(webClapAudio);
        const lowpass = webAudioContext.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = SHEELOHA_CONFIG.distanceEffect.lowpassFrequency;
        lowpass.Q.value = SHEELOHA_CONFIG.distanceEffect.lowpassQ;
        webClapSource.connect(lowpass);
        lowpass.connect(webAudioContext.destination);
      } catch (e) {
        console.warn("[useSheelohaPlayer] Failed to apply distance effect to clap:", e);
      }
      
      // Track when clap finishes
      webClapAudio.addEventListener("ended", () => {
        isClapPlayingRef.current = false;
      });
    }
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
      // Initialize single clap audio (reused)
      initWebClapAudio();
      
      // Play clap function - only plays if previous clap finished
      const playClap = () => {
        if (!webClapAudio) return;
        
        // Only play if not already playing (prevent overlap)
        if (isClapPlayingRef.current) {
          console.log("[useSheelohaPlayer] Skipping clap - previous still playing");
          return;
        }
        
        isClapPlayingRef.current = true;
        webClapAudio.currentTime = 0;
        webClapAudio.play().catch((e) => {
          console.warn("[useSheelohaPlayer] Failed to play clap:", e);
          isClapPlayingRef.current = false;
        });
      };
      
      // Play first clap
      playClap();
      
      // Set interval for subsequent claps
      const interval = setInterval(playClap, delayMs);
      intervalsRef.current.push(interval);
      
      // إيقاف التصفيق قبل نهاية الصوت بمقدار تصفيقة واحدة + هامش
      // لإلغاء التكرار الأخير قبل نهاية الصوت
      const stopTime = Math.max(0, durationMs - delayMs - 100);
      const timeout = setTimeout(() => {
        clearInterval(interval);
        console.log("[useSheelohaPlayer] Repeating clapping stopped (last clap skipped)");
      }, stopTime);
      timeoutsRef.current.push(timeout);
    } else {
      // Native: Create clap player with single clap sound
      try {
        const clapPlayer = createAudioPlayer(SINGLE_CLAP_URI);
        repeatingClapPlayerRef.current = clapPlayer;
        clapPlayer.volume = SHEELOHA_CONFIG.repeatingClapVolume;
        
        const playClap = () => {
          try {
            if (repeatingClapPlayerRef.current && !isReleasedRef.current) {
              // Only play if not already playing (prevent overlap)
              if (isClapPlayingRef.current) {
                console.log("[useSheelohaPlayer] Skipping clap - previous still playing");
                return;
              }
              
              isClapPlayingRef.current = true;
              repeatingClapPlayerRef.current.seekTo(0);
              repeatingClapPlayerRef.current.play();
              
              // Reset flag after clap duration (400ms)
              setTimeout(() => {
                isClapPlayingRef.current = false;
              }, 400);
            }
          } catch (e) {
            console.warn("[useSheelohaPlayer] Failed to play clap:", e);
            isClapPlayingRef.current = false;
          }
        };
        
        // Wait for clap to load
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Play first clap
        playClap();
        
        // Set interval for subsequent claps
        const interval = setInterval(playClap, delayMs);
        intervalsRef.current.push(interval);
        
        // إيقاف التصفيق قبل نهاية الصوت بمقدار تصفيقة واحدة + هامش
        // لإلغاء التكرار الأخير قبل نهاية الصوت
        const stopTime = Math.max(0, durationMs - delayMs - 100);
        const timeout = setTimeout(() => {
          clearInterval(interval);
          console.log("[useSheelohaPlayer] Repeating clapping stopped (last clap skipped)");
        }, stopTime);
        timeoutsRef.current.push(timeout);
      } catch (e) {
        console.warn("[useSheelohaPlayer] Failed to create clap player:", e);
      }
    }
  }, [initWebClapAudio]);

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
        
        // Apply distance effect (lowpass only)
        applyDistanceEffect(clapAudio);
        
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
  }, [applyDistanceEffect]);

  /**
   * Play on Web - 5 أصوات قادمة من بعيد
   * تأثير البُعد عبر lowpass filter فقط (بدون صدى)
   */
  const playOnWeb = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] Playing on web (5 voices from distance):", audioUri);
    setState({ isPlaying: true, isProcessing: true });
    
    try {
      // Create 5 audio elements for voice copies
      const audioElements: HTMLAudioElement[] = [];
      
      for (let i = 0; i < SHEELOHA_CONFIG.voiceCopies; i++) {
        const audio = new Audio(audioUri);
        const settings = SHEELOHA_CONFIG.voiceSettings[i];
        audio.volume = settings.volume;
        audio.playbackRate = SHEELOHA_CONFIG.playbackRate; // تسريع 1.10x
        audio.crossOrigin = "anonymous";
        audioElements.push(audio);
        webAudioRef.current.push(audio);
      }
      
      // Wait for first audio to load to get duration
      await new Promise<void>((resolve, reject) => {
        audioElements[0].addEventListener("loadedmetadata", () => resolve());
        audioElements[0].addEventListener("error", () => reject(new Error("Failed to load audio")));
        audioElements[0].load();
      });
      
      // المدة الفعلية بعد التسريع (التسريع يقصّر المدة)
      const originalDurationMs = audioElements[0].duration * 1000;
      const durationMs = originalDurationMs / SHEELOHA_CONFIG.playbackRate;
      const maxDelay = SHEELOHA_CONFIG.voiceSettings[SHEELOHA_CONFIG.voiceCopies - 1].delay;
      const totalDuration = durationMs + maxDelay;
      
      console.log(`[useSheelohaPlayer] Voice duration: ${durationMs}ms, total: ${totalDuration}ms`);
      
      setState({ isPlaying: true, isProcessing: false });
      
      // Apply distance effect and play each voice with its delay
      audioElements.forEach((audio, index) => {
        const settings = SHEELOHA_CONFIG.voiceSettings[index];
        
        // Apply distance effect (lowpass only - no reverb)
        applyDistanceEffect(audio);
        
        const timeout = setTimeout(() => {
          audio.play().catch(console.warn);
          console.log(`[useSheelohaPlayer] Voice ${index + 1} started (delay: ${settings.delay}ms, volume: ${settings.volume})`);
        }, settings.delay);
        timeoutsRef.current.push(timeout);
      });
      
      // Start repeating clapping based on wheel speed
      startRepeatingClap(clappingDelay, durationMs);
      
      // Play 4 claps at the end
      playEndClaps(durationMs - 200);
      
      // End after voice finishes
      const endTimeout = setTimeout(() => {
        setState({ isPlaying: false, isProcessing: false });
        console.log("[useSheelohaPlayer] Playback complete");
      }, totalDuration + 1500);
      timeoutsRef.current.push(endTimeout);
      
    } catch (error) {
      console.error("[useSheelohaPlayer] Web playback error:", error);
      setState({ isPlaying: false, isProcessing: false });
    }
  }, [startRepeatingClap, playEndClaps, applyDistanceEffect]);

  /**
   * Play on Native - 5 أصوات قادمة من بعيد
   * Native لا يدعم Web Audio API للتأثيرات
   */
  const playOnNative = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] ========== Playing on native (5 voices from distance) ==========");
    console.log("[useSheelohaPlayer] URI:", audioUri.substring(0, 100));
    setState({ isPlaying: true, isProcessing: true });
    isReleasedRef.current = false;
    isClapPlayingRef.current = false;
    
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
      
      // 2. إنشاء 5 players للأصوات
      console.log("[useSheelohaPlayer] Creating 5 voice players...");
      const players: AudioPlayer[] = [];
      
      for (let i = 0; i < SHEELOHA_CONFIG.voiceCopies; i++) {
        const player = createAudioPlayer(audioUri);
        const settings = SHEELOHA_CONFIG.voiceSettings[i];
        player.volume = settings.volume;
        // ملاحظة: playbackRate للقراءة فقط على Native، التسريع يعمل على الويب فقط
        players.push(player);
        playersRef.current.push(player);
        console.log(`[useSheelohaPlayer] Player ${i + 1} created (volume: ${settings.volume}, delay: ${settings.delay}ms)`);
      }
      
      // 3. انتظار تحميل الأصوات
      console.log("[useSheelohaPlayer] Waiting for audio to load...");
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 4. الحصول على المدة (المدة الفعلية بعد التسريع)
      let originalDurationMs = (players[0].duration || 0) * 1000;
      if (originalDurationMs <= 0) {
        console.warn("[useSheelohaPlayer] Could not get duration, using 10 seconds fallback");
        originalDurationMs = 10000;
      }
      // على Native لا يوجد تسريع، المدة هي الأصلية
      const durationMs = originalDurationMs;
      
      const maxDelay = SHEELOHA_CONFIG.voiceSettings[SHEELOHA_CONFIG.voiceCopies - 1].delay;
      const totalDuration = durationMs + maxDelay;
      
      console.log(`[useSheelohaPlayer] Voice duration: ${durationMs}ms, total: ${totalDuration}ms`);
      
      setState({ isPlaying: true, isProcessing: false });
      
      // 5. تشغيل الأصوات الخمسة بتأخيرات مختلفة
      players.forEach((player, index) => {
        const settings = SHEELOHA_CONFIG.voiceSettings[index];
        const timeout = setTimeout(() => {
          try {
            if (!isReleasedRef.current) {
              player.play();
              console.log(`[useSheelohaPlayer] Voice ${index + 1} started (delay: ${settings.delay}ms, volume: ${settings.volume})`);
            }
          } catch (e) {
            console.warn(`[useSheelohaPlayer] Failed to play voice ${index + 1}:`, e);
          }
        }, settings.delay);
        timeoutsRef.current.push(timeout);
      });
      
      // 6. تشغيل التصفيق المتكرر حسب سرعة العجلة
      startRepeatingClap(clappingDelay, durationMs);
      
      // 7. تشغيل 4 تصفيقات عند نهاية الصوت
      playEndClaps(durationMs - 200);
      
      // 8. إنهاء بعد انتهاء الصوت والتصفيق
      const endTimeout = setTimeout(() => {
        setState({ isPlaying: false, isProcessing: false });
        cleanupPlayers();
        console.log("[useSheelohaPlayer] Playback complete");
      }, totalDuration + 1500);
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
    isClapPlayingRef.current = false;
    
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
