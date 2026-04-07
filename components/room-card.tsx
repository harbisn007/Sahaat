import { View, Text, TouchableOpacity, Image } from "react-native";
import { useColors } from "@/hooks/use-colors";

import { getAvatarSourceById } from "@/lib/avatars";

interface RoomCardProps {
  room: {
    id: number;
    name: string;
    creatorName: string;
    creatorAvatar?: string;
    playerCount: number;
    viewerCount: number;
    acceptedPlayersCount: number;
    isRoomFull: boolean;
    creatorId: string;
    hasGoldStar?: "true" | "false";
  };
  currentUserId: string;
  onJoinAsViewer: () => void;
  onDirectEnter: () => void;
  showGoldStar?: boolean;
  rank?: number;
}

export function RoomCard({ 
  room, 
  currentUserId, 
  onJoinAsViewer, 
  onDirectEnter,
  showGoldStar = false,
  rank,
}: RoomCardProps) {
  const colors = useColors();
  const isPlayersFull = room.isRoomFull;
  const isCreator = room.creatorId === currentUserId;
  const hasGoldStar = showGoldStar || room.hasGoldStar === "true";

  const getAvatarSource = () => getAvatarSourceById(room.creatorAvatar);

  // If creator, make the whole card clickable
  if (isCreator) {
    return (
      <TouchableOpacity
        className="bg-surface rounded-xl p-3 border-2 shadow-sm"
        style={{ borderColor: colors.primary, flex: 1 }}
        onPress={onDirectEnter}
        activeOpacity={0.7}
      >
        {/* Rank Badge - top right */}
        {rank && (
          <View style={{ 
            position: 'absolute', 
            top: -6, 
            right: -6, 
            backgroundColor: rank <= 3 ? '#FFD700' : '#9CA3AF',
            borderRadius: 10,
            width: 20,
            height: 20,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
          }}>
            <Text style={{ fontSize: 10, fontWeight: 'bold', color: rank <= 3 ? '#1F2937' : '#fff' }}>
              {rank}
            </Text>
          </View>
        )}

        {/* Avatar - top left */}
        <View style={{
          position: 'absolute',
          top: -6,
          left: -6,
          borderRadius: 10,
          width: 20,
          height: 20,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.primary,
          zIndex: 1,
        }}>
          <Image source={getAvatarSource()} style={{ width: 20, height: 20 }} />
        </View>
        
        {/* Room Info */}
        <View className="mb-2">
          <View className="flex-row items-center gap-1 mb-1">
            {hasGoldStar && <Text style={{ fontSize: 12 }}>⭐</Text>}
            <Text className="text-sm font-bold text-foreground" numberOfLines={2} style={{ flex: 1 }}>{room.name}</Text>
          </View>
          <Text className="text-xs" style={{ color: colors.primary }}>ساحتك</Text>
        </View>

        {/* Stats */}
        <View className="flex-row gap-2">
          <View className="flex-row items-center gap-1">
            <Text className="text-xs text-foreground">
              {room.acceptedPlayersCount}/2 شاعر
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
      {/* Rank Badge - top right */}
      {rank && (
        <View style={{ 
          position: 'absolute', 
          top: -6, 
          right: -6, 
          backgroundColor: rank <= 3 ? '#FFD700' : '#9CA3AF',
          borderRadius: 10,
          width: 20,
          height: 20,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
        }}>
          <Text style={{ fontSize: 10, fontWeight: 'bold', color: rank <= 3 ? '#1F2937' : '#fff' }}>
            {rank}
          </Text>
        </View>
      )}

      {/* Avatar - top left */}
      <View style={{
        position: 'absolute',
        top: -6,
        left: -6,
        borderRadius: 10,
        width: 20,
        height: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
        zIndex: 1,
      }}>
        <Image source={getAvatarSource()} style={{ width: 20, height: 20 }} />
      </View>
      
      {/* Room Info */}
      <View className="mb-2">
        <View className="flex-row items-center gap-1 mb-1">
          {hasGoldStar && <Text style={{ fontSize: 12 }}>⭐</Text>}
          <Text className="text-sm font-bold text-foreground" numberOfLines={2} style={{ flex: 1 }}>{room.name}</Text>
        </View>
        <Text className="text-xs text-muted" numberOfLines={1}>{room.creatorName}</Text>
      </View>

      {/* Stats */}
      <View className="flex-row gap-2 mb-2">
        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-foreground">
            {room.acceptedPlayersCount}/2 شاعر
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-muted">👁️</Text>
          <Text className="text-xs text-foreground">{room.viewerCount}</Text>
        </View>
      </View>

      {/* Action Button */}
      <TouchableOpacity
        className="rounded-lg py-1.5 items-center"
        style={{ backgroundColor: '#EF4444' }}
        onPress={onJoinAsViewer}
      >
        <Text
          className="font-semibold text-xs"
          style={{ color: '#FFFFFF' }}
        >
          دخول
        </Text>
      </TouchableOpacity>
    </View>
  );
}
