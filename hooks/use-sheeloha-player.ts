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
 * Sheeloha Effect Configuration - محاكاة صوت الصفوف
 * 
 * التأثير المطلوب: صوت جمهور يردد بيت الشعر جماعياً
 * - كل شخص يبدأ بتوقيت مختلف قليلاً (micro-delay)
 * - كل شخص صوته بدرجة مختلفة قليلاً (detune) - على الويب فقط
 * - كل شخص بسرعة مختلفة قليلاً (playbackRate) - على الويب فقط
 * - الصوت يأتي من بعيد (lowpass filter) - على الويب فقط
 * - ليس جوقة/معندي - فوضى منظمة طبيعية
 */
const SHEELOHA_CONFIG = {
  voiceCopies: 5,
  // إعدادات كل نسخة: تأخير + حجم + درجة صوت + سرعة
  // التأخير 20-80ms يحاكي عدم تزامن الجمهور الطبيعي
  // Detune ±5-15 cents يحاكي اختلاف درجات الأصوات (ليس كثيراً حتى لا يصبح جوقة)
  // PlaybackRate مختلف قليلاً يضيف طبيعية
  voiceSettings: [
    { delay: 0,  volume: 0.60, detune: 0,    playbackRate: 1.00 },  // صوت 1 - الأصلي
    { delay: 35, volume: 0.55, detune: 12,   playbackRate: 1.01 },  // صوت 2 - أعلى قليلاً
    { delay: 65, volume: 0.50, detune: -15,  playbackRate: 0.99 },  // صوت 3 - أخفض قليلاً
    { delay: 25, volume: 0.52, detune: 8,    playbackRate: 1.015 }, // صوت 4
    { delay: 50, volume: 0.48, detune: -10,  playbackRate: 0.985 }, // صوت 5
  ],
  // مستوى صوت التصفيق المتكرر
  repeatingClapVolume: 0.55,
  // مستوى صوت التصفيق النهائي
  endClapVolume: 0.45,
  // إعدادات تأثير البُعد (lowpass filter - على الويب فقط)
  distanceEffect: {
    lowpassFrequency: 2200, // Hz - أقل من قبل لإحساس بُعد أكبر
    lowpassQ: 0.8,
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
 * Hook for playing Sheeloha effect - محاكاة صوت الصفوف
 * - 5 أصوات بتأخيرات مختلفة + درجات مختلفة + سرعات مختلفة
 * - تأثير البُعد (lowpass filter - على الويب فقط)
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
   * Apply distance effect with detune and playback rate (Web only)
   * يعطي إحساس أن الصوت قادم من بعيد مع اختلاف طبيعي في درجة الصوت
   */
  const applyDistanceEffectWithDetune = useCallback((
    audioElement: HTMLAudioElement,
    detune: number,
    playbackRate: number,
    volume: number
  ): boolean => {
    try {
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
      lowpass.Q.value = SHEELOHA_CONFIG.distanceEffect.lowpassQ;
      
      // Create gain node for volume control
      const gainNode = context.createGain();
      gainNode.gain.value = volume;
      
      // Connect: source -> lowpass -> gain -> destination
      source.connect(lowpass);
      lowpass.connect(gainNode);
      gainNode.connect(context.destination);
      
      // Set playback rate and detune on the audio element
      audioElement.playbackRate = playbackRate;
      // detune is not available on HTMLAudioElement, we use playbackRate variation instead
      // But we can use a more precise approach: adjust playbackRate to simulate detune
      // 100 cents = 1 semitone, detune of ±15 cents is very subtle
      // Formula: playbackRate = baseRate * 2^(detune/1200)
      const detuneMultiplier = Math.pow(2, detune / 1200);
      audioElement.playbackRate = playbackRate * detuneMultiplier;
      
      // Set volume to 1 on element (controlled by gain node)
      audioElement.volume = 1;
      
      console.log(`[useSheelohaPlayer] Distance effect applied (detune: ${detune}cents, rate: ${(playbackRate * detuneMultiplier).toFixed(4)}, vol: ${volume})`);
      return true;
    } catch (e) {
      console.warn("[useSheelohaPlayer] Failed to apply distance effect:", e);
      return false;
    }
  }, []);

  /**
   * Apply simple distance effect (for claps)
   */
  const applyDistanceEffect = useCallback((audioElement: HTMLAudioElement): boolean => {
    try {
      if (!webAudioContext) {
        webAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const context = webAudioContext;
      const source = context.createMediaElementSource(audioElement);
      webAudioSourcesRef.current.push(source);
      
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = SHEELOHA_CONFIG.distanceEffect.lowpassFrequency;
      lowpass.Q.value = SHEELOHA_CONFIG.distanceEffect.lowpassQ;
      
      source.connect(lowpass);
      lowpass.connect(context.destination);
      
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
   * Play on Web - محاكاة صوت الصفوف
   * 5 أصوات بتأخيرات + درجات + سرعات مختلفة + lowpass filter
   */
  const playOnWeb = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] Playing on web (صوت الصفوف):", audioUri);
    setState({ isPlaying: true, isProcessing: true });
    
    try {
      // Create 5 audio elements for voice copies
      const audioElements: HTMLAudioElement[] = [];
      
      for (let i = 0; i < SHEELOHA_CONFIG.voiceCopies; i++) {
        const audio = new Audio(audioUri);
        // لا نستخدم crossOrigin لتجنب مشاكل CORS مع S3
        // Web Audio API ستعمل بدونه إذا كان الخادم يسمح بـ CORS
        audio.crossOrigin = "anonymous";
        audioElements.push(audio);
        webAudioRef.current.push(audio);
      }
      
      // Wait for first audio to load to get duration
      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          console.log("[useSheelohaPlayer] Audio metadata loaded, duration:", audioElements[0].duration);
          resolve();
        };
        const onError = (e: any) => {
          console.error("[useSheelohaPlayer] Audio load error:", e);
          // Fallback: حاول بدون crossOrigin
          console.log("[useSheelohaPlayer] Retrying without crossOrigin...");
          audioElements.forEach(a => a.removeAttribute("crossorigin"));
          audioElements[0].addEventListener("loadedmetadata", () => resolve());
          audioElements[0].load();
        };
        audioElements[0].addEventListener("loadedmetadata", onLoaded);
        audioElements[0].addEventListener("error", onError);
        audioElements[0].load();
      });
      
      const originalDurationMs = audioElements[0].duration * 1000;
      // المدة الفعلية تعتمد على أبطأ نسخة
      const slowestRate = Math.min(...SHEELOHA_CONFIG.voiceSettings.map(s => {
        const detuneMultiplier = Math.pow(2, s.detune / 1200);
        return s.playbackRate * detuneMultiplier;
      }));
      const durationMs = originalDurationMs / slowestRate;
      const maxDelay = Math.max(...SHEELOHA_CONFIG.voiceSettings.map(s => s.delay));
      const totalDuration = durationMs + maxDelay;
      
      console.log(`[useSheelohaPlayer] Voice duration: ${durationMs}ms, total: ${totalDuration}ms`);
      
      setState({ isPlaying: true, isProcessing: false });
      
      // Apply distance effect with detune and play each voice with its delay
      audioElements.forEach((audio, index) => {
        const settings = SHEELOHA_CONFIG.voiceSettings[index];
        
        // Apply distance effect with detune and custom playback rate
        const effectApplied = applyDistanceEffectWithDetune(audio, settings.detune, settings.playbackRate, settings.volume);
        
        if (!effectApplied) {
          // Fallback: إذا فشل Web Audio API (مثلاً بسبب CORS)، استخدم الطريقة البسيطة
          console.log(`[useSheelohaPlayer] Fallback: using simple volume/rate for voice ${index + 1}`);
          audio.volume = settings.volume;
          try {
            const detuneMultiplier = Math.pow(2, settings.detune / 1200);
            audio.playbackRate = settings.playbackRate * detuneMultiplier;
          } catch (e) {
            audio.playbackRate = settings.playbackRate;
          }
        }
        
        const timeout = setTimeout(() => {
          audio.play().catch((e) => {
            console.warn(`[useSheelohaPlayer] Voice ${index + 1} play failed:`, e);
          });
          console.log(`[useSheelohaPlayer] Voice ${index + 1} started (delay: ${settings.delay}ms, vol: ${settings.volume}, detune: ${settings.detune}cents, rate: ${settings.playbackRate}, effect: ${effectApplied})`);
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
  }, [startRepeatingClap, playEndClaps, applyDistanceEffectWithDetune]);

  /**
   * Play on Native - محاكاة صوت الصفوف
   * Native لا يدعم Web Audio API، لذا نستخدم:
   * - تأخيرات مختلفة (micro-delay) لمحاكاة عدم التزامن
   * - مستويات صوت مختلفة قليلاً
   * ملاحظة: detune و playbackRate غير متاحين في expo-audio
   */
  const playOnNative = useCallback(async (audioUri: string, clappingDelay: ClappingDelay) => {
    console.log("[useSheelohaPlayer] ========== Playing on native (صوت الصفوف) ==========");
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
        // ملاحظة: detune و playbackRate غير متاحين على Native
        players.push(player);
        playersRef.current.push(player);
        console.log(`[useSheelohaPlayer] Player ${i + 1} created (volume: ${settings.volume}, delay: ${settings.delay}ms)`);
      }
      
      // 3. انتظار تحميل الأصوات
      console.log("[useSheelohaPlayer] Waiting for audio to load...");
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 4. الحصول على المدة
      let originalDurationMs = (players[0].duration || 0) * 1000;
      if (originalDurationMs <= 0) {
        console.warn("[useSheelohaPlayer] Could not get duration, using 10 seconds fallback");
        originalDurationMs = 10000;
      }
      // على Native لا يوجد تسريع، المدة هي الأصلية
      const durationMs = originalDurationMs;
      const maxDelay = Math.max(...SHEELOHA_CONFIG.voiceSettings.map(s => s.delay));
      const totalDuration = durationMs + maxDelay;
      
      console.log(`[useSheelohaPlayer] Voice duration: ${durationMs}ms, total: ${totalDuration}ms`);
      
      setState({ isPlaying: true, isProcessing: false });
      
      // 5. تشغيل الأصوات الخمسة بتأخيرات مختلفة (محاكاة عدم تزامن الجمهور)
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
    
    // إضافة Cache Buster لإجبار تحميل الصوت من جديد
    const cacheBuster = `${audioUri.includes("?") ? "&" : "?"}t=${Date.now()}`;
    const audioUriWithCacheBuster = `${audioUri}${cacheBuster}`;
    console.log("[useSheelohaPlayer] Audio URI with cache buster:", audioUriWithCacheBuster);
    
    // Small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (Platform.OS === "web") {
      await playOnWeb(audioUriWithCacheBuster, clappingDelay);
    } else {
      await playOnNative(audioUriWithCacheBuster, clappingDelay);
    }
  }, [stopSheeloha, playOnWeb, playOnNative]);

  return {
    isPlaying: state.isPlaying,
    isProcessing: state.isProcessing,
    playSheeloha,
    stopSheeloha,
  };
}
