# نظام المدراء والمشرفين

## 1. قاعدة البيانات (Schema)

### جدول Users - إضافة حقول جديدة
```sql
ALTER TABLE users ADD COLUMN role ENUM('user', 'moderator', 'admin') DEFAULT 'user';
ALTER TABLE users ADD COLUMN permissions JSON DEFAULT NULL;
```

### جدول Rooms - إضافة حقول جديدة
```sql
ALTER TABLE rooms ADD COLUMN isPinned BOOLEAN DEFAULT false;
ALTER TABLE rooms ADD COLUMN pinnedBy INT REFERENCES users(id);
ALTER TABLE rooms ADD COLUMN pinnedAt TIMESTAMP;
ALTER TABLE rooms ADD COLUMN autoDeleteEnabled BOOLEAN DEFAULT true;
```

### جدول Moderation - جديد
```sql
CREATE TABLE moderation_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  moderatorId INT REFERENCES users(id),
  targetUserId INT REFERENCES users(id),
  roomId INT REFERENCES rooms(id),
  action ENUM('ban', 'unban', 'room_close', 'pin_room', 'unpin_room'),
  reason VARCHAR(500),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 2. الأدوار والصلاحيات

### User (مستخدم عادي)
- إنشاء ساحات
- تسجيل صوتي
- حذف ساحاته الخاصة فقط

### Moderator (مشرف)
- كل صلاحيات User
- **إغلاق أي ساحة** (حتى لو لم ينشئها)
- **حظر/إلغاء حظر مستخدمين** من التطبيق
- **تثبيت الساحات** (منع الحذف التلقائي)
- رؤية أيقونة إدارة داخل التطبيق

### Admin (مدير)
- كل صلاحيات Moderator
- **تعيين/إزالة مشرفين**
- إدارة الصلاحيات

## 3. التعديلات المطلوبة

### أ) Backend API Routes

**POST /api/admin/moderators** - تعيين مشرف
```typescript
{
  userId: number,
  role: 'moderator' | 'admin'
}
```

**DELETE /api/admin/moderators/:userId** - إزالة مشرف

**POST /api/moderation/ban-user** - حظر مستخدم
```typescript
{
  targetUserId: number,
  reason: string
}
```

**POST /api/moderation/unban-user** - إلغاء حظر

**POST /api/moderation/close-room** - إغلاق ساحة
```typescript
{
  roomId: number,
  reason: string
}
```

**POST /api/moderation/pin-room** - تثبيت ساحة
```typescript
{
  roomId: number
}
```

**POST /api/moderation/unpin-room** - إلغاء تثبيت

### ب) Frontend - UI Components

**داخل شاشة الساحة (Room Screen):**
1. أيقونة **"إدارة"** (ثلاث نقاط) - تظهر فقط للمشرفين
2. قائمة منسدلة:
   - 🔒 إغلاق الساحة
   - 📌 تثبيت الساحة
   - 👥 إدارة المستخدمين

**داخل قائمة المستخدمين:**
1. زر **حظر** بجانب كل مستخدم (للمشرفين فقط)
2. زر **إلغاء حظر** (إذا كان محظوراً)

**صفحة إدارة المشرفين:**
1. قائمة المشرفين الحاليين
2. زر **إضافة مشرف**
3. زر **حذف مشرف**

### ج) Logic - الحذف التلقائي

**قبل الحذف التلقائي، تحقق:**
```typescript
if (room.isPinned && room.autoDeleteEnabled === false) {
  // لا تحذف - الساحة مثبتة
  return;
}
// حذف عادي
```

**الحذف يحدث فقط عند:**
- إغلاق من المنشئ
- إغلاق من مشرف/مدير
- انتهاء صلاحية الساحة (إذا كانت غير مثبتة)

## 4. Socket.io Events - جديدة

```typescript
// مشرف يغلق ساحة
socket.emit('moderator:closeRoom', { roomId, reason });

// مشرف يحظر مستخدم
socket.emit('moderator:banUser', { userId, reason });

// مشرف يثبت ساحة
socket.emit('moderator:pinRoom', { roomId });

// إشعار للجميع بإغلاق الساحة
socket.on('room:closedByModerator', { reason, closedBy });
```

## 5. خطوات التنفيذ

1. **قاعدة البيانات**: إضافة الجداول والأعمدة
2. **Backend**: إنشاء API routes للصلاحيات
3. **Frontend**: إضافة UI للمشرفين
4. **Logic**: تحديث منطق الحذف التلقائي
5. **Socket.io**: إضافة events جديدة
6. **Testing**: اختبار الصلاحيات

## 6. مثال تدفق العمل

```
1. Admin يعين User كـ Moderator
2. Moderator يدخل الساحة
3. يرى أيقونة "إدارة" (ثلاث نقاط)
4. يضغط → قائمة: إغلاق، تثبيت، إدارة مستخدمين
5. يختار "تثبيت الساحة" → الساحة لا تُحذف تلقائياً
6. يختار "حظر مستخدم" → المستخدم محظور من التطبيق
7. يختار "إغلاق الساحة" → الساحة تُغلق فوراً للجميع
```
