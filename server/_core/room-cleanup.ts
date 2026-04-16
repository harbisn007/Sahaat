/**
 * نظام حذف الساحات الفارغة تلقائياً
 * 
 * النجمة: تظهر لمدة 24 ساعة
 * التمديد: يستمر لمدة 5 أيام (حتى لو فقدت النجمة)
 * 
 * قاعدة الحذف الأساسية (لا تعتمد على اتصال creator - تعتمد على انضمام الشعراء):
 * - تُحذف الساحة بعد مرور 15 دقيقة متصلة لا يتخللها انضمام شاعر (لاعب)
 * - إذا انضم شاعر جديد خلال الـ 15 دقيقة → يُعاد ضبط العداد من الصفر
 * - إذا كان لديها نجمة ذهبية نشطة أو تمديد نشط → لا تُحذف أبداً
 * 
 * حساب نقطة بداية الـ 15 دقيقة:
 * - آخر وقت انضم فيه شاعر (lastPlayerJoinAt) إذا كان موجوداً
 * - وإلا: وقت إنشاء الساحة (createdAt)
 */

import { getDb, removeGoldStar, removeExtension } from "../db";
import { rooms, roomParticipants, audioMessages, reactions, sheelohaBroadcasts, khaloohaCommands, recordingStatus, joinRequests, publicInvitations, reports } from "../../drizzle/schema";
import { eq, and, lt, inArray, notInArray } from "drizzle-orm";
import { broadcastRoomDeleted } from "./socket";

// الفترة الزمنية بالدقائق قبل حذف الساحة بدون انضمام شاعر
const NO_PLAYER_JOIN_TIMEOUT_MINUTES = 15;

// فترة التحقق بالمللي ثانية (كل 30 ثانية)
const CHECK_INTERVAL_MS = 30 * 1000;

/**
 * التحقق مما إذا كانت الساحة لديها تمديد نشط (5 أيام)
 */
function hasActiveExtension(room: typeof rooms.$inferSelect): boolean {
  if (!room.extensionExpiresAt) {
    return false;
  }
  return new Date(room.extensionExpiresAt) > new Date();
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

  const expiredStars = await db
    .select()
    .from(rooms)
    .where(
      and(
        eq(rooms.hasGoldStar, "true"),
        lt(rooms.goldStarExpiresAt, now)
      )
    );

  for (const room of expiredStars) {
    console.log(`[RoomCleanup] Gold star expired for room ${room.id} (24h), extension still active`);
    await removeGoldStar(room.id);
  }
}

/**
 * إزالة التمديدات المنتهية الصلاحية (5 أيام)
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
        // @ts-ignore
        rooms.extensionExpiresAt,
        lt(rooms.extensionExpiresAt, now)
      )
    );

  for (const room of expiredExtensions) {
    if (room.extensionExpiresAt && new Date(room.extensionExpiresAt) <= now) {
      console.log(`[RoomCleanup] Extension expired for room ${room.id} (5d)`);
      await removeExtension(room.id);
    }
  }
}

/**
 * حساب نقطة بداية عداد الـ 15 دقيقة
 * 
 * المنطق: متى غادر آخر شاعر؟
 * - إذا غادر شاعر سابقاً → نقطة البداية = lastPlayerLeftAt
 * - إذا لم ينضم أي شاعر أبداً → نقطة البداية = createdAt (وقت إنشاء الساحة)
 */
function getTimerStartPoint(room: typeof rooms.$inferSelect): Date {
  if (room.lastPlayerLeftAt) {
    return new Date(room.lastPlayerLeftAt);
  }
  return new Date(room.createdAt);
}

/**
 * حذف الساحة وجميع بياناتها
 */
export async function deleteRoomCompletely(roomId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  console.log(`[RoomCleanup] Deleting room ${roomId} and all its data`);

  try {
    // حذف جميع البيانات المرتبطة بالترتيب
    await db.delete(reactions).where(eq(reactions.roomId, roomId));
    // احذف فقط الرسائل الصوتية التي ليس عليها بلاغات
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
 * المنطق لكل ساحة نشطة:
 * 1. تنظيف النجوم والتمديدات المنتهية
 * 2. إذا لديها تمديد نشط → لا تُحذف
 * 3. إذا لديها نجمة ذهبية نشطة → لا تُحذف
 * 4. حساب الوقت منذ آخر انضمام شاعر (أو منذ إنشاء الساحة)
 * 5. إذا مر 15 دقيقة بدون انضمام شاعر → تُحذف
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

      // حساب الوقت منذ آخر انضمام شاعر (أو منذ إنشاء الساحة)
      const timerStart = getTimerStartPoint(room);
      const elapsedMs = Date.now() - timerStart.getTime();
      const elapsedMinutes = elapsedMs / (60 * 1000);

      if (elapsedMinutes >= NO_PLAYER_JOIN_TIMEOUT_MINUTES) {
        // مر 15 دقيقة بدون انضمام شاعر → حذف الساحة
        const lastEvent = room.lastPlayerLeftAt ? "مغادرة آخر شاعر" : "إنشاء الساحة";
        console.log(`[RoomCleanup] Room ${roomId}: ${Math.round(elapsedMinutes)} min since ${lastEvent} (>= ${NO_PLAYER_JOIN_TIMEOUT_MINUTES} min). Deleting.`);
        await deleteRoomCompletely(roomId);
      } else {
        const remainingMinutes = Math.round(NO_PLAYER_JOIN_TIMEOUT_MINUTES - elapsedMinutes);
        // لا نطبع log إلا كل دقيقة تقريباً لتقليل الضوضاء
        if (Math.round(elapsedMinutes) % 2 === 0) {
          console.log(`[RoomCleanup] Room ${roomId}: ${Math.round(elapsedMinutes)} min without new player, ${remainingMinutes} min remaining`);
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
  console.log(`[RoomCleanup] Starting cleanup service (check every ${CHECK_INTERVAL_MS / 1000}s, no-player timeout: ${NO_PLAYER_JOIN_TIMEOUT_MINUTES} min)`);

  // تشغيل الفحص الأول بعد 30 ثانية
  setTimeout(() => {
    checkAndCleanupRooms();
  }, 30 * 1000);

  // تشغيل الفحص الدوري كل 30 ثانية
  setInterval(() => {
    checkAndCleanupRooms();
  }, CHECK_INTERVAL_MS);
}
