import { View, Text, TouchableOpacity, Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useState, useEffect, useRef, useCallback } from "react";
import { createAudioPlayer, AudioModule, AudioPlayer } from "expo-audio";
import { MaterialIcons } from "@expo/vector-icons";

interface MessageBubbleProps {
  type: "audio" | "reaction";
  username: string;
  timestamp?: string;
  // For audio messages
  messageType?: "comment" | "tarouk";
  duration?: number;
  isPlaying?: boolean;
  onPlay?: () => void;
  audioUrl?: string;
  // For reactions
  reactionType?: string;
  reactionEmoji?: string;
}

// تحديث الأيقونات لتتوافق مع الـ 15 أيقونة في ReactionsPicker
const REACTION_EMOJIS: Record<string, string> = {
  clap: "👏",
  fire: "🔥",
  heart: "❤️",
  thumbsup: "👍",
  star: "⭐",
  laugh: "😂",
  wow: "😮",
  thinking: "🤔",
  sad: "😢",
  angry: "😡",
  check: "✅",
  cross: "❌",
  thumbsdown: "👎",
  strong: "💪",
  celebrate: "🎉",
  love: "❤️",
};

export function MessageBubble({
  type,
  username,
  timestamp,
  messageType,
  duration,
  isPlaying,
  onPlay,
  audioUrl,
  reactionType,
  reactionEmoji,
}: MessageBubbleProps) {
  const colors = useColors();
  const [localPlaying, setLocalPlaying] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);

  // تنظيف عند unmount
  useEffect(() => {
    return () => {
      if (Platform.OS === "web") {
        if (webAudioRef.current) {
          try { webAudioRef.current.pause(); webAudioRef.current.src = ""; } catch {}
          webAudioRef.current = null;
        }
      } else {
        if (playerRef.current) {
          try { playerRef.current.pause(); playerRef.current.release(); } catch {}
          playerRef.current = null;
        }
      }
    };
  }, []);

  // تنظيف player الحالي
  const cleanupPlayer = useCallback(() => {
    if (Platform.OS === "web") {
      if (webAudioRef.current) {
        try { webAudioRef.current.pause(); webAudioRef.current.src = ""; } catch {}
        webAudioRef.current = null;
      }
    } else {
      if (playerRef.current) {
        try { playerRef.current.pause(); playerRef.current.release(); } catch {}
        playerRef.current = null;
      }
    }
  }, []);

  // #7 و #9: تشغيل/إيقاف محلي بدون بث للآخرين - يستخدم expo-audio
  const handleLocalPlay = useCallback(async () => {
    if (!audioUrl) return;
    
    if (localPlaying) {
      cleanupPlayer();
      setLocalPlaying(false);
      return;
    }

    try {
      // تنظيف أي تشغيل سابق
      cleanupPlayer();

      if (Platform.OS === "web") {
        // Web: استخدام HTML5 Audio
        const audio = new Audio(audioUrl);
        audio.volume = 1.0;
        webAudioRef.current = audio;
        audio.onended = () => {
          setLocalPlaying(false);
          webAudioRef.current = null;
        };
        audio.onerror = () => {
          setLocalPlaying(false);
          webAudioRef.current = null;
        };
        await audio.play();
        setLocalPlaying(true);
      } else {
        // Native: استخدام expo-audio createAudioPlayer
        try {
          await AudioModule.setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: false,
          });
        } catch (e) {
          console.warn("[MessageBubble] Failed to set audio mode:", e);
        }

        const player = createAudioPlayer(audioUrl);
        playerRef.current = player;
        player.volume = 1.0;

        let hasEnded = false;
        player.addListener("playbackStatusUpdate", (status) => {
          if (hasEnded) return;
          if (status.isLoaded && !status.playing && status.currentTime > 0) {
            if (status.duration > 0 && status.currentTime >= status.duration - 0.1) {
              hasEnded = true;
              setLocalPlaying(false);
              // تنظيف بعد الانتهاء
              try { player.release(); } catch {}
              playerRef.current = null;
            }
          }
        });

        // انتظار التحميل
        await new Promise(r => setTimeout(r, 300));
        
        if (playerRef.current) {
          player.play();
          setLocalPlaying(true);
        }
      }
    } catch (err) {
      console.error("[MessageBubble] Local play error:", err);
      setLocalPlaying(false);
    }
  }, [audioUrl, localPlaying, cleanupPlayer]);

  if (type === "reaction") {
    const emoji = reactionEmoji || (reactionType ? REACTION_EMOJIS[reactionType] : "❓");
    
    return (
      <View className="px-4 py-2 items-center">
        <View 
          className="flex-row items-center gap-2 px-4 py-2 rounded-full"
          style={{ backgroundColor: colors.surface }}
        >
          <Text className="text-sm text-muted">{username}</Text>
          <Text className="text-2xl">{emoji}</Text>
        </View>
      </View>
    );
  }

  // Audio message bubble
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // #10: أيقونة مايكروفون للتعليق ورمز وجه يتحدث بدلاً من "تعليق"
  const getTypeLabel = () => {
    if (messageType === "tarouk") return "طاروق";
    if (messageType === "comment") return "تعليق";
    return "";
  };

  return (
    <View className="px-2 py-0.5 items-start">
      <View 
        className="rounded-lg px-2 py-1 max-w-[75%]"
        style={{ backgroundColor: colors.surface }}
      >
        <View className="flex-row items-center gap-1.5">
          {/* زر تشغيل/إيقاف محلي - #7 و #9 */}
          {audioUrl && (messageType === "comment" || messageType === "tarouk") && (
            <TouchableOpacity
              onPress={handleLocalPlay}
              style={{ padding: 2 }}
              activeOpacity={0.6}
            >
              <MaterialIcons 
                name={localPlaying ? "pause-circle-filled" : "play-circle-filled"} 
                size={20} 
                color={messageType === "tarouk" ? colors.success : colors.primary} 
              />
            </TouchableOpacity>
          )}
          
          {/* Duration */}
          <Text className="text-[10px] text-muted font-mono">
            {formatDuration(duration || 0)}
          </Text>
          
          {/* Message Type Badge */}
          {messageType && (
            <View 
              className="px-1 py-0.5 rounded"
              style={{ 
                backgroundColor: messageType === "tarouk" ? colors.success : colors.primary,
                opacity: 0.9,
              }}
            >
              <Text className="text-[9px] text-background font-bold">
                {getTypeLabel()}
              </Text>
            </View>
          )}
          
          {/* #10: أيقونة مايكروفون صغير للتعليق */}
          {messageType === "comment" && (
            <MaterialIcons name="mic" size={12} color={colors.primary} />
          )}
          
          {/* Username */}
          <Text className="text-[11px] font-bold text-foreground flex-shrink">
            {username}
          </Text>
        </View>
      </View>
    </View>
  );
}
