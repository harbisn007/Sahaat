import { router, publicProcedure } from '../_core/trpc';
import { z } from 'zod';
import * as db from '../db';

export const adminRouter = router({
  // جلب قائمة المدراء والمشرفين
  getModeratorsAndAdmins: publicProcedure.query(async () => {
    return db.getModeratorsAndAdmins();
  }),

  // جلب جميع المستخدمين (للبحث والتعيين)
  getAllUsers: publicProcedure.query(async () => {
    return db.getAllUsers();
  }),

  // تعيين مستخدم كمشرف أو مدير
  setUserRole: publicProcedure
    .input(
      z.object({
        targetUserId: z.string(),
        newRole: z.enum(['user', 'moderator', 'admin']),
        adminId: z.string(), // المستخدم الذي يقوم بالتعيين
      })
    )
    .mutation(async ({ input }) => {
      // التحقق من أن المستخدم مدير
      const admin = await db.getUserById(input.adminId);
      if (!admin || admin.role !== 'admin') {
        throw new Error('ليس لديك صلاحيات كافية');
      }

      // تحديث الدور
      await db.updateUserRole(input.targetUserId, input.newRole);

      return { success: true, message: 'تم تحديث الدور بنجاح' };
    }),

  // إزالة صلاحيات المشرف/المدير
  removeUserRole: publicProcedure
    .input(
      z.object({
        targetUserId: z.string(),
        adminId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // التحقق من أن المستخدم مدير
      const admin = await db.getUserById(input.adminId);
      if (!admin || admin.role !== 'admin') {
        throw new Error('ليس لديك صلاحيات كافية');
      }

      // إعادة الدور إلى user
      await db.updateUserRole(input.targetUserId, 'user');

      return { success: true, message: 'تم إزالة الصلاحيات بنجاح' };
    }),

  // حظر مستخدم
  banUser: publicProcedure
    .input(
      z.object({
        targetUserId: z.string(),
        moderatorId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // التحقق من أن المستخدم مشرف أو مدير
      const moderator = await db.getUserById(input.moderatorId);
      if (!moderator || !['moderator', 'admin'].includes(moderator.role)) {
        throw new Error('ليس لديك صلاحيات كافية');
      }

      // حظر المستخدم
      await db.banUser(input.targetUserId, input.moderatorId, input.reason);

      return { success: true, message: 'تم حظر المستخدم بنجاح' };
    }),

  // إلغاء حظر مستخدم
  unbanUser: publicProcedure
    .input(
      z.object({
        targetUserId: z.string(),
        moderatorId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // التحقق من أن المستخدم مشرف أو مدير
      const moderator = await db.getUserById(input.moderatorId);
      if (!moderator || !['moderator', 'admin'].includes(moderator.role)) {
        throw new Error('ليس لديك صلاحيات كافية');
      }

      // إلغاء الحظر
      await db.unbanUser(input.targetUserId, input.moderatorId);

      return { success: true, message: 'تم إلغاء الحظر بنجاح' };
    }),

  // إغلاق ساحة من قبل مشرف
  closeRoom: publicProcedure
    .input(
      z.object({
        roomId: z.number(),
        moderatorId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // التحقق من أن المستخدم مشرف أو مدير
      const moderator = await db.getUserById(input.moderatorId);
      if (!moderator || !['moderator', 'admin'].includes(moderator.role)) {
        throw new Error('ليس لديك صلاحيات كافية');
      }

      // إغلاق الساحة
      await db.closeRoomByModerator(input.roomId, input.moderatorId, input.reason);

      return { success: true, message: 'تم إغلاق الساحة بنجاح' };
    }),

  // تثبيت ساحة
  pinRoom: publicProcedure
    .input(
      z.object({
        roomId: z.number(),
        moderatorId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // التحقق من أن المستخدم مشرف أو مدير
      const moderator = await db.getUserById(input.moderatorId);
      if (!moderator || !['moderator', 'admin'].includes(moderator.role)) {
        throw new Error('ليس لديك صلاحيات كافية');
      }

      // تثبيت الساحة
      await db.pinRoom(input.roomId, input.moderatorId);

      return { success: true, message: 'تم تثبيت الساحة بنجاح' };
    }),

  // إلغاء تثبيت ساحة
  unpinRoom: publicProcedure
    .input(
      z.object({
        roomId: z.number(),
        moderatorId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // التحقق من أن المستخدم مشرف أو مدير
      const moderator = await db.getUserById(input.moderatorId);
      if (!moderator || !['moderator', 'admin'].includes(moderator.role)) {
        throw new Error('ليس لديك صلاحيات كافية');
      }

      // إلغاء التثبيت
      await db.unpinRoom(input.roomId, input.moderatorId);

      return { success: true, message: 'تم إلغاء التثبيت بنجاح' };
    }),

  // جلب سجل الإجراءات (logs)
  getModerationLogs: publicProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      return db.getModerationLogs(input.limit, input.offset);
    }),
});
