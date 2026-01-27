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
          const acceptedPlayersCount = await db.getAcceptedPlayersCount(room.id);
          
          return {
            ...room,
            playerCount: totalPlayerCount,
            viewerCount,
            acceptedPlayersCount,
            isRoomFull: acceptedPlayersCount >= 2,
          };
        })
      );
      
      // ترتيب الساحات حسب الأكثر تفاعلاً (مجموع اللاعبين والمشاهدين)
      const sortedRooms = roomsWithCounts.sort((a, b) => {
        const totalA = (a.playerCount || 0) + (a.viewerCount || 0);
        const totalB = (b.playerCount || 0) + (b.viewerCount || 0);
        return totalB - totalA; // ترتيب تنازلي
      });
      
      return sortedRooms;
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
        const acceptedPlayersCount = await db.getAcceptedPlayersCount(input.roomId);

        return {
          ...room,
          participants,
          playerCount: totalPlayerCount,
          viewerCount,
          acceptedPlayersCount,
          isRoomFull: acceptedPlayersCount >= 2,
        };
      }),

    // Create a new room
    create: publicProcedure
      .input(
        z.object({
          name: z.string().min(3).max(100),
          creatorId: z.number(),
          creatorName: z.string().min(3).max(50),
          creatorAvatar: z.string().default("male"),
        })
      )
      .mutation(async ({ input }) => {
        const roomId = await db.createRoom({
          name: input.name,
          creatorId: input.creatorId,
          creatorName: input.creatorName,
          creatorAvatar: input.creatorAvatar,
          isActive: "true",
        });

        // Add creator as a player
        await db.addParticipant({
          roomId: Number(roomId),
          userId: input.creatorId,
          username: input.creatorName,
          avatar: input.creatorAvatar,
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
          avatar: z.string().default("male"),
        })
      )
      .mutation(async ({ input }) => {
        // Remove any existing participant record for this user in this room
        // This ensures returning players start fresh with "pending" status
        await db.removeParticipant(input.roomId, input.userId);

        // Check if room already has 1 additional player (creator + 1 player = 2 total)
        const playerCount = await db.getPlayerCount(input.roomId);
        if (playerCount >= 1) {
          throw new Error("Room is full");
        }

        const participantId = await db.addParticipant({
          roomId: input.roomId,
          userId: input.userId,
          username: input.username,
          avatar: input.avatar,
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
          avatar: z.string().default("male"),
        })
      )
      .mutation(async ({ input }) => {
        // Remove any existing participant record for this user in this room
        await db.removeParticipant(input.roomId, input.userId);

        const participantId = await db.addParticipant({
          roomId: input.roomId,
          userId: input.userId,
          username: input.username,
          avatar: input.avatar,
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
        // Get participant info to find roomId
        const participant = await db.getParticipantById(input.participantId);
        if (!participant) {
          throw new Error("Participant not found");
        }

        if (input.accept) {
          // Accept the request
          await db.updateParticipantStatus(input.participantId, "accepted");
          
          // If accepting a player, check if we've reached the limit (2 players)
          if (participant.role === "player") {
            const acceptedPlayersCount = await db.getAcceptedPlayersCount(participant.roomId);
            
            // If we now have 2 players, reject all other pending player requests
            if (acceptedPlayersCount >= 2) {
              await db.rejectAllPendingPlayerRequests(participant.roomId);
            }
          }
        } else {
          // Reject the request - convert player to viewer
          if (participant.role === "player") {
            await db.updateParticipantRole(input.participantId, "viewer");
            await db.updateParticipantStatus(input.participantId, "accepted");
          } else {
            await db.updateParticipantStatus(input.participantId, "rejected");
          }
        }

        return { success: true };
      }),

    // Leave room (for players and viewers)
    leaveRoom: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        await db.removeParticipant(input.roomId, input.userId);
        return { success: true };
      }),

    // Delete room (for creator only)
    deleteRoom: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        // الحصول على اسم الساحة قبل الحذف
        const room = await db.getRoomById(input.roomId);
        const roomName = room?.name || "ساحة غير معروفة";
        
        await db.deleteRoom(input.roomId);
        return { success: true, roomName };
      }),

    // Get user's active room
    getUserActiveRoom: publicProcedure
      .input(
        z.object({
          creatorId: z.number(),
        })
      )
      .query(async ({ input }) => {
        const activeRoom = await db.getUserActiveRoom(input.creatorId);
        return activeRoom;
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
          audioUrl: z.string(), // Accept local URIs for now
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

  // Upload audio file
  uploadAudio: publicProcedure
    .input(
      z.object({
        base64Data: z.string(),
        fileName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { storagePut } = await import("./storage");
      
      // Convert base64 to buffer
      const buffer = Buffer.from(input.base64Data, "base64");
      
      // Generate unique file key
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);
      const fileKey = `audio/${timestamp}-${randomSuffix}-${input.fileName}`;
      
      // Upload to S3
      const { url } = await storagePut(fileKey, buffer, "audio/mp4");
      
      return { url };
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
            // الصف الأول - التفاعل الإيجابي
            "clap",
            "fire",
            "heart",
            "thumbsup",
            "star",
            // الصف الثاني - المشاعر
            "laugh",
            "wow",
            "thinking",
            "sad",
            "angry",
            // الصف الثالث - الموافقة وعدم الموافقة
            "check",
            "cross",
            "thumbsdown",
            "strong",
            "celebrate",
            // للتوافق مع القديم
            "love",
          ]),
        })
      )
      .mutation(async ({ input }) => {
        try {
          console.log("[API] Creating reaction:", input);
          const reactionId = await db.addReaction(input);
          console.log("[API] Reaction created with ID:", reactionId);
          return { reactionId };
        } catch (error) {
          console.error("[API] Failed to create reaction:", error);
          throw new Error("فشل حفظ التفاعل في قاعدة البيانات");
        }
      }),

    // Get recent reactions for a room
    getRecent: publicProcedure
      .input(z.object({ roomId: z.number(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        return db.getRecentReactions(input.roomId, input.limit);
      }),

    // List all reactions for a room
    list: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return db.getRecentReactions(input.roomId, 100);
      }),
  }),

  // Sheeloha broadcasts router
  sheeloha: router({
    // Create a sheeloha broadcast (when someone presses "شيلوها" button)
    broadcast: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.number(),
          username: z.string(),
          audioUrl: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          console.log("[API] Creating sheeloha broadcast:", input);
          const broadcastId = await db.createSheelohaBroadcast(input);
          console.log("[API] Sheeloha broadcast created with ID:", broadcastId);
          return { broadcastId };
        } catch (error) {
          console.error("[API] Failed to create sheeloha broadcast:", error);
          throw new Error("فشل بث شيلوها");
        }
      }),

    // Get recent sheeloha broadcasts for a room
    list: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return db.getRecentSheelohaBroadcasts(input.roomId, 10);
      }),
  }),

  // Khalooha commands router (stop sheeloha for all users)
  khalooha: router({
    // Create a khalooha command (when someone presses "خلوها" button)
    stop: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.number(),
          username: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          console.log("[API] Creating khalooha command:", input);
          const commandId = await db.createKhaloohaCommand(input);
          console.log("[API] Khalooha command created with ID:", commandId);
          return { commandId };
        } catch (error) {
          console.error("[API] Failed to create khalooha command:", error);
          throw new Error("فشل إيقاف شيلوها");
        }
      }),

    // Get latest khalooha command for a room
    latest: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return db.getLatestKhaloohaCommand(input.roomId);
      }),
  }),

  // Recording status router (for showing "طاروق..." indicator)
  recording: router({
    // Set recording status (start/stop)
    setStatus: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.number(),
          username: z.string(),
          isRecording: z.boolean(),
          recordingType: z.enum(["comment", "tarouk"]),
        })
      )
      .mutation(async ({ input }) => {
        try {
          console.log("[API] Setting recording status:", input);
          await db.setRecordingStatus(input);
          return { success: true };
        } catch (error) {
          console.error("[API] Failed to set recording status:", error);
          throw new Error("فشل تحديث حالة التسجيل");
        }
      }),

    // Get active recordings in a room
    getActive: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return db.getActiveRecordings(input.roomId);
      }),

    // Clear recording status
    clear: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        await db.clearRecordingStatus(input.roomId, input.userId);
        return { success: true };
      }),
  }),

  // Join requests router (for viewers requesting to become players)
  joinRequests: router({
    // Create a join request (viewer only)
    create: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.number(),
          username: z.string(),
          avatar: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const requestId = await db.createJoinRequest(input);
          return { success: true, requestId };
        } catch (error: any) {
          throw new Error(error.message || "فشل إرسال الطلب");
        }
      }),

    // Get pending requests for a room (creator only)
    getPending: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return db.getPendingJoinRequests(input.roomId);
      }),

    // Respond to a join request (creator only)
    respond: publicProcedure
      .input(
        z.object({
          requestId: z.number(),
          accept: z.boolean(),
          roomId: z.number(),
          userId: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const request = await db.respondToJoinRequest(input.requestId, input.accept);
          
          if (input.accept) {
            // Check if room has space for another player
            const acceptedCount = await db.getAcceptedPlayersCount(input.roomId);
            if (acceptedCount >= 2) {
              throw new Error("الساحة ممتلئة باللاعبين");
            }
            // Promote viewer to player (use request data for username and avatar)
            await db.promoteViewerToPlayer(input.roomId, request.userId, request.username, request.avatar);
          }
          
          return { success: true, request };
        } catch (error: any) {
          throw new Error(error.message || "فشل الرد على الطلب");
        }
      }),

    // Expire a request (auto-expire after 4 seconds)
    expire: publicProcedure
      .input(z.object({ requestId: z.number() }))
      .mutation(async ({ input }) => {
        await db.expireJoinRequest(input.requestId);
        return { success: true };
      }),
  }),

  // Kick player router (creator only)
  kick: router({
    player: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          playerId: z.number(),
          creatorId: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          await db.kickPlayer(input.roomId, input.playerId, input.creatorId);
          return { success: true };
        } catch (error: any) {
          throw new Error(error.message || "فشل طرد اللاعب");
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
