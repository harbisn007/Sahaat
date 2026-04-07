import { Modal, View, Text, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { getAvatarSourceById } from "@/lib/avatars";
import { Image } from "react-native";

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
  onUnfollow?: (userId: string) => void;
}

export function FollowListModal({ visible, onClose, title, users, isLoading, onJoinRoom, onUnfollow }: FollowListModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            backgroundColor: '#1c1208',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderTopWidth: 2,
            borderTopColor: '#c8860a',
            maxHeight: '70%',
            minHeight: 200,
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
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Text style={{ color: '#c8860a', fontSize: 20, fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          {isLoading ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <ActivityIndicator color="#c8860a" size="large" />
            </View>
          ) : users.length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ color: '#9BA1A6', fontSize: 14 }}>لا يوجد أحد هنا بعد</Text>
            </View>
          ) : (
            <FlatList
              data={users}
              keyExtractor={(item) => item.userId}
              contentContainerStyle={{ paddingVertical: 8 }}
              renderItem={({ item }) => {
                const avatarSource = item.avatar && item.avatar !== 'male' && item.avatar !== 'female'
                  ? { uri: item.avatar }
                  : getAvatarSourceById(item.avatar || 'male');
                return (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    borderBottomWidth: 0.5,
                    borderBottomColor: '#c8860a22',
                  }}>
                    {/* صورة المستخدم */}
                    <View style={{ position: 'relative', marginLeft: 12 }}>
                      <Image
                        source={avatarSource}
                        style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: '#c8860a' }}
                      />
                      {/* دائرة حالة الاتصال */}
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

                    {/* الاسم والساحة */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#ECEDEE', fontSize: 14, fontWeight: '600' }}>
                        {item.username}
                      </Text>
                      {item.isOnline && item.currentRoomId ? (
                        <TouchableOpacity
                          onPress={() => {
                            onJoinRoom?.(item.currentRoomId!);
                            onClose();
                          }}
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
                      )}
                    </View>

                    {/* زر إلغاء المتابعة (فقط في قائمة تتابعهم) */}
                    {onUnfollow && (
                      <TouchableOpacity
                        onPress={() => onUnfollow(item.userId)}
                        style={{
                          padding: 6,
                          backgroundColor: '#3d1a1a',
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#EF444444',
                          marginRight: 4,
                        }}
                      >
                        <MaterialIcons name="person-remove" size={16} color="#EF4444" />
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
