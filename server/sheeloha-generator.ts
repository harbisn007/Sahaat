/**
 * مولّد ملف الشيلوها المدمج على الخادم
 * 
 * يأخذ الصوت الأصلي (بدون تسريع) وينشئ ملف شيلوها واحد يحتوي:
 * 1. تسريع الصوت بنسبة 1.08x
 * 2. تأثير الصفوف: 3 نسخ من الصوت بدرجات مختلفة (محاكاة جمهور)
 * 3. تصفيق إيقاعي متكرر
 * 4. تصفيق ختامي بعد انتهاء الغناء
 * 
 * ملاحظة: يستخدم asetrate+atempo بدلاً من rubberband للتوافق مع جميع بيئات ffmpeg
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);

// حساب __dirname بطريقة تعمل في ESM و CJS
let currentDir: string;
try {
  // ESM (production build)
  currentDir = path.dirname(fileURLToPath(import.meta.url));
} catch {
  // CJS (tsx dev mode) - __dirname متاح
  currentDir = __dirname;
}

// مسارات ملفات التصفيق
const SINGLE_CLAP_PATH = path.join(currentDir, "sounds", "single-clap-short.mp3");
const END_CLAPS_PATH = path.join(currentDir, "sounds", "sheeloha-claps.mp3");

// مدة التصفيقة الواحدة (ثواني)
const SINGLE_CLAP_DURATION = 0.34;

// تسريع الشيلوها (الصفوف تردد أسرع من الأصلي)
const SHEELOHA_SPEED_FACTOR = 1.08;

/**
 * إعدادات تأثير الصفوف (3 نسخ فقط - أوضح وأنظف)
 * 
 * نستخدم asetrate لتغيير pitch بدون rubberband:
 * - asetrate=44100*factor يغير pitch
 * - atempo=1/factor يعيد السرعة الأصلية
 * 
 * pitchFactor > 1 = صوت أعلى (أحد)
 * pitchFactor < 1 = صوت أخفض (أغلظ)
 */
const VOICE_COPIES = [
  { delay: 0,    volume: 0.85, pitchFactor: 1.0   },  // صوت 1 - الأصلي (أعلى صوت)
  { delay: 0.06, volume: 0.55, pitchFactor: 1.06  },  // صوت 2 - أعلى قليلاً (أحد)
  { delay: 0.10, volume: 0.50, pitchFactor: 0.94  },  // صوت 3 - أخفض قليلاً (أغلظ)
];

const CLAP_VOLUME = 0.50;
const END_CLAP_VOLUME = 0.50;

/**
 * الحصول على مدة ملف صوتي بالثواني
 */
