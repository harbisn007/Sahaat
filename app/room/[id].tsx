import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Alert, FlatList, Platform } from "react-native";
import { useAudioPlayer } from "expo-audio";
import { useLocalSearchParams, router } from "expo-router";
import { Image, ImageBackground, Share } from "react-native";

// Room background image
const roomBackground = require("@/assets/images/room-background.png");
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
import { RecordingIndicator } from "@/components/recording-indicator";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { username, userId, avatar } = useUser();

  // Avatar images
  const avatarMale = require("@/assets/images/avatar-male.png");
  const avatarFemale = require("@/assets/images/avatar-female.png");

  // Helper function to get avatar source
  const getAvatarSource = (avatarValue: string | undefined | null) => {
    if (!avatarValue || avatarValue === "male") return avatarMale;
    if (avatarValue === "female") return avatarFemale;
    return { uri: avatarValue }; // Custom URL
  };
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const roomId = parseInt(id || "0");
  const scrollViewRef = useRef<ScrollView>(null);

  // State
  const [userRole, setUserRole] = useState<"creator" | "player" | "viewer" | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [recordingType, setRecordingType] = useState<"comment" | "tarouk" | null>(null);
  const [savedRoomName, setSavedRoomName] = useState<string>("");
  // Clapping speed: 0 = none (1.25x), 1 = every 1.27s (1.25x), 2 = every 1.12s (1.19x), 3 = every 0.7s (1.14x), 4 = none (1.00x normal)
  const [clappingSpeed, setClappingSpeed] = useState<0 | 1 | 2 | 3 | 4>(0);
  // Track when user joined the room (persist across reloads)
  const [joinedAt, setJoinedAt] = useState<Date>(new Date());
  const [isJoinedAtLoaded, setIsJoinedAtLoaded] = useState(false);

  const { data: roomData, isLoading, refetch, error } = trpc.rooms.getById.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 2000, retry: false }
  );

  // Update joinedAt to current time on every room entry
  useEffect(() => {
    const updateJoinedAt = async () => {
      try {
        const storageKey = `joinedAt_${roomId}_${userId}`;
        // Always update joinedAt to current time when entering the room
        // This ensures old messages don't play when returning to the room
        const now = new Date();
        await AsyncStorage.setItem(storageKey, now.toISOString());
        console.log("[RoomScreen] Updated joinedAt to current time:", now.toISOString());
        setJoinedAt(now);
        setIsJoinedAtLoaded(true);
      } catch (error) {
        console.error("[RoomScreen] Failed to update joinedAt:", error);
        setIsJoinedAtLoaded(true);
      }
    };
    
    if (roomId > 0 && userId > 0) {
      updateJoinedAt();
    }
  }, [roomId, userId]);

  // حفظ اسم الساحة عند أول تحميل
  useEffect(() => {
    if (roomData?.name && !savedRoomName) {
      setSavedRoomName(roomData.name);
    }
  }, [roomData?.name, savedRoomName]);

  // التحقق من حذف الساحة وإخراج المشاركين
  const [roomClosedAlertShown, setRoomClosedAlertShown] = useState(false);
  
  useEffect(() => {
    // إذا كان هناك خطأ أو لم تعد roomData موجودة بعد التحميل
    // وكان لدينا اسم الساحة محفوظاً (يعني كانت موجودة سابقاً)
    const roomNotFound = !isLoading && savedRoomName && (!roomData || error);
    
    if (roomNotFound && !roomClosedAlertShown) {
      console.log("[RoomScreen] Room closed detected - error:", error?.message, "roomData:", !!roomData);
      setRoomClosedAlertShown(true);
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
  }, [isLoading, roomData, savedRoomName, error, roomClosedAlertShown]);

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
  const createKhaloohaCommandMutation = trpc.khalooha.stop.useMutation();

  const { isRecording, isPreparing, formattedDuration, startRecording, stopRecording, requestPermissions } =
    useAudioRecorder();

  // Pre-initialize microphone when entering room (to avoid first-use failure)
  useEffect(() => {
    const initMicrophone = async () => {
      if (Platform.OS === "web") return;
      
      try {
        console.log("[RoomScreen] Pre-initializing microphone...");
        
        // Step 1: Request permissions
        const hasPermission = await requestPermissions();
        if (!hasPermission) {
          console.log("[RoomScreen] Permission not granted");
          return;
        }
        
        // Step 2: Initialize audio mode
        const { AudioModule } = await import("expo-audio");
        await AudioModule.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
        console.log("[RoomScreen] Audio mode initialized");
        
        // Step 3: Create and release a test recorder to warm up the system
        const { RecordingPresets } = await import("expo-audio");
        const testRecorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
        await testRecorder.prepareToRecordAsync();
        await testRecorder.release();
        console.log("[RoomScreen] Microphone warmed up successfully");
      } catch (error) {
        console.log("[RoomScreen] Microphone init skipped:", error);
      }
    };
    
    // Small delay to let the room load first
    const timer = setTimeout(initMicrophone, 500);
    return () => clearTimeout(timer);
  }, [requestPermissions]);
  const { isPlaying, currentUri, play, stop } = useAudioPlayerHook();
  // Sheeloha player - plays tarouk 3 times overlapping with distance effect
  const { 
    isPlaying: isSheelohaPlaying, 
    isProcessing: isSheelohaProcessing, 
    playSheeloha,
    stopSheeloha 
  } = useSheelohaPlayer();
  
  // Tarouk player
  const { stopTarouk } = useTaroukPlayer();

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
    { enabled: roomId > 0, refetchInterval: 1000 } // Fast polling for real-time broadcast
  );

  // Check if there's an active sheeloha broadcast (within last 4 seconds)
  // This is used to disable the sheeloha button for all users while playing
  // Also check if khalooha was pressed recently to stop the sheeloha
  const [sheelohaDisabledUntil, setSheelohaDisabledUntil] = useState<number>(0);
  
  const isSheelohaActiveGlobally = useMemo(() => {
    // If manually disabled (by khalooha), check if still in disabled period
    if (Date.now() < sheelohaDisabledUntil) return false;
    
    if (!sheelohaBroadcasts || sheelohaBroadcasts.length === 0) return false;
    const latestBroadcast = sheelohaBroadcasts[0];
    const broadcastTime = new Date(latestBroadcast.createdAt).getTime();
    const now = Date.now();
    const timeSinceBroadcast = now - broadcastTime;
    // Sheeloha plays for about 3.5 seconds, add buffer
    return timeSinceBroadcast < 4000; // 4 seconds
  }, [sheelohaBroadcasts, sheelohaDisabledUntil]);

  // Listen for khalooha commands to stop sheeloha for all users
  const { data: latestKhaloohaCommand } = trpc.khalooha.latest.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 1000 } // Fast polling for stop command
  );

  // Listen for active recordings to show "طاروق..." indicator
  const { data: activeRecordings } = trpc.recording.getActive.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 500 } // Fast polling for real-time indicator
  );

  // Mutations for recording status
  const setRecordingStatusMutation = trpc.recording.setStatus.useMutation();
  const clearRecordingStatusMutation = trpc.recording.clear.useMutation();

  // Show ALL messages in the feed (don't filter by joinedAt)
  // But only AUTO-PLAY messages sent AFTER user joined
  // Add 5 second safety margin to avoid losing messages sent right after joining
  const SAFETY_MARGIN_MS = 5000; // 5 seconds
  
  // All messages are shown in the feed
  const filteredAudioMessages = audioMessages || [];
  
  // All reactions are shown in the feed
  const filteredReactions = reactions || [];

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
      duration: lastTarouk.duration,
    });
    
    // Return audio URL string for playSheeloha
    return lastTarouk.audioUrl;
  }, [audioMessages]); // Use full audioMessages as dependency to catch all changes

  // Auto-play new messages for all users
  useEffect(() => {
    if (!filteredAudioMessages || filteredAudioMessages.length === 0 || !isJoinedAtLoaded) return;

    const joinTime = joinedAt.getTime();
    
    // First, mark ALL old messages as played (before user joined) - do this BEFORE checking for new messages
    const oldMessageIds: number[] = [];
    filteredAudioMessages.forEach(msg => {
      const messageTime = new Date(msg.createdAt).getTime();
      if (messageTime < joinTime && !playedMessageIds.has(msg.id)) {
        oldMessageIds.push(msg.id);
      }
    });
    
    // If there are old messages to mark, do it first and return
    if (oldMessageIds.length > 0) {
      console.log("[RoomScreen] Marking old messages as played:", oldMessageIds);
      setPlayedMessageIds(prev => {
        const newSet = new Set(prev);
        oldMessageIds.forEach(id => newSet.add(id));
        return newSet;
      });
      return; // Exit and let the next effect run handle new messages
    }

    // Find unplayed NEW messages (after user joined)
    const unplayedNewMessages = filteredAudioMessages.filter(msg => {
      const messageTime = new Date(msg.createdAt).getTime();
      return messageTime >= joinTime && !playedMessageIds.has(msg.id);
    });

    if (unplayedNewMessages.length === 0) return;

    // Play the first unplayed new message
    const nextMessage = unplayedNewMessages[0];
    console.log("[RoomScreen] Auto-playing new message:", {
      id: nextMessage.id,
      username: nextMessage.username,
      messageType: nextMessage.messageType,
    });
    setPlayedMessageIds(prev => new Set(prev).add(nextMessage.id));
    play(nextMessage.audioUrl);
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

  // Listen for khalooha commands and stop sheeloha for all users
  const [lastProcessedKhaloohaId, setLastProcessedKhaloohaId] = useState<number | null>(null);
  
  useEffect(() => {
    if (!latestKhaloohaCommand) return;
    
    // Check if this is a new khalooha command that hasn't been processed
    if (
      latestKhaloohaCommand.id !== lastProcessedKhaloohaId &&
      latestKhaloohaCommand.userId !== userId // Don't stop for own command (already stopped locally)
    ) {
      console.log("[RoomScreen] Received khalooha command from other user:", {
        id: latestKhaloohaCommand.id,
        username: latestKhaloohaCommand.username,
        commandUserId: latestKhaloohaCommand.userId,
        currentUserId: userId
      });
      
      // Mark as processed
      setLastProcessedKhaloohaId(latestKhaloohaCommand.id);
      
      // Stop sheeloha for this user
      stopSheeloha();
      console.log("[RoomScreen] Sheeloha stopped by khalooha command from:", latestKhaloohaCommand.username);
    } else if (latestKhaloohaCommand.id !== lastProcessedKhaloohaId && latestKhaloohaCommand.userId === userId) {
      // Mark own command as processed without stopping (already stopped locally)
      setLastProcessedKhaloohaId(latestKhaloohaCommand.id);
    }
  }, [latestKhaloohaCommand, lastProcessedKhaloohaId, stopSheeloha, userId]);

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


  // Kick player mutation (creator only)
  const kickPlayerMutation = trpc.kick.player.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      Alert.alert("خطأ", error.message);
    },
  });

  // Handle kick player
  const handleKickPlayer = (playerId: number, playerName: string) => {
    Alert.alert(
      "طرد اللاعب",
      `هل تريد طرد ${playerName} من الساحة؟`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "طرد",
          style: "destructive",
          onPress: () => {
            kickPlayerMutation.mutate({
              roomId,
              playerId,
              creatorId: userId || 0,
            });
          },
        },
      ]
    );
  };

  // Join request state (for viewers)
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [lastRequestTime, setLastRequestTime] = useState<number>(0);

  // Join requests query (for creator) - enabled when user is the room creator
  // Use roomData.creatorId instead of userRole to avoid timing issues
  const isRoomCreator = roomData?.creatorId === userId;
  console.log("[RoomScreen] isRoomCreator check:", { creatorId: roomData?.creatorId, userId, isRoomCreator, roomId });
  
  const { data: joinRequests, refetch: refetchJoinRequests } = trpc.joinRequests.getPending.useQuery(
    { roomId },
    { enabled: isRoomCreator && roomId > 0, refetchInterval: 1000 }
  );
  
  // Log join requests for debugging
  useEffect(() => {
    if (isRoomCreator) {
      console.log("[RoomScreen] Join requests updated:", joinRequests?.length || 0, joinRequests);
    }
  }, [joinRequests, isRoomCreator]);

  // Expire join request mutation
  const expireJoinRequestMutation = trpc.joinRequests.expire.useMutation();
  
  // Create join request mutation (for viewers)
  const createJoinRequestMutation = trpc.joinRequests.create.useMutation({
    onSuccess: (data) => {
      console.log("[RoomScreen] Join request created successfully:", data);
      setHasPendingRequest(true);
      setLastRequestTime(Date.now());
      // Auto-expire after 4 seconds
      setTimeout(() => {
        setHasPendingRequest(false);
        // Also expire in database
        if (data.requestId) {
          expireJoinRequestMutation.mutate({ requestId: data.requestId });
        }
      }, 4000);
    },
    onError: (error) => {
      Alert.alert("خطأ", error.message);
    },
  });

  // Respond to join request mutation (for creator)
  const respondToJoinRequestMutation = trpc.joinRequests.respond.useMutation({
    onSuccess: (data, variables) => {
      refetchJoinRequests();
      refetch();
      if (variables.accept) {
        Alert.alert("تم القبول", "تم قبول اللاعب في الساحة");
      }
    },
    onError: (error) => {
      Alert.alert("خطأ", error.message);
    },
  });

  // Handle viewer request to join as player
  const handleRequestJoinAsPlayer = () => {
    console.log("[RoomScreen] handleRequestJoinAsPlayer called", { hasPendingRequest, userId, username, roomId, avatar });
    if (hasPendingRequest) {
      Alert.alert("انتظر", "لديك طلب قيد الانتظار");
      return;
    }
    if (!userId || !username) {
      Alert.alert("خطأ", "يجب تسجيل الدخول");
      return;
    }
    console.log("[RoomScreen] Sending join request...");
    createJoinRequestMutation.mutate({
      roomId,
      userId,
      username,
      avatar: avatar || "male",
    });
  };

  // Handle creator response to join request
  const handleRespondToJoinRequest = (requestId: number, requestUserId: number, accept: boolean) => {
    respondToJoinRequestMutation.mutate({
      requestId,
      accept,
      roomId,
      userId: requestUserId,
    });
  };


  // Share invite link using deep link scheme
  const handleShareInvite = async () => {
    try {
      // Use deep link scheme to open the app directly
      const inviteUrl = `manus20260120123613://invite/${roomId}`;
      const roomName = roomData?.name || 'ساحة المحاورة';
      
      const message = `🎤 دعوة للانضمام إلى ساحة المحاورة الشعرية\n\n` +
        `📍 اسم الساحة: ${roomName}\n` +
        `👤 الداعي: ${username}\n\n` +
        `انضم الآن كلاعب أو مشاهد:\n${inviteUrl}`;
      
      await Share.share({
        message,
        url: inviteUrl,
        title: `دعوة للانضمام إلى ${roomName}`,
      });
    } catch (error) {
      console.error('[RoomScreen] Share error:', error);
    }
  };

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
              // مسح joinedAt من AsyncStorage عند المغادرة
              const storageKey = `joinedAt_${roomId}_${userId}`;
              await AsyncStorage.removeItem(storageKey);
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
      "إغلاق الساحة",
      "هل أنت متأكد من إغلاق الساحة؟\n\nسيتم حذف جميع المحتويات وإخراج جميع المتواجدين.",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "إغلاق",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteRoomMutation.mutateAsync({ roomId });
              // مسح joinedAt من AsyncStorage عند إغلاق الجلسة
              const storageKey = `joinedAt_${roomId}_${userId}`;
              await AsyncStorage.removeItem(storageKey);
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
    
    // كتم جميع الأصوات المشغلة أثناء التسجيل
    console.log("[RoomScreen] Stopping all audio before recording...");
    stop(); // إيقاف تشغيل الرسائل الصوتية
    stopSheeloha(); // إيقاف شيلوها
    stopTarouk(); // إيقاف طاروق
    
    try {
      console.log("[RoomScreen] Calling startRecording...");
      const success = await startRecording();
      console.log("[RoomScreen] startRecording returned:", success);
      if (!success) {
        console.error("[RoomScreen] Recording failed");
        Alert.alert("خطأ", "فشل بدء التسجيل. تأكد من أذونات المايكروفون.");
        setRecordingType(null);
        return;
      }
      
      // إرسال حالة التسجيل للخادم لعرض مؤشر "طاروق..." للجميع
      if (username && userId) {
        try {
          await setRecordingStatusMutation.mutateAsync({
            roomId,
            userId,
            username,
            isRecording: true,
            recordingType: type,
          });
          console.log("[RoomScreen] Recording status sent to server");
        } catch (err) {
          console.error("[RoomScreen] Failed to send recording status:", err);
        }
      }
    } catch (error) {
      console.error("[RoomScreen] Recording error:", error);
      const errorMessage = error instanceof Error ? error.message : "فشل بدء التسجيل";
      Alert.alert("خطأ", errorMessage);
      setRecordingType(null);
    }
  };

  const handleCancelRecording = async () => {
    console.log("[RoomScreen] Canceling recording - DELETE without saving...");
    try {
      // Stop recording without saving - this will discard the recording
      const result = await stopRecording();
      console.log("[RoomScreen] Recording stopped and discarded:", result);
      setRecordingType(null);
      console.log("[RoomScreen] Recording canceled successfully - NOT sent");
      
      // مسح حالة التسجيل من الخادم
      if (userId) {
        try {
          await clearRecordingStatusMutation.mutateAsync({ roomId, userId });
        } catch (err) {
          console.error("[RoomScreen] Failed to clear recording status:", err);
        }
      }
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
        
        // Save to database with S3 URL (with actual duration from recording)
        await createAudioMutation.mutateAsync({
          roomId,
          userId,
          username,
          messageType: currentRecordingType,
          audioUrl: url,
          duration: recording.duration || 0, // Use actual recording duration
        });
        
        // Refresh audio messages
        await refetchAudio();
      }
    } catch (error) {
      console.error("Failed to save audio message:", error);
      Alert.alert("خطأ", "فشل حفظ الرسالة الصوتية");
    } finally {
      setRecordingType(null);
      
      // مسح حالة التسجيل من الخادم
      if (userId) {
        try {
          await clearRecordingStatusMutation.mutateAsync({ roomId, userId });
        } catch (err) {
          console.error("[RoomScreen] Failed to clear recording status:", err);
        }
      }
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
    <ImageBackground 
      source={roomBackground} 
      style={{ flex: 1 }} 
      resizeMode="cover"
    >
    <ScreenContainer 
      className="p-0" 
      containerClassName="bg-transparent"
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
          <Text className="text-xl font-bold text-center" style={{ color: '#000000' }}>{roomData.name}</Text>
          <Text className="text-sm text-center" style={{ color: '#000000', opacity: 0.8 }}>
            {roomData.acceptedPlayersCount}/2 لاعبين · {roomData.viewerCount} مشاهدين
          </Text>
        </View>
        
        {/* Right: Share/Invite button */}
        <TouchableOpacity
          style={{ width: 60 }}
          className="items-center justify-center"
          onPress={handleShareInvite}
        >
          <MaterialIcons name="share" size={28} color="#000000" />
        </TouchableOpacity>
      </View>

      {/* Join Requests from Viewers (Only for creator) - Max 2 shown */}
      {isRoomCreator && joinRequests && joinRequests.length > 0 && (
        <View className="px-6 py-3 border-b border-warning/30" style={{ backgroundColor: 'rgba(255, 193, 7, 0.15)' }}>
          {joinRequests.slice(0, 2).map((request) => (
            <View key={request.id} className="flex-row items-center justify-between mb-2" style={{ backgroundColor: 'rgba(255, 215, 0, 0.2)', borderRadius: 8, padding: 10 }}>
              <View className="flex-row items-center flex-1">
                <Image
                  source={getAvatarSource(request.avatar)}
                  style={{ width: 36, height: 36, borderRadius: 18, marginLeft: 8 }}
                />
                <Text style={{ color: '#000', fontWeight: '600' }}>
                  {request.username} يريد الانضمام كلاعب
                </Text>
              </View>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="px-4 py-2 rounded-lg"
                  style={{ backgroundColor: '#22C55E' }}
                  onPress={() => handleRespondToJoinRequest(request.id, request.userId, true)}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>قبول</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="px-4 py-2 rounded-lg"
                  style={{ backgroundColor: '#EF4444' }}
                  onPress={() => handleRespondToJoinRequest(request.id, request.userId, false)}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>رفض</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Old Pending Requests (for player role requests) */}
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
        {/* Players Display - Creator in center, Players on sides */}
        <View className="flex-row items-center justify-center mb-4" style={{ gap: 16 }}>
          {/* Player 1 (Right side) */}
          {(() => {
            const player1 = roomData?.participants?.find(
              (p) => p.role === "player" && p.status === "accepted"
            );
            const isPlayer1Recording = player1 && activeRecordings?.some(
              (r) => r.userId === player1.userId
            );
            const player1RecordingType = activeRecordings?.find(
              (r) => r.userId === player1?.userId
            )?.recordingType as "comment" | "tarouk" | undefined;
            return player1 ? (
              <View className="items-center" style={{ width: 60, position: 'relative' }}>
                <RecordingIndicator 
                  isVisible={!!isPlayer1Recording} 
                  recordingType={player1RecordingType || "tarouk"} 
                />
                <TouchableOpacity
                  onPress={() => userRole === "creator" && handleKickPlayer(player1.userId, player1.username)}
                  disabled={userRole !== "creator"}
                  activeOpacity={userRole === "creator" ? 0.7 : 1}
                >
                  <Image
                    source={getAvatarSource(player1.avatar)}
                    style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: isPlayer1Recording ? '#DC2626' : colors.success }}
                  />
                  {userRole === "creator" && (
                    <View style={{ position: 'absolute', top: -5, right: -5, backgroundColor: '#DC2626', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' }}>
                      <MaterialIcons name="close" size={14} color="white" />
                    </View>
                  )}
                </TouchableOpacity>
                <Text className="text-xs mt-1 text-center" numberOfLines={1} style={{ color: '#000000' }}>
                  {player1.username}
                </Text>
              </View>
            ) : (
              <View style={{ width: 60 }} />
            );
          })()}

          {/* Creator (Center) */}
          {(() => {
            const isCreatorRecording = activeRecordings?.some(
              (r) => r.userId === roomData?.creatorId
            );
            const creatorRecordingType = activeRecordings?.find(
              (r) => r.userId === roomData?.creatorId
            )?.recordingType as "comment" | "tarouk" | undefined;
            return (
              <View className="items-center" style={{ width: 80, position: 'relative' }}>
                <RecordingIndicator 
                  isVisible={!!isCreatorRecording} 
                  recordingType={creatorRecordingType || "tarouk"} 
                />
                <Image
                  source={getAvatarSource(roomData?.creatorAvatar)}
                  style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: isCreatorRecording ? '#DC2626' : colors.primary }}
                />
                <Text className="text-sm font-bold mt-1 text-center" numberOfLines={1} style={{ color: '#000000' }}>
                  {roomData?.creatorName}
                </Text>
              </View>
            );
          })()}

          {/* Player 2 (Left side) */}
          {(() => {
            const players = roomData?.participants?.filter(
              (p) => p.role === "player" && p.status === "accepted"
            ) || [];
            const player2 = players.length > 1 ? players[1] : null;
            const isPlayer2Recording = player2 && activeRecordings?.some(
              (r) => r.userId === player2.userId
            );
            const player2RecordingType = activeRecordings?.find(
              (r) => r.userId === player2?.userId
            )?.recordingType as "comment" | "tarouk" | undefined;
            return player2 ? (
              <View className="items-center" style={{ width: 60, position: 'relative' }}>
                <RecordingIndicator 
                  isVisible={!!isPlayer2Recording} 
                  recordingType={player2RecordingType || "tarouk"} 
                />
                <TouchableOpacity
                  onPress={() => userRole === "creator" && handleKickPlayer(player2.userId, player2.username)}
                  disabled={userRole !== "creator"}
                  activeOpacity={userRole === "creator" ? 0.7 : 1}
                >
                  <Image
                    source={getAvatarSource(player2.avatar)}
                    style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: isPlayer2Recording ? '#DC2626' : colors.success }}
                  />
                  {userRole === "creator" && (
                    <View style={{ position: 'absolute', top: -5, right: -5, backgroundColor: '#DC2626', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' }}>
                      <MaterialIcons name="close" size={14} color="white" />
                    </View>
                  )}
                </TouchableOpacity>
                <Text className="text-xs mt-1 text-center" numberOfLines={1} style={{ color: '#000000' }}>
                  {player2.username}
                </Text>
              </View>
            ) : (
              <View style={{ width: 60 }} />
            );
          })()}
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
              {/* Clapping Speed Options - vertical layout with "بلا" on top */}
              <View style={{ alignItems: 'center', justifyContent: 'flex-start' }}>
                {/* "بلا" button on top - same size as button 1 */}
                <TouchableOpacity
                  onPress={() => setClappingSpeed(0)}
                  style={{
                    width: 18,
                    height: 12,
                    borderRadius: 3,
                    backgroundColor: clappingSpeed === 0 ? '#FFD700' : '#5D4037',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: clappingSpeed === 0 ? 0 : 1,
                    borderColor: '#8B7355',
                    marginBottom: 4,
                  }}
                >
                  <Text 
                    style={{ 
                      color: clappingSpeed === 0 ? '#5D4037' : '#FFD700',
                      fontSize: 6,
                      fontWeight: '900',
                    }}
                  >
                    بلا
                  </Text>
                </TouchableOpacity>
                {/* Speed buttons 1, 2 vertically, then 3, 4 side by side */}
                <View style={{ flexDirection: 'column', gap: 2 }}>
                  {/* Buttons 1 and 2 */}
                  {[1, 2].map((speed) => (
                    <TouchableOpacity
                      key={speed}
                      onPress={() => setClappingSpeed(speed as 0 | 1 | 2 | 3 | 4)}
                      style={{
                        width: 18,
                        height: 12,
                        borderRadius: 3,
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
                          fontSize: 8,
                          fontWeight: '900',
                        }}
                      >
                        {speed === 1 ? '١' : '٢'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {/* Buttons 3 and 4 side by side */}
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    {[3, 4].map((speed) => (
                      <TouchableOpacity
                        key={speed}
                        onPress={() => setClappingSpeed(speed as 0 | 1 | 2 | 3 | 4)}
                        style={{
                          width: 18,
                          height: 12,
                          borderRadius: 3,
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
                            fontSize: 8,
                            fontWeight: '900',
                          }}
                        >
                          {speed === 3 ? '٣' : '٤'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <Text 
                  style={{ 
                    color: colors.muted,
                    fontSize: 6,
                    fontWeight: '900',
                    textAlign: 'center',
                    marginTop: 4,
                  }}
                >
                  الصفقة (الإيقاع)
                </Text>
              </View>

              {/* Sheeloha Button */}
              <View className="flex-1 items-center">
                <TouchableOpacity
                  className="rounded items-center justify-center"
                  style={{
                    backgroundColor: "#5D4037",
                    opacity: (!lastTaroukUri || isSheelohaProcessing || isSheelohaActiveGlobally) ? 0.5 : 1,
                    width: '100%',
                    paddingVertical: 4,
                    paddingHorizontal: 4,
                    minHeight: 48,
                    borderRadius: 8,
                  }}
                  onPress={async () => {
                  console.log("[RoomScreen] Sheeloha button pressed");
                  console.log("[RoomScreen] Current lastTaroukUri:", lastTaroukUri);
                  console.log("[RoomScreen] isSheelohaActiveGlobally:", isSheelohaActiveGlobally);
                  
                  // Check if sheeloha is already playing globally
                  if (isSheelohaActiveGlobally) {
                    console.log("[RoomScreen] Sheeloha already active globally, ignoring press");
                    return;
                  }
                  
                  if (!lastTaroukUri) {
                    Alert.alert("تنبيه", "لا توجد رسائل طاروق");
                    return;
                  }
                  if (!username) {
                    Alert.alert("خطأ", "يجب تسجيل الدخول");
                    return;
                  }
                  
                  try {
                    // Stop tarouk sound first before playing sheeloha
                    console.log("[RoomScreen] Stopping tarouk before playing sheeloha");
                    stopTarouk();
                    
                    console.log("[RoomScreen] Playing sheeloha effect (5 overlapping copies)");
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
                  disabled={isSheelohaProcessing || isSheelohaActiveGlobally}
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
                    opacity: (isSheelohaPlaying || isSheelohaActiveGlobally) ? 1 : 0.5,
                    width: '100%',
                    paddingVertical: 4,
                    paddingHorizontal: 4,
                    minHeight: 48,
                    borderRadius: 8,
                  }}
                  onPress={async () => {
                    // Stop sheeloha locally first (only sheeloha, not other sounds)
                    stopSheeloha();
                    
                    // Reset the global sheeloha disabled state immediately
                    // This allows the button to be re-enabled right away
                    setSheelohaDisabledUntil(0);
                    
                    // Broadcast stop command to all users
                    try {
                      console.log("[RoomScreen] Broadcasting khalooha command to all users");
                      await createKhaloohaCommandMutation.mutateAsync({
                        roomId,
                        userId,
                        username: username || "",
                      });
                      console.log("[RoomScreen] Khalooha command sent successfully");
                    } catch (error) {
                      console.error("[RoomScreen] Failed to broadcast khalooha:", error);
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
                minHeight: 48,
                borderRadius: 8,
              }}
              onPress={() => setIsReactionsPickerOpen(true)}
            >
                  <MaterialIcons name="emoji-emotions" size={28} color="#FFD700" />
            </TouchableOpacity>
          </View>

          {/* Viewer: Request to Join as Player */}
          {isViewer && (
            <View className="flex-1 items-center justify-center">
              <TouchableOpacity
                className="px-6 py-3 rounded-lg"
                style={{ 
                  backgroundColor: hasPendingRequest ? '#9CA3AF' : '#22C55E',
                  opacity: hasPendingRequest ? 0.7 : 1,
                }}
                onPress={handleRequestJoinAsPlayer}
                disabled={hasPendingRequest || createJoinRequestMutation.isPending}
              >
                <View className="flex-row items-center gap-2">
                  <MaterialIcons name="person-add" size={24} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                    {hasPendingRequest ? 'طلبك قيد الانتظار...' : 'طلب الانضمام كلاعب'}
                  </Text>
                </View>
              </TouchableOpacity>
              {hasPendingRequest && (
                <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6, textAlign: 'center' }}>
                  سيتم حذف الطلب تلقائياً بعد 4 ثواني
                </Text>
              )}
            </View>
          )}

          {/* Right: Comment & Tarouk (Players only) */}
          {isPlayer && (
            <View className="flex-row gap-2 flex-1">
              <View className="flex-1 items-center">
                <RecordingButton
                  buttonId="comment"
                  isRecording={isRecording && recordingType === "comment"}
                  isPreparing={isPreparing && recordingType === "comment"}
                  pressAndHold={true}
                  onPressIn={() => handleStartRecording("comment")}
                  onPressOut={() => handleStopRecording()}
                  onCancelRecording={handleCancelRecording}
                  recordingDuration={recordingType === "comment" ? formattedDuration : "00:00"}
                  iconComponent={
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <MaterialIcons name="music-note" size={22} color="#FFD700" />
                      <MaterialIcons name="chat" size={22} color="#FFD700" />
                    </View>
                  }
                  label=""
                  showLabel={false}
                  backgroundColor="#5D4037"
                  minHeight={48}
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
                  buttonId="tarouk"
                  isRecording={isRecording && recordingType === "tarouk"}
                  isPreparing={isPreparing && recordingType === "tarouk"}
                  pressAndHold={true}
                  onPressIn={() => handleStartRecording("tarouk")}
                  onPressOut={() => handleStopRecording()}
                  onCancelRecording={handleCancelRecording}
                  backgroundColor="#5D4037"
                  recordingDuration={recordingType === "tarouk" ? formattedDuration : "00:00"}
                  iconComponent={
                    <MaterialCommunityIcons name="microphone-variant" size={28} color="#FFD700" />
                  }
                  label=""
                  showLabel={false}
                  minHeight={48}
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
    </ImageBackground>
  );
}
