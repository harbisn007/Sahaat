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
    creatorId: string;
  };
  currentUserId: string;
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
        className="bg-surface rounded-xl p-3 border-2 shadow-sm"
        style={{ borderColor: colors.primary, flex: 1 }}
        onPress={onDirectEnter}
        activeOpacity={0.7}
      >
        {/* Room Info */}
        <View className="mb-2">
          <View className="flex-row items-center gap-1 mb-1">
            <Text className="text-sm font-bold text-foreground" numberOfLines={1}>{room.name}</Text>
            <Text className="text-xs">👑</Text>
          </View>
          <Text className="text-xs" style={{ color: colors.primary }}>ساحتك</Text>
        </View>

        {/* Stats */}
        <View className="flex-row gap-2">
          <View className="flex-row items-center gap-1">
            <Text className="text-xs text-muted">🎮</Text>
            <Text className="text-xs text-foreground">
              {room.acceptedPlayersCount}/2
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Text className="text-xs text-muted">👁️</Text>
            <Text className="text-xs text-foreground">{room.viewerCount}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // For non-creators, show the buttons
  return (
    <View className="bg-surface rounded-xl p-3 border border-border shadow-sm" style={{ flex: 1 }}>
      {/* Room Info */}
      <View className="mb-2">
        <Text className="text-sm font-bold text-foreground mb-1" numberOfLines={1}>{room.name}</Text>
        <Text className="text-xs text-muted" numberOfLines={1}>{room.creatorName}</Text>
      </View>

      {/* Stats */}
      <View className="flex-row gap-2 mb-2">
        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-muted">🎮</Text>
          <Text className="text-xs text-foreground">
            {room.acceptedPlayersCount}/2
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-muted">👁️</Text>
          <Text className="text-xs text-foreground">{room.viewerCount}</Text>
        </View>
      </View>

      {/* Action Buttons - Stacked vertically for compact design */}
      <View className="gap-1">
        <TouchableOpacity
          className="rounded-lg py-1.5 items-center"
          style={{
            backgroundColor: isPlayersFull ? colors.muted : colors.primary,
            opacity: isPlayersFull ? 0.5 : 1,
          }}
          onPress={onJoinAsPlayer}
          disabled={isPlayersFull}
        >
          <Text
            className="font-semibold text-xs"
            style={{ color: isPlayersFull ? colors.foreground : colors.background }}
          >
            {isPlayersFull ? "ممتلئة" : "لاعب"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-surface border rounded-lg py-1.5 items-center"
          style={{ borderColor: colors.primary }}
          onPress={onJoinAsViewer}
        >
          <Text className="font-semibold text-xs" style={{ color: colors.primary }}>
            مشاهد
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
