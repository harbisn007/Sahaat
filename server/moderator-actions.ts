import { Router, Request, Response } from "express";
import { getDb } from "./db";
import { roomParticipants, blockedUsers, users } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { emitUserRoleUpdated } from "./_core/socket";

const router = Router();

// ── API: حظر مستخدم من الساحة ──
router.post("/api/ban-from-room", async (req: Request, res: Response) => {
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
      .where(eq(users.id, parseInt(moderatorId)))
      .limit(1);

    if (!moderator[0] || !["admin", "moderator"].includes(moderator[0].role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // أضف المستخدم إلى قائمة المحظورين
    await db.insert(blockedUsers).values({
      userId,
      blockedBy: moderatorId,
      reason: "Banned from room",
      createdAt: new Date(),
    });

    // أزل المستخدم من الساحة
    await db
      .delete(roomParticipants)
      .where(and(eq(roomParticipants.roomId, roomId), eq(roomParticipants.userId, userId)));

    // أرسل إشعار للعملاء (Socket.io event)

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── API: إلغاء حظر مستخدم ──
router.post("/api/unban-from-room", async (req: Request, res: Response) => {
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
      .where(eq(users.id, parseInt(moderatorId)))
      .limit(1);

    if (!moderator[0] || !["admin", "moderator"].includes(moderator[0].role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // أزل المستخدم من قائمة المحظورين
    await db.delete(blockedUsers).where(eq(blockedUsers.userId, userId));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── API: تعيين مشرف/مدير من داخل الساحة ──
router.post("/api/promote-participant", async (req: Request, res: Response) => {
  try {
    const { roomId, userId, newRole, moderatorId } = req.body;
    if (!roomId || !userId || !newRole || !moderatorId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!["moderator", "admin"].includes(newRole)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const db = await getDb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });

    // تحقق من أن المعدل هو مدير (فقط المديرون يمكنهم تعيين مشرفين)
    const moderator = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(moderatorId)))
      .limit(1);

    if (!moderator[0] || moderator[0].role !== "admin") {
      return res.status(403).json({ error: "Only admins can promote users" });
    }

    // حدّث دور المستخدم في قاعدة البيانات
    await db.update(users).set({ role: newRole }).where(eq(users.id, parseInt(userId)));

    // أرسل إشعار للعملاء
    emitUserRoleUpdated(userId, newRole as "user" | "moderator" | "admin");

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
