/**
 * مولّد ملف الشيلوها المدمج على الخادم
 * 
 * يأخذ ملف الطاروق المعالج (بعد التسريع وتغيير الصوت) وينشئ ملف شيلوها واحد يحتوي:
 * 1. تأثير الصفوف: 5 نسخ من الصوت بتأخيرات ودرجات مختلفة (محاكاة جمهور)
 * 2. تصفيق إيقاعي متكرر: بسرعة مبنية على تحليل الإيقاع التلقائي
 * 3. تصفيق ختامي: 4 تصفيقات بعد انتهاء الغناء
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

// مسارات ملفات التصفيق
const SINGLE_CLAP_PATH = path.join(__dirname, "sounds", "single-clap-short.mp3");
const END_CLAPS_PATH = path.join(__dirname, "sounds", "sheeloha-claps.mp3");

// مدة التصفيقة الواحدة (ثواني)
const SINGLE_CLAP_DURATION = 0.34;
// مدة التصفيق الختامي (ثواني)
const END_CLAPS_DURATION = 1.05;

/**
 * إعدادات تأثير الصفوف (5 نسخ من الصوت)
 * - delay: تأخير بالمللي ثانية (محاكاة عدم تزامن الجمهور)
 * - volume: مستوى الصوت
 * - pitchShift: تغيير درجة الصوت بالـ semitones (محاكاة أصوات مختلفة)
 * - tempo: تغيير طفيف في السرعة
 */
const VOICE_COPIES = [
  { delay: 0,    volume: 0.60, pitchShift: 0,     tempo: 1.00 },   // صوت 1 - الأصلي
  { delay: 0.035, volume: 0.55, pitchShift: 0.5,   tempo: 1.01 },  // صوت 2 - أعلى قليلاً
  { delay: 0.065, volume: 0.50, pitchShift: -0.6,  tempo: 0.99 },  // صوت 3 - أخفض قليلاً
  { delay: 0.025, volume: 0.52, pitchShift: 0.3,   tempo: 1.015 }, // صوت 4
  { delay: 0.050, volume: 0.48, pitchShift: -0.4,  tempo: 0.985 }, // صوت 5
];

const CLAP_VOLUME = 0.55;
const END_CLAP_VOLUME = 0.45;

/**
 * تحليل إيقاع الصوت واكتشاف الفاصل المناسب بين التصفيقات
 * يستخدم ffmpeg لاكتشاف onset (بدايات المقاطع الصوتية)
 * 
 * @param audioPath - مسار ملف الصوت المعالج
 * @returns الفاصل بالثواني بين التصفيقات (0.40 - 1.20)
 */
