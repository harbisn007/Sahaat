import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, ImageBackground, Alert, ActivityIndicator } from "react-native";
import { useEffect, useState, useRef } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useUser } from "@/lib/user-context";
import { MaterialIcons } from "@expo/vector-icons";

const welcomeBackground = require("@/assets/images/welcome-background.png");

export default function InviteScreen() {
  const { id, inviter } = useLocalSearchParams<{ id: string; inviter?: string }>();
  const router = useRouter();
  const { username, avatar, userId, isLoading: userLoading, setUserData } = useUser();
  const roomId = parseInt(id || "0", 10);
  const [isAutoJoining, setIsAutoJoining] = useState(false);
  const autoJoinAttempted = useRef(false);

  // Mutations for joining
  const joinAsViewerMutation = trpc.rooms.joinAsViewer.useMutation();
  const requestJoinMutation = trpc.rooms.requestJoinAsPlayer.useMutation();

  // Fetch room data
  const { data: roomData, isLoading, error } = trpc.rooms.getById.useQuery(
    { roomId },
    { enabled: roomId > 0 }
  );

  // Auto-join logic: if user is not logged in, create guest account and join as viewer
  useEffect(() => {
    const autoJoinAsGuest = async () => {
      // Prevent multiple attempts
      if (autoJoinAttempted.current) return;
      
      // Wait for user loading to complete
      if (userLoading) return;
      
      // If already logged in, don't auto-join
      if (username) return;
      
      // Wait for room data
      if (isLoading || !roomData) return;
      
      autoJoinAttempted.current = true;
      setIsAutoJoining(true);
      
      try {
        // Create guest name: "ضيف + inviter name" or "ضيف"
        const inviterName = inviter || "";
        const guestName = inviterName ? `ضيف ${inviterName}` : `ضيف ${roomId}`;
        const guestAvatar = "male"; // Default to male avatar
        
        console.log("[InviteScreen] Creating guest account:", guestName);
        
        // Set user data (this will create the user in the database)
        await setUserData(guestName, guestAvatar);
        
        // Wait a bit for the user data to be saved
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log("[InviteScreen] Guest account created, redirecting to room as viewer");
        
        // Redirect to room - the room will handle joining as viewer
        router.replace(`/room/${roomId}?role=viewer&autoJoin=true`);
      } catch (err) {
        console.error("[InviteScreen] Auto-join failed:", err);
        setIsAutoJoining(false);
        // Fallback to manual login
        router.replace(`/welcome?redirect=/invite/${roomId}${inviter ? `&inviter=${inviter}` : ""}`);
      }
    };
    
    autoJoinAsGuest();
  }, [userLoading, username, isLoading, roomData, inviter, roomId, setUserData, router]);

  const handleJoinAsPlayer = async () => {
    if (!username || !userId) {
      Alert.alert("خطأ", "يرجى تسجيل الاسم أولاً");
      router.replace(`/welcome?redirect=/invite/${roomId}`);
      return;
    }

    try {
      await requestJoinMutation.mutateAsync({
        roomId,
        username,
        avatar: avatar || "male",
        userId,
      });
      router.replace(`/room/${roomId}?role=player`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "حدث خطأ";
      Alert.alert("خطأ", errorMessage);
    }
  };

  const handleJoinAsViewer = async () => {
    if (!username || !userId) {
      Alert.alert("خطأ", "يرجى تسجيل الاسم أولاً");
      router.replace(`/welcome?redirect=/invite/${roomId}`);
      return;
    }

    try {
      await joinAsViewerMutation.mutateAsync({
        roomId,
        username,
        avatar: avatar || "male",
        userId,
      });
      router.replace(`/room/${roomId}?role=viewer`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "حدث خطأ";
      Alert.alert("خطأ", errorMessage);
    }
  };

  // Show loading while auto-joining
  if (isAutoJoining) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#8B4513" />
        <Text className="text-foreground mt-4">جاري الانضمام كضيف...</Text>
      </ScreenContainer>
    );
  }

  // Show loading while checking user status
  if (userLoading || isLoading) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#8B4513" />
        <Text className="text-foreground mt-4">جاري التحميل...</Text>
      </ScreenContainer>
    );
  }

  // If not logged in and not auto-joining, show loading (will be handled by useEffect)
  if (!username) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#8B4513" />
        <Text className="text-foreground mt-4">جاري التحضير...</Text>
      </ScreenContainer>
    );
  }

  if (error || !roomData) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center p-6">
        <MaterialIcons name="error-outline" size={64} color="#8B4513" />
        <Text className="text-xl font-bold text-foreground mt-4">الساحة غير موجودة</Text>
        <Text className="text-muted text-center mt-2">
          قد تكون الساحة قد أُغلقت أو الرابط غير صحيح
        </Text>
        <TouchableOpacity
          className="mt-6 px-6 py-3 rounded-full"
          style={{ backgroundColor: "#D4A574" }}
          onPress={() => router.replace("/(tabs)")}
        >
          <Text className="text-white font-semibold">العودة للرئيسية</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  const inviterName = inviter || "شخص ما";
  const playerCount = roomData.participants?.filter((p: { role: string }) => p.role === "player").length || 0;
  const isRoomFull = playerCount >= 2;

  return (
    <ImageBackground source={welcomeBackground} style={{ flex: 1 }} resizeMode="cover">
      <ScreenContainer className="flex-1 p-6">
        <View className="flex-1 items-center justify-center">
          {/* Invitation Card */}
          <View 
            className="w-full max-w-sm rounded-3xl p-6"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.95)" }}
          >
            {/* Header */}
            <View className="items-center mb-6">
              <MaterialIcons name="mail" size={48} color="#8B4513" />
              <Text className="text-2xl font-bold text-foreground mt-4 text-center">
                دعوة للانضمام
              </Text>
              <Text className="text-muted text-sm mt-2">مرحباً {username}</Text>
            </View>

            {/* Invitation Details */}
            <View className="bg-surface rounded-2xl p-4 mb-6">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-muted text-sm">اسم الساحة:</Text>
                <Text className="text-foreground font-semibold">{roomData.name}</Text>
              </View>
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-muted text-sm">الداعي:</Text>
                <Text className="text-foreground font-semibold">{inviterName}</Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-muted text-sm">اللاعبون:</Text>
                <Text className="text-foreground font-semibold">{playerCount}/2</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View className="gap-3">
              <TouchableOpacity
                className={`py-4 rounded-full items-center ${isRoomFull ? "opacity-50" : ""}`}
                style={{ backgroundColor: "#8B4513" }}
                onPress={handleJoinAsPlayer}
                disabled={isRoomFull || requestJoinMutation.isPending}
              >
                <View className="flex-row items-center gap-2">
                  <MaterialIcons name="sports-esports" size={24} color="white" />
                  <Text className="text-white font-bold text-lg">
                    {requestJoinMutation.isPending ? "جاري الانضمام..." : "انضم كلاعب"}
                  </Text>
                </View>
                {isRoomFull && (
                  <Text className="text-white/70 text-xs mt-1">الساحة ممتلئة</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                className="py-4 rounded-full items-center border-2"
                style={{ borderColor: "#8B4513" }}
                onPress={handleJoinAsViewer}
                disabled={joinAsViewerMutation.isPending}
              >
                <View className="flex-row items-center gap-2">
                  <MaterialIcons name="visibility" size={24} color="#8B4513" />
                  <Text className="font-bold text-lg" style={{ color: "#8B4513" }}>
                    {joinAsViewerMutation.isPending ? "جاري الانضمام..." : "انضم كمشاهد"}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Back Button */}
          <TouchableOpacity
            className="mt-6 flex-row items-center gap-2"
            onPress={() => router.replace("/(tabs)")}
          >
            <MaterialIcons name="arrow-back" size={20} color="#8B4513" />
            <Text style={{ color: "#8B4513" }}>العودة للرئيسية</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    </ImageBackground>
  );
}
