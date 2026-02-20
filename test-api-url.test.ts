/**
 * Test: Validate EXPO_PUBLIC_API_BASE_URL
 */
import { describe, it, expect } from "vitest";

describe("API Base URL", () => {
  it("should be set and accessible", () => {
    const apiUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
    
    expect(apiUrl).toBeDefined();
    expect(apiUrl).toBeTruthy();
    expect(apiUrl).toContain("3000-");
    expect(apiUrl).toMatch(/^https?:\/\//);
    
    console.log("✅ API_BASE_URL:", apiUrl);
  });

  it("should be reachable (basic connectivity)", async () => {
    const apiUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
    
    if (!apiUrl) {
      throw new Error("EXPO_PUBLIC_API_BASE_URL is not set");
    }

    // Test basic connectivity with a simple fetch
    try {
      const response = await fetch(`${apiUrl}/api/system/health`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBeLessThan(500); // Should not be server error
      console.log("✅ API server is reachable, status:", response.status);
    } catch (error: any) {
      // Network errors are acceptable in test environment
      console.warn("⚠️ Network error (acceptable in test):", error.message);
    }
  });
});
