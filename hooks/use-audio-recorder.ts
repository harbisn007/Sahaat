import { useState, useRef, useEffect, useCallback } from "react";
import { 
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
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const maxDuration = 60; // seconds

  // Use ref to store recorder instance (Native only)
  const recorderRef = useRef<InstanceType<typeof AudioModule.AudioRecorder> | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

  // Web-specific refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
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
      if (Platform.OS !== "web" && recorderRef.current) {
        try {
          recorderRef.current.release();
          recorderRef.current = null;
        } catch (e) {
          console.log("[useAudioRecorder] Recorder already released");
        }
      }
    };
  }, []);

  // Auto-stop at max duration
  useEffect(() => {
    if (isRecording && recordingDuration >= maxDuration) {
      stopRecording();
    }
  }, [recordingDuration, isRecording]);

  const requestPermissions = useCallback(async () => {
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
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    // Prevent starting if already recording
    if (isRecording || isPreparing) {
      console.log("[useAudioRecorder] Already recording or preparing, ignoring start request");
      return false;
    }

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
        
        // Set recording state AFTER everything is ready
        setRecordingDuration(0);
        setIsRecording(true);
        setIsPreparing(false);
        
        // Start timer
        timerRef.current = setInterval(() => {
          setRecordingDuration((prev) => prev + 1);
        }, 1000);
        
        return true;
      } else {
        // Native implementation using expo-audio's recorder
        console.log("[useAudioRecorder] Using expo-audio recorder...");
        
        // Set audio mode for recording with retry
        let audioModeSet = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await AudioModule.setAudioModeAsync({
              allowsRecording: true,
              playsInSilentMode: true,
            });
            audioModeSet = true;
            console.log("[useAudioRecorder] Audio mode set successfully on attempt", attempt);
            break;
          } catch (modeError) {
            console.warn(`[useAudioRecorder] Failed to set audio mode (attempt ${attempt}/3):`, modeError);
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
        }
        
        if (!audioModeSet) {
          console.warn("[useAudioRecorder] Could not set audio mode, proceeding anyway...");
        }
        
        // Create new AudioRecorder instance for each recording session with retry
        console.log("[useAudioRecorder] Creating new AudioRecorder instance...");
        let recorder: InstanceType<typeof AudioModule.AudioRecorder> | null = null;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            recorder = new AudioModule.AudioRecorder(
              RecordingPresets.HIGH_QUALITY
            );
            recorderRef.current = recorder;
            
            // Prepare and start recording
            await recorder.prepareToRecordAsync();
            console.log("[useAudioRecorder] Recorder prepared successfully on attempt", attempt);
            break;
          } catch (prepareError) {
            console.warn(`[useAudioRecorder] Failed to prepare recorder (attempt ${attempt}/3):`, prepareError);
            if (recorder) {
              try { recorder.release(); } catch (e) {}
            }
            recorder = null;
            recorderRef.current = null;
            
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 300));
            } else {
              throw new Error("فشل تهيئة المسجل. يرجى إغلاق التطبيق وإعادة فتحه.");
            }
          }
        }
        
        if (!recorder) {
          throw new Error("فشل إنشاء المسجل.");
        }
        
        recorder.record();
        console.log("[useAudioRecorder] Recording started");
        
        // Set recording state AFTER everything is ready
        setRecordingDuration(0);
        setIsRecording(true);
        setIsPreparing(false);
        
        // Start timer for duration tracking
        recordingStartTimeRef.current = Date.now();
        timerRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
          setRecordingDuration(elapsed);
        }, 1000);
        
        console.log("[useAudioRecorder] Recording started successfully");
        return true;
      }
    } catch (error) {
      console.error("[useAudioRecorder] Failed to start recording:", error);
      console.error("[useAudioRecorder] Error details:", error instanceof Error ? error.message : String(error));
      setIsPreparing(false);
      setIsRecording(false);
      throw error;
    }
  }, [isRecording, isPreparing, requestPermissions]);

  const stopRecording = useCallback(async (): Promise<AudioRecording | null> => {
    // Clear timer first
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Reset state immediately
    const currentDuration = recordingDuration;
    setIsRecording(false);
    setRecordingDuration(0);

    try {
      if (Platform.OS === "web") {
        // Web implementation
        return new Promise((resolve) => {
          const mediaRecorder = mediaRecorderRef.current;
          if (!mediaRecorder || mediaRecorder.state === "inactive") {
            // Stop all tracks
            if (streamRef.current) {
              streamRef.current.getTracks().forEach(track => track.stop());
              streamRef.current = null;
            }
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
              duration: currentDuration,
            });
          };

          mediaRecorder.stop();
          mediaRecorderRef.current = null;
        });
      } else {
        // Native implementation using expo-audio's recorder
        if (!recorderRef.current) {
          console.error("[useAudioRecorder] No recorder instance to stop");
          return null;
        }
        
        await recorderRef.current.stop();
        
        if (!recorderRef.current.uri) {
          return null;
        }
        
        const uri = recorderRef.current.uri;
        
        const result = {
          uri,
          duration: currentDuration,
        };
        
        // Release recorder after stopping to free resources
        try {
          await recorderRef.current.release();
          recorderRef.current = null;
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
  }, [recordingDuration]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return {
    isRecording,
    isPreparing,
    recordingDuration,
    formattedDuration: formatDuration(recordingDuration),
    startRecording,
    stopRecording,
  };
}
