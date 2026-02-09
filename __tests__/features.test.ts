import { describe, it, expect } from "vitest";

describe("Public Invitations Schema", () => {
  it("should have message field in PublicInvitation interface", async () => {
    // Verify the schema has the message field
    const schema = await import("../drizzle/schema");
    const columns = schema.publicInvitations;
    expect(columns).toBeDefined();
    // Check that the table definition includes message column
    expect((columns as any).message).toBeDefined();
  });
});

describe("Socket.io Events", () => {
  it("should export emitCreatorJoinRequest function", async () => {
    // Verify the socket module exports the new function
    const socketModule = await import("../server/_core/socket");
    expect(typeof socketModule.emitCreatorJoinRequest).toBe("function");
  });
});

describe("Join Request Timeout", () => {
  it("should use 10 second timeout for join requests", async () => {
    // Read the room screen file and verify timeout values
    const fs = await import("fs");
    const roomScreenContent = fs.readFileSync(
      "/home/ubuntu/sahaat-muhawara/app/room/[id].tsx",
      "utf-8"
    );
    
    // Verify the timer uses 10000ms (10 seconds)
    expect(roomScreenContent).toContain("}, 10000);");
    
    // Verify the user-facing message says 10 seconds
    expect(roomScreenContent).toContain("سيتم حذف الطلب تلقائياً بعد 10 ثواني");
    
    // Verify comments reference 10 seconds
    expect(roomScreenContent).toContain("مؤقت 10 ثواني");
    expect(roomScreenContent).toContain("لمدة 10 ثواني");
  });
});

describe("Notification Bell Hook", () => {
  it("should reference the correct sound file", async () => {
    const fs = await import("fs");
    const bellHookContent = fs.readFileSync(
      "/home/ubuntu/sahaat-muhawara/hooks/use-notification-bell.ts",
      "utf-8"
    );
    
    // Verify it references notif3.mp3
    expect(bellHookContent).toContain("notif3.mp3");
    
    // Verify the sound file exists
    expect(
      fs.existsSync("/home/ubuntu/sahaat-muhawara/assets/sounds/notif3.mp3")
    ).toBe(true);
  });
});

describe("Creator Channel in Socket Server", () => {
  it("should handle joinCreatorChannel and leaveCreatorChannel events", async () => {
    const fs = await import("fs");
    const socketContent = fs.readFileSync(
      "/home/ubuntu/sahaat-muhawara/server/_core/socket.ts",
      "utf-8"
    );
    
    // Verify joinCreatorChannel handler exists
    expect(socketContent).toContain('socket.on("joinCreatorChannel"');
    
    // Verify leaveCreatorChannel handler exists
    expect(socketContent).toContain('socket.on("leaveCreatorChannel"');
    
    // Verify creatorJoinRequest event type is defined
    expect(socketContent).toContain("creatorJoinRequest");
    
    // Verify the emit function joins the correct room pattern
    expect(socketContent).toContain("creator:");
  });
});

describe("No expo-notifications in GlobalCreatorNotifier", () => {
  it("should NOT import expo-notifications", async () => {
    const fs = await import("fs");
    const notifierContent = fs.readFileSync(
      "/home/ubuntu/sahaat-muhawara/components/global-creator-notifier.tsx",
      "utf-8"
    );
    
    // Verify expo-notifications is NOT imported
    expect(notifierContent).not.toContain("expo-notifications");
    
    // Verify no Notifications.scheduleNotificationAsync
    expect(notifierContent).not.toContain("scheduleNotificationAsync");
    
    // Verify no setNotificationHandler
    expect(notifierContent).not.toContain("setNotificationHandler");
    
    // Verify no requestPermissionsAsync for notifications
    expect(notifierContent).not.toContain("requestPermissionsAsync");
    
    // Verify playBell is still used
    expect(notifierContent).toContain("playBell()");
    
    // Verify isCreatorInOwnRoom check exists
    expect(notifierContent).toContain("isCreatorInOwnRoom");
  });
});

