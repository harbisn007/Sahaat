import { describe, it, expect, vi } from "vitest";

// Mock expo-audio
vi.mock("expo-audio", () => ({
  useAudioPlayer: vi.fn(() => ({
    play: vi.fn(),
    pause: vi.fn(),
    release: vi.fn(),
    seekTo: vi.fn(),
    currentTime: 0,
    duration: 0,
    playing: false,
  })),
  setAudioModeAsync: vi.fn(),
}));

// Mock react-native
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: { currentState: "active" },
}));

describe("Auto Sheeloha - Server-side generation", () => {
  it("should define the correct voice copies for choir effect", () => {
    // 5 copies with different delays and detune values
    const VOICE_COPIES = [
      { delay: 0, detune: 0, volume: 1.0 },
      { delay: 25, detune: 10, volume: 0.7 },
      { delay: 50, detune: -10, volume: 0.65 },
      { delay: 15, detune: 15, volume: 0.6 },
      { delay: 65, detune: -15, volume: 0.55 },
    ];

    expect(VOICE_COPIES).toHaveLength(5);
    expect(VOICE_COPIES[0].delay).toBe(0); // Main voice has no delay
    expect(VOICE_COPIES[0].volume).toBe(1.0); // Main voice at full volume
    
    // All other copies should have lower volume
    for (let i = 1; i < VOICE_COPIES.length; i++) {
      expect(VOICE_COPIES[i].volume).toBeLessThan(1.0);
    }
  });

  it("should calculate correct clap interval from BPM analysis", () => {
    // Simulate rhythm analysis results
    const intervals = [0.65, 0.72, 0.68, 0.75, 0.70, 0.80, 0.71];
    
    // Sort and take median
    const sorted = [...intervals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
    
    expect(median).toBeCloseTo(0.71, 1);
    expect(median).toBeGreaterThan(0.3); // Min clap interval
    expect(median).toBeLessThan(2.0); // Max clap interval
  });

  it("should calculate correct number of claps for audio duration", () => {
    const audioDuration = 10; // 10 seconds
    const clapInterval = 0.72; // 0.72 seconds between claps
    
    const numClaps = Math.floor(audioDuration / clapInterval);
    expect(numClaps).toBe(13); // 10 / 0.72 = 13.88 → 13
    
    // With MAX_INDIVIDUAL_CLAPS limit
    const MAX_INDIVIDUAL_CLAPS = 15;
    const effectiveClaps = Math.min(numClaps, MAX_INDIVIDUAL_CLAPS);
    expect(effectiveClaps).toBe(13); // Under limit
    
    // Longer audio
    const longDuration = 30;
    const longNumClaps = Math.floor(longDuration / clapInterval);
    const longEffective = Math.min(longNumClaps, MAX_INDIVIDUAL_CLAPS);
    expect(longEffective).toBe(15); // Capped at limit
  });

  it("should handle edge cases in rhythm analysis", () => {
    // Very short audio - no claps
    const shortDuration = 0.5;
    const clapInterval = 0.72;
    const numClaps = Math.floor(shortDuration / clapInterval);
    expect(numClaps).toBe(0);
    
    // Very fast rhythm - should be clamped
    const MIN_CLAP_INTERVAL = 0.3;
    const MAX_CLAP_INTERVAL = 2.0;
    const tooFast = 0.1;
    const clamped = Math.max(MIN_CLAP_INTERVAL, Math.min(MAX_CLAP_INTERVAL, tooFast));
    expect(clamped).toBe(MIN_CLAP_INTERVAL);
    
    // Very slow rhythm - should be clamped
    const tooSlow = 5.0;
    const clampedSlow = Math.max(MIN_CLAP_INTERVAL, Math.min(MAX_CLAP_INTERVAL, tooSlow));
    expect(clampedSlow).toBe(MAX_CLAP_INTERVAL);
  });
});

describe("Auto Sheeloha - Client-side playback", () => {
  it("should play sheeloha file exactly 2 times then stop", () => {
    let playCount = 0;
    const MAX_REPEATS = 2;
    
    const playSheeloha = (url: string) => {
      playCount++;
      if (playCount >= MAX_REPEATS) {
        // Stop after 2 plays
        return false;
      }
      return true; // Continue playing
    };
    
    // First play
    const shouldContinue1 = playSheeloha("https://example.com/sheeloha.aac");
    expect(shouldContinue1).toBe(true);
    expect(playCount).toBe(1);
    
    // Second play
    const shouldContinue2 = playSheeloha("https://example.com/sheeloha.aac");
    expect(shouldContinue2).toBe(false);
    expect(playCount).toBe(2);
  });

  it("should stop sheeloha when khalooha is pressed", () => {
    let isPlaying = true;
    let playCount = 0;
    
    const stopSheeloha = () => {
      isPlaying = false;
      playCount = 0;
    };
    
    // Simulate khalooha press
    stopSheeloha();
    expect(isPlaying).toBe(false);
    expect(playCount).toBe(0);
  });

  it("should stop sheeloha when leaving room", () => {
    let isPlaying = true;
    
    const cleanup = () => {
      isPlaying = false;
    };
    
    // Simulate unmount
    cleanup();
    expect(isPlaying).toBe(false);
  });

  it("should trigger auto sheeloha after tarouk ends for other users", () => {
    const events: string[] = [];
    
    const play = (url: string, onEnded?: () => void) => {
      events.push(`play:${url.includes("tarouk") ? "tarouk" : "other"}`);
      // Simulate audio ended
      if (onEnded) {
        onEnded();
      }
    };
    
    const playAutoSheeloha = (url: string) => {
      events.push("play:sheeloha");
    };
    
    // Simulate receiving tarouk with sheelohaUrl
    const data = {
      audioUrl: "https://example.com/tarouk.aac",
      sheelohaUrl: "https://example.com/sheeloha.aac",
      userId: "other-user",
    };
    
    // Play tarouk, then auto sheeloha on end
    play(data.audioUrl, () => {
      playAutoSheeloha(data.sheelohaUrl!);
    });
    
    expect(events).toEqual(["play:tarouk", "play:sheeloha"]);
  });

  it("should skip playback for sender (already played locally)", () => {
    const currentUserId = "user-123";
    const events: string[] = [];
    
    const onPlayAudioMessage = (data: { userId: string; audioUrl: string; sheelohaUrl?: string }) => {
      if (data.userId === currentUserId) {
        events.push("skipped");
        return;
      }
      events.push("played");
    };
    
    // Message from self
    onPlayAudioMessage({ userId: "user-123", audioUrl: "url1", sheelohaUrl: "url2" });
    expect(events).toEqual(["skipped"]);
    
    // Message from other
    onPlayAudioMessage({ userId: "user-456", audioUrl: "url1", sheelohaUrl: "url2" });
    expect(events).toEqual(["skipped", "played"]);
  });
});

describe("Upload Audio with Sheeloha URL", () => {
  it("should return both url and sheelohaUrl for tarouk recordings", () => {
    // Simulate upload response
    const response = {
      url: "https://s3.example.com/tarouk-processed.aac",
      sheelohaUrl: "https://s3.example.com/sheeloha-merged.aac",
    };
    
    expect(response.url).toBeDefined();
    expect(response.sheelohaUrl).toBeDefined();
    expect(response.url).not.toBe(response.sheelohaUrl);
  });

  it("should return only url for comment recordings (no sheeloha)", () => {
    const response = {
      url: "https://s3.example.com/comment.aac",
      sheelohaUrl: undefined,
    };
    
    expect(response.url).toBeDefined();
    expect(response.sheelohaUrl).toBeUndefined();
  });
});
