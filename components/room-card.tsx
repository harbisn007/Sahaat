import { View, Text, TouchableOpacity, Image } from "react-native";
import { useColors } from "@/hooks/use-colors";

// صور الأفاتار
const avatarMale = require('@/assets/images/avatar-male.png');
const avatarFemale = require('@/assets/images/avatar-female.png');

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
  onJoinAsPlayer: () => void;
  onJoinAsViewer: () => void;
  onDirectEnter: () => void;
  showGoldStar?: boolean;
  rank?: number;
}

export function RoomCard({ 
  room, 
  currentUserId, 
  onJoinAsPlayer, 
  onJoinAsViewer, 
  onDirectEnter,
  showGoldStar = false,
  rank,
}: RoomCardProps) {
  const colors = useColors();
  const isPlayersFull = room.isRoomFull;
  const isCreator = room.creatorId === currentUserId;
  const hasGoldStar = showGoldStar || room.hasGoldStar === "true";

  // تحديد صورة الأفاتار
  const getAvatarSource = () => {
    const avatarType = room.creatorAvatar || 'male';
    if (avatarType === 'female') {
      return avatarFemale;
    }
    return avatarMale;
  };

  // If creator, make the whole card clickable
  if (isCreator) {
    return (
      <TouchableOpacity
        className="bg-surface rounded-xl p-3 border-2 shadow-sm"
        style={{ borderColor: colors.primary, flex: 1 }}
        onPress={onDirectEnter}
        activeOpacity={0.7}
      >
        {/* Rank Badge */}
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
          }}>
            <Text style={{ fontSize: 10, fontWeight: 'bold', color: rank <= 3 ? '#1F2937' : '#fff' }}>
              {rank}
            </Text>
          </View>
        )}
        
        {/* Room Info */}
        <View className="mb-2">
          <View className="flex-row items-center gap-1 mb-1">
            {hasGoldStar && <Text style={{ fontSize: 12 }}>⭐</Text>}
            <Text className="text-sm font-bold text-foreground" numberOfLines={1} style={{ flex: 1 }}>{room.name}</Text>
            <Text className="text-xs">👑</Text>
          </View>
          {/* صورة المنشئ واسمه */}
          <View className="flex-row items-center gap-1">
            <Image 
              source={getAvatarSource()} 
              style={{ width: 18, height: 18, borderRadius: 9 }} 
            />
            <Text className="text-xs" style={{ color: colors.primary }}>ساحتك</Text>
          </View>
        </View>

        {/* Stats */}
        <View className="flex-row gap-2">
          <View className="flex-row items-center gap-1">
            <Text className="text-xs text-foreground">
              {room.acceptedPlayersCount}/2 لاعب
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
      {/* Rank Badge */}
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
      
      {/* Room Info */}
      <View className="mb-2">
        <View className="flex-row items-center gap-1 mb-1">
          {hasGoldStar && <Text style={{ fontSize: 12 }}>⭐</Text>}
          <Text className="text-sm font-bold text-foreground" numberOfLines={1} style={{ flex: 1 }}>{room.name}</Text>
        </View>
        {/* صورة المنشئ واسمه */}
        <View className="flex-row items-center gap-1">
          <Image 
            source={getAvatarSource()} 
            style={{ width: 18, height: 18, borderRadius: 9 }} 
          />
          <Text className="text-xs text-muted" numberOfLines={1}>{room.creatorName}</Text>
        </View>
      </View>

      {/* Stats */}
      <View className="flex-row gap-2 mb-2">
        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-foreground">
            {room.acceptedPlayersCount}/2 لاعب
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
            مستمع
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
