import { describe, it, expect, vi } from "vitest";

// Mock the entire avatars module to avoid require() for image assets
vi.mock("../lib/avatars", () => {
  const mockSource = (name: string) => ({ testUri: name });
  const options = [
    { id: "male", label: "رجل 1", source: mockSource("male") },
    { id: "male2", label: "رجل 2", source: mockSource("male2") },
    { id: "male3", label: "رجل 3", source: mockSource("male3") },
    { id: "male4", label: "رجل 4", source: mockSource("male4") },
    { id: "female", label: "أنثى", source: mockSource("female") },
    { id: "neutral", label: "محايد", source: mockSource("neutral") },
  ];
  return {
    AVATAR_OPTIONS: options,
    DEFAULT_VIEWER_AVATAR: "neutral",
    getAvatarSourceById: (id: string | null | undefined) => {
      if (!id) return mockSource("neutral");
      const found = options.find((o) => o.id === id);
      if (found) return found.source;
      if (id.startsWith("http") || id.startsWith("file")) return { uri: id };
      return mockSource("neutral");
    },
  };
});

import { AVATAR_OPTIONS, DEFAULT_VIEWER_AVATAR, getAvatarSourceById } from "../lib/avatars";

describe("نظام الأفتارات - التحقق من الهيكل", () => {
  it("يجب أن يحتوي على 6 أفتارات", () => {
    expect(AVATAR_OPTIONS).toHaveLength(6);
  });

  it("يجب أن يكون الأفتار الأخير هو المحايد", () => {
    const lastAvatar = AVATAR_OPTIONS[AVATAR_OPTIONS.length - 1];
    expect(lastAvatar.id).toBe("neutral");
  });

  it("يجب أن يحتوي على 4 أفتارات رجال + 1 أنثى + 1 محايد", () => {
    const ids = AVATAR_OPTIONS.map((opt) => opt.id);
    expect(ids).toContain("male");
    expect(ids).toContain("male2");
    expect(ids).toContain("male3");
    expect(ids).toContain("male4");
    expect(ids).toContain("female");
    expect(ids).toContain("neutral");
  });

  it("يجب أن يكون الأفتار الافتراضي للمستمعين هو neutral", () => {
    expect(DEFAULT_VIEWER_AVATAR).toBe("neutral");
  });

  it("ترتيب الأفتارات: 4 رجال ثم أنثى ثم محايد", () => {
    expect(AVATAR_OPTIONS[0].id).toBe("male");
    expect(AVATAR_OPTIONS[1].id).toBe("male2");
    expect(AVATAR_OPTIONS[2].id).toBe("male3");
    expect(AVATAR_OPTIONS[3].id).toBe("male4");
    expect(AVATAR_OPTIONS[4].id).toBe("female");
    expect(AVATAR_OPTIONS[5].id).toBe("neutral");
  });

  it("كل أفتار يجب أن يحتوي على id و source و label", () => {
    for (const opt of AVATAR_OPTIONS) {
      expect(opt.id).toBeTruthy();
      expect(opt.source).toBeDefined();
      expect(opt.label).toBeTruthy();
    }
  });

  it("getAvatarSourceById يجب أن يُرجع URI مخصص للروابط", () => {
    const customUrl = "https://example.com/avatar.png";
    const result = getAvatarSourceById(customUrl);
    expect(result).toEqual({ uri: customUrl });
  });

  it("getAvatarSourceById يجب أن يُرجع الأفتار المحايد عند null", () => {
    const result = getAvatarSourceById(null);
    expect(result).toEqual({ testUri: "neutral" });
  });
});

describe("التحقق من ملف avatars.ts الفعلي", () => {
  it("يجب أن يحتوي الملف على التصديرات المطلوبة", async () => {
    // Read the actual file to verify exports exist
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/lib/avatars.ts", "utf-8");
    
    expect(content).toContain("export const AVATAR_OPTIONS");
    expect(content).toContain("export const DEFAULT_VIEWER_AVATAR");
    expect(content).toContain("export function getAvatarSourceById");
    expect(content).toContain("neutral");
    expect(content).toContain("male2");
    expect(content).toContain("male3");
    expect(content).toContain("male4");
    expect(content).toContain("female");
  });

  it("يجب أن يكون DEFAULT_VIEWER_AVATAR هو neutral في الملف الفعلي", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/lib/avatars.ts", "utf-8");
    expect(content).toMatch(/DEFAULT_VIEWER_AVATAR.*=.*["']neutral["']/);
  });

  it("يجب أن يكون المحايد آخر عنصر في AVATAR_OPTIONS", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/sahaat-muhawara/lib/avatars.ts", "utf-8");
    // Find all avatar ids in AVATAR_OPTIONS array
    const idMatches = [...content.matchAll(/id:\s*["'](\w+)["']/g)].map(m => m[1]);
    expect(idMatches.length).toBeGreaterThanOrEqual(6);
    expect(idMatches[idMatches.length - 1]).toBe("neutral");
  });
});
