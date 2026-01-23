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

const REACTION_EMOJIS: Record<string, string> = {
  clap: "👏",
  laugh: "😂",
  wow: "😮",
  love: "❤️",
  fire: "🔥",
  thumbsup: "👍",
  thinking: "🤔",
  heart: "💖",
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

  // Audio message bubble
  return (
    <View className="px-3 py-1">
      <View 
        className="rounded-xl p-2 max-w-[80%]"
        style={{ backgroundColor: colors.surface }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-xs font-bold text-foreground">{username}</Text>
          {messageType && (
            <View 
              className="px-1.5 py-0.5 rounded"
              style={{ 
                backgroundColor: messageType === "tarouk" ? colors.success : colors.primary,
                opacity: 0.8,
              }}
            >
              <Text className="text-[10px] text-background font-semibold">
                {messageType === "tarouk" ? "طاروق" : "تعليق"}
              </Text>
            </View>
          )}
        </View>

        {/* Audio Player */}
        {onPlay && (
          <AudioMessage
            username=""
            messageType={messageType || "comment"}
            duration={duration || 0}
            isPlaying={isPlaying || false}
          />
        )}

        {/* Timestamp */}
        {timestamp && (
          <Text className="text-[10px] text-muted mt-0.5 text-left">{timestamp}</Text>
        )}
      </View>
    </View>
  );
}
