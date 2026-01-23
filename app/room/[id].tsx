import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Alert, FlatList, Platform } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/screen-container";
import { useUser } from "@/lib/user-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useAudioPlayerHook } from "@/hooks/use-audio-player";
import { useTaroukPlayer } from "@/hooks/use-tarouk-player";
import { RecordingButton } from "@/components/recording-button";
import { AudioMessage } from "@/components/audio-message";
import { MessageBubble } from "@/components/message-bubble";
import { ReactionMessage } from "@/components/reaction-message";
import { ReactionsPicker } from "@/components/reactions-picker";

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { username, userId } = useUser();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const roomId = parseInt(id || "0");
  const scrollViewRef = useRef<ScrollView>(null);

  const { data: roomData, isLoading, refetch } = trpc.rooms.getById.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 3000 }
  );

  const { data: pendingRequests, refetch: refetchRequests } = trpc.rooms.getPendingRequests.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 3000 }
  );

  const respondToRequestMutation = trpc.rooms.respondToRequest.useMutation();
  const leaveRoomMutation = trpc.rooms.leaveRoom.useMutation();
  const deleteRoomMutation = trpc.rooms.deleteRoom.useMutation();
  const createReactionMutation = trpc.reactions.create.useMutation();
  const createAudioMutation = trpc.audio.create.useMutation();
  const uploadAudioMutation = trpc.uploadAudio.useMutation();

  const [userRole, setUserRole] = useState<"creator" | "player" | "viewer" | null>(null);
  const [recordingType, setRecordingType] = useState<"comment" | "tarouk" | null>(null);

  const { isRecording, isPreparing, formattedDuration, startRecording, stopRecording } =
    useAudioRecorder();
  const { isPlaying, currentUri, play, stop } = useAudioPlayerHook();
  const { 
    isPlaying: isSheelohaPlaying, 
    isProcessing: isSheelohaProcessing, 
    playTarouk: playSheeloha, 
    stopTarouk: stopSheeloha 
  } = useTaroukPlayer();

  const { data: audioMessages, refetch: refetchAudio } = trpc.audio.list.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 5000 }
  );

  const { data: reactions, refetch: refetchReactions } = trpc.reactions.list.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 3000 }
  );

  // Combine audio messages and reactions into a single feed
  const combinedFeed = [
    ...(audioMessages || []).map((msg) => ({
      type: "audio" as const,
      id: `audio-${msg.id}`,
      timestamp: msg.createdAt,
      username: msg.username,
      messageType: msg.messageType,
      audioUrl: msg.audioUrl,
      duration: msg.duration,
    })),
    ...(reactions || []).map((reaction) => ({
      type: "reaction" as const,
      id: `reaction-${reaction.id}`,
      timestamp: reaction.createdAt,
      username: reaction.username,
      reactionType: reaction.reactionType,
      createdAt: reaction.createdAt,
    })),
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Track the last Tarouk message URI
  const [lastTaroukUri, setLastTaroukUri] = useState<string | null>(null);
  // Track the last played message ID to avoid replaying
  const [lastPlayedMessageId, setLastPlayedMessageId] = useState<number | null>(null);
  // Reactions picker state
  const [showReactionsPicker, setShowReactionsPicker] = useState(false);

  // Update last Tarouk URI when audio messages change
  useEffect(() => {
    console.log("[RoomScreen] useEffect triggered - audioMessages changed");
    if (audioMessages && audioMessages.length > 0) {
      const taroukMessages = audioMessages.filter(msg => msg.messageType === "tarouk");
      console.log("[RoomScreen] Total audio messages:", audioMessages.length);
      console.log("[RoomScreen] Tarouk messages count:", taroukMessages.length);
      console.log("[RoomScreen] All tarouk messages:", taroukMessages.map(m => ({
        id: m.id,
        username: m.username,
        audioUrl: m.audioUrl.substring(0, 50) + "..."
      })));
      if (taroukMessages.length > 0) {
        const lastTarouk = taroukMessages[taroukMessages.length - 1];
        console.log("[RoomScreen] Setting lastTaroukUri to:", {
          id: lastTarouk.id,
          audioUrl: lastTarouk.audioUrl,
          username: lastTarouk.username,
          createdAt: lastTarouk.createdAt
        });
        setLastTaroukUri(lastTarouk.audioUrl);
      } else {
        console.log("[RoomScreen] No tarouk messages found");
      }
    } else {
      console.log("[RoomScreen] No audio messages or empty array");
    }
  }, [audioMessages]);

  // Auto-play new messages for ALL users (including sender)
  useEffect(() => {
    if (!audioMessages || audioMessages.length === 0) return;

    // Get the latest message
    const latestMessage = audioMessages[audioMessages.length - 1];

    // Check if it's a new message that hasn't been played yet
    if (
      latestMessage &&
      latestMessage.id !== lastPlayedMessageId
    ) {
      console.log("[RoomScreen] Auto-playing new message:", {
        id: latestMessage.id,
        audioUrl: latestMessage.audioUrl,
        username: latestMessage.username,
        messageType: latestMessage.messageType
      });
      // Auto-play the new message for everyone
      setLastPlayedMessageId(latestMessage.id);
      play(latestMessage.audioUrl);
    }
  }, [audioMessages, lastPlayedMessageId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (combinedFeed.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [combinedFeed.length]);

  useEffect(() => {
    if (roomData && username) {
      const participant = roomData.participants.find((p) => p.username === username);
      if (participant && participant.status === "accepted") {
        setUserRole(participant.role);
      }
    }
  }, [roomData, username]);

  const handleAcceptRequest = async (participantId: number) => {
    try {
      await respondToRequestMutation.mutateAsync({
        participantId,
        accept: true,
      });
      await refetch();
      await refetchRequests();
      Alert.alert("تم القبول", "تم قبول اللاعب بنجاح");
    } catch (error) {
      Alert.alert("خطأ", "حدث خطأ أثناء قبول الطلب");
    }
  };

  const handleRejectRequest = async (participantId: number) => {
    try {
      console.log("[RoomScreen] Rejecting request for participant:", participantId);
      
      // Find the participant to get their userId
      const participant = roomData?.participants.find(p => p.id === participantId);
      if (!participant) {
        Alert.alert("خطأ", "لم يتم العثور على المستخدم");
        return;
      }
      
      // First reject the request
      await respondToRequestMutation.mutateAsync({
        participantId,
        accept: false,
      });
      console.log("[RoomScreen] Request rejected, now removing participant from room");
      
      // Then remove the participant from the room completely
      await leaveRoomMutation.mutateAsync({
        roomId,
        userId: participant.userId,
      });
      console.log("[RoomScreen] Participant removed successfully");
      
      await refetch();
      await refetchRequests();
      Alert.alert("تم الرفض", "تم رفض الطلب وإخراج المستخدم من الغرفة");
    } catch (error) {
      console.error("[RoomScreen] Error rejecting request:", error);
      Alert.alert("خطأ", "حدث خطأ أثناء رفض الطلب");
    }
  };

  const handleLeaveRoom = async () => {
    Alert.alert(
      "مغادرة الساحة",
      "هل أنت متأكد من مغادرة الساحة؟",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "غادر",
          style: "destructive",
          onPress: async () => {
            try {
              await leaveRoomMutation.mutateAsync({ roomId, userId });
              router.replace("/");
            } catch (error) {
              Alert.alert("خطأ", "حدث خطأ أثناء مغادرة الساحة");
            }
          },
        },
      ]
    );
  };

  const handleDeleteRoom = async () => {
    Alert.alert(
      "إغلاق الجلسة",
      "هل أنت متأكد من إغلاق الجلسة؟",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "إغلاق",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteRoomMutation.mutateAsync({ roomId });
              router.replace("/");
            } catch (error) {
              Alert.alert("خطأ", "حدث خطأ أثناء إغلاق الجلسة");
            }
          },
        },
      ]
    );
  };

  const handleStartRecording = async (type: "comment" | "tarouk") => {
    console.log("[RoomScreen] handleStartRecording called with type:", type);
    setRecordingType(type);
    try {
      console.log("[RoomScreen] Calling startRecording...");
      const success = await startRecording();
      console.log("[RoomScreen] startRecording returned:", success);
      if (!success) {
        console.error("[RoomScreen] Recording failed");
        Alert.alert("خطأ", "فشل بدء التسجيل. تأكد من أذونات المايكروفون.");
        setRecordingType(null);
      }
    } catch (error) {
      console.error("[RoomScreen] Recording error:", error);
      const errorMessage = error instanceof Error ? error.message : "فشل بدء التسجيل";
      Alert.alert("خطأ", errorMessage);
      setRecordingType(null);
    }
  };

  const handleStopRecording = async () => {
    // Capture the current recording type before it gets reset
    const currentRecordingType = recordingType;
    
    if (!currentRecordingType) {
      return;
    }
    
    try {
      const recording = await stopRecording();
      
      if (recording && username) {
        let base64Data: string;
        
        if (Platform.OS === "web") {
          // Web: Convert Blob URL to base64
          const response = await fetch(recording.uri);
          const blob = await response.blob();
          const reader = new FileReader();
          
          base64Data = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              // Remove data URL prefix (e.g., "data:audio/webm;base64,")
              const base64 = result.split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } else {
          // Native: Read file as base64
          const FileSystem = await import("expo-file-system/legacy");
          base64Data = await FileSystem.readAsStringAsync(recording.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        
        // Upload to S3
        const { url } = await uploadAudioMutation.mutateAsync({
          base64Data,
          fileName: `recording-${Date.now()}.${Platform.OS === "web" ? "webm" : "m4a"}`,
        });
        
        // Save to database with S3 URL
        await createAudioMutation.mutateAsync({
          roomId,
          userId,
          username,
          messageType: currentRecordingType,
          audioUrl: url,
          duration: 0, // Duration will be calculated on playback
        });
        
        // Refresh audio messages
        await refetchAudio();
      }
    } catch (error) {
      console.error("Failed to save audio message:", error);
      Alert.alert("خطأ", "فشل حفظ الرسالة الصوتية");
    } finally {
      setRecordingType(null);
    }
  };

  const handleReaction = async (reactionType: string) => {
    if (!username) return;

    try {
      console.log("[RoomScreen] Sending reaction:", reactionType);
      await createReactionMutation.mutateAsync({
        roomId,
        userId,
        username,
        reactionType: reactionType as any,
      });
      console.log("[RoomScreen] Reaction sent successfully");
      // Refetch reactions immediately to show the new reaction
      await refetchReactions();
      console.log("[RoomScreen] Reactions refetched");
    } catch (error) {
      console.error("[RoomScreen] Failed to send reaction:", error);
      Alert.alert("خطأ", "فشل إرسال التفاعل");
    }
  };

  const handlePlayAudio = (uri: string) => {
    if (currentUri === uri && isPlaying) {
      stop();
    } else {
      play(uri);
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer>
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" />
        </View>
      </ScreenContainer>
    );
  }

  if (!roomData) {
    return (
      <ScreenContainer>
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-xl text-foreground mb-4">الساحة غير موجودة</Text>
          <TouchableOpacity
            className="bg-primary px-6 py-3 rounded-xl"
            onPress={() => router.back()}
          >
            <Text className="text-background font-semibold">العودة</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const isCreator = userRole === "creator";
  const isPlayer = userRole === "player" || isCreator;
  const isViewer = userRole === "viewer";

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="px-6 pt-4 pb-3 border-b border-border flex-row items-center justify-between">
        {/* Left: Exit/Close button */}
        {isCreator ? (
          <TouchableOpacity 
            onPress={handleDeleteRoom}
            className="px-3 py-1 rounded-lg"
            style={{ backgroundColor: colors.error }}
          >
            <Text className="text-background text-xs font-semibold">إغلاق</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            onPress={handleLeaveRoom}
            className="px-3 py-1 rounded-lg"
            style={{ backgroundColor: colors.error }}
          >
            <Text className="text-background text-xs font-semibold">خروج</Text>
          </TouchableOpacity>
        )}
        
        {/* Center: Room info */}
        <View className="flex-1">
          <Text className="text-xl font-bold text-foreground text-center">{roomData.name}</Text>
          <Text className="text-sm text-muted text-center">
            {roomData.acceptedPlayersCount}/2 لاعبين · {roomData.viewerCount} مشاهدين
          </Text>
        </View>
        
        {/* Right: Empty space for balance */}
        <View style={{ width: 60 }} />
      </View>

      {/* Pending Requests (Only for creator) */}
      {isCreator && pendingRequests && pendingRequests.length > 0 && (
        <View className="px-6 py-3 bg-warning/10 border-b border-warning/30">
          {pendingRequests.map((request) => (
            <View key={request.id} className="flex-row items-center justify-between mb-2">
              <Text className="text-foreground flex-1">
                طلب انضمام من: <Text className="font-bold">{request.username}</Text>
              </Text>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="bg-success px-4 py-2 rounded-lg"
                  onPress={() => handleAcceptRequest(request.id)}
                >
                  <Text className="text-background font-semibold text-sm">قبول</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="bg-error px-4 py-2 rounded-lg"
                  onPress={() => handleRejectRequest(request.id)}
                >
                  <Text className="text-background font-semibold text-sm">رفض</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Messages Feed - Takes most of the screen */}
      <View className="flex-1 px-4 pt-4">
        {/* Role Badge */}
        <View className="items-center mb-3">
          <View
            className="px-4 py-1 rounded-full"
            style={{
              backgroundColor: isCreator
                ? colors.primary
                : isPlayer
                ? colors.success
                : colors.muted,
            }}
          >
            <Text className="text-background font-semibold text-sm">
              {isCreator ? "🎮 منشئ" : isPlayer ? "🎮 لاعب" : "👁️ مشاهد"}
            </Text>
          </View>
        </View>

        {/* Messages ScrollView */}
        {combinedFeed.length > 0 ? (
          <ScrollView 
            ref={scrollViewRef}
            className="flex-1"
            showsVerticalScrollIndicator={true}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
              {combinedFeed.map((item) => {
                if (item.type === "audio") {
                  return (
                    <MessageBubble
                      key={item.id}
                      type="audio"
                      username={item.username}
                      messageType={item.messageType}
                      duration={item.duration}
                      isPlaying={currentUri === item.audioUrl && isPlaying}
                      onPlay={() => handlePlayAudio(item.audioUrl)}
                    />
                  );
                } else {
                  return (
                    <ReactionMessage
                      key={item.id}
                      username={item.username}
                      reactionType={item.reactionType}
                      createdAt={item.createdAt}
                      isOwnMessage={item.username === username}
                    />
                  );
                }
              })}
          </ScrollView>
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-muted text-center">
              💬 لم يتم إرسال رسائل بعد
            </Text>
          </View>
        )}
      </View>

      {/* Bottom Controls - Compact fixed bar */}
      {/* Players see all controls, Viewers see only reactions */}
      <View 
        className="bg-surface px-4 border-t border-border"
        style={{
          paddingTop: 12,
          paddingBottom: Platform.OS === "web" ? 12 : Math.max(insets.bottom + 8, 20),
        }}
      >
        <View className="flex-row items-center gap-2 justify-center">
          {/* Left: Sheeloha & Khalloha (Players only) */}
          {isPlayer && (
            <View className="flex-row gap-2 flex-1">
              {/* Sheeloha Button */}
              <TouchableOpacity
                className="rounded-lg py-2 px-3 items-center justify-center flex-1"
                style={{
                  backgroundColor: isSheelohaPlaying ? colors.error : colors.warning,
                  opacity: (!lastTaroukUri || isSheelohaProcessing) ? 0.5 : 1,
                }}
                onPress={() => {
                  console.log("[RoomScreen] Sheeloha button pressed");
                  console.log("[RoomScreen] Current lastTaroukUri:", lastTaroukUri);
                  if (!lastTaroukUri) {
                    Alert.alert("تنبيه", "لا توجد رسائل طاروق");
                    return;
                  }
                  if (isSheelohaPlaying) {
                    console.log("[RoomScreen] Stopping Sheeloha");
                    stopSheeloha();
                  } else {
                    console.log("[RoomScreen] Playing Sheeloha with URI:", lastTaroukUri);
                    playSheeloha(lastTaroukUri);
                  }
                }}
                disabled={isSheelohaProcessing}
              >
                <Text className="text-background font-bold text-xs">
                  {isSheelohaPlaying ? "⏸️" : "🔁"} شيلوها
                </Text>
              </TouchableOpacity>

              {/* Khalloha Button */}
              <TouchableOpacity
                className="rounded-lg py-2 px-3 items-center justify-center flex-1"
                style={{
                  backgroundColor: colors.error,
                  opacity: isSheelohaPlaying ? 1 : 0.5,
                }}
                onPress={() => {
                  if (isSheelohaPlaying) {
                    stopSheeloha();
                  } else {
                    stop();
                  }
                }}
              >
                <Text className="text-background font-bold text-xs">⏹️ خلوها</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Center: Reactions Button (for all users) */}
          <TouchableOpacity
            className="rounded-full w-12 h-12 items-center justify-center"
            style={{ backgroundColor: colors.primary }}
            onPress={() => setShowReactionsPicker(true)}
          >
            <Text className="text-2xl">😊</Text>
          </TouchableOpacity>

          {/* Right: Comment & Tarouk (Players only) */}
          {isPlayer && (
            <View className="flex-row gap-2 flex-1">
              <View className="flex-1">
                <RecordingButton
                  isRecording={isRecording && recordingType === "comment"}
                  isPreparing={isPreparing}
                  label="تعليق"
                  pressAndHold={true}
                  onPressIn={() => handleStartRecording("comment")}
                  onPressOut={() => handleStopRecording()}
                  recordingDuration={formattedDuration}
                  icon="🎙️"
                  iconSize={32}
                />
              </View>

              <View className="flex-1">
                <RecordingButton
                  isRecording={isRecording && recordingType === "tarouk"}
                  isPreparing={isPreparing}
                  label="طاروق"
                  pressAndHold={true}
                  onPressIn={() => handleStartRecording("tarouk")}
                  onPressOut={() => handleStopRecording()}
                  backgroundColor={colors.success}
                  recordingDuration={formattedDuration}
                  icon="🎤"
                  iconSize={48}
                />
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Reactions Picker Modal */}
      <ReactionsPicker
        visible={showReactionsPicker}
        onClose={() => setShowReactionsPicker(false)}
        onSelect={handleReaction}
      />
    </ScreenContainer>
  );
}
