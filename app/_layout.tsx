import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { UserProvider } from "@/lib/user-context";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { GlobalCreatorNotifier } from "@/components/global-creator-notifier";
import { useCreatorBell } from "@/hooks/use-creator-bell";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SplashScreen } from "@/components/splash-screen";
import { useUser } from "@/lib/user-context";
import { getSocket } from "@/hooks/use-socket";

function CreatorBellListener() {
  useCreatorBell();
  const { userId } = useUser();
  
  useEffect(() => {
    if (!userId) return;
    const setupSocket = async () => {
      const socket = await getSocket();
      if (!socket) return;
      socket.emit('joinUserChannel', userId);
      // Socket listener للجرس الفوري
      socket.on('creatorJoinRequest', () => {
        console.log('[CreatorBellListener] Received creatorJoinRequest event');
      });
    };
    setupSocket();
  }, [userId]);
  
  return null;
}

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

function RootLayoutInner() {
  const [showSplash, setShowSplash] = useState(true);

  const { data: top10Rooms } = trpc.top10.list.useQuery(undefined, {
    enabled: showSplash,
  });
  const { data: pendingInvitesData } = trpc.publicInvitations.getPending.useQuery(
    { limit: 50 },
    { enabled: showSplash }
  );

  // اخفِ الشاشة عند اكتمال البيانات
  useEffect(() => {
    if (top10Rooms && pendingInvitesData) {
      setShowSplash(false);
    }
  }, [top10Rooms, pendingInvitesData]);

  // حد أقصى 4 ثوانٍ
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return <SplashScreen />;
  }

  return (
    <KeyboardProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="oauth/callback" />
        </Stack>
        <GlobalCreatorNotifier />
        <CreatorBellListener />
        <StatusBar style="auto" />
      </GestureHandlerRootView>
    </KeyboardProvider>
  );
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  useEffect(() => {
    initManusRuntime();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const shouldOverrideSafeArea = Platform.OS === "web";

  const inner = (
    <ThemeProvider>
      <UserProvider>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            {shouldOverrideSafeArea ? (
              <SafeAreaProvider initialMetrics={providerInitialMetrics}>
                <SafeAreaFrameContext.Provider value={frame}>
                  <SafeAreaInsetsContext.Provider value={insets}>
                    <RootLayoutInner />
                  </SafeAreaInsetsContext.Provider>
                </SafeAreaFrameContext.Provider>
              </SafeAreaProvider>
            ) : (
              <SafeAreaProvider initialMetrics={providerInitialMetrics}>
                <RootLayoutInner />
              </SafeAreaProvider>
            )}
          </QueryClientProvider>
        </trpc.Provider>
      </UserProvider>
    </ThemeProvider>
  );

  return inner;
}