async function analyzeRhythm(audioPath: string): Promise<number> {
  const tempDir = os.tmpdir();
  const timestamp = Date.now();
  const onsetPath = path.join(tempDir, `onset-${timestamp}.txt`);

  try {
    // استخدام ffmpeg لاكتشاف onset detection
    // silencedetect يكتشف الفراغات بين المقاطع الصوتية
    const command = `ffprobe -f lavfi -i "amovie='${audioPath}',silencedetect=noise=-30dB:d=0.1" -show_entries frame_tags=lavfi.silence_start,lavfi.silence_end -of csv=p=0 2>&1 | head -50`;
    
    const { stdout } = await execAsync(command);
    
    // تحليل النتائج لاكتشاف الفواصل
    const lines = stdout.trim().split("\n").filter(l => l.trim());
    const silenceEnds: number[] = [];
    
    for (const line of lines) {
      // silence_end يمثل بداية مقطع صوتي جديد
      const match = line.match(/silence_end[,=]\s*([\d.]+)/);
      if (match) {
        silenceEnds.push(parseFloat(match[1]));
      }
    }

    if (silenceEnds.length >= 2) {
      // حساب الفواصل بين بدايات المقاطع
      const intervals: number[] = [];
      for (let i = 1; i < silenceEnds.length; i++) {
        const interval = silenceEnds[i] - silenceEnds[i - 1];
        if (interval > 0.3 && interval < 3.0) {
          intervals.push(interval);
        }
      }

      if (intervals.length > 0) {
        // استخدام الوسيط (أكثر استقراراً من المتوسط)
        intervals.sort((a, b) => a - b);
        const median = intervals[Math.floor(intervals.length / 2)];
        
        // ضبط في نطاق عجلة التحكم
        const clapInterval = Math.max(0.40, Math.min(1.20, median));
        console.log(`[SheelohaGenerator] Rhythm analysis: ${intervals.length} intervals, median=${median.toFixed(3)}s, clapInterval=${clapInterval.toFixed(2)}s`);
        return clapInterval;
      }
    }

    // طريقة بديلة: تحليل مدة الصوت وتقسيمها
    console.log("[SheelohaGenerator] Silence detection didn't yield enough data, trying duration-based analysis");
    
    const durationCmd = `ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`;
    const { stdout: durOut } = await execAsync(durationCmd);
    const duration = parseFloat(durOut.trim());
    
    if (duration > 0) {
      // تقدير عدد المقاطع بناءً على المدة (تقريباً مقطع كل 0.7 ثانية للشعر النبطي)
      const estimatedInterval = Math.max(0.40, Math.min(1.20, duration / Math.max(1, Math.round(duration / 0.72))));
      console.log(`[SheelohaGenerator] Duration-based estimate: duration=${duration.toFixed(2)}s, interval=${estimatedInterval.toFixed(2)}s`);
      return estimatedInterval;
    }

    // قيمة افتراضية
    console.log("[SheelohaGenerator] Using default rhythm interval: 0.72s");
    return 0.72;
  } catch (error) {
    console.error("[SheelohaGenerator] Rhythm analysis failed:", error);
    return 0.72; // قيمة افتراضية
  } finally {
    try { await fs.promises.unlink(onsetPath).catch(() => {}); } catch {}
  }
}

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
 * إنشاء ملف الشيلوها المدمج
 * 
 * @param processedAudioBuffer - الصوت المعالج (بعد التسريع وتغيير الصوت)
 * @returns Buffer - ملف الشيلوها المدمج
 */
