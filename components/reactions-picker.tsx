import { Modal, Pressable, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";

interface ReactionsPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (reaction: string) => void;
}

const REACTIONS = [
  { emoji: "👏", label: "تصفيق" },
  { emoji: "😂", label: "ضحك" },
  { emoji: "😮", label: "اندهاش" },
  { emoji: "👍", label: "إعجاب" },
  { emoji: "🔥", label: "نار" },
  { emoji: "✅", label: "موافق" },
  { emoji: "🤔", label: "تفكير" },
  { emoji: "❤️", label: "حب" },
];

export function ReactionsPicker({ visible, onClose, onSelect }: ReactionsPickerProps) {
  const colors = useColors();

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    onClose();
  };

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
          className="rounded-t-3xl p-4 pb-8"
          style={{ backgroundColor: colors.surface }}
        >
          <Text className="text-center text-lg font-bold mb-4" style={{ color: colors.foreground }}>
            اختر تفاعل
          </Text>
          
          <View className="flex-row flex-wrap justify-center gap-3">
            {REACTIONS.map((reaction) => (
              <Pressable
                key={reaction.emoji}
                onPress={() => handleSelect(reaction.emoji)}
                className="items-center justify-center w-16 h-16 rounded-2xl"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? colors.primary + "20" : colors.background,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text className="text-3xl">{reaction.emoji}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
