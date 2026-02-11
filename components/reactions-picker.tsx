import { Modal, Pressable, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ReactionsPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (reaction: string) => void;
}

// 15 أيقونة مناسبة للحماس والتفاعل والموافقة والاعجاب وعدم الاعجاب
const REACTIONS = [
  // الصف الأول - التفاعل الإيجابي
  { emoji: "👏", type: "clap" },
  { emoji: "🔥", type: "fire" },
  { emoji: "❤️", type: "heart" },
  { emoji: "👍", type: "thumbsup" },
  { emoji: "⭐", type: "star" },
  // الصف الثاني - المشاعر
  { emoji: "😂", type: "laugh" },
  { emoji: "😮", type: "wow" },
  { emoji: "🤔", type: "thinking" },
  { emoji: "😢", type: "sad" },
  { emoji: "😡", type: "angry" },
  // الصف الثالث - الموافقة وعدم الموافقة
  { emoji: "✅", type: "check" },
  { emoji: "❌", type: "cross" },
  { emoji: "👎", type: "thumbsdown" },
  { emoji: "💪", type: "strong" },
  { emoji: "🎉", type: "celebrate" },
];

export function ReactionsPicker({ visible, onClose, onSelect }: ReactionsPickerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const handleSelect = (type: string) => {
    onSelect(type);
    onClose();
  };

  // تقسيم الأيقونات إلى 3 صفوف (5 في كل صف)
  const rows = [
    REACTIONS.slice(0, 5),
    REACTIONS.slice(5, 10),
    REACTIONS.slice(10, 15),
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onPress={onClose}
      >
        <View
          className="rounded-t-3xl px-4 pt-4"
          style={{ 
            backgroundColor: colors.surface,
            paddingBottom: Math.max(insets.bottom, 16) + 60, // رفع فوق أزرار التنقل
          }}
        >
          {/* 3 صفوف من الأيقونات */}
          {rows.map((row, rowIndex) => (
            <View 
              key={rowIndex} 
              className="flex-row justify-center gap-2 mb-2"
            >
              {row.map((reaction) => (
                <Pressable
                  key={reaction.type}
                  onPress={() => handleSelect(reaction.type)}
                  className="items-center justify-center rounded-2xl"
                  style={({ pressed }) => ({
                    width: 56,
                    height: 56,
                    backgroundColor: pressed ? colors.primary + "20" : colors.background,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ fontSize: 28 }}>{reaction.emoji}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
