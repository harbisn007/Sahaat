import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl, Alert, Animated, Easing, Dimensions } from "react-native";
import { useEffect, useState, useRef, useCallback } from "react";
import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ImageBackground, Image } from "react-native";

import { ScreenContainer } from "@/components/screen-container";

// خلفية نقوش السدو التراثية
const roomsBackground = require("@/assets/images/rooms-background.png");
import { useUser } from "@/lib/user-context";
import { RoomCard } from "@/components/room-card";
import { CreateRoomModal } from "@/components/create-room-modal";
import { trpc } from "@/lib/trpc";
import { useSocketConnection } from "@/hooks/use-socket";
import { useNotificationBell } from "@/hooks/use-notification-bell";
import { io, Socket } from "socket.io-client";
import { Platform } from "react-native";

// نوع الدعوة العامة
interface PublicInvitation {
  id: number;
  roomId: number;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  roomName: string;
  message?: string | null;
  status: string;
  displayedAt: Date | null;
  createdAt: Date;
}

// صور البنر الثلاث
const saduBanner1 = require("@/assets/images/sadu-banner-1.png");
const saduBanner2 = require("@/assets/images/sadu-banner-2.png");
const saduBanner3 = require("@/assets/images/sadu-banner-3.png");

// مكون بنر السدو المتحرك
function SaduBanner() {
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const banners = [saduBanner1, saduBanner2, saduBanner3];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBannerIndex((prevIndex) => (prevIndex + 1) % banners.length);
    }, 20000); // تبديل كل 20 ثانية

    return () => clearInterval(interval);
  }, []);

  return (
    <View style={{ width: '103%', height: 60, marginVertical: 4, alignSelf: 'center' }}>
      <Image
        source={banners[currentBannerIndex]}
        style={{ width: '100%', height: 60, borderRadius: 8 }}
        resizeMode="cover"
      />
    </View>
  );
}

// مكون عنوان يومض
function BlinkingTitle({ text, color }: { text: string; color: string }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 500, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, easing: Easing.ease, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, []);

  return (
    <Animated.Text style={{ opacity, color, fontWeight: 'bold', fontSize: 18, textDecorationLine: 'underline' }}>
      {text}
    </Animated.Text>
  );
}

