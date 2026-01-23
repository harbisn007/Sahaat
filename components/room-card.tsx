import { View, Text, TouchableOpacity } from "react-native";
import { useColors } from "@/hooks/use-colors";

interface RoomCardProps {
  room: {
    id: number;
    name: string;
    creatorName: string;
    playerCount: number;
    viewerCount: number;
    acceptedPlayersCount: number;
    isRoomFull: boolean;
    creatorId: number;
  };
  currentUserId: number;
  onJoinAsPlayer: () => void;
  onJoinAsViewer: () => void;
  onDirectEnter: () => void;
}

export function RoomCard({ room, currentUserId, onJoinAsPlayer, onJoinAsViewer, onDirectEnter }: RoomCardProps) {
  const colors = useColors();
  const isPlayersFull = room.isRoomFull;
  const isCreator = room.creatorId === currentUserId;

  // If creator, make the whole card clickable
  if (isCreator) {
    return (
      <TouchableOpacity
        className="bg-surface rounded-2xl p-4 mb-3 border-2 shadow-sm"
        style={{ borderColor: colors.primary }}
        onPress={onDirectEnter}
        activeOpacity={0.7}
      >
        {/* Room Info */}
        <View className="mb-3">
          <View className="flex-row items-center gap-2 mb-1">
            <Text className="text-lg font-bold text-foreground">{room.name}</Text>
            <Text className="text-base">👑</Text>
          </View>
          <Text className="text-sm" style={{ color: colors.primary }}>غرفتك - اضغط للدخول</Text>
        </View>

        {/* Stats */}
        <View className="flex-row gap-4">
          <View className="flex-row items-center gap-1">
            <Text className="text-sm text-muted">🎮</Text>
            <Text className="text-sm text-foreground">
              {room.acceptedPlayersCount}/2 لاعبين
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Text className="text-sm text-muted">👁️</Text>
            <Text className="text-sm text-foreground">{room.viewerCount} مشاهدين</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // For non-creators, show the buttons
  return (
    <View className="bg-surface rounded-2xl p-4 mb-3 border border-border shadow-sm">
      {/* Room Info */}
      <View className="mb-3">
        <Text className="text-lg font-bold text-foreground mb-1">{room.name}</Text>
        <Text className="text-sm text-muted">المنشئ: {room.creatorName}</Text>
      </View>

      {/* Stats */}
      <View className="flex-row gap-4 mb-3">
        <View className="flex-row items-center gap-1">
          <Text className="text-sm text-muted">🎮</Text>
          <Text className="text-sm text-foreground">
            {room.acceptedPlayersCount}/2 لاعبين
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Text className="text-sm text-muted">👁️</Text>
          <Text className="text-sm text-foreground">{room.viewerCount} مشاهدين</Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View className="flex-row gap-2">
        <TouchableOpacity
          className="flex-1 rounded-xl py-2 items-center"
          style={{
            backgroundColor: isPlayersFull ? colors.muted : colors.primary,
            opacity: isPlayersFull ? 0.5 : 1,
          }}
          onPress={onJoinAsPlayer}
          disabled={isPlayersFull}
        >
          <Text
            className="font-semibold text-sm"
            style={{ color: isPlayersFull ? colors.foreground : colors.background }}
          >
            {isPlayersFull ? "ممتلئة" : "دخول كلاعب"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="flex-1 bg-surface border-2 rounded-xl py-2 items-center"
          style={{ borderColor: colors.primary }}
          onPress={onJoinAsViewer}
        >
          <Text className="font-semibold text-sm" style={{ color: colors.primary }}>
            دخول كمشاهد
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
