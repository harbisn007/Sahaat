import { Modal, Pressable, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";

interface ReactionsPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (reaction: string) => void;
}

const REACTIONS = [
  { emoji: "👏", label: "تصفيق", type: "clap" },
  { emoji: "😂", label: "ضحك", type: "laugh" },
  { emoji: "😮", label: "اندهاش", type: "wow" },
  { emoji: "👍", label: "إعجاب", type: "thumbsup" },
  { emoji: "🔥", label: "نار", type: "fire" },
  { emoji: "✅", label: "موافق", type: "love" },
  { emoji: "🤔", label: "تفكير", type: "thinking" },
  { emoji: "❤️", label: "حب", type: "heart" },
];

export function ReactionsPicker({ visible, onClose, onSelect }: ReactionsPickerProps) {
  const colors = useColors();

  const handleSelect = (type: string) => {
    onSelect(type);
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
                onPress={() => handleSelect(reaction.type)}
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
