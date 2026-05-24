# الكود الحالي الكامل لـ Top 10

## 1️⃣ جلب البيانات (سطر 336-342):

```tsx
const { data: top10Rooms, isLoading: roomsLoading, refetch } = trpc.top10.list.useQuery(undefined, { refetchInterval: 3000 });
const { data: allRoomsData, isLoading: allRoomsLoading } = trpc.rooms.list.useQuery({ page: 1, limit: 100 }, { refetchInterval: 5000 });
const allRooms = allRoomsData?.rooms || [];

// دمج Top 10 مع بقية الساحات
const rooms = top10Rooms || [];
const remainingRooms = allRooms.filter(room => !top10Rooms?.some(t => t.id === room.id)) || [];
```

---

## 2️⃣ عرض الساحات في FlatList (سطر 693-712):

```tsx
{rooms.length > 0 ? (
  <FlatList
    data={rooms}  {/* ← عرض Top 10 فقط */}
    keyExtractor={(item) => item.id.toString()}
    numColumns={2}
    columnWrapperStyle={{ gap: 6, marginBottom: 6 }}
    renderItem={({ item, index }) => (
      <View style={{ flex: 1, maxWidth: '50%' }}>
        <RoomCard
          room={item}
          currentUserId={userId}
          onJoinAsViewer={() => handleJoinAsViewer(item.id)}
          onDirectEnter={() => router.push(`/room/${item.id}`)}
          showGoldStar={item.hasGoldStar === "true"}
          rank={index + 1}  {/* ترتيب من 1-10 */}
        />
      </View>
    )}
    refreshControl={<RefreshControl refreshing={roomsLoading} onRefresh={refetch} tintColor="#c8860a" />}
    contentContainerStyle={{ paddingBottom: 20 }}
  />
) : (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ color: 'rgba(212,175,55,0.6)', textAlign: 'center' }}>لا توجد ساحات متاحة</Text>
    <Text style={{ color: 'rgba(212,175,55,0.4)', textAlign: 'center', marginTop: 6 }}>قم بإنشاء ساحة جديدة!</Text>
  </View>
)}
```

---

## 🔴 المشكلة الحالية:

**`remainingRooms` موجودة لكن لا تُعرض!**

```tsx
const rooms = top10Rooms || [];
const remainingRooms = allRooms.filter(...);  // ← محفوظة لكن لا تُستخدم

<FlatList data={rooms} ... />  // ← يعرض Top 10 فقط
```

---

## ✅ الحل لعرض جميع الساحات:

غيّر السطر 694 من:
```tsx
data={rooms}
```

إلى:
```tsx
data={[...rooms, ...remainingRooms]}
```

**النتيجة:**
- Top 10 أولاً (بترتيب من 1-10)
- ثم باقي الساحات (بترتيب من 11 فما فوق)

---

## 📊 الفرق:

| الحالة | البيانات المعروضة |
|--------|------------------|
| **الحالي** | `rooms` فقط (Top 10) |
| **بعد التعديل** | `[...rooms, ...remainingRooms]` (جميع الساحات) |
