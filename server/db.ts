import { eq, inArray, notInArray, and, asc, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { InsertUser, users, userInteractions, blockedUsers, reports, adminBans } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const connection = await mysql.createPool({
        uri: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: true },
      });
      _db = drizzle(connection) as any;
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByPhone(phoneNumber: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getUserByAppUserId(appUserId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.appUserId, appUserId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function upsertUserByPhone(data: {
  phoneNumber: string;
  name: string;
  avatar: string;
  openId: string;
  appUserId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(users).values({
    openId: data.openId,
    phoneNumber: data.phoneNumber,
    name: data.name,
    avatar: data.avatar,
    appUserId: data.appUserId || null,
    loginMethod: "phone",
    lastSignedIn: new Date(),
  }).onDuplicateKeyUpdate({
    set: {
      name: data.name,
      avatar: data.avatar,
      appUserId: data.appUserId || null,
      lastSignedIn: new Date(),
    }
  });
}

// ============ Rooms ============
import {
  rooms,
  roomParticipants,
  audioMessages,
  reactions,
  sheelohaBroadcasts,
  khaloohaCommands,
  recordingStatus,
  textMessages,
  type InsertRoom,
  type InsertRoomParticipant,
  type InsertAudioMessage,
  type InsertReaction,
  type InsertSheelohaBroadcast,
  type InsertKhaloohaCommand,
  type InsertRecordingStatus,
  type InsertTextMessage,
} from "../drizzle/schema";

export async function getAllRooms() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(rooms)
    .where(eq(rooms.isActive, "true"))
    .orderBy(desc(rooms.createdAt));
}

// دالة محسّنة لجلب الساحات مع Pagination
export async function getRoomsWithPagination(page: number = 1, limit: number = 20) {
  const db = await getDb();
  if (!db) return { rooms: [], total: 0, hasMore: false };

  const offset = (page - 1) * limit;

  // جلب الساحات النشطة مع pagination
  const allRooms = await db
    .select()
    .from(rooms)
    .where(eq(rooms.isActive, "true"))
    .orderBy(desc(rooms.createdAt))
    .limit(limit + 1) // +1 لمعرفة إذا كان هناك المزيد
    .offset(offset);

  const hasMore = allRooms.length > limit;
  const roomsToReturn = hasMore ? allRooms.slice(0, limit) : allRooms;

  if (roomsToReturn.length === 0) return { rooms: [], total: 0, hasMore: false };

  // جلب المشاركين للساحات المجلوبة فقط
  const roomIds = roomsToReturn.map(r => r.id);
  const allParticipants = await db
    .select()
    .from(roomParticipants)
    .where(
      and(
        inArray(roomParticipants.roomId, roomIds),
        eq(roomParticipants.status, "accepted")
      )
    );

  // حساب الإحصائيات لكل ساحة
  const roomsWithCounts = roomsToReturn.map(room => {
    const roomParticipantsList = allParticipants.filter(p => p.roomId === room.id);
    const playerCount = roomParticipantsList.filter(p => p.role === "player" || p.role === "creator").length;
    const viewerCount = roomParticipantsList.filter(p => p.role === "viewer").length;
    const acceptedPlayersCount = roomParticipantsList.filter(p => p.role === "player").length;

    return {
      ...room,
      playerCount,
      viewerCount,
      acceptedPlayersCount,
      isRoomFull: acceptedPlayersCount >= 2,
    };
  });

  // ترتيب حسب الأكثر تفاعلاً
  const sortedRooms = roomsWithCounts.sort((a, b) => {
    const totalA = a.playerCount + a.viewerCount;
    const totalB = b.playerCount + b.viewerCount;
    return totalB - totalA;
  });

  return {
    rooms: sortedRooms,
    hasMore,
    page,
  };
}

// دالة محسّنة لجلب جميع الساحات مع الإحصائيات (للتوافق مع الكود القديم)
export async function getAllRoomsWithCounts() {
  const result = await getRoomsWithPagination(1, 100); // جلب أول 100 ساحة
  return result.rooms;
}

export async function getRoomById(roomId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  return result[0] || null;
}

// دالة محسّنة لجلب بيانات الساحة كاملة في استعلامين فقط (بدلاً من 5)
export async function getRoomWithAllData(roomId: number) {
  const db = await getDb();
  if (!db) throw new Error("Room not found");

  // استعلام 1: جلب الساحة
  const room = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!room[0]) throw new Error("Room not found");

  // استعلام 2: جلب جميع المشاركين
  const participants = await db
    .select()
    .from(roomParticipants)
    .where(eq(roomParticipants.roomId, roomId));

  // حساب الإحصائيات من البيانات المجلوبة (بدون استعلامات إضافية)
  const acceptedParticipants = participants.filter(p => p.status === "accepted");
  const playerCount = acceptedParticipants.filter(p => p.role === "player" || p.role === "creator").length;
  const viewerCount = acceptedParticipants.filter(p => p.role === "viewer").length;
  const acceptedPlayersCount = acceptedParticipants.filter(p => p.role === "player").length;

  return {
    ...room[0],
    participants,
    playerCount,
    viewerCount,
    acceptedPlayersCount,
    isRoomFull: acceptedPlayersCount >= 2,
  };
}

export async function createRoom(data: InsertRoom) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(rooms).values(data);
  return Number(result[0].insertId);
}

