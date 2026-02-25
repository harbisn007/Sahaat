import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl, Alert, Animated, Easing, Dimensions } from "react-native";
import { useEffect, useState, useRef, useCallback } from "react";
import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ImageBackground, Image } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
const roomsBackground = require("@/assets/images/rooms-background.png");
import { useUser } from "@/lib/user-context";
import { RoomCard } from "@/components/room-card";
import { CreateRoomModal } from "@/components/create-room-modal";
import { trpc } from "@/lib/trpc";
import { useSocketConnection } from "@/hooks/use-socket";
import { io, Socket } from "socket.io-client";
import { Platform } from "react-native";
import { getAvatarSourceById } from "@/lib/avatars";

interface PublicInvitation {
  id: number; roomId: number; creatorId: string; creatorName: string;
  creatorAvatar: string; roomName: string; message?: string | null;
  status: string; displayedAt: Date | null; createdAt: Date;
}

const saduBanner1 = require("@/assets/images/sadu-banner-1.png");
const saduBanner2 = require("@/assets/images/sadu-banner-2.png");
const saduBanner3 = require("@/assets/images/sadu-banner-3.png");

function SaduBanner() {
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const banners = [saduBanner1, saduBanner2, saduBanner3];
  useEffect(() => {
    const interval = setInterval(() => setCurrentBannerIndex(p => (p + 1) % banners.length), 20000);
    return () => clearInterval(interval);
  }, []);
  return (
    <View style={{ width: '103%', height: 60, marginVertical: 2, alignSelf: 'center' }}>
      <Image source={banners[currentBannerIndex]} style={{ width: '100%', height: 60, borderRadius: 8 }} resizeMode="cover" />
    </View>
  );
}

function BlinkingTitle({ text, color }: { text: string; color: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const blink = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.3, duration: 500, easing: Easing.ease, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 500, easing: Easing.ease, useNativeDriver: true }),
    ]));
    blink.start();
    return () => blink.stop();
  }, []);
  return (
    <Animated.Text style={{ opacity, color, fontWeight: 'bold', fontSize: 15, textDecorationLine: 'underline' }}>
      {text}
    </Animated.Text>
  );
}

