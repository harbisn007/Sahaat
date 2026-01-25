import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Alert, FlatList, Platform } from "react-native";
import { useAudioPlayer } from "expo-audio";
import { useLocalSearchParams, router } from "expo-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useUser } from "@/lib/user-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useAudioPlayerHook } from "@/hooks/use-audio-player";
import { useTaroukPlayer } from "@/hooks/use-tarouk-player";
import { useSheelohaPlayer } from "@/hooks/use-sheeloha-player";
import { RecordingButton } from "@/components/recording-button";
import { AudioMessage } from "@/components/audio-message";
import { MessageBubble } from "@/components/message-bubble";
import { ReactionMessage } from "@/components/reaction-message";
import { ReactionsPicker } from "@/components/reactions-picker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { username, userId } = useUser();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const roomId = parseInt(id || "0");
  const scrollViewRef = useRef<ScrollView>(null);

  // State
  const [userRole, setUserRole] = useState<"creator" | "player" | "viewer" | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [recordingType, setRecordingType] = useState<"comment" | "tarouk" | null>(null);
  const [savedRoomName, setSavedRoomName] = useState<string>("");
  // Clapping speed: 1 = every 1.15s (default), 2 = every 90ms, 3 = 3 claps + pause pattern
  const [clappingSpeed, setClappingSpeed] = useState<1 | 2 | 3>(1);
  // Track when user joined the room (persist across reloads)
  const [joinedAt, setJoinedAt] = useState<Date>(new Date());
  const [isJoinedAtLoaded, setIsJoinedAtLoaded] = useState(false);

  const { data: roomData, isLoading, refetch, error } = trpc.rooms.getById.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 3000 }
  );

  // Load joinedAt from AsyncStorage on mount
  useEffect(() => {
    const loadJoinedAt = async () => {
      try {
        const storageKey = `joinedAt_${roomId}_${userId}`;
        const stored = await AsyncStorage.getItem(storageKey);
        
        if (stored) {
          console.log("[RoomScreen] Loaded joinedAt from storage:", stored);
          setJoinedAt(new Date(stored));
        } else {
          // First time joining - save current time
          const now = new Date();
          await AsyncStorage.setItem(storageKey, now.toISOString());
          console.log("[RoomScreen] Saved new joinedAt to storage:", now.toISOString());
          setJoinedAt(now);
        }
        
        setIsJoinedAtLoaded(true);
      } catch (error) {
        console.error("[RoomScreen] Failed to load joinedAt:", error);
        setIsJoinedAtLoaded(true);
      }
    };
    
    if (roomId > 0 && userId > 0) {
      loadJoinedAt();
    }
  }, [roomId, userId]);

  // حفظ اسم الساحة عند أول تحميل
  useEffect(() => {
    if (roomData?.name && !savedRoomName) {
      setSavedRoomName(roomData.name);
    }
  }, [roomData?.name, savedRoomName]);

  // التحقق من حذف الساحة وإخراج المشاركين
  useEffect(() => {
    // إذا كان هناك خطأ أو لم تعد roomData موجودة بعد التحميل
    if (!isLoading && savedRoomName && !roomData) {
      Alert.alert(
        "تم إغلاق الساحة",
        `تم إغلاق ساحة: ${savedRoomName}`,
        [
          {
            text: "حسناً",
            onPress: () => router.replace("/"),
          },
        ],
        { cancelable: false }
      );
    }
  }, [isLoading, roomData, savedRoomName]);

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
  const createSheelohaBroadcastMutation = trpc.sheeloha.broadcast.useMutation();

  const { isRecording, isPreparing, formattedDuration, startRecording, stopRecording } =
    useAudioRecorder();
  const { isPlaying, currentUri, play, stop } = useAudioPlayerHook();
  // Sheeloha player - plays tarouk 3 times overlapping with distance effect
  const { 
    isPlaying: isSheelohaPlaying, 
    isProcessing: isSheelohaProcessing, 
    playSheeloha,
    stopSheeloha 
  } = useSheelohaPlayer();

  const { data: audioMessages, refetch: refetchAudio } = trpc.audio.list.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 5000 }
  );

  const { data: reactions, refetch: refetchReactions } = trpc.reactions.list.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 3000 }
  );

  const { data: sheelohaBroadcasts } = trpc.sheeloha.list.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 2000 } // Fast polling for real-time broadcast
  );

  // Filter messages: only show messages sent AFTER user joined
  // Wait until joinedAt is loaded from storage to avoid filtering issues
  const filteredAudioMessages = !isJoinedAtLoaded ? [] : (audioMessages || []).filter((msg) => {
    const messageTime = new Date(msg.createdAt).getTime();
    const joinTime = joinedAt.getTime();
    return messageTime >= joinTime;
  });

  const filteredReactions = !isJoinedAtLoaded ? [] : (reactions || []).filter((reaction) => {
    const reactionTime = new Date(reaction.createdAt).getTime();
    const joinTime = joinedAt.getTime();
    return reactionTime >= joinTime;
  });

  // Combine filtered audio messages and reactions into a single feed
  const combinedFeed = [
    ...filteredAudioMessages.map((msg) => ({
      type: "audio" as const,
      id: `audio-${msg.id}`,
      timestamp: msg.createdAt,
      username: msg.username,
      messageType: msg.messageType,
      audioUrl: msg.audioUrl,
      duration: msg.duration,
    })),
    ...filteredReactions.map((reaction) => ({
      type: "reaction" as const,
      id: `reaction-${reaction.id}`,
      timestamp: reaction.createdAt,
      username: reaction.username,
      reactionType: reaction.reactionType,
      createdAt: reaction.createdAt,
    })),
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Track played message IDs to avoid replaying
  const [playedMessageIds, setPlayedMessageIds] = useState<Set<number>>(new Set());
  // Reactions picker state
  const [isReactionsPickerOpen, setIsReactionsPickerOpen] = useState(false);

  // Compute last Tarouk URI directly from audioMessages
  // Filter tarouk messages first, then get the last one
  const lastTaroukUri = useMemo(() => {
    console.log("[RoomScreen] Computing lastTaroukUri...");
    if (!audioMessages || audioMessages.length === 0) {
      console.log("[RoomScreen] No audio messages");
      return null;
    }
    
    // Filter only tarouk messages
    const taroukMessages = audioMessages.filter(msg => msg.messageType === "tarouk");
    console.log("[RoomScreen] Tarouk messages count:", taroukMessages.length);
    
    if (taroukMessages.length === 0) {
      console.log("[RoomScreen] No tarouk messages found");
      return null;
    }
    
    // Get the FIRST tarouk message (most recent, since array is sorted desc by createdAt)
    const lastTarouk = taroukMessages[0];
    console.log("[RoomScreen] Last Tarouk:", {
      id: lastTarouk.id,
      audioUrl: lastTarouk.audioUrl,
      username: lastTarouk.username,
    });
    
    return lastTarouk.audioUrl;
  }, [audioMessages]); // Use full audioMessages as dependency to catch all changes

  // Auto-play new messages for ALL users (including sender)
  useEffect(() => {
    if (!filteredAudioMessages || filteredAudioMessages.length === 0 || !isJoinedAtLoaded) return;

    // Find all unplayed messages
    const unplayedMessages = filteredAudioMessages.filter(
      (msg) => !playedMessageIds.has(msg.id)
    );

    if (unplayedMessages.length === 0) return;

    // Play the first unplayed message
    const nextMessage = unplayedMessages[0];
    const messageTime = new Date(nextMessage.createdAt).getTime();
    const joinTime = joinedAt.getTime();
    
    // Only auto-play if message was sent AFTER user joined
    if (messageTime >= joinTime) {
      console.log("[RoomScreen] Auto-playing new message:", {
        id: nextMessage.id,
        username: nextMessage.username,
        messageType: nextMessage.messageType,
      });
      setPlayedMessageIds(prev => new Set(prev).add(nextMessage.id));
      play(nextMessage.audioUrl);
    } else {
      console.log("[RoomScreen] Skipping old message (before join):", nextMessage.id);
      // Mark as "played" to avoid checking again
      setPlayedMessageIds(prev => new Set(prev).add(nextMessage.id));
    }
  }, [filteredAudioMessages, playedMessageIds, play, isJoinedAtLoaded, joinedAt]);

  // Listen for sheeloha broadcasts and auto-play for ALL users
  const [playedBroadcastIds, setPlayedBroadcastIds] = useState<Set<number>>(new Set());
  
  // Auto-play sheeloha broadcasts from OTHER users only
  // The person who pressed the button already played it locally
  useEffect(() => {
    if (!sheelohaBroadcasts || sheelohaBroadcasts.length === 0) return;

    // Get the latest broadcast
    const latestBroadcast = sheelohaBroadcasts[0]; // Already sorted by desc(createdAt)

    // Check if it's a new broadcast that hasn't been played yet
    // AND it's not from the current user (they already played it locally)
    if (
      latestBroadcast &&
      !playedBroadcastIds.has(latestBroadcast.id) &&
      latestBroadcast.userId !== userId // Skip if it's from current user
    ) {
      console.log("[RoomScreen] Auto-playing sheeloha broadcast from other user:", {
        id: latestBroadcast.id,
        audioUrl: latestBroadcast.audioUrl,
        username: latestBroadcast.username,
        broadcastUserId: latestBroadcast.userId,
        currentUserId: userId
      });
      
      // Mark as played and clear old IDs (keep only the latest 5)
      setPlayedBroadcastIds(prev => {
        const newSet = new Set(prev).add(latestBroadcast.id);
        if (newSet.size > 5) {
          const arr = Array.from(newSet);
          return new Set(arr.slice(-5));
        }
        return newSet;
      });
      
      // Play sheeloha effect (5 overlapping copies with distance effect)
      // Use medium speed (2) as default for broadcasts from other users
      playSheeloha(latestBroadcast.audioUrl, 2);
    } else if (latestBroadcast && latestBroadcast.userId === userId && !playedBroadcastIds.has(latestBroadcast.id)) {
      // Mark own broadcast as played without playing (already played locally)
      console.log("[RoomScreen] Skipping own sheeloha broadcast (already played locally)");
      setPlayedBroadcastIds(prev => new Set(prev).add(latestBroadcast.id));
    }
  }, [sheelohaBroadcasts, playedBroadcastIds, playSheeloha, userId]);

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
      if (participant) {
        console.log("[RoomScreen] Participant found:", participant);
        setUserRole(participant.role);
        setIsApproved(participant.status === "accepted");
        console.log("[RoomScreen] Role:", participant.role, "Status:", participant.status, "Approved:", participant.status === "accepted");
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
      
      // Reject the request - this will convert the player to a viewer
      await respondToRequestMutation.mutateAsync({
        participantId,
        accept: false,
      });
      console.log("[RoomScreen] Request rejected, participant converted to viewer");
      
      await refetch();
      await refetchRequests();
      Alert.alert("تم الرفض", "تم رفض الطلب. المستخدم الآن مشاهد");
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

  const handleCancelRecording = async () => {
    console.log("[RoomScreen] Canceling recording...");
    try {
      // Stop recording without saving
      await stopRecording();
      setRecordingType(null);
      console.log("[RoomScreen] Recording canceled successfully");
    } catch (error) {
      console.error("[RoomScreen] Error canceling recording:", error);
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
    if (!username) {
      console.error("[RoomScreen] Cannot send reaction: username is missing");
      Alert.alert("خطأ", "الاسم غير موجود");
      return;
    }

    try {
      console.log("[RoomScreen] Sending reaction:", {
        reactionType,
        roomId,
        userId,
        username,
      });
      
      const result = await createReactionMutation.mutateAsync({
        roomId,
        userId,
        username,
        reactionType: reactionType as any,
      });
      
      console.log("[RoomScreen] Reaction sent successfully:", result);
      
      // Refetch reactions immediately to show the new reaction
      await refetchReactions();
      console.log("[RoomScreen] Reactions refetched");
    } catch (error: any) {
      console.error("[RoomScreen] Failed to send reaction:", error);
      console.error("[RoomScreen] Error details:", {
        message: error?.message,
        cause: error?.cause,
        stack: error?.stack,
      });
      
      const errorMessage = error?.message || "خطأ غير معروف";
      Alert.alert("فشل إرسال التفاعل", errorMessage);
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
  // isPlayer includes creator OR approved player
  const isPlayer = isCreator || (userRole === "player" && isApproved);
  const isViewer = userRole === "viewer";
  
  console.log("[RoomScreen] Render - userRole:", userRole, "isApproved:", isApproved, "isPlayer:", isPlayer);

  return (
    <ScreenContainer 
      className="p-0" 
      containerClassName="bg-[#4A3728]"
      style={{ backgroundImage: 'url(/assets/images/background-pattern.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
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
      <View 
        className="flex-1 px-4 pt-4 mx-4 mb-2 rounded-lg"
        style={{
          borderWidth: 2,
          borderColor: "#FFD700", // ذهبي
        }}
      >
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
            contentContainerStyle={{ paddingBottom: 8, paddingHorizontal: 8 }}
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
          paddingTop: 8,
          paddingBottom: Platform.OS === "web" ? 8 : Math.max(insets.bottom + 4, 16),
        }}
      >
        <View className="flex-row items-start gap-2 justify-center">
          {/* Left: Sheeloha & Khalloha (Players only) */}
          {isPlayer && (
            <View className="flex-row gap-2 flex-1">
              {/* Clapping Speed Options - vertical layout aligned with Sheeloha button */}
              <View style={{ alignItems: 'center', justifyContent: 'flex-start' }}>
                <Text 
                  style={{ 
                    color: colors.muted,
                    fontSize: 7,
                    fontWeight: '900',
                    textAlign: 'center',
                    marginBottom: 2,
                    opacity: 0,
                  }}
                >
                  .
                </Text>
                <View style={{ flexDirection: 'column', gap: 2, height: 60, justifyContent: 'space-between' }}>
                  {[1, 2, 3].map((speed) => (
                    <TouchableOpacity
                      key={speed}
                      onPress={() => setClappingSpeed(speed as 1 | 2 | 3)}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        backgroundColor: clappingSpeed === speed ? '#FFD700' : '#5D4037',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: clappingSpeed === speed ? 0 : 1,
                        borderColor: '#8B7355',
                      }}
                    >
                      <Text 
                        style={{ 
                          color: clappingSpeed === speed ? '#5D4037' : '#FFD700',
                          fontSize: 10,
                          fontWeight: '900',
                        }}
                      >
                        {speed === 1 ? '١' : speed === 2 ? '٢' : '٣'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text 
                  style={{ 
                    color: colors.muted,
                    fontSize: 7,
                    fontWeight: '900',
                    textAlign: 'center',
                    marginTop: 4,
                  }}
                >
                  الصفقة
                </Text>
              </View>

              {/* Sheeloha Button */}
              <View className="flex-1 items-center">
                <TouchableOpacity
                  className="rounded items-center justify-center"
                  style={{
                    backgroundColor: "#5D4037",
                    opacity: (!lastTaroukUri || isSheelohaProcessing) ? 0.5 : 1,
                    width: '100%',
                    paddingVertical: 8,
                    paddingHorizontal: 4,
                    minHeight: 60,
                    borderRadius: 8,
                  }}
                  onPress={async () => {
                  console.log("[RoomScreen] Sheeloha button pressed");
                  console.log("[RoomScreen] Current lastTaroukUri:", lastTaroukUri);
                  if (!lastTaroukUri) {
                    Alert.alert("تنبيه", "لا توجد رسائل طاروق");
                    return;
                  }
                  if (!username) {
                    Alert.alert("خطأ", "يجب تسجيل الدخول");
                    return;
                  }
                  
                  try {
                    console.log("[RoomScreen] Playing sheeloha effect (3 overlapping copies)");
                    // Play sheeloha effect immediately with selected clapping speed
                    playSheeloha(lastTaroukUri!, clappingSpeed);
                    
                    // Also broadcast to other users
                    console.log("[RoomScreen] Broadcasting sheeloha to all users");
                    await createSheelohaBroadcastMutation.mutateAsync({
                      roomId,
                      userId,
                      username,
                      audioUrl: lastTaroukUri!,
                    });
                    console.log("[RoomScreen] Sheeloha broadcast created successfully");
                  } catch (error) {
                    console.error("[RoomScreen] Failed to broadcast sheeloha:", error);
                    Alert.alert("خطأ", "فشل بث شيلوها");
                  }
                  }}
                  disabled={isSheelohaProcessing}
                >
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    <MaterialCommunityIcons name="hand-clap" size={24} color="#FFD700" />
                    <MaterialCommunityIcons name="hand-clap" size={24} color="#FFD700" />
                  </View>
                </TouchableOpacity>
                <Text 
                  style={{ 
                    color: colors.muted,
                    fontSize: 9,
                    fontWeight: '900',
                    textAlign: 'center',
                    marginTop: 4,
                  }}
                >
                  شيلوها
                </Text>
              </View>

              {/* Khalloha Button */}
              <View className="flex-1 items-center">
                <TouchableOpacity
                  className="rounded items-center justify-center"
                  style={{
                    backgroundColor: "#5D4037",
                    opacity: isSheelohaPlaying ? 1 : 0.5,
                    width: '100%',
                    paddingVertical: 8,
                    paddingHorizontal: 4,
                    minHeight: 60,
                    borderRadius: 8,
                  }}
                  onPress={() => {
                  if (isSheelohaPlaying) {
                    stopSheeloha();
                  } else {
                    stop();
                  }
                  }}
                >
                  <MaterialIcons name="pan-tool" size={28} color="#FFD700" />
                </TouchableOpacity>
                <Text 
                  style={{ 
                    color: colors.muted,
                    fontSize: 9,
                    fontWeight: '900',
                    textAlign: 'center',
                    marginTop: 4,
                  }}
                >
                  خلوها
                </Text>
              </View>
            </View>
          )}

          {/* Center: Reactions Button (for all users) */}
          <View className="items-center">
            <TouchableOpacity
              className="rounded items-center justify-center"
              style={{
                backgroundColor: "#5D4037",
                width: 50,
                minHeight: 60,
                borderRadius: 8,
              }}
              onPress={() => setIsReactionsPickerOpen(true)}
            >
                  <MaterialIcons name="emoji-emotions" size={28} color="#FFD700" />
            </TouchableOpacity>
          </View>

          {/* Right: Comment & Tarouk (Players only) */}
          {isPlayer && (
            <View className="flex-row gap-2 flex-1">
              <View className="flex-1 items-center">
                <RecordingButton
                  isRecording={isRecording && recordingType === "comment"}
                  isPreparing={isPreparing}
                  pressAndHold={true}
                  onPressIn={() => handleStartRecording("comment")}
                  onPressOut={() => handleStopRecording()}
                  onCancelRecording={handleCancelRecording}
                  recordingDuration={formattedDuration}
                  iconComponent={
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <MaterialIcons name="music-note" size={22} color="#FFD700" />
                      <MaterialIcons name="chat" size={22} color="#FFD700" />
                    </View>
                  }
                  label=""
                  showLabel={false}
                  backgroundColor="#5D4037"
                  minHeight={60}
                />
                <Text 
                  style={{ 
                    color: colors.muted,
                    fontSize: 8,
                    fontWeight: '900',
                    textAlign: 'center',
                    marginTop: 4,
                  }}
                >
                  للتعليقات والموال
                </Text>
              </View>

              <View className="flex-1 items-center">
                <RecordingButton
                  isRecording={isRecording && recordingType === "tarouk"}
                  isPreparing={isPreparing}
                  pressAndHold={true}
                  onPressIn={() => handleStartRecording("tarouk")}
                  onPressOut={() => handleStopRecording()}
                  onCancelRecording={handleCancelRecording}
                  backgroundColor="#5D4037"
                  recordingDuration={formattedDuration}
                  iconComponent={
                    <MaterialCommunityIcons name="microphone-variant" size={28} color="#FFD700" />
                  }
                  label=""
                  showLabel={false}
                  minHeight={60}
                />
                <Text 
                  style={{ 
                    color: colors.muted,
                    fontSize: 9,
                    fontWeight: '900',
                    textAlign: 'center',
                    marginTop: 4,
                  }}
                >
                  للطاروق
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Reactions Picker Modal */}
      <ReactionsPicker
        visible={isReactionsPickerOpen}
        onClose={() => setIsReactionsPickerOpen(false)}
        onSelect={handleReaction}
      />
    </ScreenContainer>
  );
}
