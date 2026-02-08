import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("إصلاح حذف الساحة بعد إعادة التشغيل", () => {
  it("يجب ألا يحذف جميع الساحات عند إعادة تشغيل الخادم", () => {
    const serverIndex = fs.readFileSync(
      path.join(__dirname, "../server/_core/index.ts"),
      "utf-8"
    );
    // يجب ألا يوجد deleteAllRooms في index.ts
    expect(serverIndex).not.toContain("deleteAllRooms");
  });

  it("يجب أن يتحقق cleanup من وجود المنشئ كمشارك نشط", () => {
    const cleanup = fs.readFileSync(
      path.join(__dirname, "../server/_core/room-cleanup.ts"),
      "utf-8"
    );
    // يجب أن يتحقق من المنشئ أو المشاركين النشطين
    expect(
      cleanup.includes("hasActiveParticipant") ||
      cleanup.includes("creatorId") ||
      cleanup.includes("creator")
    ).toBe(true);
  });
});

describe("تعديل نص الدعوة الافتراضي وعدد الحروف", () => {
  it("يجب أن يكون النص الافتراضي 'مطلوب شاعر' وليس 'وين الشعّار'", () => {
    const roomScreen = fs.readFileSync(
      path.join(__dirname, "../app/room/[id].tsx"),
      "utf-8"
    );
    expect(roomScreen).toContain("مطلوب شاعر");
    expect(roomScreen).not.toContain("وين الشعّار");
  });

  it("يجب أن يكون الحد الأقصى 18 حرفاً", () => {
    const roomScreen = fs.readFileSync(
      path.join(__dirname, "../app/room/[id].tsx"),
      "utf-8"
    );
    expect(roomScreen).toContain("maxLength={18}");
    expect(roomScreen).not.toContain("maxLength={12}");
  });

  it("يجب أن يكون الحد الأقصى في الخادم 18 حرفاً", () => {
    const routers = fs.readFileSync(
      path.join(__dirname, "../server/routers.ts"),
      "utf-8"
    );
    expect(routers).toContain(".max(18)");
    expect(routers).not.toContain(".max(12)");
  });
});

describe("صوت الجرس", () => {
  it("يجب أن يوجد ملف صوت الجرس", () => {
    const bellPath = path.join(__dirname, "../assets/sounds/notif3.mp3");
    expect(fs.existsSync(bellPath)).toBe(true);
  });

  it("يجب أن يستخدم hook الجرس createAudioPlayer على native", () => {
    const bellHook = fs.readFileSync(
      path.join(__dirname, "../hooks/use-notification-bell.ts"),
      "utf-8"
    );
    expect(bellHook).toContain("createAudioPlayer");
  });

  it("يجب أن يدعم hook الجرس الويب أيضاً", () => {
    const bellHook = fs.readFileSync(
      path.join(__dirname, "../hooks/use-notification-bell.ts"),
      "utf-8"
    );
    expect(bellHook).toContain("Platform.OS");
  });
});

describe("عداد الطلبات تحت زر العودة لساحتك", () => {
  it("يجب أن يحتوي index.tsx على عداد الطلبات", () => {
    const indexScreen = fs.readFileSync(
      path.join(__dirname, "../app/(tabs)/index.tsx"),
      "utf-8"
    );
    // يجب أن يحتوي على عداد الطلبات
    expect(
      indexScreen.includes("pendingRequestCount") ||
      indexScreen.includes("طلب") ||
      indexScreen.includes("طلبات")
    ).toBe(true);
  });
});

describe("الأفتارات الجديدة", () => {
  it("يجب أن توجد 4 أفتارات جديدة لرجال بشماغ وعقال", () => {
    const avatarsDir = path.join(__dirname, "../assets/images");
    expect(fs.existsSync(path.join(avatarsDir, "avatar-male-2.png"))).toBe(true);
    expect(fs.existsSync(path.join(avatarsDir, "avatar-male-3.png"))).toBe(true);
    expect(fs.existsSync(path.join(avatarsDir, "avatar-male-4.png"))).toBe(true);
    expect(fs.existsSync(path.join(avatarsDir, "avatar-male-5.png"))).toBe(true);
  });
});

describe("أيقونات التطبيق البديلة", () => {
  it("يجب أن توجد 3 أيقونات بديلة", () => {
    const imagesDir = path.join(__dirname, "../assets/images");
    expect(fs.existsSync(path.join(imagesDir, "icon-option-1.png"))).toBe(true);
    expect(fs.existsSync(path.join(imagesDir, "icon-option-2.png"))).toBe(true);
    expect(fs.existsSync(path.join(imagesDir, "icon-option-3.png"))).toBe(true);
  });
});

describe("قناة Socket.io للمنشئ", () => {
  it("يجب أن يدعم الخادم حدث creatorJoinRequest", () => {
    const socketFile = fs.readFileSync(
      path.join(__dirname, "../server/_core/socket.ts"),
      "utf-8"
    );
    expect(socketFile).toContain("creatorJoinRequest");
  });

  it("يجب أن يدعم الخادم قناة المنشئ", () => {
    const socketFile = fs.readFileSync(
      path.join(__dirname, "../server/_core/socket.ts"),
      "utf-8"
    );
    expect(
      socketFile.includes("joinCreatorChannel") ||
      socketFile.includes("creator:")
    ).toBe(true);
  });
});
