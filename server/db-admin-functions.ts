import { getDb } from "./db";

// جلب قائمة المدراء والمشرفين
export async function getModeratorsAndAdmins() {
  try {
    const db = await getDb();
    if (!db) return [];

    const result = await db.execute(
      `SELECT id, name, email, avatar, role FROM users WHERE role IN ('moderator', 'admin') ORDER BY role DESC, name ASC`
    );
    return result.rows || [];
  } catch (error) {
    console.error("Error fetching moderators and admins:", error);
    return [];
  }
}

// جلب جميع المستخدمين
export async function getAllUsers() {
  try {
    const db = await getDb();
    if (!db) return [];

    const result = await db.execute(
      `SELECT id, name, email, avatar, role FROM users ORDER BY name ASC`
    );
    return result.rows || [];
  } catch (error) {
    console.error("Error fetching all users:", error);
    return [];
  }
}

// جلب مستخدم بـ ID
export async function getUserById(userId: string) {
  try {
    const db = await getDb();
    if (!db) return null;

    const result = await db.execute(
      `SELECT id, name, email, avatar, role FROM users WHERE id = ?`,
      [userId]
    );
    return result.rows?.[0] || null;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

// تحديث دور المستخدم
export async function updateUserRole(userId: string, newRole: 'user' | 'moderator' | 'admin') {
  try {
    const db = await getDb();
    if (!db) return false;

    await db.execute(
      `UPDATE users SET role = ? WHERE id = ?`,
      [newRole, userId]
    );
    return true;
  } catch (error) {
    console.error("Error updating user role:", error);
    return false;
  }
}

// حظر مستخدم
export async function banUser(targetUserId: string, moderatorId: string, reason?: string) {
  try {
    const db = await getDb();
    if (!db) return false;

    // إدراج في جدول banned_users
    await db.execute(
      `INSERT INTO banned_users (userId, bannedBy, reason) VALUES (?, ?, ?)`,
      [targetUserId, moderatorId, reason || null]
    );

    // تسجيل الإجراء
    await db.execute(
      `INSERT INTO moderation_logs (moderatorId, targetUserId, action, reason) VALUES (?, ?, 'ban', ?)`,
      [moderatorId, targetUserId, reason || null]
    );

    return true;
  } catch (error) {
    console.error("Error banning user:", error);
    return false;
  }
}

// إلغاء حظر مستخدم
export async function unbanUser(targetUserId: string, moderatorId: string) {
  try {
    const db = await getDb();
    if (!db) return false;

    // تحديث جدول banned_users
    await db.execute(
      `UPDATE banned_users SET unbannedAt = NOW() WHERE userId = ? AND unbannedAt IS NULL`,
      [targetUserId]
    );

    // تسجيل الإجراء
    await db.execute(
      `INSERT INTO moderation_logs (moderatorId, targetUserId, action) VALUES (?, ?, 'unban')`,
      [moderatorId, targetUserId]
    );

    return true;
  } catch (error) {
    console.error("Error unbanning user:", error);
    return false;
  }
}

// إغلاق ساحة من قبل مشرف
export async function closeRoomByModerator(roomId: number, moderatorId: string, reason?: string) {
  try {
    const db = await getDb();
    if (!db) return false;

    // إغلاق الساحة
    await db.execute(
      `UPDATE rooms SET isActive = 'false' WHERE id = ?`,
      [roomId]
    );

    // تسجيل الإجراء
    await db.execute(
      `INSERT INTO moderation_logs (moderatorId, roomId, action, reason) VALUES (?, ?, 'room_close', ?)`,
      [moderatorId, roomId, reason || null]
    );

    return true;
  } catch (error) {
    console.error("Error closing room:", error);
    return false;
  }
}

// تثبيت ساحة
export async function pinRoom(roomId: number, moderatorId: string) {
  try {
    const db = await getDb();
    if (!db) return false;

    // تحديث الساحة
    await db.execute(
      `UPDATE rooms SET isPinned = true, pinnedBy = ?, pinnedAt = NOW(), autoDeleteEnabled = false WHERE id = ?`,
      [moderatorId, roomId]
    );

    // تسجيل الإجراء
    await db.execute(
      `INSERT INTO moderation_logs (moderatorId, roomId, action) VALUES (?, ?, 'pin_room')`,
      [moderatorId, roomId]
    );

    return true;
  } catch (error) {
    console.error("Error pinning room:", error);
    return false;
  }
}

// إلغاء تثبيت ساحة
export async function unpinRoom(roomId: number, moderatorId: string) {
  try {
    const db = await getDb();
    if (!db) return false;

    // تحديث الساحة
    await db.execute(
      `UPDATE rooms SET isPinned = false, pinnedBy = NULL, pinnedAt = NULL, autoDeleteEnabled = true WHERE id = ?`,
      [roomId]
    );

    // تسجيل الإجراء
    await db.execute(
      `INSERT INTO moderation_logs (moderatorId, roomId, action) VALUES (?, ?, 'unpin_room')`,
      [moderatorId, roomId]
    );

    return true;
  } catch (error) {
    console.error("Error unpinning room:", error);
    return false;
  }
}

// جلب سجل الإجراءات
export async function getModerationLogs(limit: number = 50, offset: number = 0) {
  try {
    const db = await getDb();
    if (!db) return [];

    const result = await db.execute(
      `SELECT * FROM moderation_logs ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return result.rows || [];
  } catch (error) {
    console.error("Error fetching moderation logs:", error);
    return [];
  }
}
