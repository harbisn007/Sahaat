import { useState, useRef, useEffect } from "react";
import { 
  useAudioRecorder as useExpoAudioRecorder, 
  useAudioRecorderState,
  RecordingPresets,
  AudioModule 
} from "expo-audio";
import { Platform } from "react-native";

export interface AudioRecording {
  uri: string;
  duration: number;
}

export function useAudioRecorder() {
  const [isPreparing, setIsPreparing] = useState(false);
  const maxDuration = 60; // seconds

  // Use expo-audio's built-in recorder for native platforms
  const expoRecorder = useExpoAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(expoRecorder);

  // Web-specific refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [webRecordingDuration, setWebRecordingDuration] = useState(0);
  const [webIsRecording, setWebIsRecording] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      // Release native recorder
      if (Platform.OS !== "web") {
        try {
          expoRecorder.release();
        } catch (e) {
          console.log("[useAudioRecorder] Recorder already released");
        }
      }
    };
  }, [expoRecorder]);

  // Auto-stop at max duration for native
  useEffect(() => {
    if (Platform.OS !== "web" && recorderState.isRecording) {
      const durationSeconds = Math.floor(recorderState.durationMillis / 1000);
      if (durationSeconds >= maxDuration) {
        stopRecording();
      }
    }
  }, [recorderState.durationMillis, recorderState.isRecording]);

  const requestPermissions = async () => {
    try {
      if (Platform.OS === "web") {
        // Check if running on HTTPS (required for getUserMedia)
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
          console.error("[useAudioRecorder] getUserMedia requires HTTPS");
          throw new Error("يتطلب التسجيل الصوتي اتصال آمن (HTTPS). يرجى استخدام تطبيق Expo Go على هاتفك.");
        }
        
        // Check if getUserMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          console.error("[useAudioRecorder] getUserMedia is not supported");
          throw new Error("متصفحك لا يدعم التسجيل الصوتي.");
        }
        
        console.log("[useAudioRecorder] Requesting microphone permission...");
        // Request permission by attempting to get user media
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("[useAudioRecorder] Microphone permission granted");
        // Stop the stream immediately, we just needed to request permission
        stream.getTracks().forEach(track => track.stop());
        return true;
      } else {
        // Native: Request recording permissions
        const { granted } = await AudioModule.requestRecordingPermissionsAsync();
        return granted;
      }
    } catch (error) {
      console.error("[useAudioRecorder] Failed to request audio permissions:", error);
      if (error instanceof Error && error.message.includes("يتطلب")) {
        throw error; // Re-throw custom error messages
      }
      throw new Error("فشل الحصول على أذونات المايكروفون. تأكد من السماح بالوصول.");
    }
  };

  const startRecording = async (): Promise<boolean> => {
    try {
      console.log("[useAudioRecorder] startRecording called, platform:", Platform.OS);
      setIsPreparing(true);

      // Request permissions
      console.log("[useAudioRecorder] Requesting permissions...");
      const hasPermission = await requestPermissions();
      console.log("[useAudioRecorder] Permission granted:", hasPermission);
      if (!hasPermission) {
        throw new Error("Audio recording permission not granted");
      }

      if (Platform.OS === "web") {
        console.log("[useAudioRecorder] Using web MediaRecorder...");
        // Web implementation using MediaRecorder
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const mediaRecorder = new MediaRecorder(stream);
        
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorder.start();
        mediaRecorderRef.current = mediaRecorder;
        
        setWebIsRecording(true);
        setIsPreparing(false);
        setWebRecordingDuration(0);
        
        // Start timer
        timerRef.current = setInterval(() => {
          setWebRecordingDuration((prev) => {
            const newDuration = prev + 1;
            // Auto-stop at max duration
            if (newDuration >= maxDuration) {
              stopRecording();
            }
            return newDuration;
          });
        }, 1000);
        
        return true;
      } else {
        // Native implementation using expo-audio's recorder
        console.log("[useAudioRecorder] Using expo-audio recorder...");
        
        // Set audio mode for recording
        await AudioModule.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
        
        // Prepare and start recording
        try {
          await expoRecorder.prepareToRecordAsync();
        } catch (prepareError) {
          // If already prepared, that's okay - just continue
          console.log("[useAudioRecorder] Recorder already prepared, continuing...");
        }
        expoRecorder.record();
        
        setIsPreparing(false);
        
        console.log("[useAudioRecorder] Recording started successfully");
        return true;
      }
    } catch (error) {
      console.error("[useAudioRecorder] Failed to start recording:", error);
      console.error("[useAudioRecorder] Error details:", error instanceof Error ? error.message : String(error));
      setIsPreparing(false);
      throw error;
    }
  };

  const stopRecording = async (): Promise<AudioRecording | null> => {
    try {
      if (Platform.OS === "web") {
        setWebIsRecording(false);
        
        // Clear timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        // Web implementation
        return new Promise((resolve) => {
          const mediaRecorder = mediaRecorderRef.current;
          if (!mediaRecorder) {
            resolve(null);
            return;
          }

          mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
            const uri = URL.createObjectURL(audioBlob);
            
            // Stop all tracks
            if (streamRef.current) {
              streamRef.current.getTracks().forEach(track => track.stop());
              streamRef.current = null;
            }
            
            resolve({
              uri,
              duration: webRecordingDuration,
            });
          };

          mediaRecorder.stop();
          mediaRecorderRef.current = null;
        });
      } else {
        // Native implementation using expo-audio's recorder
        await expoRecorder.stop();
        
        if (!expoRecorder.uri) {
          return null;
        }
        
        const uri = expoRecorder.uri;
        const durationSeconds = Math.floor(recorderState.durationMillis / 1000);
        
        const result = {
          uri,
          duration: durationSeconds,
        };
        
        // Release recorder after stopping to free resources
        try {
          await expoRecorder.release();
          console.log("[useAudioRecorder] Recorder released after stop");
        } catch (e) {
          console.log("[useAudioRecorder] Failed to release recorder:", e);
        }
        
        return result;
      }
    } catch (error) {
      console.error("Failed to stop recording:", error);
      return null;
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Return appropriate values based on platform
  const isRecording = Platform.OS === "web" ? webIsRecording : recorderState.isRecording;
  const recordingDuration = Platform.OS === "web" 
    ? webRecordingDuration 
    : Math.floor(recorderState.durationMillis / 1000);

  return {
    isRecording,
    isPreparing,
    recordingDuration,
    formattedDuration: formatDuration(recordingDuration),
    startRecording,
    stopRecording,
  };
}
