/**
 * نظام الأفتارات المركزي
 * يحتوي على جميع الأفتارات المتاحة ودوال المساعدة
 */

// Import avatar images
const avatarMale1 = require("@/assets/images/avatar-male.png");
const avatarMale2 = require("@/assets/images/avatar-male-2.png");
const avatarMale3 = require("@/assets/images/avatar-male-3.png");
const avatarMale4 = require("@/assets/images/avatar-male-4.png");
const avatarFemale = require("@/assets/images/avatar-female.png");
const avatarNeutral = require("@/assets/images/avatar-neutral.png");

export interface AvatarOption {
  id: string;
  source: any;
  label: string;
}

/**
 * قائمة الأفتارات المتاحة للاختيار في واجهة التسجيل
 * الترتيب: 4 رجال + 1 أنثى + 1 محايد (الأخير)
 */
export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: "male", source: avatarMale1, label: "أفتار 1" },
  { id: "male2", source: avatarMale2, label: "أفتار 2" },
  { id: "male3", source: avatarMale3, label: "أفتار 3" },
  { id: "male4", source: avatarMale4, label: "أفتار 4" },
  { id: "female", source: avatarFemale, label: "أفتار أنثى" },
  { id: "neutral", source: avatarNeutral, label: "أفتار محايد" },
];

/**
 * الأفتار الافتراضي للمستمعين القادمين عبر رابط المشاركة
 */
export const DEFAULT_VIEWER_AVATAR = "neutral";

/**
 * دالة للحصول على مصدر صورة الأفتار من معرّفه
 */
export function getAvatarSourceById(avatarId: string | undefined | null): any {
  if (!avatarId) return avatarNeutral;
  
  const found = AVATAR_OPTIONS.find((opt) => opt.id === avatarId);
  if (found) return found.source;
  
  // إذا كان URI مخصص (رابط صورة)
  if (avatarId.startsWith("http") || avatarId.startsWith("file") || avatarId.startsWith("/")) {
    return { uri: avatarId };
  }
  
  // fallback
  return avatarMale1;
}
