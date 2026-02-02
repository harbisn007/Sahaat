// معالجة الصوت باستخدام ffmpeg
// تسريع صوت الطاروق بنسبة 1.15

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

/**
 * تسريع الصوت باستخدام ffmpeg
 * @param inputBuffer - بيانات الصوت الأصلي (Buffer)
 * @param speedFactor - نسبة التسريع (1.15 = تسريع 15%)
 * @returns Buffer - الصوت المسرّع
 */
export async function speedUpAudio(
  inputBuffer: Buffer,
  speedFactor: number = 1.15
): Promise<Buffer> {
  // إنشاء مجلد مؤقت للملفات
  const tempDir = os.tmpdir();
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(7);
  const inputPath = path.join(tempDir, `input-${timestamp}-${randomSuffix}.m4a`);
  const outputPath = path.join(tempDir, `output-${timestamp}-${randomSuffix}.m4a`);

  try {
    // حفظ الملف الأصلي
    await fs.promises.writeFile(inputPath, inputBuffer);

    // تسريع الصوت باستخدام ffmpeg
    // atempo يقبل قيم بين 0.5 و 2.0
    // نستخدم -y لتجاوز الملف إذا كان موجوداً
    const command = `ffmpeg -y -i "${inputPath}" -filter:a "atempo=${speedFactor}" -vn "${outputPath}"`;
    
    console.log(`[AudioProcessor] Speeding up audio by ${speedFactor}x`);
    await execAsync(command);

    // قراءة الملف المسرّع
    const outputBuffer = await fs.promises.readFile(outputPath);
    
    console.log(`[AudioProcessor] Audio sped up successfully. Original: ${inputBuffer.length} bytes, Output: ${outputBuffer.length} bytes`);
    
    return outputBuffer;
  } catch (error) {
    console.error("[AudioProcessor] Failed to speed up audio:", error);
    // في حالة الفشل، نُرجع الصوت الأصلي
    return inputBuffer;
  } finally {
    // تنظيف الملفات المؤقتة
    try {
      await fs.promises.unlink(inputPath).catch(() => {});
      await fs.promises.unlink(outputPath).catch(() => {});
    } catch {
      // تجاهل أخطاء الحذف
    }
  }
}