export async function updateRoom(roomId: number, data: Partial<InsertRoom>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(rooms).set(data).where(eq(rooms.id, roomId));
}

export async function deleteRoom(roomId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // جلب معرف الساحة لتصفير like/dislike للمشاركين
  const room = await db.select({ creatorId: rooms.creatorId }).from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (room.length > 0) {
    // جلب جميع المشاركين في الساحة
    const participants = await db
      .select({ userId: roomParticipants.userId })
      .from(roomParticipants)
      .where(eq(roomParticipants.roomId, roomId));
    const participantIds = participants.map(p => p.userId);
    // حذف جميع like/dislike لهؤلاء المشاركين (ليس follow)
    if (participantIds.length > 0) {
      await db.delete(userInteractions).where(
        and(
          inArray(userInteractions.toUserId, participantIds),
          sql`${userInteractions.type} IN ('like', 'dislike')`
        )
      );
    }
  }

  // Delete all related data in order (foreign key constraints)
  // 1. Delete reactions
  await db.delete(reactions).where(eq(reactions.roomId, roomId));
  
  // 2. Delete audio messages (احذف فقط الرسائل التي ليس عليها بلاغات)
  const roomAudioIds = await db
    .select({ id: audioMessages.id })
    .from(audioMessages)
    .where(eq(audioMessages.roomId, roomId));
  const allAudioIds = roomAudioIds.map(r => r.id);
  if (allAudioIds.length > 0) {
    const reportedRows = await db
      .select({ audioMessageId: reports.audioMessageId })
      .from(reports)
      .where(inArray(reports.audioMessageId, allAudioIds));
    const reportedIds = reportedRows.map(r => r.audioMessageId).filter((id): id is number => id !== null);
    if (reportedIds.length > 0) {
      await db.delete(audioMessages).where(
        and(eq(audioMessages.roomId, roomId), notInArray(audioMessages.id, reportedIds))
      );
    } else {
      await db.delete(audioMessages).where(eq(audioMessages.roomId, roomId));
    }
  }
  
  // 3. Delete sheeloha broadcasts
  await db.delete(sheelohaBroadcasts).where(eq(sheelohaBroadcasts.roomId, roomId));
  
  // 4. Delete join requests
  await db.delete(joinRequests).where(eq(joinRequests.roomId, roomId));
  
  // 5. Delete participants
  await db.delete(roomParticipants).where(eq(roomParticipants.roomId, roomId));
  
  // 6. Delete the room itself
  await db.delete(rooms).where(eq(rooms.id, roomId));
}

// إضافة إعجاب أو عدم إعجاب بدون قيود (toggle) - كل ضغطة تضيف +1
export async function addLikeDislike(fromUserId: string, toUserId: string, type: "like" | "dislike") {
  const db = await getDb();
  if (!db) return { action: "added" };
  // لا يستطيع الشخص الضغط على نفسه
  if (fromUserId === toUserId) return { action: "self" };
  await db.insert(userInteractions).values({ fromUserId, toUserId, type });
  return { action: "added" };
}

// ============ Room Participants ============

export async function getRoomParticipants(roomId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(roomParticipants).where(eq(roomParticipants.roomId, roomId));
}

export async function getPlayerCount(roomId: number) {
  const db = await getDb();
  if (!db) return 0;

  // Count only non-creator players (role = 'player', not 'creator')
  const players = await db
    .select()
    .from(roomParticipants)
    .where(
      and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.role, "player"),
        eq(roomParticipants.status, "accepted")
      )
    );

  return players.length;
}

export async function getTotalPlayerCount(roomId: number) {
  const db = await getDb();
  if (!db) return 0;

  // Count all players including creator
  const players = await db
    .select()
    .from(roomParticipants)
    .where(
      and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.status, "accepted")
      )
    )
    .then((results) =>
      results.filter((p) => p.role === "player" || p.role === "creator")
    );

  return players.length;
}

export async function getViewerCount(roomId: number) {
  const db = await getDb();
  if (!db) return 0;

  const viewers = await db
    .select()
    .from(roomParticipants)
    .where(
      and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.role, "viewer"),
        eq(roomParticipants.status, "accepted")
      )
    );

  return viewers.length;
}

export async function addParticipant(data: InsertRoomParticipant) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(roomParticipants).values(data);
  return Number(result[0].insertId);
}

export async function updateParticipantStatus(
  participantId: number,
  status: "pending" | "accepted" | "rejected"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(roomParticipants).set({ status }).where(eq(roomParticipants.id, participantId));
}

export async function updateParticipantRole(
  participantId: number,
  role: "creator" | "player" | "viewer"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(roomParticipants).set({ role }).where(eq(roomParticipants.id, participantId));
}

export async function getPendingPlayerRequests(roomId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(roomParticipants)
    .where(
      and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.role, "player"),
        eq(roomParticipants.status, "pending")
      )
    );
}

