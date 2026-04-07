import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import * as Haptics from "expo-haptics";
import { getSocket } from "@/hooks/use-socket";

interface InteractionButtonsProps {
  targetUserId: string;   // المستخدم الذي تُعرض عليه الأيقونات
  currentUserId: string;  // المستخدم الحالي
  avatarSize: number;     // حجم الصورة (لحساب موضع الأيقونات)
  roomId: number;         // معرف الساحة للـ Socket
  avatarBorderColor?: string; // لون إطار الصورة لمطابقة إطار الأيقونات
}

// اختصار الأرقام الكبيرة
function formatCount(n: number): string {
  if (n >= 10000) return "10k+";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function InteractionButtons({ targetUserId, currentUserId, avatarSize, roomId, avatarBorderColor = '#c8860a' }: InteractionButtonsProps) {
  const isSelf = targetUserId === currentUserId;

  // جلب الإحصائيات الأولية
  const { data: stats, refetch } = trpc.interactions.getStats.useQuery(
    { toUserId: targetUserId, fromUserId: currentUserId },
    { enabled: !!targetUserId && !!currentUserId }
  );

  // state محلي للعدادات (يُحدَّث فوراً عبر socket)
  const [localStats, setLocalStats] = useState({
    likes: 0, dislikes: 0, follows: 0,
    myFollow: false,
  });

  // مزامنة البيانات الأولية من الـ query
  useEffect(() => {
    if (stats) {
      setLocalStats({
        likes: stats.likes,
        dislikes: stats.dislikes,
        follows: stats.follows,
        myFollow: stats.myFollow,
      });
    }
  }, [stats]);

  // الاستماع لـ socket event لتحديث العدادات فوراً
  useEffect(() => {
    let socketRef: any = null;
    const handleInteractionUpdated = (data: { toUserId: string; likes: number; dislikes: number; follows: number }) => {
      if (data.toUserId === targetUserId) {
        setLocalStats(prev => ({
          ...prev,
          likes: data.likes,
          dislikes: data.dislikes,
          follows: data.follows,
        }));
      }
    };
    getSocket().then(s => {
      socketRef = s;
      s.on("interactionUpdated", handleInteractionUpdated);
    }).catch(() => {});
    return () => {
      if (socketRef) socketRef.off("interactionUpdated", handleInteractionUpdated);
    };
  }, [targetUserId]);

  // mutation للمتابعة (toggle)
  const toggleMutation = trpc.interactions.toggle.useMutation({
    onSuccess: () => refetch(),
  });

  // mutation للإعجاب/عدم الإعجاب (كل ضغطة +1)
  const addLikeDislikeMutation = trpc.interactions.addLikeDislike.useMutation({
    onSuccess: () => refetch(),
  });

  const triggerHaptic = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleFollow = () => {
    if (isSelf) return;
    triggerHaptic();
    // تحديث محلي فوري
    setLocalStats(prev => ({
      ...prev,
      follows: prev.myFollow ? prev.follows - 1 : prev.follows + 1,
      myFollow: !prev.myFollow,
    }));
    toggleMutation.mutate({ fromUserId: currentUserId, toUserId: targetUserId, type: "follow", roomId });
  };

  const handleLike = () => {
    if (isSelf) return;
    triggerHaptic();
    // تحديث محلي فوري
    setLocalStats(prev => ({ ...prev, likes: prev.likes + 1 }));
    addLikeDislikeMutation.mutate({ fromUserId: currentUserId, toUserId: targetUserId, type: "like", roomId });
  };

  const handleDislike = () => {
    if (isSelf) return;
    triggerHaptic();
    // تحديث محلي فوري
    setLocalStats(prev => ({ ...prev, dislikes: prev.dislikes + 1 }));
    addLikeDislikeMutation.mutate({ fromUserId: currentUserId, toUserId: targetUserId, type: "dislike", roomId });
  };

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
              backgroundColor: localStats.myFollow ? avatarBorderColor : "#fff",
              borderColor: avatarBorderColor,
            },
          ]}
        >
          <MaterialIcons
            name={localStats.myFollow ? "person-remove" : "person-add"}
            size={iconSize}
            color={localStats.myFollow ? "#1c1208" : "#555"}
          />
          {localStats.follows > 0 && (
            <Text style={[styles.countLabel, { color: "#FFD700" }]}>
              {formatCount(localStats.follows)}
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
              borderColor: avatarBorderColor,
            },
          ]}
        >
          <MaterialIcons name="thumb-up" size={iconSize} color="#555" />
          {localStats.likes > 0 && (
            <Text style={[styles.countLabel, { color: "#22C55E" }]}>
              {formatCount(localStats.likes)}
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
              borderColor: avatarBorderColor,
            },
          ]}
        >
          <MaterialIcons name="thumb-down" size={iconSize} color="#555" />
          {localStats.dislikes > 0 && (
            <Text style={[styles.countLabel, { color: "#EF4444" }]}>
              {formatCount(localStats.dislikes)}
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
    marginTop: -10,
  },
  bottomRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
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
