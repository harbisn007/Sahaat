import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl, Alert } from "react-native";
import { useEffect, useState } from "react";
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

/**
 * Home Screen - NativeWind Example
 *
 * This template uses NativeWind (Tailwind CSS for React Native).
 * You can use familiar Tailwind classes directly in className props.
 *
 * Key patterns:
 * - Use `className` instead of `style` for most styling
 * - Theme colors: use tokens directly (bg-background, text-foreground, bg-primary, etc.); no dark: prefix needed
 * - Responsive: standard Tailwind breakpoints work on web
 * - Custom colors defined in tailwind.config.js
 */
export default function HomeScreen() {
  const { username, userId, avatar, accountType, isLoading: userLoading, logout, clearAllData } = useUser();
  const [showCreateModal, setShowCreateModal] = useState(false);

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
            // حذف الساحة النشطة إن وجدت
            if (activeRoom) {
              try {
                await deleteRoomMutation.mutateAsync({ roomId: activeRoom.id });
              } catch (error) {
                console.error("فشل حذف الساحة:", error);
              }
            }
            
            if (isGuest) {
              // للضيف: حذف جميع البيانات
              await clearAllData();
            } else {
              // لمستخدمي Google/Apple: تسجيل خروج فقط
              await logout();
            }
            router.replace("/welcome");
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
            // حذف الساحة النشطة إن وجدت
            if (activeRoom) {
              try {
                await deleteRoomMutation.mutateAsync({ roomId: activeRoom.id });
              } catch (error) {
                console.error("فشل حذف الساحة:", error);
              }
            }
            await logout();
            router.replace("/welcome");
          },
        },
      ]
    );
  };

  const { data: rooms, isLoading: roomsLoading, refetch } = trpc.rooms.list.useQuery(
    undefined,
    { refetchInterval: 5000 } // تحديث كل 5 ثواني
  );
  const { data: activeRoom, refetch: refetchActiveRoom } = trpc.rooms.getUserActiveRoom.useQuery(
    { creatorId: userId },
    { refetchInterval: 3000 }
  );
  const createRoomMutation = trpc.rooms.create.useMutation();
  const joinAsPlayerMutation = trpc.rooms.requestJoinAsPlayer.useMutation();
  const joinAsViewerMutation = trpc.rooms.joinAsViewer.useMutation();
  
  const hasActiveRoom = !!activeRoom;

  useEffect(() => {
    if (!userLoading && !username) {
      router.replace("/welcome");
    }
  }, [username, userLoading]);

  const handleCreateRoom = async (roomName: string) => {
    if (!username) return;

    try {
      const result = await createRoomMutation.mutateAsync({
        name: roomName,
        creatorId: userId,
        creatorName: username,
        creatorAvatar: avatar || "male",
      });

      await refetch();
      await refetchActiveRoom();
      router.push(`/room/${result.roomId}`);
      setShowCreateModal(false);
    } catch (error) {
      Alert.alert("خطأ", "حدث خطأ أثناء إنشاء الساحة");
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
        <TouchableOpacity
          className="rounded-xl py-3 items-center"
          style={{ backgroundColor: hasActiveRoom ? '#9CA3AF' : '#D4A574' }}
          onPress={() => {
            if (hasActiveRoom) {
              Alert.alert(
                "ساحة نشطة موجودة",
                "لديك ساحة نشطة بالفعل. يرجى إغلاق الساحة الحالية قبل إنشاء ساحة جديدة."
              );
            } else {
              setShowCreateModal(true);
            }
          }}
          disabled={hasActiveRoom}
        >
          <Text className="text-background font-semibold text-base">
            {hasActiveRoom ? "🚫 لديك ساحة نشطة" : "➥ إنشاء ساحة جديدة"}
          </Text>
        </TouchableOpacity>
        {hasActiveRoom && activeRoom && (
          <TouchableOpacity
            className="mt-2 bg-primary rounded-xl py-3 items-center"
            onPress={() => router.push(`/room/${activeRoom.id}`)}
          >
            <Text className="text-background font-semibold text-base">📍 انتقل إلى غرفتك: {activeRoom.name}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Rooms List */}
      <View className="flex-1 px-6">
        {roomsLoading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" />
          </View>
        ) : rooms && rooms.length > 0 ? (
          <FlatList
            data={rooms}
            keyExtractor={(item) => item.id.toString()}
            numColumns={2}
            columnWrapperStyle={{ gap: 8, marginBottom: 8 }}
            renderItem={({ item }) => (
              <View style={{ flex: 1, maxWidth: '50%' }}>
                <RoomCard
                  room={item}
                  currentUserId={userId}
                  onJoinAsPlayer={() => handleJoinAsPlayer(item.id)}
                  onJoinAsViewer={() => handleJoinAsViewer(item.id)}
                  onDirectEnter={() => router.push(`/room/${item.id}`)}
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