export async function getAcceptedPlayersCount(roomId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const players = await db
    .select()
    .from(roomParticipants)
    .where(
      and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.role, "player"),
        eq(roomParticipants.status, "accepted")
      )
    );

  return players.length;
}

export async function rejectAllPendingPlayerRequests(roomId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(roomParticipants)
    .set({ status: "rejected" })
    .where(
      and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.role, "player"),
        eq(roomParticipants.status, "pending")
      )
    );
}

export async function getParticipantById(participantId: number) {
  const db = await getDb();
  if (!db) return null;

  const participants = await db
    .select()
    .from(roomParticipants)
    .where(eq(roomParticipants.id, participantId))
    .limit(1);

  return participants[0] || null;
}

export async function removeParticipant(roomId: number, userId: string) {
  const db = await getDb();
  if (!db) return;

  await db
    .delete(roomParticipants)
    .where(
      and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.userId, userId)
      )
    );
}

export async function deleteAllRooms() {
  const db = await getDb();
  if (!db) return;

  // Delete all data in order (foreign key constraints)
  // 1. Delete all reactions
  await db.delete(reactions);
  
  // 2. Delete all audio messages
  await db.delete(audioMessages);
  
  // 3. Delete all participants
  await db.delete(roomParticipants);
  
  // 4. Delete all rooms
  await db.delete(rooms);
  
  console.log("[DB] All rooms and related data deleted on server restart");
}

export async function getUserActiveRoom(creatorId: string) {
  const db = await getDb();
  if (!db) return null;

  const userRooms = await db
    .select()
    .from(rooms)
    .where(
      and(
        eq(rooms.creatorId, creatorId),
        eq(rooms.isActive, "true")
      )
    )
    .limit(1);

  if (!userRooms[0]) return null;

  // جلب عدد طلبات الانضمام المنتظرة (مشاهدين)
  const pendingViewerRequests = await db
    .select()
    .from(joinRequests)
    .where(
      and(
        eq(joinRequests.roomId, userRooms[0].id),
        eq(joinRequests.status, "pending")
      )
    );

  // جلب عدد طلبات اللعب المعلقة
  const pendingPlayerRequests = await db
    .select()
    .from(roomParticipants)
    .where(
      and(
        eq(roomParticipants.roomId, userRooms[0].id),
        eq(roomParticipants.role, "player"),
        eq(roomParticipants.status, "pending")
      )
    );

  return {
    ...userRooms[0],
    pendingRequestsCount: pendingViewerRequests.length + pendingPlayerRequests.length,
  };
}

// ============ Audio Messages ============

export async function getRoomAudioMessages(roomId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(audioMessages)
    .where(eq(audioMessages.roomId, roomId))
    .orderBy(desc(audioMessages.createdAt));
}

export async function addAudioMessage(data: InsertAudioMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(audioMessages).values(data);
  console.log('[audio.create] Saved to DB, id:', result[0].insertId);
  return Number(result[0].insertId);
}

// ============ Text Messages ============

export async function listTextMessages(roomId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(textMessages)
    .where(eq(textMessages.roomId, roomId))
    .orderBy(desc(textMessages.createdAt))
    .limit(100);
}

export async function addTextMessage(data: InsertTextMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(textMessages).values(data);
  return Number(result[0].insertId);
}

export async function getLastTaroukMessage(roomId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(audioMessages)
    .where(and(eq(audioMessages.roomId, roomId), eq(audioMessages.messageType, "tarouk")))
    .orderBy(desc(audioMessages.createdAt))
    .limit(1);

  return result[0] || null;
}

// ============ Reactions ============

export async function addReaction(data: InsertReaction) {
  const db = await getDb();
  if (!db) {
    console.error("[DB] Cannot add reaction: database not available");
    throw new Error("Database not available");
  }
  
  try {
    console.log("[DB] Inserting reaction:", data);
    const result = await db.insert(reactions).values(data);
    const reactionId = Number(result[0].insertId);
    console.log("[DB] Reaction inserted with ID:", reactionId);
    return reactionId;
  } catch (error) {
    console.error("[DB] Failed to insert reaction:", error);
    throw error;
  }
}

export async function getRecentReactions(roomId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(reactions)
    .where(eq(reactions.roomId, roomId))
    .orderBy(asc(reactions.createdAt))
    .limit(limit);
}

// Sheeloha broadcasts functions
export async function createSheelohaBroadcast(data: InsertSheelohaBroadcast) {
  const db = await getDb();
  if (!db) {
    console.error("[DB] Cannot create sheeloha broadcast: database not available");
    throw new Error("Database not available");
  }
  
  try {
    console.log("[DB] Inserting sheeloha broadcast:", data);
    const result = await db.insert(sheelohaBroadcasts).values(data);
    const broadcastId = Number(result[0].insertId);
    console.log("[DB] Sheeloha broadcast inserted with ID:", broadcastId);
    return broadcastId;
  } catch (error) {
    console.error("[DB] Failed to insert sheeloha broadcast:", error);
    throw error;
  }
}

export async function getRecentSheelohaBroadcasts(roomId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(sheelohaBroadcasts)
    .where(eq(sheelohaBroadcasts.roomId, roomId))
    .orderBy(desc(sheelohaBroadcasts.createdAt))
    .limit(limit);
}

