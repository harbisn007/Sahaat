/**
 * نظام حذف الساحات الفارغة تلقائياً
 * 
 * النجمة: تظهر لمدة 24 ساعة
 * التمديد: يستمر لمدة 5 أيام (حتى لو فقدت النجمة)
 * 
 * ترتيب حساب الـ 15 دقيقة للحذف التلقائي:
 * 1. وقت انتهاء التمديد (extensionLostAt)
 * 2. وقت خروج آخر لاعب (lastPlayerLeftAt)
 * 3. وقت إنشاء الساحة (createdAt)
 */

import { getDb, removeGoldStar, removeExtension } from "../db";
import { rooms, roomParticipants, audioMessages, reactions, sheelohaBroadcasts, khaloohaCommands, recordingStatus, joinRequests, publicInvitations } from "../../drizzle/schema";
import { eq, and, lt } from "drizzle-orm";
import { broadcastRoomDeleted } from "./socket";

// الفترة الزمنية بالدقائق قبل حذف الساحة الفارغة
const EMPTY_ROOM_TIMEOUT_MINUTES = 15;

// فترة التحقق بالمللي ثانية (كل دقيقة)
const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * إزالة تتبع الساحة عند حذفها
 */
export function removeRoomTracking(roomId: number) {
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
 * التحقق مما إذا كانت الساحة لديها تمديد نشط (5 أيام)
 */
function hasActiveExtension(room: typeof rooms.$inferSelect): boolean {
  if (!room.extensionExpiresAt) {
    return false;
  }
  
  const now = new Date();
  return new Date(room.extensionExpiresAt) > now;
}

/**
 * إزالة النجوم الذهبية المنتهية الصلاحية (24 ساعة)
 * التمديد يبقى كما هو
 */
async function cleanupExpiredGoldStars(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date();

  // جلب الساحات التي انتهت صلاحية نجمتها (24 ساعة)
  const expiredStars = await db
    .select()
    .from(rooms)
    .where(
      and(
        eq(rooms.hasGoldStar, "true"),
        lt(rooms.goldStarExpiresAt, now)
      )
    );

  // إزالة النجمة فقط - التمديد يبقى
  for (const room of expiredStars) {
    console.log(`[RoomCleanup] Gold star expired for room ${room.id} (24h), extension still active`);
    await removeGoldStar(room.id);
  }
}

/**
 * إزالة التمديدات المنتهية الصلاحية (5 أيام)
 * يبدأ عداد الـ 15 دقيقة
 */
async function cleanupExpiredExtensions(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date();

  // جلب الساحات التي انتهت صلاحية تمديدها (5 أيام)
  const expiredExtensions = await db
    .select()
    .from(rooms)
    .where(
      and(
        lt(rooms.extensionExpiresAt, now)
      )
    );

  // إزالة التمديد وتسجيل وقت الفقدان
  for (const room of expiredExtensions) {
    if (room.extensionExpiresAt) {
      console.log(`[RoomCleanup] Extension expired for room ${room.id} (5d), 15-minute deletion timer starts`);
      await removeExtension(room.id);
    }
  }
}

/**
 * حساب وقت بدء عداد الحذف التلقائي
 * الترتيب: انتهاء التمديد → خروج آخر لاعب → وقت الإنشاء
 */
function getDeletionTimerStart(room: typeof rooms.$inferSelect): Date {
  // 1. وقت انتهاء التمديد - الأولوية الأولى
  if (room.extensionLostAt) {
    return new Date(room.extensionLostAt);
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
    // أولاً: تنظيف النجوم الذهبية المنتهية (24 ساعة)
    await cleanupExpiredGoldStars();
    
    // ثانياً: تنظيف التمديدات المنتهية (5 أيام)
    await cleanupExpiredExtensions();

    // جلب جميع الساحات النشطة
    const activeRooms = await db
      .select()
      .from(rooms)
      .where(eq(rooms.isActive, "true"));

    const now = new Date();
    const timeoutMs = EMPTY_ROOM_TIMEOUT_MINUTES * 60 * 1000;

    for (const room of activeRooms) {
      const roomId = room.id;

      // الساحات ذات التمديد النشط لا تُحذف
      if (hasActiveExtension(room)) {
        console.log(`[RoomCleanup] Room ${roomId} has active extension, skipping`);
        continue;
      }

      // التحقق من وجود لاعب
      const hasPlayer = await hasNonCreatorPlayer(roomId);

      if (hasPlayer) {
        // يوجد لاعب - لا حذف
        console.log(`[RoomCleanup] Room ${roomId} has player, skipping`);
        continue;
      }

      // لا يوجد لاعب ولا تمديد نشط - التحقق من المدة
      const timerStart = getDeletionTimerStart(room);
      const elapsedMs = now.getTime() - timerStart.getTime();
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      const remainingMinutes = EMPTY_ROOM_TIMEOUT_MINUTES - elapsedMinutes;
      
      console.log(`[RoomCleanup] Room ${roomId}: created=${room.createdAt}, timerStart=${timerStart.toISOString()}, elapsed=${elapsedMinutes}min, remaining=${remainingMinutes}min`);

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
  console.log(`[RoomCleanup] Starting cleanup service (timeout: ${EMPTY_ROOM_TIMEOUT_MINUTES} minutes, extension: 5 days, star: 24 hours)`);

  // تشغيل الفحص الأول بعد دقيقة
  setTimeout(() => {
    checkAndCleanupEmptyRooms();
  }, CHECK_INTERVAL_MS);

  // تشغيل الفحص الدوري كل دقيقة
  setInterval(() => {
    checkAndCleanupEmptyRooms();
  }, CHECK_INTERVAL_MS);
}
