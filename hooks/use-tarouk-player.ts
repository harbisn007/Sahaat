import { useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus, AudioModule } from "expo-audio";
import { playWithTaroukEffects, playWithTaroukAndClapEffects, TAROUK_EFFECTS } from "@/lib/audio-effects";

interface TaroukPlayerState {
  isPlaying: boolean;
  currentUri: string | null;
  isProcessing: boolean;
}

export function useTaroukPlayer() {
  const [state, setState] = useState<TaroukPlayerState>({
    isPlaying: false,
    currentUri: null,
    isProcessing: false,
  });

  const [webStopFn, setWebStopFn] = useState<(() => void) | null>(null);
  
  // Native audio player with empty source initially
  const nativePlayer = useAudioPlayer("");
  const nativeStatus = useAudioPlayerStatus(nativePlayer);

  // Initialize audio mode once on mount
  useEffect(() => {
    const initAudioMode = async () => {
      try {
        await AudioModule.setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
        });
        console.log("[useTaroukPlayer] Audio mode initialized");
      } catch (error) {
        console.error("[useTaroukPlayer] Failed to set audio mode:", error);
      }
    };
    initAudioMode();

    // Cleanup on unmount
    return () => {
      try {
        if (Platform.OS !== "web") {
          nativePlayer.remove();
        }
      } catch (e) {
        console.log("[useTaroukPlayer] Cleanup error:", e);
      }
    };
  }, []);

  // Auto-reset when native playback finishes
  useEffect(() => {
    if (Platform.OS !== "web" && state.currentUri) {
      if (nativeStatus.playing === false && nativeStatus.currentTime > 0 && nativeStatus.duration > 0) {
        if (nativeStatus.currentTime >= nativeStatus.duration - 0.1) {
          console.log("[useTaroukPlayer] Native playback finished");
          setState({
            isPlaying: false,
            currentUri: null,
            isProcessing: false,
          });
        }
      }
    }
  }, [nativeStatus.playing, nativeStatus.currentTime, nativeStatus.duration, state.currentUri]);

  /**
   * Play audio with Tarouk effects AND clapping merged together
   * On web: Uses Web Audio API to mix both sounds
   * On native: Uses expo-audio (clapping handled separately in component)
   */
  const playTaroukWithClap = useCallback(async (audioUri: string, clapSoundUri: string) => {
    console.log("[useTaroukPlayer] playTaroukWithClap called with URI:", audioUri.substring(0, 100));
    
    // Stop any current playback
    await stopTarouk();

    setState({
      isPlaying: false,
      currentUri: audioUri,
      isProcessing: true,
    });

    try {
      if (Platform.OS === "web") {
        console.log("[useTaroukPlayer] Using Web Audio API with merged clapping");
        // Web platform: Use Web Audio API with merged clapping
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
        console.log("[useTaroukPlayer] Using native expo-audio (clapping handled separately)");
        // Native platform: Use expo-audio (clapping handled in component)
        
        // Replace the player source
        console.log("[useTaroukPlayer] Replacing player source");
        nativePlayer.replace(audioUri);
        
        // Wait for player to be ready
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Set playback rate for speed effect (if supported)
        try {
          if (typeof nativePlayer.setPlaybackRate === 'function') {
            nativePlayer.setPlaybackRate(TAROUK_EFFECTS.pitch.playbackRate);
            console.log("[useTaroukPlayer] Playback rate set to", TAROUK_EFFECTS.pitch.playbackRate);
          }
        } catch (e) {
          console.warn("[useTaroukPlayer] setPlaybackRate not supported:", e);
        }

        // Start playback
        console.log("[useTaroukPlayer] Starting native playback");
        nativePlayer.play();

        setState({
          isPlaying: true,
          currentUri: audioUri,
          isProcessing: false,
        });
        
        console.log("[useTaroukPlayer] Native playback started successfully");
      }
    } catch (error) {
      console.error("[useTaroukPlayer] Failed to play Tarouk audio:", error);
      setState({
        isPlaying: false,
        currentUri: null,
        isProcessing: false,
      });
    }
  }, [nativePlayer]);

  /**
   * Play audio with Tarouk effects (chorus + slow down)
   * On web: Uses Web Audio API for real-time effects
   * On native: Uses expo-audio with playback rate adjustment
   */
  const playTarouk = useCallback(async (audioUri: string) => {
    console.log("[useTaroukPlayer] playTarouk called with URI:", audioUri.substring(0, 100));
    
    // Stop any current playback
    await stopTarouk();

    setState({
      isPlaying: false,
      currentUri: audioUri,
      isProcessing: true,
    });

    try {
      if (Platform.OS === "web") {
        console.log("[useTaroukPlayer] Using Web Audio API");
        // Web platform: Use Web Audio API with full effects
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
        // Native platform: Use expo-audio with playback rate
        
        // Replace the player source
        console.log("[useTaroukPlayer] Replacing player source");
        nativePlayer.replace(audioUri);
        
        // Wait for player to be ready
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Set playback rate for speed effect (if supported)
        try {
          // Note: setPlaybackRate might not be available on all platforms
          if (typeof nativePlayer.setPlaybackRate === 'function') {
            nativePlayer.setPlaybackRate(TAROUK_EFFECTS.pitch.playbackRate);
            console.log("[useTaroukPlayer] Playback rate set to", TAROUK_EFFECTS.pitch.playbackRate);
          }
        } catch (e) {
          console.warn("[useTaroukPlayer] setPlaybackRate not supported:", e);
        }

        // Start playback
        console.log("[useTaroukPlayer] Starting native playback");
        nativePlayer.play();

        setState({
          isPlaying: true,
          currentUri: audioUri,
          isProcessing: false,
        });
        
        console.log("[useTaroukPlayer] Native playback started successfully");
      }
    } catch (error) {
      console.error("[useTaroukPlayer] Failed to play Tarouk audio:", error);
      setState({
        isPlaying: false,
        currentUri: null,
        isProcessing: false,
      });
    }
  }, [nativePlayer]);

  /**
   * Stop current Tarouk playback
   */
  const stopTarouk = useCallback(async () => {
    console.log("[useTaroukPlayer] stopTarouk called");
    
    if (webStopFn) {
      webStopFn();
      setWebStopFn(null);
    }

    if (state.currentUri && Platform.OS !== "web") {
      try {
        nativePlayer.pause();
        console.log("[useTaroukPlayer] Native playback paused");
      } catch (e) {
        console.warn("[useTaroukPlayer] Error pausing native player:", e);
      }
    }

    setState({
      isPlaying: false,
      currentUri: null,
      isProcessing: false,
    });
  }, [webStopFn, state.currentUri, nativePlayer]);

  return {
    isPlaying: state.isPlaying,
    currentUri: state.currentUri,
    isProcessing: state.isProcessing,
    playTarouk,
    playTaroukWithClap,
    stopTarouk,
  };
}
