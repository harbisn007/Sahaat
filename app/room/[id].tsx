import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Alert, FlatList, Platform, useWindowDimensions, Modal, Pressable, TextInput } from "react-native";
import { AudioModule, RecordingPresets, createAudioPlayer } from "expo-audio";
import { useLocalSearchParams, router, useNavigation } from "expo-router";
import { Image, ImageBackground, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

// Room background image
const roomBackground = require("@/assets/images/room-background.png");
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
import { useSocket, getSocket } from "@/hooks/use-socket";
import { RecordingButton } from "@/components/recording-button";
import { AudioMessage } from "@/components/audio-message";
import { MessageBubble } from "@/components/message-bubble";
import { ReactionMessage } from "@/components/reaction-message";
import { ReactionsPicker } from "@/components/reactions-picker";
import { RecordingIndicator } from "@/components/recording-indicator";
import { EditProfileModal } from "@/components/edit-profile-modal";
// SpeedWheel removed - شيلوها أصبحت تلقائية
// import { SpeedWheel } from "@/components/speed-wheel";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getAvatarSourceById } from "@/lib/avatars";
import { InteractionButtons } from "@/components/interaction-buttons";

export default function RoomScreen() {
  const { id, role, autoJoin } = useLocalSearchParams<{ id: string; role?: string; autoJoin?: string }>();
  const { username, userId, avatar, setUserData } = useUser();

  // Helper function to get avatar source
  const getAvatarSource = (avatarValue: string | undefined | null) => getAvatarSourceById(avatarValue);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  
  // Responsive button sizes for small screens
  // Small screen: width < 360px
  const isSmallScreen = screenWidth < 360;
  const buttonWidth = isSmallScreen ? 48 : 60;
  const iconSize = isSmallScreen ? 20 : 24;
  const smallIconSize = isSmallScreen ? 14 : 18;
  const wheelWidth = isSmallScreen ? 40 : 50;
  const fontSize = isSmallScreen ? 7 : 9;
  
  const roomId = parseInt(id || "0");
  const flatListRef = useRef<FlatList>(null);

  // State
  const [userRole, setUserRole] = useState<"creator" | "player" | "viewer" | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  // refs لحفظ آخر role معروف حتى لا تصفّر عند غياب roomData لحظياً
  const lastKnownRoleRef = useRef<"creator" | "player" | "viewer" | null>(null);
  const lastKnownApprovedRef = useRef(false);
  const [recordingType, setRecordingType] = useState<"comment" | "tarouk" | null>(null);
  const [savedRoomName, setSavedRoomName] = useState<string>("");
  // Clapping delay in seconds: 0 = no clapping, 0.05-1.50 = delay between claps
  const [clappingDelay, setClappingDelay] = useState<number>(0.80);
  // تتبع آخر تغيير محلي للعجلة (لمنع التحديث المزدوج)
  const lastLocalClappingChangeRef = useRef<number>(0);
  // حفظ بيانات الشيلوها المعلقة حتى ينتهي الطاروق
  const pendingSheelohaRef = useRef<{ sheelohaUrl: string; taroukDuration: number } | null>(null);
  // تعريف مؤقت للبيانات المستقبلة من الخادم
  interface SheelohaPayload {
    roomId: number;
    sheelohaUrl: string;
    taroukDuration: number;
    userId: string;
    username: string;
  }
  // المتحكم بالطاروق: "creator" | "player1" | "player2" | null
  const [taroukController, setTaroukController] = useState<"creator" | "player1" | "player2" | null>(null);
  // Track when user joined the room (persist across reloads)
  const [joinedAt, setJoinedAt] = useState<Date>(new Date());
  const [isJoinedAtLoaded, setIsJoinedAtLoaded] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  // حالة محلية لعرض الدائرة الحمراء فوراً للمستخدم الحالي (بدون انتظار الخادم)
  const [localRecordingActive, setLocalRecordingActive] = useState(false);
  const [pendingSheeloha, setPendingSheeloha] = useState<{ sheelohaUrl: string; taroukDuration: number } | null>(null);
  const [localRecordingType, setLocalRecordingType] = useState<"comment" | "tarouk" | null>(null);
  // تتبع آخر رسالة شغّلها المستخدم محلياً (لمنع التشغيل المزدوج)
  const [locallyPlayedAudioUrls, setLocallyPlayedAudioUrls] = useState<Set<string>>(new Set());
  // حالة الدعوة العامة
  const [canSendPublicInvite, setCanSendPublicInvite] = useState(true);
  const [isSendingPublicInvite, setIsSendingPublicInvite] = useState(false);
  const [lastPublicInviteTime, setLastPublicInviteTime] = useState<number | null>(null);
  // إشعار التعليمات للمنشئ عند إنشاء أول ساحة
  // إشعار التعليمات للمنشئ (يظهر مرة واحدة فقط عند إنشاء أول ساحة)
  const [showCreatorTutorial, setShowCreatorTutorial] = useState(false);
  // تم إلغاء sufoofSound - الصوت الأصلي (lastTaroukUri) يُستخدم دائماً

  // جلب بيانات الساحة - polling كل 5 ثواني فقط (التحديثات الفورية عبر Socket.io)
  const { data: roomData, isLoading, refetch, error } = trpc.rooms.getById.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 5000, retry: false } // تقليل من 500ms إلى 5s
  );

  // استرجاع taroukController من AsyncStorage عند دخول الساحة (للمنشئ فقط)
  // إذا لم يكن هناك قيمة محفوظة والمستخدم هو المنشئ، يتم تعيين "creator" كقيمة افتراضية
  useEffect(() => {
    const loadTaroukController = async () => {
      try {
        const storageKey = `taroukController_${roomId}`;
        const saved = await AsyncStorage.getItem(storageKey);
        if (saved) {
          const controller = saved as "creator" | "player1" | "player2";
          console.log("[RoomScreen] Loaded taroukController from storage:", controller);
          setTaroukController(controller);
        } else if (roomData?.creatorId === userId) {
          // المنشئ يدخل لأول مرة - تعيين "عندي" كقيمة افتراضية
          console.log("[RoomScreen] Setting default taroukController to 'creator' for room creator");
          setTaroukController("creator");
        }
      } catch (error) {
        console.error("[RoomScreen] Failed to load taroukController:", error);
      }
    };
    
    if (roomId > 0 && roomData && userId) {
      loadTaroukController();
    }
  }, [roomId, roomData, userId]);

  // حفظ taroukController في AsyncStorage عند تغييره
  useEffect(() => {
    const saveTaroukController = async () => {
      try {
        const storageKey = `taroukController_${roomId}`;
        if (taroukController) {
          await AsyncStorage.setItem(storageKey, taroukController);
          console.log("[RoomScreen] Saved taroukController to storage:", taroukController);
        } else {
          await AsyncStorage.removeItem(storageKey);
          console.log("[RoomScreen] Removed taroukController from storage");
        }
      } catch (error) {
        console.error("[RoomScreen] Failed to save taroukController:", error);
      }
    };
    
    if (roomId > 0) {
      saveTaroukController();
    }
  }, [roomId, taroukController]);

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
    
    if (roomId > 0 && userId) {
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
  
  // Socket.io للاستماع لحدث حذف الساحة فوراً
  const { setCallbacks, setTaroukController: socketSetTaroukController } = useSocket(roomId > 0 ? roomId : null, userId);
  
  // حالات محلية للبيانات الفورية عبر Socket.io (بدلاً من polling)
  const [socketAudioMessages, setSocketAudioMessages] = useState<any[]>([]);
  const [socketReactions, setSocketReactions] = useState<any[]>([]);
  const [socketActiveRecordings, setSocketActiveRecordings] = useState<any[]>([]);

  const [socketKhaloohaCommand, setSocketKhaloohaCommand] = useState<any | null>(null);
  // حالة محلية لطلبات الانضمام (فوري عبر Socket.io)
  const [socketJoinRequests, setSocketJoinRequests] = useState<any[]>([]);
  const [joinRequestResponse, setJoinRequestResponse] = useState<{ accepted: boolean; requestId: number } | null>(null);
  
  // نظام الطابور الموحد: الطلبات المعروضة حالياً (أول 2) والطلبات المنتظرة
  // يدمج طلبات المشاهدين وطلبات الدخول كلاعب في طابور واحد
  const [displayedRequests, setDisplayedRequests] = useState<any[]>([]);
  const [queuedRequests, setQueuedRequests] = useState<any[]>([]);
  // تتبع الطلبات التي تم التعامل معها (قبول/رفض) لمنع إعادة ظهورها
  const handledRequestIdsRef = useRef<Set<string>>(new Set());
  
  // الاستماع لأحداث Socket.io (فوري - بديل كامل للـ polling)
  useEffect(() => {
    if (!roomId || roomId <= 0) return;
    
    setCallbacks({
      onRoomDeleted: (roomName: string, reason?: "manual" | "auto") => {
        console.log("[RoomScreen] Room deleted via Socket.io:", roomName, "reason:", reason);
        if (!roomClosedAlertShown) {
          setRoomClosedAlertShown(true);
          // تنفيذ الخروج فوراً بدون انتظار تفاعل المستخدم
          router.replace("/");
          
          // رسالة مختلفة حسب سبب الحذف
          if (reason === "auto") {
            Alert.alert(
              "تم حذف الساحة",
              `يتم حذف الساحة تلقائياً لمرور ١٥ دقيقة بدون دخول شعراء بها، لكن لا مشكلة يمكنك إنشاء أخرى دائماً :)`
            );
          } else {
            Alert.alert(
              "تم إغلاق الساحة",
              "تم إغلاق الساحة بنجاح"
            );
          }
        }
      },
      // استماع للرسائل الصوتية الجديدة - إضافة مباشرة للحالة المحلية
      onAudioMessageCreated: (data) => {
        console.log("[RoomScreen] New audio message via Socket.io:", data);
        setSocketAudioMessages(prev => {
          // تجنب التكرار
          if (prev.some(m => m.id === data.messageId)) return prev;
          return [{
            id: data.messageId,
            userId: data.userId,
            username: data.username,
            messageType: data.messageType,
            audioUrl: data.audioUrl,
            duration: data.duration,
            createdAt: data.createdAt,
          }, ...prev];
        });
      },
      // استماع للتفاعلات الجديدة - إضافة مباشرة للحالة المحلية
      onReactionCreated: (data) => {
        console.log("[RoomScreen] New reaction via Socket.io:", data);
        setSocketReactions(prev => {
          // تجنب التكرار
          if (prev.some(r => r.id === data.reactionId)) return prev;
          return [{
            id: data.reactionId,
            userId: data.userId,
            username: data.username,
            reactionType: data.reactionType,
            createdAt: data.createdAt,
          }, ...prev];
        });
      },
      // استماع لتغيير حالة التسجيل - تحديث مباشر
      onRecordingStatusChanged: (data) => {
        console.log("[RoomScreen] Recording status changed via Socket.io:", data);
        setSocketActiveRecordings(prev => {
          if (data.isRecording) {
            // إضافة أو تحديث
            const existing = prev.findIndex(r => r.userId === data.userId);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = { ...data, isRecording: "true" };
              return updated;
            }
            return [...prev, { ...data, isRecording: "true" }];
          } else {
            // إزالة
            return prev.filter(r => r.userId !== data.userId);
          }
        });
      },
      // استماع لخلوها
      onKhaloohaCommand: (data) => {
        console.log("[RoomScreen] Khalooha command via Socket.io:", data);
        setSocketKhaloohaCommand({
          id: Date.now(),
          ...data,
        });
      },
      // استماع لطلبات الانضمام الجديدة (فوري للمنشئ)
      onJoinRequestCreated: (data) => {
        console.log("[RoomScreen] Join request created via Socket.io:", data);
        setSocketJoinRequests(prev => {
          // تجنب التكرار
          if (prev.some(r => r.id === data.requestId)) return prev;
          return [{
            id: data.requestId,
            userId: data.userId,
            username: data.username,
            avatar: data.avatar,
            createdAt: new Date().toISOString(),
          }, ...prev];
        });
      },
      // استماع للرد على طلب الانضمام (فوري للمستخدم)
      onJoinRequestResponded: (data) => {
        console.log("[RoomScreen] Join request responded via Socket.io:", data);
        // إزالة الطلب من القائمة المحلية (للمنشئ)
        setSocketJoinRequests(prev => prev.filter(r => r.id !== data.requestId));
        // حفظ الرد لعرضه للمستخدم المعني فقط (الذي أرسل الطلب)
        if (data.userId === userId) {
          setJoinRequestResponse({ accepted: data.accepted, requestId: data.requestId });
        }
        // تحديث البيانات يتم عبر onRoomUpdated -> refetch
      },
      // استماع لتحديث الساحة (مثل قبول طلب انضمام) - refetch فوري
      onRoomUpdated: () => {
        console.log("[RoomScreen] Room updated via Socket.io - refetching...");
        refetch();
      },
      // استماع لتغيير المتحكم بالطاروق (مزامنة)
      onTaroukControllerChanged: (data) => {
        console.log("[RoomScreen] Tarouk controller changed via Socket.io:", data);
        setTaroukController(data.controller);
      },

    });
  }, [roomId, setCallbacks, savedRoomName, roomClosedAlertShown, userId]);

  // مراقبة الرد على طلب الانضمام - إعلام المستمع أنه أصبح لاعباً
  useEffect(() => {
    if (!joinRequestResponse) return;
    
    if (joinRequestResponse.accepted) {
      console.log("[RoomScreen] Join request ACCEPTED - refetching room data...");
      // refetch فوري لتحديث الدور
      refetch();
      setHasPendingRequest(false);
      Alert.alert("تم القبول", "تم قبولك كشاعر في الساحة! يمكنك الآن التسجيل والمشاركة.");
    } else {
      console.log("[RoomScreen] Join request REJECTED");
      setHasPendingRequest(false);
      Alert.alert("تم الرفض", "لم يتم قبول طلبك للانضمام كشاعر.");
    }
    
    // إعادة ضبط الحالة
    setJoinRequestResponse(null);
  }, [joinRequestResponse]);
  
  // التحقق من حذف الساحة - فوري عند فتح الشاشة أو عبر polling
  // نستخدم ref لتتبع هل رأينا roomData مرة واحدة على الأقل
  const hasSeenRoomDataRef = useRef(false);
  if (roomData) hasSeenRoomDataRef.current = true;

  useEffect(() => {
    if (roomClosedAlertShown) return;
    if (isLoading) return;

    // نتجاهل إذا لم نرَ roomData بعد (أول تحميل لم يكتمل)
    // نتحقق فقط إذا:
    // 1. رأينا roomData مرة سابقاً ثم اختفى (حُذفت الساحة)
    // 2. أو وصل خطأ صريح من الخادم
    const roomDisappeared = hasSeenRoomDataRef.current && !roomData;
    const serverError = !!error;

    if (roomDisappeared || serverError) {
      console.log("[RoomScreen] Room not found - redirecting. disappeared:", roomDisappeared, "error:", error?.message);
      setRoomClosedAlertShown(true);
      router.replace("/");
      if (savedRoomName) {
        Alert.alert(
          "تم حذف الساحة",
          "يتم حذف الساحة تلقائياً لمرور ١٥ دقيقة بدون دخول شعراء بها، لكن لا مشكلة يمكنك إنشاء أخرى دائماً :)"
        );
      }
    }
  }, [isLoading, roomData, error, roomClosedAlertShown, savedRoomName]);

  // Mutation for auto-join (must be defined before useEffect that uses it)
  const joinAsViewerMutation = trpc.rooms.joinAsViewer.useMutation();

  // Auto-join as viewer when coming from invite link
  const autoJoinAttempted = useRef(false);
  useEffect(() => {
    const performAutoJoin = async () => {
      // Only auto-join if coming from invite with autoJoin=true
      if (autoJoin !== "true" || autoJoinAttempted.current) return;
      if (!username || !userId || !roomData) return;
      
      // Check if already a participant
      const isParticipant = roomData.participants.some((p) => p.username === username);
      if (isParticipant) {
        console.log("[RoomScreen] Already a participant, skipping auto-join");
        return;
      }
      
      autoJoinAttempted.current = true;
      console.log("[RoomScreen] Auto-joining as viewer...");
      
      try {
        await joinAsViewerMutation.mutateAsync({
          roomId,
          username,
          avatar: avatar || "male",
          userId,
        });
        console.log("[RoomScreen] Auto-join successful");
        refetch();
      } catch (err) {
        console.error("[RoomScreen] Auto-join failed:", err);
      }
    };
    
    performAutoJoin();
  }, [autoJoin, username, userId, roomData, avatar, roomId, joinAsViewerMutation, refetch]);

  // جلب طلبات الانضمام - polling كل 3 ثواني + Socket.io للتحديثات الفورية
  const { data: pendingRequests, refetch: refetchRequests } = trpc.rooms.getPendingRequests.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 3000 } // polling كل 3 ثواني كـ fallback
  );

  const respondToRequestMutation = trpc.rooms.respondToRequest.useMutation();
  const leaveRoomMutation = trpc.rooms.leaveRoom.useMutation();

  // حذف المستخدم غير المنشئ تلقائياً عند مغادرة صفحة الساحة (بأي طريقة)
  const navigation = useNavigation();
  const isRoomCreatorRef = useRef(false);
  const userRoleRef = useRef<string | null>(null);
  
  // تحديث refs لاستخدامها في cleanup
  useEffect(() => {
    isRoomCreatorRef.current = roomData?.creatorId === userId;
    userRoleRef.current = userRole;
  }, [roomData?.creatorId, userId, userRole]);
  
  // إيقاف جميع الأصوات عند الخروج من الساحة (لا ينتظر عودة المستخدم)
  useEffect(() => {
    return () => {
      stop();
      stopTarouk();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      // إيقاف جميع الأصوات عند الخروج
      stop();
      stopTarouk();
      
      // المنشئ لا يُحذف عند مغادرة الصفحة
      if (isRoomCreatorRef.current) return;
      
      // المستخدم غير المنشئ: حذفه من الساحة فوراً
      if (userId && roomId > 0) {
        console.log("[RoomScreen] Non-creator leaving page, removing from room:", { userId, roomId, role: userRoleRef.current });
        // استدعاء API لحذف المشارك (fire and forget)
        leaveRoomMutation.mutate({ 
          roomId, 
          userId, 
          role: userRoleRef.current || undefined 
        });
        // مسح joinedAt من AsyncStorage
        const storageKey = `joinedAt_${roomId}_${userId}`;
        AsyncStorage.removeItem(storageKey).catch(() => {});
      }
    });
    return unsubscribe;
  }, [navigation, userId, roomId]);
  const deleteRoomMutation = trpc.rooms.deleteRoom.useMutation();
  const createReactionMutation = trpc.reactions.create.useMutation();
  const createAudioMutation = trpc.audio.create.useMutation();
  const uploadAudioMutation = trpc.uploadAudio.useMutation();

  const createKhaloohaCommandMutation = trpc.khalooha.stop.useMutation();
  const generateSheelohaMutation = trpc.audio.generateSheeloha.useMutation();
  const updateProfileMutation = trpc.profile.update.useMutation();

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
        await AudioModule.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
        console.log("[RoomScreen] Audio mode initialized");
        
        // Step 3: Create and release a test recorder to warm up the system
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
  // Tarouk player
  const { playTarouk, stopTarouk } = useTaroukPlayer();
  
  // مشغّل الشيلوها
  const sheelohaPlayer = useSheelohaPlayer();
  
  // تنظيف الأصوات عند الخروج من الساحة
  useEffect(() => {
    return () => {
      console.log("[RoomScreen] Unmounting - cleaning up all audio players");
      // إيقاف جميع الأصوات (تستمر حتى تنتهي ولا تستكمل عند العودة)
      stop();
      stopTarouk();
      sheelohaPlayerRef.current.stop();
    };
  }, [stop, stopTarouk]);

  // refs للوصول لأحدث قيمة بدون إعادة تسجيل الـ callback
  const sheelohaPlayerRef = useRef(sheelohaPlayer);
  sheelohaPlayerRef.current = sheelohaPlayer;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // إعداد Socket callbacks - يُسجَّل مرة واحدة فقط عند تغيير roomId
  useEffect(() => {
    if (!roomId || roomId <= 0) return;

    setCallbacks({
      // استقبال أمر تشغيل رسالة صوتية عند الجميع (من الخادم)
      onPlayAudioMessage: (data) => {
        console.log("[RoomScreen] Play audio message via Socket.io:", data);
        const isSender = data.userId === userIdRef.current;

        // المرسل: يتجاهل (يشغل محلياً)
        if (isSender) {
          console.log("[RoomScreen] Sender skipping broadcast - plays locally");
          return;
        }

        // فحص مخفف: فقط إذا مضى أكثر من 30 ثانية نتجاهله
        const elapsed = (Date.now() - data.startTime) / 1000;
        if (elapsed > 30) {
          console.log(`[RoomScreen] Audio too old (${elapsed.toFixed(1)}s) - skipping`);
          return;
        }

        console.log(`[RoomScreen] Playing audio (elapsed: ${elapsed.toFixed(1)}s, type: ${data.messageType})`);

        // لا نشغّل الأصوات أثناء التسجيل
        if (isRecordingRef.current) {
          console.log("[RoomScreen] Skipping audio play - recording in progress");
          return;
        }

        if (data.messageType === "comment") {
          // التعليق: يشتغل بالتوازي مع أي صوت آخر
          try {
            const commentPlayer = createAudioPlayer(data.audioUrl);
            commentPlayer.volume = 1.0;
            commentPlayer.play();
            activePlayersRef.current.push(commentPlayer);
            setTimeout(() => {
              try { commentPlayer.release(); } catch (_) {}
              activePlayersRef.current = activePlayersRef.current.filter(p => p !== commentPlayer);
            }, 120000);
          } catch (e) {
            console.error("[RoomScreen] Failed to play comment:", e);
          }
        } else {
          // الطاروق: إيقاف الشيلوها أولاً ثم تشغيل الطاروق
          sheelohaPlayerRef.current.stop();
          try {
            const taroukPlayer = createAudioPlayer(data.audioUrl);
            taroukPlayer.volume = 1.0;
            taroukPlayer.play();
            activePlayersRef.current.push(taroukPlayer);
            setTimeout(() => {
              try { taroukPlayer.release(); } catch (_) {}
              activePlayersRef.current = activePlayersRef.current.filter(p => p !== taroukPlayer);
            }, 120000);
          } catch (e) {
            console.error("[RoomScreen] Failed to play tarouk:", e);
          }
        }
      },

      // استقبال أمر الشيلوها
      onPlaySheeloha: (data: SheelohaPayload) => {
        console.log("[RoomScreen] Sheeloha command received:", data);
        if (data.userId === userId) return;
        if (isRecordingRef.current) return; // لا شيلوها أثناء التسجيل
        sheelohaPlayerRef.current.stop();
        sheelohaPlayerRef.current.play({
          taroukUrl: data.sheelohaUrl,
          taroukDuration: data.taroukDuration,
        });
      },
      // حدث حظر المستخدم - إخراجه فوراً من الساحة
      onUserBanned: (data: { userId: string; banType: string }) => {
        if (data.userId === userId) {
          const msg = data.banType === 'permanent'
            ? 'تم حظرك بشكل دائم.'
            : 'تم حظرك مؤقتاً. العملية تحت المراجعة.';
          Alert.alert('تم حظرك', msg, [
            { text: 'حسناً', onPress: () => router.replace('/(tabs)') }
          ]);
        }
      },
    });
  }, [roomId, setCallbacks]);

  // جلب البيانات مع polling كنسخة احتياطية + Socket.io للتحديثات الفورية
  const { data: initialAudioMessages, refetch: refetchAudioMessages } = trpc.audio.list.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 1000 } // polling كل 1 ثانية لظهور أسرع
  );

  const { data: initialReactions, refetch: refetchReactions } = trpc.reactions.list.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 2000 } // polling كل 2 ثانية
  );


  
  // دمج البيانات الأولية مع التحديثات عبر Socket.io
  const audioMessages = useMemo(() => {
    const initial = initialAudioMessages || [];
    const socket = socketAudioMessages || [];
    // دمج وإزالة التكرار
    const merged = [...socket];
    for (const msg of initial) {
      if (!merged.some(m => m.id === msg.id)) {
        merged.push(msg);
      }
    }
    return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [initialAudioMessages, socketAudioMessages]);
  
  const reactions = useMemo(() => {
    const initial = initialReactions || [];
    const socket = socketReactions || [];
    // دمج وإزالة التكرار
    const merged = [...socket];
    for (const r of initial) {
      if (!merged.some(m => m.id === r.id)) {
        merged.push(r);
      }
    }
    return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [initialReactions, socketReactions]);
  


  // جلب أولي لأمر خلوها (بدون polling - التحديثات عبر Socket.io)
  const { data: initialKhaloohaCommand } = trpc.khalooha.latest.useQuery(
    { roomId },
    { enabled: roomId > 0, staleTime: Infinity } // جلب مرة واحدة فقط
  );
  
  // دمج أمر خلوها الأولي مع التحديثات عبر Socket.io
  const latestKhaloohaCommand = useMemo(() => {
    if (socketKhaloohaCommand) return socketKhaloohaCommand;
    return initialKhaloohaCommand;
  }, [initialKhaloohaCommand, socketKhaloohaCommand]);

  // جلب أولي لحالة التسجيل (بدون polling - التحديثات عبر Socket.io)
  const { data: initialActiveRecordings } = trpc.recording.getActive.useQuery(
    { roomId },
    { enabled: roomId > 0, staleTime: Infinity } // جلب مرة واحدة فقط
  );
  
  // دمج حالة التسجيل الأولية مع التحديثات عبر Socket.io
  const activeRecordings = useMemo(() => {
    const initial = initialActiveRecordings || [];
    const socket = socketActiveRecordings || [];
    // دمج وإزالة التكرار
    const merged = [...socket];
    for (const r of initial) {
      if (!merged.some(m => m.userId === r.userId)) {
        merged.push(r);
      }
    }
    return merged;
  }, [initialActiveRecordings, socketActiveRecordings]);

  // Debug: Log activeRecordings changes
  useEffect(() => {
    if (activeRecordings && activeRecordings.length > 0) {
      console.log("[RoomScreen] Active recordings:", activeRecordings.map(r => ({ userId: r.userId, username: r.username, isRecording: r.isRecording, type: r.recordingType })));
      console.log("[RoomScreen] Current userId:", userId, "creatorId:", roomData?.creatorId);
    }
  }, [activeRecordings, userId, roomData?.creatorId]);

  // Mutations for recording status
  const setRecordingStatusMutation = trpc.recording.setStatus.useMutation();
  const clearRecordingStatusMutation = trpc.recording.clear.useMutation();

  // Mutations for control state (taroukController + clappingDelay)
  const setTaroukControllerMutation = trpc.rooms.setTaroukController.useMutation();
  const setClappingDelayMutation = trpc.rooms.setClappingDelay.useMutation();

  // Polling لحالة التحكم (المتحكم + السرعة) - كل 500ms للتحديث الفوري
  const { data: controlState } = trpc.rooms.getControlState.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 500 } // polling سريع للتحكم
  );

  // Show ALL messages in the feed (don't filter by joinedAt)
  // But only AUTO-PLAY messages sent AFTER user joined
  // Add 5 second safety margin to avoid losing messages sent right after joining
  const SAFETY_MARGIN_MS = 5000; // 5 seconds
  
  // حالة محلية للرسائل المؤقتة (Optimistic Updates - مثل الواتساب)
  type LocalMessage = {
    type: "audio" | "reaction";
    id: string;
    timestamp: Date;
    username: string;
    userId?: string;
    messageType?: string;
    audioUrl?: string;
    duration?: number;
    reactionType?: string;
    createdAt?: Date;
    isLocal?: boolean; // علامة للرسائل المحلية
  };
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  
  // All messages are shown in the feed
  const filteredAudioMessages = audioMessages || [];
  
  // All reactions are shown in the feed
  const filteredReactions = reactions || [];

  // Combine filtered audio messages and reactions into a single feed (memoized for performance)
  const combinedFeed = useMemo(() => {
    const serverMessages: LocalMessage[] = [
      ...filteredAudioMessages.map((msg) => ({
        type: "audio" as const,
        id: `audio-${msg.id}`,
        timestamp: msg.createdAt,
        username: msg.username,
        userId: msg.userId,
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
    ];
    
    // دمج الرسائل المحلية مع رسائل الخادم (إزالة المكررات)
    const serverIds = new Set(serverMessages.map(m => m.id));
    const uniqueLocalMessages = localMessages.filter(m => !serverIds.has(m.id.replace('local-', '')));
    
    return [...serverMessages, ...uniqueLocalMessages]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [filteredAudioMessages, filteredReactions, localMessages]);

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
    
    // Return audio URL string for sheeloha button
    return lastTarouk.audioUrl;
  }, [audioMessages]); // Use full audioMessages as dependency to catch all changes

  // تم إلغاء تحديث sufoofSound - الصوت الأصلي (lastTaroukUri) يُستخدم مباشرة

  // تشغيل الصوت يتم فقط عبر Socket.io (onPlayAudioMessage) - فوري بدون انتظار
  // لا يوجد auto-play من polling لمنع التكرار والتأخير

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
      
      console.log("[RoomScreen] Khalooha command from:", latestKhaloohaCommand.username);
      // إيقاف الشيلوها وتشغيل التصفيق الختامي
      sheelohaPlayer.stop();
      stop();
      try {
        const finalClapAsset = require("@/assets/sounds/sheeloha-claps.m4a");
        const finalClapPlayer = createAudioPlayer(finalClapAsset);
        finalClapPlayer.volume = 0.225;
        finalClapPlayer.loop = false;
        finalClapPlayer.play();
      } catch (_) {}
    } else if (latestKhaloohaCommand.id !== lastProcessedKhaloohaId && latestKhaloohaCommand.userId === userId) {
      setLastProcessedKhaloohaId(latestKhaloohaCommand.id);
    }
  }, [latestKhaloohaCommand, lastProcessedKhaloohaId, userId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (combinedFeed.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [combinedFeed.length]);

  useEffect(() => {
    if (roomData && username) {
      const participant = roomData.participants.find((p) => p.username === username);
      if (participant) {
        console.log("[RoomScreen] Participant found:", participant);
        // Update role and approval status immediately
        const newRole = participant.role as "creator" | "player" | "viewer";
        const newApproved = participant.status === "accepted";
        
        // Only update if changed to avoid unnecessary re-renders
        lastKnownRoleRef.current = newRole;
      lastKnownApprovedRef.current = newApproved;

      if (userRole !== newRole) {
          console.log("[RoomScreen] Role changed:", userRole, "->", newRole);
          setUserRole(newRole);
        }
        if (isApproved !== newApproved) {
          console.log("[RoomScreen] Approval changed:", isApproved, "->", newApproved);
          setIsApproved(newApproved);
        }
        console.log("[RoomScreen] Role:", newRole, "Status:", participant.status, "Approved:", newApproved);
      } else {
        // المستخدم لم يعد موجوداً في الساحة - ربما تم استبعاده
        // إذا كان لديه دور سابق (ليس null) وليس المنشئ وكان مقبولاً، فهذا يعني أنه تم استبعاده
        // إذا لم يكن مقبولاً (طلب معلق)، فهذا يعني أنه خرج بنفسه أو رُفض طلبه
        if (userRole && userRole !== "creator" && isApproved) {
          console.log("[RoomScreen] User was kicked from the room");
          // إعادة ضبط الحالة لمنع التكرار
          setUserRole(null);
          setIsApproved(false);
          // تنفيذ الخروج فوراً بدون انتظار تفاعل المستخدم
          router.replace("/");
          Alert.alert(
            "تم استبعادك",
            "تم استبعادك من الساحة بواسطة المنشئ"
          );
        } else {
          console.log("[RoomScreen] Participant not found for username:", username);
        }
      }
    }
  }, [roomData, username, userRole, isApproved]);

  // عرض إشعار التعليمات للمنشئ عند إنشاء أول ساحة (مرة واحدة فقط)
  useEffect(() => {
    const checkFirstRoom = async () => {
      if (userRole === "creator" && roomData) {
        const tutorialShown = await AsyncStorage.getItem('creator_tutorial_shown');
        if (tutorialShown !== 'true') {
          setShowCreatorTutorial(true);
          await AsyncStorage.setItem('creator_tutorial_shown', 'true');
        }
      }
    };
    checkFirstRoom();
  }, [userRole, roomData]);

  // Kick player mutation (creator only)
  const kickPlayerMutation = trpc.kick.player.useMutation({
    onSuccess: (_, variables) => {
      // إعادة ضبط المتحكم إذا كان اللاعب المستبعد هو المتحكم
      if (taroukController === "player1" && variables.playerId === player1?.userId) {
        setTaroukController(null);
      } else if (taroukController === "player2" && variables.playerId === player2?.userId) {
        setTaroukController(null);
      }
      refetch();
    },
    onError: (error) => {
      Alert.alert("خطأ", error.message);
    },
  });

  // Handle kick player
  const handleKickPlayer = (playerId: string, playerName: string) => {
    Alert.alert(
      "استبعاد الشاعر",
      `هل تريد استبعاد ${playerName} من الساحة؟`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "استبعاد",
          style: "destructive",
          onPress: () => {
            kickPlayerMutation.mutate({
              roomId,
              playerId,
              creatorId: userId || "",
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
  
  // جلب طلبات الانضمام - polling كل 3 ثواني + Socket.io للتحديثات الفورية
  const { data: serverJoinRequests, refetch: refetchJoinRequests } = trpc.joinRequests.getPending.useQuery(
    { roomId },
    { enabled: isRoomCreator && roomId > 0, refetchInterval: 3000 } // polling كل 3 ثواني كـ fallback
  );
  
  // دمج طلبات الانضمام من الخادم وSocket.io (بدون تكرار)
  const joinRequests = useMemo(() => {
    const serverData = serverJoinRequests || [];
    const socketData = socketJoinRequests || [];
    // دمج بدون تكرار
    const merged = [...socketData];
    serverData.forEach((req: any) => {
      if (!merged.some(r => r.id === req.id)) {
        merged.push(req);
      }
    });
    return merged;
  }, [serverJoinRequests, socketJoinRequests]);
  
  // Log join requests for debugging
  useEffect(() => {
    if (isRoomCreator) {
      console.log("[RoomScreen] Join requests updated (Socket.io + Server):", joinRequests?.length || 0, joinRequests);
    }
  }, [joinRequests, isRoomCreator]);
  
  // نظام الطابور الموحد: دمج طلبات المشاهدين وطلبات الدخول كلاعب في طابور واحد
  // عرض 2 طلبات فقط لمدة 10 ثواني ثم التالية
  const allRequests = useMemo(() => {
    // دمج الطلبات من النوعين مع تحديد النوع
    const viewerReqs = (joinRequests || []).map((req: any) => ({ ...req, requestType: 'viewer' }));
    const playerReqs = (pendingRequests || []).map((req: any) => ({ ...req, requestType: 'player' }));
    // ترتيب حسب وقت الإنشاء (الأقدم أولاً) مع إزالة التكرار
    const combined = [...viewerReqs, ...playerReqs];
    const unique = combined.filter((req, idx) => 
      combined.findIndex(r => r.requesterId === req.requesterId && r.requestType === req.requestType) === idx
    );
    return unique.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    });
  }, [joinRequests, pendingRequests]);
  
  useEffect(() => {
    if (!isRoomCreator || allRequests.length === 0) {
      setDisplayedRequests([]);
      setQueuedRequests([]);
      return;
    }
    
    // إضافة الطلبات الجديدة للطابور (مع منع التكرار بناء على userId + requestType)
    const newRequests = allRequests.filter((req: any) => {
      const key = `${req.requestType}-${req.id}`;
      // تجاهل الطلبات التي تم التعامل معها سابقاً
      if (handledRequestIdsRef.current.has(key)) return false;
      return (
        !displayedRequests.some(d => (d.id === req.id || d.requesterId === req.requesterId) && d.requestType === req.requestType) && 
        !queuedRequests.some(q => (q.id === req.id || q.requesterId === req.requesterId) && q.requestType === req.requestType)
      );
    });
    
    if (newRequests.length > 0) {
      // إذا كان هناك مكان في العرض (أقل من 2)
      if (displayedRequests.length < 2) {
        const slotsAvailable = 2 - displayedRequests.length;
        const toDisplay = newRequests.slice(0, slotsAvailable);
        const toQueue = newRequests.slice(slotsAvailable);
        setDisplayedRequests(prev => [...prev, ...toDisplay]);
        setQueuedRequests(prev => [...prev, ...toQueue]);
      } else {
        // إضافة للطابور
        setQueuedRequests(prev => [...prev, ...newRequests]);
      }
    }
  }, [allRequests, isRoomCreator]);
  
  // مؤقت 10 ثواني لحذف الطلبات المعروضة وعرض التالية
  useEffect(() => {
    if (displayedRequests.length === 0) return;
    
    const timer = setTimeout(() => {
      // حذف/رفض الطلبات المعروضة حسب نوعها
      displayedRequests.forEach((req: any) => {
        if (req.requestType === 'viewer') {
          expireJoinRequestMutation.mutate({ requestId: req.id });
        } else {
          respondToRequestMutation.mutate({ participantId: req.id, accept: false });
        }
      });
      
      // عرض أول 2 من الطابور
      const nextBatch = queuedRequests.slice(0, 2);
      const remaining = queuedRequests.slice(2);
      
      setDisplayedRequests(nextBatch);
      setQueuedRequests(remaining);
    }, 10000);
    
    return () => clearTimeout(timer);
  }, [displayedRequests]);

  // Expire join request mutation
  const expireJoinRequestMutation = trpc.joinRequests.expire.useMutation();
  
  // Create join request mutation (for viewers)
  const createJoinRequestMutation = trpc.joinRequests.create.useMutation({
    onSuccess: (data) => {
      console.log("[RoomScreen] Join request created successfully:", data);
      // الحالة تم تحديثها فوراً في handleRequestJoinAsPlayer
      // Immediately refetch to show request to creator
      refetch();
      // Auto-expire after 10 seconds
      setTimeout(() => {
        setHasPendingRequest(false);
        // Also expire in database
        if (data.requestId) {
          expireJoinRequestMutation.mutate({ requestId: data.requestId });
        }
      }, 10000);
    },
    onError: (error) => {
      Alert.alert("خطأ", error.message);
    },
  });

  // Respond to join request mutation (for creator)
  const respondToJoinRequestMutation = trpc.joinRequests.respond.useMutation({
    onSuccess: async (data, variables) => {
      // Immediately refetch all data for instant update
      await Promise.all([
        refetchJoinRequests(),
        refetch(),
      ]);
      if (variables.accept) {
        Alert.alert("تم القبول", "تم قبول الشاعر في الساحة");
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
    
    // تحديث فوري للحالة قبل انتظار الخادم - لسرعة الاستجابة
    setHasPendingRequest(true);
    setLastRequestTime(Date.now());
    
    console.log("[RoomScreen] Sending join request...");
    createJoinRequestMutation.mutate({
      roomId,
      userId,
      username,
      avatar: avatar || "male",
    });
  };

  // Handle creator response to join request
  const handleRespondToJoinRequest = (requestId: number, requestUserId: string, accept: boolean) => {
    respondToJoinRequestMutation.mutate({
      requestId,
      accept,
      roomId,
      userId: requestUserId,
    });
  };


  // Mutation لإرسال الدعوة العامة
  const sendPublicInviteMutation = trpc.publicInvitations.create.useMutation({
    onSuccess: () => {
      setCanSendPublicInvite(false);
      setLastPublicInviteTime(Date.now());
      Alert.alert("تم", "تم إرسال الدعوة العامة بنجاح");
      // إعادة تفعيل الزر بعد 5 دقائق
      setTimeout(() => {
        setCanSendPublicInvite(true);
      }, 5 * 60 * 1000);
    },
    onError: (error) => {
      Alert.alert("خطأ", error.message || "فشل إرسال الدعوة العامة");
      setIsSendingPublicInvite(false);
    },
  });

  // حالة نافذة الدعوة العامة
  const [showPublicInviteModal, setShowPublicInviteModal] = useState(false);
  const [publicInviteText, setPublicInviteText] = useState('');

  // دالة إرسال الدعوة العامة
  const handleSendPublicInvite = () => {
    if (!canSendPublicInvite || isSendingPublicInvite) return;
    setPublicInviteText('');
    setShowPublicInviteModal(true);
  };

  // دالة تأكيد إرسال الدعوة
  const confirmSendPublicInvite = async (_text?: string) => {
    const limitedText = (_text || publicInviteText || '').trim().substring(0, 70) || 'حياكم الله..';
    setShowPublicInviteModal(false);
    setIsSendingPublicInvite(true);
    try {
      await sendPublicInviteMutation.mutateAsync({
        roomId,
        creatorId: userId,
        creatorName: username || '',
        creatorAvatar: avatar || 'male',
        roomName: roomData?.name || 'ساحة المحاورة',
        message: limitedText,
      });
    } finally {
      setIsSendingPublicInvite(false);
    }
  };

  // Share invite link using web URL (clickable in messaging apps)
  const handleShareInvite = async () => {
    try {
      console.log("[Share] pressed, roomData:", !!roomData, "username:", username);
      // رابط Railway الثابت
      const webBaseUrl = 'https://sahaat-production.up.railway.app';
      
      // اسم من أرسل الدعوة (المستخدم الحالي)
      const senderName = username || '';
      
      const inviteUrl = `${webBaseUrl}/invite/${roomId}?inviter=${encodeURIComponent(senderName)}`;
      const roomName = roomData?.name || 'ساحة الطواريق';
      
      const message = `🎙️ دعوة للانضمام إلى ساحة الطواريق\n\n` +
        `📍 اسم الساحة: ${roomName}\n` +
        `👤 الداعي: ${senderName}\n\n` +
        `انضم الآن كشاعر أو مستمع:\n${inviteUrl}`;
      
      await Share.share({
        message: message + '\n' + inviteUrl,
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
      Alert.alert("تم القبول", "تم قبول الشاعر بنجاح");
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
      Alert.alert("تم الرفض", "تم رفض الطلب. المستخدم الآن مستمع");
    } catch (error) {
      console.error("[RoomScreen] Error rejecting request:", error);
      Alert.alert("خطأ", "حدث خطأ أثناء رفض الطلب");
    }
  };

  // Handle saving profile changes
  const handleSaveProfile = async (newName: string, newAvatar: string) => {
    try {
      // Update local user context
      await setUserData(newName, newAvatar);
      
      // Update participant in database
      await updateProfileMutation.mutateAsync({
        roomId,
        userId,
        username: newName,
        avatar: newAvatar,
      });
      
      // Refresh room data
      refetch();
    } catch (error) {
      console.error("Failed to save profile:", error);
      throw error;
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

  // Ref to track if recording was cancelled
  const recordingCancelledRef = useRef(false);
  const isRecordingRef = useRef(false); // يمنع تشغيل الأصوات أثناء التسجيل
  const activePlayersRef = useRef<any[]>([]); // تتبع كل الـ players النشطة

  const handleStartRecording = async (type: "comment" | "tarouk") => {
    console.log("[RoomScreen] handleStartRecording called with type:", type);
    
    // التحقق من عدم وجود تسجيل جاري
    if (isRecording || isPreparing) {
      console.log("[RoomScreen] Already recording or preparing, ignoring");
      return;
    }
    
    // Reset cancelled flag
    recordingCancelledRef.current = false;
    
    setRecordingType(type);
    
    // تفعيل الحالة المحلية فوراً لعرض الدائرة الحمراء بدون أي تأخير
    setLocalRecordingActive(true);
    setLocalRecordingType(type);
    console.log("[RoomScreen] Local recording indicator activated IMMEDIATELY");
    
    // إرسال حالة التسجيل للخادم لعرض المؤشر للآخرين (بدون انتظار)
    if (username && userId) {
      // إرسال بدون await للسرعة الفورية
      setRecordingStatusMutation.mutate({
        roomId,
        userId,
        username,
        isRecording: true,
        recordingType: type,
      });
      // تحديث فوري لعرض المؤشر بدون انتظار polling
      // Socket.io يحدث تلقائياً
      console.log("[RoomScreen] Recording status sent to server IMMEDIATELY (no await)");
    }
    
    // كتم جميع الأصوات المشغلة أثناء التسجيل
    console.log("[RoomScreen] Stopping all audio before recording...");
    isRecordingRef.current = true; // منع تشغيل الأصوات الجديدة
    stop();
    // إيقاف كل الـ players النشطة
    activePlayersRef.current.forEach(p => { try { p.pause(); p.release(); } catch (_) {} });
    activePlayersRef.current = [];
    sheelohaPlayerRef.current.stop(); // إيقاف تشغيل الرسائل الصوتية
    // stopTarouk() محذوف - كان يسبب "Cannot use shared object that was already released"
    
    // تحويل مخرج الصوت إلى سماعة الأذن أثناء التسجيل (لمنع التقاط المايك للأصوات)
    if (Platform.OS !== "web") {
      try {
        await AudioModule.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          playThroughEarpieceAndroid: true,
        });
        console.log("[RoomScreen] Audio output switched to earpiece for recording");
      } catch (e) {
        console.log("[RoomScreen] Could not switch audio output:", e);
      }
    }
    
    try {
      console.log("[RoomScreen] Calling startRecording...");
      const success = await startRecording();
      
      // التحقق من أن التسجيل لم يُلغَ أثناء التحضير - استخدام ref بدلاً من state
      if (recordingCancelledRef.current) {
        console.log("[RoomScreen] Recording was cancelled during preparation");
        // مسح حالة التسجيل من الخادم
        if (userId) {
          try {
            await clearRecordingStatusMutation.mutateAsync({ roomId, userId });
            // Socket.io يحدث تلقائياً
          } catch (err) {
            console.error("[RoomScreen] Failed to clear recording status:", err);
          }
        }
        return;
      }
      
      console.log("[RoomScreen] startRecording returned:", success);
      if (!success) {
        console.log("[RoomScreen] First attempt failed, retrying...");
        // #4: إعادة محاولة تلقائية بعد تأخير بسيط
        await new Promise(r => setTimeout(r, 300));
        const retrySuccess = await startRecording();
        if (!retrySuccess) {
          console.error("[RoomScreen] Recording failed after retry");
          if (userId) {
            try {
              await clearRecordingStatusMutation.mutateAsync({ roomId, userId });
            } catch (err) {
              console.error("[RoomScreen] Failed to clear recording status:", err);
            }
          }
          if (!recordingCancelledRef.current) {
            Alert.alert("خطأ", "فشل بدء التسجيل. تأكد من أذونات المايكروفون.");
            setRecordingType(null);
          }
          return;
        }
      }
    } catch (error) {
      console.error("[RoomScreen] Recording error:", error);
      // مسح حالة التسجيل من الخادم
      if (userId) {
        try {
          await clearRecordingStatusMutation.mutateAsync({ roomId, userId });
          // Socket.io يحدث تلقائياً
        } catch (err) {
          console.error("[RoomScreen] Failed to clear recording status:", err);
        }
      }
      // لا تعرض رسالة خطأ إذا تم الإلغاء من قبل المستخدم
      if (!recordingCancelledRef.current) {
        const errorMessage = error instanceof Error ? error.message : "فشل بدء التسجيل";
        Alert.alert("خطأ", errorMessage);
        setRecordingType(null);
      }
    }
  };

  const handleCancelRecording = async () => {
    console.log("[RoomScreen] Canceling recording - DELETE without saving...");
    
    // تعيين علم الإلغاء
    recordingCancelledRef.current = true;
    
    // إعادة تعيين حالة التسجيل فوراً
    setRecordingType(null);
    // إلغاء الحالة المحلية فوراً
    setLocalRecordingActive(false);
    setLocalRecordingType(null);
    console.log("[RoomScreen] Local recording indicator deactivated (cancel)");
    
    try {
      // إيقاف التسجيل بدون حفظ - سيتم تجاهل التسجيل
      const result = await stopRecording();
      console.log("[RoomScreen] Recording stopped and discarded:", result);
      console.log("[RoomScreen] Recording canceled successfully - NOT sent");
      
      // مسح حالة التسجيل من الخادم
      if (userId) {
        try {
          await clearRecordingStatusMutation.mutateAsync({ roomId, userId });
          // تحديث فوري لإخفاء المؤشر بدون انتظار polling
          // Socket.io يحدث تلقائياً
        } catch (err) {
          console.error("[RoomScreen] Failed to clear recording status:", err);
        }
      }
    } catch (error) {
      console.error("[RoomScreen] Error canceling recording:", error);
      // تأكد من إعادة تعيين الحالة حتى عند الخطأ
      setRecordingType(null);
    }
  };

  const handleStopRecording = async () => {
    console.log("[RoomScreen] ========== handleStopRecording START ==========");
    // Capture the current recording type before it gets reset
    const currentRecordingType = recordingType;
    console.log("[RoomScreen] currentRecordingType:", currentRecordingType);
    
    if (!currentRecordingType) {
      console.log("[RoomScreen] No recording type, returning");
      return;
    }
    
    // مسح حالة التسجيل فوراً عند إفلات الزر (قبل رفع الملف)
    setRecordingType(null);
    // إلغاء الحالة المحلية فوراً
    setLocalRecordingActive(false);
    setLocalRecordingType(null);
    console.log("[RoomScreen] Local recording indicator deactivated IMMEDIATELY");
    if (userId) {
      clearRecordingStatusMutation.mutate({ roomId, userId });
      // Socket.io يحدث تلقائياً
    }
    
    // إعادة مخرج الصوت إلى مكبر الصوت بعد انتهاء التسجيل
    isRecordingRef.current = false; // السماح بتشغيل الأصوات مجدداً
    if (Platform.OS !== "web") {
      try {
        await AudioModule.setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          playThroughEarpieceAndroid: false,
        });
        console.log("[RoomScreen] Audio output restored to speaker after recording");
      } catch (e) {
        console.log("[RoomScreen] Could not restore audio output:", e);
      }
    }
    
    try {
      let recording = await stopRecording();
      
      // #2: إذا فشل التسجيل (null)، إعادة محاولة بعد تأخير قصير
      if (!recording) {
        console.log("[RoomScreen] First stopRecording returned null, retrying after delay...");
        await new Promise(r => setTimeout(r, 500));
        recording = await stopRecording();
      }
      
      if (!recording) {
        console.error("[RoomScreen] Recording is null after retry - showing error");
        Alert.alert("خطأ", "فشل حفظ الصوت. حاول مرة أخرى.");
        console.log("[RoomScreen] ========== handleStopRecording END (FAILED) ==========");
        return;
      }
      
      console.log("[RoomScreen] Recording obtained successfully");
      
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
          base64Data = await FileSystem.readAsStringAsync(recording.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        
        // رفع الصوت على S3
        const isTarouk = currentRecordingType === "tarouk";
        console.log("[RoomScreen] Starting upload, isTarouk:", isTarouk);
        const uploadResult = await uploadAudioMutation.mutateAsync({
          base64Data,
          fileName: `recording-${Date.now()}.${Platform.OS === "web" ? "webm" : "m4a"}`,
          speedUp: isTarouk,
        });
        const { url } = uploadResult;
        
        console.log("[RoomScreen] Audio uploaded successfully:", url);
        
        // تشغيل محلي فوري للمرسل فقط (الآخرون يستقبلون عبر Socket.io)
        // طاروق وتعليق يعملان بنفس الطريقة تماماً
        try {
          const player = createAudioPlayer(url);
          player.volume = 1.0;
          player.play();
          setTimeout(() => { try { player.release(); } catch (_) {} }, 120000);
          console.log(`[RoomScreen] ${currentRecordingType} playing locally for sender`);
        } catch (e) {
          console.error(`[RoomScreen] Failed to play local ${currentRecordingType}:`, e);
        }
        
        // حفظ في قاعدة البيانات + بث للآخرين عبر الخادم
        console.log("[RoomScreen] Saving to database, messageType:", currentRecordingType);
        await createAudioMutation.mutateAsync({
          roomId,
          userId,
          username,
          messageType: currentRecordingType,
          audioUrl: url,
          duration: recording.duration || 0,
        });
        console.log("[RoomScreen] Saved to database successfully");
        
        // Refresh audio messages فوراً
        console.log("[RoomScreen] Refetching audio messages...");
        await refetchAudioMessages();
        console.log("[RoomScreen] ========== handleStopRecording END (SUCCESS) ==========");
      }
    } catch (error) {
      console.log("[RoomScreen] ========== handleStopRecording END (ERROR) ==========");
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : '';
      console.error("Failed to save audio message:", errMsg);
      console.error("Error stack:", errStack);
      Alert.alert("خطأ", `فشل حفظ الرسالة الصوتية:\n${errMsg}`);
    }
  };

  const handleReaction = async (reactionType: string) => {
    if (!username) {
      console.error("[RoomScreen] Cannot send reaction: username is missing");
      Alert.alert("خطأ", "الاسم غير موجود");
      return;
    }

    // إرسال التفاعل مباشرة بدون optimistic update
    // التفاعل سيظهر فقط عند وصوله عبر Socket.io لتجنب التكرار
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

  // تحديد اللاعبين - يجب أن يكون قبل أي early return
  const player1 = useMemo(() => {
    return roomData?.participants?.find(
      (p) => p.role === "player" && p.status === "accepted"
    ) || null;
  }, [roomData?.participants]);
  
  const player2 = useMemo(() => {
    const players = roomData?.participants?.filter(
      (p) => p.role === "player" && p.status === "accepted"
    ) || [];
    return players.length > 1 ? players[1] : null;
  }, [roomData?.participants]);
  
  // إعادة ضبط المتحكم عند خروج اللاعب المتحكم
  useEffect(() => {
    if (taroukController === "player1" && !player1) {
      console.log("[RoomScreen] Player1 left, resetting taroukController");
      setTaroukController(null);
    } else if (taroukController === "player2" && !player2) {
      console.log("[RoomScreen] Player2 left, resetting taroukController");
      setTaroukController(null);
    }
  }, [taroukController, player1, player2]);
  
  // هل المستخدم الحالي هو المتحكم؟
  const isCurrentUserController = useMemo(() => {
    if (!taroukController) return false;
    if (taroukController === "creator" && userId === roomData?.creatorId) return true;
    if (taroukController === "player1" && userId === player1?.userId) return true;
    if (taroukController === "player2" && userId === player2?.userId) return true;
    return false;
  }, [taroukController, userId, roomData?.creatorId, player1?.userId, player2?.userId]);

  // تحديث الحالة المحلية عند وصول بيانات جديدة من الخادم (المتحكم + السرعة)
  useEffect(() => {
    if (controlState) {
      // تخطي جميع التحديثات إذا كان التغيير محلياً حديثاً (خلال 3 ثواني)
      // هذا يمنع التحديث المزدوج الذي يسبب اختفاء الأزرار
      const timeSinceLocalChange = Date.now() - lastLocalClappingChangeRef.current;
      const isRecentLocalChange = timeSinceLocalChange < 3000;
      
      if (isRecentLocalChange) {
        console.log("[RoomScreen] Skipping control state update - recent local change");
        return;
      }
      
      // تحديث المتحكم إذا تغير
      if (controlState.taroukController !== taroukController) {
        console.log("[RoomScreen] Control state update - taroukController:", controlState.taroukController);
        setTaroukController(controlState.taroukController);
      }
      // تحديث السرعة إذا تغيرت
      if (controlState.clappingDelay !== clappingDelay) {
        console.log("[RoomScreen] Control state update - clappingDelay:", controlState.clappingDelay);
        setClappingDelay(controlState.clappingDelay);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlState]); // فقط controlState لمنع الحلقة اللانهائية

  // Safety check: ensure all required data is available
  if (!userId || !username) {
    console.log("[RoomScreen] Missing user data, redirecting to welcome");
    router.replace("/welcome");
    return (
      <ScreenContainer>
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" />
        </View>
      </ScreenContainer>
    );
  }

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

  // effectiveRole: يستخدم lastKnownRef عند غياب userRole مؤقتاً (أثناء refetch)
  const effectiveRole = userRole || lastKnownRoleRef.current;
  const effectiveApproved = userRole ? isApproved : lastKnownApprovedRef.current;
  const isCreator = effectiveRole === "creator";
  const isPlayer = isCreator || (effectiveRole === "player" && effectiveApproved);
  const isViewer = effectiveRole === "viewer";
  
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
      {/* Header - نحاسي ذهبي متناسق مع الأزرار */}
      <View style={{
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        backgroundColor: '#1c1208',
        borderBottomWidth: 2,
        borderBottomColor: '#c8860a',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Left: Exit/Close button */}
        {isCreator ? (
          <TouchableOpacity 
            onPress={handleDeleteRoom}
            style={{
              backgroundColor: '#3d0a0a',
              borderWidth: 1,
              borderColor: '#c0392b',
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: '#ff6b6b', fontSize: 12, fontWeight: 'bold' }}>إغلاق</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            onPress={handleLeaveRoom}
            style={{
              backgroundColor: '#3d0a0a',
              borderWidth: 1,
              borderColor: '#c0392b',
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: '#ff6b6b', fontSize: 12, fontWeight: 'bold' }}>خروج</Text>
          </TouchableOpacity>
        )}
        
        {/* Center: Room info */}
        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
          <Text style={{ color: '#d4af37', fontSize: 18, fontWeight: 'bold', textAlign: 'center' }}>{roomData.name}</Text>
          <Text style={{ color: 'rgba(212,175,55,0.6)', fontSize: 11, textAlign: 'center', marginTop: 2 }}>
            {roomData.acceptedPlayersCount}/2 شعراء · {roomData.viewerCount} مستمعين
          </Text>
        </View>
        
        {/* Right: Share/Invite buttons */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* زر الدعوة العامة */}
          {isCreator && (
            <TouchableOpacity
              style={{ 
                backgroundColor: canSendPublicInvite ? '#2d1f0e' : '#1a1a1a',
                borderWidth: 1,
                borderColor: canSendPublicInvite ? '#c8860a' : '#444',
                paddingHorizontal: 10,
                paddingVertical: 7,
                borderRadius: 10,
                opacity: canSendPublicInvite ? 1 : 0.5,
              }}
              onPress={handleSendPublicInvite}
              disabled={!canSendPublicInvite || isSendingPublicInvite}
            >
              <Text style={{ color: canSendPublicInvite ? '#d4af37' : '#888', fontWeight: 'bold', fontSize: 11 }}>
                {isSendingPublicInvite ? 'جاري...' : 'دعوة عامة'}
              </Text>
            </TouchableOpacity>
          )}
          
          {/* زر المشاركة */}
          <TouchableOpacity
            style={{ alignItems: 'center', justifyContent: 'center' }}
            onPress={handleShareInvite}
          >
            <MaterialIcons name="share" size={22} color="#d4af37" />
            <Text style={{ fontSize: 10, fontWeight: 'bold', color: 'rgba(212,175,55,0.7)', marginTop: 2 }}>دعوة</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Guest Profile Bar - Show for guests (users with names starting with 'ضيف') */}
      {username && username.startsWith('ضيف') && (
        <View 
          className="px-4 py-2 flex-row items-center justify-between"
          style={{ backgroundColor: 'rgba(139, 69, 19, 0.1)' }}
        >
          <View className="flex-row items-center gap-2">
            <Image
              source={getAvatarSource(avatar)}
              className="w-8 h-8 rounded-full"
              resizeMode="cover"
            />
            <Text className="text-foreground font-medium">{username}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowEditProfileModal(true)}
            className="flex-row items-center gap-1 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: '#8B4513' }}
          >
            <MaterialIcons name="edit" size={16} color="white" />
            <Text className="text-white text-xs font-semibold">تعديل الملف</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* إشعار التعليمات للمنشئ - يظهر مرة واحدة فقط عند إنشاء أول ساحة */}
      <Modal
        visible={showCreatorTutorial}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCreatorTutorial(false)}
      >
        <Pressable
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            padding: 20,
          }}
          onPress={() => setShowCreatorTutorial(false)}
        >
          <View style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 2,
            borderColor: '#FFFFFF',
            borderRadius: 16,
            padding: 20,
            maxWidth: 350,
            width: '100%',
          }}>
             <Text style={{
              color: colors.foreground,
              fontSize: 17,
              fontWeight: 'bold',
              marginBottom: 12,
              textAlign: 'left',
            }}>
              للحصول على افضل تجربة استخدام:
            </Text>
            <Text style={{
              color: colors.foreground,
              fontSize: 16,
              lineHeight: 28,
              textAlign: 'left',
            }}>
              • استخدم زر طاروق لتسجيل أبيات البدع والرد وذلك بالضغط المستمر على زر طاروق للتسجيل، عند إفلات الزر يتم إرسال الصوت (يمكنك الحذف وإلغاء الإرسال أثناء التسجيل).{"\n"}
              • اثناء تسجيل الابيات احرص ان يكون التسجيل صافيا خاليا من الضوضاء والاصوات الاخرى لان هذا ماستردده الصفوف بعدك.{"\n"}
              • استخدم زر شيلوها لتجعل الصفوف تردد البيت حتى تجهز الرد او البيت التالي ( الصفوف ستردد اخر بيت مرسل من زر طاروق من اي من الشاعرين){"\n"}
              • زر خلوها يوقف الصفوف{"\n"}
              • للحوارات الجانبية أو للموال استخدم زر التعليق والموال.{"\n"}
              • التنسيق وادارة الملعبة مابين الشعراء . للخروج بملعبة نظيفة راقية خالية من التقاطعات والتداخلات التي تفسدها 🌹🌹.
            </Text>
            <Text style={{
              color: '#9CA3AF',
              fontSize: 14,
              marginTop: 16,
              textAlign: 'center',
            }}>
              انقر للإغلاق
            </Text>
          </View>
        </Pressable>
      </Modal>

      {/* نافذة الدعوة العامة */}
      <Modal
        visible={showPublicInviteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPublicInviteModal(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}
          onPress={() => setShowPublicInviteModal(false)}
        >
          <Pressable
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 24,
              width: '80%',
              maxWidth: 320,
            }}
            onPress={() => {}}
          >
            <Text style={{ fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, color: '#000' }}>
              دعوة عامة
            </Text>
            <Text style={{ fontSize: 13, textAlign: 'center', marginBottom: 16, color: colors.muted }}>
              اكتب العبارة أو بيت الشعر الذي تريد أن يظهر في بطاقة الدعوة
            </Text>
            <TextInput
              value={publicInviteText}
              onChangeText={(t) => setPublicInviteText(t.substring(0, 70))}
              maxLength={70}
              placeholder="حياكم الله.."
              placeholderTextColor="#999"
              style={{
                borderWidth: 1,
                borderColor: '#ddd',
                borderRadius: 10,
                padding: 12,
                fontSize: 12,
                textAlign: 'center',
                marginBottom: 20,
                color: '#000',
                backgroundColor: '#f9f9f9',
              }}
              returnKeyType="done"
              onSubmitEditing={() => confirmSendPublicInvite()}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#f0f0f0',
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: 'center',
                }}
                onPress={() => setShowPublicInviteModal(false)}
              >
                <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 15 }}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#EF4444',
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: 'center',
                }}
                onPress={() => confirmSendPublicInvite(publicInviteText || 'حياكم الله..')}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>إرسال</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* طلبات الانضمام الموحدة - نظام الطابور: 2 طلبات لمدة 10 ثواني */}
      {isRoomCreator && displayedRequests && displayedRequests.length > 0 && (
        <View className="px-6 py-3 border-b border-warning/30" style={{ backgroundColor: 'rgba(255, 193, 7, 0.15)' }}>
          {displayedRequests.map((request: any) => (
            <View key={`${request.requestType}-${request.id}`} className="flex-row items-center justify-between mb-2" style={{ backgroundColor: 'rgba(255, 215, 0, 0.2)', borderRadius: 8, padding: 10 }}>
              <View className="flex-row items-center flex-1">
                {request.avatar && (
                  <Image
                    source={getAvatarSource(request.avatar)}
                    style={{ width: 36, height: 36, borderRadius: 18, marginLeft: 8 }}
                  />
                )}
                <Text style={{ color: '#000', fontWeight: '600' }}>
                  {request.username} يريد الانضمام كشاعر
                </Text>
              </View>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="px-4 py-2 rounded-lg"
                  style={{ backgroundColor: '#22C55E' }}
                  onPress={() => {
                    const key = `${request.requestType}-${request.id}`;
                    handledRequestIdsRef.current.add(key);
                    if (request.requestType === 'viewer') {
                      handleRespondToJoinRequest(request.id, request.userId, true);
                    } else {
                      handleAcceptRequest(request.id);
                    }
                    // إزالة الطلب من العرض فوراً
                    setDisplayedRequests(prev => prev.filter(r => !(r.id === request.id && r.requestType === request.requestType)));
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>قبول</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="px-4 py-2 rounded-lg"
                  style={{ backgroundColor: '#EF4444' }}
                  onPress={() => {
                    const key = `${request.requestType}-${request.id}`;
                    handledRequestIdsRef.current.add(key);
                    if (request.requestType === 'viewer') {
                      handleRespondToJoinRequest(request.id, request.userId, false);
                    } else {
                      handleRejectRequest(request.id);
                    }
                    // إزالة الطلب من العرض فوراً
                    setDisplayedRequests(prev => prev.filter(r => !(r.id === request.id && r.requestType === request.requestType)));
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>رفض</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {/* عداد الطلبات المنتظرة */}
          {queuedRequests.length > 0 && (
            <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
              + {queuedRequests.length} طلبات في الانتظار
            </Text>
          )}
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
            const isCurrentUserPlayer1 = userId === player1?.userId;
            const isPlayer1RecordingFromServer = player1 && activeRecordings?.some(
              (r) => r.userId === player1.userId
            );
            const isPlayer1Recording = isCurrentUserPlayer1 ? (localRecordingActive || isPlayer1RecordingFromServer) : isPlayer1RecordingFromServer;
            const player1RecordingType = isCurrentUserPlayer1
              ? (localRecordingType || (activeRecordings?.find((r) => r.userId === player1?.userId)?.recordingType as "comment" | "tarouk" | undefined))
              : (activeRecordings?.find((r) => r.userId === player1?.userId)?.recordingType as "comment" | "tarouk" | undefined);
            return player1 ? (
              <View className="items-center" style={{ width: 60, position: 'relative' }}>
                <RecordingIndicator 
                  isVisible={!!isPlayer1Recording} 
                  recordingType={player1RecordingType || "tarouk"} 
                />
                <View style={{ position: 'relative' }}>
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
                  <InteractionButtons targetUserId={player1.userId} currentUserId={userId || ''} avatarSize={60} roomId={roomId} avatarBorderColor={isPlayer1Recording ? '#DC2626' : colors.success} />
                </View>
                <Text className="text-xs mt-4 text-center" numberOfLines={1} style={{ color: colors.foreground }}>
                  {player1.username}
                </Text>
              </View>
            ) : (
              <View style={{ width: 60 }} />
            );
          })()}

          {/* Creator (Center) */}
          {(() => {
            const isCurrentUserCreator = userId === roomData?.creatorId;
            const isCreatorRecordingFromServer = activeRecordings?.some(
              (r) => r.userId === roomData?.creatorId
            );
            const isCreatorRecording = isCurrentUserCreator ? (localRecordingActive || isCreatorRecordingFromServer) : isCreatorRecordingFromServer;
            const creatorRecordingType = isCurrentUserCreator 
              ? (localRecordingType || (activeRecordings?.find((r) => r.userId === roomData?.creatorId)?.recordingType as "comment" | "tarouk" | undefined))
              : (activeRecordings?.find((r) => r.userId === roomData?.creatorId)?.recordingType as "comment" | "tarouk" | undefined);
            return (
              <View className="items-center" style={{ width: 80, position: 'relative' }}>
                <RecordingIndicator 
                  isVisible={!!isCreatorRecording} 
                  recordingType={creatorRecordingType || "tarouk"} 
                />
                <View style={{ position: 'relative' }}>
                  <Image
                    source={getAvatarSource(roomData?.creatorAvatar)}
                    style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: isCreatorRecording ? '#DC2626' : colors.primary }}
                  />
                  <InteractionButtons targetUserId={roomData?.creatorId || ''} currentUserId={userId || ''} avatarSize={80} roomId={roomId} avatarBorderColor={isCreatorRecording ? '#DC2626' : colors.primary} />
                </View>
                <Text className="text-sm font-bold mt-4 text-center" numberOfLines={1} style={{ color: colors.foreground }}>
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
            // فصل الحالة المحلية عن الخادم لمنع الوميض
            const isCurrentUserPlayer2 = userId === player2?.userId;
            const isPlayer2RecordingFromServer = player2 && activeRecordings?.some(
              (r) => r.userId === player2.userId
            );
            const isPlayer2Recording = isCurrentUserPlayer2 ? (localRecordingActive || isPlayer2RecordingFromServer) : isPlayer2RecordingFromServer;
            const player2RecordingType = isCurrentUserPlayer2
              ? (localRecordingType || (activeRecordings?.find((r) => r.userId === player2?.userId)?.recordingType as "comment" | "tarouk" | undefined))
              : (activeRecordings?.find((r) => r.userId === player2?.userId)?.recordingType as "comment" | "tarouk" | undefined);
            return player2 ? (
              <View className="items-center" style={{ width: 60, position: 'relative' }}>
                <RecordingIndicator 
                  isVisible={!!isPlayer2Recording} 
                  recordingType={player2RecordingType || "tarouk"} 
                />
                <View style={{ position: 'relative' }}>
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
                  <InteractionButtons targetUserId={player2.userId} currentUserId={userId || ''} avatarSize={60} roomId={roomId} avatarBorderColor={isPlayer2Recording ? '#DC2626' : colors.success} />
                </View>
                <Text className="text-xs mt-4 text-center" numberOfLines={1} style={{ color: colors.foreground }}>
                  {player2.username}
                </Text>
              </View>
            ) : (
              <View style={{ width: 60 }} />
            );
          })()}
        </View>

        {/* Messages FlatList - مثل الواتساب للأداء العالي */}
        {combinedFeed.length > 0 ? (
          <FlatList
            ref={flatListRef}
            data={combinedFeed}
            keyExtractor={(item) => item.id}
            className="flex-1"
            showsVerticalScrollIndicator={true}
            contentContainerStyle={{ paddingBottom: 8, paddingHorizontal: 8 }}
            // تحسينات الأداء - Virtualization
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={10}
            removeClippedSubviews={Platform.OS !== "web"}
            getItemLayout={(data, index) => ({
              length: 60, // ارتفاع تقريبي لكل رسالة
              offset: 60 * index,
              index,
            })}
            renderItem={({ item }) => {
              if (item.type === "audio") {
                return (
                  <MessageBubble
                    type="audio"
                    username={item.username}
                    messageType={item.messageType}
                    duration={item.duration}
                    isPlaying={currentUri === item.audioUrl && isPlaying}
                    onPlay={() => handlePlayAudio(item.audioUrl || "")}
                    audioUrl={item.audioUrl}
                    audioMessageId={item.id.replace('audio-', '')}
                    senderUserId={item.userId}
                    currentUserId={userId}
                    currentUsername={username}
                  />
                );
              } else {
                return (
                  <ReactionMessage
                    username={item.username}
                    reactionType={item.reactionType || ""}
                    createdAt={item.createdAt}
                    isOwnMessage={item.username === username}
                  />
                );
              }
            }}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-muted text-center">
              💬 لم يتم إرسال رسائل بعد
            </Text>
          </View>
        )}
      </View>

      {/* #11: تم إزالة واجهة بداية الطاروق والاختيارات الثلاثة */}

      {/* Bottom Controls - تصميم نحاسي ذهبي فاخر */}
      <View 
        style={{
          paddingTop: 14,
          paddingBottom: Platform.OS === "web" ? 14 : Math.max(insets.bottom + 6, 18),
          paddingHorizontal: 16,
          backgroundColor: '#1c1208',
          borderTopWidth: 2,
          borderTopColor: '#c8860a',
        }}
      >
        {/* صف واحد: تعليق/موال | شيلوها | طاروق | خلوها | تفاعلات (للاعبين فقط) */}
        {isPlayer && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 12, width: '100%' }}>
            {/* تعليق/موال - الأول يميناً */}
            <View style={{ alignItems: 'center' }}>
              <View style={{
                shadowColor: '#c8860a',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.5,
                shadowRadius: 8,
                elevation: 8,
              }}>
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
                    <MaterialIcons name="mic" size={28} color="#FFD700" />
                  }
                  label=""
                  showLabel={false}
                  backgroundColor="#2d1f0e"
                  minHeight={55}
                  width={55}
                  borderRadius={28}
                />
              </View>
              <Text style={{ color: 'rgba(212,175,55,0.85)', fontSize: 9, fontWeight: '900', textAlign: 'center', marginTop: 4 }}>
                تعليق / موال
              </Text>
            </View>
            {/* شيلوها - يمين طاروق */}
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity
                style={{
                  backgroundColor: "#2d1f0e",
                  width: 55,
                  height: 55,
                  borderRadius: 28,
                  borderWidth: 1,
                  borderColor: '#c8860a',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#c8860a',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.5,
                  shadowRadius: 8,
                  elevation: 8,
                }}
                onPress={async () => {
                  // البحث عن آخر رسالة طاروق
                  const lastTarouk = audioMessages.find(msg => msg.messageType === "tarouk");
                  if (!lastTarouk) {
                    Alert.alert("لا توجد رسالة طاروق", "لم يتم إرسال أي رسالة طاروق بعد.");
                    return;
                  }

                  try {
                    console.log("[RoomScreen] Starting Sheeloha locally for:", lastTarouk.audioUrl);

                    // منع التداخل — إذا شيلوها تعمل عند أي أحد نمنع الضغط
                    if (sheelohaPlayer.isPlaying) {
                      Alert.alert("تنبيه", "شيلوها تعمل الآن، انتظر حتى تنتهي");
                      return;
                    }

                    // تشغيل محلي مباشرة - بدون خادم
                    await sheelohaPlayer.play({
                      taroukUrl: lastTarouk.audioUrl,
                      taroukDuration: lastTarouk.duration || 3,
                    });

                    // بث للجميع عبر Socket.io
                    const socket = await getSocket();
                    socket.emit("playSheeloha", {
                      roomId,
                      sheelohaUrl: lastTarouk.audioUrl,
                      taroukDuration: lastTarouk.duration || 3,
                      userId,
                      username: username || "",
                    });

                  } catch (error: any) {
                    console.error("[RoomScreen] Failed to play Sheeloha:", error);
                    const msg = error?.message || error?.toString() || "unknown error";
                    Alert.alert("خطأ", msg);
                  }
                }}
              >
                <Text style={{ fontSize: 28 }}>👏</Text>
              </TouchableOpacity>
              <Text style={{ color: 'rgba(212,175,55,0.85)', fontSize: 9, fontWeight: '900', textAlign: 'center', marginTop: 4 }}>
                شيلوها
              </Text>
            </View>

            {/* طاروق - وسط */}
            <View style={{ alignItems: 'center' }}>
              <View style={{
                shadowColor: '#FFD700',
                shadowOffset: { width: -2, height: -2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
                elevation: 6,
              }}>
                <RecordingButton
                  buttonId="tarouk"
                  isRecording={isRecording && recordingType === "tarouk"}
                  isPreparing={isPreparing && recordingType === "tarouk"}
                  pressAndHold={true}
                  onPressIn={() => handleStartRecording("tarouk")}
                  onPressOut={() => handleStopRecording()}
                  onCancelRecording={handleCancelRecording}
                  backgroundColor="#2d1f0e"
                  recordingDuration={recordingType === "tarouk" ? formattedDuration : "00:00"}
                  iconComponent={
                    <Image source={{ uri: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663292181877/uURwTXggQbeLjyfZ.png" }} style={{ width: 70, height: 70 }} resizeMode="contain" />
                  }
                  label=""
                  showLabel={false}
                  minHeight={80}
                  width={80}
                  borderRadius={40}
                />
              </View>
              <Text style={{ color: 'rgba(212,175,55,0.85)', fontSize: 9, fontWeight: '900', textAlign: 'center', marginTop: 4 }}>
                طاروق
              </Text>
            </View>

            {/* خلوها - يسار طاروق */}
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity
                style={{
                  backgroundColor: "#2d1f0e",
                  width: 55,
                  height: 55,
                  borderRadius: 28,
                  borderWidth: 1,
                  borderColor: '#c8860a',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#c8860a',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.5,
                  shadowRadius: 8,
                  elevation: 8,
                }}
                onPress={async () => {
                  // لا يعمل إذا لم تكن الشيلوها تشتغل
                  if (!sheelohaPlayer.isPlaying) return;

                  try {
                    console.log("[RoomScreen] Khalooha pressed - stopping sheeloha");
                    
                    // إيقاف الشيلوها محلياً
                    sheelohaPlayer.stop();
                    
                    // تشغيل التصفيق الختامي
                    const finalClapAsset = require("@/assets/sounds/sheeloha-claps.m4a");
                    const finalClapPlayer = createAudioPlayer(finalClapAsset);
                    finalClapPlayer.volume = 0.225;
                    finalClapPlayer.loop = false;
                    finalClapPlayer.play();
                    
                    // بث أمر إيقاف للجميع مع URL الطاروق للتصفيق الختامي
                    await createKhaloohaCommandMutation.mutateAsync({
                      roomId,
                      userId,
                      username: username || "",
                    });
                    
                    console.log("[RoomScreen] Khalooha command sent successfully");
                  } catch (error) {
                    console.error("[RoomScreen] Failed to execute Khalooha:", error);
                  }
                }}
              >
                <MaterialIcons name="pan-tool" size={26} color="#FFD700" />
              </TouchableOpacity>
              <Text style={{ color: 'rgba(212,175,55,0.85)', fontSize: 9, fontWeight: '900', textAlign: 'center', marginTop: 4 }}>
                خلوها
              </Text>
            </View>

            {/* تفاعلات - الأخير يساراً */}
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity
                style={{
                  backgroundColor: "#2d1f0e",
                  width: 55,
                  height: 55,
                  borderRadius: 28,
                  borderWidth: 1,
                  borderColor: '#c8860a',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#c8860a',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.5,
                  shadowRadius: 8,
                  elevation: 8,
                }}
                onPress={() => setIsReactionsPickerOpen(true)}
              >
                <MaterialIcons name="emoji-emotions" size={25} color="#FFD700" />
              </TouchableOpacity>
              <Text style={{ color: 'rgba(212,175,55,0.85)', fontSize: 9, fontWeight: '900', textAlign: 'center', marginTop: 4 }}>
                تفاعلات
              </Text>
            </View>
          </View>
        )}

        {/* Viewer: Reactions + Request to Join as Player */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 12, width: '100%' }}>

          {/* زر التفاعلات للمستمع */}
          {isViewer && (
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity
                style={{
                  backgroundColor: "#2d1f0e",
                  width: 55,
                  height: 55,
                  borderRadius: 28,
                  borderWidth: 1,
                  borderColor: '#c8860a',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#c8860a',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.5,
                  shadowRadius: 8,
                  elevation: 8,
                }}
                onPress={() => setIsReactionsPickerOpen(true)}
              >
                <MaterialIcons name="emoji-emotions" size={25} color="#FFD700" />
              </TouchableOpacity>
              <Text style={{ color: 'rgba(212,175,55,0.85)', fontSize: 9, fontWeight: '900', textAlign: 'center', marginTop: 4 }}>
                تفاعلات
              </Text>
            </View>
          )}

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
                    {hasPendingRequest ? 'طلبك قيد الانتظار...' : 'طلب الانضمام كشاعر'}
                  </Text>
                </View>
              </TouchableOpacity>
              {hasPendingRequest && (
                <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6, textAlign: 'center' }}>
                  سيتم حذف الطلب تلقائياً بعد 10 ثواني
                </Text>
              )}
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
      
      {/* Edit Profile Modal */}
      <EditProfileModal
        visible={showEditProfileModal}
        onClose={() => setShowEditProfileModal(false)}
        onSave={handleSaveProfile}
        currentName={username || ""}
        currentAvatar={avatar}
      />
    </ScreenContainer>
    </ImageBackground>
  );
}
