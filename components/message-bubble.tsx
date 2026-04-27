import { View, Text, TouchableOpacity, Platform, Image } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useState, useEffect, useRef, useCallback } from "react";
import { createAudioPlayer, AudioModule, AudioPlayer } from "expo-audio";
import { MaterialIcons } from "@expo/vector-icons";

interface MessageBubbleProps {
  type: "audio" | "reaction";
  username: string;
  timestamp?: string;
  // For audio messages
  messageType?: "comment" | "tarouk";
  duration?: number;
  isPlaying?: boolean;
  onPlay?: () => void;
  audioUrl?: string;
  // For reactions
  reactionType?: string;
  reactionEmoji?: string;
  // For reporting
  audioMessageId?: number;
  senderUserId?: string;
  currentUserId?: string;
  currentUsername?: string;
  onReport?: () => void;
}

// تحديث الأيقونات لتتوافق مع الـ 15 أيقونة في ReactionsPicker
const REACTION_EMOJIS: Record<string, string> = {
  clap: "👏",
  fire: "🔥",
  heart: "❤️",
  thumbsup: "👍",
  star: "⭐",
  laugh: "😂",
  wow: "😮",
  thinking: "🤔",
  sad: "😢",
  angry: "😡",
  check: "✅",
  cross: "❌",
  thumbsdown: "👎",
  strong: "💪",
  celebrate: "🎉",
  love: "❤️",
};

export function MessageBubble({
  type,
  username,
  timestamp,
  messageType,
  duration,
  isPlaying,
  onPlay,
  audioUrl,
  reactionType,
  reactionEmoji,
  audioMessageId,
  senderUserId,
  currentUserId,
  currentUsername,
  onReport,
}: MessageBubbleProps) {
  const colors = useColors();
  const [localPlaying, setLocalPlaying] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);

  // تنظيف عند unmount
  useEffect(() => {
    return () => {
      if (Platform.OS === "web") {
        if (webAudioRef.current) {
          try { webAudioRef.current.pause(); webAudioRef.current.src = ""; } catch {}
          webAudioRef.current = null;
        }
      } else {
        if (playerRef.current) {
          try { playerRef.current.pause(); playerRef.current.release(); } catch {}
          playerRef.current = null;
        }
      }
    };
  }, []);

  // تنظيف player الحالي
  const cleanupPlayer = useCallback(() => {
    if (Platform.OS === "web") {
      if (webAudioRef.current) {
        try { webAudioRef.current.pause(); webAudioRef.current.src = ""; } catch {}
        webAudioRef.current = null;
      }
    } else {
      if (playerRef.current) {
        try { playerRef.current.pause(); playerRef.current.release(); } catch {}
        playerRef.current = null;
      }
    }
  }, []);

  // تشغيل/إيقاف محلي
  const handleLocalPlay = useCallback(async () => {
    if (!audioUrl) return;
    
    if (localPlaying) {
      cleanupPlayer();
      setLocalPlaying(false);
      return;
    }

    try {
      cleanupPlayer();

      if (Platform.OS === "web") {
        const audio = new Audio(audioUrl);
        audio.volume = 1.0;
        webAudioRef.current = audio;
        audio.onended = () => {
          setLocalPlaying(false);
          webAudioRef.current = null;
        };
        audio.onerror = () => {
          setLocalPlaying(false);
          webAudioRef.current = null;
        };
        await audio.play();
        setLocalPlaying(true);
      } else {
        try {
          await AudioModule.setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: false,
          });
        } catch (e) {
          console.warn("[MessageBubble] Failed to set audio mode:", e);
        }

        const player = createAudioPlayer(audioUrl);
        playerRef.current = player;
        player.volume = 1.0;

        let hasEnded = false;
        player.addListener("playbackStatusUpdate", (status) => {
          if (hasEnded) return;
          if (status.isLoaded && !status.playing && status.currentTime > 0) {
            if (status.duration > 0 && status.currentTime >= status.duration - 0.1) {
              hasEnded = true;
              setLocalPlaying(false);
              try { player.release(); } catch {}
              playerRef.current = null;
            }
          }
        });

        await new Promise(r => setTimeout(r, 300));
        
        if (playerRef.current) {
          player.play();
          setLocalPlaying(true);
        }
      }
    } catch (err) {
      console.error("[MessageBubble] Local play error:", err);
      setLocalPlaying(false);
    }
  }, [audioUrl, localPlaying, cleanupPlayer]);

  if (type === "reaction") {
    const emoji = reactionEmoji || (reactionType ? REACTION_EMOJIS[reactionType] : "❓");
    
    return (
      <View className="px-4 py-2 items-center">
        <View 
          className="flex-row items-center gap-2 px-4 py-2 rounded-full"
          style={{ backgroundColor: colors.surface }}
        >
          <Text className="text-sm text-muted">{username}</Text>
          <Text className="text-2xl">{emoji}</Text>
        </View>
      </View>
    );
  }

  // Audio message bubble
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <View className="px-2 py-0.5 items-start">
      <View 
        className="rounded-lg px-2 py-1 max-w-[90%]"
        style={{ backgroundColor: colors.surface }}
      >
        {/* الاسم فوق مربع التشغيل — ضغط مطوّل للإبلاغ */}
        <View style={{ alignItems: 'center', marginBottom: 2 }}>
          <TouchableOpacity
            onLongPress={() => onReport?.()}
            delayLongPress={500}
            activeOpacity={0.7}
          >
            <Text style={{ color: '#d4af37', fontSize: 10, fontWeight: 'bold', textAlign: 'center' }} numberOfLines={1}>{username}</Text>
          </TouchableOpacity>
          {/* صف المشغّل: أيقونة النوع + المدة + زر التشغيل */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4 }}>
            {/* Message Type Icon */}
            {messageType === "tarouk" && (
              <Image source={{ uri: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663292181877/uURwTXggQbeLjyfZ.png" }} style={{ width: 14, height: 14 }} resizeMode="contain" />
            )}
            {messageType === "comment" && (
              <MaterialIcons name="mic" size={14} color={colors.primary} />
            )}
            {/* Duration */}
            <Text className="text-[10px] text-muted font-mono">
              {formatDuration(duration || 0)}
            </Text>
            {/* زر تشغيل/إيقاف محلي */}
            {audioUrl && (messageType === "comment" || messageType === "tarouk") && (
              <TouchableOpacity
                onPress={handleLocalPlay}
                style={{ padding: 2 }}
                activeOpacity={0.6}
              >
                <MaterialIcons 
                  name={localPlaying ? "pause-circle-filled" : "play-circle-filled"} 
                  size={20} 
                  color={messageType === "tarouk" ? colors.success : colors.primary} 
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}
