import { describe, it, expect } from "vitest";
import * as fs from "fs";

describe("Public Invite Button Fix", () => {
  const roomScreenContent = fs.readFileSync(
    "/home/ubuntu/sahaat-muhawara/app/room/[id].tsx",
    "utf-8"
  );

  it("should NOT use Alert.prompt (iOS only)", () => {
    // Alert.prompt is iOS-only and doesn't work on Android/Web
    expect(roomScreenContent).not.toContain("Alert.prompt");
  });

  it("should use a Modal for public invite input", () => {
    // Verify Modal-based approach is used
    expect(roomScreenContent).toContain("showPublicInviteModal");
    expect(roomScreenContent).toContain("setShowPublicInviteModal(true)");
    expect(roomScreenContent).toContain("confirmSendPublicInvite");
  });

  it("should import TextInput from react-native", () => {
    expect(roomScreenContent).toContain("TextInput");
    // Verify it's in the import statement
    expect(roomScreenContent).toMatch(/import\s*{[^}]*TextInput[^}]*}\s*from\s*["']react-native["']/);
  });

  it("should have a TextInput with maxLength 12", () => {
    expect(roomScreenContent).toContain("maxLength={12}");
  });

  it("should have cancel and send buttons in the modal", () => {
    expect(roomScreenContent).toContain("إلغاء");
    expect(roomScreenContent).toContain("إرسال");
  });

  it("should have publicInviteText state with default value", () => {
    expect(roomScreenContent).toContain("publicInviteText");
    expect(roomScreenContent).toContain("وين الشعّار؟");
  });
});
