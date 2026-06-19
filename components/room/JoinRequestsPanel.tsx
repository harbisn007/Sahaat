// components/room/JoinRequestsPanel.tsx
// لوحة طلبات الانضمام (نمط "رفع اليد") — تظهر للمنشئ فقط.
// مكوّن مستقل: استعلام + تحديث لحظي عبر Socket.io + حبّة عائمة + قائمة منسدلة + قبول/رفض.
// الحبّة تظهر أسفل أيقونة التثبيت (الجهة الخالية)، بعيداً عن إشعار الدخول.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Animated,
  FlatList,
  View,
  Text,
  TouchableOpacity,
  Image,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { getSocket } from "@/hooks/use-socket";
import { trpc } from "@/lib/trpc";

// الخط (Tajawal) — يسقط بأمان للخط الافتراضي إن لم يُحمَّل بعد
const F = {
  regular: "Tajawal_400Regular",
  medium: "Tajawal_500Medium",
  bold: "Tajawal_700Bold",
};

// لوحة الألوان (بنّي إسبريسو + ذهبي)
const C = {
  sheetBg: "#1E1609",
  goldLine: "rgba(212,175,55,0.35)",
  gold: "#D4AF37",
  rowBg: "rgba(212,175,55,0.07)",
  rowLine: "rgba(212,175,55,0.15)",
  name: "#F5F0E6",
  muted: "rgba(245,240,230,0.55)",
  accept: "#1F9D55",
  rejectBorder: "#D64545",
  rejectText: "#E66A6A",
  pillBg: "#9A6B0A",
  pillLine: "rgba(255,215,0,0.55)",
};

type JoinRequest = {
  id: number;
  userId: string;
  username: string;
  avatar: string;
  createdAt: string | number | Date;
};

type Props = {
  roomId: number;
  userId: string;
  isRoomCreator: boolean;
  isRoomFull: boolean;
  getAvatarSource: (avatar: string) => any;
};