// Khalooha commands functions
export async function createKhaloohaCommand(data: InsertKhaloohaCommand) {
  const db = await getDb();
  if (!db) {
    console.error("[DB] Cannot create khalooha command: database not available");
    return 0;
  }

  try {
    console.log("[DB] Inserting khalooha command:", data);
    const result = await db.insert(khaloohaCommands).values(data);
    const commandId = result[0].insertId;
    console.log("[DB] Khalooha command inserted with ID:", commandId);
    return commandId;
  } catch (error) {
    console.error("[DB] Failed to insert khalooha command:", error);
    throw error;
  }
}

export async function getLatestKhaloohaCommand(roomId: number) {
  const db = await getDb();
  if (!db) return null;

  const results = await db
    .select()
    .from(khaloohaCommands)
    .where(eq(khaloohaCommands.roomId, roomId))
    .orderBy(desc(khaloohaCommands.createdAt))
    .limit(1);
  
  return results[0] || null;
}


// ============ Recording Status ============

export async function setRecordingStatus(data: {
  roomId: number;
  userId: string;
  username: string;
  isRecording: boolean;
  recordingType: "comment" | "tarouk";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    // Check if there's an existing record for this user in this room
    const existing = await db
      .select()
      .from(recordingStatus)
      .where(
        and(
          eq(recordingStatus.roomId, data.roomId),
          eq(recordingStatus.userId, data.userId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing record
      await db
        .update(recordingStatus)
        .set({
          isRecording: data.isRecording ? "true" : "false",
          recordingType: data.recordingType,
        })
        .where(eq(recordingStatus.id, existing[0].id));
      return existing[0].id;
    } else {
      // Insert new record
      const result = await db.insert(recordingStatus).values({
        roomId: data.roomId,
        userId: data.userId,
        username: data.username,
        isRecording: data.isRecording ? "true" : "false",
        recordingType: data.recordingType,
      });
      return result[0].insertId;
    }
  } catch (error) {
    console.error("[DB] Failed to set recording status:", error);
    throw error;
  }
}

export async function getActiveRecordings(roomId: number) {
  const db = await getDb();
  if (!db) return [];

  const results = await db
    .select()
    .from(recordingStatus)
    .where(
      and(
        eq(recordingStatus.roomId, roomId),
        eq(recordingStatus.isRecording, "true")
      )
    );

  return results;
}

export async function clearRecordingStatus(roomId: number, userId: string) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(recordingStatus)
    .set({ isRecording: "false" })
    .where(
      and(
        eq(recordingStatus.roomId, roomId),
        eq(recordingStatus.userId, userId)
      )
    );
}


// ============ Join Requests ============

import { joinRequests } from "../drizzle/schema.js";

export async function createJoinRequest(data: {
  roomId: number;
  userId: string;
  username: string;
  avatar: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if there's already a pending request
  const existing = await db
    .select()
    .from(joinRequests)
    .where(
      and(
        eq(joinRequests.roomId, data.roomId),
        eq(joinRequests.userId, data.userId),
        eq(joinRequests.status, "pending")
      )
    )
    .limit(1);

  if (existing.length > 0) {
    throw new Error("لديك طلب معلق بالفعل");
  }

  const result = await db.insert(joinRequests).values(data);
  return Number(result[0].insertId);
}

export async function getPendingJoinRequests(roomId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(joinRequests)
    .where(
      and(
        eq(joinRequests.roomId, roomId),
        eq(joinRequests.status, "pending")
      )
    )
    .orderBy(desc(joinRequests.createdAt));
}

export async function respondToJoinRequest(requestId: number, accept: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get the request first
  const request = await db
    .select()
    .from(joinRequests)
    .where(eq(joinRequests.id, requestId))
    .limit(1);

  if (!request[0]) {
    throw new Error("الطلب غير موجود");
  }

  const status = accept ? "accepted" : "rejected";
  await db
    .update(joinRequests)
    .set({ status })
    .where(eq(joinRequests.id, requestId));

  return request[0];
}

export async function expireJoinRequest(requestId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(joinRequests)
    .set({ status: "expired" })
    .where(eq(joinRequests.id, requestId));
}

export async function promoteViewerToPlayer(roomId: number, userId: string, username: string, avatar: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // First check if participant exists
  const existing = await db
    .select()
    .from(roomParticipants)
    .where(
      and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.userId, userId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing participant to player
    await db
      .update(roomParticipants)
      .set({ role: "player", status: "accepted" })
      .where(
        and(
          eq(roomParticipants.roomId, roomId),
          eq(roomParticipants.userId, userId)
        )
      );
  } else {
    // Add new participant as player
    await db.insert(roomParticipants).values({
      roomId,
      userId,
      username,
      avatar,
      role: "player",
      status: "accepted",
    });
  }
}

export async function kickPlayer(roomId: number, playerId: string, creatorId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Verify the requester is the creator
  const room = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (!room[0] || room[0].creatorId !== creatorId) {
    throw new Error("ليس لديك صلاحية الاستبعاد");
  }

  // Remove the player
  await db
    .delete(roomParticipants)
    .where(
      and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.userId, playerId),
        eq(roomParticipants.role, "player")
      )
    );

  return { success: true };
}


