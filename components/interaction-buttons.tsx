import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";

interface InteractionButtonsProps {
  targetUserId: string;   // المستخدم الذي تُعرض عليه الأيقونات
  currentUserId: string;  // المستخدم الحالي
  avatarSize: number;     // حجم الصورة (لحساب موضع الأيقونات)
}

export function InteractionButtons({ targetUserId, currentUserId, avatarSize }: InteractionButtonsProps) {
  const colors = useColors();
  const isSelf = targetUserId === currentUserId;

  // جلب الإحصائيات
  const { data: stats, refetch } = trpc.interactions.getStats.useQuery(
    { toUserId: targetUserId, fromUserId: currentUserId },
    { enabled: !!targetUserId && !!currentUserId }
  );

  // mutation للتبديل
  const toggleMutation = trpc.interactions.toggle.useMutation({
    onSuccess: () => refetch(),
  });

  const handleToggle = (type: "like" | "follow" | "dislike") => {
    if (isSelf) return;
    toggleMutation.mutate({ fromUserId: currentUserId, toUserId: targetUserId, type });
  };

  const btnSize = 22; // حجم كل زر
  const iconSize = 12;

  const buttons = [
    {
      type: "like" as const,
      icon: "thumb-up" as const,
      count: stats?.likes ?? 0,
      active: stats?.myLike ?? false,
      activeColor: "#22C55E",
    },
    {
      type: "follow" as const,
      icon: "person-add" as const,
      count: stats?.follows ?? 0,
      active: stats?.myFollow ?? false,
      activeColor: "#FFD700",
    },
    {
      type: "dislike" as const,
      icon: "thumb-down" as const,
      count: stats?.dislikes ?? 0,
      active: stats?.myDislike ?? false,
      activeColor: "#EF4444",
    },
  ];

  return (
    <View style={[styles.container, { bottom: -(btnSize / 2 + 2), width: avatarSize + 16 }]}>
      {buttons.map((btn) => (
        <TouchableOpacity
          key={btn.type}
          onPress={() => handleToggle(btn.type)}
          disabled={isSelf}
          activeOpacity={isSelf ? 1 : 0.7}
          style={[
            styles.btn,
            {
              width: btnSize,
              height: btnSize,
              borderRadius: btnSize / 2,
              backgroundColor: btn.active ? btn.activeColor : "rgba(30,30,30,0.82)",
              borderColor: btn.active ? btn.activeColor : "rgba(255,255,255,0.25)",
              opacity: isSelf ? 0.5 : 1,
            },
          ]}
        >
          <MaterialIcons name={btn.icon} size={iconSize} color={btn.active ? "#fff" : "#ddd"} />
          {btn.count > 0 && (
            <Text style={styles.count}>{btn.count > 99 ? "99+" : btn.count}</Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    left: -8,
    zIndex: 10,
  },
  btn: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 3,
  },
  count: {
    position: "absolute",
    bottom: -9,
    fontSize: 8,
    color: "#fff",
    fontWeight: "bold",
    textShadowColor: "#000",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
