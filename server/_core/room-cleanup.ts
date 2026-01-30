/**
 * نظام حذف الساحات الفارغة تلقائياً
 * 
 * الساحات العادية: 15 دقيقة بدون لاعب
 * الساحات ذات النجمة الذهبية: 5 أيام من وقت الحصول على النجمة
 * 
 * ترتيب حساب الـ 15 دقيقة:
 * 1. وقت فقدان النجمة (goldStarLostAt)
 * 2. وقت آخر لاعب منضم (lastPlayerJoinAt)
 * 3. وقت إنشاء الساحة (createdAt)
 */

import { getDb, removeGoldStar } from "../db";
import { rooms, roomParticipants, audioMessages, reactions, sheelohaBroadcasts, khaloohaCommands, recordingStatus, joinRequests, publicInvitations } from "../../drizzle/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { broadcastRoomDeleted } from "./socket";

// الفترة الزمنية بالدقائق قبل حذف الساحة الفارغة
const EMPTY_ROOM_TIMEOUT_MINUTES = 15;

// فترة التحقق بالمللي ثانية (كل دقيقة)
const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * إزالة تتبع الساحة عند حذفها
 */
export function removeRoomTracking(roomId: number) {
  // لم نعد نستخدم Map للتتبع، نعتمد على قاعدة البيانات
  console.log(`[RoomCleanup] Removed tracking for room ${roomId}`);
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
async function hasActiveGoldStar(room: typeof rooms.$inferSelect): Promise<boolean> {
  if (room.hasGoldStar !== "true" || !room.goldStarExpiresAt) {
    return false;
  }
  
  const now = new Date();
  return new Date(room.goldStarExpiresAt) > now;
}

/**
 * إزالة النجوم الذهبية المنتهية الصلاحية وتسجيل وقت الفقدان
 */
async function cleanupExpiredGoldStars(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date();

  // جلب الساحات التي انتهت صلاحية نجمتها
  const expiredRooms = await db
    .select()
    .from(rooms)
    .where(
      and(
        eq(rooms.hasGoldStar, "true"),
        lt(rooms.goldStarExpiresAt, now)
      )
    );

  // إزالة النجمة وتسجيل وقت الفقدان لكل ساحة
  for (const room of expiredRooms) {
    console.log(`[RoomCleanup] Gold star expired for room ${room.id}, starting 15-minute deletion timer`);
    await removeGoldStar(room.id);
  }
}

/**
 * حساب وقت بدء عداد الحذف التلقائي
 * الترتيب: انتهاء التمديد → خروج آخر لاعب → وقت الإنشاء
 */
function getDeletionTimerStart(room: typeof rooms.$inferSelect): Date {
  // 1. وقت انتهاء التمديد (فقدان النجمة) - الأولوية الأولى
  if (room.goldStarLostAt) {
    return new Date(room.goldStarLostAt);
  }
  
  // 2. وقت خروج/استبعاد آخر لاعب - الأولوية الثانية
  if (room.lastPlayerLeftAt) {
    return new Date(room.lastPlayerLeftAt);
  }
  
  // 3. وقت إنشاء الساحة (الافتراضي)
  return new Date(room.createdAt);
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
    // أولاً: تنظيف النجوم الذهبية المنتهية (وتسجيل وقت الفقدان)
    await cleanupExpiredGoldStars();

    // جلب جميع الساحات النشطة
    const activeRooms = await db
      .select()
      .from(rooms)
      .where(eq(rooms.isActive, "true"));

    const now = new Date();
    const timeoutMs = EMPTY_ROOM_TIMEOUT_MINUTES * 60 * 1000;

    for (const room of activeRooms) {
      const roomId = room.id;

      // الساحات ذات النجمة الذهبية النشطة لا تُحذف
      if (await hasActiveGoldStar(room)) {
        continue;
      }

      // التحقق من وجود لاعب
      const hasPlayer = await hasNonCreatorPlayer(roomId);

      if (hasPlayer) {
        // يوجد لاعب - لا حذف
        continue;
      }

      // لا يوجد لاعب ولا نجمة نشطة - التحقق من المدة
      const timerStart = getDeletionTimerStart(room);
      const elapsedMs = now.getTime() - timerStart.getTime();

      if (elapsedMs >= timeoutMs) {
        // مرت 15 دقيقة - حذف الساحة
        console.log(`[RoomCleanup] Room ${roomId} timeout (15 min from ${timerStart.toISOString()})`);
        await deleteRoomCompletely(roomId);
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
  console.log(`[RoomCleanup] Starting cleanup service (timeout: ${EMPTY_ROOM_TIMEOUT_MINUTES} minutes, gold star: 5 days)`);

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
 * تسجيل نشاط لاعب في الساحة (للتوافق مع الكود القديم)
 */
export function recordPlayerActivity(roomId: number) {
  // لم نعد نستخدم هذه الدالة، نعتمد على lastPlayerJoinAt في قاعدة البيانات
  console.log(`[RoomCleanup] Player activity recorded for room ${roomId}`);
}
