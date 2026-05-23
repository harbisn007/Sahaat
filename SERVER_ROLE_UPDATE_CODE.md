# كود السيرفر — تحديث الدور والبث عبر Socket

## 📍 ملف: `server/admin.ts`

### Endpoint: `/admin/api/set-role` (من لوحة الإدارة)

```typescript
// ── API: تغيير دور المستخدم ──
router.post("/api/set-role", async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { userId, newRole } = req.body;
    if (!userId || !newRole) return res.status(400).json({ error: "Missing userId or newRole" });
    if (!["user", "moderator", "admin"].includes(newRole)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    const dbConn = await getDb();
    if (!dbConn) return res.status(503).json({ error: "DB unavailable" });
    
    // 1️⃣ تحديث قاعدة البيانات
    await dbConn.update(users).set({ appRole: newRole }).where(eq(users.id, parseInt(userId)));
    
    // 2️⃣ ✅ بث الإشعار عبر Socket
    emitUserRoleUpdated(userId, newRole as 'user' | 'moderator' | 'admin');
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

**ملاحظات:**
- يحدّث حقل `appRole` في قاعدة البيانات
- يبث `userRoleUpdated` عبر Socket بعد التحديث مباشرة ✅
- يتطلب مصادقة من لوحة الإدارة

---

## 📍 ملف: `server/moderator-actions.ts`

### Endpoint: `/api/promote-participant` (من داخل الساحة)

```typescript
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

    // 1️⃣ تحديث قاعدة البيانات
    await db.update(users).set({ role: newRole }).where(eq(users.id, parseInt(userId)));

    // 2️⃣ إرسال إشعار للمستخدم (في قاعدة البيانات)
    const promotedUser = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(userId)))
      .limit(1);

    if (promotedUser[0]) {
      const roleLabel = newRole === 'admin' ? 'مدير' : 'مشرف';
      const actionLabel = newRole === 'user' ? `تم إلغاء ${roleLabel === 'مدير' ? 'الإدارة' : 'الإشراف'}` : `تم تعيينك ${roleLabel}`;
      
      // إضافة إشعار في قاعدة البيانات
      await db.insert(notifications).values({
        userId: promotedUser[0].id,
        title: actionLabel,
        message: `${actionLabel} بواسطة ${moderator[0].name || 'مدير'}`,
        type: newRole === 'user' ? 'role_removed' : 'role_granted',
        createdAt: new Date(),
      });
      
      // إرسال إشعار فوري عبر Socket
      emitNotification(promotedUser[0].id, {
        title: actionLabel,
        message: `${actionLabel} بواسطة ${moderator[0].name || 'مدير'}`,
        type: newRole === 'user' ? 'role_removed' : 'role_granted',
      });
    }

    // 3️⃣ ✅ بث الإشعار عبر Socket
    emitUserRoleUpdated(userId, newRole as "user" | "moderator" | "admin");

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

**ملاحظات:**
- يحدّث حقل `role` في قاعدة البيانات
- يتحقق من أن المعدل هو مدير فقط
- يرسل إشعار للمستخدم عبر Socket
- يبث `userRoleUpdated` عبر Socket بعد التحديث مباشرة ✅

---

## 📍 ملف: `server/_core/socket.ts`

### دالة البث: `emitUserRoleUpdated`

```typescript
export function emitUserRoleUpdated(userId: string, newRole: 'user' | 'moderator' | 'admin'): void {
  if (!io) return;
  
  // ✅ بث الإشعار إلى المستخدم المحدد
  io.to(`user:${userId}`).emit("userRoleUpdated", { userId, newRole });
  
  console.log(`[Socket.io] userRoleUpdated sent to user:${userId} (newRole: ${newRole})`);
}
```

**كيفية العمل:**
1. تُرسل الرسالة إلى جميع اتصالات المستخدم (`user:${userId}`)
2. الحدث: `userRoleUpdated`
3. البيانات: `{ userId, newRole }`

---

## 🔄 تدفق التحديث الكامل

```
1. التطبيق يرسل POST إلى /api/set-role أو /api/promote-participant
   ↓
2. السيرفر يحدّث قاعدة البيانات (حقل role أو appRole)
   ↓
3. السيرفر يستدعي emitUserRoleUpdated(userId, newRole)
   ↓
4. Socket.io يبث الحدث userRoleUpdated إلى user:${userId}
   ↓
5. التطبيق يستقبل الحدث (في app/room/[id].tsx):
   socket.on('userRoleUpdated', (data) => {
     if (data.userId === userId) {
       setRole(data.newRole);
     }
   });
   ↓
6. الدور يتحدّث محلياً في التطبيق
```

---

## ✅ التحقق من البث

### في لوحة الإدارة (`server/admin.ts`)
```javascript
socket.on('userRoleUpdated', (data) => {
  console.log('User role updated:', data);
  location.reload();
});
```

### في التطبيق (`app/room/[id].tsx`)
```typescript
socket.on('userRoleUpdated', (data) => {
  console.log('User role updated:', data);
  if (data.userId === userId) {
    setRole(data.newRole);
  }
});
```

---

## 📊 جدول المقارنة

| الخاصية | `/admin/api/set-role` | `/api/promote-participant` |
|--------|----------------------|---------------------------|
| **الملف** | `server/admin.ts` | `server/moderator-actions.ts` |
| **الحقل المحدّث** | `appRole` | `role` |
| **من يمكنه الاستدعاء** | لوحة الإدارة فقط | من داخل الساحة |
| **التحقق من الصلاحيات** | مصادقة لوحة الإدارة | يجب أن يكون المعدل مدير |
| **البث عبر Socket** | ✅ `emitUserRoleUpdated` | ✅ `emitUserRoleUpdated` |
| **إشعار للمستخدم** | ❌ لا | ✅ نعم |

---

## 🚀 الخطوات التالية

1. **تأكد من استقبال الحدث في التطبيق:**
   ```typescript
   socket.on('userRoleUpdated', (data) => {
     console.log('Received role update:', data);
     if (data.userId === userId) {
       setRole(data.newRole);
     }
   });
   ```

2. **تأكد من استقبال الحدث في لوحة الإدارة:**
   ```javascript
   socket.on('userRoleUpdated', (data) => {
     console.log('User role updated:', data);
     location.reload();
   });
   ```

3. **اختبر التحديث:**
   - غيّر دور المستخدم من لوحة الإدارة
   - تحقق من أن الحدث يُبث إلى Socket
   - تحقق من أن التطبيق يستقبل الحدث ويحدّث الدور محلياً

