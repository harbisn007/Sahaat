import { useState, useEffect, useRef } from "react";
import { useAudioPlayer, useAudioPlayerStatus, AudioModule } from "expo-audio";
import { Platform } from "react-native";

export function useAudioPlayerHook() {
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  
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
    
    if (Platform.OS !== "web") {
      initAudioMode();
    }

    // Cleanup player on unmount
    return () => {
      try {
        if (Platform.OS !== "web") {
          player.remove();
        }
        if (webAudioRef.current) {
          webAudioRef.current.pause();
          webAudioRef.current.src = "";
          webAudioRef.current = null;
        }
      } catch (e) {
        console.log("[useAudioPlayerHook] Cleanup error:", e);
      }
    };
  }, []);

  // Auto-reset when playback finishes (native only)
  useEffect(() => {
    if (Platform.OS === "web") return;
    
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
      if (currentUri === uri) {
        console.log("[useAudioPlayerHook] Stopping current playback (same URI)");
        if (Platform.OS === "web" && webAudioRef.current) {
          webAudioRef.current.pause();
          webAudioRef.current.currentTime = 0;
        } else {
          player.pause();
        }
        setCurrentUri(null);
        return;
      }

      // Stop current playback if different URI
      if (currentUri) {
        console.log("[useAudioPlayerHook] Stopping previous playback");
        if (Platform.OS === "web" && webAudioRef.current) {
          webAudioRef.current.pause();
          webAudioRef.current.src = "";
        } else {
          player.pause();
        }
      }

      setCurrentUri(uri);

      if (Platform.OS === "web") {
        // Web: Use HTML5 Audio
        console.log("[useAudioPlayerHook] Using Web Audio API");
        
        const audio = new Audio(uri);
        audio.volume = 1.0;
        webAudioRef.current = audio;
        
        audio.onended = () => {
          console.log("[useAudioPlayerHook] Web audio ended");
          setCurrentUri(null);
        };
        
        audio.onerror = (e) => {
          console.error("[useAudioPlayerHook] Web audio error:", e);
          setCurrentUri(null);
        };
        
        await audio.play();
        console.log("[useAudioPlayerHook] Web audio playing");
        
      } else {
        // Native: Use expo-audio player with object format
        console.log("[useAudioPlayerHook] Using expo-audio player");
        
        // IMPORTANT: Reset audio mode before playback to ensure allowsRecording is false
        // This fixes the conflict with microphone initialization that sets allowsRecording: true
        try {
          await AudioModule.setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: false,
          });
          console.log("[useAudioPlayerHook] Audio mode reset for playback");
        } catch (e) {
          console.warn("[useAudioPlayerHook] Failed to reset audio mode:", e);
        }
        
        // Replace the player source with object format { uri: uri }
        console.log("[useAudioPlayerHook] Replacing player source with { uri }");
        player.replace({ uri: uri });
        
        // Small delay to ensure source is loaded
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Start playback
        console.log("[useAudioPlayerHook] Starting playback");
        player.play();
        
        console.log("[useAudioPlayerHook] Playback command sent successfully");
      }
    } catch (error) {
      console.error("[useAudioPlayerHook] Failed to play audio:", error);
      setCurrentUri(null);
    }
  };

  const stop = () => {
    try {
      console.log("[useAudioPlayerHook] Stop requested");
      
      if (Platform.OS === "web" && webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current.currentTime = 0;
      } else {
        player.pause();
      }
      
      setCurrentUri(null);
    } catch (error) {
      console.error("[useAudioPlayerHook] Failed to stop audio:", error);
    }
  };

  return {
    isPlaying: Platform.OS === "web" ? !!currentUri : status.playing,
    currentUri,
    play,
    stop,
  };
}
