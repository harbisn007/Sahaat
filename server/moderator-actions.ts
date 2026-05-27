import { Router, Request, Response } from "express";
import { getDb } from "./db";
import { roomParticipants, blockedUsers, users, notifications, rooms } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { emitUserRoleUpdated, emitNotification } from "./_core/socket";

const router = Router();

// ── API: حظر مستخدم من الساحة ──
router.post("/ban-from-room", async (req: Request, res: Response) => {
  try {
    const { roomId, userId, moderatorId } = req.body;
    if (!roomId || !userId || !moderatorId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const db = await getDb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });

    // تحقق من أن المعدل له صلاحيات
    const moderator = await db
      .select()
      .from(users)
      .where(eq(users.appUserId, moderatorId))
      .limit(1);

    if (!moderator[0] || !["admin", "moderator"].includes(moderator[0].role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // أضف المستخدم إلى قائمة المحظورين
    const userToban = await db.select({ id: users.id }).from(users).where(eq(users.appUserId, userId)).limit(1);
    if (!userToban[0]) return res.status(404).json({ error: "User not found" });
    const participant = await db.select({ username: roomParticipants.username }).from(roomParticipants).where(and(eq(roomParticipants.roomId, roomId), eq(roomParticipants.userId, userId))).limit(1);
    await db.banUser(String(userToban[0].id), participant?.[0]?.username || userId, 'permanent');

    // أزل المستخدم من الساحة
    await db
      .delete(roomParticipants)
      .where(and(eq(roomParticipants.roomId, roomId), eq(roomParticipants.userId, userId)));

    // إرسال إشعار للمستخدم المحظور
    const bannedUser = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (bannedUser[0]) {
      await db.insert(notifications).values({
        userId: bannedUser[0].id,
        title: 'تم حظرك',
        message: `تم حظرك من الساحة بواسطة ${moderator[0].name || 'مدير'}`,
        type: 'ban',
        createdAt: new Date(),
      });
      emitNotification(bannedUser[0].id, {
        title: 'تم حظرك',
        message: `تم حظرك من الساحة بواسطة ${moderator[0].name || 'مدير'}`,
        type: 'ban',
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── API: إلغاء حظر مستخدم ──
router.post("/unban-from-room", async (req: Request, res: Response) => {
  try {
    const { userId, moderatorId } = req.body;
    if (!userId || !moderatorId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const db = await getDb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });

    // تحقق من أن المعدل له صلاحيات
    const moderator = await db
      .select()
      .from(users)
      .where(eq(users.appUserId, moderatorId))
      .limit(1);

    if (!moderator[0] || !["admin", "moderator"].includes(moderator[0].role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // أزل المستخدم من قائمة المحظورين
    await db.delete(blockedUsers).where(eq(blockedUsers.userId, userId));

    // إرسال إشعار للمستخدم بإلغاء الحظر
    const unbannedUser = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (unbannedUser[0]) {
      await db.insert(notifications).values({
        userId: unbannedUser[0].id,
        title: 'تم إلغاء حظرك',
        message: `تم إلغاء حظرك من قبل ${moderator[0].name || 'مدير'}`,
        type: 'unban',
        createdAt: new Date(),
      });
      emitNotification(unbannedUser[0].id, {
        title: 'تم إلغاء حظرك',
        message: `تم إلغاء حظرك من قبل ${moderator[0].name || 'مدير'}`,
        type: 'unban',
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── API: تعيين مشرف/مدير من داخل الساحة ──
router.post("/promote-participant", async (req: Request, res: Response) => {
  try {
    const { roomId, userId, newRole, moderatorId } = req.body;
    if (!roomId || !userId || !newRole || !moderatorId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!["moderator", "admin", "user"].includes(newRole)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const db = await getDb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });

    // تحقق من أن المعدل هو مدير (فقط المديرون يمكنهم تعيين مشرفين)
    const moderator = await db
      .select()
      .from(users)
      .where(eq(users.appUserId, moderatorId))
      .limit(1);

    if (!moderator[0] || moderator[0].role !== "admin") {
      return res.status(403).json({ error: "Only admins can promote users" });
    }

    // حدّث دور المستخدم في قاعدة البيانات
    await db.update(users).set({ role: newRole }).where(eq(users.appUserId, userId));

    // إرسال إشعار للمستخدم
    const promotedUser = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(userId)))
      .limit(1);

    if (promotedUser[0]) {
      const roleLabel = newRole === 'admin' ? 'مدير' : 'مشرف';
      const actionLabel = newRole === 'user' ? `تم إلغاء ${roleLabel === 'مدير' ? 'الإدارة' : 'الإشراف'}` : `تم تعيينك ${roleLabel}`;
      
      await db.insert(notifications).values({
        userId: promotedUser[0].id,
        title: actionLabel,
        message: `${actionLabel} بواسطة ${moderator[0].name || 'مدير'}`,
        type: newRole === 'user' ? 'role_removed' : 'role_granted',
        createdAt: new Date(),
      });
      emitNotification(promotedUser[0].id, {
        title: actionLabel,
        message: `${actionLabel} بواسطة ${moderator[0].name || 'مدير'}`,
        type: newRole === 'user' ? 'role_removed' : 'role_granted',
      });
    }

    // أرسل إشعار للعملاء
    emitUserRoleUpdated(userId, newRole as "user" | "moderator" | "admin");

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;

// ── API: تثبيت/إلغاء تثبيت الساحة ──
router.post("/pin-room", async (req: Request, res: Response) => {
  try {
    const { roomId, isPinned, moderatorId } = req.body;
    if (!roomId || isPinned === undefined || !moderatorId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const db = await getDb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });

    // تحقق من أن المعدل له صلاحيات
    const moderator = await db
      .select()
      .from(users)
      .where(eq(users.appUserId, moderatorId))
      .limit(1);

    if (!moderator[0] || !["admin", "moderator"].includes(moderator[0].role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // حدّث حالة التثبيت
    await db.update(rooms).set({ isPinned: isPinned ? 1 : 0 } as any).where(eq(rooms.id, roomId));

    if (isPinned) {
      try {
        const roomResult = await db.select({ creatorId: rooms.creatorId }).from(rooms).where(eq(rooms.id, roomId)).limit(1);
        if (roomResult[0]?.creatorId) {
          const creator = await db.select({ id: users.id }).from(users).where(eq(users.appUserId, roomResult[0].creatorId)).limit(1);
          if (creator[0]) {
            emitNotification(creator[0].id, { message: 'مرحبا ،تقديرا لك.. قامت الادارة بتثبيت ساحتك لتكون ساحة دائمة 🌹', type: 'pin' });
          }
        }
      } catch (_) {}
    }

    res.json({ success: true, isPinned });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── API: جلب دور المستخدم ──
router.get("/api/user-role", async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    const db = await getDb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });

    const user = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.appUserId, userId as string))
      .limit(1);

    res.json({ role: user[0]?.role || 'user' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/api/user-role", async (req, res) => {
  const { userId } = req.query;
  const db = await getDb();
  if (!db) return res.status(503).json({ error: "DB unavailable" });
  const user = await db.select({ role: users.role }).from(users).where(eq(users.appUserId, userId as string)).limit(1);
  res.json({ role: user[0]?.role || 'user' });
});