export default function JoinRequestsPanel({
  roomId,
  userId,
  isRoomCreator,
  isRoomFull,
  getAvatarSource,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  // الطلبات المعلّقة (للمنشئ فقط)
  const { data: rawRequests = [], refetch } =
    trpc.joinRequests.getPending.useQuery(
      { roomId },
      { enabled: isRoomCreator && roomId > 0, refetchInterval: 4000 } // لحظي عبر السوكِت + احتياطي
    );

  // الاحتفاظ بأحدث refetch دون إعادة اشتراك السوكِت
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  // ترتيب FIFO (الأقدم أولاً)
  const requests: JoinRequest[] = useMemo(
    () =>
      [...(rawRequests as any[])].sort(
        (a: any, b: any) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    [rawRequests]
  );
  const count = requests.length;

  // mutation الرد على الطلب
  const respondMutation = trpc.joinRequests.respond.useMutation({
    onSuccess: () => refetch(),
    onError: (e: any) => Alert.alert("خطأ", e?.message ?? "تعذّر تنفيذ الإجراء"),
  });

  const onAccept = (req: JoinRequest) => {
    if (isRoomFull) {
      Alert.alert("المنصة ممتلئة", "لا يمكن قبول شاعر جديد. فرّغ مكاناً أولاً.");
      return;
    }
    respondMutation.mutate({
      requestId: req.id,
      accept: true,
      roomId,
      userId: req.userId,
    });
  };

  const onReject = (req: JoinRequest) => {
    respondMutation.mutate({
      requestId: req.id,
      accept: false,
      roomId,
      userId: req.userId,
    });
  };

  // التحديث اللحظي عبر السوكِت (مستمعات مستقلة لا تتعارض مع setCallbacks)
  useEffect(() => {
    if (!isRoomCreator) return;
    let socket: any;
    let mounted = true;
    const onChange = () => refetchRef.current?.();

    (async () => {
      try {
        socket = await getSocket();
        if (!mounted || !socket) return;
        socket.on("joinRequestCreated", onChange);
        socket.on("joinRequestResponded", onChange);
        socket.on("roomUpdated", onChange);
        socket.on("participantLeft", onChange);
      } catch {}
    })();

    return () => {
      mounted = false;
      if (socket) {
        socket.off("joinRequestCreated", onChange);
        socket.off("joinRequestResponded", onChange);
        socket.off("roomUpdated", onChange);
        socket.off("participantLeft", onChange);
      }
    };
  }, [isRoomCreator]);

  // ومضة + اهتزاز عند وصول طلب جديد
  const prevCountRef = useRef(0);
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isRoomCreator) return;
    if (count > prevCountRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.25, duration: 150, useNativeDriver: true }),
        Animated.spring(pulse, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
    prevCountRef.current = count;
  }, [count, isRoomCreator, pulse]);

  if (!isRoomCreator) return null;

  return (
    <>
      {/* الحبّة العائمة — أسفل أيقونة التثبيت، في الجهة الخالية */}
      {count > 0 && (
        <Animated.View
          style={{
            position: "absolute",
            top: 46, // أسفل أيقونة التثبيت مباشرةً
            right: 8, // نفس جهة التثبيت (الخالية)، بعيداً عن إشعار الدخول
            zIndex: 30,
            transform: [{ scale: pulse }],
          }}
        >
          <TouchableOpacity
            onPress={() => setSheetOpen(true)}
            activeOpacity={0.85}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: C.pillBg,
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: C.pillLine,
              shadowColor: "#000",
              shadowOpacity: 0.3,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
              elevation: 6,
            }}
          >
            <MaterialIcons name="pan-tool" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontFamily: F.bold, fontWeight: "700", fontSize: 14 }}>
              {count}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* القائمة المنسدلة */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setSheetOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "flex-end",
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={{
              backgroundColor: C.sheetBg,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 12,
              paddingBottom: 24,
              maxHeight: "70%",
              borderTopWidth: 1,
              borderColor: C.goldLine,
            }}
          >
            {/* مقبض */}
            <View style={{ alignItems: "center", marginBottom: 10 }}>
              <View
                style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: C.goldLine }}
              />
            </View>

            {/* العنوان + العدّاد */}
            <View
              style={{
                flexDirection: "row-reverse",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 18,
                paddingBottom: 10,
              }}
            >
              <Text style={{ color: C.gold, fontSize: 17, fontFamily: F.bold, fontWeight: "700" }}>
                طلبات الانضمام كشاعر
              </Text>
              <Text style={{ color: C.muted, fontSize: 13, fontFamily: F.regular }}>
                {count} طلب
              </Text>
            </View>

            {isRoomFull && (
              <Text
                style={{
                  color: "#E0A93B",
                  fontSize: 12,
                  fontFamily: F.regular,
                  textAlign: "center",
                  marginBottom: 6,
                }}
              >
                المنصة ممتلئة (2/2) — فرّغ مكاناً لقبول شاعر جديد
              </Text>
            )}

            <FlatList
              data={requests}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 8 }}
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
                  <MaterialIcons name="pan-tool" size={32} color="rgba(255,255,255,0.22)" />
                  <Text style={{ color: C.muted, marginTop: 10, fontFamily: F.regular }}>
                    لا توجد طلبات حالياً
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View
                  style={{
                    flexDirection: "row-reverse",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: C.rowBg,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: C.rowLine,
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  {/* أفتار + اسم */}
                  <View
                    style={{
                      flexDirection: "row-reverse",
                      alignItems: "center",
                      flex: 1,
                      gap: 10,
                    }}
                  >
                    <Image
                      source={getAvatarSource(item.avatar)}
                      style={{ width: 40, height: 40, borderRadius: 20 }}
                    />
                    <Text
                      style={{ color: C.name, fontFamily: F.medium, fontWeight: "600", fontSize: 15 }}
                      numberOfLines={1}
                    >
                      {item.username}
                    </Text>
                  </View>

                  {/* قبول (ممتلئ) / رفض (شبح) */}
                  <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => onAccept(item)}
                      disabled={isRoomFull}
                      style={{
                        paddingVertical: 9,
                        paddingHorizontal: 18,
                        borderRadius: 10,
                        backgroundColor: C.accept,
                        opacity: isRoomFull ? 0.4 : 1,
                      }}
                    >
                      <Text style={{ color: "#fff", fontFamily: F.bold, fontWeight: "700", fontSize: 14 }}>
                        قبول
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => onReject(item)}
                      style={{
                        paddingVertical: 9,
                        paddingHorizontal: 18,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: C.rejectBorder,
                        backgroundColor: "transparent",
                      }}
                    >
                      <Text style={{ color: C.rejectText, fontFamily: F.bold, fontWeight: "700", fontSize: 14 }}>
                        رفض
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
