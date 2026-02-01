/**
 * Choir Effect - تأثير الجوقة (صوت الصفوف)
 * 
 * يقوم بإنشاء 10 نسخ معدلة من الصوت الأصلي لمحاكاة صوت مجموعة من الناس
 * تردد معاً بشكل طبيعي.
 * 
 * التأثيرات المطبقة:
 * 1. استنساخ الإشارة (10 نسخ)
 * 2. تعديل التوقيت (تأخير 15-35ms لكل نسخة)
 * 3. تغيير الحدة (±5-15 cents)
 * 4. التوزيع الفراغي (Stereo Panning)
 * 5. تعديل جرس الصوت (EQ variations)
 * 6. دمج الإشارات (40% dry / 60% wet)
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

// إعدادات تأثير الجوقة
const CHOIR_CONFIG = {
  numCopies: 10,           // عدد النسخ
  minDelay: 15,            // أقل تأخير (ميلي ثانية)
  maxDelay: 35,            // أكبر تأخير (ميلي ثانية)
  minPitchCents: -15,      // أقل تغيير في الحدة (سنت)
  maxPitchCents: 15,       // أكبر تغيير في الحدة (سنت)
  dryWetRatio: 0.4,        // نسبة الصوت الجاف (40%)
  // توزيع الـ Panning للنسخ العشر
  panPositions: [
    0,      // الأصلي - وسط
    -0.4,   // نسخة 1 - يسار 40%
    0.4,    // نسخة 2 - يمين 40%
    -0.8,   // نسخة 3 - يسار 80%
    0.8,    // نسخة 4 - يمين 80%
    -0.2,   // نسخة 5 - يسار 20%
    0.2,    // نسخة 6 - يمين 20%
    -0.6,   // نسخة 7 - يسار 60%
    0.6,    // نسخة 8 - يمين 60%
    0,      // نسخة 9 - وسط (مع تأثيرات مختلفة)
  ],
  // تعديلات EQ لكل نسخة (treble boost/cut)
  eqVariations: [
    0,      // الأصلي - بدون تعديل
    3,      // رفع الترددات العالية (قريب)
    -3,     // خفض الترددات العالية (بعيد)
    2,      // رفع خفيف
    -2,     // خفض خفيف
    4,      // رفع أكثر (قريب جداً)
    -4,     // خفض أكثر (بعيد جداً)
    1,      // رفع طفيف
    -1,     // خفض طفيف
    0,      // بدون تعديل
  ],
};

/**
 * توليد رقم عشوائي بين min و max
 */
function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * تحويل السنت إلى نسبة سرعة للـ pitch shift
 * 100 سنت = نصف نغمة
 * الصيغة: ratio = 2^(cents/1200)
 */
function centsToSpeedRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

/**
 * إنشاء مجلد مؤقت للعمل
 */
async function createTempDir(): Promise<string> {
  const tempDir = path.join(os.tmpdir(), `choir-effect-${Date.now()}`);
  await fs.promises.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * تنظيف المجلد المؤقت
 */
async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error("[ChoirEffect] Failed to cleanup temp dir:", error);
  }
}

/**
 * تحميل ملف صوتي من URL
 */
async function downloadAudio(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  await fs.promises.writeFile(outputPath, Buffer.from(buffer));
}

/**
 * تحويل الملف إلى WAV للمعالجة
 */
async function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  // استخدام ffmpeg لتحويل أي صيغة إلى WAV
  const cmd = `ffmpeg -y -i "${inputPath}" -ar 44100 -ac 2 -acodec pcm_s16le "${outputPath}"`;
  await execAsync(cmd);
}

/**
 * تحويل WAV إلى M4A للإخراج النهائي
 */
async function convertToM4a(inputPath: string, outputPath: string): Promise<void> {
  const cmd = `ffmpeg -y -i "${inputPath}" -c:a aac -b:a 128k "${outputPath}"`;
  await execAsync(cmd);
}

