# الأكواد المطلوبة

## 1️⃣ Endpoint: /admin/api/moderators من server/admin.ts

هذا الـ endpoint غير موجود حالياً في الملف. يجب إضافته.

الكود المقترح:

```typescript
router.get("/admin/api/moderators", async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    const dbConn = await getDb();
    if (!dbConn) return res.status(503).json({ error: "DB unavailable" });
    
    // جلب المديرين والمشرفين
    const moderators = await dbConn
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(or(eq(users.role, 'admin'), eq(users.role, 'moderator')));
    
    res.json(moderators);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

---

## 2️⃣ زر تثبيت الساحة من app/room/[id].tsx (سطر 2058-2098)

```tsx
{(role === 'admin' || role === 'moderator' || isCreator) && (
  <TouchableOpacity
    style={{
      backgroundColor: roomData.isPinned === 'true' ? '#2d1f0e' : '#1a1a1a',
      borderWidth: 1,
      borderColor: roomData.isPinned === 'true' ? '#c8860a' : '#444',
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 10,
    }}
    onPress={async () => {
      try {
        const response = await fetch('/api/pin-room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId,
            isPinned: roomData.isPinned !== 'true',
            moderatorId: userId,
          }),
        });
        if (response.ok) {
          refetch();
        }
      } catch (err) {
        console.error('Pin room error:', err);
      }
    }}
  >
    <Text style={{ color: roomData.isPinned === 'true' ? '#d4af37' : '#888', fontWeight: 'bold', fontSize: 11 }}>
      {roomData.isPinned === 'true' ? '📌 مثبتة' : '📍 تثبيت'}
    </Text>
  </TouchableOpacity>
)}
```

**الشروط:**
- فقط للمديرين والمشرفين والمنشئ
- الأيقونة تتغير حسب حالة التثبيت
- يرسل طلب POST إلى `/api/pin-room`

---

## 3️⃣ عداد المشاركين من app/room/[id].tsx (سطر 2048-2052)

```tsx
<TouchableOpacity onPress={() => (role && ['moderator', 'admin'].includes(role)) ? setShowParticipantsList(true) : null}>
  <Text style={{ color: 'rgba(212,175,55,0.6)', fontSize: 11, textAlign: 'center', marginTop: 2 }}>
    {roomData.acceptedPlayersCount}/2 شعراء · {roomData.viewerCount} مستمعين
  </Text>
</TouchableOpacity>
```

**الشروط:**
- يعرض عدد الشعراء والمستمعين
- قابل للضغط فقط للمديرين والمشرفين
- يفتح قائمة المشاركين عند الضغط
- يعرض البيانات من `roomData`:
  - `acceptedPlayersCount` - عدد الشعراء
  - `viewerCount` - عدد المستمعين

---

## ملخص الصلاحيات:

| الإجراء | المديرين | المشرفين | المنشئ | المستخدمين |
|--------|---------|---------|--------|-----------|
| تثبيت الساحة | ✅ | ✅ | ✅ | ❌ |
| عرض قائمة المشاركين | ✅ | ✅ | ❌ | ❌ |
| تغيير أدوار المستخدمين | ✅ | ❌ | ❌ | ❌ |
