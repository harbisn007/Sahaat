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
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const maxDuration = 60; // seconds

  // Use ref to store recorder instance (Native only)
  const recorderRef = useRef<InstanceType<typeof AudioModule.AudioRecorder> | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

  // Web-specific refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Track if this is the first recording attempt in this session
  const isFirstAttemptRef = useRef(true);
  // Timeout ref for isPreparing safety reset
  const preparingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (preparingTimeoutRef.current) {
        clearTimeout(preparingTimeoutRef.current);
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
          // Ignore
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
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
          throw new Error("يتطلب التسجيل الصوتي اتصال آمن (HTTPS). يرجى استخدام تطبيق Expo Go على هاتفك.");
        }
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("متصفحك لا يدعم التسجيل الصوتي.");
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
      } else {
        if (permissionGranted === true) {
          return true;
        }
        
        const { granted } = await AudioModule.requestRecordingPermissionsAsync();
        setPermissionGranted(granted);
        return granted;
      }
    } catch (error) {
      console.error("[useAudioRecorder] Failed to request audio permissions:", error);
      if (error instanceof Error && error.message.includes("يتطلب")) {
        throw error;
      }
      throw new Error("فشل الحصول على أذونات المايكروفون. تأكد من السماح بالوصول.");
    }
  }, [permissionGranted]);

  // Internal function to actually start recording
  const doStartRecording = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") {
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
      
      setRecordingDuration(0);
      setIsRecording(true);
      
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
      
      return true;
    } else {
      // Native implementation
      
      // Set audio mode
      try {
        await AudioModule.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
      } catch (modeError) {
        console.warn("[useAudioRecorder] Audio mode failed:", modeError);
      }
      
      // Release any existing recorder
      if (recorderRef.current) {
        try {
          await recorderRef.current.release();
        } catch (e) {
          // Ignore
        }
        recorderRef.current = null;
      }
      
      // Create and prepare recorder
      const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
      recorderRef.current = recorder;
      
      await recorder.prepareToRecordAsync();
      
      // Start recording
      recorder.record();
      
      setRecordingDuration(0);
      setIsRecording(true);
      
      // Start timer
      recordingStartTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
        setRecordingDuration(elapsed);
      }, 1000);
      
      return true;
    }
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    // Prevent starting if already recording
    if (isRecording) {
      console.log("[useAudioRecorder] Already recording, ignoring");
      return false;
    }

    // Clear any stuck preparing state
    if (preparingTimeoutRef.current) {
      clearTimeout(preparingTimeoutRef.current);
    }

    try {
      console.log("[useAudioRecorder] startRecording called, platform:", Platform.OS);
      setIsPreparing(true);
      
      // Set a safety timeout to reset isPreparing if it gets stuck
      preparingTimeoutRef.current = setTimeout(() => {
        console.log("[useAudioRecorder] Safety timeout - resetting isPreparing");
        setIsPreparing(false);
      }, 10000); // 10 second safety timeout

      // Request permissions
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        setIsPreparing(false);
        if (preparingTimeoutRef.current) {
          clearTimeout(preparingTimeoutRef.current);
        }
        throw new Error("لم يتم منح إذن المايكروفون");
      }

      // For first attempt on native, add a delay to let audio system initialize
      if (Platform.OS !== "web" && isFirstAttemptRef.current) {
        console.log("[useAudioRecorder] First attempt - adding initialization delay...");
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Try to start recording with automatic retry
      let lastError: Error | null = null;
      const maxAttempts = isFirstAttemptRef.current ? 3 : 2;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          console.log(`[useAudioRecorder] Recording attempt ${attempt}/${maxAttempts}...`);
          const success = await doStartRecording();
          
          if (success) {
            console.log("[useAudioRecorder] Recording started successfully");
            isFirstAttemptRef.current = false;
            setIsPreparing(false);
            if (preparingTimeoutRef.current) {
              clearTimeout(preparingTimeoutRef.current);
            }
            return true;
          }
        } catch (attemptError) {
          lastError = attemptError as Error;
          console.warn(`[useAudioRecorder] Attempt ${attempt} failed:`, attemptError);
          
          // Clean up failed recorder
          if (Platform.OS !== "web" && recorderRef.current) {
            try {
              await recorderRef.current.release();
            } catch (e) {
              // Ignore
            }
            recorderRef.current = null;
          }
          
          if (attempt < maxAttempts) {
            // Wait before retry with increasing delay
            const delay = 300 * attempt;
            console.log(`[useAudioRecorder] Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Re-initialize audio mode
            if (Platform.OS !== "web") {
              try {
                await AudioModule.setAudioModeAsync({
                  allowsRecording: true,
                  playsInSilentMode: true,
                });
              } catch (e) {
                // Ignore
              }
            }
          }
        }
      }
      
      // All attempts failed
      throw lastError || new Error("فشل بدء التسجيل");
      
    } catch (error) {
      console.error("[useAudioRecorder] Failed to start recording:", error);
      setIsPreparing(false);
      setIsRecording(false);
      if (preparingTimeoutRef.current) {
        clearTimeout(preparingTimeoutRef.current);
      }
      throw error;
    }
  }, [isRecording, requestPermissions, doStartRecording]);

  const stopRecording = useCallback(async (): Promise<AudioRecording | null> => {
    // Clear timers
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (preparingTimeoutRef.current) {
      clearTimeout(preparingTimeoutRef.current);
      preparingTimeoutRef.current = null;
    }

    // Save current duration before resetting
    const currentDuration = recordingDuration;
    setIsRecording(false);
    setIsPreparing(false);
    setRecordingDuration(0);

    try {
      if (Platform.OS === "web") {
        return new Promise((resolve) => {
          const mediaRecorder = mediaRecorderRef.current;
          if (!mediaRecorder || mediaRecorder.state === "inactive") {
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
        // Native implementation
        if (!recorderRef.current) {
          return null;
        }
        
        await recorderRef.current.stop();
        
        const uri = recorderRef.current.uri;
        
        const result = {
          uri,
          duration: currentDuration,
        };
        
        // Release recorder
        try {
          await recorderRef.current.release();
        } catch (e) {
          // Ignore
        }
        recorderRef.current = null;
        
        return result;
      }
    } catch (error) {
      console.error("Failed to stop recording:", error);
      if (Platform.OS !== "web" && recorderRef.current) {
        try {
          await recorderRef.current.release();
        } catch (e) {
          // Ignore
        }
        recorderRef.current = null;
      }
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
    maxDuration,
    startRecording,
    stopRecording,
    requestPermissions,
  };
}