export async function updateParticipantProfile(
  roomId: number,
  userId: string,
  newUsername: string,
  newAvatar: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Update the participant's profile in this room
  await db
    .update(roomParticipants)
    .set({ username: newUsername, avatar: newAvatar })
    .where(
      and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.userId, userId)
      )
    );

  return { success: true };
}


// ============ Public Invitations ============

import { publicInvitations, type InsertPublicInvitation } from "../drizzle/schema.js";

export async function createPublicInvitation(data: {
  roomId: number;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  roomName: string;
  message?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(publicInvitations).values(data);
  return Number(result[0].insertId);
}

export async function getPendingPublicInvitations(limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(publicInvitations)
    .where(eq(publicInvitations.status, "pending"))
    .orderBy(asc(publicInvitations.createdAt))
    .limit(limit);
}

export async function getDisplayedPublicInvitations(limit: number = 10) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(publicInvitations)
    .where(eq(publicInvitations.status, "displayed"))
    .orderBy(asc(publicInvitations.displayedAt))
    .limit(limit);
}

export async function markInvitationAsDisplayed(invitationId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(publicInvitations)
    .set({ status: "displayed", displayedAt: new Date() })
    .where(eq(publicInvitations.id, invitationId));
}

export async function expirePublicInvitation(invitationId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(publicInvitations)
    .set({ status: "expired" })
    .where(eq(publicInvitations.id, invitationId));
}

export async function deletePublicInvitationsByRoom(roomId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .delete(publicInvitations)
    .where(eq(publicInvitations.roomId, roomId));
}

// ============ Gold Star & Extension ============
// النجمة: تظهر لمدة 24 ساعة
// التمديد: يستمر لمدة 5 أيام

export async function awardGoldStar(roomId: number) {
  const db = await getDb();
  if (!db) return;

  // النجمة تنتهي بعد 24 ساعة
  const starExpiresAt = new Date();
  starExpiresAt.setHours(starExpiresAt.getHours() + 24);

  // التمديد ينتهي بعد 5 أيام
  const extensionExpiresAt = new Date();
  extensionExpiresAt.setDate(extensionExpiresAt.getDate() + 5);

  // منح النجمة والتمديد معاً
  await db
    .update(rooms)
    .set({ 
      hasGoldStar: "true", 
      goldStarExpiresAt: starExpiresAt, // 24 ساعة للنجمة
      extensionExpiresAt: extensionExpiresAt, // 5 أيام للتمديد
      extensionLostAt: null // إعادة ضبط وقت فقدان التمديد
    })
    .where(eq(rooms.id, roomId));
  
  console.log(`[GoldStar] Awarded star (24h) and extension (5d) for room ${roomId}`);
}

// إزالة النجمة فقط (بعد 24 ساعة) - التمديد يستمر
export async function removeGoldStar(roomId: number) {
  const db = await getDb();
  if (!db) return;

  // إزالة النجمة فقط - التمديد يبقى كما هو
  await db
    .update(rooms)
    .set({ 
      hasGoldStar: "false", 
      goldStarExpiresAt: null
      // extensionExpiresAt يبقى كما هو
    })
    .where(eq(rooms.id, roomId));
  
  console.log(`[GoldStar] Star removed from room ${roomId}, extension still active`);
}

// إزالة التمديد (بعد 5 أيام) - يبدأ عداد الـ 15 دقيقة
export async function removeExtension(roomId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(rooms)
    .set({ 
      extensionExpiresAt: null,
      extensionLostAt: new Date() // تسجيل وقت فقدان التمديد لبدء عداد الـ 15 دقيقة
    })
    .where(eq(rooms.id, roomId));
  
  console.log(`[GoldStar] Extension removed from room ${roomId}, 15-minute deletion timer starts now`);
}

export async function updateLastPublicInviteTime(roomId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(rooms)
    .set({ lastPublicInviteAt: new Date() })
    .where(eq(rooms.id, roomId));
}

export async function canSendPublicInvite(roomId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const room = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (!room[0]) return false;

  // If never sent, allow
  if (!room[0].lastPublicInviteAt) return true;

  // Check if 5 minutes have passed
  const fiveMinutesAgo = new Date();
  fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

  return room[0].lastPublicInviteAt < fiveMinutesAgo;
}

// ============ Top 10 Rooms ============

