/**
 * مولّد ملف الشيلوها المدمج على الخادم
 * 
 * يأخذ الصوت الأصلي (بدون تسريع) وينشئ ملف شيلوها واحد يحتوي:
 * 1. تسريع الصوت بنسبة 1.08x
 * 2. تأثير الصفوف: 7 نسخ من الصوت بدرجات مختلفة (محاكاة جمهور)
 * 3. تصفيق إيقاعي متكرر (بناءً على تحليل الإيقاع الحقيقي للصوت)
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

// تسريع الشيلوها (الصفوف تردد أسرع من الأصلي)
const SHEELOHA_SPEED_FACTOR = 1.08;

/**
 * إعدادات تأثير الصفوف (7 نسخ - محاكاة جمهور أكبر)
 * 
 * نستخدم asetrate لتغيير pitch بدون rubberband:
 * - asetrate=44100*factor يغير pitch
 * - atempo=1/factor يعيد السرعة الأصلية
 * 
 * pitchFactor > 1 = صوت أعلى (أحد)
 * pitchFactor < 1 = صوت أخفض (أغلظ)
 */
const VOICE_COPIES = [
  { delay: 0, volume: 0.70, pitchFactor: 1.0   },  // صوت 1 - الأصلي (الأعلى)
  { delay: 0, volume: 0.55, pitchFactor: 1.0   },  // صوت 2 - أصلي
  { delay: 0, volume: 0.55, pitchFactor: 1.0   },  // صوت 3 - أصلي
  { delay: 0, volume: 0.55, pitchFactor: 1.0   },  // صوت 4 - أصلي
  { delay: 0, volume: 0.45, pitchFactor: 1.06  },  // صوت 5 - أعلى قليلاً (أحد)
  { delay: 0, volume: 0.40, pitchFactor: 0.94  },  // صوت 6 - أخفض قليلاً (أغلظ)
  { delay: 0, volume: 0.35, pitchFactor: 1.04  },  // صوت 7 - أعلى بقليل
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
 * تحليل الإيقاع الحقيقي للصوت باستخدام كشف النبضات (onset/beat detection)
 * 
 * الطريقة:
 * 1. استخراج مستويات الطاقة الصوتية (RMS) لكل إطار صغير (50ms)
 * 2. كشف القمم (peaks) التي تمثل نبضات الإيقاع
 * 3. حساب متوسط الفاصل بين النبضات = فاصل التصفيق
 * 
 * إذا فشل التحليل أو كان الصوت بدون إيقاع واضح، يُستخدم فاصل افتراضي
 */
async function analyzeRhythm(audioPath: string): Promise<number> {
  try {
    const duration = await getAudioDuration(audioPath);
    if (duration <= 0) return 0.75;

    // استخراج مستويات الطاقة (RMS) لكل إطار 50ms باستخدام ffmpeg astats
    // نحوّل الصوت إلى mono ونقسمه إلى إطارات صغيرة ونقيس الطاقة
    const frameSize = 0.05; // 50ms per frame
    const rmsCmd = `ffmpeg -i "${audioPath}" -af "asplit[a][b];[a]aresample=8000,astats=metadata=1:reset=${Math.round(1/frameSize)},ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-[out0];[b]anullsink" -f null - 2>/dev/null`;
    
    let rmsOutput = "";
    try {
      const { stdout } = await execAsync(rmsCmd, { maxBuffer: 50 * 1024 * 1024 });
      rmsOutput = stdout;
    } catch (e: any) {
      // ffmpeg قد يخرج بكود خطأ لكن الـ stdout يحتوي البيانات
      if (e.stdout) rmsOutput = e.stdout;
    }

    // تحليل مستويات RMS
    const rmsLines = rmsOutput.split("\n").filter(l => l.includes("lavfi.astats.Overall.RMS_level"));
    const rmsValues: number[] = [];
    
    for (const line of rmsLines) {
      const match = line.match(/=(-?[\d.]+)/);
      if (match) {
        const val = parseFloat(match[1]);
        if (!isNaN(val) && val > -100) { // تجاهل الصمت الكامل
          rmsValues.push(val);
        }
      }
    }

    console.log(`[SheelohaGenerator] RMS analysis: ${rmsValues.length} frames extracted`);

    if (rmsValues.length < 4) {
      // بيانات غير كافية - استخدام طريقة بديلة
      return estimateIntervalFromDuration(duration);
    }

    // كشف النبضات: البحث عن القمم في مستويات الطاقة
    // نبضة = إطار أعلى من المتوسط + أعلى من الإطارين المجاورين
    const avgRms = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
    const threshold = avgRms + 3; // 3dB فوق المتوسط
    
    const beatTimes: number[] = [];
    let lastBeatFrame = -10; // منع اكتشاف نبضتين متقاربتين جداً
    
    for (let i = 1; i < rmsValues.length - 1; i++) {
      const current = rmsValues[i];
      const prev = rmsValues[i - 1];
      const next = rmsValues[i + 1];
      
      // شرط النبضة: أعلى من العتبة + أعلى من الجيران + فاصل كافٍ عن النبضة السابقة
      if (current > threshold && current >= prev && current >= next && (i - lastBeatFrame) >= 4) {
        beatTimes.push(i * frameSize);
        lastBeatFrame = i;
      }
    }

    console.log(`[SheelohaGenerator] Detected ${beatTimes.length} beats in ${duration.toFixed(2)}s`);

    if (beatTimes.length >= 3) {
      // حساب الفواصل بين النبضات
      const intervals: number[] = [];
      for (let i = 1; i < beatTimes.length; i++) {
        intervals.push(beatTimes[i] - beatTimes[i - 1]);
      }
      
      // ترتيب الفواصل وأخذ الوسيط (median) لتجنب القيم الشاذة
      intervals.sort((a, b) => a - b);
      const medianInterval = intervals[Math.floor(intervals.length / 2)];
      
      // التأكد أن الفاصل في نطاق معقول للتصفيق (0.4 - 2.0 ثانية)
      // نطاق واسع ليتناسب مع الأصوات البطيئة والسريعة
      let clapInterval = medianInterval;
      while (clapInterval < 0.4) clapInterval *= 2;
      while (clapInterval > 2.0) clapInterval /= 2;
      
      console.log(`[SheelohaGenerator] Beat analysis: median interval=${medianInterval.toFixed(3)}s, clap interval=${clapInterval.toFixed(3)}s`);
      return clapInterval;
    }

    // لم نكتشف نبضات كافية - نجرب BPM estimation بطريقة أبسط
    return await estimateBPMSimple(audioPath, duration);
    
  } catch (error) {
    console.error("[SheelohaGenerator] Rhythm analysis failed:", error);
    return 0.75; // فاصل افتراضي آمن
  }
}

/**
 * تقدير BPM بطريقة بسيطة: تحليل الطاقة بنوافذ أكبر
 */
async function estimateBPMSimple(audioPath: string, duration: number): Promise<number> {
  try {
    // استخراج الطاقة بنوافذ 100ms
    const volCmd = `ffmpeg -i "${audioPath}" -af "volumedetect" -f null - 2>&1`;
    const { stdout: volOut } = await execAsync(volCmd, { maxBuffer: 10 * 1024 * 1024 });
    
    // استخراج mean_volume
    const meanMatch = volOut.match(/mean_volume:\s*(-?[\d.]+)/);
    if (meanMatch) {
      const meanVol = parseFloat(meanMatch[1]);
      // أصوات أعلى (أقرب لـ 0dB) عادة أسرع إيقاعاً
      // أصوات أهدأ (أبعد عن 0dB) عادة أبطأ
      if (meanVol > -15) {
        return 0.55; // إيقاع سريع نسبياً
      } else if (meanVol > -25) {
        return 0.70; // إيقاع متوسط
      } else {
        return 0.85; // إيقاع بطيء
      }
    }
  } catch {}
  
  return estimateIntervalFromDuration(duration);
}

/**
 * تقدير فاصل التصفيق من المدة فقط (الخطة الأخيرة)
 */
function estimateIntervalFromDuration(duration: number): number {
  // فاصل أطول = تصفيق أبطأ وأكثر طبيعية
  if (duration <= 3) return 0.70;
  if (duration <= 6) return 0.75;
  if (duration <= 10) return 0.80;
  return 0.85;
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
    
    // 1. تحليل الإيقاع الحقيقي للصوت المسرّع
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

    // === تأثير الصفوف: 7 نسخ من الصوت ===
    // تقسيم [0:a] إلى 7 نسخ باستخدام asplit
    const voiceSrcLabels = VOICE_COPIES.map((_, i) => `vsrc${i}`);
    filters.push(
      `[0:a]asplit=${VOICE_COPIES.length}${voiceSrcLabels.map(l => `[${l}]`).join("")}`
    );

    for (let i = 0; i < VOICE_COPIES.length; i++) {
      const v = VOICE_COPIES[i];
      
      if (v.pitchFactor === 1.0) {
        // الصوت الأصلي - بدون تغيير pitch
        filters.push(
          `[vsrc${i}]volume=${v.volume}[voice${i}]`
        );
      } else {
        // تغيير pitch باستخدام asetrate + aresample (متوافق مع كل ffmpeg)
        const newRate = Math.round(sampleRate * v.pitchFactor);
        const tempoCorrection = (1 / v.pitchFactor).toFixed(6);
        filters.push(
          `[vsrc${i}]asetrate=${newRate},atempo=${tempoCorrection},aresample=${sampleRate},volume=${v.volume}[voice${i}]`
        );
      }
      voiceOutputs.push(`[voice${i}]`);
    }

    // === التصفيق الإيقاعي المتكرر ===
    // نستخدم asplit لتقسيم إدخال التصفيقة الواحدة إلى عدة نسخ، ثم adelay لكل نسخة
    const numClaps = Math.floor(audioDuration / clapInterval);
    const effectiveClaps = Math.max(1, Math.min(numClaps, 15));
    
    if (effectiveClaps > 1) {
      // تقسيم إدخال التصفيقة إلى N نسخة
      const splitLabels = Array.from({ length: effectiveClaps }, (_, i) => `csrc${i}`);
      filters.push(
        `[1:a]asplit=${effectiveClaps}${splitLabels.map(l => `[${l}]`).join("")}`
      );
      
      // إضافة تأخير لكل تصفيقة بناءً على الإيقاع
      const clapOutputs: string[] = [];
      for (let c = 0; c < effectiveClaps; c++) {
        const clapTimeMs = Math.round(c * clapInterval * 1000);
        const clapLabel = `clap${c}`;
        
        if (clapTimeMs === 0) {
          filters.push(`[csrc${c}]volume=${CLAP_VOLUME}[${clapLabel}]`);
        } else {
          filters.push(`[csrc${c}]volume=${CLAP_VOLUME},adelay=${clapTimeMs}|${clapTimeMs}[${clapLabel}]`);
        }
        clapOutputs.push(`[${clapLabel}]`);
      }
      
      // دمج كل التصفيقات في مسار واحد
      filters.push(
        `${clapOutputs.join("")}amix=inputs=${clapOutputs.length}:duration=longest:normalize=0[allclaps]`
      );
    } else {
      // تصفيقة واحدة فقط
      filters.push(`[1:a]volume=${CLAP_VOLUME}[allclaps]`);
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

    console.log(`[SheelohaGenerator] Generating sheeloha with ${VOICE_COPIES.length} voices, ${effectiveClaps} claps (interval=${clapInterval.toFixed(3)}s), end claps at ${audioDuration.toFixed(2)}s`);
    
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