/**
 * إنشاء نسخة معدلة من الصوت باستخدام sox
 * 
 * @param inputPath مسار الملف الأصلي (WAV)
 * @param outputPath مسار الملف الناتج (WAV)
 * @param pitchCents تغيير الحدة بالسنت
 * @param delayMs التأخير بالميلي ثانية
 * @param pan موضع الـ Panning (-1 يسار، 0 وسط، 1 يمين)
 * @param trebleDb تعديل الترددات العالية بالديسيبل
 */
async function createModifiedCopy(
  inputPath: string,
  outputPath: string,
  pitchCents: number,
  delayMs: number,
  pan: number,
  trebleDb: number
): Promise<void> {
  // حساب نسبة السرعة للـ pitch shift
  const speedRatio = centsToSpeedRatio(pitchCents);
  
  // بناء أمر sox
  // 1. pitch shift باستخدام speed + rate (للحفاظ على المدة)
  // 2. delay للتأخير
  // 3. treble للـ EQ
  // 4. remix للـ panning
  
  // حساب قيم الـ panning للقناتين
  const leftGain = pan <= 0 ? 1 : 1 - pan;
  const rightGain = pan >= 0 ? 1 : 1 + pan;
  
  // sox يستخدم pitch بالسنت مباشرة
  let effects = [];
  
  // Pitch shift
  if (pitchCents !== 0) {
    effects.push(`pitch ${pitchCents}`);
  }
  
  // Delay (تحويل من ms إلى ثواني)
  if (delayMs > 0) {
    effects.push(`delay ${delayMs / 1000}`);
  }
  
  // Treble EQ
  if (trebleDb !== 0) {
    effects.push(`treble ${trebleDb}`);
  }
  
  // Panning (remix)
  if (pan !== 0) {
    effects.push(`remix ${leftGain.toFixed(2)},${rightGain.toFixed(2)}`);
  }
  
  const effectsStr = effects.join(" ");
  const cmd = `sox "${inputPath}" "${outputPath}" ${effectsStr}`;
  
  try {
    await execAsync(cmd);
  } catch (error: any) {
    console.error(`[ChoirEffect] Sox command failed: ${cmd}`);
    console.error(`[ChoirEffect] Error: ${error.message}`);
    // إذا فشل، نسخ الملف الأصلي
    await fs.promises.copyFile(inputPath, outputPath);
  }
}

/**
 * دمج جميع النسخ في ملف واحد
 */
async function mixAllCopies(
  originalPath: string,
  copyPaths: string[],
  outputPath: string,
  dryWetRatio: number
): Promise<void> {
  // حساب مستوى الصوت لكل ملف
  const dryVolume = dryWetRatio;
  const wetVolumePerCopy = (1 - dryWetRatio) / copyPaths.length;
  
  // بناء أمر sox للدمج
  // sox -m file1.wav file2.wav ... output.wav
  // مع تعديل مستوى الصوت لكل ملف
  
  const allFiles = [originalPath, ...copyPaths];
  const volumes = [dryVolume, ...copyPaths.map(() => wetVolumePerCopy)];
  
  // إنشاء ملفات مؤقتة مع تعديل مستوى الصوت
  const tempDir = path.dirname(outputPath);
  const adjustedFiles: string[] = [];
  
  for (let i = 0; i < allFiles.length; i++) {
    const adjustedPath = path.join(tempDir, `adjusted_${i}.wav`);
    const volume = volumes[i];
    const cmd = `sox "${allFiles[i]}" "${adjustedPath}" vol ${volume.toFixed(3)}`;
    
    try {
      await execAsync(cmd);
      adjustedFiles.push(adjustedPath);
    } catch (error) {
      console.error(`[ChoirEffect] Failed to adjust volume for file ${i}:`, error);
      adjustedFiles.push(allFiles[i]); // استخدام الملف الأصلي
    }
  }
  
  // دمج جميع الملفات
  const mixCmd = `sox -m ${adjustedFiles.map(f => `"${f}"`).join(" ")} "${outputPath}"`;
  
  try {
    await execAsync(mixCmd);
  } catch (error: any) {
    console.error("[ChoirEffect] Mix command failed:", error.message);
    // إذا فشل الدمج، نسخ الملف الأصلي
    await fs.promises.copyFile(originalPath, outputPath);
  }
  
  // تنظيف الملفات المؤقتة
  for (const file of adjustedFiles) {
    if (file !== originalPath && !copyPaths.includes(file)) {
      try {
        await fs.promises.unlink(file);
      } catch {}
    }
  }
}