export async function getTop10Rooms() {
  const db = await getDb();
  if (!db) return [];

  // جلب جميع الساحات النشطة
  const allRooms = await db
    .select()
    .from(rooms)
    .where(eq(rooms.isActive, "true"));

  if (allRooms.length === 0) return [];

  // جلب جميع المشاركين للساحات النشطة
  const roomIds = allRooms.map(r => r.id);
  const allParticipants = await db
    .select()
    .from(roomParticipants)
    .where(
      and(
        inArray(roomParticipants.roomId, roomIds),
        eq(roomParticipants.status, "accepted")
      )
    );

  // جلب جميع طلبات الانضمام المنتظرة
  const allPendingRequests = await db
    .select()
    .from(joinRequests)
    .where(
      and(
        inArray(joinRequests.roomId, roomIds),
        eq(joinRequests.status, "pending")
      )
    );

  // حساب الإحصائيات لكل ساحة
  const roomsWithStats = allRooms.map(room => {
    const roomParticipantsList = allParticipants.filter(p => p.roomId === room.id);
    const roomPendingRequests = allPendingRequests.filter(r => r.roomId === room.id);
    
    const viewerCount = roomParticipantsList.filter(p => p.role === "viewer").length;
    const playerCount = roomParticipantsList.filter(p => p.role === "player" || p.role === "creator").length;
    const pendingRequestsCount = roomPendingRequests.length;
    const acceptedPlayersCount = roomParticipantsList.filter(p => p.role === "player").length;

    return {
      ...room,
      viewerCount,
      playerCount,
      pendingRequestsCount,
      acceptedPlayersCount,
      isRoomFull: acceptedPlayersCount >= 2,
    };
  });

  // ترتيب حسب المعايير:
  // 1. المستمعين الآنيين (الأكثر أولاً)
  // 2. طلبات الانضمام المنتظرة (الأكثر أولاً)
  // 3. اللاعبين الآنيين (الأكثر أولاً)
  // 4. تاريخ الإنشاء (الأقدم أولاً)
  const sortedRooms = roomsWithStats.sort((a, b) => {
    // 1. المستمعين
    if (b.viewerCount !== a.viewerCount) {
      return b.viewerCount - a.viewerCount;
    }
    // 2. طلبات الانضمام المنتظرة
    if (b.pendingRequestsCount !== a.pendingRequestsCount) {
      return b.pendingRequestsCount - a.pendingRequestsCount;
    }
    // 3. اللاعبين
    if (b.playerCount !== a.playerCount) {
      return b.playerCount - a.playerCount;
    }
    // 4. الأقدم أولاً
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // إرجاع أفضل 10 ساحات فقط
  return sortedRooms.slice(0, 10);
}

// دالة للتحقق من منح النجمة الذهبية
export async function checkAndAwardGoldStar(roomId: number) {
  const db = await getDb();
  if (!db) return false;

  // جلب عدد المشاهدين الحاليين
  const viewers = await db
    .select()
    .from(roomParticipants)
    .where(
      and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.role, "viewer"),
        eq(roomParticipants.status, "accepted")
      )
    );

  // إذا كان عدد المشاهدين أكثر من 20، منح النجمة
  if (viewers.length > 20) {
    await awardGoldStar(roomId);
    return true;
  }

  return false;
}


// تحديث وقت آخر لاعب منضم للساحة
export async function updateLastPlayerJoinTime(roomId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(rooms)
    .set({ lastPlayerJoinAt: new Date() })
    .where(eq(rooms.id, roomId));
}

// إعادة ضبط حقول النجمة والتمديد عند حذف/إغلاق الساحة
export async function resetGoldStarOnRoomClose(roomId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(rooms)
    .set({ 
      hasGoldStar: "false", 
      goldStarExpiresAt: null,
      extensionExpiresAt: null,
      extensionLostAt: null,
      lastPlayerJoinAt: null,
      lastPlayerLeftAt: null
    })
    .where(eq(rooms.id, roomId));
  
  console.log(`[GoldStar] Reset all star/extension fields for room ${roomId} on close`);
}


// تحديث وقت خروج آخر لاعب من الساحة
export async function updateLastPlayerLeftTime(roomId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(rooms)
    .set({ lastPlayerLeftAt: new Date() })
    .where(eq(rooms.id, roomId));
  
  console.log(`[Room] Updated lastPlayerLeftAt for room ${roomId}`);
}


// ============ Tarouk Controller & Clapping Delay ============

// تحديث المتحكم بالطاروق
export async function updateTaroukController(roomId: number, controller: "creator" | "player1" | "player2" | null) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(rooms)
    .set({ taroukController: controller })
    .where(eq(rooms.id, roomId));
  
  console.log(`[Room] Updated taroukController for room ${roomId} to: ${controller}`);
}

// تحديث سرعة التصفيق
export async function updateClappingDelay(roomId: number, delay: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(rooms)
    .set({ clappingDelay: delay.toString() })
    .where(eq(rooms.id, roomId));
  
  console.log(`[Room] Updated clappingDelay for room ${roomId} to: ${delay}`);
}

// جلب حالة المتحكم والسرعة
export async function getRoomControlState(roomId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select({
      taroukController: rooms.taroukController,
      clappingDelay: rooms.clappingDelay,
    })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  
  if (!result[0]) return null;
  
  return {
    taroukController: result[0].taroukController,
    clappingDelay: parseFloat(result[0].clappingDelay || "0.80"),
  };
}

// ===== دوال التفاعل بين المستخدمين =====

