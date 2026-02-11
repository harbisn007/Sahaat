import { View, Text, TouchableOpacity } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useState, useEffect, useRef } from "react";
import { useAudioPlayer } from "expo-audio";
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
  const playerRef = useRef<any>(null);

  // تنظيف عند unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try { playerRef.current.pause(); } catch {}
      }
    };
  }, []);

  // #7 و #9: تشغيل/إيقاف محلي بدون بث للآخرين
  const handleLocalPlay = async () => {
    if (!audioUrl) return;
    
    if (localPlaying && playerRef.current) {
      try {
        playerRef.current.pause();
        setLocalPlaying(false);
      } catch {}
      return;
    }

    try {
      // إنشاء Audio جديد للتشغيل المحلي
      const audio = new Audio(audioUrl);
      playerRef.current = audio;
      audio.onended = () => setLocalPlaying(false);
      audio.onerror = () => setLocalPlaying(false);
      await audio.play();
      setLocalPlaying(true);
    } catch (err) {
      console.error("Local play error:", err);
      setLocalPlaying(false);
    }
  };

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
    if (messageType === "comment") return "🗣️";
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
