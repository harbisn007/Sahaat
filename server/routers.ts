import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Rooms router
  rooms: router({
    // Get all active rooms
    list: publicProcedure.query(async () => {
      const rooms = await db.getAllRooms();
      
      // Get participant counts for each room
      const roomsWithCounts = await Promise.all(
        rooms.map(async (room) => {
          const totalPlayerCount = await db.getTotalPlayerCount(room.id);
          const viewerCount = await db.getViewerCount(room.id);
          
          return {
            ...room,
            playerCount: totalPlayerCount,
            viewerCount,
          };
        })
      );
      
      return roomsWithCounts;
    }),

    // Get room by ID with participants
    getById: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        const room = await db.getRoomById(input.roomId);
        if (!room) {
          throw new Error("Room not found");
        }

        const participants = await db.getRoomParticipants(input.roomId);
        const totalPlayerCount = await db.getTotalPlayerCount(input.roomId);
        const viewerCount = await db.getViewerCount(input.roomId);

        return {
          ...room,
          participants,
          playerCount: totalPlayerCount,
          viewerCount,
        };
      }),

    // Create a new room
    create: publicProcedure
      .input(
        z.object({
          name: z.string().min(3).max(100),
          creatorId: z.number(),
          creatorName: z.string().min(3).max(50),
        })
      )
      .mutation(async ({ input }) => {
        const roomId = await db.createRoom({
          name: input.name,
          creatorId: input.creatorId,
          creatorName: input.creatorName,
          isActive: "true",
        });

        // Add creator as a player
        await db.addParticipant({
          roomId: Number(roomId),
          userId: input.creatorId,
          username: input.creatorName,
          role: "creator",
          status: "accepted",
        });

        return { roomId };
      }),

    // Request to join as player
    requestJoinAsPlayer: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.number(),
          username: z.string().min(3).max(50),
        })
      )
      .mutation(async ({ input }) => {
        // Check if room already has 1 additional player (creator + 1 player = 2 total)
        const playerCount = await db.getPlayerCount(input.roomId);
        if (playerCount >= 1) {
          throw new Error("Room is full");
        }

        const participantId = await db.addParticipant({
          roomId: input.roomId,
          userId: input.userId,
          username: input.username,
          role: "player",
          status: "pending",
        });

        return { participantId };
      }),

    // Join as viewer (direct, no approval needed)
    joinAsViewer: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.number(),
          username: z.string().min(3).max(50),
        })
      )
      .mutation(async ({ input }) => {
        const participantId = await db.addParticipant({
          roomId: input.roomId,
          userId: input.userId,
          username: input.username,
          role: "viewer",
          status: "accepted",
        });

        return { participantId };
      }),

    // Get pending player requests for a room
    getPendingRequests: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return db.getPendingPlayerRequests(input.roomId);
      }),

    // Accept or reject player request
    respondToRequest: publicProcedure
      .input(
        z.object({
          participantId: z.number(),
          accept: z.boolean(),
        })
      )
      .mutation(async ({ input }) => {
        const status = input.accept ? "accepted" : "rejected";
        await db.updateParticipantStatus(input.participantId, status);
        return { success: true };
      }),
  }),

  // Audio messages router
  audio: router({
    // Get all audio messages for a room
    list: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return db.getRoomAudioMessages(input.roomId);
      }),

    // Add a new audio message
    create: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.number(),
          username: z.string(),
          messageType: z.enum(["comment", "tarouk"]),
          audioUrl: z.string().url(),
          duration: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        const messageId = await db.addAudioMessage(input);
        return { messageId };
      }),

    // Get last tarouk message
    getLastTarouk: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return db.getLastTaroukMessage(input.roomId);
      }),
  }),

  // Reactions router
  reactions: router({
    // Add a reaction
    create: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.number(),
          username: z.string(),
          reactionType: z.enum([
            "clap",
            "laugh",
            "wow",
            "love",
            "fire",
            "thumbsup",
            "thinking",
            "heart",
          ]),
        })
      )
      .mutation(async ({ input }) => {
        const reactionId = await db.addReaction(input);
        return { reactionId };
      }),

    // Get recent reactions for a room
    getRecent: publicProcedure
      .input(z.object({ roomId: z.number(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        return db.getRecentReactions(input.roomId, input.limit);
      }),
  }),
});

export type AppRouter = typeof appRouter;
