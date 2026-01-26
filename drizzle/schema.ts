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
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Rooms table
export const rooms = mysqlTable("rooms", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  creatorId: int("creatorId").notNull(),
  creatorName: varchar("creatorName", { length: 50 }).notNull(),
  creatorAvatar: varchar("creatorAvatar", { length: 500 }).default("male").notNull(), // 'male', 'female', or custom URL
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Room participants table
export const roomParticipants = mysqlTable("room_participants", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: int("userId").notNull(),
  username: varchar("username", { length: 50 }).notNull(),
  avatar: varchar("avatar", { length: 500 }).default("male").notNull(), // 'male', 'female', or custom URL
  role: mysqlEnum("role", ["creator", "player", "viewer"]).notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "rejected"]).default("accepted").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

// Audio messages table
export const audioMessages = mysqlTable("audio_messages", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: int("userId").notNull(),
  username: varchar("username", { length: 50 }).notNull(),
  messageType: mysqlEnum("messageType", ["comment", "tarouk"]).notNull(),
  audioUrl: text("audioUrl").notNull(),
  duration: int("duration").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Reactions table
export const reactions = mysqlTable("reactions", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: int("userId").notNull(),
  username: varchar("username", { length: 50 }).notNull(),
  reactionType: varchar("reactionType", { length: 20 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Sheeloha broadcasts table (for broadcasting "شيلوها" button press to all users)
export const sheelohaBroadcasts = mysqlTable("sheeloha_broadcasts", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: int("userId").notNull(),
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
  userId: int("userId").notNull(),
  username: varchar("username", { length: 50 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SheelohaBroadcast = typeof sheelohaBroadcasts.$inferSelect;
export type InsertSheelohaBroadcast = typeof sheelohaBroadcasts.$inferInsert;

export type KhaloohaCommand = typeof khaloohaCommands.$inferSelect;
export type InsertKhaloohaCommand = typeof khaloohaCommands.$inferInsert;
