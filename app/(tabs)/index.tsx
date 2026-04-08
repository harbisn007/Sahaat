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
import { FollowListModal } from "@/components/follow-list-modal";

interface PublicInvitation {
  id: number; roomId: number; creatorId: string; creatorName: string;
  creatorAvatar: string; roomName: string; message?: string | null;
  status: string; displayedAt: Date | null; createdAt: Date;
}

// ══ بنر السدو المتحرك - نقوش على تدرج ذهبي مع خط عربي ══
function SaduBanner() {
  const translateX = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    // حركة النقوش من اليمين لليسار بشكل مستمر
    const animate = () => {
      translateX.setValue(0);
      Animated.timing(translateX, {
        toValue: -screenWidth * 2,
        duration: 14000,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) animate();
      });
    };
    animate();
  }, []);

  // رسم معين واحد كـ component
  const Diamond = ({ x, size, color, opacity }: { x: number; size: number; color: string; opacity: number }) => (
    <View style={{
      position: 'absolute',
      left: x - size,
      top: 32 - size,
      width: size * 2,
      height: size * 2,
      transform: [{ rotate: '45deg' }],
      borderWidth: 1.5,
      borderColor: color,
      opacity,
    }} />
  );

  const patternWidth = screenWidth * 3;
  const spacing = 48;
  const count = Math.ceil(patternWidth / spacing) + 2;

  return (
    <View style={{
      height: 64,
      marginVertical: 2,
      overflow: 'hidden',
      borderRadius: 10,
      backgroundColor: '#1c1208',
    }}>
      {/* تدرج الخلفية */}
      <View style={{
        position: 'absolute', inset: 0,
        backgroundColor: '#2d1f0e',
        opacity: 0.8,
      }} />

      {/* الخطوط الأفقية العلوية والسفلية */}
      <View style={{ position: 'absolute', top: 7, left: 0, right: 0, height: 2, backgroundColor: '#c8860a', opacity: 0.8 }} />
      <View style={{ position: 'absolute', bottom: 7, left: 0, right: 0, height: 2, backgroundColor: '#c8860a', opacity: 0.8 }} />
      <View style={{ position: 'absolute', top: 12, left: 0, right: 0, height: 1, backgroundColor: '#d4af37', opacity: 0.3 }} />
      <View style={{ position: 'absolute', bottom: 12, left: 0, right: 0, height: 1, backgroundColor: '#d4af37', opacity: 0.3 }} />

      {/* النقوش المتحركة */}
      <Animated.View style={{
        position: 'absolute', top: 0, bottom: 0,
        flexDirection: 'row', alignItems: 'center',
        width: patternWidth,
        transform: [{ translateX }],
      }}>
        {Array.from({ length: count }).map((_, i) => {
          const x = i * spacing;
          const isBig = i % 2 === 0;
          return (
            <View key={i}>
              {/* معين رئيسي */}
              <View style={{
                position: 'absolute',
                left: x - (isBig ? 12 : 7),
                top: 32 - (isBig ? 12 : 7),
                width: isBig ? 24 : 14,
                height: isBig ? 24 : 14,
                transform: [{ rotate: '45deg' }],
                borderWidth: isBig ? 1.5 : 1,
                borderColor: isBig ? '#d4af37' : '#c8860a',
                opacity: isBig ? 0.9 : 0.6,
              }} />
              {/* نقطة في وسط المعين الكبير */}
              {isBig && (
                <View style={{
                  position: 'absolute',
                  left: x - 2.5,
                  top: 29.5,
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: '#FFD700',
                  opacity: 0.7,
                }} />
              )}
            </View>
          );
        })}
      </Animated.View>

      {/* النص - ساحات المحاورة بخط جميل */}
      <View style={{
        position: 'absolute', inset: 0,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{
          color: '#d4af37',
          fontSize: 22,
          fontWeight: '900',
          letterSpacing: 4,
          textShadowColor: 'rgba(212,175,55,0.6)',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 12,
          fontStyle: 'italic',
        }}>
          ✦ ساحات الطواريق ✦
        </Text>
      </View>
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
    <View style={{
      backgroundColor: '#1c1208',
      borderRadius: 10,
      padding: 8,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: '#c8860a',
      flexDirection: 'row-reverse',
    }}>
      {/* يمين: صورة + اسم + ساحة */}
      <View style={{
        alignItems: 'center',
        marginLeft: 8,
        width: 50,
      }}>
        <Image source={getAvatarSourceById(invite.creatorAvatar)} style={{
          width: 25,
          height: 25,
          borderRadius: 12.5,
          borderWidth: 1,
          borderColor: '#c8860a',
          marginBottom: 2,
        }} />
        <Text style={{
          fontSize: 10,
          color: '#d4af37',
          fontWeight: '700',
          textAlign: 'center',
        }} numberOfLines={2}>
          {invite.creatorName}
        </Text>
        <Text style={{
          fontSize: 9,
          color: 'rgba(212,175,55,0.6)',
          textAlign: 'center',
          marginTop: 1,
        }} numberOfLines={2}>
          {invite.roomName}
        </Text>
      </View>

      {/* يسار: نص الدعوة كامل */}
      {isOwnInvite ? (
        <View style={{
          flex: 1,
          backgroundColor: '#2d1f0e',
          borderRadius: 6,
          padding: 8,
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: 'rgba(200,134,10,0.3)',
        }}>
          <Text style={{
            color: 'rgba(212,175,55,0.4)',
            fontSize: 11,
            textAlign: 'center',
          }}>
            {invite.message || 'حياكم الله..'}
          </Text>
        </View>
      ) : (
        <TouchableOpacity style={{
          flex: 1,
          backgroundColor: '#2d1f0e',
          borderRadius: 6,
          padding: 8,
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: '#c8860a',
        }} onPress={onJoin}>
          <Text style={{
            color: '#d4af37',
            fontSize: 11,
            textAlign: 'center',
          }}>
            {invite.message || 'حياكم الله..'}
          </Text>
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
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [lastSeenFollowersCount, setLastSeenFollowersCount] = useState<number | null>(null);
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
  const { data: followingData, isLoading: followingLoading } = trpc.interactions.getFollowingDetails.useQuery(
    { userId: userId || '' },
    { enabled: !!userId && showFollowingModal, refetchInterval: showFollowingModal ? 5000 : false }
  );
  const { data: followersData, isLoading: followersLoading } = trpc.interactions.getFollowersDetails.useQuery(
    { userId: userId || '' },
    { enabled: !!userId && showFollowersModal, refetchInterval: showFollowersModal ? 5000 : false }
  );
  // عدد المتابعين/المتابَعين (query خفيف دائماً)
  const { data: followingCountData } = trpc.interactions.getFollowing.useQuery(
    { userId: userId || '' },
    { enabled: !!userId, refetchInterval: 10000 }
  );
  const { data: followersCountData } = trpc.interactions.getFollowers.useQuery(
    { userId: userId || '' },
    { enabled: !!userId, refetchInterval: 10000 }
  );
  const followingCount = followingCountData?.length ?? 0;
  const followersCount = followersCountData?.length ?? 0;
  // badge: متابعون جدد لم يُشاهَدوا بعد
  const hasNewFollowers = lastSeenFollowersCount !== null && followersCount > lastSeenFollowersCount;
  const heartbeatMutation = trpc.stats.heartbeat.useMutation();
  const { data: activeRoom, refetch: refetchActiveRoom } = trpc.rooms.getUserActiveRoom.useQuery({ creatorId: userId }, { refetchInterval: 3000 });
  const { data: pendingInvitesData } = trpc.publicInvitations.getPending.useQuery({ limit: 50 }, { refetchInterval: 2000 });
  const { data: displayedInvitesData } = trpc.publicInvitations.getDisplayed.useQuery({ limit: 10 }, { refetchInterval: 1000 });
  const createRoomMutation = trpc.rooms.create.useMutation();
  const unfollowMutation = trpc.interactions.toggle.useMutation();
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
        }, 20000);
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
  const leftColumnWidth = (screenWidth - 18) / 2;

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

          {/* وسط الهيدر: أيقونات المتابعين + عداد المتواجدين */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            {/* الصف الأول: أيقونتا المتابعين + عداد المتواجدين */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {/* يتابعونك - يسار */}
              <TouchableOpacity
                onPress={() => { setShowFollowersModal(true); setLastSeenFollowersCount(followersCount); }}
                style={{ alignItems: 'center' }}
              >
                <View style={{ position: 'relative' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2d1f0e', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#c8860a44' }}>
                    <MaterialIcons name="person" size={14} color="#c8860a" />
                    <Text style={{ color: '#d4af37', fontSize: 11, fontWeight: 'bold' }}>{followersCount}</Text>
                  </View>
                  {/* badge متابعون جدد */}
                  {hasNewFollowers && (
                    <View style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: '#1c1208' }} />
                  )}
                </View>
                <Text style={{ color: '#9BA1A6', fontSize: 8, marginTop: 2 }}>يتابعونك</Text>
              </TouchableOpacity>

              {/* تتابعهم - وسط */}
              <TouchableOpacity
                onPress={() => setShowFollowingModal(true)}
                style={{ alignItems: 'center' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2d1f0e', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#c8860a44' }}>
                  <Text style={{ color: '#d4af37', fontSize: 11, fontWeight: 'bold' }}>{followingCount}</Text>
                  <MaterialIcons name="person-add" size={14} color="#c8860a" />
                </View>
                <Text style={{ color: '#9BA1A6', fontSize: 8, marginTop: 2 }}>تتابعهم</Text>
              </TouchableOpacity>

              {/* عداد المتواجدين - يمين - محاط بخطين عموديين ذهبيين */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {/* خط عمودي يسار */}
                <View style={{ width: 1, height: 28, backgroundColor: '#c8860a66', marginRight: 10 }} />
                <View style={{ alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' }} />
                    <Text style={{ color: '#22C55E', fontSize: 11, fontWeight: 'bold' }}>{onlineCount}</Text>
                  </View>
                  <Text style={{ color: '#22C55E', fontSize: 8, marginTop: 1 }}>متواجدون الآن</Text>
                </View>
                {/* خط عمودي يمين */}
                <View style={{ width: 1, height: 28, backgroundColor: '#c8860a66', marginLeft: 10 }} />
              </View>
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
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
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

      {/* Modal قائمة من تتابعهم */}
      <FollowListModal
        visible={showFollowingModal}
        onClose={() => setShowFollowingModal(false)}
        title="تتابعهم"
        users={followingData || []}
        isLoading={followingLoading}
        onJoinRoom={(roomId) => handleJoinAsViewer(roomId)}
        onUnfollow={(targetUserId) => {
          if (!userId) return;
          unfollowMutation.mutate({
            fromUserId: userId,
            toUserId: targetUserId,
            type: 'follow',
          });
        }}
      />

      {/* Modal قائمة من يتابعونك */}
      <FollowListModal
        visible={showFollowersModal}
        onClose={() => setShowFollowersModal(false)}
        title="يتابعونك"
        users={followersData || []}
        isLoading={followersLoading}
        onJoinRoom={(roomId) => handleJoinAsViewer(roomId)}
      />
    </ScreenContainer>
  );
}
