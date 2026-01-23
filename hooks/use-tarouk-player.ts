import { useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus, AudioModule } from "expo-audio";
import { playWithTaroukEffects, TAROUK_EFFECTS } from "@/lib/audio-effects";

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

  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [webStopFn, setWebStopFn] = useState<(() => void) | null>(null);
  
  // Native audio player (only used on native platforms)
  const nativePlayer = useAudioPlayer(pendingUri || "");
  const nativeStatus = useAudioPlayerStatus(nativePlayer);

  useEffect(() => {
    // Set audio mode for playback
    AudioModule.setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
    });
  }, []);

  // Auto-reset when native playback finishes
  useEffect(() => {
    if (Platform.OS !== "web" && pendingUri) {
      if (nativeStatus.playing === false && nativeStatus.currentTime > 0 && nativeStatus.currentTime >= nativeStatus.duration) {
        console.log("[useTaroukPlayer] Native playback finished");
        setState({
          isPlaying: false,
          currentUri: null,
          isProcessing: false,
        });
        setPendingUri(null);
      }
    }
  }, [nativeStatus.playing, nativeStatus.currentTime, nativeStatus.duration, pendingUri]);

  /**
   * Play audio with Tarouk effects (echo + speed up)
   * On web: Uses Web Audio API for real-time effects
   * On native: Uses expo-audio with playback rate adjustment
   */
  const playTarouk = useCallback(async (audioUri: string) => {
    console.log("[useTaroukPlayer] playTarouk called with URI:", audioUri);
    
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
        setPendingUri(audioUri);
        
        // Wait for player to be ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Set playback rate for speed effect (if supported)
        try {
          // Note: setPlaybackRate might not be available on all platforms
          if (typeof nativePlayer.setPlaybackRate === 'function') {
            nativePlayer.setPlaybackRate(TAROUK_EFFECTS.speed.playbackRate);
          }
        } catch (e) {
          console.warn("[useTaroukPlayer] setPlaybackRate not supported:", e);
        }

        nativePlayer.play();
        console.log("[useTaroukPlayer] Native playback started");

        setState({
          isPlaying: true,
          currentUri: audioUri,
          isProcessing: false,
        });
      }
    } catch (error) {
      console.error("[useTaroukPlayer] Failed to play Tarouk audio:", error);
      setState({
        isPlaying: false,
        currentUri: null,
        isProcessing: false,
      });
      setPendingUri(null);
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

    if (pendingUri && Platform.OS !== "web") {
      try {
        nativePlayer.pause();
      } catch (e) {
        console.warn("[useTaroukPlayer] Error pausing native player:", e);
      }
      setPendingUri(null);
    }

    setState({
      isPlaying: false,
      currentUri: null,
      isProcessing: false,
    });
  }, [webStopFn, pendingUri, nativePlayer]);

  return {
    isPlaying: state.isPlaying,
    currentUri: state.currentUri,
    isProcessing: state.isProcessing,
    playTarouk,
    stopTarouk,
  };
}
