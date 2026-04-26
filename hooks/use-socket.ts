import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";

// أنواع الأحداث من الخادم
interface ServerToClientEvents {
  roomUpdated: (data: { roomId: number }) => void;
  roomDeleted: (data: { roomId: number; roomName: string; reason: "manual" | "auto" }) => void;
  participantJoined: (data: { roomId: number; userId: string; username: string; role: string }) => void;
  participantLeft: (data: { roomId: number; userId: string }) => void;
  joinRequestCreated: (data: { roomId: number; requestId: number; userId: string; username: string; avatar: string }) => void;
  joinRequestResponded: (data: { roomId: number; requestId: number; accepted: boolean; userId: string }) => void;
  audioMessageCreated: (data: { 
    roomId: number; 
    messageId: number; 
    userId: string; 
    username: string; 
    messageType: string;
    audioUrl: string;
    duration: number;
    createdAt: string;
  }) => void;
  reactionCreated: (data: { 
    roomId: number; 
    reactionId: number; 
    userId: string; 
    username: string; 
    reactionType: string;
    createdAt: string;
  }) => void;
  recordingStatusChanged: (data: { 
    roomId: number; 
    userId: string; 
    username: string;
    isRecording: boolean; 
    recordingType: string;
  }) => void;
  khaloohaCommand: (data: { 
    roomId: number; 
    userId: string; 
    username: string;
    createdAt: string;
  }) => void;
  // أحداث جديدة للمزامنة
  taroukControllerChanged: (data: { 
    roomId: number; 
    controller: "creator" | "player1" | "player2" | null;
    changedBy: string;
  }) => void;
  // حدث تحديث صوت الصفوف (Choir Effect)
  sufoofSoundUpdated: (data: {
    roomId: number;
    audioUrl: string;
    choirAudioUrl: string;
    userId: string;
    username: string;
    createdAt: string;
  }) => void;
  // حدث تشغيل رسالة صوتية عند الجميع (من الخادم)
  playAudioMessage: (data: {
    roomId: number;
    messageId: number;
    audioUrl: string;
    messageType: string;
    userId: string;
    username: string;
    startTime: number;
    duration: number;
  }) => void;
  // حدث تشغيل الشيلوها بعد الطاروق
  playSheeloha: (data: {
    roomId: number;
    sheelohaUrl: string;
    taroukDuration: number;
    userId: string;
    username: string;
  }) => void;
  // حدث إشعار المنشئ بطلب انضمام جديد
  creatorJoinRequest: (data: {
    roomId: number;
    creatorId: string;
    requestType: string;
    requesterId: string;
    requesterName: string;
  }) => void;
  // حدث تحديث عدادات التفاعل
  interactionUpdated: (data: { toUserId: string; likes: number; dislikes: number; follows: number }) => void;
  // حدث حظر المستخدم
  userBanned: (data: { userId: string; banType: string }) => void;
  // حدث تحديث عدد المتواجدين
  onlineCountUpdated: (data: { count: number }) => void;
  // حدث تحديث النص المثبت في الساحة
  pinnedTextUpdated: (data: { roomId: number; text: string }) => void;
  publicInviteCreated: (data: { invitationId: number; roomId: number; creatorId: string; creatorName: string; creatorAvatar: string; roomName: string; }) => void;
  publicInviteExpired: (data: { invitationId: number }) => void;
}

interface ClientToServerEvents {
  joinRoom: (roomId: number) => void;
  leaveRoom: (roomId: number) => void;
  requestRoomData: (roomId: number) => void;
  setTaroukController: (data: { roomId: number; controller: "creator" | "player1" | "player2" | null }) => void;
  joinUserChannel: (userId: string) => void;
  leaveUserChannel: (userId: string) => void;
  joinCreatorChannel: (userId: string) => void;
  leaveCreatorChannel: (userId: string) => void;
  playSheeloha: (data: { roomId: number; sheelohaUrl: string; taroukDuration?: number; userId: string; username: string }) => void;
  // تثبيت نص في الساحة (من المنشئ)
  pinText: (data: { roomId: number; text: string }) => void;
}