function CountdownTimer({ expiresAt }: { expiresAt: Date }) {
  const [hoursLeft, setHoursLeft] = useState(0);
  useEffect(() => {
    const calc = () => {
      const diff = expiresAt.getTime() - new Date().getTime();
      setHoursLeft(diff <= 0 ? 0 : Math.ceil(diff / (1000 * 60 * 60)));
    };
    calc();
    const interval = setInterval(calc, 60000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  if (hoursLeft <= 0) return null;
  return (
    <View style={{ alignItems: 'center', marginBottom: 8 }}>
      <View style={{ width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: '#c8860a', backgroundColor: 'rgba(200,134,10,0.1)', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#c8860a', fontWeight: 'bold', fontSize: 16 }}>{hoursLeft}</Text>
      </View>
    </View>
  );
}

// ══ بطاقة الدعوة - تصميم نحاسي ذهبي ══
function PublicInviteCard({ invite, onJoin, currentUserId }: { invite: PublicInvitation; onJoin: () => void; currentUserId: string; }) {
  const isOwnInvite = invite.creatorId === currentUserId;
  return (
    <View style={{ backgroundColor: '#1c1208', borderRadius: 10, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: '#c8860a' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
        <Image source={getAvatarSourceById(invite.creatorAvatar)} style={{ width: 28, height: 28, borderRadius: 14, marginLeft: 6, borderWidth: 1, borderColor: '#c8860a' }} />
        <Text style={{ fontSize: 11, color: '#d4af37', fontWeight: '700', flex: 1 }} numberOfLines={1}>{invite.creatorName}</Text>
      </View>
      <Text style={{ fontSize: 10, color: 'rgba(212,175,55,0.6)', textAlign: 'center', marginBottom: 6 }} numberOfLines={1}>{invite.roomName}</Text>
      {isOwnInvite ? (
        <View style={{ backgroundColor: '#2d1f0e', borderRadius: 6, paddingVertical: 5, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(200,134,10,0.3)' }}>
          <Text style={{ color: 'rgba(212,175,55,0.4)', fontWeight: 'bold', fontSize: 10 }}>دعوتك</Text>
        </View>
      ) : (
        <TouchableOpacity style={{ backgroundColor: '#2d1f0e', borderRadius: 6, paddingVertical: 5, alignItems: 'center', borderWidth: 1, borderColor: '#c8860a' }} onPress={onJoin}>
          <Text style={{ color: '#d4af37', fontWeight: 'bold', fontSize: 10 }}>{invite.message || 'انضم'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function getServerUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const apiHost = window.location.hostname.replace(/^8081-/, "3000-");
    return `${protocol}//${apiHost}`;
  }
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl) return apiUrl;
  return "http://127.0.0.1:3000";
}

export default function HomeScreen() {
  const { username, userId, avatar, accountType, isLoading: userLoading, logout, clearAllData } = useUser();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const isConnected = useSocketConnection();
  const socketRef = useRef<Socket | null>(null);
  const creatorSocketRef = useRef<Socket | null>(null);
  const playedJoinRequestsRef = useRef<Set<string>>(new Set());
  const [displayedInvites, setDisplayedInvites] = useState<PublicInvitation[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PublicInvitation[]>([]);
  const deleteRoomMutation = trpc.rooms.deleteRoom.useMutation();

  const handleLogout = () => {
    const isGuest = accountType === 'guest';
    const message = isGuest ? "هل تريد تسجيل الخروج؟\n\nتنبيه: سيتم حذف جميع بياناتك بما فيها الساحات التي أنشأتها." : "هل تريد تسجيل الخروج؟";
    Alert.alert("تسجيل الخروج", message, [
      { text: "إلغاء", style: "cancel" },
      { text: "خروج", style: "destructive", onPress: async () => {
        try {
          if (activeRoom) await deleteRoomMutation.mutateAsync({ roomId: activeRoom.id });
          if (isGuest) await clearAllData(); else await logout();
          router.replace("/welcome");
        } catch { router.replace("/welcome"); }
      }},
    ]);
  };

  const handleChangeProfile = () => {
    const message = activeRoom ? "هل تريد تغيير اسمك وصورتك؟ \n\nتنبيه: سيتم حذف ساحتك النشطة وإخراج جميع المتواجدين فيها." : "هل تريد تغيير اسمك وصورتك؟";
    Alert.alert("تغيير الملف الشخصي", message, [
      { text: "إلغاء", style: "cancel" },
      { text: "تغيير", style: "destructive", onPress: async () => {
        try {
          if (activeRoom) await deleteRoomMutation.mutateAsync({ roomId: activeRoom.id });
          await logout();
          router.replace("/welcome");
        } catch { router.replace("/welcome"); }
      }},
    ]);
  };

  const { data: top10Rooms, isLoading: roomsLoading, refetch } = trpc.top10.list.useQuery(undefined, { refetchInterval: 3000 });
  const rooms = top10Rooms || [];
  const { data: onlineCountData } = trpc.stats.onlineCount.useQuery(undefined, { refetchInterval: 3000 });
  const onlineCount = onlineCountData?.count ?? 0;
  const heartbeatMutation = trpc.stats.heartbeat.useMutation();
  const { data: activeRoom, refetch: refetchActiveRoom } = trpc.rooms.getUserActiveRoom.useQuery({ creatorId: userId }, { refetchInterval: 3000 });
  const { data: pendingInvitesData } = trpc.publicInvitations.getPending.useQuery({ limit: 50 }, { refetchInterval: 2000 });
  const { data: displayedInvitesData } = trpc.publicInvitations.getDisplayed.useQuery({ limit: 10 }, { refetchInterval: 1000 });
  const createRoomMutation = trpc.rooms.create.useMutation();
  const joinAsPlayerMutation = trpc.rooms.requestJoinAsPlayer.useMutation();
  const joinAsViewerMutation = trpc.rooms.joinAsViewer.useMutation();
  const createJoinRequestMutation = trpc.joinRequests.create.useMutation();
  const markDisplayedMutation = trpc.publicInvitations.markDisplayed.useMutation();
  const expireInviteMutation = trpc.publicInvitations.expire.useMutation();
  const hasActiveRoom = !!activeRoom;
  const creatorRoomsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const serverUrl = getServerUrl();
    const socket = io(serverUrl, { transports: ["websocket", "polling"], reconnection: true });
    socketRef.current = socket;
    socket.on("connect", () => {
      socket.emit("joinPublicInvites");
      if (userId) { socket.emit("joinCreatorChannel", userId); socket.emit("joinUserChannel", userId); }
    });
    socket.on("publicInviteCreated", () => refetch());
    socket.on("publicInviteExpired", () => refetch());
    socket.on("joinRequestResponded", (data: { roomId: number; requestId: number; accepted: boolean; userId: string }) => {
      if (data.userId === userId) {
        if (data.accepted) router.push(`/room/${data.roomId}`);
        else Alert.alert("تم الرفض", "لم يتم قبول طلبك للانضمام كشاعر.");
      }
    });
    return () => {
      socket.emit("leavePublicInvites");
      if (userId) { socket.emit("leaveCreatorChannel", userId); socket.emit("leaveUserChannel", userId); }
      socket.disconnect();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    heartbeatMutation.mutate({ userId });
    const interval = setInterval(() => heartbeatMutation.mutate({ userId }), 30000);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => { if (pendingInvitesData) setPendingInvites(pendingInvitesData as PublicInvitation[]); }, [pendingInvitesData]);

  const [expiredInviteIds, setExpiredInviteIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (displayedInvitesData) {
      setDisplayedInvites((displayedInvitesData as PublicInvitation[]).filter(i => !expiredInviteIds.has(i.id)));
    }
  }, [displayedInvitesData, expiredInviteIds]);

  const timerCreatedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (displayedInvites.length > 0) {
      displayedInvites.forEach((invite) => {
        if (expiredInviteIds.has(invite.id) || timerCreatedRef.current.has(invite.id)) return;
        timerCreatedRef.current.add(invite.id);
        setTimeout(async () => {
          try {
            setDisplayedInvites(prev => prev.filter(i => i.id !== invite.id));
            setExpiredInviteIds(prev => new Set(prev).add(invite.id));
            await expireInviteMutation.mutateAsync({ invitationId: invite.id });
          } catch {}
        }, 15000);
      });
    }
  }, [displayedInvites]);

  useEffect(() => {
    if (displayedInvites.length < 10 && pendingInvites.length > 0) {
      const nextInvite = pendingInvites[0];
      if (nextInvite) markDisplayedMutation.mutate({ invitationId: nextInvite.id });
    }
  }, [displayedInvites.length, pendingInvites.length]);

  useEffect(() => { if (!userLoading && !username) router.replace("/welcome"); }, [username, userLoading]);

  const handleCreateRoom = async (roomName: string) => {
    if (!username || !userId) { Alert.alert("خطأ", "يرجى تسجيل الدخول أولاً"); return; }
    try {
      const result = await createRoomMutation.mutateAsync({ name: roomName, creatorId: userId, creatorName: username, creatorAvatar: avatar || "male" });
      setShowCreateModal(false);
      router.push(`/room/${result.roomId}`);
    } catch (error: any) { Alert.alert("خطأ", error?.message || "حدث خطأ أثناء إنشاء الساحة"); }
  };

  const handleJoinAsPlayer = async (roomId: number) => {
    if (!username) return;
    try {
      await joinAsPlayerMutation.mutateAsync({ roomId, userId, username, avatar: avatar || "male" });
      Alert.alert("تم إرسال الطلب", "طلبك قيد الانتظار. سيتم إشعارك عند قبول المنشئ لطلبك.");
    } catch (error: any) { Alert.alert("خطأ", error.message || "حدث خطأ أثناء الانضمام"); }
  };

  const handleJoinAsViewer = async (roomId: number) => {
    if (!username) return;
    try {
      await joinAsViewerMutation.mutateAsync({ roomId, userId, username, avatar: avatar || "male" });
      router.push(`/room/${roomId}`);
    } catch { Alert.alert("خطأ", "حدث خطأ أثناء الانضمام"); }
  };

  const handleJoinFromInvite = async (invite: PublicInvitation) => {
    if (!username || !userId) { Alert.alert("خطأ", "يرجى تسجيل الدخول أولاً"); return; }
    try {
      await createJoinRequestMutation.mutateAsync({ roomId: invite.roomId, userId, username, avatar: avatar || "male" });
      await joinAsViewerMutation.mutateAsync({ roomId: invite.roomId, userId, username, avatar: avatar || "male" });
      router.push(`/room/${invite.roomId}`);
    } catch (error: any) { Alert.alert("خطأ", error.message || "حدث خطأ أثناء الانضمام"); }
  };

  if (userLoading) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#c8860a" />
        </View>
      </ScreenContainer>
    );
  }

  if (!username) return null;

  const screenWidth = Dimensions.get('window').width;
  const leftColumnWidth = screenWidth * 0.37;

  return (
    <ScreenContainer>
      <ImageBackground source={roomsBackground} style={{ flex: 1 }} imageStyle={{ opacity: 0.15 }} resizeMode="cover">

        {/* ══ Header - نحاسي ذهبي ══ */}
        <View style={{
          paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
          backgroundColor: '#1c1208',
          borderBottomWidth: 2, borderBottomColor: '#c8860a',
          flexDirection: 'row', alignItems: 'center',
        }}>
          {/* زر تسجيل الخروج */}
          <TouchableOpacity onPress={handleLogout} style={{ padding: 6 }}>
            <MaterialIcons name="logout" size={22} color="#c8860a" />
          </TouchableOpacity>

          {/* العنوان والعداد */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#d4af37', textAlign: 'center' }}>ساحات المحاورة</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E', marginLeft: 4 }} />
              <Text style={{ color: '#22C55E', fontSize: 10, fontWeight: 'bold' }}>({onlineCount}) المتواجدون الآن</Text>
            </View>
          </View>

          {/* زر العودة أو إنشاء ساحة */}
          {hasActiveRoom && activeRoom ? (
            <View style={{ alignItems: 'flex-end' }}>
              <TouchableOpacity
                onPress={() => router.push(`/room/${activeRoom.id}`)}
                style={{ backgroundColor: '#2d1f0e', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#c8860a' }}
              >
                <Text style={{ color: '#d4af37', fontWeight: '700', fontSize: 10 }}>العودة لساحتك</Text>
              </TouchableOpacity>
              {(activeRoom.pendingRequestsCount || 0) > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: 10, marginLeft: 4 }}>طلبات لعب</Text>
                  <View style={{ backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 10 }}>{activeRoom.pendingRequestsCount}</Text>
                  </View>
                </View>
              )}
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowCreateModal(true)}
              style={{ backgroundColor: '#2d1f0e', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#c8860a' }}
            >
              <Text style={{ color: '#d4af37', fontWeight: '700', fontSize: 10 }}>إنشاء ساحة</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* بنر السدو */}
        <SaduBanner />

        {/* عداد تنازلي للساحة الممدة */}
        {hasActiveRoom && activeRoom && activeRoom.extensionExpiresAt && (
          <View style={{ paddingVertical: 4 }}>
            <CountdownTimer expiresAt={new Date(activeRoom.extensionExpiresAt)} />
          </View>
        )}

        {/* ══ المحتوى الرئيسي - عمودان ══ */}
        <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 8 }}>

          {/* العمود الأيسر - الدعوات العامة */}
          <View style={{ width: leftColumnWidth - 8, paddingHorizontal: 4 }}>
            <View style={{ alignItems: 'center', marginBottom: 8, marginTop: 6 }}>
              <BlinkingTitle text="الدعوات العامة" color="#c8860a" />
            </View>
            <View style={{ flex: 1, position: 'relative' }}>
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 }} pointerEvents="none">
                <Image source={require('@/assets/images/sadu-pattern.jpg')} style={{ width: '100%', height: '100%', opacity: 0.40 }} resizeMode="repeat" />
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                {displayedInvites.length > 0 ? (
                  displayedInvites.map((invite) => (
                    <PublicInviteCard key={invite.id} invite={invite} onJoin={() => handleJoinFromInvite(invite)} currentUserId={userId} />
                  ))
                ) : null}
              </ScrollView>
            </View>
          </View>

          {/* الخط الفاصل الذهبي */}
          <View style={{ width: 2, backgroundColor: '#c8860a', marginHorizontal: 4, borderRadius: 2, opacity: 0.7 }} />

          {/* العمود الأيمن - TOP 10 */}
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View style={{ alignItems: 'center', marginBottom: 6, marginTop: 6 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 18, color: '#d4af37', textShadowColor: 'rgba(200,134,10,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 }}>
                ⭐ TOP 10 ⭐
              </Text>
            </View>
            {roomsLoading ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#c8860a" />
              </View>
            ) : rooms && rooms.length > 0 ? (
              <FlatList
                data={rooms}
                keyExtractor={(item) => item.id.toString()}
                numColumns={2}
                columnWrapperStyle={{ gap: 6, marginBottom: 6 }}
                renderItem={({ item, index }) => (
                  <View style={{ flex: 1, maxWidth: '50%' }}>
                    <RoomCard
                      room={item}
                      currentUserId={userId}
                      onJoinAsViewer={() => handleJoinAsViewer(item.id)}
                      onDirectEnter={() => router.push(`/room/${item.id}`)}
                      showGoldStar={item.hasGoldStar === "true"}
                      rank={index + 1}
                    />
                  </View>
                )}
                refreshControl={<RefreshControl refreshing={roomsLoading} onRefresh={refetch} tintColor="#c8860a" />}
                contentContainerStyle={{ paddingBottom: 20 }}
              />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: 'rgba(212,175,55,0.6)', textAlign: 'center' }}>لا توجد ساحات متاحة</Text>
                <Text style={{ color: 'rgba(212,175,55,0.4)', textAlign: 'center', marginTop: 6 }}>قم بإنشاء ساحة جديدة!</Text>
              </View>
            )}
          </View>
        </View>

      </ImageBackground>

      <CreateRoomModal visible={showCreateModal} onClose={() => setShowCreateModal(false)} onSubmit={handleCreateRoom} />
    </ScreenContainer>
  );
}