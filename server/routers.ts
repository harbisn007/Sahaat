import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import {
  emitRoomUpdated,
  emitRoomDeleted,
  emitParticipantJoined,
  emitParticipantLeft,
  emitJoinRequestCreated,
  emitJoinRequestResponded,
  emitAudioMessageCreated,
  emitReactionCreated,
  emitRecordingStatusChanged,
  emitSheelohaBroadcast,
  emitKhaloohaCommand,
  emitStopAndPlayNewSheeloha,
  emitPublicInviteCreated,
  emitPublicInviteExpired,
  getOnlineUsersCount,
  getActiveUsersCount,
  recordUserActivity,
  emitSufoofSoundUpdated,
  emitPlaySufoofSheeloha,
  emitPlayAudioMessage,
  emitCreatorJoinRequest,
} from "./_core/socket";
// تم إلغاء معالجة الجوقة - الصوت الأصلي يُستخدم دائماً

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
    // Get rooms with pagination - محسّن للتوسع
    list: publicProcedure
      .input(z.object({ 
        page: z.number().default(1),
        limit: z.number().default(20)
      }).optional())
      .query(async ({ input }) => {
        const page = input?.page || 1;
        const limit = input?.limit || 20;
        return db.getRoomsWithPagination(page, limit);
      }),

    // Get room by ID with participants - محسّن لاستخدام استعلامين فقط
    getById: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        // استخدام الدالة المحسّنة التي تجلب كل شيء في استعلامين
        return db.getRoomWithAllData(input.roomId);
      }),

    // Create a new room
    create: publicProcedure
      .input(
        z.object({
          name: z.string().min(3).max(100),
          creatorId: z.string(),
          creatorName: z.string().min(3).max(50),
          creatorAvatar: z.string().default("male"),
        })
      )
      .mutation(async ({ input }) => {
        // حذف أي ساحة قديمة لنفس المنشئ قبل إنشاء ساحة جديدة
        // هذا يمنع وجود ساحات يتيمة عند حذف التطبيق وإعادة تثبيته
        const existingRoom = await db.getUserActiveRoom(input.creatorId);
        if (existingRoom) {
          console.log(`[Rooms] Deleting old room ${existingRoom.id} for creator ${input.creatorId} before creating new one`);
          emitRoomDeleted(existingRoom.id, existingRoom.name);
          await db.deleteRoom(existingRoom.id);
        }

        const roomId = await db.createRoom({
          name: input.name,
          creatorId: input.creatorId,
          creatorName: input.creatorName,
          creatorAvatar: input.creatorAvatar,
          isActive: "true",
          createdAt: new Date(), // ضبط وقت الإنشاء صراحةً
          lastPlayerLeftAt: null, // إعادة ضبط وقت خروج اللاعب
          extensionLostAt: null, // إعادة ضبط وقت فقدان التمديد
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
          userId: z.string(),
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

        // إرسال إشعار للمنشئ عبر قناته الخاصة (طلب انضمام كلاعب)
        const room = await db.getRoomById(input.roomId);
        if (room) {
          emitCreatorJoinRequest(
            input.roomId,
            room.creatorId,
            "player",
            input.userId,
            input.username
          );
        }

        // حذف تلقائي بعد 15 ثانية من الإنشاء (تحويل لمشاهد)
        setTimeout(async () => {
          try {
            const participant = await db.getParticipantById(participantId);
            if (participant && participant.status === "pending") {
              console.log(`[AutoExpire] Auto-expiring player request ${participantId} after 15s`);
              // تحويل اللاعب المعلق إلى مشاهد (نفس منطق الرفض)
              await db.updateParticipantRole(participantId, "viewer");
              await db.updateParticipantStatus(participantId, "accepted");
              emitRoomUpdated(input.roomId);
            }
          } catch (e) {
            console.warn(`[AutoExpire] Error expiring player request ${participantId}:`, e);
          }
        }, 15000);

        return { participantId };
      }),

    // Join as viewer (direct, no approval needed)
    joinAsViewer: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.string(),
          username: z.string().min(3).max(50),
          avatar: z.string().default("male"),
        })
      )
      .mutation(async ({ input }) => {
        // التحقق من أن المستخدم ليس منشئ الساحة
        const room = await db.getRoomById(input.roomId);
        if (room && room.creatorId === input.userId) {
          throw new Error("لا يمكنك الدخول كمشاهد في ساحتك");
        }
        
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

        // التحقق من منح النجمة الذهبية (إذا تجاوز عدد المشاهدين 20)
        await db.checkAndAwardGoldStar(input.roomId);

        // إرسال إشعار للمنشئ عبر قناته الخاصة (دخول مستمع)
        if (room) {
          emitCreatorJoinRequest(
            input.roomId,
            room.creatorId,
            "viewer",
            input.userId,
            input.username
          );
        }

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

        // بث الرد على طلب الانضمام لقناة المستخدم الشخصية
        emitJoinRequestResponded(
          participant.roomId,
          input.participantId,
          input.accept,
          participant.userId
        );
        
        // بث تحديث الساحة لجميع المشاركين
        emitRoomUpdated(participant.roomId);
        
        return { success: true };
      }),

    // Leave room (for players and viewers)
    leaveRoom: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.string(),
          role: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await db.removeParticipant(input.roomId, input.userId);
        
        // تحديث وقت خروج آخر لاعب (لحساب مدة الحذف التلقائي)
        if (input.role === "player") {
          await db.updateLastPlayerLeftTime(input.roomId);
        }
        
        // بث مغادرة المشارك لجميع المشاركين
        emitParticipantLeft(input.roomId, input.userId);
        emitRoomUpdated(input.roomId);
        
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
        
        // بث حذف الساحة لجميع المشاركين قبل الحذف
        emitRoomDeleted(input.roomId, roomName);
        
        await db.deleteRoom(input.roomId);
        return { success: true, roomName };
      }),

    // Get user's active room
    getUserActiveRoom: publicProcedure
      .input(
        z.object({
          creatorId: z.string(),
        })
      )
      .query(async ({ input }) => {
        const activeRoom = await db.getUserActiveRoom(input.creatorId);
        return activeRoom;
      }),

    // Get room control state (taroukController + clappingDelay)
    getControlState: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return db.getRoomControlState(input.roomId);
      }),

    // Update tarouk controller
    setTaroukController: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          controller: z.enum(["creator", "player1", "player2"]).nullable(),
        })
      )
      .mutation(async ({ input }) => {
        await db.updateTaroukController(input.roomId, input.controller);
        // بث التغيير لجميع المشاركين
        emitRoomUpdated(input.roomId);
        return { success: true };
      }),

    // Update clapping delay
    setClappingDelay: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          delay: z.number().min(0.05).max(1.5),
        })
      )
      .mutation(async ({ input }) => {
        await db.updateClappingDelay(input.roomId, input.delay);
        // بث التغيير لجميع المشاركين
        emitRoomUpdated(input.roomId);
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
          userId: z.string(),
          username: z.string(),
          messageType: z.enum(["comment", "tarouk"]),
          audioUrl: z.string(),
          sheelohaUrl: z.string().optional(), // رابط ملف الشيلوها المدمج (للطاروق فقط)
          duration: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        console.log(`[audio.create] ========== NEW AUDIO MESSAGE ==========`);
        console.log(`[audio.create] Type: ${input.messageType}`);
        console.log(`[audio.create] Audio URL: ${input.audioUrl}`);
        console.log(`[audio.create] Sheeloha URL: ${input.sheelohaUrl || 'NONE - NO SHEELOHA'}`);
        console.log(`[audio.create] Duration: ${input.duration}s`);
        
        const messageId = await db.addAudioMessage(input);
        const now = new Date();
        
        // بث الرسالة الصوتية الجديدة لجميع المشاركين (لتحديث القائمة)
        emitAudioMessageCreated(
          input.roomId,
          messageId,
          input.userId,
          input.username,
          input.messageType,
          input.audioUrl,
          input.duration,
          now
        );
        
        // بث أمر تشغيل الطاروق/التعليق عند الجميع (ما عدا المرسل - يشغل محلياً)
        emitPlayAudioMessage(
          input.roomId,
          messageId,
          input.audioUrl,
          input.messageType,
          input.userId,
          input.username,
          input.sheelohaUrl
        );
        
        // إذا كان طاروق مع شيلوها: بث الشيلوها للجميع (بما فيهم المرسل) بعد مدة الطاروق
        if (input.messageType === "tarouk" && input.sheelohaUrl) {
          // تأخير بسيط فقط (300ms) بعد مدة الطاروق لضمان انتهاء التشغيل
          const taroukDurationMs = Math.max((input.duration || 3) * 1000 + 300, 2000);
          const sheelohaUrlToPlay = input.sheelohaUrl;
          
          console.log(`[audio.create] ========== SHEELOHA SCHEDULED ==========`);
          console.log(`[audio.create] Tarouk audioUrl: ${input.audioUrl}`);
          console.log(`[audio.create] Sheeloha URL:    ${sheelohaUrlToPlay}`);
          console.log(`[audio.create] URLs are same?   ${input.audioUrl === sheelohaUrlToPlay}`);
          console.log(`[audio.create] Will broadcast sheeloha after ${taroukDurationMs}ms`);
          
          setTimeout(() => {
            console.log(`[audio.create] ========== BROADCASTING SHEELOHA NOW ==========`);
            console.log(`[audio.create] Sheeloha URL being sent: ${sheelohaUrlToPlay}`);
            emitPlayAudioMessage(
              input.roomId,
              messageId,
              sheelohaUrlToPlay,
              "tarouk",
              input.userId,
              input.username,
              undefined,
              true // isSheeloha = true
            );
          }, taroukDurationMs);
        } else if (input.messageType === "tarouk" && !input.sheelohaUrl) {
          console.log(`[audio.create] WARNING: Tarouk WITHOUT sheelohaUrl - sheeloha will NOT play!`);
        }
        
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
        speedUp: z.boolean().optional(), // تسريع الصوت بنسبة 1.15 للطاروق
      })
    )
    .mutation(async ({ input }) => {
      const { storagePut } = await import("./storage");
      const { speedUpAudio } = await import("./audio-processor");
      const { generateSheeloha } = await import("./sheeloha-generator");
      
      // Convert base64 to buffer
      const buffer: Buffer = Buffer.from(input.base64Data, "base64");
      
      // Generate unique file key
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);
      const fileKey = `audio/${timestamp}-${randomSuffix}-${input.fileName}`;
      
      // رفع الصوت الأصلي (بدون تسريع) كطاروق - المستمعون يسمعون الصوت الأصلي
      const { url } = await storagePut(fileKey, buffer, "audio/mp4");
      console.log("[uploadAudio] Original audio uploaded as tarouk (no speed up)");
      
      // إنشاء ملف الشيلوها المدمج للطاروق فقط
      // generateSheeloha تسرّع الصوت داخلياً + تضيف صفوف + تصفيق إيقاعي + تصفيق ختامي
      let sheelohaUrl: string | undefined;
      if (input.speedUp) {
        try {
          console.log("[uploadAudio] Generating sheeloha from ORIGINAL audio (sheeloha handles speed internally)...");
          const sheelohaBuffer = await generateSheeloha(buffer);
          const sheelohaKey = `audio/${timestamp}-${randomSuffix}-sheeloha-${input.fileName}`;
          const sheelohaResult = await storagePut(sheelohaKey, sheelohaBuffer, "audio/mp4");
          sheelohaUrl = sheelohaResult.url;
          console.log("[uploadAudio] Sheeloha file generated and uploaded:", sheelohaUrl);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          console.error("[uploadAudio] ========== SHEELOHA GENERATION FAILED ==========");
          console.error(`[uploadAudio] Error: ${errMsg}`);
          console.error(`[uploadAudio] Stack: ${error instanceof Error ? error.stack : 'N/A'}`);
          console.error(`[uploadAudio] This means the sheeloha will NOT play for anyone!`);
          // لا نفشل العملية كلها إذا فشل إنشاء الشيلوها
        }
      }
      
      console.log(`[uploadAudio] ========== UPLOAD COMPLETE ==========`);
      console.log(`[uploadAudio] Tarouk URL:   ${url}`);
      console.log(`[uploadAudio] Sheeloha URL: ${sheelohaUrl || 'UNDEFINED - NOT GENERATED'}`);
      console.log(`[uploadAudio] URLs same?    ${url === sheelohaUrl}`);
      return { url, sheelohaUrl };
    }),

  // Reactions router
  reactions: router({
    // Add a reaction
    create: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.string(),
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
          
          // بث التفاعل الجديد لجميع المشاركين
          emitReactionCreated(
            input.roomId,
            reactionId,
            input.userId,
            input.username,
            input.reactionType,
            new Date()
          );
          
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
          userId: z.string(),
          username: z.string(),
          audioUrl: z.string(),
          clappingDelay: z.number().min(0).max(1.5).default(0.5), // سرعة التصفيق من المتحكم
        })
      )
      .mutation(async ({ input }) => {
        try {
          console.log("[API] Creating sheeloha broadcast:", input);
          const broadcastId = await db.createSheelohaBroadcast(input);
          console.log("[API] Sheeloha broadcast created with ID:", broadcastId);
          
          // بث إيقاف الصوت القديم وتشغيل الجديد لجميع المشاركين
          emitStopAndPlayNewSheeloha(
            input.roomId,
            input.userId,
            input.audioUrl,
            input.clappingDelay
          );
          
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

    // شيلوها الجديدة - تشغيل صوت الصفوف مع التصفيق عند الجميع
    playSufoof: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.string(),
          username: z.string(),
          audioUrl: z.string(), // رابط الصوت الأصلي
          clappingDelay: z.number().min(0).max(1.5).default(0.5), // سرعة التصفيق
        })
      )
      .mutation(async ({ input }) => {
        try {
          console.log("[API] Playing sufoof sheeloha:", input);
          
          // بث شيلوها لجميع المشاركين (الصوت الأصلي)
          emitPlaySufoofSheeloha(
            input.roomId,
            input.audioUrl,
            input.clappingDelay,
            input.userId,
            input.username
          );
          
          return { success: true };
        } catch (error) {
          console.error("[API] Failed to play sufoof sheeloha:", error);
          throw new Error("فشل تشغيل شيلوها");
        }
      }),
  }),

  // Khalooha commands router (stop sheeloha for all users)
  khalooha: router({
    // Create a khalooha command (when someone presses "خلوها" button)
    stop: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.string(),
          username: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          console.log("[API] Creating khalooha command:", input);
          const commandId = await db.createKhaloohaCommand(input);
          console.log("[API] Khalooha command created with ID:", commandId);
          
          // بث خلوها لجميع المشاركين
          emitKhaloohaCommand(
            input.roomId,
            input.userId,
            input.username,
            new Date()
          );
          
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
          userId: z.string(),
          username: z.string(),
          isRecording: z.boolean(),
          recordingType: z.enum(["comment", "tarouk"]),
        })
      )
      .mutation(async ({ input }) => {
        try {
          console.log("[API] Setting recording status:", input);
          await db.setRecordingStatus(input);
          
          // بث تغيير حالة التسجيل لجميع المشاركين
          emitRecordingStatusChanged(
            input.roomId,
            input.userId,
            input.username,
            input.isRecording,
            input.recordingType
          );
          
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
          userId: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        await db.clearRecordingStatus(input.roomId, input.userId);
        
        // بث إيقاف التسجيل لجميع المشاركين عبر Socket.io
        emitRecordingStatusChanged(
          input.roomId,
          input.userId,
          "", // username غير مطلوب عند الإيقاف
          false,
          "" // recordingType غير مطلوب عند الإيقاف
        );
        
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
          userId: z.string(),
          username: z.string(),
          avatar: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const requestId = await db.createJoinRequest(input);
          
          // بث طلب الانضمام الجديد للمنشئ (داخل الساحة)
          emitJoinRequestCreated(
            input.roomId,
            requestId,
            input.userId,
            input.username,
            input.avatar
          );
          
          // إرسال إشعار للمنشئ عبر قناته الخاصة (خارج الساحة)
          const room = await db.getRoomById(input.roomId);
          if (room) {
            emitCreatorJoinRequest(
              input.roomId,
              room.creatorId,
              "player",
              input.userId,
              input.username
            );
          }
          
          // حذف تلقائي بعد 15 ثانية من الإنشاء
          setTimeout(async () => {
            try {
              const requests = await db.getPendingJoinRequests(input.roomId);
              const req = requests.find((r: any) => r.id === requestId);
              if (req) {
                console.log(`[AutoExpire] Auto-expiring join request ${requestId} after 15s`);
                await db.expireJoinRequest(requestId);
                emitRoomUpdated(input.roomId);
              }
            } catch (e) {
              console.warn(`[AutoExpire] Error expiring join request ${requestId}:`, e);
            }
          }, 15000);

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
          userId: z.string(),
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
            // تحديث وقت آخر لاعب منضم (لحساب مدة الحذف التلقائي)
            await db.updateLastPlayerJoinTime(input.roomId);
          }
          
          // بث الرد على طلب الانضمام لجميع المشاركين
          emitJoinRequestResponded(
            input.roomId,
            input.requestId,
            input.accept,
            request.userId
          );
          
          // بث تحديث الساحة
          emitRoomUpdated(input.roomId);
          
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

  // Update participant profile
  profile: router({
    update: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          userId: z.string(),
          username: z.string().min(2).max(20),
          avatar: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          await db.updateParticipantProfile(
            input.roomId,
            input.userId,
            input.username,
            input.avatar
          );
          return { success: true };
        } catch (error: any) {
          throw new Error(error.message || "فشل تحديث الملف الشخصي");
        }
      }),
  }),

  // Kick player router (creator only)
  kick: router({
    player: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          playerId: z.string(),
          creatorId: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          await db.kickPlayer(input.roomId, input.playerId, input.creatorId);
          return { success: true };
        } catch (error: any) {
          throw new Error(error.message || "فشل استبعاد اللاعب");
        }
      }),
  }),

  // Top 10 rooms router
  top10: router({
    // Get top 10 rooms sorted by viewers, pending requests, players, then oldest
    list: publicProcedure.query(async () => {
      return db.getTop10Rooms();
    }),
  }),

  // Online users count
  stats: router({
    // Get online users count (actual + 50%)
    onlineCount: publicProcedure.query(() => {
      const actualCount = getActiveUsersCount();
      // الرقم المعروض = العدد الفعلي + 50% (رقم صحيح)
      const displayCount = Math.floor(actualCount * 1.5);
      return { count: displayCount };
    }),
    
    // تسجيل نشاط المستخدم (heartbeat)
    heartbeat: publicProcedure
      .input(z.object({ userId: z.string() }))
      .mutation(({ input }) => {
        recordUserActivity(input.userId);
        return { success: true };
      }),
  }),

  // Public invitations router
  publicInvitations: router({
    // Create a public invitation (creator only, 5 min cooldown)
    create: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          creatorId: z.string(),
          creatorName: z.string(),
          creatorAvatar: z.string(),
          roomName: z.string(),
          message: z.string().max(18).optional(),
        })
      )
      .mutation(async ({ input }) => {
        // Check cooldown
        const canSend = await db.canSendPublicInvite(input.roomId);
        if (!canSend) {
          throw new Error("يجب الانتظار 5 دقائق قبل إرسال دعوة عامة أخرى");
        }

        // Create invitation
        const invitationId = await db.createPublicInvitation({
          ...input,
          message: input.message || 'مطلوب شاعر',
        });
        
        // Update last invite time
        await db.updateLastPublicInviteTime(input.roomId);
        
        // Emit socket event for real-time update
        emitPublicInviteCreated(
          invitationId,
          input.roomId,
          input.creatorId,
          input.creatorName,
          input.creatorAvatar,
          input.roomName
        );
        
        return { success: true, invitationId };
      }),

    // Get pending invitations (for queue display)
    getPending: publicProcedure
      .input(z.object({ limit: z.number().default(50) }))
      .query(async ({ input }) => {
        return db.getPendingPublicInvitations(input.limit);
      }),

    // Get displayed invitations (currently showing in top 10)
    getDisplayed: publicProcedure
      .input(z.object({ limit: z.number().default(10) }))
      .query(async ({ input }) => {
        return db.getDisplayedPublicInvitations(input.limit);
      }),

    // Mark invitation as displayed
    markDisplayed: publicProcedure
      .input(z.object({ invitationId: z.number() }))
      .mutation(async ({ input }) => {
        await db.markInvitationAsDisplayed(input.invitationId);
        return { success: true };
      }),

    // Expire invitation (after 4 seconds display)
    expire: publicProcedure
      .input(z.object({ invitationId: z.number() }))
      .mutation(async ({ input }) => {
        await db.expirePublicInvitation(input.invitationId);
        
        // Emit socket event
        emitPublicInviteExpired(input.invitationId);
        
        return { success: true };
      }),

    // Check if can send public invite (5 min cooldown)
    canSend: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return db.canSendPublicInvite(input.roomId);
      }),
  }),

  // Gold star router
  goldStar: router({
    // Check and award gold star if room has > 20 viewers
    check: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .mutation(async ({ input }) => {
        const awarded = await db.checkAndAwardGoldStar(input.roomId);
        return { awarded };
      }),
  }),
});

export type AppRouter = typeof appRouter;
