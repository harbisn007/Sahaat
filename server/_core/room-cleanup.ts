/**
 * نظام حذف الساحات الفارغة تلقائياً
 * 
 * يحذف الساحات التي لا يوجد فيها لاعب (غير المنشئ) لمدة 15 دقيقة
 * الساحات ذات النجمة الذهبية: 60 دقيقة
 */

import { getDb } from "../db";
import { rooms, roomParticipants, audioMessages, reactions, sheelohaBroadcasts, khaloohaCommands, recordingStatus, joinRequests, publicInvitations } from "../../drizzle/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { broadcastRoomDeleted } from "./socket";

// الفترة الزمنية بالدقائق قبل حذف الساحة الفارغة
const EMPTY_ROOM_TIMEOUT_MINUTES = 15;
// الفترة الزمنية للساحات ذات النجمة الذهبية
const GOLD_STAR_ROOM_TIMEOUT_MINUTES = 60;

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
 * التحقق مما إذا كانت الساحة لديها نجمة ذهبية نشطة
 */
async function hasActiveGoldStar(roomId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const room = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (!room[0]) return false;

  // التحقق من وجود النجمة وعدم انتهاء صلاحيتها
  if (room[0].hasGoldStar === "true" && room[0].goldStarExpiresAt) {
    const now = new Date();
    return new Date(room[0].goldStarExpiresAt) > now;
  }

  return false;
}

/**
 * إزالة النجمة الذهبية المنتهية الصلاحية
 */
async function cleanupExpiredGoldStars(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date();

  // إزالة النجمة من الساحات التي انتهت صلاحية نجمتها
  await db
    .update(rooms)
    .set({ hasGoldStar: "false", goldStarExpiresAt: null })
    .where(
      and(
        eq(rooms.hasGoldStar, "true"),
        lt(rooms.goldStarExpiresAt, now)
      )
    );
}

/**
 * حذف الساحة وجميع بياناتها
 */
async function deleteRoomCompletely(roomId: number): Promise<void> {
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
    await db.delete(publicInvitations).where(eq(publicInvitations.roomId, roomId));
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
    // أولاً: تنظيف النجوم الذهبية المنتهية
    await cleanupExpiredGoldStars();

    // جلب جميع الساحات النشطة
    const activeRooms = await db
      .select()
      .from(rooms)
      .where(eq(rooms.isActive, "true"));

    const now = new Date();

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
          // أول مرة نرى هذه الساحة فارغة - بدء العد من الآن
          roomLastPlayerActivity.set(roomId, now);
        } else {
          const elapsedMs = now.getTime() - lastActivity.getTime();

          // تحديد المدة المسموحة بناءً على النجمة الذهبية
          const hasGoldStar = await hasActiveGoldStar(roomId);
          const timeoutMinutes = hasGoldStar ? GOLD_STAR_ROOM_TIMEOUT_MINUTES : EMPTY_ROOM_TIMEOUT_MINUTES;
          const timeoutMs = timeoutMinutes * 60 * 1000;

          if (elapsedMs >= timeoutMs) {
            // مرت المدة المحددة بدون لاعب - حذف الساحة
            console.log(`[RoomCleanup] Room ${roomId} timeout (${timeoutMinutes} min, goldStar: ${hasGoldStar})`);
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
  console.log(`[RoomCleanup] Starting cleanup service (timeout: ${EMPTY_ROOM_TIMEOUT_MINUTES} minutes, gold star: ${GOLD_STAR_ROOM_TIMEOUT_MINUTES} minutes)`);

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
