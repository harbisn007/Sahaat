import { useState, useRef, useCallback } from "react";
import { Platform } from "react-native";
import { useAudioPlayer, AudioModule } from "expo-audio";
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

  const stopFnRef = useRef<(() => void) | null>(null);
  const nativePlayerRef = useRef<any>(null);

  /**
   * Play audio with Tarouk effects (echo + speed up)
   * On web: Uses Web Audio API for real-time effects
   * On native: Uses expo-audio with playback rate adjustment
   */
  const playTarouk = useCallback(async (audioUri: string) => {
    // Stop any current playback
    await stopTarouk();

    setState({
      isPlaying: false,
      currentUri: audioUri,
      isProcessing: true,
    });

    try {
      if (Platform.OS === "web") {
        // Web platform: Use Web Audio API with full effects
        const player = await playWithTaroukEffects(audioUri, () => {
          setState({
            isPlaying: false,
            currentUri: null,
            isProcessing: false,
          });
          stopFnRef.current = null;
        });

        if (player) {
          stopFnRef.current = player.stop;
          setState({
            isPlaying: true,
            currentUri: audioUri,
            isProcessing: false,
          });
        } else {
          throw new Error("Failed to create audio player");
        }
      } else {
        // Native platform: Use expo-audio with playback rate
        await AudioModule.setAudioModeAsync({
          playsInSilentMode: true,
        });

        // For native, we'll use a simple approach with playback rate
        // Note: Full echo effect would require native audio processing
        const player = useAudioPlayer(audioUri);
        nativePlayerRef.current = player;

        // Set playback rate for speed effect
        if (player.setPlaybackRate) {
          player.setPlaybackRate(TAROUK_EFFECTS.speed.playbackRate);
        }

        player.play();

        setState({
          isPlaying: true,
          currentUri: audioUri,
          isProcessing: false,
        });

        // Handle end
        setTimeout(() => {
          if (nativePlayerRef.current === player) {
            setState({
              isPlaying: false,
              currentUri: null,
              isProcessing: false,
            });
            nativePlayerRef.current = null;
          }
        }, (player.duration || 10) * 1000 / TAROUK_EFFECTS.speed.playbackRate);
      }
    } catch (error) {
      console.error("Failed to play Tarouk audio:", error);
      setState({
        isPlaying: false,
        currentUri: null,
        isProcessing: false,
      });
    }
  }, []);

  /**
   * Stop current Tarouk playback
   */
  const stopTarouk = useCallback(async () => {
    if (stopFnRef.current) {
      stopFnRef.current();
      stopFnRef.current = null;
    }

    if (nativePlayerRef.current) {
      try {
        nativePlayerRef.current.pause();
        nativePlayerRef.current.remove();
      } catch (e) {
        // Ignore cleanup errors
      }
      nativePlayerRef.current = null;
    }

    setState({
      isPlaying: false,
      currentUri: null,
      isProcessing: false,
    });
  }, []);

  return {
    isPlaying: state.isPlaying,
    currentUri: state.currentUri,
    isProcessing: state.isProcessing,
    playTarouk,
    stopTarouk,
  };
}
