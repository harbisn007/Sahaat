# كود عمود Top 10 — إظهار جميع الساحات

## الكود الحالي (app/(tabs)/index.tsx)

### 1️⃣ جلب البيانات (سطر 336-342):

```tsx
const { data: top10Rooms, isLoading: roomsLoading, refetch } = trpc.top10.list.useQuery(undefined, { refetchInterval: 3000 });
const { data: allRoomsData, isLoading: allRoomsLoading } = trpc.rooms.list.useQuery({ page: 1, limit: 100 }, { refetchInterval: 5000 });
const allRooms = allRoomsData?.rooms || [];

// دمج Top 10 مع بقية الساحات
const rooms = top10Rooms || [];
const remainingRooms = allRooms.filter(room => !top10Rooms?.some(t => t.id === room.id)) || [];
```

**الشرح:**
- `top10Rooms` - جلب أفضل 10 ساحات (تحديث كل 3 ثوان)
- `allRooms` - جلب جميع الساحات (تحديث كل 5 ثوان)
- `remainingRooms` - الساحات الأخرى بعد حذف Top 10

---

### 2️⃣ عرض الساحات (سطر 693-712):

```tsx
<FlatList
  data={rooms}  {/* عرض Top 10 فقط */}
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
        rank={index + 1}  {/* ترتيب الساحة */}
      />
    </View>
  )}
  refreshControl={<RefreshControl refreshing={roomsLoading} onRefresh={refetch} tintColor="#c8860a" />}
  contentContainerStyle={{ paddingBottom: 20 }}
/>
```

---

## 🔧 لإظهار جميع الساحات بدلاً من Top 10 فقط:

### الحل 1️⃣ - دمج Top 10 مع الباقي:

```tsx
// دمج Top 10 مع جميع الساحات الأخرى
const allRoomsWithRanking = [
  ...rooms.map((room, idx) => ({ ...room, rank: idx + 1, isTop10: true })),
  ...remainingRooms.map((room, idx) => ({ ...room, rank: rooms.length + idx + 1, isTop10: false }))
];

<FlatList
  data={allRoomsWithRanking}  {/* عرض جميع الساحات */}
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
        rank={item.rank}
        isTop10={item.isTop10}  {/* إشارة لـ Top 10 */}
      />
    </View>
  )}
  refreshControl={<RefreshControl refreshing={roomsLoading || allRoomsLoading} onRefresh={refetch} tintColor="#c8860a" />}
  contentContainerStyle={{ paddingBottom: 20 }}
/>
```

---

### الحل 2️⃣ - عرض Top 10 وباقي الساحات في قسمين منفصلين:

```tsx
<View>
  {/* قسم Top 10 */}
  <Text style={{ color: '#d4af37', fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>🏆 أفضل 10 ساحات</Text>
  <FlatList
    data={rooms}
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
          rank={index + 1}
        />
      </View>
    )}
    scrollEnabled={false}
  />
  
  {/* قسم الساحات الأخرى */}
  {remainingRooms.length > 0 && (
    <>
      <Text style={{ color: '#d4af37', fontSize: 14, fontWeight: 'bold', marginBottom: 8, marginTop: 16 }}>📋 الساحات الأخرى</Text>
      <FlatList
        data={remainingRooms}
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
              rank={rooms.length + index + 1}
            />
          </View>
        )}
        scrollEnabled={false}
      />
    </>
  )}
</View>
```

---

## 📊 الفرق بين الحلين:

| الحل | الوصف | الفائدة |
|-----|--------|--------|
| **الحل 1** | دمج Top 10 مع الباقي في قائمة واحدة | عرض سلس، جميع الساحات في مكان واحد |
| **الحل 2** | قسمين منفصلين (Top 10 والباقي) | تمييز واضح بين Top 10 والساحات الأخرى |

---

## 🎯 الخيار الموصى به:

استخدم **الحل 1** لأنه:
- ✅ أبسط وأنظف
- ✅ عرض سلس بدون فواصل
- ✅ يحافظ على الترتيب الكامل
