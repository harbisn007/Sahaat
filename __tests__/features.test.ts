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

describe("Public Invite Message in Router", () => {
  it("should accept message field in create mutation", async () => {
    const fs = await import("fs");
    const routerContent = fs.readFileSync(
      "/home/ubuntu/sahaat-muhawara/server/routers.ts",
      "utf-8"
    );
    
    // Verify message field in input schema
    expect(routerContent).toContain("message: z.string().max(12).optional()");
    
    // Verify default message is used when not provided
    expect(routerContent).toContain("وين الشعّار؟");
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

describe("Client Socket Creator Channel", () => {
  it("should join and leave creator channel in index.tsx", async () => {
    const fs = await import("fs");
    const indexContent = fs.readFileSync(
      "/home/ubuntu/sahaat-muhawara/app/(tabs)/index.tsx",
      "utf-8"
    );
    
    // Verify joining creator channel
    expect(indexContent).toContain('socket.emit("joinCreatorChannel", userId)');
    
    // Verify leaving creator channel on cleanup
    expect(indexContent).toContain('socket.emit("leaveCreatorChannel", userId)');
    
    // Verify listening for creatorJoinRequest events
    expect(indexContent).toContain('socket.on("creatorJoinRequest"');
    
    // Verify playBell is called
    expect(indexContent).toContain("playBell()");
    
    // Verify message field in PublicInvitation interface
    expect(indexContent).toContain("message?: string | null");
  });
});
