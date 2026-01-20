import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl, Alert } from "react-native";
import { useEffect, useState } from "react";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
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
  const { username, isLoading: userLoading } = useUser();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [userId] = useState(() => Math.floor(Math.random() * 1000000));

  const { data: rooms, isLoading: roomsLoading, refetch } = trpc.rooms.list.useQuery();
  const createRoomMutation = trpc.rooms.create.useMutation();
  const joinAsPlayerMutation = trpc.rooms.requestJoinAsPlayer.useMutation();
  const joinAsViewerMutation = trpc.rooms.joinAsViewer.useMutation();

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
      });

      await refetch();
      router.push(`/room/${result.roomId}`);
    } catch (error) {
      console.error("Failed to create room:", error);
      throw error;
    }
  };

  const handleJoinAsPlayer = async (roomId: number) => {
    if (!username) return;

    try {
      await joinAsPlayerMutation.mutateAsync({
        roomId,
        userId,
        username,
      });

      router.push(`/room/${roomId}`);
      Alert.alert("تم إرسال الطلب", "في انتظار موافقة منشئ الغرفة");
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
      {/* Header */}
      <View className="px-6 pt-4 pb-3 border-b border-border">
        <Text className="text-2xl font-bold text-foreground text-center">ساحات المحاورة</Text>
        <Text className="text-sm text-muted text-center mt-1">مرحباً {username}</Text>
      </View>

      {/* Create Room Button */}
      <View className="px-6 py-4">
        <TouchableOpacity
          className="bg-primary rounded-xl py-3 items-center"
          onPress={() => setShowCreateModal(true)}
        >
          <Text className="text-background font-semibold text-base">➕ إنشاء غرفة جديدة</Text>
        </TouchableOpacity>
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
            renderItem={({ item }) => (
              <RoomCard
                room={item}
                onJoinAsPlayer={() => handleJoinAsPlayer(item.id)}
                onJoinAsViewer={() => handleJoinAsViewer(item.id)}
              />
            )}
            refreshControl={<RefreshControl refreshing={roomsLoading} onRefresh={refetch} />}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        ) : (
          <View className="flex-1 justify-center items-center">
            <Text className="text-muted text-center">لا توجد غرف متاحة</Text>
            <Text className="text-muted text-center mt-2">قم بإنشاء غرفة جديدة!</Text>
          </View>
        )}
      </View>

      {/* Create Room Modal */}
      <CreateRoomModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateRoom}
      />
    </ScreenContainer>
  );
}
