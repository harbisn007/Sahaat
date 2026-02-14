import { View, Text } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
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
          <MaterialIcons name="mic" size={16} color={messageType === "tarouk" ? "#EF4444" : colors.primary} />
          
          <View className="flex-row items-center gap-1">
            <Text className="text-lg">{isPlaying ? "🔊" : "🔇"}</Text>
            <Text className="text-sm text-muted font-mono">{formatDuration(duration)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
