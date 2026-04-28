import { Image, Modal, Pressable, View } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ReactionsPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (reaction: string) => void;
}

// 16 أيقونة — 4 شخصية + 12 نصية — شبكة 4×4
const REACTIONS: { image: any; type: string; isCharacter?: boolean }[] = [
  // الصف الأول — شخصيات
  { image: require("@/assets/images/reaction_clapping.png"),     type: "clapping",     isCharacter: true },
  { image: require("@/assets/images/reaction_laughing.png"),     type: "laughing",     isCharacter: true },
  { image: require("@/assets/images/reaction_angry.png"),        type: "angry",        isCharacter: true },
  { image: require("@/assets/images/reaction_thumbsup.png"),     type: "thumbsup",     isCharacter: true },
  // الصف الثاني — نصية
  { image: require("@/assets/images/reaction_salam.png"),        type: "salam" },
  { image: require("@/assets/images/reaction_alaikum.png"),      type: "alaikum" },
  { image: require("@/assets/images/reaction_masaakum.png"),     type: "masaakum" },
  { image: require("@/assets/images/reaction_masa_alnoor.png"),  type: "masa_alnoor" },
  // الصف الثالث — نصية
  { image: require("@/assets/images/reaction_hayak.png"),        type: "hayak" },
  { image: require("@/assets/images/reaction_abqak.png"),        type: "abqak" },
  { image: require("@/assets/images/reaction_sah_lisanak.png"),  type: "sah_lisanak" },
  { image: require("@/assets/images/reaction_kafo.png"),         type: "kafo" },
  // الصف الرابع — نصية
  { image: require("@/assets/images/reaction_maalaik_zood.png"), type: "maalaik_zood" },
  { image: require("@/assets/images/reaction_malak_lowa.png"),   type: "malak_lowa" },
  { image: require("@/assets/images/reaction_latoodha.png"),     type: "latoodha" },
  { image: require("@/assets/images/reaction_eid_karrar.png"),   type: "eid_karrar" },
];

export function ReactionsPicker({ visible, onClose, onSelect }: ReactionsPickerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const handleSelect = (type: string) => {
    onSelect(type);
    onClose();
  };

  // تقسيم إلى 4 صفوف × 4 أعمدة
  const rows = [
    REACTIONS.slice(0, 4),
    REACTIONS.slice(4, 8),
    REACTIONS.slice(8, 12),
    REACTIONS.slice(12, 16),
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
        onPress={onClose}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 12,
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom, 16) + 60,
          }}
        >
          {rows.map((row, rowIndex) => (
            <View
              key={rowIndex}
              style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 8 }}
            >
              {row.map((reaction) => {
                const isChar = reaction.isCharacter;
                const cellSize = 68;
                const imgSize = isChar ? 62 : 52;
                return (
                  <Pressable
                    key={reaction.type}
                    onPress={() => handleSelect(reaction.type)}
                    style={({ pressed }) => ({
                      width: cellSize,
                      height: cellSize,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 16,
                      backgroundColor: pressed ? colors.primary + "20" : colors.background,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Image
                      source={reaction.image}
                      style={{ width: imgSize, height: imgSize }}
                      resizeMode="contain"
                    />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
