import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import { Alert } from "react-native";
import { router as expoRouter } from "expo-router";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import * as Api from "@/lib/_core/api";

export const trpc = createTRPCReact<AppRouter>();

// ============ معالج الحظر ============
// لو أي طلب رد FORBIDDEN مع USER_BANNED → نطرد المستخدم فوراً
let isHandlingBan = false;

async function handleBanError(error: unknown): Promise<boolean> {
  if (!(error instanceof TRPCClientError)) return false;
  if (error.data?.code !== "FORBIDDEN") return false;

  let banInfo: { type: string; banType?: string; expiresAt?: Date } | null = null;
  try {
    banInfo = JSON.parse(error.message);
  } catch {
    return false;
  }

  if (banInfo?.type !== "USER_BANNED") return false;

  if (isHandlingBan) return true;
  isHandlingBan = true;

  try {
    // تسجيل الخروج
    await Api.logout().catch(() => {});
    await Auth.removeSessionToken().catch(() => {});
    await Auth.clearUserInfo().catch(() => {});

    const banTypeText =
      banInfo.banType === "permanent" ? "دائماً" :
      banInfo.banType === "24h" ? "لمدة 24 ساعة" :
      banInfo.banType === "1h" ? "لمدة ساعة" : "";

    Alert.alert(
      "تم حظرك",
      `تم حظر حسابك ${banTypeText} من قبل الإدارة.`,
      [{ text: "حسناً", onPress: () => { expoRouter.replace("/welcome"); } }],
      { cancelable: false }
    );
  } finally {
    setTimeout(() => { isHandlingBan = false; }, 1000);
  }

  return true;
}

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrl()}/api/trpc`,
        transformer: superjson,
        async headers() {
          const token = await Auth.getSessionToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        async fetch(url, options) {
          const response = await fetch(url, { ...options, credentials: "include" });

          if (!response.ok && response.status === 403) {
            try {
              const cloned = response.clone();
              const body = await cloned.json();
              const errors = Array.isArray(body) ? body : [body];
              for (const item of errors) {
                const errData = item?.error?.json;
                if (errData?.code === "FORBIDDEN" && errData?.message) {
                  try {
                    const parsed = JSON.parse(errData.message);
                    if (parsed.type === "USER_BANNED") {
                      await handleBanError(
                        new TRPCClientError(errData.message, { result: { error: errData } })
                      );
                      break;
                    }
                  } catch {}
                }
              }
            } catch {}
          }

          return response;
        },
      }),
    ],
  });
}

export { handleBanError };
