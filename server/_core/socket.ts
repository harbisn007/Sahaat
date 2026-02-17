import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { getUserActiveRoom } from "../db";
import { deleteRoomCompletely } from "./room-cleanup";

// نظام تتبع المستخدمين النشطين (آخر نشاط خلال 60 ثانية)
const activeUsers = new Map<string, number>(); // userId -> lastActivityTimestamp
const ACTIVE_TIMEOUT = 60 * 1000; // 60 ثانية

// تسجيل نشاط مستخدم
export function recordUserActivity(userId: string): void {
  activeUsers.set(userId, Date.now());
}

// حساب عدد المستخدمين النشطين
export function getActiveUsersCount(): number {
  const now = Date.now();
  let count = 0;
  
  // حذف المستخدمين غير النشطين وحساب العدد
  for (const [userId, lastActivity] of activeUsers.entries()) {
    if (now - lastActivity > ACTIVE_TIMEOUT) {
      activeUsers.delete(userId);
    } else {
      count++;
    }
  }
  
  return count;
}

// أنواع الأحداث المدعومة
export interface ServerToClientEvents {
  // أحداث الساحة
  roomUpdated: (data: { roomId: number }) => void;
  roomDeleted: (data: { roomId: number; roomName: string }) => void;
  
  // أحداث المشاركين
  participantJoined: (data: { roomId: number; userId: string; username: string; role: string }) => void;
  participantLeft: (data: { roomId: number; userId: string }) => void;
  
  // أحداث طلبات الانضمام
  joinRequestCreated: (data: { roomId: number; requestId: number; userId: string; username: string; avatar: string }) => void;
  joinRequestResponded: (data: { roomId: number; requestId: number; accepted: boolean; userId: string }) => void;
  
  // أحداث الدعوات العامة
  publicInviteCreated: (data: { 
    invitationId: number;
    roomId: number; 
    creatorId: string; 
    creatorName: string; 
    creatorAvatar: string;
    roomName: string;
  }) => void;
  publicInviteExpired: (data: { invitationId: number }) => void;
  
  // أحداث الرسائل الصوتية
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
  
  // أحداث التفاعلات
  reactionCreated: (data: { 
    roomId: number; 
    reactionId: number; 
    userId: string; 
    username: string; 
    reactionType: string;
    createdAt: string;
  }) => void;
  
  // أحداث حالة التسجيل
  recordingStatusChanged: (data: { 
    roomId: number; 
    userId: string; 
    username: string;
    isRecording: boolean; 
    recordingType: string;
  }) => void;
  
  // حدث خلوها
  khaloohaCommand: (data: { 
    roomId: number; 
    userId: string; 
    username: string;
    createdAt: string;
  }) => void;
  
  // حدث تحديث عدد المتواجدين
  onlineCountUpdated: (data: { count: number }) => void;
  
  // حدث تغيير المتحكم بالطاروق
  taroukControllerChanged: (data: { 
    roomId: number; 
    controller: "creator" | "player1" | "player2" | null;
    changedBy: string;
  }) => void;
  
  // حدث تحديث صوت الصفوف (Choir Effect)
  sufoofSoundUpdated: (data: {
    roomId: number;
    audioUrl: string; // رابط الصوت الأصلي
    choirAudioUrl: string; // رابط الصوت المعالج بتأثير الجوقة
    userId: string;
    username: string;
    createdAt: string;
  }) => void;
  
  // حدث تشغيل رسالة صوتية عند الجميع (من الخادم)
  playAudioMessage: (data: {
    roomId: number;
    messageId: number;
    audioUrl: string;
    messageType: string; // "tarouk" | "comment"
    userId: string;
    username: string;
    startTime: number; // timestamp وقت بدء التشغيل
    duration: number; // مدة الصوت بالثواني
  }) => void;
  
  // حدث تشغيل الشيلوها عند الجميع بعد الطاروق
  playSheeloha: (data: {
    roomId: number;
    sheelohaUrl: string;
    taroukDuration: number;
    userId: string;
    username: string;
  }) => void;
  creatorJoinRequest: (data: {
    roomId: number;
    creatorId: string;
    requestType: string; // "player" | "viewer" | "invite"
    requesterId: string;
    requesterName: string;
  }) => void;
}

export interface ClientToServerEvents {
  // الانضمام لساحة
  joinRoom: (roomId: number) => void;
  leaveRoom: (roomId: number) => void;
  
  // طلب تحديث البيانات (fallback)
  requestRoomData: (roomId: number) => void;
  
  // الانضمام لقناة الدعوات العامة
  joinPublicInvites: () => void;
  leavePublicInvites: () => void;
  
  // طلب عدد المتواجدين
  requestOnlineCount: () => void;
  