async function getAudioDuration(audioPath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`
  );
  return parseFloat(stdout.trim());
}

/**
 * تحليل إيقاع الصوت لتحديد الفاصل بين التصفيقات
 */
async function analyzeRhythm(audioPath: string): Promise<number> {
  try {
    const durationCmd = `ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`;
    const { stdout: durOut } = await execAsync(durationCmd);
    const duration = parseFloat(durOut.trim());
    
    if (duration > 0) {
      // فاصل تصفيق بين 0.45 و 0.90 ثانية حسب مدة الصوت
      const estimatedInterval = Math.max(0.45, Math.min(0.90, duration / Math.max(1, Math.round(duration / 0.65))));
      console.log(`[SheelohaGenerator] Duration: ${duration.toFixed(2)}s, clap interval: ${estimatedInterval.toFixed(2)}s`);
      return estimatedInterval;
    }
    return 0.65;
  } catch (error) {
    console.error("[SheelohaGenerator] Rhythm analysis failed:", error);
    return 0.65;
  }
}

/**
 * إنشاء ملف الشيلوها المدمج
 * 
 * @param originalAudioBuffer - الصوت الأصلي (بدون أي تسريع)
 * @returns Buffer - ملف الشيلوها المدمج
 */
export async function generateSheeloha(originalAudioBuffer: Buffer): Promise<Buffer> {
  const tempDir = os.tmpdir();
  const ts = Date.now();
  const rnd = Math.random().toString(36).substring(7);
  const prefix = `sheeloha-${ts}-${rnd}`;
  
  const inputPath = path.join(tempDir, `${prefix}-input.m4a`);
  const speedPath = path.join(tempDir, `${prefix}-speed.m4a`);
  const outputPath = path.join(tempDir, `${prefix}-output.m4a`);
  const tempFiles: string[] = [inputPath, speedPath, outputPath];

  try {
    // حفظ الصوت الأصلي
    await fs.promises.writeFile(inputPath, originalAudioBuffer);
    
    // === الخطوة 0: تسريع الصوت ===
    console.log(`[SheelohaGenerator] Step 0: Speed up by ${SHEELOHA_SPEED_FACTOR}x`);
    const speedCmd = `ffmpeg -y -i "${inputPath}" -filter:a "atempo=${SHEELOHA_SPEED_FACTOR}" -vn "${speedPath}"`;
    await execAsync(speedCmd, { maxBuffer: 50 * 1024 * 1024 });
    
    // 1. تحليل الإيقاع
    const clapInterval = await analyzeRhythm(speedPath);
    
    // 2. الحصول على مدة الصوت المسرّع
    const audioDuration = await getAudioDuration(speedPath);
    console.log(`[SheelohaGenerator] Audio duration (after speed): ${audioDuration}s`);
    
    // 3. الحصول على sample rate الأصلي
    let sampleRate = 44100;
    try {
      const srCmd = `ffprobe -i "${speedPath}" -show_entries stream=sample_rate -v quiet -of csv="p=0"`;
      const { stdout: srOut } = await execAsync(srCmd);
      const sr = parseInt(srOut.trim());
      if (sr > 0) sampleRate = sr;
    } catch {}
    
    // 4. بناء أمر ffmpeg
    const inputs = [
      `-i "${speedPath}"`,          // [0] الصوت المسرّع
      `-i "${SINGLE_CLAP_PATH}"`,   // [1] التصفيقة الواحدة
      `-i "${END_CLAPS_PATH}"`,     // [2] التصفيق الختامي
    ];

    const filters: string[] = [];
    const voiceOutputs: string[] = [];

    // === تأثير الصفوف: 3 نسخ من الصوت ===
    for (let i = 0; i < VOICE_COPIES.length; i++) {
      const v = VOICE_COPIES[i];
      const delayMs = Math.round(v.delay * 1000);
      
      if (v.pitchFactor === 1.0) {
        // الصوت الأصلي - بدون تغيير pitch
        if (delayMs > 0) {
          filters.push(
            `[0:a]volume=${v.volume},adelay=${delayMs}|${delayMs}[voice${i}]`
          );
        } else {
          filters.push(
            `[0:a]volume=${v.volume}[voice${i}]`
          );
        }
      } else {
        // تغيير pitch باستخدام asetrate + aresample (متوافق مع كل ffmpeg)
        // asetrate يغير pitch والسرعة معاً، ثم atempo يعيد السرعة
        const newRate = Math.round(sampleRate * v.pitchFactor);
        const tempoCorrection = (1 / v.pitchFactor).toFixed(6);
        
        if (delayMs > 0) {
          filters.push(
            `[0:a]asetrate=${newRate},atempo=${tempoCorrection},aresample=${sampleRate},volume=${v.volume},adelay=${delayMs}|${delayMs}[voice${i}]`
          );
        } else {
          filters.push(
            `[0:a]asetrate=${newRate},atempo=${tempoCorrection},aresample=${sampleRate},volume=${v.volume}[voice${i}]`
          );
        }
      }
      voiceOutputs.push(`[voice${i}]`);
    }

    // === التصفيق الإيقاعي المتكرر ===
    const numClaps = Math.floor(audioDuration / clapInterval);
    const effectiveClaps = Math.min(numClaps, 15);

    if (effectiveClaps > 0) {
      const clapCycleSamples = Math.round(clapInterval * sampleRate);
      
      filters.push(
        `[1:a]apad=whole_dur=${clapInterval},atrim=0:${clapInterval},aloop=loop=${effectiveClaps - 1}:size=${clapCycleSamples},atrim=0:${audioDuration},volume=${CLAP_VOLUME}[allclaps]`
      );
    }

    // === التصفيق الختامي ===
    const endClapDelayMs = Math.round(audioDuration * 1000);
    filters.push(
      `[2:a]adelay=${endClapDelayMs}|${endClapDelayMs},volume=${END_CLAP_VOLUME}[endclap]`
    );

    // === الدمج النهائي ===
    const allInputs = [...voiceOutputs];
    if (effectiveClaps > 0) {
      allInputs.push("[allclaps]");
    }
    allInputs.push("[endclap]");
    
    const totalInputs = allInputs.length;
    // normalize=0 يمنع التطبيع التلقائي الذي يسبب تشويه
    filters.push(
      `${allInputs.join("")}amix=inputs=${totalInputs}:duration=longest:normalize=0[out]`
    );

    const filterComplex = filters.join(";");
    
    const command = [
      "ffmpeg -y",
      ...inputs,
      `-filter_complex "${filterComplex}"`,
      `-map "[out]"`,
      `-c:a aac -b:a 128k`,
      `"${outputPath}"`,
    ].join(" ");

    console.log(`[SheelohaGenerator] Generating sheeloha with ${VOICE_COPIES.length} voices, ${effectiveClaps} claps (interval=${clapInterval.toFixed(2)}s), end claps at ${audioDuration.toFixed(2)}s`);
    
    await execAsync(command, { maxBuffer: 50 * 1024 * 1024 });

    const outputBuffer = await fs.promises.readFile(outputPath);
    console.log(`[SheelohaGenerator] Sheeloha generated: ${outputBuffer.length} bytes`);
    
    return outputBuffer;
  } catch (error) {
    console.error("[SheelohaGenerator] Failed to generate sheeloha:", error);
    
    // خطة بديلة مبسطة
    try {
      return await generateSheelohaSimple(inputPath, outputPath, originalAudioBuffer);
    } catch (fallbackError) {
      console.error("[SheelohaGenerator] Fallback also failed:", fallbackError);
      throw new Error("Failed to generate sheeloha: both main and fallback methods failed");
    }
  } finally {
    for (const f of tempFiles) {
      try { await fs.promises.unlink(f).catch(() => {}); } catch {}
    }
  }
}

/**
 * خطة بديلة مبسطة: الصوت مسرّع + تصفيق ختامي فقط (بدون صفوف)
 */
async function generateSheelohaSimple(
  inputPath: string,
  outputPath: string,
  originalBuffer: Buffer
): Promise<Buffer> {
  console.log("[SheelohaGenerator] Using simplified fallback");
  
  await fs.promises.writeFile(inputPath, originalBuffer);
  const duration = await getAudioDuration(inputPath);
  const endDelayMs = Math.round(duration * 1000);
  
  const command = [
    `ffmpeg -y -i "${inputPath}" -i "${END_CLAPS_PATH}"`,
    `-filter_complex "[0:a]atempo=${SHEELOHA_SPEED_FACTOR},volume=0.80[voice];[1:a]adelay=${endDelayMs}|${endDelayMs},volume=${END_CLAP_VOLUME}[endclap];[voice][endclap]amix=inputs=2:duration=longest:normalize=0[out]"`,
    `-map "[out]" -c:a aac -b:a 128k "${outputPath}"`,
  ].join(" ");
  
  await execAsync(command, { maxBuffer: 50 * 1024 * 1024 });
  return await fs.promises.readFile(outputPath);
}
