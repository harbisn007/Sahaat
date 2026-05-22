# تعديلات نظام الإدارة والمشرفين - توثيق كامل

## 📋 ملخص التعديلات

تم إضافة نظام شامل لإدارة المدراء والمشرفين في التطبيق وصفحة الويب الخاصة بالإدارة.

---

## 🌐 تعديلات صفحة الويب (server/admin.ts)

### 1. إضافة تبويب "المدراء والمشرفون"

**الموقع:** السطر 462 في `server/admin.ts`

```html
<button class="tab" onclick="switchTab('moderators', this)">المدراء والمشرفون</button>
```

### 2. جدول المدراء والمشرفون (HTML)

**الموقع:** السطور 516-537

```html
<!-- تبويب المدراء والمشرفون -->
<div class="panel" id="panel-moderators">
  <div class="section-header">
    <h2>المدراء والمشرفون</h2>
    <button class="refresh-btn" onclick="location.reload()">تحديث</button>
  </div>
  <input class="search-bar" type="text" placeholder="بحث بالاسم أو البريد..." oninput="filterTable('moderators-table', this.value)" />
  <div class="table-wrap">
    <table id="moderators-table">
      <thead>
        <tr>
          <th>#</th>
          <th>الاسم</th>
          <th>البريد</th>
          <th>الدور</th>
          <th>الإجراءات</th>
        </tr>
      </thead>
      <tbody id="moderators-tbody"></tbody>
    </table>
  </div>
</div>
```

### 3. دالة تحميل المدراء (JavaScript)

**الموقع:** السطور 782-807

```javascript
async function loadModerators() {
  try {
    const res = await fetch('/admin/api/moderators');
    if (!res.ok) throw new Error('Failed to load moderators');
    const moderators = await res.json();
    const tbody = document.getElementById('moderators-tbody');
    tbody.innerHTML = moderators.map((m, i) => `
      <tr id="mod-row-${m.id}">
        <td>${i + 1}</td>
        <td>${m.name || '—'}</td>
        <td>${m.email || '—'}</td>
        <td><span class="badge badge-${m.role}">${m.role === 'admin' ? 'مدير' : m.role === 'moderator' ? 'مشرف' : 'مستخدم'}</span></td>
        <td>
          <select onchange="changeModeratorRole('${m.id}', this.value)" class="role-select">
            <option value="">-- اختر --</option>
            <option value="moderator" ${m.role === 'moderator' ? 'selected' : ''}>مشرف</option>
            <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>مدير</option>
            <option value="user">إزالة الصلاحيات</option>
          </select>
        </td>
      </tr>
    `).join('');
  } catch(e) {
    console.error('Error loading moderators:', e);
  }
}
```

### 4. دالة تغيير دور المستخدم (JavaScript)

**الموقع:** السطور 809-827

```javascript
async function changeModeratorRole(userId, newRole) {
  if (!newRole) return;
  if (!confirm('هل تريد تحديث دور هذا المستخدم؟')) return;
  try {
    const res = await fetch('/admin/api/set-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: newRole })
    });
    if (res.ok) {
      alert('تم تحديث الدور بنجاح');
      loadModerators();
    } else {
      alert('فشل تحديث الدور');
    }
  } catch(e) {
    alert('خطأ: ' + e);
  }
}
```

### 5. API Endpoints

#### أ) جلب قائمة المدراء والمشرفين

**الموقع:** السطور 193-205

```javascript
router.get("/api/moderators", async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) return res.status(401).send("Unauthorized");
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database connection failed" });
    const result = await db.execute(
      `SELECT id, name, email, avatar, role FROM users WHERE role IN ('moderator', 'admin') ORDER BY role DESC, name ASC`
    );
    res.json(result.rows || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch moderators" });
  }
});
```

**الطلب:** `GET /admin/api/moderators`

**الاستجابة:**
```json
[
  {
    "id": "user-id-1",
    "name": "أحمد محمد",
    "email": "ahmed@example.com",
    "avatar": "avatar-url",
    "role": "admin"
  },
  {
    "id": "user-id-2",
    "name": "فاطمة علي",
    "email": "fatima@example.com",
    "avatar": "avatar-url",
    "role": "moderator"
  }
]
```

#### ب) تعيين دور للمستخدم

**الموقع:** السطور 208-225

```javascript
router.post("/api/set-role", async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) return res.status(401).send("Unauthorized");
  const { userId, role } = req.body;
  if (!userId || !role || !['user', 'moderator', 'admin'].includes(role)) {
    return res.status(400).json({ error: "Invalid input" });
  }
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database connection failed" });
    await db.execute(
      `UPDATE users SET role = ? WHERE id = ?`,
      [role, userId]
    );
    res.json({ success: true, message: "تم تحديث الدور بنجاح" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update role" });
  }
});
```

**الطلب:** `POST /admin/api/set-role`

**Body:**
```json
{
  "userId": "user-id-123",
  "role": "moderator"  // أو "admin" أو "user"
}
```

**الاستجابة:**
```json
{
  "success": true,
  "message": "تم تحديث الدور بنجاح"
}
```

---

## 📱 تعديلات التطبيق (React Native)