type SocketType = Socket<ServerToClientEvents, ClientToServerEvents>;

// الحصول على عنوان الخادم
// يستخدم نفس المنطق في trpc.ts و oauth.ts للحصول على العنوان الصحيح
function getServerUrl(): string {
  const baseUrl = getApiBaseUrl();
  if (baseUrl) {
    console.log("[Socket.io] Using API base URL:", baseUrl);
    return baseUrl;
  }
  
  // Fallback للويب فقط
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const host = window.location.hostname;
    // Pattern: 8081-sandboxid.region.domain -> 3000-sandboxid.region.domain
    const apiHost = host.replace(/^8081-/, "3000-");
    return `${protocol}//${apiHost}`;
  }
  
  // هذا لن يُستخدم لأن getApiBaseUrl يُرجع قيمة دائماً
  console.warn("[Socket.io] No API URL found, using localhost (will fail on mobile)");
  return "http://127.0.0.1:3000";
}

// Singleton للاتصال
let socketInstance: SocketType | null = null;
let connectionPromise: Promise<SocketType> | null = null;
let isConnecting = false;

// مراقبة حالة الاتصال العامة
let globalConnectionListeners: Set<(connected: boolean) => void> = new Set();

function notifyConnectionChange(connected: boolean) {
  globalConnectionListeners.forEach(listener => listener(connected));
}

export function getSocket(): Promise<SocketType> {
  // إذا كان متصلاً، أرجعه مباشرة
  if (socketInstance?.connected) {
    console.log("[Socket.io] Already connected, returning existing socket");
    return Promise.resolve(socketInstance);
  }

  // إذا كان هناك محاولة اتصال جارية، انتظرها
  if (connectionPromise) {
    console.log("[Socket.io] Connection in progress, waiting...");
    return connectionPromise;
  }

  // إذا كان هناك socket موجود لكن غير متصل، أعد الاتصال
  if (socketInstance && !socketInstance.connected) {
    console.log("[Socket.io] Socket exists but disconnected, reconnecting...");
    socketInstance.connect();
    
    // انتظر الاتصال
    connectionPromise = new Promise((resolve) => {
      const onConnect = () => {
        console.log("[Socket.io] Reconnected:", socketInstance?.id);
        socketInstance?.off("connect", onConnect);
        connectionPromise = null;
        notifyConnectionChange(true);
        resolve(socketInstance!);
      };
      socketInstance!.on("connect", onConnect);
      
      // Timeout - لكن لا نرجع socket غير متصل
      setTimeout(() => {
        if (!socketInstance?.connected) {
          console.warn("[Socket.io] Reconnection timeout, will keep trying in background");
          socketInstance?.off("connect", onConnect);
          connectionPromise = null;
          // أرجع الـ socket حتى لو غير متصل - سيتصل لاحقاً
          resolve(socketInstance!);
        }
      }, 10000);
    });
    return connectionPromise;
  }

  // إنشاء socket جديد
  console.log("[Socket.io] Creating new socket connection...");
  connectionPromise = new Promise((resolve) => {
    const serverUrl = getServerUrl();
    console.log("[Socket.io] Connecting to:", serverUrl);

    socketInstance = io(serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity, // محاولة إعادة الاتصال بلا حدود
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
    });

    socketInstance.on("connect", () => {
      console.log("[Socket.io] ========== CONNECTED ==========");
      console.log("[Socket.io] Socket ID:", socketInstance?.id);
      connectionPromise = null;
      notifyConnectionChange(true);
      resolve(socketInstance!);
    });

    socketInstance.on("connect_error", (error) => {
      console.error("[Socket.io] Connection error:", error.message);
      notifyConnectionChange(false);
      // Socket.io سيحاول إعادة الاتصال تلقائياً
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("[Socket.io] ========== DISCONNECTED ==========");
      console.log("[Socket.io] Reason:", reason);
      notifyConnectionChange(false);
      // Socket.io سيحاول إعادة الاتصال تلقائياً
    });

    // Timeout - لكن أرجع الـ socket حتى لو غير متصل (سيتصل لاحقاً)
    setTimeout(() => {
      if (!socketInstance?.connected) {
        console.warn("[Socket.io] Initial connection timeout, socket will connect in background");
        connectionPromise = null;
        resolve(socketInstance!);
      }
    }, 10000);
  });

  return connectionPromise;
}

