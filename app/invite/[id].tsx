import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, ImageBackground, Alert, ActivityIndicator, TextInput, Image, Modal } from "react-native";
import { useEffect, useState, useRef } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useUser } from "@/lib/user-context";
import { useColors } from "@/hooks/use-colors";
import { MaterialIcons } from "@expo/vector-icons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as ImagePicker from "expo-image-picker";
import type { AvatarType } from "@/lib/user-context";
import { signInWithGoogle, signInWithApple, isGoogleAuthConfigured, isAppleAuthConfigured } from "@/lib/auth-service";
import { Platform } from "react-native";

const welcomeBackground = require("@/assets/images/welcome-background.png");
const avatarMale = require("@/assets/images/avatar-male.png");
const avatarFemale = require("@/assets/images/avatar-female.png");

export default function InviteScreen() {
  const { id, inviter } = useLocalSearchParams<{ id: string; inviter?: string }>();
  const router = useRouter();
  const colors = useColors();
  const { 
    username, 
    avatar, 
    userId, 
    accountType,
    isLoading: userLoading, 
    loginAsGuest,
    loginWithGoogle,
    loginWithApple,
    setUserData 
  } = useUser();
  const roomId = parseInt(id || "0", 10);
  const [isAutoJoining, setIsAutoJoining] = useState(false);
  const autoJoinAttempted = useRef(false);
  
  // حالة تعديل بيانات الضيف
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState<AvatarType | null>(null);
  const [customAvatarUri, setCustomAvatarUri] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);

  // التحقق من توفر Google/Apple
  const googleConfigured = isGoogleAuthConfigured();
  const appleConfigured = isAppleAuthConfigured();

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
      
      // If already logged in, redirect to room directly
      if (username && userId) {
        autoJoinAttempted.current = true;
        // المستخدم المسجل يدخل مباشرة كمشاهد
        try {
          await joinAsViewerMutation.mutateAsync({
            roomId,
            username,
            avatar: avatar || "male",
            userId,
          });
          router.replace(`/room/${roomId}?role=viewer`);
        } catch (err) {
          console.error("[InviteScreen] Join as viewer failed:", err);
          router.replace(`/room/${roomId}?role=viewer`);
        }
        return;
      }
      
      // Wait for room data
      if (isLoading || !roomData) return;
      
      autoJoinAttempted.current = true;
      setIsAutoJoining(true);
      
      try {
        // Create guest name: "ضيف + inviter name" or "ضيف"
        const inviterName = inviter || "";
        const guestName = inviterName ? `ضيف ${inviterName}` : `ضيف ${roomId}`;
        const guestAvatar: AvatarType = "male"; // Default to male avatar
        
        console.log("[InviteScreen] Creating guest account:", guestName);
        
        // Set user data as guest
        await loginAsGuest(guestName, guestAvatar);
        
        // Wait a bit for the user data to be saved
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log("[InviteScreen] Guest account created, redirecting to room as viewer");
        
        // Redirect to room - the room will handle joining as viewer
        router.replace(`/room/${roomId}?role=viewer&autoJoin=true&isGuest=true`);
      } catch (err) {
        console.error("[InviteScreen] Auto-join failed:", err);
        setIsAutoJoining(false);
        // Fallback to manual login
        router.replace(`/welcome?redirect=/invite/${roomId}${inviter ? `&inviter=${inviter}` : ""}`);
      }
    };
    
    autoJoinAsGuest();
  }, [userLoading, username, userId, isLoading, roomData, inviter, roomId, loginAsGuest, router, avatar, joinAsViewerMutation]);

  // دوال تعديل بيانات الضيف
  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert("خطأ", "يجب السماح بالوصول إلى الصور");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setCustomAvatarUri(uri);
        setEditAvatar(uri);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("خطأ", "حدث خطأ أثناء اختيار الصورة");
    }
  };

  const handleUpdateAsGuest = async () => {
    if (!editName.trim() || editName.trim().length < 3) {
      Alert.alert("خطأ", "يجب إدخال اسم (3 حروف على الأقل)");
      return;
    }
    if (!editAvatar) {
      Alert.alert("خطأ", "يجب اختيار صورة شخصية");
      return;
    }

    setIsUpdating(true);
    try {
      await loginAsGuest(editName.trim(), editAvatar);
      setShowEditModal(false);
      // تحديث البيانات في الساحة
      Alert.alert("تم", "تم تحديث بياناتك بنجاح");
    } catch (error) {
      Alert.alert("خطأ", "حدث خطأ أثناء التحديث");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateWithGoogle = async () => {
    if (!googleConfigured) {
      Alert.alert("غير متاح", "تسجيل الدخول بـ Google غير مُعد حالياً");
      return;
    }

    setIsGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      
      if (result.success) {
        const name = editName.trim() || result.name || "مستخدم Google";
        const avatarToUse = editAvatar || result.avatar || "male";
        
        await loginWithGoogle(result.userId, name, avatarToUse);
        setShowEditModal(false);
        Alert.alert("تم", "تم تسجيل الدخول بـ Google بنجاح");
      } else if (result.error !== 'تم إلغاء تسجيل الدخول') {
        Alert.alert("خطأ", result.error || "فشل تسجيل الدخول");
      }
    } catch (error) {
      Alert.alert("خطأ", "حدث خطأ أثناء تسجيل الدخول بـ Google");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleUpdateWithApple = async () => {
    if (!appleConfigured) {
      Alert.alert("غير متاح", "تسجيل الدخول بـ Apple غير مُعد حالياً");
      return;
    }

    if (Platform.OS === 'android') {
      Alert.alert("غير متاح", "تسجيل الدخول بـ Apple متاح فقط على iOS");
      return;
    }

    setIsAppleLoading(true);
    try {
      const result = await signInWithApple();
      
      if (result.success) {
        const name = editName.trim() || "مستخدم Apple";
        const avatarToUse = editAvatar || "male";
        
        await loginWithApple(result.userId, name, avatarToUse);
        setShowEditModal(false);
        Alert.alert("تم", "تم تسجيل الدخول بـ Apple بنجاح");
      } else if (result.error !== 'تم إلغاء تسجيل الدخول') {
        Alert.alert("خطأ", result.error || "فشل تسجيل الدخول");
      }
    } catch (error) {
      Alert.alert("خطأ", "حدث خطأ أثناء تسجيل الدخول بـ Apple");
    } finally {
      setIsAppleLoading(false);
    }
  };

  const handleJoinAsPlayer = async () => {
    if (!username || !userId) {
      Alert.alert("خطأ", "يرجى تسجيل الاسم أولاً");
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

  const openEditModal = () => {
    setEditName(username || "");
    setEditAvatar(avatar || null);
    if (avatar && avatar !== 'male' && avatar !== 'female') {
      setCustomAvatarUri(avatar);
    } else {
      setCustomAvatarUri(null);
    }
    setShowEditModal(true);
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
  const isGuestUser = accountType === 'guest';
  const anyLoading = isUpdating || isGoogleLoading || isAppleLoading;

  return (
    <ImageBackground source={welcomeBackground} style={{ flex: 1 }} resizeMode="cover">
      <ScreenContainer className="flex-1 p-6">
        {/* شريط تعديل البيانات للضيوف فقط */}
        {isGuestUser && (
          <TouchableOpacity
            className="absolute top-4 left-4 right-4 z-10 flex-row items-center justify-center gap-2 py-2 px-4 rounded-full"
            style={{ backgroundColor: "rgba(139, 69, 19, 0.9)" }}
            onPress={openEditModal}
          >
            <MaterialIcons name="edit" size={18} color="white" />
            <Text className="text-white text-sm font-semibold">تغيير الاسم وبيانات الدخول</Text>
          </TouchableOpacity>
        )}

        <View className="flex-1 items-center justify-center">
          {/* Invitation Card */}
          <View 
            className="w-full max-w-sm rounded-3xl p-6"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.95)", marginTop: isGuestUser ? 40 : 0 }}
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
                    {requestJoinMutation.isPending ? "جاري الطلب..." : "طلب الانضمام كلاعب"}
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

        {/* Modal تعديل بيانات الضيف */}
        <Modal
          visible={showEditModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowEditModal(false)}
        >
          <View className="flex-1 justify-center items-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <View className="w-11/12 max-w-sm bg-surface rounded-2xl p-6">
              <Text className="text-lg font-bold text-foreground text-center mb-4">
                تعديل بيانات الدخول
              </Text>

              {/* Avatar Selection */}
              <Text className="text-sm text-muted mb-3 text-center">
                اختر صورتك الشخصية
              </Text>
              
              <View className="flex-row justify-center items-center gap-4 mb-4">
                <TouchableOpacity
                  onPress={() => { setEditAvatar('male'); setCustomAvatarUri(null); }}
                  disabled={anyLoading}
                  style={{
                    borderWidth: 3,
                    borderColor: editAvatar === 'male' ? colors.primary : 'transparent',
                    borderRadius: 35,
                    padding: 2,
                    opacity: anyLoading ? 0.5 : 1,
                  }}
                >
                  <Image source={avatarMale} style={{ width: 50, height: 50, borderRadius: 25 }} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => { setEditAvatar('female'); setCustomAvatarUri(null); }}
                  disabled={anyLoading}
                  style={{
                    borderWidth: 3,
                    borderColor: editAvatar === 'female' ? colors.primary : 'transparent',
                    borderRadius: 35,
                    padding: 2,
                    opacity: anyLoading ? 0.5 : 1,
                  }}
                >
                  <Image source={avatarFemale} style={{ width: 50, height: 50, borderRadius: 25 }} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handlePickImage}
                  disabled={anyLoading}
                  style={{
                    borderWidth: 3,
                    borderColor: customAvatarUri ? colors.primary : 'transparent',
                    borderRadius: 35,
                    padding: 2,
                    opacity: anyLoading ? 0.5 : 1,
                  }}
                >
                  {customAvatarUri ? (
                    <Image source={{ uri: customAvatarUri }} style={{ width: 50, height: 50, borderRadius: 25 }} />
                  ) : (
                    <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={{ fontSize: 18 }}>📷</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Name Input */}
              <TextInput
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground text-base mb-4"
                placeholder="اسمك هنا"
                placeholderTextColor={colors.muted}
                value={editName}
                onChangeText={setEditName}
                maxLength={20}
                editable={!anyLoading}
                style={{ textAlign: "right" }}
              />

              {/* Login Options */}
              <View className="gap-3">
                {/* Guest Button */}
                <TouchableOpacity
                  className="py-3 rounded-xl items-center"
                  style={{ backgroundColor: colors.primary, opacity: anyLoading ? 0.5 : 1 }}
                  onPress={handleUpdateAsGuest}
                  disabled={anyLoading}
                >
                  {isUpdating ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <Text className="text-background font-semibold">تحديث كضيف</Text>
                  )}
                </TouchableOpacity>

                {/* Separator */}
                <View className="flex-row items-center gap-2">
                  <View className="flex-1 h-px bg-border" />
                  <Text className="text-muted text-sm">أو سجّل بحساب</Text>
                  <View className="flex-1 h-px bg-border" />
                </View>

                {/* Social Buttons */}
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    className="flex-1 py-3 rounded-xl items-center justify-center flex-row gap-2"
                    style={{ backgroundColor: googleConfigured ? '#4285F4' : colors.border, opacity: anyLoading ? 0.5 : 1 }}
                    onPress={handleUpdateWithGoogle}
                    disabled={anyLoading}
                  >
                    {isGoogleLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="google" size={20} color="#fff" />
                        <Text className="text-white font-semibold">Google</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {Platform.OS !== 'android' && (
                    <TouchableOpacity
                      className="flex-1 py-3 rounded-xl items-center justify-center flex-row gap-2"
                      style={{ backgroundColor: appleConfigured ? '#000' : colors.border, opacity: anyLoading ? 0.5 : 1 }}
                      onPress={handleUpdateWithApple}
                      disabled={anyLoading}
                    >
                      {isAppleLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="apple" size={20} color="#fff" />
                          <Text className="text-white font-semibold">Apple</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Cancel Button */}
              <TouchableOpacity
                className="mt-4 py-2 items-center"
                onPress={() => setShowEditModal(false)}
                disabled={anyLoading}
              >
                <Text className="text-muted">إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScreenContainer>
    </ImageBackground>
  );
}
