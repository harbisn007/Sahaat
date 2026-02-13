import { describe, it, expect } from "vitest";

describe("API Base URL", () => {
  it("should have EXPO_PUBLIC_API_BASE_URL set", () => {
    const url = process.env.EXPO_PUBLIC_API_BASE_URL;
    expect(url).toBeDefined();
    expect(url).not.toBe("");
    expect(url).toContain("https://");
  });

  it("should reach the health endpoint", async () => {
    const url = process.env.EXPO_PUBLIC_API_BASE_URL;
    if (!url) throw new Error("EXPO_PUBLIC_API_BASE_URL not set");
    
    const response = await fetch(`${url}/api/health`);
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.ok).toBe(true);
  });
});