  // تغيير المتحكم بالطاروق
  setTaroukController: (data: { roomId: number; controller: "creator" | "player1" | "player2" | null }) => void;
  
  // الانضمام لقناة المنشئ (لاستلام إشعارات طلبات الانضمام)
  joinCreatorChannel: (userId: string) => void;
  leaveCreatorChannel: (userId: string) => void;
  
  // الانضمام لقناة المستخدم الشخصية (لاستقبال ردود طلبات الانضمام)
  joinUserChannel: (userId: string) => void;
  leaveUserChannel: (userId: string) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId?: string;
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

  // دالة بث عدد المتواجدين للجميع
  const broadcastOnlineCount = () => {
    const actualCount = io!.sockets.sockets.size;
    const displayCount = Math.floor(actualCount * 1.5);
    io!.emit("onlineCountUpdated", { count: displayCount });
    console.log(`[Socket.io] Online count updated: ${displayCount} (actual: ${actualCount})`);
  };

  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);
    
    // بث عدد المتواجدين عند الاتصال
    broadcastOnlineCount();

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

    // الانضمام لقناة الدعوات العامة
    socket.on("joinPublicInvites", () => {
      socket.join("public-invites");
      console.log(`[Socket.io] Client ${socket.id} joined public-invites channel`);
    });

    // مغادرة قناة الدعوات العامة
    socket.on("leavePublicInvites", () => {
      socket.leave("public-invites");
      console.log(`[Socket.io] Client ${socket.id} left public-invites channel`);
    });

    // طلب عدد المتواجدين
    socket.on("requestOnlineCount", () => {
      const actualCount = io!.sockets.sockets.size;
      const displayCount = Math.floor(actualCount * 1.5);
      socket.emit("onlineCountUpdated", { count: displayCount });
      console.log(`[Socket.io] Sent online count to ${socket.id}: ${displayCount}`);
    });

    // تغيير المتحكم بالطاروق
    socket.on("setTaroukController", (data) => {
      const { roomId, controller } = data;
      console.log(`[Socket.io] Tarouk controller changed in room ${roomId} to: ${controller}`);
      // بث التغيير لجميع المتواجدين في الساحة
      io!.to(`room:${roomId}`).emit("taroukControllerChanged", {
        roomId,
        controller,
        changedBy: socket.id,
      });
    });

    // الانضمام لقناة المنشئ (لاستلام إشعارات طلبات الانضمام)
    socket.on("joinCreatorChannel", (userId: string) => {
      socket.join(`creator:${userId}`);
      socket.data.userId = userId;
      console.log(`[Socket.io] Client ${socket.id} joined creator channel for user ${userId}`);
    });

    // مغادرة قناة المنشئ
    socket.on("leaveCreatorChannel", (userId: string) => {
      socket.leave(`creator:${userId}`);
      console.log(`[Socket.io] Client ${socket.id} left creator channel for user ${userId}`);
    });

    // الانضمام لقناة المستخدم الشخصية (لاستقبال ردود طلبات الانضمام)
    socket.on("joinUserChannel", (userId: string) => {
      socket.join(`user:${userId}`);
      if (!socket.data.userId) socket.data.userId = userId;
      console.log(`[Socket.io] Client ${socket.id} joined user channel for ${userId}`);
    });

    // مغادرة قناة المستخدم الشخصية
    socket.on("leaveUserChannel", (userId: string) => {
      socket.leave(`user:${userId}`);
      console.log(`[Socket.io] Client ${socket.id} left user channel for ${userId}`);
    });

    // قطع الاتصال
    socket.on("disconnect", async (reason) => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}, reason: ${reason}`);
      // بث عدد المتواجدين عند قطع الاتصال
      broadcastOnlineCount();
      // حذف الساحة يتم عبر نظام الفحص الدوري في room-cleanup.ts
      // الذي يتحقق من جميع قنوات Socket قبل الحذف
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
export function emitParticipantJoined(roomId: number, userId: string, username: string, role: string): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("participantJoined", { roomId, userId, username, role });
}

/**
 * بث مغادرة مشارك
 */
export function emitParticipantLeft(roomId: number, userId: string): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("participantLeft", { roomId, userId });
}

/**
 * بث طلب انضمام جديد
 */
export function emitJoinRequestCreated(roomId: number, requestId: number, userId: string, username: string, avatar: string): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("joinRequestCreated", { roomId, requestId, userId, username, avatar });
}

/**
 * بث الرد على طلب انضمام
 */
export function emitJoinRequestResponded(roomId: number, requestId: number, accepted: boolean, userId: string): void {
  if (!io) return;
  // بث للمتواجدين في الساحة (للمستمعين داخل الساحة)
  io.to(`room:${roomId}`).emit("joinRequestResponded", { roomId, requestId, accepted, userId });
  // بث إضافي لقناة المستخدم الشخصية (لمن أرسل طلب من صفحة الساحات عبر الدعوة العامة)
  io.to(`user:${userId}`).emit("joinRequestResponded", { roomId, requestId, accepted, userId });
}

/**
 * بث رسالة صوتية جديدة
 */
export function emitAudioMessageCreated(
  roomId: number, 
  messageId: number, 
  userId: string, 
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
  userId: string, 
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
  userId: string, 
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
 * بث خلوها
 */
export function emitKhaloohaCommand(
  roomId: number, 
  userId: string, 
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


/**
 * بث حذف الساحة لجميع المتصلين (للتنظيف التلقائي)
 */
export function broadcastRoomDeleted(roomId: number): void {
  if (!io) return;
  // بث لجميع المتصلين في الساحة
  io.to(`room:${roomId}`).emit("roomDeleted", { roomId, roomName: "" });
  console.log(`[Socket.io] Broadcasted room deletion: ${roomId}`);
}

/**
 * بث دعوة عامة جديدة لجميع المستخدمين
 */
export function emitPublicInviteCreated(
  invitationId: number,
  roomId: number,
  creatorId: string,
  creatorName: string,
  creatorAvatar: string,
  roomName: string
): void {
  if (!io) return;
  io.to("public-invites").emit("publicInviteCreated", {
    invitationId,
    roomId,
    creatorId,
    creatorName,
    creatorAvatar,
    roomName,
  });
  console.log(`[Socket.io] Public invite created: ${invitationId}`);
}

/**
 * بث انتهاء صلاحية دعوة عامة
 */
export function emitPublicInviteExpired(invitationId: number): void {
  if (!io) return;
  io.to("public-invites").emit("publicInviteExpired", { invitationId });
  console.log(`[Socket.io] Public invite expired: ${invitationId}`);
}

/**
 * الحصول على عدد المتصلين الحاليين بالتطبيق
 */
export function getOnlineUsersCount(): number {
  if (!io) return 0;
  return io.sockets.sockets.size;
}


/**
 * بث تحديث صوت الصفوف (Choir Effect)
 */
export function emitSufoofSoundUpdated(
  roomId: number,
  audioUrl: string,
  choirAudioUrl: string,
  userId: string,
  username: string,
  createdAt: Date
): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("sufoofSoundUpdated", {
    roomId,
    audioUrl,
    choirAudioUrl,
    userId,
    username,
    createdAt: createdAt.toISOString(),
  });
  console.log(`[Socket.io] Sufoof sound updated in room ${roomId}`);
}



/**
 * بث تشغيل رسالة صوتية عند الجميع في الساحة
 */
export function emitPlayAudioMessage(
  roomId: number,
  messageId: number,
  audioUrl: string,
  messageType: string,
  userId: string,
  username: string,
  startTime: number,
  duration: number
): void {
  if (!io) {
    console.error("[Socket.io] ERROR: io is null, cannot emit playAudioMessage");
    return;
  }
  
  const roomName = `room:${roomId}`;
  const room = io.sockets.adapter.rooms.get(roomName);
  const socketsInRoom = room ? room.size : 0;
  
  console.log(`[Socket.io] playAudioMessage: ${messageType} to room ${roomName} (${socketsInRoom} sockets, excluding sender ${userId})`);
  
  // الطاروق/التعليق: بث للجميع ما عدا المرسل (يشغل محلياً)
  io.to(roomName).except(`user:${userId}`).emit("playAudioMessage", {
    roomId,
    messageId,
    audioUrl,
    messageType,
    userId,
    username,
    startTime,
    duration,
  });
}


/**
 * بث أمر تشغيل الشيلوها لجميع المتصلين في الساحة
 * يُبث بعد انتهاء مدة الطاروق الأصلي
 */
export function emitPlaySheeloha(
  roomId: number,
  sheelohaUrl: string,
  taroukDuration: number,
  userId: string,
  username: string
): void {
  if (!io) return;
  io.to(`room:${roomId}`).emit("playSheeloha", {
    roomId,
    sheelohaUrl,
    taroukDuration,
    userId,
    username,
  });
  console.log(`[Socket.io] playSheeloha command broadcast to room ${roomId}`);
}

/**
 * بث إشعار طلب انضمام جديد للمنشئ عبر قناته الخاصة
 */
export function emitCreatorJoinRequest(
  roomId: number,
  creatorId: string,
  requestType: string,
  requesterId: string,
  requesterName: string
): void {
  if (!io) return;
  io.to(`creator:${creatorId}`).emit("creatorJoinRequest", {
    roomId,
    creatorId,
    requestType,
    requesterId,
    requesterName,
  });
  console.log(`[Socket.io] Creator join request notification sent to creator:${creatorId} (type: ${requestType}, requester: ${requesterName})`);
}
