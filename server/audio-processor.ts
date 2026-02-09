// معالجة الصوت باستخدام ffmpeg
// 1. إزالة الضوضاء (الأصوات غير البشرية)
// 2. تغيير درجة الصوت (pitch shift) - لجعل الصوت يبدو كشخص مختلف
// 3. تسريع صوت الطاروق بنسبة 1.15

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
 * إعدادات تغيير درجة الصوت (Pitch Shift)
 * 
 * يستخدم فلتر rubberband في ffmpeg لتغيير pitch بدون تغيير السرعة.
 * القيمة بالـ semitones (أنصاف النغمات):
 * - قيمة موجبة = صوت أحد/أعلى
 * - قيمة سالبة = صوت أغلظ/أعمق
 * 
 * النطاق المناسب للحصول على صوت بشري طبيعي مختلف: -3 إلى +3 semitones
 * أكثر من ذلك يبدأ الصوت يبدو غير طبيعي.
 * 
 * pitchShift = -2 يعني: نفس الكلام بنفس السرعة لكن بصوت أغلظ قليلاً
 * كأن شخص آخر بصوت أعمق يردد نفس البيت
 */
const PITCH_SHIFT_CONFIG = {
  // مقدار تغيير درجة الصوت بالـ semitones
  // -2 = أغلظ قليلاً (صوت رجل أعمق) - طبيعي ومختلف بوضوح
  semitones: -2,
};

/**
 * معالجة صوت الطاروق: إزالة الضوضاء → تغيير درجة الصوت → التسريع
 * 
 * المعالجة تتم على مرحلتين لأن rubberband و atempo لا يعملان معاً في سلسلة واحدة:
 * المرحلة 1: إزالة الضوضاء + pitch shift (rubberband)
 * المرحلة 2: التسريع (atempo)
 * 
 * @param inputBuffer - بيانات الصوت الأصلي (Buffer)
 * @param speedFactor - نسبة التسريع (1.15 = تسريع 15%)
 * @returns Buffer - الصوت المعالج (صوت مختلف + نظيف + مسرّع)
 */
export async function processAudio(
  inputBuffer: Buffer,
  speedFactor: number = 1.15
): Promise<Buffer> {
  const tempDir = os.tmpdir();
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(7);
  const inputPath = path.join(tempDir, `input-${timestamp}-${randomSuffix}.m4a`);
  const pitchPath = path.join(tempDir, `pitch-${timestamp}-${randomSuffix}.m4a`);
  const outputPath = path.join(tempDir, `output-${timestamp}-${randomSuffix}.m4a`);

  try {
    // حفظ الملف الأصلي
    await fs.promises.writeFile(inputPath, inputBuffer);

    // المرحلة 1: إزالة الضوضاء + تغيير درجة الصوت (pitch shift)
    // rubberband يغير pitch بدون تغيير السرعة - الصوت يبدو كشخص مختلف
    const noiseFilters = [
      `highpass=f=${NOISE_REDUCTION_CONFIG.highpassFreq}`,
      `lowpass=f=${NOISE_REDUCTION_CONFIG.lowpassFreq}`,
      `afftdn=nf=${NOISE_REDUCTION_CONFIG.noiseFloor}:nr=${NOISE_REDUCTION_CONFIG.noiseReduction}:nt=w`,
      `rubberband=pitch=${Math.pow(2, PITCH_SHIFT_CONFIG.semitones / 12).toFixed(6)}`,
    ].join(",");

    const pitchCommand = `ffmpeg -y -i "${inputPath}" -af "${noiseFilters}" -vn "${pitchPath}"`;
    
    console.log(`[AudioProcessor] Stage 1: Noise reduction + pitch shift (${PITCH_SHIFT_CONFIG.semitones} semitones)`);
    console.log(`[AudioProcessor] Filters: ${noiseFilters}`);
    
    await execAsync(pitchCommand);

    // المرحلة 2: التسريع
    const speedCommand = `ffmpeg -y -i "${pitchPath}" -filter:a "atempo=${speedFactor}" -vn "${outputPath}"`;
    
    console.log(`[AudioProcessor] Stage 2: Speed up ${speedFactor}x`);
    
    await execAsync(speedCommand);

    // قراءة الملف المعالج
    const outputBuffer = await fs.promises.readFile(outputPath);
    
    console.log(`[AudioProcessor] Audio processed successfully. Original: ${inputBuffer.length} bytes, Output: ${outputBuffer.length} bytes`);
    
    return outputBuffer;
  } catch (error) {
    console.error("[AudioProcessor] Failed to process audio with pitch shift:", error);
    // في حالة فشل rubberband، نحاول بدون pitch shift
    return processAudioFallback(inputBuffer, speedFactor, inputPath, outputPath);
  } finally {
    // تنظيف الملفات المؤقتة
    try {
      await fs.promises.unlink(inputPath).catch(() => {});
      await fs.promises.unlink(pitchPath).catch(() => {});
      await fs.promises.unlink(outputPath).catch(() => {});
    } catch {
      // تجاهل أخطاء الحذف
    }
  }
}

/**
 * خطة بديلة: إزالة الضوضاء + التسريع بدون pitch shift
 * تُستخدم إذا فشل rubberband
 */
async function processAudioFallback(
  inputBuffer: Buffer,
  speedFactor: number,
  inputPath: string,
  outputPath: string
): Promise<Buffer> {
  try {
    console.log("[AudioProcessor] Fallback: Processing without pitch shift");
    await fs.promises.writeFile(inputPath, inputBuffer);
    
    const filters = [
      `highpass=f=${NOISE_REDUCTION_CONFIG.highpassFreq}`,
      `lowpass=f=${NOISE_REDUCTION_CONFIG.lowpassFreq}`,
      `afftdn=nf=${NOISE_REDUCTION_CONFIG.noiseFloor}:nr=${NOISE_REDUCTION_CONFIG.noiseReduction}:nt=w`,
      `atempo=${speedFactor}`,
    ].join(",");

    const command = `ffmpeg -y -i "${inputPath}" -af "${filters}" -vn "${outputPath}"`;
    await execAsync(command);

    const outputBuffer = await fs.promises.readFile(outputPath);
    console.log(`[AudioProcessor] Fallback successful. Output: ${outputBuffer.length} bytes`);
    
    return outputBuffer;
  } catch (error) {
    console.error("[AudioProcessor] Fallback also failed:", error);
    // آخر محاولة: تسريع فقط
    return speedUpAudioOnly(inputBuffer, speedFactor, inputPath, outputPath);
  }
}

/**
 * تسريع الصوت فقط (بدون إزالة الضوضاء أو pitch shift) - كخطة أخيرة
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
    
    console.log(`[AudioProcessor] Last resort: Speeding up audio only by ${speedFactor}x`);
    await execAsync(command);

    const outputBuffer = await fs.promises.readFile(outputPath);
    console.log(`[AudioProcessor] Last resort successful. Output: ${outputBuffer.length} bytes`);
    
    return outputBuffer;
  } catch (error) {
    console.error("[AudioProcessor] All processing failed:", error);
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
