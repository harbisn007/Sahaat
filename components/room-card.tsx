import { View, Text, TouchableOpacity, Image, Animated } from "react-native";
import { useEffect, useRef } from "react";
import { useColors } from "@/hooks/use-colors";

import { getAvatarSourceById } from "@/lib/avatars";

// نقطة "مباشر" الحمراء الوامضة/المتوهجة
function LiveDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={{
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#ff2a2a",
      opacity: pulse,
      shadowColor: "#ff2a2a",
      shadowOpacity: 0.9,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
    }} />
  );
}

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
        borderWidth: 1.5,
        borderColor: "#2d1f0e",
      }}
    >
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
      <View className="mb-2">
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
            gap: 4,
            backgroundColor: "#2d1f0e",
            borderWidth: 1,
            borderColor: "#1c1208",
            borderRadius: 6,
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}>
            <LiveDot />
            <Text style={{ fontSize: 9, color: "#fff", fontWeight: "800" }}>مباشر</Text>
          </View>
          {poetNames && poetNames.length > 0 && (
            <Text className="text-foreground" numberOfLines={1} style={{ flex: 1, fontSize: 10, fontWeight: "700" }}>
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

      {/* الزرّ: "ساحتك" (بنّي داكن + كتابة ذهبية نحاسية) للمنشئ، "دخول" (أحمر) لغيره */}
      <TouchableOpacity
        className="rounded-lg py-1.5 items-center"
        style={{
          backgroundColor: isCreator ? "#2d1f0e" : "#EF4444",
          borderWidth: isCreator ? 1 : 0,
          borderColor: "#c8860a",
        }}
        onPress={isCreator ? onDirectEnter : onJoinAsViewer}
      >
        <Text className="font-semibold text-xs" style={{ color: isCreator ? "#d4af37" : "#FFFFFF" }}>
          {isCreator ? "ساحتك" : "دخول"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
