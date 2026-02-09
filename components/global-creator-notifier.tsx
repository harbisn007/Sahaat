import { useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { usePathname } from "expo-router";
import { useUser } from "@/lib/user-context";
import { useNotificationBell } from "@/hooks/use-notification-bell";
import { getSocket } from "@/hooks/use-socket";

/**
 * مكون عالمي يستمع لإشعارات طلبات الانضمام للمنشئ
 * يعمل في جميع الصفحات ويشغل صوت الجرس فقط عندما يكون المنشئ خارج ساحته
 * يُوضع في _layout.tsx ليبقى نشطاً دائماً
 * 
 * يستخدم نفس الـ singleton socket من use-socket.ts لضمان الاتصال الصحيح
 * لا يستخدم أي نظام إشعارات - فقط صوت محلي
 */
export function GlobalCreatorNotifier() {
  const { userId } = useUser();
  const pathname = usePathname();
  const { playBell } = useNotificationBell();
  const pathnameRef = useRef(pathname);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const joinedChannelRef = useRef<string | null>(null);

  // تحديث المسار الحالي في ref لاستخدامه في callback
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // مراقبة حالة التطبيق (foreground/background)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, []);

  // التحقق مما إذا كان المنشئ داخل ساحته
  const isCreatorInOwnRoom = useCallback((roomId: number): boolean => {
    const currentPath = pathnameRef.current;
    // المسار يكون مثل /room/123
    if (currentPath && currentPath.startsWith("/room/")) {
      const currentRoomId = parseInt(currentPath.split("/")[2], 10);
      return currentRoomId === roomId;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!userId) return;

    let cleanedUp = false;

    const setup = async () => {
      try {
        const socket = await getSocket();
        if (cleanedUp) return;

        console.log("[GlobalNotifier] Using shared socket, joining creator channel for:", userId);
        
        // الانضمام لقناة المنشئ
        socket.emit("joinCreatorChannel", userId);
        joinedChannelRef.current = userId;

        // إعادة الانضمام عند إعادة الاتصال
        const handleReconnect = () => {
          if (!cleanedUp && joinedChannelRef.current) {
            console.log("[GlobalNotifier] Reconnected, rejoining creator channel for:", joinedChannelRef.current);
            socket.emit("joinCreatorChannel", joinedChannelRef.current);
          }
        };
        socket.on("connect", handleReconnect);

        // الاستماع لطلبات الانضمام
        const handleCreatorJoinRequest = (data: {
          roomId: number;
          creatorId: string;
          requestType: string;
          requesterId: string;
          requesterName: string;
        }) => {
          console.log("[GlobalNotifier] Received creatorJoinRequest:", JSON.stringify(data));
          
          // تأكد أن الإشعار للمنشئ الحالي
          if (data.creatorId !== userId) return;

          // لا تشغل الجرس إذا كان المنشئ داخل ساحته
          if (isCreatorInOwnRoom(data.roomId)) {
            console.log("[GlobalNotifier] Creator is in own room, skipping bell");
            return;
          }

          console.log("[GlobalNotifier] Creator is NOT in own room, playing bell!");
          playBell();
        };

        // استخدام on مباشرة - الـ socket يدعم أي حدث
        (socket as any).on("creatorJoinRequest", handleCreatorJoinRequest);

        // حفظ cleanup handlers
        return () => {
          socket.off("connect", handleReconnect);
          (socket as any).off("creatorJoinRequest", handleCreatorJoinRequest);
          if (joinedChannelRef.current) {
            socket.emit("leaveCreatorChannel", joinedChannelRef.current);
            joinedChannelRef.current = null;
          }
        };
      } catch (error) {
        console.error("[GlobalNotifier] Failed to setup:", error);
        return undefined;
      }
    };

    let cleanupFn: (() => void) | undefined;
    setup().then((fn) => {
      cleanupFn = fn;
    });

    return () => {
      cleanedUp = true;
      if (cleanupFn) cleanupFn();
    };
  }, [userId, playBell, isCreatorInOwnRoom]);

  // هذا المكون لا يعرض شيئاً
  return null;
}
