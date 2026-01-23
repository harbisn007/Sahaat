import { useState, useEffect } from "react";
import { useAudioPlayer, useAudioPlayerStatus, AudioModule } from "expo-audio";

export function useAudioPlayerHook() {
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const player = useAudioPlayer(currentUri || "");
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    // Set audio mode for playback
    AudioModule.setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
    });
  }, []);

  // Auto-reset when playback finishes
  useEffect(() => {
    if (status.playing === false && status.currentTime > 0 && status.currentTime >= status.duration) {
      setCurrentUri(null);
    }
  }, [status.playing, status.currentTime, status.duration]);

  const play = async (uri: string) => {
    try {
      console.log("[useAudioPlayerHook] Playing audio:", uri);
      
      // If same URI is already playing, stop it
      if (currentUri === uri && status.playing) {
        player.pause();
        setCurrentUri(null);
        return;
      }

      // Stop current playback if different URI
      if (currentUri && currentUri !== uri) {
        player.pause();
      }

      // Set new URI and play
      setCurrentUri(uri);
      
      // Wait for player to be ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      player.play();
      console.log("[useAudioPlayerHook] Playback started");
    } catch (error) {
      console.error("[useAudioPlayerHook] Failed to play audio:", error);
      setCurrentUri(null);
    }
  };

  const stop = () => {
    try {
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
