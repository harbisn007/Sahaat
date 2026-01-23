import { useState, useRef } from "react";
import { useAudioRecorder as useExpoAudioRecorder, AudioModule } from "expo-audio";
import { Platform } from "react-native";

export interface AudioRecording {
  uri: string;
  duration: number;
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const maxDuration = 60; // 60 seconds max
  
  // Web-specific refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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
        // Web: Request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("[useAudioRecorder] Microphone permission granted");
        // Stop the stream immediately, we just needed to request permission
        stream.getTracks().forEach(track => track.stop());
        return true;
      } else {
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
        const mediaRecorder = new MediaRecorder(stream);
        
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorder.start();
        mediaRecorderRef.current = mediaRecorder;
        
        setIsRecording(true);
        setIsPreparing(false);
        setRecordingDuration(0);
        
        // Start timer
        timerRef.current = setInterval(() => {
          setRecordingDuration((prev) => {
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
        // Native implementation
        // Set audio mode
        await AudioModule.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });

        // Create and start recording
        const recording = await AudioModule.startRecordingAsync();

        recordingRef.current = recording as any;
        setIsRecording(true);
        setIsPreparing(false);
        setRecordingDuration(0);
        
        // Start timer
        timerRef.current = setInterval(() => {
          setRecordingDuration((prev) => {
            const newDuration = prev + 1;
            // Auto-stop at max duration
            if (newDuration >= maxDuration) {
              stopRecording();
            }
            return newDuration;
          });
        }, 1000);
        
        return true;
      }
    } catch (error) {
      console.error("[useAudioRecorder] Failed to start recording:", error);
      console.error("[useAudioRecorder] Error details:", error instanceof Error ? error.message : String(error));
      setIsPreparing(false);
      setIsRecording(false);
      return false;
    }
  };

  const stopRecording = async (): Promise<AudioRecording | null> => {
    try {
      setIsRecording(false);
      
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const duration = recordingDuration;
      setRecordingDuration(0);

      if (Platform.OS === "web") {
        // Web implementation
        return new Promise((resolve) => {
          if (!mediaRecorderRef.current) {
            resolve(null);
            return;
          }
          
          const mediaRecorder = mediaRecorderRef.current;
          
          mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            // Stop all tracks
            if (mediaRecorder.stream) {
              mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }
            
            mediaRecorderRef.current = null;
            audioChunksRef.current = [];
            
            resolve({
              uri: audioUrl,
              duration,
            });
          };
          
          mediaRecorder.stop();
        });
      } else {
        // Native implementation
        if (!recordingRef.current) {
          return null;
        }

        const result = await AudioModule.stopRecordingAsync();
        
        // Reset audio mode
        await AudioModule.setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });

        recordingRef.current = null;

        if (!result || !result.uri) {
          throw new Error("Recording URI is null");
        }

        // Duration in seconds
        const recordedDuration = result.durationMillis ? Math.floor(result.durationMillis / 1000) : 0;

        return {
          uri: result.uri,
          duration: recordedDuration,
        };
      }
    } catch (error) {
      console.error("Failed to stop recording:", error);
      recordingRef.current = null;
      mediaRecorderRef.current = null;
      return null;
    }
  };

  const cancelRecording = async () => {
    try {
      if (Platform.OS === "web") {
        if (mediaRecorderRef.current) {
          mediaRecorderRef.current.stop();
          if (mediaRecorderRef.current.stream) {
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
          }
          mediaRecorderRef.current = null;
          audioChunksRef.current = [];
        }
      } else {
        if (recordingRef.current) {
          await AudioModule.stopRecordingAsync();
          recordingRef.current = null;
        }
      }
      
      setIsRecording(false);
      setIsPreparing(false);
      
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordingDuration(0);
    } catch (error) {
      console.error("Failed to cancel recording:", error);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    isRecording,
    isPreparing,
    recordingDuration,
    maxDuration,
    formattedDuration: formatDuration(recordingDuration),
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