export async function generateSheeloha(processedAudioBuffer: Buffer): Promise<Buffer> {
  const tempDir = os.tmpdir();
  const ts = Date.now();
  const rnd = Math.random().toString(36).substring(7);
  const prefix = `sheeloha-${ts}-${rnd}`;
  
  const inputPath = path.join(tempDir, `${prefix}-input.m4a`);
  const outputPath = path.join(tempDir, `${prefix}-output.m4a`);
  const tempFiles: string[] = [inputPath, outputPath];

  try {
    // حفظ الصوت المعالج
    await fs.promises.writeFile(inputPath, processedAudioBuffer);
    
    // 1. تحليل الإيقاع
    const clapInterval = await analyzeRhythm(inputPath);
    console.log(`[SheelohaGenerator] Clap interval: ${clapInterval}s`);
    
    // 2. الحصول على مدة الصوت
    const audioDuration = await getAudioDuration(inputPath);
    console.log(`[SheelohaGenerator] Audio duration: ${audioDuration}s`);
    
    // 3. بناء أمر ffmpeg المعقد لدمج كل شيء
    // 
    // المدخلات:
    // [0] = الصوت المعالج (الطاروق)
    // [1] = التصفيقة الواحدة
    // [2] = التصفيق الختامي
    //
    // المخرج: ملف واحد يحتوي كل التأثيرات مدمجة

    const inputs = [
      `-i "${inputPath}"`,        // [0] الصوت المعالج
      `-i "${SINGLE_CLAP_PATH}"`, // [1] التصفيقة الواحدة
      `-i "${END_CLAPS_PATH}"`,   // [2] التصفيق الختامي
    ];

    // بناء filter_complex
    const filters: string[] = [];
    const voiceOutputs: string[] = [];

    // === تأثير الصفوف: 5 نسخ من الصوت ===
    for (let i = 0; i < VOICE_COPIES.length; i++) {
      const v = VOICE_COPIES[i];
      const delayMs = Math.round(v.delay * 1000);
      const pitchFactor = Math.pow(2, v.pitchShift / 12).toFixed(6);
      
      // كل نسخة: تغيير pitch + تغيير سرعة طفيف + تأخير + ضبط صوت + lowpass للبُعد
      filters.push(
        `[0:a]rubberband=pitch=${pitchFactor},atempo=${v.tempo},volume=${v.volume},lowpass=f=2200:q=0.8,adelay=${delayMs}|${delayMs}[voice${i}]`
      );
      voiceOutputs.push(`[voice${i}]`);
    }

    // === التصفيق الإيقاعي المتكرر ===
    // حساب عدد التصفيقات خلال مدة الصوت
    const numClaps = Math.floor(audioDuration / clapInterval);
    
    // تحديد أقصى عدد تصفيقات منفصلة (لتجنب بطء ffmpeg)
    const MAX_INDIVIDUAL_CLAPS = 15;
    const effectiveClaps = Math.min(numClaps, MAX_INDIVIDUAL_CLAPS);

    if (effectiveClaps > 0) {
      // إنشاء تصفيقة متكررة باستخدام apad + atrim لتكرار التصفيقة بالإيقاع المطلوب
      // نضيف صمت بعد التصفيقة لتكوين دورة واحدة ثم نكررها
      const clapCycleDuration = clapInterval; // مدة الدورة = الفاصل بين التصفيقات
      const totalClapsDuration = audioDuration; // مدة التصفيق الكاملة
      const clapSampleRate = 44100;
      const clapCycleSamples = Math.round(clapCycleDuration * clapSampleRate);
      
      filters.push(
        `[1:a]apad=whole_dur=${clapCycleDuration},atrim=0:${clapCycleDuration},aloop=loop=${effectiveClaps - 1}:size=${clapCycleSamples},atrim=0:${totalClapsDuration},volume=${CLAP_VOLUME}[allclaps]`
      );
    }

    // === التصفيق الختامي ===
    // يبدأ بعد انتهاء الصوت مباشرة
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

    console.log(`[SheelohaGenerator] Generating sheeloha with ${VOICE_COPIES.length} voices, ${effectiveClaps} claps (interval=${clapInterval}s), end claps at ${audioDuration}s`);
    
    await execAsync(command, { maxBuffer: 50 * 1024 * 1024 });

    const outputBuffer = await fs.promises.readFile(outputPath);
    console.log(`[SheelohaGenerator] Sheeloha generated: ${outputBuffer.length} bytes`);
    
    return outputBuffer;
  } catch (error) {
    console.error("[SheelohaGenerator] Failed to generate sheeloha:", error);
    
    // خطة بديلة مبسطة: فقط الصوت الأصلي مع تصفيق ختامي
    try {
      return await generateSheelohaSimple(inputPath, outputPath, processedAudioBuffer);
    } catch (fallbackError) {
      console.error("[SheelohaGenerator] Fallback also failed:", fallbackError);
      // إرجاع الصوت الأصلي كما هو
      return processedAudioBuffer;
    }
  } finally {
    // تنظيف الملفات المؤقتة
    for (const f of tempFiles) {
      try { await fs.promises.unlink(f).catch(() => {}); } catch {}
    }
  }
}

/**
 * خطة بديلة مبسطة: الصوت مع lowpass + تصفيق ختامي فقط
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
    `-filter_complex "[0:a]volume=0.6,lowpass=f=2200[voice];[1:a]adelay=${endDelayMs}|${endDelayMs},volume=${END_CLAP_VOLUME}[endclap];[voice][endclap]amix=inputs=2:duration=longest:normalize=0[out]"`,
    `-map "[out]" -c:a aac -b:a 128k "${outputPath}"`,
  ].join(" ");
  
  await execAsync(command, { maxBuffer: 50 * 1024 * 1024 });
  return await fs.promises.readFile(outputPath);
}