// مكون العداد التنازلي للساحة الممدة (المنجمة)
function CountdownTimer({ expiresAt }: { expiresAt: Date }) {
  const [hoursLeft, setHoursLeft] = useState(0);

  useEffect(() => {
    const calculateHours = () => {
      const now = new Date();
      const diff = expiresAt.getTime() - now.getTime();
      if (diff <= 0) {
        setHoursLeft(0);
        return;
      }
      const hours = Math.ceil(diff / (1000 * 60 * 60));
      setHoursLeft(hours);
    };

    calculateHours();
    const interval = setInterval(calculateHours, 60000); // تحديث كل دقيقة
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (hoursLeft <= 0) return null;

  return (
    <View style={{ alignItems: 'center', marginBottom: 8 }}>
      <View style={{
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 3,
        borderColor: '#EF4444',
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 16 }}>
          {hoursLeft}
        </Text>
      </View>
    </View>
  );
}

// مكون بطاقة الدعوة العامة
function PublicInviteCard({ 
  invite, 
  onJoin,
  currentUserId
}: { 
  invite: PublicInvitation; 
  onJoin: () => void;
  currentUserId: string;
}) {
  // تحديد صورة الأفاتار
  const getAvatarSource = () => {
    const avatarType = invite.creatorAvatar || 'male';
    if (avatarType === 'female') {
      return require('@/assets/images/avatar-female.png');
    }
    return require('@/assets/images/avatar-male.png');
  };

  // التحقق من أن المستخدم ليس مرسل الدعوة
  const isOwnInvite = invite.creatorId === currentUserId;

  return (
    <View style={{ 
      backgroundColor: 'rgba(255, 255, 255, 0.95)', 
      borderRadius: 8, 
      padding: 8, 
      marginBottom: 6,
      borderWidth: 1,
      borderColor: '#E5E7EB',
    }}>
      {/* صف الصورة والاسم */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Image 
          source={getAvatarSource()} 
          style={{ width: 28, height: 28, borderRadius: 14, marginLeft: 6 }} 
        />
        <Text style={{ fontSize: 12, color: '#374151', fontWeight: '600', flex: 1 }} numberOfLines={1}>
          {invite.creatorName}
        </Text>
      </View>
      {isOwnInvite ? (
        <View
          style={{ 
            backgroundColor: '#9CA3AF', 
            borderRadius: 6, 
            paddingVertical: 6,
            paddingHorizontal: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>دعوتك</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={{ 
            backgroundColor: '#EF4444', 
            borderRadius: 6, 
            paddingVertical: 6,
            paddingHorizontal: 10,
            alignItems: 'center',
          }}
          onPress={onJoin}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }} numberOfLines={1}>
            {invite.message || 'مطلوب شاعر'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// الحصول على عنوان الخادم
function getServerUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const host = window.location.hostname;
    // Pattern: 8081-sandboxid.region.domain -> 3000-sandboxid.region.domain
    const apiHost = host.replace(/^8081-/, "3000-");
    return `${protocol}//${apiHost}`;
  }
  // Android/iOS: استخدام API_URL من البيئة أو localhost
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl) return apiUrl;
  return "http://127.0.0.1:3000";
}

export default function HomeScreen() {
  const { username, userId, avatar, accountType, isLoading: userLoading, logout, clearAllData } = useUser();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const isConnected = useSocketConnection();
  const { playBell } = useNotificationBell();
  const socketRef = useRef<Socket | null>(null);
  const creatorSocketRef = useRef<Socket | null>(null);
  const playedJoinRequestsRef = useRef<Set<string>>(new Set());
  
  // حالة الدعوات العامة
  const [displayedInvites, setDisplayedInvites] = useState<PublicInvitation[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PublicInvitation[]>([]);

  // Mutation لحذف الساحة
  const deleteRoomMutation = trpc.rooms.deleteRoom.useMutation();

  // دالة تسجيل الخروج
  const handleLogout = () => {
    const isGuest = accountType === 'guest';
    const message = isGuest 
      ? "هل تريد تسجيل الخروج؟\n\nتنبيه: سيتم حذف جميع بياناتك بما فيها الساحات التي أنشأتها."
      : "هل تريد تسجيل الخروج؟";
    
    Alert.alert(
      "تسجيل الخروج",
      message,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "خروج",
          style: "destructive",
          onPress: async () => {
            try {
              // حذف الساحة أولاً وانتظار اكتمال الحذف
              if (activeRoom) {
                await deleteRoomMutation.mutateAsync({ roomId: activeRoom.id });
              }
              // ثم تسجيل الخروج
              if (isGuest) {
                await clearAllData();
              } else {
                await logout();
              }
              // أخيراً الانتقال لصفحة الترحيب
              router.replace("/welcome");
            } catch (error) {
              console.error("فشل تسجيل الخروج:", error);
              // حتى لو فشل الحذف، ننتقل لصفحة الترحيب
              router.replace("/welcome");
            }
          },
        },
      ]
    );
  };

  // دالة العودة لشاشة تغيير الاسم والصورة
  const handleChangeProfile = () => {
    const message = activeRoom 
      ? "هل تريد تغيير اسمك وصورتك؟ \n\nتنبيه: سيتم حذف ساحتك النشطة وإخراج جميع المتواجدين فيها."
      : "هل تريد تغيير اسمك وصورتك؟";
    
    Alert.alert(
      "تغيير الملف الشخصي",
      message,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "تغيير",
          style: "destructive",
          onPress: async () => {
            try {
              // حذف الساحة أولاً وانتظار اكتمال الحذف
              if (activeRoom) {
                await deleteRoomMutation.mutateAsync({ roomId: activeRoom.id });
              }
              // ثم تسجيل الخروج
              await logout();
              // أخيراً الانتقال لصفحة الترحيب
              router.replace("/welcome");
            } catch (error) {
              console.error("فشل تغيير الملف الشخصي:", error);
              // حتى لو فشل الحذف، ننتقل لصفحة الترحيب
              router.replace("/welcome");
            }
          },
        },
      ]
    );
  };

  // استخدام API الجديد لـ TOP 10
  const { data: top10Rooms, isLoading: roomsLoading, refetch } = trpc.top10.list.useQuery(
    undefined,
    { refetchInterval: 3000 } // تحديث كل 3 ثواني للترتيب الفوري
  );
  const rooms = top10Rooms || [];
  
  // عدد المتواجدين الآن (يتحدث فورياً عبر tRPC polling)
  const { data: onlineCountData } = trpc.stats.onlineCount.useQuery(
    undefined,
    { refetchInterval: 3000 } // تحديث كل 3 ثواني
  );
  const onlineCount = onlineCountData?.count ?? 0;
  
  // Heartbeat لتسجيل نشاط المستخدم
  const heartbeatMutation = trpc.stats.heartbeat.useMutation();
  
  const { data: activeRoom, refetch: refetchActiveRoom } = trpc.rooms.getUserActiveRoom.useQuery(
    { creatorId: userId },
    { refetchInterval: 3000 }
  );
  
  // جلب الدعوات العامة
  const { data: pendingInvitesData } = trpc.publicInvitations.getPending.useQuery(
    { limit: 50 },
    { refetchInterval: 2000 }
  );
  const { data: displayedInvitesData } = trpc.publicInvitations.getDisplayed.useQuery(
    { limit: 10 },
    { refetchInterval: 1000 }
  );
  
  const createRoomMutation = trpc.rooms.create.useMutation();
  const joinAsPlayerMutation = trpc.rooms.requestJoinAsPlayer.useMutation();
  const joinAsViewerMutation = trpc.rooms.joinAsViewer.useMutation();
  const createJoinRequestMutation = trpc.joinRequests.create.useMutation();
  const markDisplayedMutation = trpc.publicInvitations.markDisplayed.useMutation();
  const expireInviteMutation = trpc.publicInvitations.expire.useMutation();
  
  const hasActiveRoom = !!activeRoom;
  const creatorRoomsRef = useRef<Set<number>>(new Set());

  // الانضمام لقناة الدعوات العامة وقناة المنشئ
  useEffect(() => {
    const serverUrl = getServerUrl();
    const socket = io(serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
    });
    socketRef.current = socket;
    
    socket.on("connect", () => {
      console.log("[Socket] Connected to public invites channel");
      socket.emit("joinPublicInvites");
      // الانضمام لقناة المنشئ لاستقبال إشعارات طلبات الانضمام
      if (userId) {
        socket.emit("joinCreatorChannel", userId);
        console.log("[Socket] Joined creator channel for:", userId);
      }
    });
    
    // الاستماع للدعوات الجديدة
    socket.on("publicInviteCreated", (data: { invitationId: number; roomId: number; creatorId: string; creatorName: string; creatorAvatar: string; roomName: string }) => {
      console.log("[Socket] New public invite:", data);
      refetch();
    });
    
    socket.on("publicInviteExpired", (data: { invitationId: number }) => {
      console.log("[Socket] Public invite expired:", data);
      refetch();
    });

    // الاستماع لإشعارات طلبات الانضمام للمنشئ
    // الجرس يعمل فقط عندما المنشئ في صفحة الساحات (هذه الصفحة)
    // لا يعمل عندما يكون داخل ساحته (لأنه يرى الطلبات مباشرة)
    socket.on("creatorJoinRequest", (data: { roomId: number; creatorId: string; requestType: string; requesterId: string; requesterName: string }) => {
      console.log("[Socket] Join request for creator:", data);
      // تشغيل صوت الجرس - المنشئ في صفحة الساحات (خارج ساحته)
      if (data.creatorId === userId) {
        playBell();
        console.log("[Socket] Playing notification bell for creator");
      }
    });

    
    return () => {
      socket.emit("leavePublicInvites");
      if (userId) {
        socket.emit("leaveCreatorChannel", userId);
      }
      socket.disconnect();
    };
  }, [userId]);

  // Heartbeat لتسجيل نشاط المستخدم كل 30 ثانية
  useEffect(() => {
    if (!userId) return;
    
    // إرسال heartbeat فوراً عند الدخول
    heartbeatMutation.mutate({ userId });
    
    // إرسال heartbeat كل 30 ثانية
    const interval = setInterval(() => {
      heartbeatMutation.mutate({ userId });
    }, 30000);
    
    return () => clearInterval(interval);
  }, [userId]);

  // تحديث الدعوات من البيانات
  useEffect(() => {
    if (pendingInvitesData) {
      setPendingInvites(pendingInvitesData as PublicInvitation[]);
    }
  }, [pendingInvitesData]);

  // تتبع الدعوات التي تم حذفها محلياً
  const [expiredInviteIds, setExpiredInviteIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (displayedInvitesData) {
      // تصفية الدعوات المحذوفة محلياً
      const filteredInvites = (displayedInvitesData as PublicInvitation[]).filter(
        invite => !expiredInviteIds.has(invite.id)
      );
      setDisplayedInvites(filteredInvites);
    }
  }, [displayedInvitesData, expiredInviteIds]);

  // تتبع الدعوات التي تم إنشاء timer لها
  const timerCreatedRef = useRef<Set<number>>(new Set());

  // نظام طابور الدعوات (4 ثواني لكل دعوة)
  useEffect(() => {
    if (displayedInvites.length > 0) {
      // إنشاء timer لكل دعوة معروضة جديدة
      displayedInvites.forEach((invite) => {
        // تجاهل الدعوات التي تم حذفها أو إنشاء timer لها مسبقاً
        if (expiredInviteIds.has(invite.id) || timerCreatedRef.current.has(invite.id)) return;
        
        // تسجيل أنه تم إنشاء timer لهذه الدعوة
        timerCreatedRef.current.add(invite.id);
        
        console.log(`[Invite] Setting 15s timer for invite ${invite.id}`);
        
        setTimeout(async () => {
          try {
            console.log(`[Invite] Timer fired! Expiring invite ${invite.id}`);
            // حذف محلي فوري
            setDisplayedInvites(prev => prev.filter(i => i.id !== invite.id));
            setExpiredInviteIds(prev => new Set(prev).add(invite.id));
            // حذف من الخادم
            await expireInviteMutation.mutateAsync({ invitationId: invite.id });
            console.log(`[Invite] Successfully expired invite ${invite.id}`);
          } catch (error) {
            console.error("Failed to expire invite:", error);
          }
        }, 15000);
      });
    }
  }, [displayedInvites]);

  // نقل دعوة من الطابور للعرض
  useEffect(() => {
    if (displayedInvites.length < 10 && pendingInvites.length > 0) {
      const nextInvite = pendingInvites[0];
      if (nextInvite) {
        markDisplayedMutation.mutate({ invitationId: nextInvite.id });
      }
    }
  }, [displayedInvites.length, pendingInvites.length]);

  useEffect(() => {
    if (!userLoading && !username) {
      router.replace("/welcome");
    }
  }, [username, userLoading]);

  const handleCreateRoom = async (roomName: string) => {
    if (!username || !userId) {
      Alert.alert("خطأ", "يرجى تسجيل الدخول أولاً");
      return;
    }

    try {
      const result = await createRoomMutation.mutateAsync({
        name: roomName,
        creatorId: userId,
        creatorName: username,
        creatorAvatar: avatar || "male",
      });
      
      setShowCreateModal(false);
      router.push(`/room/${result.roomId}`);
    } catch (error: any) {
      Alert.alert("خطأ", error?.message || "حدث خطأ أثناء إنشاء الساحة");
    }
  };

  const handleJoinAsPlayer = async (roomId: number) => {
    if (!username) return;

    try {
      await joinAsPlayerMutation.mutateAsync({
        roomId,
        userId,
        username,
        avatar: avatar || "male",
      });

      // إظهار رسالة للمستخدم أن طلبه قيد الانتظار - لا يدخل كمستمع
      Alert.alert(
        "تم إرسال الطلب",
        "طلبك قيد الانتظار. سيتم إشعارك عند قبول المنشئ لطلبك."
      );
      // البقاء في صفحة الساحات - لا ننتقل للساحة
    } catch (error: any) {
      Alert.alert("خطأ", error.message || "حدث خطأ أثناء الانضمام");
    }
  };

  const handleJoinAsViewer = async (roomId: number) => {
    if (!username) return;

    try {
      await joinAsViewerMutation.mutateAsync({
        roomId,
        userId,
        username,
        avatar: avatar || "male",
      });

      router.push(`/room/${roomId}`);
    } catch (error) {
      Alert.alert("خطأ", "حدث خطأ أثناء الانضمام");
    }
  };

  // الانضمام عبر الدعوة العامة (يرسل طلب انضمام كلاعب ويبقى في صفحة الساحات)
  const handleJoinFromInvite = async (invite: PublicInvitation) => {
    if (!username || !userId) {
      Alert.alert("خطأ", "يرجى تسجيل الدخول أولاً");
      return;
    }

    try {
      // إرسال طلب انضمام كلاعب
      await createJoinRequestMutation.mutateAsync({
        roomId: invite.roomId,
        userId,
        username,
        avatar: avatar || "male",
      });
      
      // إظهار رسالة للمستخدم أن طلبه قيد الانتظار - لا يدخل كمستمع
      Alert.alert(
        "تم إرسال الطلب",
        "طلبك قيد الانتظار. سيتم إشعارك عند قبول المنشئ لطلبك."
      );
      // البقاء في صفحة الساحات - لا ننتقل للساحة
    } catch (error: any) {
      Alert.alert("خطأ", error.message || "حدث خطأ أثناء الانضمام");
    }
  };

  if (userLoading) {
    return (
      <ScreenContainer>
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" />
        </View>
      </ScreenContainer>
    );
  }

  if (!username) {
    return null;
  }

  const screenWidth = Dimensions.get('window').width;
  const leftColumnWidth = screenWidth * 0.33; // ⅓ للدعوات
  const rightColumnWidth = screenWidth * 0.67; // ⅔ لـ TOP 10

  return (
    <ScreenContainer>
      <ImageBackground 
        source={roomsBackground} 
        style={{ flex: 1 }}
        imageStyle={{ opacity: 0.15 }}
        resizeMode="cover"
      >
      {/* Header */}
      <View className="px-6 pt-4 pb-3 border-b border-border" style={{ backgroundColor: 'rgba(250, 248, 245, 0.9)' }}>
        <View className="flex-row items-center mb-2">
          {/* زر تسجيل الخروج */}
          <TouchableOpacity
            onPress={handleLogout}
            className="p-2"
          >
            <MaterialIcons name="logout" size={24} color="#D4A574" />
          </TouchableOpacity>
          
          <Text className="text-2xl font-bold text-foreground text-center flex-1">ساحات المحاورة</Text>
          
          {/* زر العودة إلى ساحتك + عداد الطلبات */}
          {hasActiveRoom && activeRoom && (
            <View style={{ alignItems: 'flex-end' }}>
              <TouchableOpacity
                onPress={() => router.push(`/room/${activeRoom.id}`)}
                style={{
                  backgroundColor: '#D4A574',
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderWidth: 1,
                  borderColor: '#E6E6FA',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 10 }}>العودة لساحتك</Text>
              </TouchableOpacity>
              {/* عداد طلبات اللعب - تحت زر العودة */}
              {(activeRoom.pendingRequestsCount || 0) > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: 10, marginLeft: 4 }}>طلبات لعب</Text>
                  <View style={{ backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 10 }}>{activeRoom.pendingRequestsCount}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

        </View>
        
        </View>

      {/* بنر الإعلان - تبديل الصور كل 30 ثانية */}
      <SaduBanner />

      {/* Create Room Button */}
      <View className="px-6 py-4">
        {hasActiveRoom && activeRoom ? (
          <View>
            {/* عداد تنازلي للساحة الممدة - يظهر للمنشئ فقط (ساعات التمديد المتبقية) */}
            {activeRoom.extensionExpiresAt && (
              <CountdownTimer expiresAt={new Date(activeRoom.extensionExpiresAt)} />
            )}
          </View>
        ) : (
          <TouchableOpacity
            className="rounded-xl py-3 items-center"
            style={{ backgroundColor: '#D4A574' }}
            onPress={() => setShowCreateModal(true)}
          >
            <Text className="text-background font-semibold text-base">➥ إنشاء ساحة جديدة</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* عداد المتواجدين الآن */}
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <Text style={{ color: '#22C55E', fontSize: 12, fontWeight: 'bold' }}>
          المتواجدين الآن
        </Text>
        <Text style={{ color: '#22C55E', fontSize: 20, fontWeight: 'bold' }}>
          {onlineCount}
        </Text>
      </View>

      {/* Main Content - Two Columns */}
      <View className="flex-1 flex-row px-2">
        {/* العمود الأيسر - الدعوات العامة (⅓) */}
        <View style={{ width: leftColumnWidth - 8, paddingHorizontal: 4 }}>
          {/* عنوان الدعوات العامة */}
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <BlinkingTitle text="الدعوات العامة" color="#EF4444" />
          </View>
          
          {/* قائمة الدعوات مع خلفية السدو */}
          <View style={{ flex: 1, position: 'relative' }}>
            {/* خلفية نقشة السدو - تحت العنوان */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 }} pointerEvents="none">
              <Image 
                source={require('@/assets/images/sadu-pattern.jpg')}
                style={{ 
                  width: '100%',
                  height: '100%',
                  opacity: 0.40,
                }}
                resizeMode="repeat"
              />
            </View>
            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
            {displayedInvites.length > 0 ? (
              displayedInvites.map((invite) => (
                <PublicInviteCard
                  key={invite.id}
                  invite={invite}
                  onJoin={() => handleJoinFromInvite(invite)}
                  currentUserId={userId}
                />
              ))
            ) : null}
            </ScrollView>
          </View>
        </View>

        {/* الخط الفاصل المزخرف بالسدو */}
        <View style={{ 
          width: 3, 
          backgroundColor: '#1F2937',
          marginHorizontal: 4,
          borderRadius: 2,
          // زخرفة السدو البيضاء
          borderStyle: 'dashed',
          borderWidth: 1,
          borderColor: '#fff',
        }} />

        {/* العمود الأيمن - TOP 10 (⅔) */}
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          {/* عنوان TOP 10 */}
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ 
              fontWeight: 'bold', 
              fontSize: 23, 
              color: '#1F2937', // أسود داكن
              textDecorationLine: 'underline',
              textShadowColor: '#FFD700', // ذهبي
              textShadowOffset: { width: 2, height: 2 },
              textShadowRadius: 4,
            }}>
              ⭐ TOP 10 ⭐
            </Text>
          </View>
          
          {/* قائمة الساحات */}
          {roomsLoading ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator size="large" />
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
              refreshControl={<RefreshControl refreshing={roomsLoading} onRefresh={refetch} />}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          ) : (
            <View className="flex-1 justify-center items-center">
              <Text className="text-muted text-center">لا توجد ساحات متاحة</Text>
              <Text className="text-muted text-center mt-2">قم بإنشاء ساحة جديدة!</Text>
            </View>
          )}
        </View>
      </View>

      </ImageBackground>

      {/* Create Room Modal */}
      <CreateRoomModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateRoom}
      />
    </ScreenContainer>
  );
}
