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

  const requestPermissions = async () => {
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      return granted;
    } catch (error) {
      console.error("Failed to request audio permissions:", error);
      return false;
    }
  };

  const startRecording = async (): Promise<boolean> => {
    try {
      setIsPreparing(true);

      // Request permissions
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        throw new Error("Audio recording permission not granted");
      }

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
    } catch (error) {
      console.error("Failed to start recording:", error);
      setIsPreparing(false);
      setIsRecording(false);
      return false;
    }
  };

  const stopRecording = async (): Promise<AudioRecording | null> => {
    try {
      if (!recordingRef.current) {
        return null;
      }

      setIsRecording(false);
      
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordingDuration(0);

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
      const duration = result.durationMillis ? Math.floor(result.durationMillis / 1000) : 0;

      return {
        uri: result.uri,
        duration,
      };
    } catch (error) {
      console.error("Failed to stop recording:", error);
      recordingRef.current = null;
      return null;
    }
  };

  const cancelRecording = async () => {
    try {
      if (recordingRef.current) {
        await AudioModule.stopRecordingAsync();
        recordingRef.current = null;
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
