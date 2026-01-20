import { View, Text, TouchableOpacity } from "react-native";
import { useColors } from "@/hooks/use-colors";

interface AudioMessageProps {
  username: string;
  messageType: "comment" | "tarouk";
  duration: number;
  isPlaying: boolean;
  onPlay: () => void;
}

export function AudioMessage({
  username,
  messageType,
  duration,
  isPlaying,
  onPlay,
}: AudioMessageProps) {
  const colors = useColors();

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <View className="bg-surface rounded-xl p-3 mb-2 border border-border">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-foreground font-semibold mb-1">{username}</Text>
          <View className="flex-row items-center gap-2">
            <View
              className="px-2 py-1 rounded"
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
            <Text className="text-sm text-muted">{formatDuration(duration)}</Text>
          </View>
        </View>

        <TouchableOpacity
          className="w-12 h-12 rounded-full items-center justify-center"
          style={{ backgroundColor: isPlaying ? colors.error : colors.primary }}
          onPress={onPlay}
        >
          <Text className="text-background text-xl">{isPlaying ? "⏸" : "▶"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
