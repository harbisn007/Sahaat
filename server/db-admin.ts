import { getDb } from './db';
import { users, rooms } from './schema';
import { eq, and } from 'drizzle-orm';

// جلب قائمة المدراء والمشرفين
export async function getModeratorsAndAdmins() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(users)
    .where(
      and(
        // جلب المشرفين والمدراء فقط
        (col) => col.role.in(['moderator', 'admin'])
      )
    );
}

// جلب جميع المستخدمين
export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(users);
}

// تحديث دور المستخدم
export async function updateUserRole(userId: string, newRole: 'user' | 'moderator' | 'admin') {
  const db = await getDb();
  if (!db) return false;

  await db
    .update(users)
    .set({ role: newRole })
    .where(eq(users.id, userId));

  return true;
}

// جلب مستخدم بـ ID
export async function getUserById(userId: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));

  return result[0] || null;
}

// حظر مستخدم
export async function banUser(targetUserId: string, moderatorId: string, reason?: string) {
  const db = await getDb();
  if (!db) return false;

  // إدراج في جدول banned_users
  await db.execute(
    `INSERT INTO banned_users (userId, bannedBy, reason) 
     VALUES (?, ?, ?)`,
    [targetUserId, moderatorId, reason || null]
  );

  // تسجيل الإجراء
  await db.execute(
    `INSERT INTO moderation_logs (moderatorId, targetUserId, action, reason) 
     VALUES (?, ?, 'ban', ?)`,
    [moderatorId, targetUserId, reason || null]
  );

  return true;
}

// إلغاء حظر مستخدم
export async function unbanUser(targetUserId: string, moderatorId: string) {
  const db = await getDb();
  if (!db) return false;

  // تحديث جدول banned_users
  await db.execute(
    `UPDATE banned_users SET unbannedAt = NOW() 
     WHERE userId = ? AND unbannedAt IS NULL`,
    [targetUserId]
  );

  // تسجيل الإجراء
  await db.execute(
    `INSERT INTO moderation_logs (moderatorId, targetUserId, action) 
     VALUES (?, ?, 'unban')`,
    [moderatorId, targetUserId]
  );

  return true;
}

// إغلاق ساحة من قبل مشرف
export async function closeRoomByModerator(roomId: number, moderatorId: string, reason?: string) {
  const db = await getDb();
  if (!db) return false;

  // إغلاق الساحة
  await db
    .update(rooms)
    .set({ isActive: 'false' })
    .where(eq(rooms.id, roomId));

  // تسجيل الإجراء
  await db.execute(
    `INSERT INTO moderation_logs (moderatorId, roomId, action, reason) 
     VALUES (?, ?, 'room_close', ?)`,
    [moderatorId, roomId, reason || null]
  );

  return true;
}

// تثبيت ساحة
export async function pinRoom(roomId: number, moderatorId: string) {
  const db = await getDb();
  if (!db) return false;

  // تحديث الساحة
  await db
    .update(rooms)
    .set({
      isPinned: true,
      pinnedBy: parseInt(moderatorId),
      pinnedAt: new Date(),
      autoDeleteEnabled: false,
    })
    .where(eq(rooms.id, roomId));

  // تسجيل الإجراء
  await db.execute(
    `INSERT INTO moderation_logs (moderatorId, roomId, action) 
     VALUES (?, ?, 'pin_room')`,
    [moderatorId, roomId]
  );

  return true;
}

// إلغاء تثبيت ساحة
export async function unpinRoom(roomId: number, moderatorId: string) {
  const db = await getDb();
  if (!db) return false;

  // تحديث الساحة
  await db
    .update(rooms)
    .set({
      isPinned: false,
      pinnedBy: null,
      pinnedAt: null,
      autoDeleteEnabled: true,
    })
    .where(eq(rooms.id, roomId));

  // تسجيل الإجراء
  await db.execute(
    `INSERT INTO moderation_logs (moderatorId, roomId, action) 
     VALUES (?, ?, 'unpin_room')`,
    [moderatorId, roomId]
  );

  return true;
}

// جلب سجل الإجراءات
export async function getModerationLogs(limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];

  return db.execute(
    `SELECT * FROM moderation_logs 
     ORDER BY createdAt DESC 
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
}
