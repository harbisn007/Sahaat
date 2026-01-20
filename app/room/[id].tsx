import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Alert, FlatList } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useState, useEffect } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useUser } from "@/lib/user-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useAudioPlayerHook } from "@/hooks/use-audio-player";
import { RecordingButton } from "@/components/recording-button";
import { AudioMessage } from "@/components/audio-message";

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { username } = useUser();
  const colors = useColors();
  const roomId = parseInt(id || "0");

  const { data: roomData, isLoading, refetch } = trpc.rooms.getById.useQuery(
    { roomId },
    { enabled: roomId > 0 }
  );

  const { data: pendingRequests, refetch: refetchRequests } = trpc.rooms.getPendingRequests.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 3000 }
  );

  const respondToRequestMutation = trpc.rooms.respondToRequest.useMutation();
  const createReactionMutation = trpc.reactions.create.useMutation();

  const [userRole, setUserRole] = useState<"creator" | "player" | "viewer" | null>(null);
  const [userId] = useState(() => Math.floor(Math.random() * 1000000));
  const [recordingType, setRecordingType] = useState<"comment" | "tarouk" | null>(null);

  const { isRecording, isPreparing, startRecording, stopRecording, cancelRecording } =
    useAudioRecorder();
  const { isPlaying, currentUri, play, stop } = useAudioPlayerHook();

  const { data: audioMessages, refetch: refetchAudio } = trpc.audio.list.useQuery(
    { roomId },
    { enabled: roomId > 0, refetchInterval: 5000 }
  );

  useEffect(() => {
    if (roomData && username) {
      const participant = roomData.participants.find((p) => p.username === username);
      if (participant && participant.status === "accepted") {
        setUserRole(participant.role);
      }
    }
  }, [roomData, username]);

  const handleAcceptRequest = async (participantId: number) => {
    try {
      await respondToRequestMutation.mutateAsync({
        participantId,
        accept: true,
      });
      await refetch();
      await refetchRequests();
      Alert.alert("تم القبول", "تم قبول اللاعب بنجاح");
    } catch (error) {
      Alert.alert("خطأ", "حدث خطأ أثناء قبول الطلب");
    }
  };

  const handleRejectRequest = async (participantId: number) => {
    try {
      await respondToRequestMutation.mutateAsync({
        participantId,
        accept: false,
      });
      await refetchRequests();
      Alert.alert("تم الرفض", "تم رفض الطلب");
    } catch (error) {
      Alert.alert("خطأ", "حدث خطأ أثناء رفض الطلب");
    }
  };

  const handleStartRecording = async (type: "comment" | "tarouk") => {
    setRecordingType(type);
    const success = await startRecording();
    if (!success) {
      Alert.alert("خطأ", "فشل بدء التسجيل. تأكد من أذونات الميكروفون.");
      setRecordingType(null);
    }
  };

  const handleStopRecording = async () => {
    const recording = await stopRecording();
    if (recording && recordingType && username) {
      // In a real app, upload to S3 first
      // For now, we'll use a placeholder URL
      Alert.alert("نجاح", "تم حفظ التسجيل بنجاح");
      await refetchAudio();
    }
    setRecordingType(null);
  };

  const handleReaction = async (reactionType: string) => {
    if (!username) return;

    try {
      await createReactionMutation.mutateAsync({
        roomId,
        userId,
        username,
        reactionType: reactionType as any,
      });
    } catch (error) {
      console.error("Failed to send reaction:", error);
    }
  };

  const handlePlayAudio = (uri: string) => {
    if (currentUri === uri && isPlaying) {
      stop();
    } else {
      play(uri);
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer>
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" />
        </View>
      </ScreenContainer>
    );
  }

  if (!roomData) {
    return (
      <ScreenContainer>
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-xl text-foreground mb-4">الغرفة غير موجودة</Text>
          <TouchableOpacity
            className="bg-primary px-6 py-3 rounded-xl"
            onPress={() => router.back()}
          >
            <Text className="text-background font-semibold">العودة</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const isCreator = userRole === "creator";
  const isPlayer = userRole === "player" || isCreator;
  const isViewer = userRole === "viewer";

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="px-6 pt-4 pb-3 border-b border-border flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()} className="pr-4">
          <Text className="text-2xl text-foreground">←</Text>
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-foreground text-center">{roomData.name}</Text>
          <Text className="text-sm text-muted text-center">
            {roomData.playerCount} لاعبين · {roomData.viewerCount} مشاهدين
          </Text>
        </View>
        <View className="w-8" />
      </View>

      {/* Pending Requests (Only for creator) */}
      {isCreator && pendingRequests && pendingRequests.length > 0 && (
        <View className="px-6 py-3 bg-warning/10 border-b border-warning/30">
          {pendingRequests.map((request) => (
            <View key={request.id} className="flex-row items-center justify-between mb-2">
              <Text className="text-foreground flex-1">
                طلب انضمام من: <Text className="font-bold">{request.username}</Text>
              </Text>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="bg-success px-4 py-2 rounded-lg"
                  onPress={() => handleAcceptRequest(request.id)}
                >
                  <Text className="text-background font-semibold text-sm">قبول</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="bg-error px-4 py-2 rounded-lg"
                  onPress={() => handleRejectRequest(request.id)}
                >
                  <Text className="text-background font-semibold text-sm">رفض</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <ScrollView className="flex-1 px-6 py-4">
        {/* Role Badge */}
        <View className="items-center mb-6">
          <View
            className="px-6 py-2 rounded-full"
            style={{
              backgroundColor: isCreator
                ? colors.primary
                : isPlayer
                ? colors.success
                : colors.muted,
            }}
          >
            <Text className="text-background font-bold">
              {isCreator ? "🎮 منشئ الغرفة" : isPlayer ? "🎮 لاعب" : "👁️ مشاهد"}
            </Text>
          </View>
        </View>

        {/* Audio Messages List */}
        {audioMessages && audioMessages.length > 0 && (
          <View className="bg-surface rounded-2xl p-4 mb-4 border border-border">
            <Text className="text-lg font-bold text-foreground mb-3">الرسائل الصوتية</Text>
            {audioMessages.map((msg) => (
              <AudioMessage
                key={msg.id}
                username={msg.username}
                messageType={msg.messageType}
                duration={msg.duration}
                isPlaying={currentUri === msg.audioUrl && isPlaying}
                onPlay={() => handlePlayAudio(msg.audioUrl)}
              />
            ))}
          </View>
        )}

        {/* Audio Controls (For Players Only) */}
        {isPlayer && (
          <View className="bg-surface rounded-2xl p-6 mb-4 border border-border">
            <Text className="text-lg font-bold text-foreground mb-4 text-center">
              التحكم الصوتي
            </Text>

            <View className="gap-3">
              {/* Comment Button */}
              <RecordingButton
                isRecording={isRecording && recordingType === "comment"}
                isPreparing={isPreparing}
                label="🎤 تسجيل تعليق"
                onPress={() =>
                  isRecording && recordingType === "comment"
                    ? handleStopRecording()
                    : handleStartRecording("comment")
                }
              />

              {/* Tarouk Button */}
              <RecordingButton
                isRecording={isRecording && recordingType === "tarouk"}
                isPreparing={isPreparing}
                label="🔊 طاروق"
                onPress={() =>
                  isRecording && recordingType === "tarouk"
                    ? handleStopRecording()
                    : handleStartRecording("tarouk")
                }
                backgroundColor={colors.success}
              />

              {/* Sheeloha Button (Creator only) */}
              {isCreator && (
                <TouchableOpacity
                  className="bg-warning rounded-xl py-4 items-center"
                  onPress={() => Alert.alert("قريباً", "ميزة شيلوها قيد التطوير")}
                >
                  <Text className="text-background font-bold text-base">🔁 شيلوها</Text>
                </TouchableOpacity>
              )}

              {/* Khalloha Button (Creator only) */}
              {isCreator && (
                <TouchableOpacity
                  className="bg-error rounded-xl py-4 items-center"
                  onPress={() => {
                    stop();
                    Alert.alert("تم الإيقاف", "تم إيقاف التشغيل");
                  }}
                >
                  <Text className="text-background font-bold text-base">⏹️ خلوها</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Reactions (For Everyone) */}
        <View className="bg-surface rounded-2xl p-6 border border-border">
          <Text className="text-lg font-bold text-foreground mb-4 text-center">
            التفاعلات
          </Text>

          <View className="flex-row flex-wrap justify-center gap-3">
            {[
              { emoji: "👏", type: "clap" },
              { emoji: "😂", type: "laugh" },
              { emoji: "😮", type: "wow" },
              { emoji: "❤️", type: "love" },
              { emoji: "🔥", type: "fire" },
              { emoji: "👍", type: "thumbsup" },
              { emoji: "🤔", type: "thinking" },
              { emoji: "💖", type: "heart" },
            ].map((reaction, index) => (
              <TouchableOpacity
                key={index}
                className="w-16 h-16 bg-background rounded-2xl items-center justify-center border border-border"
                onPress={() => handleReaction(reaction.type)}
              >
                <Text className="text-3xl">{reaction.emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Participants List */}
        <View className="mt-6 bg-surface rounded-2xl p-6 border border-border">
          <Text className="text-lg font-bold text-foreground mb-4">المشاركون</Text>
          {roomData.participants
            .filter((p) => p.status === "accepted")
            .map((participant) => (
              <View key={participant.id} className="flex-row items-center justify-between py-2">
                <Text className="text-foreground">{participant.username}</Text>
                <Text className="text-muted text-sm">
                  {participant.role === "creator"
                    ? "منشئ"
                    : participant.role === "player"
                    ? "لاعب"
                    : "مشاهد"}
                </Text>
              </View>
            ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
