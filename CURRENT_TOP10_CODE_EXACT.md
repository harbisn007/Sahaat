# الكود الحالي الدقيق - بدون أي تعديلات

## جلب البيانات (سطر 336-342):

```tsx
const { data: top10Rooms, isLoading: roomsLoading, refetch } = trpc.top10.list.useQuery(undefined, { refetchInterval: 3000 });
const { data: allRoomsData, isLoading: allRoomsLoading } = trpc.rooms.list.useQuery({ page: 1, limit: 100 }, { refetchInterval: 5000 });
const allRooms = allRoomsData?.rooms || [];

// دمج Top 10 مع بقية الساحات
const rooms = top10Rooms || [];
const remainingRooms = allRooms.filter(room => !top10Rooms?.some(t => t.id === room.id)) || [];
```

---

## عرض الساحات (سطر 692-718):

```tsx
) : rooms && rooms.length > 0 ? (
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
    refreshControl={<RefreshControl refreshing={roomsLoading} onRefresh={refetch} tintColor="#c8860a" />}
    contentContainerStyle={{ paddingBottom: 20 }}
  />
) : (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ color: 'rgba(212,175,55,0.6)', textAlign: 'center' }}>لا توجد ساحات متاحة</Text>
    <Text style={{ color: 'rgba(212,175,55,0.4)', textAlign: 'center', marginTop: 6 }}>قم بإنشاء ساحة جديدة!</Text>
  </View>
)
```

---

## ملخص:

- **البيانات المعروضة:** `rooms` (Top 10 فقط)
- **البيانات غير المعروضة:** `remainingRooms` (الساحات الأخرى)
- **عدد الأعمدة:** 2
- **التحديث:** كل 3 ثوان للـ Top 10
