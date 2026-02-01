import { useState, useEffect, useRef, useCallback } from "react";
import { useAudioPlayer, AudioModule } from "expo-audio";
import { Platform } from "react-native";

export function useAudioPlayerHook() {
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef<ReturnType<typeof useAudioPlayer> | null>(null);
  
  // Create a single player instance
  const player = useAudioPlayer("");
  playerRef.current = player;

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
        if (playerRef.current) {
          playerRef.current.remove();
        }
      } catch (e) {
        console.log("[useAudioPlayerHook] Cleanup error:", e);
      }
    };
  }, []);

  const play = useCallback(async (uri: string) => {
    try {
      console.log("[useAudioPlayerHook] Play requested for:", uri.substring(0, 100));
      
      if (!uri) {
        console.warn("[useAudioPlayerHook] No URI provided");
        return;
      }

      // If same URI is already playing, stop it
      if (currentUri === uri && isPlaying) {
        console.log("[useAudioPlayerHook] Stopping current playback (same URI)");
        player.pause();
        setCurrentUri(null);
        setIsPlaying(false);
        return;
      }

      // Stop current playback if different URI
      if (isPlaying) {
        console.log("[useAudioPlayerHook] Stopping previous playback");
        player.pause();
      }

      // Replace the player source with object format
      console.log("[useAudioPlayerHook] Replacing player source with:", uri);
      
      try {
        // Use object format for replace
        player.replace({ uri: uri });
        setCurrentUri(uri);
        
        // Wait for source to load
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Start playback
        console.log("[useAudioPlayerHook] Starting playback...");
        player.play();
        setIsPlaying(true);
        
        console.log("[useAudioPlayerHook] Playback started successfully");
      } catch (replaceError) {
        console.error("[useAudioPlayerHook] Replace/play error:", replaceError);
        // Try alternative approach - direct string
        try {
          console.log("[useAudioPlayerHook] Trying alternative approach...");
          player.replace(uri as any);
          await new Promise(resolve => setTimeout(resolve, 300));
          player.play();
          setIsPlaying(true);
          setCurrentUri(uri);
        } catch (altError) {
          console.error("[useAudioPlayerHook] Alternative approach also failed:", altError);
          throw altError;
        }
      }
      
    } catch (error) {
      console.error("[useAudioPlayerHook] Failed to play audio:", error);
      setCurrentUri(null);
      setIsPlaying(false);
    }
  }, [player, currentUri, isPlaying]);

  const stop = useCallback(() => {
    try {
      console.log("[useAudioPlayerHook] Stop requested");
      player.pause();
      setCurrentUri(null);
      setIsPlaying(false);
    } catch (error) {
      console.error("[useAudioPlayerHook] Failed to stop audio:", error);
    }
  }, [player]);

  // Monitor player status
  useEffect(() => {
    const checkStatus = () => {
      try {
        if (player.playing !== undefined) {
          if (!player.playing && isPlaying && currentUri) {
            // Playback finished
            console.log("[useAudioPlayerHook] Playback finished");
            setIsPlaying(false);
            setCurrentUri(null);
          }
        }
      } catch (e) {
        // Ignore status check errors
      }
    };
    
    const interval = setInterval(checkStatus, 500);
    return () => clearInterval(interval);
  }, [player, isPlaying, currentUri]);

  return {
    isPlaying,
    currentUri,
    play,
    stop,
  };
}
