import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Platform } from "react-native";

// أنواع الأحداث من الخادم
interface ServerToClientEvents {
  roomUpdated: (data: { roomId: number }) => void;
  roomDeleted: (data: { roomId: number; roomName: string }) => void;
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
  sheelohaBroadcast: (data: { 
    roomId: number; 
    userId: string; 
    username: string;
    audioUrl: string;
    clappingDelay: number;
    createdAt: string;
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
  stopAndPlayNewSheeloha: (data: { 
    roomId: number; 
    userId: string;
    audioUrl: string;
    clappingDelay: number;
  }) => void;
}

interface ClientToServerEvents {
  joinRoom: (roomId: number) => void;
  leaveRoom: (roomId: number) => void;
  requestRoomData: (roomId: number) => void;
  setTaroukController: (data: { roomId: number; controller: "creator" | "player1" | "player2" | null }) => void;
}

type SocketType = Socket<ServerToClientEvents, ClientToServerEvents>;

// الحصول على عنوان الخادم
function getServerUrl(): string {
  if (Platform.OS === "web") {
    // على الويب، نستخدم نفس المنفذ
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const host = window.location.hostname;
    return `${protocol}//${host}:3000`;
  }
  // على الموبايل، نستخدم عنوان الخادم
  return "http://127.0.0.1:3000";
}

// Singleton للاتصال
let socketInstance: SocketType | null = null;
let connectionPromise: Promise<SocketType> | null = null;

function getSocket(): Promise<SocketType> {
  if (socketInstance?.connected) {
    return Promise.resolve(socketInstance);
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = new Promise((resolve, reject) => {
    const serverUrl = getServerUrl();
    console.log("[Socket.io] Connecting to:", serverUrl);

    socketInstance = io(serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    socketInstance.on("connect", () => {
      console.log("[Socket.io] Connected:", socketInstance?.id);
      connectionPromise = null;
      resolve(socketInstance!);
    });

    socketInstance.on("connect_error", (error) => {
      console.error("[Socket.io] Connection error:", error.message);
      connectionPromise = null;
      // لا نرفض، نحاول إعادة الاتصال
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("[Socket.io] Disconnected:", reason);
    });

    // Timeout للاتصال
    setTimeout(() => {
      if (!socketInstance?.connected) {
        console.warn("[Socket.io] Connection timeout, falling back to polling");
        connectionPromise = null;
        resolve(socketInstance!);
      }
    }, 5000);
  });

  return connectionPromise;
}

/**
 * Hook للاتصال بـ Socket.io والاستماع لأحداث الساحة
 */
export function useSocket(roomId: number | null) {
  const socketRef = useRef<SocketType | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Callbacks للأحداث
  const callbacksRef = useRef<{
    onRoomUpdated?: () => void;
    onRoomDeleted?: (roomName: string) => void;
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
    onSheelohaBroadcast?: (data: { 
      userId: string; 
      username: string;
      audioUrl: string;
      clappingDelay: number;
      createdAt: string;
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
    onStopAndPlayNewSheeloha?: (data: { 
      userId: string;
      audioUrl: string;
      clappingDelay: number;
    }) => void;
  }>({});

  // الاتصال والانضمام للساحة
  useEffect(() => {
    if (!roomId) return;

    let mounted = true;

    async function connect() {
      try {
        const socket = await getSocket();
        if (!mounted) return;

        socketRef.current = socket;
        setIsConnected(socket.connected);
        setConnectionError(null);

        // الانضمام للساحة
        socket.emit("joinRoom", roomId!);
        console.log("[Socket.io] Joined room:", roomId);

        // الاستماع للأحداث
        socket.on("roomUpdated", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onRoomUpdated?.();
          }
        });

        socket.on("roomDeleted", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onRoomDeleted?.(data.roomName);
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
          if (data.roomId === roomId) {
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

        socket.on("sheelohaBroadcast", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onSheelohaBroadcast?.(data);
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

        socket.on("stopAndPlayNewSheeloha", (data) => {
          if (data.roomId === roomId) {
            callbacksRef.current.onStopAndPlayNewSheeloha?.(data);
          }
        });

        // مراقبة حالة الاتصال
        socket.on("connect", () => setIsConnected(true));
        socket.on("disconnect", () => setIsConnected(false));

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
      if (socketRef.current && roomId !== null) {
        socketRef.current.emit("leaveRoom", roomId);
        console.log("[Socket.io] Left room:", roomId);
      }
    };
  }, [roomId]);

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
