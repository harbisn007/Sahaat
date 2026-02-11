import { View, Text } from "react-native";
import { useColors } from "@/hooks/use-colors";

interface AudioMessageProps {
  username: string;
  messageType: "comment" | "tarouk";
  duration: number;
  isPlaying: boolean;
}

export function AudioMessage({
  username,
  messageType,
  duration,
  isPlaying,
}: AudioMessageProps) {
  const colors = useColors();

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <View className="bg-surface rounded-lg px-3 py-2 mb-2 border border-border">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-foreground font-semibold text-sm">{username}</Text>
        </View>
        
        <View className="flex-row items-center gap-2">
          <View
            className="px-2 py-0.5 rounded"
            style={{
              backgroundColor:
                messageType === "tarouk" ? colors.success + "30" : colors.primary + "30",
            }}
          >
            <Text
              className="text-xs font-bold"
              style={{
                color: messageType === "tarouk" ? colors.success : colors.primary,
              }}
            >
              {messageType === "tarouk" ? "طاروق" : "تعليق"}
            </Text>
          </View>
          
          <View className="flex-row items-center gap-1">
            <Text className="text-lg">{isPlaying ? "🔊" : "🔇"}</Text>
            <Text className="text-sm text-muted font-mono">{formatDuration(duration)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
