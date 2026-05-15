/**
 * Sheeloha Generator - server side
 * يُستخدم كـ endpoint احتياطي فقط
 * التشغيل الفعلي يتم محلياً في العميل عبر use-sheeloha-player.ts
 */

import { storagePut } from "./storage";

export interface SheelohaOptions {
  taroukBase64: string;
  taroukDuration: number;
}

export async function generateSheeloha(options: SheelohaOptions): Promise<string> {
  // التشغيل المحلي أصبح هو الأساس - هذا الـ endpoint غير مستخدم
  throw new Error("Local playback is now used instead of server-side generation");
}
