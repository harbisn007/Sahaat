import { View, Text, Image } from "react-native";

interface ReactionMessageProps {
  username: string;
  reactionType: string;
  createdAt: Date | string;
  isOwnMessage?: boolean;
}

// الأيقونات الجديدة — صور PNG
const REACTION_IMAGES: Record<string, any> = {
  clapping:     require("@/assets/images/reaction_clapping.png"),
  laughing:     require("@/assets/images/reaction_laughing.png"),
  angry:        require("@/assets/images/reaction_angry.png"),
  thumbsup:     require("@/assets/images/reaction_thumbsup.png"),
  salam:        require("@/assets/images/reaction_salam.png"),
  alaikum:      require("@/assets/images/reaction_alaikum.png"),
  masaakum:     require("@/assets/images/reaction_masaakum.png"),
  masa_alnoor:  require("@/assets/images/reaction_masa_alnoor.png"),
  hayak:        require("@/assets/images/reaction_hayak.png"),
  abqak:        require("@/assets/images/reaction_abqak.png"),
  sah_lisanak:  require("@/assets/images/reaction_sah_lisanak.png"),
  kafo:         require("@/assets/images/reaction_kafo.png"),
  maalaik_zood: require("@/assets/images/reaction_maalaik_zood.png"),
  malak_lowa:   require("@/assets/images/reaction_malak_lowa.png"),
  latoodha:     require("@/assets/images/reaction_latoodha.png"),
  eid_karrar:   require("@/assets/images/reaction_eid_karrar.png"),
};

// الأيقونات القديمة — للتوافق مع البيانات السابقة
const REACTION_EMOJIS_LEGACY: Record<string, string> = {
  clap: "👏", fire: "🔥", heart: "❤️", star: "⭐",
  laugh: "😂", wow: "😮", thinking: "🤔", sad: "😢",
  check: "✅", cross: "❌", thumbsdown: "👎", strong: "💪",
  celebrate: "🎉", love: "❤️",
};

export function ReactionMessage({ username, reactionType, createdAt, isOwnMessage }: ReactionMessageProps) {
  const timeString = new Date(createdAt).toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const imgSource = REACTION_IMAGES[reactionType];
  const legacyEmoji = REACTION_EMOJIS_LEGACY[reactionType] || "😊";

  return (
    <View className="flex-row items-center gap-1 py-0.5 px-2 justify-end">
      <View
        className={`flex-row items-center gap-1 px-2 py-1 rounded-xl ${
          isOwnMessage ? "bg-primary/20" : "bg-surface"
        }`}
      >
        {imgSource ? (
          <Image source={imgSource} style={{ width: 36, height: 36 }} resizeMode="contain" />
        ) : (
          <Text className="text-2xl">{legacyEmoji}</Text>
        )}
        <View>
          <Text className="text-xs font-semibold text-foreground">{username}</Text>
          <Text className="text-[10px] text-muted">{timeString}</Text>
        </View>
      </View>
    </View>
  );
}
