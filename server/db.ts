import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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

// ============ Rooms ============

import { and, asc, desc } from "drizzle-orm";
import {
  rooms,
  roomParticipants,
  audioMessages,
  reactions,
  sheelohaBroadcasts,
  type InsertRoom,
  type InsertRoomParticipant,
  type InsertAudioMessage,
  type InsertReaction,
  type InsertSheelohaBroadcast,
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

export async function getRoomById(roomId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  return result[0] || null;
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

  // Delete all related data in order (foreign key constraints)
  // 1. Delete reactions
  await db.delete(reactions).where(eq(reactions.roomId, roomId));
  
  // 2. Delete audio messages
  await db.delete(audioMessages).where(eq(audioMessages.roomId, roomId));
  
  // 3. Delete participants
  await db.delete(roomParticipants).where(eq(roomParticipants.roomId, roomId));
  
  // 4. Delete the room itself
  await db.delete(rooms).where(eq(rooms.id, roomId));
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

export async function removeParticipant(roomId: number, userId: number) {
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

export async function getUserActiveRoom(creatorId: number) {
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

  return userRooms[0] || null;
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
