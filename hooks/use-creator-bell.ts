import { useEffect, useRef, useCallback } from "react";
import { Platform, AppState, type AppStateStatus } from "react-native";
import { trpc } from "@/lib/trpc";
import { useUser } from "@/lib/user-context";

/**
 * Hook بسيط لتشغيل صوت الجرس عند تغير عداد طلبات الانضمام
 * 
 * المنطق:
 * - يراقب pendingRequestsCount من getUserActiveRoom (polling كل 3 ثواني)
 * - عندما يتغير العداد ويكون أكبر من 0 → يشغل صوت الجرس
 * - يعمل في أي مكان بالتطبيق (داخل/خارج الساحة)
 * - لا يشغل الصوت إذا كان التطبيق في الخلفية (يتجاهل التغييرات)
 * - عند العودة من الخلفية يُحدّث العداد بدون تشغيل صوت
 */
export function useCreatorBell() {
  const { userId } = useUser();
  const prevCountRef = useRef<number>(0);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const nativePlayerRef = useRef<any>(null);
  const hasInteractedRef = useRef(false);
  // تتبع حالة التطبيق (foreground/background)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  // علامة لتجاهل أول تحديث بعد العودة من الخلفية
  const justResumedRef = useRef(false);

  // مراقبة حالة التطبيق (foreground/background)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const wasBackground = appStateRef.current !== "active";
      const isNowActive = nextAppState === "active";
      
      if (wasBackground && isNowActive) {
        // العودة من الخلفية - تجاهل أي تغييرات في العداد حتى يتم التحديث
        console.log("[CreatorBell] App resumed from background - will skip next count change");
        justResumedRef.current = true;
      }
      
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, []);

  // جلب بيانات الساحة النشطة مع polling
  const { data: activeRoom } = trpc.rooms.getUserActiveRoom.useQuery(
    { creatorId: userId || "" },
    { 
      enabled: !!userId,
      refetchInterval: 3000, // polling كل 3 ثواني
    }
  );

  // تسجيل أول تفاعل للمستخدم (مطلوب لتشغيل الصوت على الويب)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    
    const markInteracted = () => {
      hasInteractedRef.current = true;
      // تحميل الصوت مسبقاً عند أول تفاعل
      if (!webAudioRef.current) {
        try {
          const audio = new Audio("/sounds/notif3.mp3");
          audio.preload = "auto";
          audio.volume = 1.0;
          webAudioRef.current = audio;
          // تشغيل صامت لفتح قفل الصوت
          audio.volume = 0;
          audio.play().then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = 1.0;
            console.log("[CreatorBell] Web audio unlocked");
          }).catch(() => {});
        } catch (e) {
          console.warn("[CreatorBell] Failed to pre-load:", e);
        }
      }
    };

    document.addEventListener("click", markInteracted, { once: true });
    document.addEventListener("touchstart", markInteracted, { once: true });
    
    return () => {
      document.removeEventListener("click", markInteracted);
      document.removeEventListener("touchstart", markInteracted);
    };
  }, []);

  // تهيئة Native audio
  useEffect(() => {
    if (Platform.OS === "web") return;

    const init = async () => {
      try {
        const { createAudioPlayer, AudioModule } = require("expo-audio");
        await AudioModule.setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
        });
        const bellAsset = require("@/assets/sounds/notif3.mp3");
        const player = createAudioPlayer(bellAsset);
        player.volume = 1.0;
        nativePlayerRef.current = player;
        console.log("[CreatorBell] Native player ready");
      } catch (e) {
        console.error("[CreatorBell] Native init error:", e);
      }
    };
    init();

    return () => {
      if (nativePlayerRef.current) {
        try { nativePlayerRef.current.release(); } catch (e) {}
        nativePlayerRef.current = null;
      }
    };
  }, []);

  // تشغيل صوت الجرس
  const playBell = useCallback(async () => {
    console.log("[CreatorBell] === Playing bell ===");
    try {
      if (Platform.OS === "web") {
        // Web: HTMLAudioElement
        if (webAudioRef.current) {
          webAudioRef.current.currentTime = 0;
          webAudioRef.current.volume = 1.0;
          await webAudioRef.current.play();
          console.log("[CreatorBell] Web bell played OK");
        } else {
          // إنشاء instance جديد
          const audio = new Audio("/sounds/notif3.mp3");
          audio.volume = 1.0;
          webAudioRef.current = audio;
          await audio.play();
          console.log("[CreatorBell] Web bell played (new)");
        }
      } else {
        // Native: expo-audio
        const player = nativePlayerRef.current;
        if (player) {
          try { player.seekTo(0); } catch (e) {}
          await new Promise(resolve => setTimeout(resolve, 50));
          player.play();
          console.log("[CreatorBell] Native bell played OK");
        } else {
          // إعادة إنشاء player
          const { createAudioPlayer } = require("expo-audio");
          const bellAsset = require("@/assets/sounds/notif3.mp3");
          const newPlayer = createAudioPlayer(bellAsset);
          newPlayer.volume = 1.0;
          nativePlayerRef.current = newPlayer;
          await new Promise(resolve => setTimeout(resolve, 100));
          newPlayer.play();
          console.log("[CreatorBell] Native bell played (new player)");
        }
      }
    } catch (error) {
      console.error("[CreatorBell] Error playing bell:", error);
    }
  }, []);

  // مراقبة تغير العداد
  useEffect(() => {
    const currentCount = activeRoom?.pendingRequestsCount || 0;
    const prevCount = prevCountRef.current;

    console.log(`[CreatorBell] Count check: prev=${prevCount}, current=${currentCount}, appState=${appStateRef.current}`);

    // إذا كان التطبيق في الخلفية - تحديث العداد فقط بدون صوت
    if (appStateRef.current !== "active") {
      console.log("[CreatorBell] App in background - updating count silently");
      prevCountRef.current = currentCount;
      return;
    }

    // إذا عاد التطبيق للتو من الخلفية - تحديث العداد بدون صوت (مرة واحدة)
    if (justResumedRef.current) {
      console.log("[CreatorBell] Just resumed from background - updating count silently");
      justResumedRef.current = false;
      prevCountRef.current = currentCount;
      return;
    }

    // شغّل الجرس إذا تغير العداد وأصبح أكبر من 0 (والتطبيق في المقدمة)
    if (currentCount > 0 && currentCount !== prevCount) {
      console.log(`[CreatorBell] Count changed ${prevCount} -> ${currentCount}, playing bell!`);
      playBell();
    }

    prevCountRef.current = currentCount;
  }, [activeRoom?.pendingRequestsCount, playBell]);
}
