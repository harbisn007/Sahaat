import { describe, it, expect } from "vitest";
import * as fs from "fs";

describe("Cross-Platform Compatibility (Android + iOS)", () => {
  
  describe("No iOS-only APIs", () => {
    it("should not use Alert.prompt anywhere in the app", () => {
      const files = [
        "/home/ubuntu/sahaat-muhawara/app/room/[id].tsx",
        "/home/ubuntu/sahaat-muhawara/app/(tabs)/index.tsx",
      ];
      for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        expect(content).not.toContain("Alert.prompt");
      }
    });

    it("should use Modal for public invite instead of Alert.prompt", () => {
      const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/app/room/[id].tsx", "utf-8");
      expect(content).toContain("showPublicInviteModal");
      expect(content).toContain("setShowPublicInviteModal");
      expect(content).toContain("TextInput");
    });
  });

  describe("Web Audio API is guarded by Platform check", () => {
    it("audio-effects.ts should check typeof window before using AudioContext", () => {
      const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/lib/audio-effects.ts", "utf-8");
      expect(content).toContain('typeof window === "undefined"');
    });

    it("use-tarouk-player.ts should only use Web Audio API on web", () => {
      const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/hooks/use-tarouk-player.ts", "utf-8");
      // playWithTaroukEffects should only be called inside Platform.OS === "web" block
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("playWithTaroukEffects(") || lines[i].includes("playWithTaroukAndClapEffects(")) {
          // Check that a Platform.OS === "web" check exists within 5 lines before
          const contextBefore = lines.slice(Math.max(0, i - 5), i).join("\n");
          expect(contextBefore).toContain('Platform.OS === "web"');
        }
      }
    });
  });

  describe("HTMLAudioElement is guarded by Platform check", () => {
    it("use-sheeloha-player.ts should guard new Audio() with Platform check", () => {
      const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/hooks/use-sheeloha-player.ts", "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("new Audio(") && !lines[i].trim().startsWith("//")) {
          // Check that Platform.OS check exists within 30 lines before (function-level guard)
          const contextBefore = lines.slice(Math.max(0, i - 30), i).join("\n");
          const hasPlatformCheck = contextBefore.includes('Platform.OS') || contextBefore.includes('playOnWeb') || contextBefore.includes('initWebClapAudio');
          expect(hasPlatformCheck).toBe(true);
        }
      }
    });

    it("use-audio-player.ts should guard new Audio() with Platform check", () => {
      const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/hooks/use-audio-player.ts", "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("new Audio(") && !lines[i].trim().startsWith("//")) {
          const contextBefore = lines.slice(Math.max(0, i - 10), i).join("\n");
          const hasPlatformCheck = contextBefore.includes('Platform.OS') || contextBefore.includes('platform');
          expect(hasPlatformCheck).toBe(true);
        }
      }
    });
  });

  describe("MediaRecorder is guarded by Platform check", () => {
    it("use-audio-recorder.ts should guard MediaRecorder with Platform check", () => {
      const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/hooks/use-audio-recorder.ts", "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("new MediaRecorder(") && !lines[i].trim().startsWith("//")) {
          const contextBefore = lines.slice(Math.max(0, i - 10), i).join("\n");
          const hasPlatformCheck = contextBefore.includes('Platform.OS === "web"');
          expect(hasPlatformCheck).toBe(true);
        }
      }
    });
  });

  describe("Notification Bell works on all platforms", () => {
    it("should use expo-audio for notification bell", () => {
      const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/hooks/use-notification-bell.ts", "utf-8");
      expect(content).toContain("createAudioPlayer");
      expect(content).toContain("player.play()");
    });

    it("should set audio mode for silent mode on native", () => {
      const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/hooks/use-notification-bell.ts", "utf-8");
      expect(content).toContain("playsInSilentMode: true");
    });

    it("should reset audio position before playing to allow replaying", () => {
      const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/hooks/use-notification-bell.ts", "utf-8");
      // Web uses currentTime = 0, native creates new player each time
      expect(content).toContain("currentTime = 0");
    });
  });

  describe("Socket.io URL is platform-aware", () => {
    it("index.tsx getServerUrl should check Platform.OS and typeof window", () => {
      const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/app/(tabs)/index.tsx", "utf-8");
      expect(content).toContain('Platform.OS === "web"');
      expect(content).toContain('typeof window !== "undefined"');
    });

    it("use-socket.ts getServerUrl should check Platform.OS and typeof window", () => {
      const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/hooks/use-socket.ts", "utf-8");
      expect(content).toContain('Platform.OS === "web"');
      expect(content).toContain('typeof window !== "undefined"');
    });
  });

  describe("Haptics are guarded by Platform check", () => {
    it("speed-wheel.tsx should guard Haptics with Platform check", () => {
      const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/components/speed-wheel.tsx", "utf-8");
      expect(content).toContain('Platform.OS !== "web"');
    });
  });

  describe("No Pressable with className (NativeWind pitfall)", () => {
    it("should not use className on Pressable in room screen", () => {
      const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/app/room/[id].tsx", "utf-8");
      // Check that Pressable doesn't have className prop directly
      const pressableWithClassName = content.match(/<Pressable[^>]*className=/g);
      expect(pressableWithClassName).toBeNull();
    });
  });
});
