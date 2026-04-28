import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phoneNumber: varchar("phoneNumber", { length: 20 }).unique(),
  appUserId: varchar("appUserId", { length: 255 }),
  avatar: varchar("avatar", { length: 500 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Rooms table - userId changed to varchar(100) for UUID support
export const rooms = mysqlTable("rooms", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  creatorId: varchar("creatorId", { length: 100 }).notNull(), // Changed from int to varchar for UUID
  creatorName: varchar("creatorName", { length: 50 }).notNull(),
  creatorAvatar: varchar("creatorAvatar", { length: 500 }).default("male").notNull(), // 'male', 'female', or custom URL
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true").notNull(),
  // Gold star fields - awarded when room has more than 20 viewers at once
  // hasGoldStar: هل الساحة لديها نجمة ظاهرة حالياً
  // goldStarExpiresAt: وقت انتهاء ظهور النجمة (24 ساعة)
  // extensionExpiresAt: وقت انتهاء صلاحية التمديد (5 أيام)
  hasGoldStar: mysqlEnum("hasGoldStar", ["true", "false"]).default("false").notNull(),
  goldStarExpiresAt: timestamp("goldStarExpiresAt"), // 24 ساعة لظهور النجمة
  extensionExpiresAt: timestamp("extensionExpiresAt"), // 5 أيام للتمديد
  // When the extension was lost (for calculating 15-minute deletion timer)
  extensionLostAt: timestamp("extensionLostAt"),
  // Last player join time (no longer used, kept for compatibility)
  lastPlayerJoinAt: timestamp("lastPlayerJoinAt"),
  // Last player left time (for calculating 15-minute deletion timer)
  lastPlayerLeftAt: timestamp("lastPlayerLeftAt"),
  // Last public invite timestamp - for 5 minute cooldown
  lastPublicInviteAt: timestamp("lastPublicInviteAt"),
  // Tarouk controller - who controls the tarouk (creator, player1, player2, or null)
  taroukController: mysqlEnum("taroukController", ["creator", "player1", "player2"]),
  // Clapping delay in seconds (0.05-1.50)
  clappingDelay: varchar("clappingDelay", { length: 10 }).default("0.80"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Room participants table - userId changed to varchar(100) for UUID support
export const roomParticipants = mysqlTable("room_participants", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: varchar("userId", { length: 100 }).notNull(), // Changed from int to varchar for UUID
  username: varchar("username", { length: 50 }).notNull(),
  avatar: varchar("avatar", { length: 500 }).default("male").notNull(), // 'male', 'female', or custom URL
  role: mysqlEnum("role", ["creator", "player", "viewer"]).notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "rejected"]).default("accepted").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

// Audio messages table - userId changed to varchar(100) for UUID support
export const audioMessages = mysqlTable("audio_messages", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: varchar("userId", { length: 100 }).notNull(), // Changed from int to varchar for UUID
  username: varchar("username", { length: 50 }).notNull(),
  messageType: mysqlEnum("messageType", ["comment", "tarouk"]).notNull(),
  audioUrl: text("audioUrl").notNull(),
  duration: int("duration").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Reactions table - userId changed to varchar(100) for UUID support
export const reactions = mysqlTable("reactions", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: varchar("userId", { length: 100 }).notNull(), // Changed from int to varchar for UUID
  username: varchar("username", { length: 50 }).notNull(),
  reactionType: mysqlEnum("reactionType", [
    "clapping", "laughing", "angry", "thumbsup",
    "salam", "alaikum", "masaakum", "masa_alnoor",
    "hayak", "abqak", "sah_lisanak", "kafo",
    "maalaik_zood", "malak_lowa", "latoodha", "eid_karrar",
  ]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Sheeloha broadcasts table (for broadcasting "شيلوها" button press to all users)
export const sheelohaBroadcasts = mysqlTable("sheeloha_broadcasts", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: varchar("userId", { length: 100 }).notNull(), // Changed from int to varchar for UUID
  username: varchar("username", { length: 50 }).notNull(),
  audioUrl: text("audioUrl").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Room = typeof rooms.$inferSelect;
export type InsertRoom = typeof rooms.$inferInsert;

export type RoomParticipant = typeof roomParticipants.$inferSelect;
export type InsertRoomParticipant = typeof roomParticipants.$inferInsert;

export type AudioMessage = typeof audioMessages.$inferSelect;
export type InsertAudioMessage = typeof audioMessages.$inferInsert;

export type Reaction = typeof reactions.$inferSelect;
export type InsertReaction = typeof reactions.$inferInsert;

// Khalooha commands table (for broadcasting "خلوها" button press to stop sheeloha for all users)
export const khaloohaCommands = mysqlTable("khalooha_commands", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: varchar("userId", { length: 100 }).notNull(), // Changed from int to varchar for UUID
  username: varchar("username", { length: 50 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SheelohaBroadcast = typeof sheelohaBroadcasts.$inferSelect;
export type InsertSheelohaBroadcast = typeof sheelohaBroadcasts.$inferInsert;

export type KhaloohaCommand = typeof khaloohaCommands.$inferSelect;
export type InsertKhaloohaCommand = typeof khaloohaCommands.$inferInsert;

// Recording status table (for broadcasting "طاروق" recording status to all users)
export const recordingStatus = mysqlTable("recording_status", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: varchar("userId", { length: 100 }).notNull(), // Changed from int to varchar for UUID
  username: varchar("username", { length: 50 }).notNull(),
  isRecording: mysqlEnum("isRecording", ["true", "false"]).default("false").notNull(),
  recordingType: mysqlEnum("recordingType", ["comment", "tarouk"]).default("tarouk").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RecordingStatus = typeof recordingStatus.$inferSelect;
export type InsertRecordingStatus = typeof recordingStatus.$inferInsert;

// Join requests table (for viewers requesting to become players)
export const joinRequests = mysqlTable("join_requests", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: varchar("userId", { length: 100 }).notNull(), // Changed from int to varchar for UUID
  username: varchar("username", { length: 50 }).notNull(),
  avatar: varchar("avatar", { length: 500 }).default("male").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "rejected", "expired"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Public invitations table (for broadcasting public invites to all users)
export const publicInvitations = mysqlTable("public_invitations", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  creatorId: varchar("creatorId", { length: 100 }).notNull(), // Room creator who sent the invite
  creatorName: varchar("creatorName", { length: 50 }).notNull(),
  creatorAvatar: varchar("creatorAvatar", { length: 500 }).default("male").notNull(),
  roomName: varchar("roomName", { length: 100 }).notNull(),
  message: varchar("message", { length: 70 }).default("حياكم الله.."), // رسالة الدعوة المخصصة (70 حرف كحد أقصى)
  status: mysqlEnum("status", ["pending", "displayed", "expired"]).default("pending").notNull(),
  displayedAt: timestamp("displayedAt"), // When the invite started being displayed in top 10
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PublicInvitation = typeof publicInvitations.$inferSelect;
export type InsertPublicInvitation = typeof publicInvitations.$inferInsert;

// جدول التفاعلات بين المستخدمين (إعجاب / متابعة / عدم إعجاب)
export const userInteractions = mysqlTable("user_interactions", {
  id: int("id").autoincrement().primaryKey(),
  fromUserId: varchar("fromUserId", { length: 100 }).notNull(), // من ضغط
  toUserId: varchar("toUserId", { length: 100 }).notNull(),     // على من ضغط
  type: mysqlEnum("type", ["like", "follow", "dislike"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type UserInteraction = typeof userInteractions.$inferSelect;
export type InsertUserInteraction = typeof userInteractions.$inferInsert;

// جدول الحجب - يُخفي موقع المستخدم عن المحجوب
export const blockedUsers = mysqlTable("blocked_users", {
  id: int("id").autoincrement().primaryKey(),
  blockerId: varchar("blockerId", { length: 100 }).notNull(), // من قام بالحجب
  blockedId: varchar("blockedId", { length: 100 }).notNull(), // من تم حجبه
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BlockedUser = typeof blockedUsers.$inferSelect;
export type InsertBlockedUser = typeof blockedUsers.$inferInsert;

// جدول البلاغات
export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  // من أرسل البلاغ
  reporterUserId: varchar("reporterUserId", { length: 100 }).notNull(),
  reporterName: varchar("reporterName", { length: 100 }).notNull(),
  // المُبلَّغ عنه (مرسل الرسالة الصوتية)
  reportedUserId: varchar("reportedUserId", { length: 100 }).notNull(),
  reportedName: varchar("reportedName", { length: 100 }).notNull(),
  // تفاصيل الرسالة الصوتية
  audioMessageId: int("audioMessageId"),
  audioUrl: text("audioUrl").notNull(),
  messageType: mysqlEnum("messageType", ["comment", "tarouk"]).notNull(),
  // نوع البلاغ
  reason: mysqlEnum("reason", ["offensive_content", "bad_behavior"]).notNull(),
  // حالة البلاغ
  status: mysqlEnum("status", ["pending", "reviewed", "dismissed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;

// جدول الحظر من الإدارة
export const adminBans = mysqlTable("admin_bans", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 100 }).notNull(),
  username: varchar("username", { length: 100 }).notNull(),
  banType: mysqlEnum("banType", ["1h", "24h", "permanent"]).notNull(),
  expiresAt: timestamp("expiresAt"), // null = دائم
  bannedBy: varchar("bannedBy", { length: 100 }).default("admin").notNull(),
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AdminBan = typeof adminBans.$inferSelect;
export type InsertAdminBan = typeof adminBans.$inferInsert;

// جدول الرسائل الكتابية في الساحات
export const textMessages = mysqlTable("text_messages", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: varchar("userId", { length: 100 }).notNull(),
  username: varchar("username", { length: 50 }).notNull(),
  text: varchar("text", { length: 300 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TextMessage = typeof textMessages.$inferSelect;
export type InsertTextMessage = typeof textMessages.$inferInsert;
