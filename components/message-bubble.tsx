import { View, Text, TouchableOpacity } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { AudioMessage } from "./audio-message";

interface MessageBubbleProps {
  type: "audio" | "reaction";
  username: string;
  timestamp?: string;
  // For audio messages
  messageType?: "comment" | "tarouk";
  duration?: number;
  isPlaying?: boolean;
  onPlay?: () => void;
  // For reactions
  reactionType?: string;
  reactionEmoji?: string;
}

// تحديث الأيقونات لتتوافق مع الـ 15 أيقونة في ReactionsPicker
const REACTION_EMOJIS: Record<string, string> = {
  // الصف الأول - التفاعل الإيجابي
  clap: "👏",
  fire: "🔥",
  heart: "❤️",
  thumbsup: "👍",
  star: "⭐",
  // الصف الثاني - المشاعر
  laugh: "😂",
  wow: "😮",
  thinking: "🤔",
  sad: "😢",
  angry: "😡",
  // الصف الثالث - الموافقة وعدم الموافقة
  check: "✅",
  cross: "❌",
  thumbsdown: "👎",
  strong: "💪",
  celebrate: "🎉",
  // للتوافق مع القديم
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
  reactionType,
  reactionEmoji,
}: MessageBubbleProps) {
  const colors = useColors();

  if (type === "reaction") {
    const emoji = reactionEmoji || (reactionType ? REACTION_EMOJIS[reactionType] : "❓");
    
    return (
      <View className="px-4 py-2 items-center">
        <View 
          className="flex-row items-center gap-2 px-4 py-2 rounded-full"
          style={{ backgroundColor: colors.surface }}
        >
          <Text className="text-2xl">{emoji}</Text>
          <Text className="text-sm text-muted">{username}</Text>
        </View>
      </View>
    );
  }

  // Audio message bubble - simplified and compact
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <View className="px-2 py-0.5 items-end">
      <View 
        className="rounded-lg px-2 py-1 max-w-[75%]"
        style={{ backgroundColor: colors.surface }}
      >
        <View className="flex-row items-center gap-1.5">
          {/* Username */}
          <Text className="text-[11px] font-bold text-foreground flex-shrink">
            {username}
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
                {messageType === "tarouk" ? "طاروق" : "تعليق"}
              </Text>
            </View>
          )}
          
          {/* Duration */}
          <Text className="text-[10px] text-muted font-mono">
            {formatDuration(duration || 0)}
          </Text>
        </View>
      </View>
    </View>
  );
}
