import { useState, useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import { AudioModule, useAudioPlayer } from "expo-audio";

export function useAudioPlayerHook() {
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Web audio reference
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // Native player - use empty string as initial source
  const nativePlayer = useAudioPlayer("");

  // Initialize audio mode once on mount (Native only)
  useEffect(() => {
    if (Platform.OS === "web") return;
    
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
        nativePlayer.remove();
      } catch (e) {
        console.log("[useAudioPlayerHook] Cleanup error:", e);
      }
    };
  }, []);

  // Cleanup web audio on unmount
  useEffect(() => {
    return () => {
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current.src = "";
        webAudioRef.current = null;
      }
    };
  }, []);

  const play = useCallback(async (uri: string) => {
    try {
      console.log("[useAudioPlayerHook] Play requested for:", uri.substring(0, 100));
      
      // If same URI is already playing, stop it
      if (currentUri === uri && isPlaying) {
        console.log("[useAudioPlayerHook] Stopping current playback");
        stop();
        return;
      }

      // Stop current playback if different URI
      if (currentUri && currentUri !== uri && isPlaying) {
        console.log("[useAudioPlayerHook] Stopping previous playback");
        stop();
      }

      setCurrentUri(uri);
      setIsPlaying(true);

      if (Platform.OS === "web") {
        // Web: Use HTML5 Audio
        console.log("[useAudioPlayerHook] Playing on web");
        
        // Stop previous web audio if exists
        if (webAudioRef.current) {
          webAudioRef.current.pause();
          webAudioRef.current.src = "";
        }
        
        const audio = new Audio(uri);
        audio.volume = 1.0;
        
        audio.onended = () => {
          console.log("[useAudioPlayerHook] Web playback finished");
          setIsPlaying(false);
          setCurrentUri(null);
        };
        
        audio.onerror = (e) => {
          console.error("[useAudioPlayerHook] Web playback error:", e);
          setIsPlaying(false);
          setCurrentUri(null);
        };
        
        webAudioRef.current = audio;
        await audio.play();
        console.log("[useAudioPlayerHook] Web playback started");
        
      } else {
        // Native: Use expo-audio
        console.log("[useAudioPlayerHook] Playing on native");
        
        try {
          // Replace with object format { uri: string }
          nativePlayer.replace({ uri: uri });
          
          // Wait for source to load
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Start playback
          nativePlayer.play();
          console.log("[useAudioPlayerHook] Native playback started");
          
          // Monitor playback end
          const checkInterval = setInterval(() => {
            if (!nativePlayer.playing && nativePlayer.currentTime > 0) {
              if (nativePlayer.currentTime >= (nativePlayer.duration || 0) - 0.1) {
                console.log("[useAudioPlayerHook] Native playback finished");
                setIsPlaying(false);
                setCurrentUri(null);
                clearInterval(checkInterval);
              }
            }
          }, 500);
          
          // Cleanup interval after max duration (60 seconds)
          setTimeout(() => clearInterval(checkInterval), 60000);
          
        } catch (nativeError) {
          console.error("[useAudioPlayerHook] Native playback error:", nativeError);
          setIsPlaying(false);
          setCurrentUri(null);
        }
      }
      
    } catch (error) {
      console.error("[useAudioPlayerHook] Failed to play audio:", error);
      setIsPlaying(false);
      setCurrentUri(null);
    }
  }, [currentUri, isPlaying, nativePlayer]);

  const stop = useCallback(() => {
    try {
      console.log("[useAudioPlayerHook] Stop requested");
      
      if (Platform.OS === "web") {
        if (webAudioRef.current) {
          webAudioRef.current.pause();
          webAudioRef.current.currentTime = 0;
        }
      } else {
        nativePlayer.pause();
      }
      
      setIsPlaying(false);
      setCurrentUri(null);
    } catch (error) {
      console.error("[useAudioPlayerHook] Failed to stop audio:", error);
    }
  }, [nativePlayer]);

  return {
    isPlaying,
    currentUri,
    play,
    stop,
  };
}
