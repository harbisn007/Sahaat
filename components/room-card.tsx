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
  /** أسماء الشعراء المنضمّين (role=player) لعرضها بجوار "مباشر" */
  poetNames?: string[];
}

export function RoomCard({
  room,
  currentUserId,
  onJoinAsViewer,
  onDirectEnter,
  showGoldStar = false,
  poetNames,
}: RoomCardProps) {
  const colors = useColors();
  const isCreator = room.creatorId === currentUserId;
  const hasGoldStar = showGoldStar || room.hasGoldStar === "true";
  // "مباشر" عندما ينضمّ شاعر واحد على الأقل لمقعد فعلي (المنشئ لا يُحسب)
  const isLive = room.acceptedPlayersCount >= 1;

  const getAvatarSource = () => getAvatarSourceById(room.creatorAvatar);

  return (
    <View
      className="bg-surface rounded-xl p-3 shadow-sm"
      style={{
        flex: 1,
        borderWidth: isCreator ? 2 : 1,
        borderColor: isCreator ? colors.primary : (hasGoldStar ? "#d4af37" : colors.border),
      }}
    >
      {/* وسم "ساحتك" — مثبّت أعلى البطاقة للمنشئ */}
      {isCreator && (
        <View style={{
          position: "absolute",
          top: -8,
          right: 10,
          backgroundColor: colors.primary,
          borderRadius: 20,
          paddingHorizontal: 8,
          paddingVertical: 1,
          zIndex: 2,
        }}>
          <Text style={{ fontSize: 9.5, fontWeight: "800", color: colors.background }}>ساحتك</Text>
        </View>
      )}

      {/* الأفتار - أعلى اليسار */}
      <View style={{
        position: "absolute",
        top: -6,
        left: -6,
        borderRadius: 10,
        width: 20,
        height: 20,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: isCreator ? colors.primary : colors.border,
        zIndex: 1,
      }}>
        <Image source={getAvatarSource()} style={{ width: 20, height: 20 }} />
      </View>

      {/* معلومات الساحة */}
      <View className="mb-2" style={{ marginTop: isCreator ? 6 : 0 }}>
        <View className="flex-row items-center gap-1 mb-1">
          {hasGoldStar && <Text style={{ fontSize: 12 }}>⭐</Text>}
          <Text className="text-sm font-bold text-foreground" numberOfLines={1} style={{ flex: 1 }}>{room.name}</Text>
        </View>
        {isCreator ? (
          <Text className="text-xs" style={{ color: colors.primary }} numberOfLines={1}>{room.creatorName}</Text>
        ) : (
          <Text className="text-xs text-muted" numberOfLines={1}>{room.creatorName}</Text>
        )}
      </View>

      {/* مباشر + أسماء الشعراء المنضمّين (اسم، أو اسم VS اسم) */}
      {isLive && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 5 }}>
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            backgroundColor: "rgba(226,59,43,0.15)",
            borderColor: "rgba(226,59,43,0.5)",
            borderWidth: 1,
            borderRadius: 6,
            paddingHorizontal: 5,
            paddingVertical: 1,
          }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#e23b2b" }} />
            <Text style={{ fontSize: 9, color: "#ffcfc8", fontWeight: "700" }}>مباشر</Text>
          </View>
          {poetNames && poetNames.length > 0 && (
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 10, color: "#e9d9b8", fontWeight: "600" }}>
              {poetNames.length >= 2 ? `${poetNames[0]} VS ${poetNames[1]}` : poetNames[0]}
            </Text>
          )}
        </View>
      )}

      {/* عدّاد الشعراء + المستمعون */}
      <View className="flex-row items-center gap-2 mb-2">
        <Text className="text-xs text-foreground">{room.acceptedPlayersCount}/2 شاعر</Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-muted">👁️</Text>
          <Text className="text-xs text-foreground">{room.viewerCount}</Text>
        </View>
      </View>

      {/* زرّ "دخول" — في كل الحالات */}
      <TouchableOpacity
        className="rounded-lg py-1.5 items-center"
        style={{ backgroundColor: "#EF4444" }}
        onPress={isCreator ? onDirectEnter : onJoinAsViewer}
      >
        <Text className="font-semibold text-xs" style={{ color: "#FFFFFF" }}>دخول</Text>
      </TouchableOpacity>
    </View>
  );
}
