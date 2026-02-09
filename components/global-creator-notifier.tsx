import { useEffect, useRef, useCallback } from "react";
import { Platform, AppState, AppStateStatus } from "react-native";
import { usePathname } from "expo-router";
import { io, Socket } from "socket.io-client";
import { getApiBaseUrl } from "@/constants/oauth";
import { useUser } from "@/lib/user-context";
import { useNotificationBell } from "@/hooks/use-notification-bell";

function getServerUrl(): string {
  const baseUrl = getApiBaseUrl();
  if (baseUrl) return baseUrl;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const host = window.location.hostname;
    const apiHost = host.replace(/^8081-/, "3000-");
    return `${protocol}//${apiHost}`;
  }
  return "http://127.0.0.1:3000";
}

/**
 * مكون عالمي يستمع لإشعارات طلبات الانضمام للمنشئ
 * يعمل في جميع الصفحات ويشغل صوت الجرس فقط عندما يكون المنشئ خارج ساحته
 * يُوضع في _layout.tsx ليبقى نشطاً دائماً
 * 
 * لا يستخدم أي نظام إشعارات - فقط صوت محلي
 */
export function GlobalCreatorNotifier() {
  const { userId } = useUser();
  const pathname = usePathname();
  const { playBell } = useNotificationBell();
  const socketRef = useRef<Socket | null>(null);
  const pathnameRef = useRef(pathname);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

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

    const serverUrl = getServerUrl();
    const socket = io(serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[GlobalNotifier] Connected, joining creator channel for:", userId);
      socket.emit("joinCreatorChannel", userId);
    });

    socket.on("creatorJoinRequest", (data: {
      roomId: number;
      creatorId: string;
      requestType: string;
      requesterId: string;
      requesterName: string;
    }) => {
      console.log("[GlobalNotifier] Received creatorJoinRequest:", data);
      
      // تأكد أن الإشعار للمنشئ الحالي
      if (data.creatorId !== userId) return;

      // لا تشغل الجرس إذا كان المنشئ داخل ساحته
      if (isCreatorInOwnRoom(data.roomId)) {
        console.log("[GlobalNotifier] Creator is in own room, skipping bell");
        return;
      }

      console.log("[GlobalNotifier] Creator is NOT in own room, playing bell");

      // تشغيل صوت الجرس المحلي فقط - بدون أي إشعارات
      playBell();
    });

    return () => {
      if (socket) {
        socket.emit("leaveCreatorChannel", userId);
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [userId, playBell, isCreatorInOwnRoom]);

  // هذا المكون لا يعرض شيئاً
  return null;
}