/**
 * تطبيق تأثير الجوقة على ملف صوتي
 * 
 * @param audioUrl رابط الملف الصوتي الأصلي
 * @returns رابط الملف الصوتي المعالج (base64)
 */
export async function applyChoirEffect(audioUrl: string): Promise<{ 
  processedAudioBase64: string;
  format: string;
}> {
  console.log("[ChoirEffect] Starting choir effect processing...");
  console.log("[ChoirEffect] Input URL:", audioUrl);
  
  const tempDir = await createTempDir();
  console.log("[ChoirEffect] Temp dir:", tempDir);
  
  try {
    // 1. تحميل الملف الأصلي
    const originalPath = path.join(tempDir, "original.m4a");
    await downloadAudio(audioUrl, originalPath);
    console.log("[ChoirEffect] Downloaded original audio");
    
    // 2. تحويل إلى WAV
    const wavPath = path.join(tempDir, "original.wav");
    await convertToWav(originalPath, wavPath);
    console.log("[ChoirEffect] Converted to WAV");
    
    // 3. إنشاء النسخ المعدلة
    const copyPaths: string[] = [];
    
    for (let i = 0; i < CHOIR_CONFIG.numCopies; i++) {
      const copyPath = path.join(tempDir, `copy_${i}.wav`);
      
      // توليد قيم عشوائية للتأثيرات
      const pitchCents = randomBetween(CHOIR_CONFIG.minPitchCents, CHOIR_CONFIG.maxPitchCents);
      const delayMs = randomBetween(CHOIR_CONFIG.minDelay, CHOIR_CONFIG.maxDelay);
      const pan = CHOIR_CONFIG.panPositions[i] || 0;
      const trebleDb = CHOIR_CONFIG.eqVariations[i] || 0;
      
      console.log(`[ChoirEffect] Creating copy ${i + 1}/${CHOIR_CONFIG.numCopies}:`, {
        pitchCents: pitchCents.toFixed(1),
        delayMs: delayMs.toFixed(1),
        pan,
        trebleDb,
      });
      
      await createModifiedCopy(wavPath, copyPath, pitchCents, delayMs, pan, trebleDb);
      copyPaths.push(copyPath);
    }
    
    console.log("[ChoirEffect] Created all copies");
    
    // 4. دمج جميع النسخ
    const mixedWavPath = path.join(tempDir, "mixed.wav");
    await mixAllCopies(wavPath, copyPaths, mixedWavPath, CHOIR_CONFIG.dryWetRatio);
    console.log("[ChoirEffect] Mixed all copies");
    
    // 5. تحويل إلى M4A
    const outputPath = path.join(tempDir, "output.m4a");
    await convertToM4a(mixedWavPath, outputPath);
    console.log("[ChoirEffect] Converted to M4A");
    
    // 6. قراءة الملف الناتج كـ base64
    const outputBuffer = await fs.promises.readFile(outputPath);
    const base64Data = outputBuffer.toString("base64");
    
    console.log("[ChoirEffect] Processing complete!");
    console.log("[ChoirEffect] Output size:", outputBuffer.length, "bytes");
    
    return {
      processedAudioBase64: base64Data,
      format: "m4a",
    };
    
  } finally {
    // تنظيف المجلد المؤقت
    await cleanupTempDir(tempDir);
    console.log("[ChoirEffect] Cleaned up temp dir");
  }
}

/**
 * تطبيق تأثير الجوقة ورفع النتيجة إلى S3
 */
export async function processAndUploadChoirEffect(
  audioUrl: string,
  uploadToS3: (base64Data: string, fileName: string) => Promise<{ url: string }>
): Promise<{ url: string }> {
  const { processedAudioBase64, format } = await applyChoirEffect(audioUrl);
  
  const fileName = `choir-effect-${Date.now()}.${format}`;
  const result = await uploadToS3(processedAudioBase64, fileName);
  
  console.log("[ChoirEffect] Uploaded to S3:", result.url);
  
  return result;
}
