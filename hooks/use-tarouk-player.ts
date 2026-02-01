import { useState, useCallback, useRef } from "react";
import { Platform } from "react-native";
import { createAudioPlayer, AudioModule, AudioPlayer } from "expo-audio";
import { playWithTaroukEffects, playWithTaroukAndClapEffects, TAROUK_EFFECTS } from "@/lib/audio-effects";

interface TaroukPlayerState {
  isPlaying: boolean;
  currentUri: string | null;
  isProcessing: boolean;
}

/**
 * Hook لتشغيل الأصوات مع تأثيرات الطاروق
 * تم إعادة كتابته باستخدام createAudioPlayer لتجنب مشاكل useAudioPlayer
 */
export function useTaroukPlayer() {
  const [state, setState] = useState<TaroukPlayerState>({
    isPlaying: false,
    currentUri: null,
    isProcessing: false,
  });

  const [webStopFn, setWebStopFn] = useState<(() => void) | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  // تنظيف الـ player الحالي
  const cleanup = useCallback(() => {
    try {
      if (playerRef.current) {
        try {
          playerRef.current.pause();
          playerRef.current.release();
        } catch (e) {
          console.log("[useTaroukPlayer] Cleanup error (ignored):", e);
        }
        playerRef.current = null;
      }
    } catch (e) {
      console.log("[useTaroukPlayer] Cleanup error:", e);
    }
  }, []);

  /**
   * Play audio with Tarouk effects AND clapping merged together
   * On web: Uses Web Audio API to mix both sounds
   * On native: Uses expo-audio (clapping handled separately in component)
   */
  const playTaroukWithClap = useCallback(async (audioUri: string, clapSoundUri: string) => {
    console.log("[useTaroukPlayer] ========== playTaroukWithClap ==========");
    console.log("[useTaroukPlayer] URI:", audioUri.substring(0, 100));
    
    // Stop any current playback
    if (webStopFn) {
      webStopFn();
      setWebStopFn(null);
    }
    cleanup();

    setState({
      isPlaying: false,
      currentUri: audioUri,
      isProcessing: true,
    });

    try {
      if (Platform.OS === "web") {
        console.log("[useTaroukPlayer] Using Web Audio API with merged clapping");
        const player = await playWithTaroukAndClapEffects(audioUri, clapSoundUri, () => {
          console.log("[useTaroukPlayer] Web playback finished");
          setState({
            isPlaying: false,
            currentUri: null,
            isProcessing: false,
          });
          setWebStopFn(null);
        });

        if (player) {
          setWebStopFn(() => player.stop);
          setState({
            isPlaying: true,
            currentUri: audioUri,
            isProcessing: false,
          });
        } else {
          throw new Error("Failed to create audio player");
        }
      } else {
        console.log("[useTaroukPlayer] Using native expo-audio");
        
        // 1. ضبط audio mode للتشغيل
        try {
          await AudioModule.setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: false,
          });
          console.log("[useTaroukPlayer] Audio mode set");
        } catch (e) {
          console.warn("[useTaroukPlayer] Failed to set audio mode:", e);
        }
        
        // 2. إنشاء player جديد
        console.log("[useTaroukPlayer] Creating new AudioPlayer...");
        const newPlayer = createAudioPlayer(audioUri);
        playerRef.current = newPlayer;
        
        // 3. الاستماع لأحداث الـ player
        newPlayer.addListener("playbackStatusUpdate", (status) => {
          if (status.isLoaded && !status.playing && status.currentTime > 0) {
            if (status.duration > 0 && status.currentTime >= status.duration - 0.1) {
              console.log("[useTaroukPlayer] Native playback finished");
              setState({
                isPlaying: false,
                currentUri: null,
                isProcessing: false,
              });
            }
          }
        });
        
        // 4. انتظار تحميل الصوت
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 5. ضبط سرعة التشغيل (تأثير الطاروق)
        try {
          if (typeof newPlayer.setPlaybackRate === 'function') {
            newPlayer.setPlaybackRate(TAROUK_EFFECTS.pitch.playbackRate);
            console.log("[useTaroukPlayer] Playback rate set to", TAROUK_EFFECTS.pitch.playbackRate);
          }
        } catch (e) {
          console.warn("[useTaroukPlayer] setPlaybackRate not supported:", e);
        }

        // 6. بدء التشغيل
        console.log("[useTaroukPlayer] Starting playback...");
        newPlayer.play();

        setState({
          isPlaying: true,
          currentUri: audioUri,
          isProcessing: false,
        });
        
        console.log("[useTaroukPlayer] Playback started successfully");
      }
    } catch (error) {
      console.error("[useTaroukPlayer] Failed to play:", error);
      setState({
        isPlaying: false,
        currentUri: null,
        isProcessing: false,
      });
    }
  }, [webStopFn, cleanup]);

  /**
   * Play audio with Tarouk effects (chorus + slow down)
   * On web: Uses Web Audio API for real-time effects
   * On native: Uses expo-audio with playback rate adjustment
   */
  const playTarouk = useCallback(async (audioUri: string) => {
    console.log("[useTaroukPlayer] ========== playTarouk ==========");
    console.log("[useTaroukPlayer] URI:", audioUri.substring(0, 100));
    
    // Stop any current playback
    if (webStopFn) {
      webStopFn();
      setWebStopFn(null);
    }
    cleanup();

    setState({
      isPlaying: false,
      currentUri: audioUri,
      isProcessing: true,
    });

    try {
      if (Platform.OS === "web") {
        console.log("[useTaroukPlayer] Using Web Audio API");
        const player = await playWithTaroukEffects(audioUri, () => {
          console.log("[useTaroukPlayer] Web playback finished");
          setState({
            isPlaying: false,
            currentUri: null,
            isProcessing: false,
          });
          setWebStopFn(null);
        });

        if (player) {
          setWebStopFn(() => player.stop);
          setState({
            isPlaying: true,
            currentUri: audioUri,
            isProcessing: false,
          });
        } else {
          throw new Error("Failed to create audio player");
        }
      } else {
        console.log("[useTaroukPlayer] Using native expo-audio");
        
        // 1. ضبط audio mode للتشغيل
        try {
          await AudioModule.setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: false,
          });
          console.log("[useTaroukPlayer] Audio mode set");
        } catch (e) {
          console.warn("[useTaroukPlayer] Failed to set audio mode:", e);
        }
        
        // 2. إنشاء player جديد
        console.log("[useTaroukPlayer] Creating new AudioPlayer...");
        const newPlayer = createAudioPlayer(audioUri);
        playerRef.current = newPlayer;
        
        // 3. الاستماع لأحداث الـ player
        newPlayer.addListener("playbackStatusUpdate", (status) => {
          if (status.isLoaded && !status.playing && status.currentTime > 0) {
            if (status.duration > 0 && status.currentTime >= status.duration - 0.1) {
              console.log("[useTaroukPlayer] Native playback finished");
              setState({
                isPlaying: false,
                currentUri: null,
                isProcessing: false,
              });
            }
          }
        });
        
        // 4. انتظار تحميل الصوت
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 5. ضبط سرعة التشغيل (تأثير الطاروق)
        try {
          if (typeof newPlayer.setPlaybackRate === 'function') {
            newPlayer.setPlaybackRate(TAROUK_EFFECTS.pitch.playbackRate);
            console.log("[useTaroukPlayer] Playback rate set to", TAROUK_EFFECTS.pitch.playbackRate);
          }
        } catch (e) {
          console.warn("[useTaroukPlayer] setPlaybackRate not supported:", e);
        }

        // 6. بدء التشغيل
        console.log("[useTaroukPlayer] Starting playback...");
        newPlayer.play();

        setState({
          isPlaying: true,
          currentUri: audioUri,
          isProcessing: false,
        });
        
        console.log("[useTaroukPlayer] Playback started successfully");
      }
    } catch (error) {
      console.error("[useTaroukPlayer] Failed to play:", error);
      setState({
        isPlaying: false,
        currentUri: null,
        isProcessing: false,
      });
    }
  }, [webStopFn, cleanup]);

  /**
   * Stop current Tarouk playback
   */
  const stopTarouk = useCallback(async () => {
    console.log("[useTaroukPlayer] stopTarouk called");
    
    if (webStopFn) {
      webStopFn();
      setWebStopFn(null);
    }

    cleanup();

    setState({
      isPlaying: false,
      currentUri: null,
      isProcessing: false,
    });
  }, [webStopFn, cleanup]);

  return {
    isPlaying: state.isPlaying,
    currentUri: state.currentUri,
    isProcessing: state.isProcessing,
    playTarouk,
    playTaroukWithClap,
    stopTarouk,
  };
}
