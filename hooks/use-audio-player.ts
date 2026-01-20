import { useState, useRef, useEffect } from "react";
import { useAudioPlayer, AudioModule } from "expo-audio";

export function useAudioPlayerHook() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    // Set audio mode for playback
    AudioModule.setAudioModeAsync({
      playsInSilentMode: true,
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.remove();
      }
    };
  }, []);

  const play = async (uri: string) => {
    try {
      // Stop current playback if any
      if (playerRef.current) {
        await stop();
      }

      // Create new player
      const player = useAudioPlayer(uri);
      playerRef.current = player;
      setCurrentUri(uri);

      player.play();
      setIsPlaying(true);

      // Listen for playback end
      player.playing = false;
      setTimeout(() => {
        setIsPlaying(false);
        setCurrentUri(null);
      }, (player.duration || 0) * 1000);
    } catch (error) {
      console.error("Failed to play audio:", error);
      setIsPlaying(false);
      setCurrentUri(null);
    }
  };

  const stop = async () => {
    try {
      if (playerRef.current) {
        playerRef.current.pause();
        playerRef.current.remove();
        playerRef.current = null;
      }
      setIsPlaying(false);
      setCurrentUri(null);
    } catch (error) {
      console.error("Failed to stop audio:", error);
    }
  };

  return {
    isPlaying,
    currentUri,
    play,
    stop,
  };
}
