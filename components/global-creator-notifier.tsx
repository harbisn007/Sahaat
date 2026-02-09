import { useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import { useUser } from "@/lib/user-context";
import { getSocket } from "@/hooks/use-socket";

/**
 * مكون عالمي يشغل صوت الجرس عند طلب انضمام جديد لساحة المنشئ
 * يعمل خارج ساحة المنشئ فقط (يتم التحقق عبر pathname)
 * لا إشعارات - صوت جرس فقط
 * 
 * يُوضع في _layout.tsx ليبقى نشطاً دائماً
 */

// ملف صوت الجرس
const BELL_SOUND = Platform.OS !== "web" ? require("@/assets/sounds/notif3.mp3") : null;

export function GlobalCreatorNotifier() {
  const { userId } = useUser();
  const joinedChannelRef = useRef<string | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const nativePlayerRef = useRef<any>(null);
  const audioInitRef = useRef(false);

  // تهيئة الصوت مرة واحدة
  useEffect(() => {
    if (audioInitRef.current) return;
    audioInitRef.current = true;

    if (Platform.OS === "web") {
      try {
        const audio = new Audio("/sounds/notif3.mp3");
        audio.preload = "auto";
        audio.volume = 1.0;
        webAudioRef.current = audio;
        console.log("[Bell] Web audio pre-loaded");
      } catch (e) {
        console.warn("[Bell] Web audio pre-load failed:", e);
      }
    } else {
      (async () => {
        try {
          const { createAudioPlayer, AudioModule } = require("expo-audio");
          await AudioModule.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
          if (BELL_SOUND) {
            const player = createAudioPlayer(BELL_SOUND);
            player.volume = 1.0;
            nativePlayerRef.current = player;
            console.log("[Bell] Native player created");
          }
        } catch (e) {
          console.error("[Bell] Native init failed:", e);
        }
      })();
    }

    return () => {
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current = null;
      }
      if (nativePlayerRef.current) {
        try { nativePlayerRef.current.release(); } catch (e) { /* ignore */ }
        nativePlayerRef.current = null;
      }
    };
  }, []);

  // تشغيل صوت الجرس
  const playBell = useCallback(async () => {
    console.log("[Bell] === playBell called ===");
    try {
      if (Platform.OS === "web") {
        // Web: استخدام HTMLAudioElement
        let audio = webAudioRef.current;
        if (!audio) {
          audio = new Audio("/sounds/notif3.mp3");
          audio.volume = 1.0;
          webAudioRef.current = audio;
        }
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise) {
          playPromise.then(() => {
            console.log("[Bell] Web bell played OK");
          }).catch((err: any) => {
            console.warn("[Bell] Web play blocked (autoplay policy?):", err?.message);
            // Fallback: إنشاء audio جديد
            try {
              const fallback = new Audio("/sounds/notif3.mp3");
              fallback.volume = 1.0;
              fallback.play().catch(() => {});
            } catch (e2) { /* ignore */ }
          });
        }
      } else {
        // Native: استخدام expo-audio
        let player = nativePlayerRef.current;
        if (!player && BELL_SOUND) {
          const { createAudioPlayer } = require("expo-audio");
          player = createAudioPlayer(BELL_SOUND);
          player.volume = 1.0;
          nativePlayerRef.current = player;
        }
        if (player) {
          try { player.seekTo(0); } catch (e) { /* ignore */ }
          await new Promise(r => setTimeout(r, 50));
          player.play();
          console.log("[Bell] Native bell played OK");
        }
      }
    } catch (e) {
      console.error("[Bell] playBell error:", e);
    }
  }, []);

  // الاتصال بـ Socket.io والاستماع لطلبات الانضمام
  useEffect(() => {
    if (!userId) {
      console.log("[Bell] No userId yet, skipping setup");
      return;
    }

    let cleanedUp = false;
    console.log("[Bell] Setting up for userId:", userId);

    const setup = async () => {
      try {
        const socket = await getSocket();
        if (cleanedUp) return;

        // الانضمام لقناة المنشئ
        socket.emit("joinCreatorChannel", userId);
        joinedChannelRef.current = userId;
        console.log("[Bell] Joined creator channel:", userId);

        // إعادة الانضمام عند إعادة الاتصال
        const onReconnect = () => {
          if (!cleanedUp && joinedChannelRef.current) {
            socket.emit("joinCreatorChannel", joinedChannelRef.current);
            console.log("[Bell] Rejoined creator channel after reconnect");
          }
        };
        socket.on("connect", onReconnect);

        // الاستماع لطلبات الانضمام
        const onJoinRequest = (data: any) => {
          console.log("[Bell] === creatorJoinRequest received ===");
          console.log("[Bell] data:", JSON.stringify(data));
          console.log("[Bell] userId:", userId, "data.creatorId:", data?.creatorId);

          // تأكد أن الإشعار للمنشئ الحالي
          if (data?.creatorId !== userId) {
            console.log("[Bell] Not for this user, skip");
            return;
          }

          // التحقق من أن المنشئ خارج ساحته
          // نستخدم window.location.pathname على الويب
          if (Platform.OS === "web" && typeof window !== "undefined") {
            const path = window.location.pathname;
            console.log("[Bell] Current path:", path, "roomId:", data?.roomId);
            if (path === `/room/${data.roomId}`) {
              console.log("[Bell] Creator is in own room, skip bell");
              return;
            }
          }

          console.log("[Bell] Playing bell!");
          playBell();
        };

        (socket as any).on("creatorJoinRequest", onJoinRequest);

        return () => {
          socket.off("connect", onReconnect);
          (socket as any).off("creatorJoinRequest", onJoinRequest);
          if (joinedChannelRef.current) {
            socket.emit("leaveCreatorChannel", joinedChannelRef.current);
            joinedChannelRef.current = null;
          }
        };
      } catch (err) {
        console.error("[Bell] Setup failed:", err);
        return undefined;
      }
    };

    let cleanupFn: (() => void) | undefined;
    setup().then(fn => { cleanupFn = fn; });

    return () => {
      cleanedUp = true;
      if (cleanupFn) cleanupFn();
    };
  }, [userId, playBell]);

  return null;
}
