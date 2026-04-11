import { Modal, View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert } from "react-native";
import { useState } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { getAvatarSourceById } from "@/lib/avatars";
import { Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface FollowUser {
  userId: string;
  username: string;
  avatar: string | null;
  isOnline: boolean;
  currentRoomId: number | null;
  currentRoomName: string;
}

interface FollowListModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  users: FollowUser[];
  isLoading: boolean;
  onJoinRoom?: (roomId: number) => void;
  /** إذا كانت قائمة "تتابعهم" نمرر دالة إلغاء المتابعة */
  onUnfollow?: (userId: string) => Promise<void> | void;
  /** إذا كانت قائمة "يتابعونك" نمرر هذه الدوال */
  onFollowBack?: (userId: string) => Promise<void> | void;
  onBlock?: (userId: string) => Promise<void> | void;
  /** قائمة IDs المحجوبين الحاليين */
  blockedIds?: string[];
  /** قائمة IDs الذين تتابعهم */
  followingIds?: string[];
  /** نوع القائمة */
  listType?: "followers" | "following";
}

export function FollowListModal({
  visible, onClose, title, users, isLoading, onJoinRoom,
  onUnfollow, onFollowBack, onBlock, blockedIds = [], followingIds = [], listType = "following"
}: FollowListModalProps) {
  const [localUsers, setLocalUsers] = useState<FollowUser[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [localBlockedIds, setLocalBlockedIds] = useState<string[]>(blockedIds);
  const [localFollowingIds, setLocalFollowingIds] = useState<string[]>(followingIds);
  const insets = useSafeAreaInsets();

  const displayUsers = localUsers.length > 0 ? localUsers : users;

  const handleUnfollow = (user: FollowUser) => {
    Alert.alert(
      'إلغاء المتابعة',
      `هل تريد إلغاء متابعة ${user.username}؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'نعم، إلغِ المتابعة',
          style: 'destructive',
          onPress: async () => {
            setRemovingId(user.userId);
            try {
              await onUnfollow?.(user.userId);
              const updated = (localUsers.length > 0 ? localUsers : users).filter(u => u.userId !== user.userId);
              setLocalUsers(updated);
            } finally {
              setRemovingId(null);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleFollowBack = async (user: FollowUser) => {
    const isFollowing = localFollowingIds.includes(user.userId);
    if (isFollowing) {
      Alert.alert('إلغاء المتابعة', `هل تريد إلغاء متابعة ${user.username}؟`, [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'نعم', style: 'destructive', onPress: async () => {
          await onFollowBack?.(user.userId);
          setLocalFollowingIds(prev => prev.filter(id => id !== user.userId));
        }},
      ]);
    } else {
      await onFollowBack?.(user.userId);
      setLocalFollowingIds(prev => [...prev, user.userId]);
    }
  };

  const handleBlock = async (user: FollowUser) => {
    const isBlocked = localBlockedIds.includes(user.userId);
    Alert.alert(
      isBlocked ? 'إلغاء الحجب' : 'حجب المستخدم',
      isBlocked
        ? `هل تريد إلغاء حجب ${user.username}؟ سيتمكن من رؤية ساحتك مجدداً.`
        : `هل تريد حجب ${user.username}؟ لن يرى الساحة التي تتواجد بها.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: isBlocked ? 'نعم، إلغِ الحجب' : 'نعم، احجب',
          style: 'destructive',
          onPress: async () => {
            await onBlock?.(user.userId);
            if (isBlocked) {
              setLocalBlockedIds(prev => prev.filter(id => id !== user.userId));
            } else {
              setLocalBlockedIds(prev => [...prev, user.userId]);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleClose = () => {
    setLocalUsers([]);
    setLocalBlockedIds(blockedIds);
    setLocalFollowingIds(followingIds);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
        activeOpacity={1}
        onPress={handleClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            backgroundColor: '#1c1208',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderTopWidth: 2,
            borderTopColor: '#c8860a',
            maxHeight: '75%',
            minHeight: 200,
            // padding سفلي يأخذ في الحسبان أزرار التنقل وشريط الجوال
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: '#c8860a44',
          }}>
            <Text style={{ color: '#d4af37', fontSize: 16, fontWeight: 'bold' }}>{title}</Text>
            <TouchableOpacity onPress={handleClose} style={{ padding: 4 }}>
              <Text style={{ color: '#c8860a', fontSize: 20, fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          {isLoading ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <ActivityIndicator color="#c8860a" size="large" />
            </View>
          ) : displayUsers.length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ color: '#9BA1A6', fontSize: 14 }}>لا يوجد أحد هنا بعد</Text>
            </View>
          ) : (
            <FlatList
              data={displayUsers}
              keyExtractor={(item) => item.userId}
              contentContainerStyle={{ paddingVertical: 8 }}
              showsVerticalScrollIndicator={true}
              indicatorStyle="white"
              renderItem={({ item }) => {
                const avatarSource = item.avatar && item.avatar !== 'male' && item.avatar !== 'female'
                  ? { uri: item.avatar }
                  : getAvatarSourceById(item.avatar || 'male');
                const isRemoving = removingId === item.userId;
                const isBlocked = localBlockedIds.includes(item.userId);
                const isFollowing = localFollowingIds.includes(item.userId);

                return (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    borderBottomWidth: 0.5,
                    borderBottomColor: '#c8860a22',
                    opacity: isRemoving ? 0.4 : 1,
                  }}>
                    {/* صورة المستخدم */}
                    <View style={{ position: 'relative', marginLeft: 12 }}>
                      <Image
                        source={avatarSource}
                        style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: '#c8860a' }}
                      />
                      <View style={{
                        position: 'absolute',
                        bottom: 1,
                        right: 1,
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: item.isOnline ? '#22C55E' : '#EF4444',
                        borderWidth: 2,
                        borderColor: '#1c1208',
                      }} />
                    </View>

                    {/* الاسم */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#ECEDEE', fontSize: 14, fontWeight: '600' }}>
                        {item.username}
                      </Text>
                      {/* في قائمة تتابعهم: أظهر الساحة. في يتابعونك: لا تظهر الساحة */}
                      {listType === "following" && (
                        item.isOnline && item.currentRoomId ? (
                          <TouchableOpacity
                            onPress={() => { onJoinRoom?.(item.currentRoomId!); handleClose(); }}
                            style={{ alignSelf: 'flex-start' }}
                          >
                            <Text style={{ color: '#c8860a', fontSize: 11, marginTop: 2, textDecorationLine: 'underline' }}>
                              {item.currentRoomName}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={{ color: item.isOnline ? '#c8860a' : '#687076', fontSize: 11, marginTop: 2 }}>
                            {item.isOnline ? 'ساحات الطواريق' : 'غير متصل'}
                          </Text>
                        )
                      )}
                      {listType === "followers" && (
                        <Text style={{ color: item.isOnline ? '#22C55E' : '#687076', fontSize: 11, marginTop: 2 }}>
                          {item.isOnline ? 'متواجد' : 'غير متصل'}
                        </Text>
                      )}
                    </View>

                    {/* أيقونات قائمة يتابعونك: متابعة + حجب */}
                    {listType === "followers" && (
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        {/* أيقونة متابعة بالمقابل */}
                        <TouchableOpacity
                          onPress={() => handleFollowBack(item)}
                          style={{
                            padding: 6,
                            backgroundColor: isFollowing ? '#1a3d1a' : '#2d1f0e',
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: isFollowing ? '#22C55E44' : '#c8860a44',
                          }}
                        >
                          <MaterialIcons
                            name={isFollowing ? "person-remove" : "person-add"}
                            size={16}
                            color={isFollowing ? '#22C55E' : '#c8860a'}
                          />
                        </TouchableOpacity>

                        {/* أيقونة الحجب */}
                        <TouchableOpacity
                          onPress={() => handleBlock(item)}
                          style={{
                            padding: 6,
                            backgroundColor: isBlocked ? '#3d1a1a' : '#2d1f0e',
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: isBlocked ? '#EF444466' : '#c8860a22',
                          }}
                        >
                          <MaterialIcons
                            name="block"
                            size={16}
                            color={isBlocked ? '#EF4444' : '#687076'}
                          />
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* زر إلغاء المتابعة (فقط في قائمة تتابعهم) */}
                    {listType === "following" && onUnfollow && (
                      <TouchableOpacity
                        onPress={() => !isRemoving && handleUnfollow(item)}
                        disabled={isRemoving}
                        style={{
                          padding: 6,
                          backgroundColor: '#3d1a1a',
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#EF444444',
                          marginRight: 4,
                        }}
                      >
                        {isRemoving
                          ? <ActivityIndicator size={16} color="#EF4444" />
                          : <MaterialIcons name="person-remove" size={16} color="#EF4444" />
                        }
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
