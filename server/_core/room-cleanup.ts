/**
 * نظام حذف الساحات الفارغة تلقائياً
 * 
 * النجمة: تظهر لمدة 24 ساعة
 * التمديد: يستمر لمدة 5 أيام (حتى لو فقدت النجمة)
 * 
 * قواعد الحذف:
 * - إذا أغلق/حذف المنشئ التطبيق (فقد الاتصال) ولم يكن لديه نجمة ذهبية → تُحذف فوراً
 * - إذا كان لديه نجمة ذهبية أو تمديد نشط → تبقى الساحة
 * - إذا لم يكن هناك أي مشارك ولا تمديد → تُحذف بعد 15 دقيقة
 * 
 * ترتيب حساب الـ 15 دقيقة للحذف التلقائي:
 * 1. وقت انتهاء التمديد (extensionLostAt)
 * 2. وقت خروج آخر لاعب (lastPlayerLeftAt)
 * 3. وقت إنشاء الساحة (createdAt)
 */

import { getDb, removeGoldStar, removeExtension } from "../db";
import { rooms, roomParticipants, audioMessages, reactions, sheelohaBroadcasts, khaloohaCommands, recordingStatus, joinRequests, publicInvitations } from "../../drizzle/schema";
import { eq, and, lt } from "drizzle-orm";
import { broadcastRoomDeleted, getIO } from "./socket";

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
 * التحقق من أن المنشئ متصل فعلاً عبر Socket
 * يبحث في جميع الـ sockets عن واحد يحمل userId المنشئ
 */
async function isCreatorConnected(creatorId: string): Promise<boolean> {
  const io = getIO();
  if (!io) return false;

  // البحث في قناة المنشئ الشخصية
  const creatorRoom = `creator:${creatorId}`;
  const sockets = await io.in(creatorRoom).fetchSockets();
  
  if (sockets.length > 0) return true;

  // البحث أيضاً في قناة المستخدم الشخصية
  const userRoom = `user:${creatorId}`;
  const userSockets = await io.in(userRoom).fetchSockets();
  
  return userSockets.length > 0;
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
 * التحقق مما إذا كانت الساحة لديها نجمة ذهبية نشطة
 */
function hasActiveGoldStar(room: typeof rooms.$inferSelect): boolean {
  if (room.hasGoldStar !== "true") return false;
  if (!room.goldStarExpiresAt) return false;
  return new Date(room.goldStarExpiresAt) > new Date();
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

  const expiredExtensions = await db
    .select()
    .from(rooms)
    .where(
      and(
        // @ts-ignore - Drizzle doesn't support isNotNull directly in some versions
        rooms.extensionExpiresAt,
        lt(rooms.extensionExpiresAt, now)
      )
    );

  for (const room of expiredExtensions) {
    if (room.extensionExpiresAt && new Date(room.extensionExpiresAt) <= now) {
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
export async function deleteRoomCompletely(roomId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  console.log(`[RoomCleanup] Deleting room ${roomId}`);

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
 * فحص وحذف الساحات
 * 
 * المنطق:
 * 1. تنظيف النجوم والتمديدات المنتهية
 * 2. لكل ساحة نشطة:
 *    - إذا لديها تمديد نشط → لا تُحذف
 *    - إذا لديها نجمة ذهبية نشطة → لا تُحذف
 *    - إذا المنشئ متصل عبر Socket → لا تُحذف
 *    - إذا المنشئ غير متصل ولا نجمة ولا تمديد → تُحذف فوراً
 */
async function checkAndCleanupRooms(): Promise<void> {
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

    for (const room of activeRooms) {
      const roomId = room.id;

      // الساحات ذات التمديد النشط لا تُحذف
      if (hasActiveExtension(room)) {
        continue;
      }

      // الساحات ذات النجمة الذهبية النشطة لا تُحذف
      if (hasActiveGoldStar(room)) {
        continue;
      }

      // التحقق من أن المنشئ متصل فعلاً عبر Socket
      const creatorOnline = await isCreatorConnected(room.creatorId);

      if (creatorOnline) {
        // المنشئ متصل - الساحة آمنة
        continue;
      }

      // المنشئ غير متصل ولا نجمة ولا تمديد → حذف فوري
      console.log(`[RoomCleanup] Creator ${room.creatorId} is disconnected, no gold star, no extension. Deleting room ${roomId}`);
      await deleteRoomCompletely(roomId);
    }
  } catch (error) {
    console.error("[RoomCleanup] Error during cleanup check:", error);
  }
}

/**
 * بدء نظام التنظيف التلقائي
 */
export function startRoomCleanupService(): void {
  console.log(`[RoomCleanup] Starting cleanup service (check every ${CHECK_INTERVAL_MS / 1000}s, extension: 5 days, star: 24 hours)`);

  // تشغيل الفحص الأول بعد 30 ثانية
  setTimeout(() => {
    checkAndCleanupRooms();
  }, 30 * 1000);

  // تشغيل الفحص الدوري كل دقيقة
  setInterval(() => {
    checkAndCleanupRooms();
  }, CHECK_INTERVAL_MS);
}
