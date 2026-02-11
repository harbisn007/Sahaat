import { View, Text } from "react-native";

interface ReactionMessageProps {
  username: string;
  reactionType: string;
  createdAt: Date | string;
  isOwnMessage?: boolean;
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

export function ReactionMessage({ username, reactionType, createdAt, isOwnMessage }: ReactionMessageProps) {
  const emoji = REACTION_EMOJIS[reactionType] || "😊";
  
  // Format time (e.g., "10:30 AM")
  const timeString = new Date(createdAt).toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <View className="flex-row items-center gap-1 py-0.5 px-2 justify-end">
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