/**
 * Hook للاتصال بـ Socket.io والاستماع لأحداث الساحة
 */
export function useSocket(roomId: number | null, userId?: string | null) {
  const socketRef = useRef<SocketType | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Callbacks للأحداث
  const callbacksRef = useRef<{
    onRoomUpdated?: () => void;
    onRoomDeleted?: (roomName: string, reason?: "manual" | "auto") => void;
    onParticipantJoined?: (data: { userId: string; username: string; role: string }) => void;
    onParticipantLeft?: (userId: string) => void;
    onJoinRequestCreated?: (data: { requestId: number; userId: string; username: string; avatar: string }) => void;
    onJoinRequestResponded?: (data: { requestId: number; accepted: boolean; userId: string }) => void;
    onAudioMessageCreated?: (data: { 
      messageId: number; 
      userId: string; 
      username: string; 
      messageType: string;
      audioUrl: string;
      duration: number;
      createdAt: string;
    }) => void;
    onReactionCreated?: (data: { 
      reactionId: number; 
      userId: string; 
      username: string; 
      reactionType: string;
      createdAt: string;
    }) => void;
    onRecordingStatusChanged?: (data: { 
      userId: string; 
      username: string;
      isRecording: boolean; 
      recordingType: string;
    }) => void;
    onKhaloohaCommand?: (data: { 
      userId: string; 
      username: string;
      createdAt: string;
    }) => void;
    onTaroukControllerChanged?: (data: { 
      controller: "creator" | "player1" | "player2" | null;
      changedBy: string;
    }) => void;
    onSufoofSoundUpdated?: (data: {
      audioUrl: string;
      choirAudioUrl: string;
      userId: string;
      username: string;
      createdAt: string;
    }) => void;
    onPlayAudioMessage?: (data: {
      messageId: number;
      audioUrl: string;
      messageType: string;
      userId: string;
      username: string;
      startTime: number;
      duration: number;
    }) => void;
    onPlaySheeloha?: (data: {
      roomId: number;
      sheelohaUrl: string;
      taroukDuration: number;
      userId: string;
      username: string;
    }) => void;
    onUserBanned?: (data: { userId: string; banType: string }) => void;
    onPinnedTextUpdated?: (data: { roomId: number; text: string }) => void;
    onTextMessageCreated?: (data: { roomId: number; id: number; userId: string; username: string; text: string; createdAt: string }) => void;
  }>({});

  // تتبع roomId السابق لمغادرته عند التغيير
  const previousRoomIdRef = useRef<number | null>(null);

  // الاتصال والانضمام للساحة
  useEffect(() => {
    if (!roomId) return;

    let mounted = true;
    let hasJoinedRoom = false;

    // دالة للانضمام للغرفة - تُستخدم عند الاتصال وإعادة الاتصال
    function joinRoom(socket: SocketType) {
      if (!mounted || !socket.connected) {
        console.log("[Socket.io] Cannot join room - not connected or unmounted");
        return;
      }
      
      // مغادرة الساحة القديمة قبل الانضمام للجديدة
      if (previousRoomIdRef.current !== null && previousRoomIdRef.current !== roomId) {
        console.log("[Socket.io] Leaving previous room:", previousRoomIdRef.current);
        socket.emit("leaveRoom", previousRoomIdRef.current);
      }
      
      socket.emit("joinRoom", roomId!);
      previousRoomIdRef.current = roomId;
      
      // الانضمام لقناة المستخدم الشخصية لاستقبال إشعارات طلبات الانضمام
      if (userId) {
        socket.emit("joinUserChannel", userId);
      }
      hasJoinedRoom = true;
      console.log("[Socket.io] ========== JOINED ROOM ==========");
      console.log("[Socket.io] Room ID:", roomId);
      console.log("[Socket.io] Socket ID:", socket.id);
      console.log("[Socket.io] User channel:", userId ? `user:${userId}` : "none");
    }

    async function connect() {
      try {
        const socket = await getSocket();
        if (!mounted) return;

        socketRef.current = socket;
        setIsConnected(socket.connected);
        setConnectionError(null);

        console.log("[Socket.io] Got socket, connected:", socket.connected);

        // الانضمام للساحة فقط إذا كان متصلاً
        if (socket.connected) {
          joinRoom(socket);
        } else {
          console.log("[Socket.io] Socket not connected yet, will join room on connect");
        }

        // الاستماع للأحداث
        socket.on("roomUpdated", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onRoomUpdated?.();
          }
        });

        socket.on("roomDeleted", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onRoomDeleted?.(data.roomName, data.reason);
          }
        });

        socket.on("participantJoined", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onParticipantJoined?.(data);
          }
        });

        socket.on("participantLeft", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onParticipantLeft?.(data.userId);
          }
        });

        socket.on("joinRequestCreated", (data) => {
          console.log("[Socket.io] ========== RECEIVED joinRequestCreated ==========");
          console.log("[Socket.io] Data:", JSON.stringify(data));
          console.log("[Socket.io] Current roomId:", roomId);
          console.log("[Socket.io] Match:", data.roomId === roomId);
          
          if (data.roomId === roomId) {
            console.log("[Socket.io] Calling onJoinRequestCreated callback...");
            callbacksRef.current.onJoinRequestCreated?.(data);
          }
        });

        socket.on("joinRequestResponded", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onJoinRequestResponded?.(data);
          }
        });

        socket.on("audioMessageCreated", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onAudioMessageCreated?.(data);
          }
        });

        socket.on("reactionCreated", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onReactionCreated?.(data);
          }
        });

        socket.on("recordingStatusChanged", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onRecordingStatusChanged?.(data);
          }
        });

        socket.on("khaloohaCommand", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onKhaloohaCommand?.(data);
          }
        });

        // أحداث جديدة للمزامنة
        socket.on("taroukControllerChanged", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onTaroukControllerChanged?.(data);
          }
        });

        // حدث تحديث صوت الصفوف (Choir Effect)
        socket.on("sufoofSoundUpdated", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onSufoofSoundUpdated?.(data);
          }
        });

        // حدث تشغيل الشيلوها بعد الطاروق
        socket.on("playSheeloha", (data: any) => {
          if (data.roomId === roomId) {
            console.log("[Socket.io] Received playSheeloha for room", roomId);
            callbacksRef.current.onPlaySheeloha?.({
              roomId: data.roomId,
              sheelohaUrl: data.sheelohaUrl,
              taroukDuration: data.taroukDuration,
              userId: data.userId,
              username: data.username,
            });
          }
        });

        // حدث تشغيل رسالة صوتية عند الجميع (من الخادم)
        socket.on("playAudioMessage", (data) => {
          console.log("[Socket.io] ========== RECEIVED playAudioMessage ==========");
          console.log("[Socket.io] Data:", JSON.stringify(data));
          console.log("[Socket.io] Current roomId:", roomId);
          console.log("[Socket.io] Data roomId:", data.roomId);
          console.log("[Socket.io] Match:", data.roomId === roomId);
          console.log("[Socket.io] Callback exists:", !!callbacksRef.current.onPlayAudioMessage);
          
          if (data.roomId === roomId) {
            console.log("[Socket.io] Calling onPlayAudioMessage callback...");
            callbacksRef.current.onPlayAudioMessage?.(data);
            console.log("[Socket.io] Callback called successfully");
          } else {
            console.log("[Socket.io] Room ID mismatch, ignoring");
          }
        });

        // حدث حظر المستخدم
        socket.on("userBanned", (data) => {
          callbacksRef.current.onUserBanned?.(data);
        });

        // حدث تحديث النص المثبت
        socket.on("pinnedTextUpdated", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onPinnedTextUpdated?.(data);
          }
        });

        // حدث رسالة كتابية جديدة
        socket.on("textMessageCreated", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onTextMessageCreated?.(data);
          }
        });

        // مراقبة حالة الاتصال وإعادة الانضمام للغرفة عند الاتصال/إعادة الاتصال
        socket.on("connect", () => {
          console.log("[Socket.io] ========== SOCKET CONNECTED ==========");
          console.log("[Socket.io] Socket ID:", socket.id);
          console.log("[Socket.io] Has joined room before:", hasJoinedRoom);
          setIsConnected(true);
          // الانضمام للغرفة (سواء أول مرة أو إعادة اتصال)
          joinRoom(socket);
        });
        socket.on("disconnect", (reason) => {
          console.log("[Socket.io] Disconnected, reason:", reason);
          setIsConnected(false);
        });

      } catch (error) {
        console.error("[Socket.io] Failed to connect:", error);
        if (mounted) {
          setConnectionError("فشل الاتصال بالخادم");
        }
      }
    }

    connect();

    return () => {
      mounted = false;
      if (socketRef.current) {
        // إزالة جميع الـ listeners لمنع التراكم
        socketRef.current.off("roomUpdated");
        socketRef.current.off("roomDeleted");
        socketRef.current.off("participantJoined");
        socketRef.current.off("participantLeft");
        socketRef.current.off("joinRequestCreated");
        socketRef.current.off("joinRequestResponded");
        socketRef.current.off("audioMessageCreated");
        socketRef.current.off("reactionCreated");
        socketRef.current.off("recordingStatusChanged");
        socketRef.current.off("khaloohaCommand");
        socketRef.current.off("taroukControllerChanged");
        socketRef.current.off("sufoofSoundUpdated");
        socketRef.current.off("playAudioMessage");
        socketRef.current.off("playSheeloha");
        socketRef.current.off("userBanned");
        socketRef.current.off("pinnedTextUpdated");
        socketRef.current.off("textMessageCreated");
        socketRef.current.off("connect");
        socketRef.current.off("disconnect");
        
        if (roomId !== null) {
          socketRef.current.emit("leaveRoom", roomId);
          if (userId) {
            socketRef.current.emit("leaveUserChannel", userId);
          }
          console.log("[Socket.io] Left room and removed listeners:", roomId);
        }
      }
    };
  }, [roomId, userId]);

  // دوال تسجيل الـ callbacks
  const setCallbacks = useCallback((callbacks: typeof callbacksRef.current) => {
    callbacksRef.current = { ...callbacksRef.current, ...callbacks };
  }, []);

  // دالة تغيير المتحكم بالطاروق
  const setTaroukController = useCallback((controller: "creator" | "player1" | "player2" | null) => {
    if (socketRef.current && roomId) {
      socketRef.current.emit("setTaroukController", { roomId, controller });
      console.log("[Socket.io] Set tarouk controller:", controller);
    }
  }, [roomId]);

  return {
    isConnected,
    connectionError,
    setCallbacks,
    setTaroukController,
  };
}

/**
 * Hook بسيط للتحقق من حالة الاتصال
 */
export function useSocketConnection() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    getSocket().then((socket) => {
      setIsConnected(socket.connected);
      socket.on("connect", () => setIsConnected(true));
      socket.on("disconnect", () => setIsConnected(false));
    });
  }, []);

  return isConnected;
}
