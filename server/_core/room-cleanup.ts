/**
 * نظام حذف الساحات الفارغة تلقائياً
 * 
 * يحذف الساحات التي لا يوجد فيها لاعب (غير المنشئ) لمدة 15 دقيقة
 */

import { getDb } from "../db";
import { rooms, roomParticipants, audioMessages, reactions, sheelohaBroadcasts, khaloohaCommands, recordingStatus, joinRequests } from "../../drizzle/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { broadcastRoomDeleted } from "./socket";

// الفترة الزمنية بالدقائق قبل حذف الساحة الفارغة
const EMPTY_ROOM_TIMEOUT_MINUTES = 15;

// فترة التحقق بالمللي ثانية (كل دقيقة)
const CHECK_INTERVAL_MS = 60 * 1000;

// تخزين وقت آخر نشاط لكل ساحة (وجود لاعب غير المنشئ)
const roomLastPlayerActivity: Map<number, Date> = new Map();

/**
 * تسجيل نشاط لاعب في الساحة
 */
export function recordPlayerActivity(roomId: number) {
  roomLastPlayerActivity.set(roomId, new Date());
}

/**
 * إزالة تتبع الساحة عند حذفها
 */
export function removeRoomTracking(roomId: number) {
  roomLastPlayerActivity.delete(roomId);
}

/**
 * التحقق من وجود لاعب (غير المنشئ) في الساحة
 */
async function hasNonCreatorPlayer(roomId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

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

  return players.length > 0;
}

/**
 * حذف الساحة وجميع بياناتها
 */
export async function deleteRoomCompletely(roomId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  console.log(`[RoomCleanup] Deleting empty room ${roomId}`);

  try {
    // حذف جميع البيانات المرتبطة بالترتيب
    await db.delete(reactions).where(eq(reactions.roomId, roomId));
    await db.delete(audioMessages).where(eq(audioMessages.roomId, roomId));
    await db.delete(sheelohaBroadcasts).where(eq(sheelohaBroadcasts.roomId, roomId));
    await db.delete(khaloohaCommands).where(eq(khaloohaCommands.roomId, roomId));
    await db.delete(recordingStatus).where(eq(recordingStatus.roomId, roomId));
    await db.delete(joinRequests).where(eq(joinRequests.roomId, roomId));
    await db.delete(roomParticipants).where(eq(roomParticipants.roomId, roomId));
    await db.delete(rooms).where(eq(rooms.id, roomId));

    // إزالة التتبع
    removeRoomTracking(roomId);

    // إخطار جميع المتصلين بحذف الساحة
    broadcastRoomDeleted(roomId);

    console.log(`[RoomCleanup] Room ${roomId} deleted successfully`);
  } catch (error) {
    console.error(`[RoomCleanup] Failed to delete room ${roomId}:`, error);
  }
}

/**
 * فحص وحذف الساحات الفارغة
 */
async function checkAndCleanupEmptyRooms(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    // جلب جميع الساحات النشطة
    const activeRooms = await db
      .select()
      .from(rooms)
      .where(eq(rooms.isActive, "true"));

    const now = new Date();
    const timeoutMs = EMPTY_ROOM_TIMEOUT_MINUTES * 60 * 1000;

    for (const room of activeRooms) {
      const roomId = room.id;

      // التحقق من وجود لاعب
      const hasPlayer = await hasNonCreatorPlayer(roomId);

      if (hasPlayer) {
        // تحديث وقت النشاط
        recordPlayerActivity(roomId);
      } else {
        // لا يوجد لاعب - التحقق من المدة
        const lastActivity = roomLastPlayerActivity.get(roomId);

        if (!lastActivity) {
          // أول مرة نرى هذه الساحة فارغة - بدء العد
          roomLastPlayerActivity.set(roomId, new Date(room.createdAt));
        } else {
          const elapsedMs = now.getTime() - lastActivity.getTime();

          if (elapsedMs >= timeoutMs) {
            // مرت 15 دقيقة بدون لاعب - حذف الساحة
            await deleteRoomCompletely(roomId);
          }
        }
      }
    }
  } catch (error) {
    console.error("[RoomCleanup] Error during cleanup check:", error);
  }
}

/**
 * بدء نظام التنظيف التلقائي
 */
export function startRoomCleanupService(): void {
  console.log(`[RoomCleanup] Starting cleanup service (timeout: ${EMPTY_ROOM_TIMEOUT_MINUTES} minutes)`);

  // تشغيل الفحص الأول بعد دقيقة
  setTimeout(() => {
    checkAndCleanupEmptyRooms();
  }, CHECK_INTERVAL_MS);

  // تشغيل الفحص الدوري
  setInterval(() => {
    checkAndCleanupEmptyRooms();
  }, CHECK_INTERVAL_MS);
}

/**
 * حذف ساحة فوراً (عند إغلاقها من المنشئ)
 */
export async function deleteRoomImmediately(roomId: number): Promise<void> {
  await deleteRoomCompletely(roomId);
}

/**
 * حذف الساحة وبيانات المنشئ (عند إغلاق التطبيق)
 */
export async function deleteRoomAndCreatorData(roomId: number, creatorId: string): Promise<void> {
  console.log(`[RoomCleanup] Deleting room ${roomId} and creator ${creatorId} data`);
  
  // حذف الساحة أولاً
  await deleteRoomCompletely(roomId);
  
  // حذف بيانات المنشئ من جميع الساحات (إذا كان مشاركاً في ساحات أخرى)
  const db = await getDb();
  if (db) {
    await db.delete(roomParticipants).where(eq(roomParticipants.userId, creatorId));
    console.log(`[RoomCleanup] Creator ${creatorId} data deleted from all rooms`);
  }
}
