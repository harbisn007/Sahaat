import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl, Alert, Animated, Easing, Dimensions } from "react-native";
import { useEffect, useState, useRef, useCallback } from "react";
import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ImageBackground } from "react-native";

import { ScreenContainer } from "@/components/screen-container";

// خلفية نقوش السدو التراثية
const roomsBackground = require("@/assets/images/rooms-background.png");
import { useUser } from "@/lib/user-context";
import { RoomCard } from "@/components/room-card";
import { CreateRoomModal } from "@/components/create-room-modal";
import { trpc } from "@/lib/trpc";
import { useSocketConnection } from "@/hooks/use-socket";
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
  status: string;
  displayedAt: Date | null;
  createdAt: Date;
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
    <Animated.Text style={{ opacity, color, fontWeight: 'bold', fontSize: 14, textDecorationLine: 'underline' }}>
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
  onJoin 
}: { 
  invite: PublicInvitation; 
  onJoin: () => void;
}) {
  return (
    <View style={{ 
      backgroundColor: 'rgba(255, 255, 255, 0.95)', 
      borderRadius: 8, 
      padding: 8, 
      marginBottom: 6,
      borderWidth: 1,
      borderColor: '#E5E7EB',
    }}>
      <Text style={{ fontSize: 12, color: '#374151', fontWeight: '600', marginBottom: 4 }} numberOfLines={1}>
        {invite.creatorName}
      </Text>
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
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>العب معي</Text>
      </TouchableOpacity>
    </View>
  );
}

// الحصول على عنوان الخادم
function getServerUrl(): string {
  if (Platform.OS === "web") {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const host = window.location.hostname;
    return `${protocol}//${host}:3000`;
  }
  return "http://127.0.0.1:3000";
}

export default function HomeScreen() {
  const { username, userId, avatar, accountType, isLoading: userLoading, logout, clearAllData } = useUser();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const isConnected = useSocketConnection();
  const socketRef = useRef<Socket | null>(null);
  
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
          onPress: () => {
            router.replace("/welcome");
            (async () => {
              try {
                if (activeRoom) {
                  deleteRoomMutation.mutate({ roomId: activeRoom.id });
                }
                if (isGuest) {
                  await clearAllData();
                } else {
                  await logout();
                }
              } catch (error) {
                console.error("فشل تسجيل الخروج:", error);
              }
            })();
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
          onPress: () => {
            router.replace("/welcome");
            (async () => {
              try {
                if (activeRoom) {
                  deleteRoomMutation.mutate({ roomId: activeRoom.id });
                }
                await logout();
              } catch (error) {
                console.error("فشل تسجيل الخروج:", error);
              }
            })();
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
  
  // عدد المتواجدين الآن (يتحدث فورياً عبر Socket.io)
  const [onlineCount, setOnlineCount] = useState(0);
  
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

  // الانضمام لقناة الدعوات العامة
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
    
    // الاستماع لتحديث عدد المتواجدين فورياً
    socket.on("onlineCountUpdated", (data: { count: number }) => {
      console.log("[Socket] Online count updated:", data.count);
      setOnlineCount(data.count);
    });
    
    return () => {
      socket.emit("leavePublicInvites");
      socket.disconnect();
    };
  }, []);

  // تحديث الدعوات من البيانات
  useEffect(() => {
    if (pendingInvitesData) {
      setPendingInvites(pendingInvitesData as PublicInvitation[]);
    }
  }, [pendingInvitesData]);

  useEffect(() => {
    if (displayedInvitesData) {
      setDisplayedInvites(displayedInvitesData as PublicInvitation[]);
    }
  }, [displayedInvitesData]);

  // نظام طابور الدعوات (4 ثواني لكل دعوة)
  useEffect(() => {
    if (displayedInvites.length > 0) {
      const timer = setTimeout(async () => {
        const oldestInvite = displayedInvites[0];
        if (oldestInvite) {
          try {
            await expireInviteMutation.mutateAsync({ invitationId: oldestInvite.id });
          } catch (error) {
            console.error("Failed to expire invite:", error);
          }
        }
      }, 4000);
      
      return () => clearTimeout(timer);
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

      router.push(`/room/${roomId}`);
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

  // الانضمام عبر الدعوة العامة (يرسل طلب انضمام كلاعب)
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
      
      // الانتقال للساحة كمشاهد (سيتم ترقيته للاعب عند القبول)
      await joinAsViewerMutation.mutateAsync({
        roomId: invite.roomId,
        userId,
        username,
        avatar: avatar || "male",
      });
      
      router.push(`/room/${invite.roomId}`);
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
          
          {/* زر تغيير الملف الشخصي */}
          <TouchableOpacity
            onPress={handleChangeProfile}
            className="p-2"
          >
            <MaterialIcons name="person" size={24} color="#D4A574" />
          </TouchableOpacity>
        </View>
        <Text className="text-sm text-muted text-center">مرحباً {username}</Text>
      </View>

      {/* Create Room Button */}
      <View className="px-6 py-4">
        {hasActiveRoom && activeRoom ? (
          <View>
            {/* عداد تنازلي للساحة الممدة - يظهر للمنشئ فقط (ساعات التمديد المتبقية) */}
            {activeRoom.extensionExpiresAt && (
              <CountdownTimer expiresAt={new Date(activeRoom.extensionExpiresAt)} />
            )}
            {/* عداد طلبات اللعب */}
            {(activeRoom.pendingRequestsCount || 0) > 0 && (
              <View className="flex-row items-center justify-center mb-2">
                <View style={{ backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, marginRight: 6 }}>
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>{activeRoom.pendingRequestsCount}</Text>
                </View>
                <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: 13 }}>لديك طلبات لعب</Text>
              </View>
            )}
            {/* الصف الرئيسي: المستطيل الرمادي + زر الانتقال */}
            <View className="flex-row items-center justify-center" style={{ gap: 8 }}>
              <View style={{ backgroundColor: '#9CA3AF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>لديك ساحة نشطة</Text>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: '#D4A574', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
                onPress={() => router.push(`/room/${activeRoom.id}`)}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>انتقل إلى ساحتك</Text>
              </TouchableOpacity>
            </View>
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
          
          {/* قائمة الدعوات */}
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
                />
              ))
            ) : (
              <View style={{ alignItems: 'center', paddingTop: 20 }}>
                <Text style={{ color: '#9CA3AF', fontSize: 11, textAlign: 'center' }}>
                  لا توجد دعوات حالياً
                </Text>
              </View>
            )}
          </ScrollView>
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
              fontSize: 19, 
              color: '#8B5CF6', // لون خزامي
              textDecorationLine: 'underline',
              textShadowColor: '#FFD700', // ذهبي
              textShadowOffset: { width: 1, height: 1 },
              textShadowRadius: 2,
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
                    onJoinAsPlayer={() => handleJoinAsPlayer(item.id)}
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
