/**
 * نظام حذف الساحات الفارغة تلقائياً
 * 
 * النجمة: تظهر لمدة 24 ساعة
 * التمديد: يستمر لمدة 5 أيام (حتى لو فقدت النجمة)
 * 
 * قواعد الحذف:
 * - إذا أغلق/حذف المنشئ التطبيق (فقد الاتصال) ولم يكن لديه نجمة ذهبية → تُحذف بعد 15 دقيقة
 * - إذا عاد المنشئ قبل 15 دقيقة → يُلغى عداد الحذف
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

// الفترة الزمنية بالدقائق قبل حذف الساحة بعد انقطاع المنشئ
const CREATOR_DISCONNECT_TIMEOUT_MINUTES = 15;

// فترة التحقق بالمللي ثانية (كل 30 ثانية)
const CHECK_INTERVAL_MS = 30 * 1000;

// ============ نظام تتبع انقطاع المنشئ ============
// خريطة تتبع وقت أول انقطاع للمنشئ عن جميع القنوات
// المفتاح: roomId، القيمة: وقت أول اكتشاف لانقطاع المنشئ
const creatorDisconnectedAt = new Map<number, Date>();

/**
 * إزالة تتبع الساحة عند حذفها
 */
export function removeRoomTracking(roomId: number) {
  creatorDisconnectedAt.delete(roomId);
  console.log(`[RoomCleanup] Removed tracking for room ${roomId}`);
}

/**
 * التحقق من أن المنشئ متصل فعلاً عبر Socket
 * يبحث في قنوات المنشئ الشخصية وقناة الساحة وأي socket يحمل userId
 */
async function isCreatorConnected(creatorId: string, roomId: number): Promise<boolean> {
  const io = getIO();
  if (!io) return false;

  // 1. البحث في قناة المنشئ الشخصية (GlobalCreatorNotifier)
  const creatorRoom = `creator:${creatorId}`;
  const creatorSockets = await io.in(creatorRoom).fetchSockets();
  if (creatorSockets.length > 0) return true;

  // 2. البحث في قناة المستخدم الشخصية
  const userRoom = `user:${creatorId}`;
  const userSockets = await io.in(userRoom).fetchSockets();
  if (userSockets.length > 0) return true;

  // 3. البحث في قناة الساحة نفسها (المنشئ قد يكون داخل ساحته)
  const roomChannel = `room:${roomId}`;
  const roomSockets = await io.in(roomChannel).fetchSockets();
  for (const s of roomSockets) {
    if (s.data.userId === creatorId) return true;
  }

  return false;
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

    // إزالة التتبع
    removeRoomTracking(roomId);

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
 *    - إذا المنشئ متصل عبر Socket → لا تُحذف (وإلغاء أي عداد سابق)
 *    - إذا المنشئ غير متصل → بدء عداد 15 دقيقة (أو حذف إذا مر 15 دقيقة)
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
        // إزالة أي عداد انقطاع سابق
        if (creatorDisconnectedAt.has(roomId)) {
          creatorDisconnectedAt.delete(roomId);
          console.log(`[RoomCleanup] Room ${roomId} has active extension, cleared disconnect timer`);
        }
        continue;
      }

      // الساحات ذات النجمة الذهبية النشطة لا تُحذف
      if (hasActiveGoldStar(room)) {
        // إزالة أي عداد انقطاع سابق
        if (creatorDisconnectedAt.has(roomId)) {
          creatorDisconnectedAt.delete(roomId);
          console.log(`[RoomCleanup] Room ${roomId} has active gold star, cleared disconnect timer`);
        }
        continue;
      }

      // التحقق من أن المنشئ متصل فعلاً عبر Socket
      const creatorOnline = await isCreatorConnected(room.creatorId, roomId);

      if (creatorOnline) {
        // المنشئ متصل - الساحة آمنة
        // إذا كان هناك عداد انقطاع سابق، نلغيه (المنشئ عاد)
        if (creatorDisconnectedAt.has(roomId)) {
          console.log(`[RoomCleanup] Creator ${room.creatorId} reconnected to room ${roomId}, cancelling deletion timer`);
          creatorDisconnectedAt.delete(roomId);
        }
        continue;
      }

      // المنشئ غير متصل - التحقق من عداد الانقطاع
      if (!creatorDisconnectedAt.has(roomId)) {
        // أول مرة نكتشف انقطاع المنشئ - بدء العداد
        creatorDisconnectedAt.set(roomId, new Date());
        console.log(`[RoomCleanup] Creator ${room.creatorId} disconnected from room ${roomId}, starting ${CREATOR_DISCONNECT_TIMEOUT_MINUTES}-minute timer`);
        continue;
      }

      // التحقق من مرور 15 دقيقة على الانقطاع
      const disconnectedTime = creatorDisconnectedAt.get(roomId)!;
      const elapsedMs = Date.now() - disconnectedTime.getTime();
      const elapsedMinutes = elapsedMs / (60 * 1000);

      if (elapsedMinutes >= CREATOR_DISCONNECT_TIMEOUT_MINUTES) {
        // مر 15 دقيقة - حذف الساحة
        console.log(`[RoomCleanup] Creator ${room.creatorId} disconnected for ${Math.round(elapsedMinutes)} minutes (>= ${CREATOR_DISCONNECT_TIMEOUT_MINUTES}). Deleting room ${roomId}`);
        await deleteRoomCompletely(roomId);
      } else {
        // لم يمر 15 دقيقة بعد
        const remainingMinutes = Math.round(CREATOR_DISCONNECT_TIMEOUT_MINUTES - elapsedMinutes);
        console.log(`[RoomCleanup] Room ${roomId}: creator disconnected ${Math.round(elapsedMinutes)} min ago, ${remainingMinutes} min remaining before deletion`);
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
  console.log(`[RoomCleanup] Starting cleanup service (check every ${CHECK_INTERVAL_MS / 1000}s, disconnect timeout: ${CREATOR_DISCONNECT_TIMEOUT_MINUTES} min)`);

  // تشغيل الفحص الأول بعد 30 ثانية
  setTimeout(() => {
    checkAndCleanupRooms();
  }, 30 * 1000);

  // تشغيل الفحص الدوري كل 30 ثانية
  setInterval(() => {
    checkAndCleanupRooms();
  }, CHECK_INTERVAL_MS);
}
