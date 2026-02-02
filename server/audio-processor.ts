// معالجة الصوت باستخدام ffmpeg
// 1. إزالة الضوضاء (الأصوات غير البشرية)
// 2. تسريع صوت الطاروق بنسبة 1.15

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

/**
 * إعدادات إزالة الضوضاء
 * - highpass: إزالة الترددات المنخفضة (ضوضاء المكيف، السيارات، الهمهمة)
 * - lowpass: إزالة الترددات العالية جداً (صفير، ضوضاء إلكترونية)
 * - afftdn: فلتر إزالة الضوضاء المتقدم (FFT-based)
 */
const NOISE_REDUCTION_CONFIG = {
  // إزالة الترددات تحت 80Hz (ضوضاء منخفضة مثل المكيف والسيارات)
  highpassFreq: 80,
  // إزالة الترددات فوق 8000Hz (ضوضاء عالية)
  lowpassFreq: 8000,
  // قوة إزالة الضوضاء (0-100) - 12 قيمة معتدلة للحفاظ على جودة الصوت
  noiseReduction: 12,
  // عتبة الضوضاء بالديسيبل
  noiseFloor: -25,
};

/**
 * معالجة صوت الطاروق: إزالة الضوضاء ثم التسريع
 * @param inputBuffer - بيانات الصوت الأصلي (Buffer)
 * @param speedFactor - نسبة التسريع (1.15 = تسريع 15%)
 * @returns Buffer - الصوت المعالج (نظيف ومسرّع)
 */
export async function processAudio(
  inputBuffer: Buffer,
  speedFactor: number = 1.15
): Promise<Buffer> {
  const tempDir = os.tmpdir();
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(7);
  const inputPath = path.join(tempDir, `input-${timestamp}-${randomSuffix}.m4a`);
  const outputPath = path.join(tempDir, `output-${timestamp}-${randomSuffix}.m4a`);

  try {
    // حفظ الملف الأصلي
    await fs.promises.writeFile(inputPath, inputBuffer);

    // بناء سلسلة الفلاتر:
    // 1. highpass - إزالة الترددات المنخفضة
    // 2. lowpass - إزالة الترددات العالية جداً
    // 3. afftdn - إزالة الضوضاء المتقدمة
    // 4. atempo - التسريع
    const filters = [
      `highpass=f=${NOISE_REDUCTION_CONFIG.highpassFreq}`,
      `lowpass=f=${NOISE_REDUCTION_CONFIG.lowpassFreq}`,
      `afftdn=nf=${NOISE_REDUCTION_CONFIG.noiseFloor}:nr=${NOISE_REDUCTION_CONFIG.noiseReduction}:nt=w`,
      `atempo=${speedFactor}`,
    ].join(",");

    const command = `ffmpeg -y -i "${inputPath}" -af "${filters}" -vn "${outputPath}"`;
    
    console.log(`[AudioProcessor] Processing audio: noise reduction + speed ${speedFactor}x`);
    console.log(`[AudioProcessor] Filters: ${filters}`);
    
    await execAsync(command);

    // قراءة الملف المعالج
    const outputBuffer = await fs.promises.readFile(outputPath);
    
    console.log(`[AudioProcessor] Audio processed successfully. Original: ${inputBuffer.length} bytes, Output: ${outputBuffer.length} bytes`);
    
    return outputBuffer;
  } catch (error) {
    console.error("[AudioProcessor] Failed to process audio:", error);
    // في حالة الفشل، نحاول التسريع فقط بدون إزالة الضوضاء
    return speedUpAudioOnly(inputBuffer, speedFactor, inputPath, outputPath);
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

/**
 * تسريع الصوت فقط (بدون إزالة الضوضاء) - كخطة بديلة
 */
async function speedUpAudioOnly(
  inputBuffer: Buffer,
  speedFactor: number,
  inputPath: string,
  outputPath: string
): Promise<Buffer> {
  try {
    await fs.promises.writeFile(inputPath, inputBuffer);
    const command = `ffmpeg -y -i "${inputPath}" -filter:a "atempo=${speedFactor}" -vn "${outputPath}"`;
    
    console.log(`[AudioProcessor] Fallback: Speeding up audio only by ${speedFactor}x`);
    await execAsync(command);

    const outputBuffer = await fs.promises.readFile(outputPath);
    console.log(`[AudioProcessor] Fallback successful. Output: ${outputBuffer.length} bytes`);
    
    return outputBuffer;
  } catch (error) {
    console.error("[AudioProcessor] Fallback also failed:", error);
    return inputBuffer;
  }
}

/**
 * تسريع الصوت فقط (للتوافق مع الكود القديم)
 * @deprecated استخدم processAudio بدلاً منها
 */
export async function speedUpAudio(
  inputBuffer: Buffer,
  speedFactor: number = 1.15
): Promise<Buffer> {
  return processAudio(inputBuffer, speedFactor);
}