### 1. مكون AdminPanel (components/AdminPanel.tsx)

**الملف:** `components/AdminPanel.tsx` (كامل الملف 300+ سطر)

#### الميزات:

1. **عرض المدراء والمشرفين:**
   - زر "📋 المدراء والمشرفين" يفتح Modal يعرض قائمة بجميع المدراء والمشرفين
   - كل مستخدم يظهر مع:
     - الاسم
     - الدور (مدير/مشرف) مع أيقونة
     - لون مختلف للحد الأيسر حسب الدور

2. **تعيين مشرف جديد:**
   - زر "👥 تعيين مشرف" يفتح Modal يعرض قائمة بجميع المستخدمين
   - يمكن اختيار أي مستخدم لتعيينه كمشرف أو مدير

3. **تحديث الدور:**
   - عند الضغط على أي مستخدم، يظهر Modal بخيارات:
     - 🛡️ مشرف
     - 👑 مدير
     - 🗑️ إزالة الصلاحيات (يظهر فقط إذا كان المستخدم له صلاحيات)

4. **الحالات المختلفة:**
   - تحميل البيانات (Loading state)
   - قائمة فارغة
   - معالجة الأخطاء

#### الـ Hooks المستخدمة:

```typescript
// جلب المدراء والمشرفين
const { data: moderators, isLoading: modsLoading, refetch: refetchMods } = 
  trpc.admin.getModeratorsAndAdmins.useQuery();

// جلب جميع المستخدمين
const { data: allUsers, isLoading: usersLoading } = 
  trpc.admin.getAllUsers.useQuery();

// تعيين دور
const setRoleMutation = trpc.admin.setUserRole.useMutation({...});

// إزالة دور
const removeRoleMutation = trpc.admin.removeUserRole.useMutation({...});
```

#### الألوان والأنماط:

- **خلفية:** `#151718` (أسود داكن)
- **نص رئيسي:** `#d4af37` (ذهبي)
- **نص ثانوي:** `#9BA1A6` (رمادي)
- **زر المشرف:** `#c8860a` (ذهبي داكن)
- **زر المدير:** `#d4af37` (ذهبي فاتح)
- **زر الحذف:** `#EF4444` (أحمر)

---

## 🗄️ تعديلات قاعدة البيانات

### 1. Schema (drizzle/schema.ts)

تم تحديث enum الـ role ليشمل ثلاث قيم:

```typescript
role: text("role").default("user").notNull()
// القيم الممكنة: "user", "moderator", "admin"
```

### 2. الجداول المتأثرة:

- **users table:**
  - عمود `role` - يحتوي على دور المستخدم
  - القيم: `"user"` (مستخدم عادي)، `"moderator"` (مشرف)، `"admin"` (مدير)

---

## 🔐 الصلاحيات والأدوار

### 1. المستخدم العادي (user)
- لا توجد صلاحيات إدارية

### 2. المشرف (moderator)
- إغلاق الساحات
- تثبيت الساحات
- حظر/إلغاء حظر المستخدمين
- عرض البلاغات

### 3. المدير (admin)
- جميع صلاحيات المشرف
- تعيين/إزالة المشرفين
- تعيين/إزالة المدراء
- إدارة كاملة للنظام

---

## 🔄 سير العمل

### في صفحة الويب:

1. المسؤول يدخل صفحة الإدارة
2. يذهب إلى تبويب "المدراء والمشرفون"
3. يرى قائمة بجميع المدراء والمشرفين الحاليين
4. يمكنه:
   - اختيار مستخدم وتغيير دوره من dropdown
   - أو البحث عن مستخدم معين

### في التطبيق:

1. المسؤول يفتح AdminPanel
2. يضغط على "📋 المدراء والمشرفين" لعرض القائمة الحالية
3. أو يضغط على "👥 تعيين مشرف" لإضافة مشرف جديد
4. يختار المستخدم والدور المطلوب
5. يتم التحديث فوراً

---

## 📝 ملاحظات مهمة

1. **المصادقة:** جميع الـ endpoints تتطلب تسجيل دخول كمسؤول
2. **التحديث الفوري:** عند تغيير الدور، يتم تحديث الواجهة فوراً
3. **التأكيد:** هناك رسالة تأكيد قبل تغيير الدور
4. **الأخطاء:** يتم عرض رسائل خطأ واضحة عند فشل العملية

---

## 🐛 المشاكل المعروفة

1. **Railway Deployment:** قد تستغرق النشر 2-3 دقائق بعد الـ push
2. **Cache:** قد تحتاج إلى تحديث الصفحة (F5) لرؤية التغييرات

---

## ✅ قائمة التحقق

- [x] تبويب المدراء والمشرفون في صفحة الويب
- [x] جدول عرض المدراء والمشرفين
- [x] API endpoint لجلب المدراء
- [x] API endpoint لتعيين الدور
- [x] مكون AdminPanel في التطبيق
- [x] عرض قائمة المدراء في التطبيق
- [x] تعيين مشرف جديد من التطبيق
- [x] تحديث الدور من صفحة الويب
- [x] تحديث الدور من التطبيق
- [x] معالجة الأخطاء
- [x] رسائل التأكيد