// تبديل التفاعل (إضافة أو حذف)
export async function toggleUserInteraction(fromUserId: string, toUserId: string, type: "like" | "follow" | "dislike") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // تحقق هل التفاعل موجود
  const existing = await db
    .select()
    .from(userInteractions)
    .where(and(
      eq(userInteractions.fromUserId, fromUserId),
      eq(userInteractions.toUserId, toUserId),
      eq(userInteractions.type, type)
    ))
    .limit(1);

  if (existing.length > 0) {
    // إلغاء التفاعل
    await db.delete(userInteractions).where(
      and(
        eq(userInteractions.fromUserId, fromUserId),
        eq(userInteractions.toUserId, toUserId),
        eq(userInteractions.type, type)
      )
    );
    return { action: "removed" };
  } else {
    // إضافة التفاعل
    await db.insert(userInteractions).values({ fromUserId, toUserId, type });
    return { action: "added" };
  }
}

// جلب عدد التفاعلات لمستخدم معين + هل المستخدم الحالي فعّلها
export async function getUserInteractionStats(toUserId: string, fromUserId: string) {
  const db = await getDb();
  if (!db) return { likes: 0, follows: 0, dislikes: 0, myLike: false, myFollow: false, myDislike: false };

  const [counts] = await db.execute(sql`
    SELECT
      SUM(type = 'like') as likes,
      SUM(type = 'follow') as follows,
      SUM(type = 'dislike') as dislikes
    FROM user_interactions
    WHERE toUserId = ${toUserId}
  `);

  const myInteractions = await db
    .select()
    .from(userInteractions)
    .where(and(
      eq(userInteractions.fromUserId, fromUserId),
      eq(userInteractions.toUserId, toUserId)
    ));

  const row = (counts as unknown as any[])[0] || {};
  return {
    likes: Number(row.likes || 0),
    follows: Number(row.follows || 0),
    dislikes: Number(row.dislikes || 0),
    myLike: myInteractions.some(i => i.type === "like"),
    myFollow: myInteractions.some(i => i.type === "follow"),
    myDislike: myInteractions.some(i => i.type === "dislike"),
  };
}

// جلب قائمة من يتابعهم المستخدم مع بياناتهم
export async function getFollowing(userId: string) {
  const db = await getDb();
  if (!db) return [];
  // جلب IDs المتابَعين
  const following = await db
    .select({ toUserId: userInteractions.toUserId })
    .from(userInteractions)
    .where(and(eq(userInteractions.fromUserId, userId), eq(userInteractions.type, "follow")));
  if (following.length === 0) return [];
  // جلب بيانات المستخدمين من جدول users
  const targetIds = following.map(f => f.toUserId);
  // جلب الاسم من users.appUserId أولاً، ثم roomParticipants كـ fallback
  const usersData = await db
    .select({ appUserId: users.appUserId, name: users.name, avatar: users.avatar })
    .from(users)
    .where(inArray(users.appUserId, targetIds));
  const userMapFromUsers = new Map<string, { username: string; avatar: string | null }>();
  for (const u of usersData) {
    if (u.appUserId) userMapFromUsers.set(u.appUserId, { username: u.name || u.appUserId, avatar: u.avatar || null });
  }
  // جلب من roomParticipants للمستخدمين الذين ليس لهم سجل في users
  const missingIds = targetIds.filter(id => !userMapFromUsers.has(id));
  const userMap = new Map<string, { username: string; avatar: string | null }>(userMapFromUsers);
  if (missingIds.length > 0) {
    const participantsData = await db
      .select({ userId: roomParticipants.userId, username: roomParticipants.username, avatar: roomParticipants.avatar })
      .from(roomParticipants)
      .where(inArray(roomParticipants.userId, missingIds))
      .orderBy(desc(roomParticipants.id));
    for (const p of participantsData) {
      if (!userMap.has(p.userId)) {
        userMap.set(p.userId, { username: p.username || p.userId, avatar: p.avatar || null });
      }
    }
  }
  return following.map(f => ({
    toUserId: f.toUserId,
    toUsername: userMap.get(f.toUserId)?.username || f.toUserId,
    toAvatar: userMap.get(f.toUserId)?.avatar || null,
  }));
}

// جلب قائمة من يتابعون المستخدم مع بياناتهم
export async function getFollowers(userId: string) {
  const db = await getDb();
  if (!db) return [];
  // جلب IDs المتابِعين
  const followers = await db
    .select({ fromUserId: userInteractions.fromUserId })
    .from(userInteractions)
    .where(and(eq(userInteractions.toUserId, userId), eq(userInteractions.type, "follow")));
  if (followers.length === 0) return [];
  // جلب بيانات المستخدمين من جدول users
  const sourceIds = followers.map(f => f.fromUserId);
  // جلب الاسم من users.appUserId أولاً، ثم roomParticipants كـ fallback
  const usersData = await db
    .select({ appUserId: users.appUserId, name: users.name, avatar: users.avatar })
    .from(users)
    .where(inArray(users.appUserId, sourceIds));
  const userMapFromUsers = new Map<string, { username: string; avatar: string | null }>();
  for (const u of usersData) {
    if (u.appUserId) userMapFromUsers.set(u.appUserId, { username: u.name || u.appUserId, avatar: u.avatar || null });
  }
  // جلب من roomParticipants للمستخدمين الذين ليس لهم سجل في users
  const missingIds = sourceIds.filter(id => !userMapFromUsers.has(id));
  const userMap = new Map<string, { username: string; avatar: string | null }>(userMapFromUsers);
  if (missingIds.length > 0) {
    const participantsData = await db
      .select({ userId: roomParticipants.userId, username: roomParticipants.username, avatar: roomParticipants.avatar })
      .from(roomParticipants)
      .where(inArray(roomParticipants.userId, missingIds))
      .orderBy(desc(roomParticipants.id));
    for (const p of participantsData) {
      if (!userMap.has(p.userId)) {
        userMap.set(p.userId, { username: p.username || p.userId, avatar: p.avatar || null });
      }
    }
  }
  return followers.map(f => ({
    fromUserId: f.fromUserId,
    fromUsername: userMap.get(f.fromUserId)?.username || f.fromUserId,
    fromAvatar: userMap.get(f.fromUserId)?.avatar || null,
  }));
}