describe("Socket disconnect handler - no immediate room deletion", () => {
  it("should NOT delete rooms immediately on disconnect", async () => {
    const fs = await import("fs");
    const socketContent = fs.readFileSync(
      "/home/ubuntu/sahaat-muhawara/server/_core/socket.ts",
      "utf-8"
    );
    
    // Verify disconnect handler does NOT call deleteRoomCompletely
    // The disconnect handler should only broadcast online count
    const disconnectMatch = socketContent.match(/socket\.on\("disconnect"[\s\S]*?\}\);/);
    expect(disconnectMatch).toBeTruthy();
    
    const disconnectHandler = disconnectMatch![0];
    expect(disconnectHandler).not.toContain("deleteRoomCompletely");
    expect(disconnectHandler).not.toContain("getUserActiveRoom");
    
    // Verify it mentions room-cleanup.ts handles deletion
    expect(disconnectHandler).toContain("room-cleanup.ts");
  });
});

describe("Room cleanup with grace period", () => {
  it("should have 15-minute disconnect timeout", async () => {
    const fs = await import("fs");
    const cleanupContent = fs.readFileSync(
      "/home/ubuntu/sahaat-muhawara/server/_core/room-cleanup.ts",
      "utf-8"
    );
    
    // Verify 15-minute timeout constant
    expect(cleanupContent).toContain("CREATOR_DISCONNECT_TIMEOUT_MINUTES = 15");
    
    // Verify disconnect tracking map exists
    expect(cleanupContent).toContain("creatorDisconnectedAt");
    
    // Verify grace period logic - checking elapsed time
    expect(cleanupContent).toContain("elapsedMinutes >= CREATOR_DISCONNECT_TIMEOUT_MINUTES");
    
    // Verify reconnection cancels timer
    expect(cleanupContent).toContain("cancelling deletion timer");
    
    // Verify it checks multiple socket channels
    expect(cleanupContent).toContain("creator:");
    expect(cleanupContent).toContain("user:");
    expect(cleanupContent).toContain("room:");
    
    // Verify check interval is 30 seconds
    expect(cleanupContent).toContain("CHECK_INTERVAL_MS = 30 * 1000");
  });

  it("should export deleteRoomCompletely and startRoomCleanupService", async () => {
    const cleanupModule = await import("../server/_core/room-cleanup");
    expect(typeof cleanupModule.deleteRoomCompletely).toBe("function");
    expect(typeof cleanupModule.startRoomCleanupService).toBe("function");
  });
});

describe("Public Invite Message in Router", () => {
  it("should accept message field in create mutation", async () => {
    const fs = await import("fs");
    const routerContent = fs.readFileSync(
      "/home/ubuntu/sahaat-muhawara/server/routers.ts",
      "utf-8"
    );
    
    // Verify message field in input schema
    expect(routerContent).toContain("message: z.string().max(18).optional()");
    
    // Verify default message is used when not provided
    expect(routerContent).toContain("مطلوب شاعر");
  });
});

describe("Creator Notification in Router", () => {
  it("should emit creator notification on join request and viewer join", async () => {
    const fs = await import("fs");
    const routerContent = fs.readFileSync(
      "/home/ubuntu/sahaat-muhawara/server/routers.ts",
      "utf-8"
    );
    
    // Verify emitCreatorJoinRequest is imported
    expect(routerContent).toContain("emitCreatorJoinRequest");
    
    // Verify it's called for player join requests
    expect(routerContent).toContain('"player"');
    
    // Verify it's called for viewer joins
    expect(routerContent).toContain('"viewer"');
  });
});

describe("No expo-notifications in app.config.ts", () => {
  it("should not have POST_NOTIFICATIONS permission", async () => {
    const fs = await import("fs");
    const configContent = fs.readFileSync(
      "/home/ubuntu/sahaat-muhawara/app.config.ts",
      "utf-8"
    );
    
    // Verify POST_NOTIFICATIONS is removed
    expect(configContent).not.toContain("POST_NOTIFICATIONS");
    
    // Verify RECORD_AUDIO is still there
    expect(configContent).toContain("RECORD_AUDIO");
  });
});
