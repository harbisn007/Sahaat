import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { checkActiveBan } from "../db";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router = t.router;

// ============ Ban Check Middleware ============
const checkBanMiddleware = t.middleware(async ({ ctx, next, rawInput }) => {
  let userId: string | undefined;

  if (ctx.user?.openId) {
    userId = ctx.user.openId;
  }

  if (!userId && rawInput && typeof rawInput === "object") {
    const input = rawInput as any;
    userId = input.userId || input.creatorId;
  }

  if (!userId) return next();

  try {
    const banStatus = await checkActiveBan(userId);
    if (banStatus.isBanned) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: JSON.stringify({
          type: "USER_BANNED",
          banType: banStatus.banType,
          expiresAt: banStatus.expiresAt,
        }),
      });
    }
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    console.warn(`[checkBan] Error checking ban for ${userId}:`, err);
  }

  return next();
});

export const publicProcedure = t.procedure.use(checkBanMiddleware);

const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser).use(checkBanMiddleware);

export const adminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || ctx.user.role !== "admin")
      throw new TRPCError({ code: "FORBIDDEN" });
    return next({ ctx: { ...ctx, user: ctx.user } });
  })
);
