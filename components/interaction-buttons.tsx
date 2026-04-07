import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { trpc } from "@/lib/trpc";

interface InteractionButtonsProps {
  targetUserId: string;   // المستخدم الذي تُعرض عليه الأيقونات
  currentUserId: string;  // المستخدم الحالي
  avatarSize: number;     // حجم الصورة (لحساب موضع الأيقونات)
}

// اختصار الأرقام الكبيرة
function formatCount(n: number): string {
  if (n >= 10000) return "10k+";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function InteractionButtons({ targetUserId, currentUserId, avatarSize }: InteractionButtonsProps) {
  const isSelf = targetUserId === currentUserId;

  // جلب الإحصائيات
  const { data: stats, refetch } = trpc.interactions.getStats.useQuery(
    { toUserId: targetUserId, fromUserId: currentUserId },
    { enabled: !!targetUserId && !!currentUserId, refetchInterval: 3000 }
  );

  // mutation للمتابعة (toggle)
  const toggleMutation = trpc.interactions.toggle.useMutation({
    onSuccess: () => refetch(),
  });

  // mutation للإعجاب/عدم الإعجاب (كل ضغطة +1)
  const addLikeDislikeMutation = trpc.interactions.addLikeDislike.useMutation({
    onSuccess: () => refetch(),
  });

  const handleFollow = () => {
    if (isSelf) return;
    toggleMutation.mutate({ fromUserId: currentUserId, toUserId: targetUserId, type: "follow" });
  };

  const handleLike = () => {
    if (isSelf) return;
    addLikeDislikeMutation.mutate({ fromUserId: currentUserId, toUserId: targetUserId, type: "like" });
  };

  const handleDislike = () => {
    if (isSelf) return;
    addLikeDislikeMutation.mutate({ fromUserId: currentUserId, toUserId: targetUserId, type: "dislike" });
  };

  const followCount = stats?.follows ?? 0;
  const likeCount = stats?.likes ?? 0;
  const dislikeCount = stats?.dislikes ?? 0;
  const isFollowing = stats?.myFollow ?? false;

  const btnSize = 24;
  const iconSize = 13;

  return (
    <View style={[styles.wrapper, { width: avatarSize + 20 }]}>

      {/* ── أيقونة المتابعة في الأعلى ── */}
      <View style={styles.topRow}>
        <TouchableOpacity
          onPress={handleFollow}
          disabled={isSelf}
          activeOpacity={isSelf ? 1 : 0.7}
          style={[
            styles.btn,
            {
              width: btnSize,
              height: btnSize,
              borderRadius: btnSize / 2,
              backgroundColor: isFollowing ? "#FFD700" : "#fff",
              borderColor: isFollowing ? "#FFD700" : "rgba(255,255,255,0.6)",
            },
          ]}
        >
          <MaterialIcons
            name={isFollowing ? "person-remove" : "person-add"}
            size={iconSize}
            color={isFollowing ? "#1c1208" : "#555"}
          />
          {followCount > 0 && (
            <Text style={[styles.countLabel, { color: "#FFD700" }]}>
              {formatCount(followCount)}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── أيقونتا الإعجاب وعدم الإعجاب في الأسفل ── */}
      <View style={styles.bottomRow}>
        {/* إعجاب */}
        <TouchableOpacity
          onPress={handleLike}
          disabled={isSelf}
          activeOpacity={isSelf ? 1 : 0.7}
          style={[
            styles.btn,
            {
              width: btnSize,
              height: btnSize,
              borderRadius: btnSize / 2,
              backgroundColor: "#fff",
              borderColor: "rgba(255,255,255,0.6)",
            },
          ]}
        >
          <MaterialIcons name="thumb-up" size={iconSize} color="#555" />
          {likeCount > 0 && (
            <Text style={[styles.countLabel, { color: "#22C55E" }]}>
              {formatCount(likeCount)}
            </Text>
          )}
        </TouchableOpacity>

        {/* عدم إعجاب */}
        <TouchableOpacity
          onPress={handleDislike}
          disabled={isSelf}
          activeOpacity={isSelf ? 1 : 0.7}
          style={[
            styles.btn,
            {
              width: btnSize,
              height: btnSize,
              borderRadius: btnSize / 2,
              backgroundColor: "#fff",
              borderColor: "rgba(255,255,255,0.6)",
            },
          ]}
        >
          <MaterialIcons name="thumb-down" size={iconSize} color="#555" />
          {dislikeCount > 0 && (
            <Text style={[styles.countLabel, { color: "#EF4444" }]}>
              {formatCount(dislikeCount)}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: -10,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
    paddingVertical: 2,
  },
  topRow: {
    alignItems: "center",
    // يجلس على الحافة العلوية للصورة
    marginTop: -10,
  },
  bottomRow: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    // يجلس على الحافة السفلية للصورة
    marginBottom: -10,
  },
  btn: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 4,
  },
  countLabel: {
    position: "absolute",
    bottom: -11,
    fontSize: 8,
    fontWeight: "bold",
    textShadowColor: "#000",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    minWidth: 20,
    textAlign: "center",
  },
});
