import { useState, useEffect } from "react";
import { useAudioPlayer, useAudioPlayerStatus, AudioModule } from "expo-audio";

export function useAudioPlayerHook() {
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  
  // Create a single player instance with empty source initially
  const player = useAudioPlayer("");
  const status = useAudioPlayerStatus(player);

  // Initialize audio mode once on mount
  useEffect(() => {
    const initAudioMode = async () => {
      try {
        await AudioModule.setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
        });
        console.log("[useAudioPlayerHook] Audio mode initialized for playback");
      } catch (error) {
        console.error("[useAudioPlayerHook] Failed to set audio mode:", error);
      }
    };
    initAudioMode();

    // Cleanup player on unmount
    return () => {
      try {
        player.remove();
      } catch (e) {
        console.log("[useAudioPlayerHook] Cleanup error:", e);
      }
    };
  }, []);

  // Auto-reset when playback finishes
  useEffect(() => {
    if (status.playing === false && status.currentTime > 0 && status.duration > 0) {
      if (status.currentTime >= status.duration - 0.1) {
        console.log("[useAudioPlayerHook] Playback finished, resetting");
        setCurrentUri(null);
      }
    }
  }, [status.playing, status.currentTime, status.duration]);

  const play = async (uri: string) => {
    try {
      console.log("[useAudioPlayerHook] Play requested for:", uri.substring(0, 100));
      
      // If same URI is already playing, stop it
      if (currentUri === uri && status.playing) {
        console.log("[useAudioPlayerHook] Stopping current playback");
        player.pause();
        setCurrentUri(null);
        return;
      }

      // Stop current playback if different URI
      if (currentUri && currentUri !== uri && status.playing) {
        console.log("[useAudioPlayerHook] Stopping previous playback");
        player.pause();
      }

      // Replace the player source
      console.log("[useAudioPlayerHook] Replacing player source");
      player.replace(uri);
      setCurrentUri(uri);
      
      // Small delay to ensure source is loaded
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Start playback
      console.log("[useAudioPlayerHook] Starting playback");
      player.play();
      
      console.log("[useAudioPlayerHook] Playback command sent successfully");
    } catch (error) {
      console.error("[useAudioPlayerHook] Failed to play audio:", error);
      setCurrentUri(null);
    }
  };

  const stop = () => {
    try {
      console.log("[useAudioPlayerHook] Stop requested");
      player.pause();
      setCurrentUri(null);
    } catch (error) {
      console.error("[useAudioPlayerHook] Failed to stop audio:", error);
    }
  };

  return {
    isPlaying: status.playing,
    currentUri,
    play,
    stop,
  };
}
