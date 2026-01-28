import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

// أنواع الأحداث المدعومة
export interface ServerToClientEvents {
  // أحداث الساحة
  roomUpdated: (data: { roomId: number }) => void;
  roomDeleted: (data: { roomId: number; roomName: string }) => void;
  
  // أحداث المشاركين
  participantJoined: (data: { roomId: number; userId: number; username: string; role: string }) => void;
  participantLeft: (data: { roomId: number; userId: number }) => void;
  
  // أحداث طلبات الانضمام
  joinRequestCreated: (data: { roomId: number; requestId: number; userId: number; username: string; avatar: string }) => void;
  joinRequestResponded: (data: { roomId: number; requestId: number; accepted: boolean; userId: number }) => void;
  
  // أحداث الرسائل الصوتية
  audioMessageCreated: (data: { 
    roomId: number; 
    messageId: number; 
    userId: number; 
    username: string; 
    messageType: string;
    audioUrl: string;
    duration: number;
    createdAt: string;
  }) => void;
  
  // أحداث التفاعلات
  reactionCreated: (data: { 
    roomId: number; 
    reactionId: number; 
    userId: number; 
    username: string; 
    reactionType: string;
    createdAt: string;
  }) => void;
  
  // أحداث حالة التسجيل
  recordingStatusChanged: (data: { 
    roomId: number; 
    userId: number; 
    username: string;
    isRecording: boolean; 
    recordingType: string;
  }) => void;
  
  // أحداث شيلوها وخلوها
  sheelohaBroadcast: (data: { 
    roomId: number; 
    userId: number; 
    username: string;
    audioUrl: string;
    createdAt: string;
  }) => void;
  khaloohaCommand: (data: { 
    roomId: number; 
    userId: number; 
    username: string;
    createdAt: string;
  }) => void;
}

export interface ClientToServerEvents {
  // الانضمام لساحة
  joinRoom: (roomId: number) => void;
  leaveRoom: (roomId: number) => void;
  
  // طلب تحديث البيانات (fallback)
  requestRoomData: (roomId: number) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId?: number;
  username?: string;
  currentRoomId?: number;
}

// المتغير العام للـ Socket.io server
let io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> | null = null;

/**
 * تهيئة Socket.io server
 */
export function initializeSocketIO(httpServer: HttpServer): Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> {
  io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: {
      origin: "*", // السماح لجميع المصادر (للتطوير)
      methods: ["GET", "POST"],
      credentials: true,
    },
    // تحسينات الأداء
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // الانضمام لساحة
    socket.on("joinRoom", (roomId: number) => {
      const roomName = `room:${roomId}`;
      socket.join(roomName);
      socket.data.currentRoomId = roomId;
      console.log(`[Socket.io] Client ${socket.id} joined room ${roomId}`);
    });

    // مغادرة ساحة
    socket.on("leaveRoom", (roomId: number) => {
      const roomName = `room:${roomId}`;
      socket.leave(roomName);
      if (socket.data.currentRoomId === roomId) {
        socket.data.currentRoomId = undefined;
      }
      console.log(`[Socket.io] Client ${socket.id} left room ${roomId}`);
    });

    // قطع الاتصال
    socket.on("disconnect", (reason) => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}, reason: ${reason}`);
    });
  });

  console.log("[Socket.io] Server initialized");
  return io;
}

/**
 * الحصول على instance الـ Socket.io
 */
export function getIO(): Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> | null {
  return io;
}

// ============ دوال البث للأحداث ============

/**
 * بث تحديث الساحة لجميع المشاركين
 */
export function emitRoomUpdated(roomId: number): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("roomUpdated", { roomId });
}

/**
 * بث حذف الساحة لجميع المشاركين
 */
export function emitRoomDeleted(roomId: number, roomName: string): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("roomDeleted", { roomId, roomName });
}

/**
 * بث انضمام مشارك جديد
 */
export function emitParticipantJoined(roomId: number, userId: number, username: string, role: string): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("participantJoined", { roomId, userId, username, role });
}

/**
 * بث مغادرة مشارك
 */
export function emitParticipantLeft(roomId: number, userId: number): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("participantLeft", { roomId, userId });
}

/**
 * بث طلب انضمام جديد
 */
export function emitJoinRequestCreated(roomId: number, requestId: number, userId: number, username: string, avatar: string): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("joinRequestCreated", { roomId, requestId, userId, username, avatar });
}

/**
 * بث الرد على طلب انضمام
 */
export function emitJoinRequestResponded(roomId: number, requestId: number, accepted: boolean, userId: number): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("joinRequestResponded", { roomId, requestId, accepted, userId });
}

/**
 * بث رسالة صوتية جديدة
 */
export function emitAudioMessageCreated(
  roomId: number, 
  messageId: number, 
  userId: number, 
  username: string, 
  messageType: string,
  audioUrl: string,
  duration: number,
  createdAt: Date
): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("audioMessageCreated", { 
    roomId, 
    messageId, 
    userId, 
    username, 
    messageType,
    audioUrl,
    duration,
    createdAt: createdAt.toISOString(),
  });
}

/**
 * بث تفاعل جديد
 */
export function emitReactionCreated(
  roomId: number, 
  reactionId: number, 
  userId: number, 
  username: string, 
  reactionType: string,
  createdAt: Date
): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("reactionCreated", { 
    roomId, 
    reactionId, 
    userId, 
    username, 
    reactionType,
    createdAt: createdAt.toISOString(),
  });
}

/**
 * بث تغيير حالة التسجيل
 */
export function emitRecordingStatusChanged(
  roomId: number, 
  userId: number, 
  username: string,
  isRecording: boolean, 
  recordingType: string
): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("recordingStatusChanged", { 
    roomId, 
    userId, 
    username,
    isRecording, 
    recordingType,
  });
}

/**
 * بث شيلوها
 */
export function emitSheelohaBroadcast(
  roomId: number, 
  userId: number, 
  username: string,
  audioUrl: string,
  createdAt: Date
): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("sheelohaBroadcast", { 
    roomId, 
    userId, 
    username,
    audioUrl,
    createdAt: createdAt.toISOString(),
  });
}

/**
 * بث خلوها
 */
export function emitKhaloohaCommand(
  roomId: number, 
  userId: number, 
  username: string,
  createdAt: Date
): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("khaloohaCommand", { 
    roomId, 
    userId, 
    username,
    createdAt: createdAt.toISOString(),
  });
}
