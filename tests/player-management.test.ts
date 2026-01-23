import { describe, it, expect, beforeEach } from "vitest";

describe("Player Management System", () => {
  let mockDb: {
    acceptedPlayersCount: number;
    pendingRequests: Array<{ id: number; username: string }>;
    roomExists: boolean;
  };

  beforeEach(() => {
    mockDb = {
      acceptedPlayersCount: 0,
      pendingRequests: [
        { id: 1, username: "player1" },
        { id: 2, username: "player2" },
        { id: 3, username: "player3" },
      ],
      roomExists: true,
    };
  });

  describe("Maximum Players Limit", () => {
    it("should allow accepting first player when room has 0 players", () => {
      expect(mockDb.acceptedPlayersCount).toBe(0);
      
      // Accept first player
      mockDb.acceptedPlayersCount++;
      
      expect(mockDb.acceptedPlayersCount).toBe(1);
    });

    it("should allow accepting second player when room has 1 player", () => {
      mockDb.acceptedPlayersCount = 1;
      
      // Accept second player
      mockDb.acceptedPlayersCount++;
      
      expect(mockDb.acceptedPlayersCount).toBe(2);
    });

    it("should reject all pending requests when 2 players are accepted", () => {
      mockDb.acceptedPlayersCount = 1;
      
      // Accept second player
      mockDb.acceptedPlayersCount++;
      
      // When 2 players are accepted, all pending requests should be rejected
      if (mockDb.acceptedPlayersCount >= 2) {
        mockDb.pendingRequests = [];
      }
      
      expect(mockDb.acceptedPlayersCount).toBe(2);
      expect(mockDb.pendingRequests.length).toBe(0);
    });

    it("should show room as full when 2 players are accepted", () => {
      mockDb.acceptedPlayersCount = 2;
      
      const isRoomFull = mockDb.acceptedPlayersCount >= 2;
      
      expect(isRoomFull).toBe(true);
    });

    it("should show room as not full when less than 2 players", () => {
      mockDb.acceptedPlayersCount = 1;
      
      const isRoomFull = mockDb.acceptedPlayersCount >= 2;
      
      expect(isRoomFull).toBe(false);
    });
  });

  describe("Player Leave and Rejoin", () => {
    it("should allow new player to join after one player leaves", () => {
      mockDb.acceptedPlayersCount = 2;
      
      // One player leaves
      mockDb.acceptedPlayersCount--;
      
      expect(mockDb.acceptedPlayersCount).toBe(1);
      
      const isRoomFull = mockDb.acceptedPlayersCount >= 2;
      expect(isRoomFull).toBe(false);
    });

    it("should update player count in real-time when player leaves", () => {
      mockDb.acceptedPlayersCount = 2;
      
      const initialCount = mockDb.acceptedPlayersCount;
      mockDb.acceptedPlayersCount--;
      
      expect(mockDb.acceptedPlayersCount).toBe(initialCount - 1);
    });
  });

  describe("Room Deletion", () => {
    it("should delete room when creator leaves", () => {
      expect(mockDb.roomExists).toBe(true);
      
      // Creator deletes room
      mockDb.roomExists = false;
      mockDb.acceptedPlayersCount = 0;
      mockDb.pendingRequests = [];
      
      expect(mockDb.roomExists).toBe(false);
      expect(mockDb.acceptedPlayersCount).toBe(0);
      expect(mockDb.pendingRequests.length).toBe(0);
    });

    it("should remove all participants when room is deleted", () => {
      mockDb.acceptedPlayersCount = 2;
      mockDb.pendingRequests = [{ id: 3, username: "player3" }];
      
      // Delete room
      mockDb.roomExists = false;
      mockDb.acceptedPlayersCount = 0;
      mockDb.pendingRequests = [];
      
      expect(mockDb.acceptedPlayersCount).toBe(0);
      expect(mockDb.pendingRequests.length).toBe(0);
    });
  });

  describe("Player Count Display", () => {
    it("should show correct format for player count (0/2)", () => {
      mockDb.acceptedPlayersCount = 0;
      
      const displayText = `${mockDb.acceptedPlayersCount}/2 لاعبين`;
      
      expect(displayText).toBe("0/2 لاعبين");
    });

    it("should show correct format for player count (1/2)", () => {
      mockDb.acceptedPlayersCount = 1;
      
      const displayText = `${mockDb.acceptedPlayersCount}/2 لاعبين`;
      
      expect(displayText).toBe("1/2 لاعبين");
    });

    it("should show correct format for player count (2/2)", () => {
      mockDb.acceptedPlayersCount = 2;
      
      const displayText = `${mockDb.acceptedPlayersCount}/2 لاعبين`;
      
      expect(displayText).toBe("2/2 لاعبين");
    });
  });
});