// ============ Blocked Users ============

// toggle الحجب: إذا موجود يحذفه، إذا غير موجود يضيفه
export async function toggleBlock(blockerId: string, blockedId: string): Promise<{ action: "blocked" | "unblocked" }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(blockedUsers)
    .where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId)))
    .limit(1);
  if (existing.length > 0) {
    await db.delete(blockedUsers).where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId)));
    return { action: "unblocked" };
  } else {
    await db.insert(blockedUsers).values({ blockerId, blockedId });
    return { action: "blocked" };
  }
}

// هل حجب blockerId شخصاً معيناً؟
export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.select({ id: blockedUsers.id }).from(blockedUsers)
    .where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId)))
    .limit(1);
  return result.length > 0;
}

// جلب قائمة IDs المحجوبين من قِبَل مستخدم معين
export async function getBlockedIds(blockerId: string): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({ blockedId: blockedUsers.blockedId }).from(blockedUsers)
    .where(eq(blockedUsers.blockerId, blockerId));
  return result.map(r => r.blockedId);
}

// جلب IDs الذين حجبوا مستخدماً معيناً (أي من قام بحجب userId)
export async function getBlockedByIds(userId: string): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({ blockerId: blockedUsers.blockerId }).from(blockedUsers)
    .where(eq(blockedUsers.blockedId, userId));
  return result.map(r => r.blockerId);
}

// ============ Reports ============
export async function submitReport(input: {
  reporterUserId: string;
  reporterName?: string;
  reportedUserId: string;
  reportedName?: string;
  audioMessageId?: number;
  audioUrl: string;
  textContent?: string;
  messageType: "comment" | "tarouk";
  reason: "offensive_content" | "bad_behavior";
}): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // للرسائل النصية: نحفظ نص الرسالة في حقل audioUrl
  const storedAudioUrl = input.textContent ? input.textContent : input.audioUrl;
  const result = await db.insert(reports).values({
    reporterUserId: input.reporterUserId,
    reporterName: input.reporterName ?? input.reporterUserId,
    reportedUserId: input.reportedUserId,
    reportedName: input.reportedName ?? input.reportedUserId,
    audioMessageId: input.audioMessageId ?? null,
    audioUrl: storedAudioUrl,
    messageType: input.messageType,
    reason: input.reason,
    status: "pending",
  });
  return { id: Number((result as any)[0]?.insertId ?? 0) };
}

export async function getAllReports() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reports).orderBy(desc(reports.createdAt));
}

export async function deleteReport(reportId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(reports).where(eq(reports.id, reportId));
}

// ============ Admin Bans ============
export async function banUser(
  userId: string,
  username: string,
  banType: "1h" | "24h" | "permanent"
): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // إلغاء أي حظر سابق لنفس المستخدم
  await db.update(adminBans)
    .set({ isActive: "false" })
    .where(and(eq(adminBans.userId, userId), eq(adminBans.isActive, "true")));
  // حساب وقت الانتهاء
  let expiresAt: Date | null = null;
  if (banType === "1h") {
    expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  } else if (banType === "24h") {
    expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  const result = await db.insert(adminBans).values({
    userId,
    username,
    banType,
    expiresAt,
    bannedBy: "admin",
    isActive: "true",
  });
  return { id: Number((result as any)[0]?.insertId ?? 0) };
}

export async function checkActiveBan(userId: string): Promise<{ isBanned: boolean; banType?: string; expiresAt?: Date | null }> {
  const db = await getDb();
  if (!db) return { isBanned: false };
  const bans = await db.select().from(adminBans)
    .where(and(eq(adminBans.userId, userId), eq(adminBans.isActive, "true")))
    .orderBy(desc(adminBans.createdAt))
    .limit(1);
  if (bans.length === 0) return { isBanned: false };
  const ban = bans[0];
  // التحقق من انتهاء الحظر المؤقت
  if (ban.expiresAt && new Date() > ban.expiresAt) {
    await db.update(adminBans).set({ isActive: "false" }).where(eq(adminBans.id, ban.id));
    return { isBanned: false };
  }
  return { isBanned: true, banType: ban.banType, expiresAt: ban.expiresAt };
}

export async function liftBan(userId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(adminBans)
    .set({ isActive: "false" })
    .where(and(eq(adminBans.userId, userId), eq(adminBans.isActive, "true")));
}
