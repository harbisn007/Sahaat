import { View, Text } from "react-native";

interface ReactionMessageProps {
  username: string;
  reactionType: string;
  createdAt: Date | string;
  isOwnMessage?: boolean;
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

export function ReactionMessage({ username, reactionType, createdAt, isOwnMessage }: ReactionMessageProps) {
  const emoji = REACTION_EMOJIS[reactionType] || "😊";
  
  // Format time (e.g., "10:30 AM")
  const timeString = new Date(createdAt).toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <View className={`flex-row items-center gap-1 py-0.5 px-2 ${isOwnMessage ? "justify-end" : "justify-start"}`}>
      <View
        className={`flex-row items-center gap-1 px-2 py-1 rounded-xl ${
          isOwnMessage ? "bg-primary/20" : "bg-surface"
        }`}
      >
        <Text className="text-2xl">{emoji}</Text>
        <View>
          <Text className="text-xs font-semibold text-foreground">{username}</Text>
          <Text className="text-[10px] text-muted">{timeString}</Text>
        </View>
      </View>
    </View>
  );
}
