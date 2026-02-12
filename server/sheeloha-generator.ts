/**
 * مولّد ملف الشيلوها المدمج على الخادم
 * 
 * يأخذ ملف الطاروق المعالج (بعد التسريع وتغيير الصوت) وينشئ ملف شيلوها واحد يحتوي:
 * 1. تأثير الصفوف: 5 نسخ من الصوت بتأخيرات ودرجات مختلفة (محاكاة جمهور)
 * 2. تصفيق إيقاعي متكرر: بسرعة مبنية على تحليل الإيقاع التلقائي
 * 3. تصفيق ختامي: 4 تصفيقات بعد انتهاء الغناء
 * 
 * ملاحظة مهمة: يجب أن يكون الفرق واضحاً وملموساً بين الطاروق الأصلي والشيلوها
 * الشيلوها = صوت جماعي (5 أشخاص) مسرّع مع تصفيقات
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
 * 
 * التعديلات الجديدة: تأثيرات أقوى وأوضح لمحاكاة 5 أشخاص مختلفين
 * - delay: تأخير أكبر (محاكاة عدم تزامن حقيقي بين الأشخاص)
 * - volume: مستوى صوت أعلى لكل نسخة
 * - pitchShift: تغيير أكبر في درجة الصوت (أصوات مختلفة بوضوح)
 * - tempo: تغيير أكبر في السرعة (عدم تزامن طبيعي)
 */
const VOICE_COPIES = [
  { delay: 0,     volume: 0.75, pitchShift: 0,     tempo: 1.00 },   // صوت 1 - الأصلي (أعلى صوت)
  { delay: 0.08,  volume: 0.70, pitchShift: 1.5,   tempo: 1.03 },   // صوت 2 - أعلى بوضوح (أحد)
  { delay: 0.15,  volume: 0.65, pitchShift: -1.8,  tempo: 0.97 },   // صوت 3 - أخفض بوضوح (أغلظ)
  { delay: 0.06,  volume: 0.68, pitchShift: 0.8,   tempo: 1.02 },   // صوت 4 - أعلى قليلاً
  { delay: 0.12,  volume: 0.62, pitchShift: -1.0,  tempo: 0.985 },  // صوت 5 - أخفض قليلاً
];

const CLAP_VOLUME = 0.65;
const END_CLAP_VOLUME = 0.55;

// تسريع إضافي للشيلوها (الصفوف تردد أسرع من الأصلي)
const SHEELOHA_SPEED_FACTOR = 1.08;

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
    const command = `ffprobe -f lavfi -i "amovie='${audioPath}',silencedetect=noise=-30dB:d=0.1" -show_entries frame_tags=lavfi.silence_start,lavfi.silence_end -of csv=p=0 2>&1 | head -50`;
    
    const { stdout } = await execAsync(command);
    
    const lines = stdout.trim().split("\n").filter(l => l.trim());
    const silenceEnds: number[] = [];
    
    for (const line of lines) {
      const match = line.match(/silence_end[,=]\s*([\d.]+)/);
      if (match) {
        silenceEnds.push(parseFloat(match[1]));
      }
    }

    if (silenceEnds.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < silenceEnds.length; i++) {
        const interval = silenceEnds[i] - silenceEnds[i - 1];
        if (interval > 0.3 && interval < 3.0) {
          intervals.push(interval);
        }
      }

      if (intervals.length > 0) {
        intervals.sort((a, b) => a - b);
        const median = intervals[Math.floor(intervals.length / 2)];
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
      const estimatedInterval = Math.max(0.40, Math.min(1.20, duration / Math.max(1, Math.round(duration / 0.72))));
      console.log(`[SheelohaGenerator] Duration-based estimate: duration=${duration.toFixed(2)}s, interval=${estimatedInterval.toFixed(2)}s`);
      return estimatedInterval;
    }

    console.log("[SheelohaGenerator] Using default rhythm interval: 0.72s");
    return 0.72;
  } catch (error) {
    console.error("[SheelohaGenerator] Rhythm analysis failed:", error);
    return 0.72;
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
 * الخطوات:
 * 1. تسريع الصوت الأصلي بنسبة إضافية (الصفوف تردد أسرع)
 * 2. إنشاء 5 نسخ بدرجات صوت مختلفة وتأخيرات
 * 3. إضافة تصفيق إيقاعي متكرر
 * 4. إضافة تصفيق ختامي
 * 5. دمج الكل في ملف واحد
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
  const speedPath = path.join(tempDir, `${prefix}-speed.m4a`);
  const outputPath = path.join(tempDir, `${prefix}-output.m4a`);
  const tempFiles: string[] = [inputPath, speedPath, outputPath];

  try {
    // حفظ الصوت المعالج
    await fs.promises.writeFile(inputPath, processedAudioBuffer);
    
    // === الخطوة 0: تسريع الصوت الأصلي إضافياً للشيلوها ===
    // الصفوف تردد أسرع من المغني الأصلي
    console.log(`[SheelohaGenerator] Step 0: Speed up by ${SHEELOHA_SPEED_FACTOR}x for sheeloha`);
    const speedCmd = `ffmpeg -y -i "${inputPath}" -filter:a "atempo=${SHEELOHA_SPEED_FACTOR}" -vn "${speedPath}"`;
    await execAsync(speedCmd, { maxBuffer: 50 * 1024 * 1024 });
    
    // 1. تحليل الإيقاع (على الصوت المسرّع)
    const clapInterval = await analyzeRhythm(speedPath);
    console.log(`[SheelohaGenerator] Clap interval: ${clapInterval}s`);
    
    // 2. الحصول على مدة الصوت المسرّع
    const audioDuration = await getAudioDuration(speedPath);
    console.log(`[SheelohaGenerator] Audio duration (after speed): ${audioDuration}s`);
    
    // 3. بناء أمر ffmpeg المعقد لدمج كل شيء
    // 
    // المدخلات:
    // [0] = الصوت المسرّع (للصفوف)
    // [1] = التصفيقة الواحدة
    // [2] = التصفيق الختامي
    //
    // المخرج: ملف واحد يحتوي كل التأثيرات مدمجة

    const inputs = [
      `-i "${speedPath}"`,          // [0] الصوت المسرّع
      `-i "${SINGLE_CLAP_PATH}"`,   // [1] التصفيقة الواحدة
      `-i "${END_CLAPS_PATH}"`,     // [2] التصفيق الختامي
    ];

    // بناء filter_complex
    const filters: string[] = [];
    const voiceOutputs: string[] = [];

    // === تأثير الصفوف: 5 نسخ من الصوت ===
    // كل نسخة تمثل شخصاً مختلفاً يردد نفس البيت
    for (let i = 0; i < VOICE_COPIES.length; i++) {
      const v = VOICE_COPIES[i];
      const delayMs = Math.round(v.delay * 1000);
      const pitchFactor = Math.pow(2, v.pitchShift / 12).toFixed(6);
      
      // كل نسخة: تغيير pitch + تغيير سرعة طفيف + تأخير + ضبط صوت
      // lowpass عند 3500Hz (بدلاً من 2200) للحفاظ على وضوح الصوت مع إعطاء تأثير البُعد
      // إضافة reverb خفيف عبر aecho لمحاكاة الفضاء المفتوح
      if (i === 0) {
        // الصوت الأول (الأصلي) - بدون lowpass للحفاظ على الوضوح
        filters.push(
          `[0:a]rubberband=pitch=${pitchFactor},atempo=${v.tempo},volume=${v.volume},aecho=0.8:0.7:20:0.3,adelay=${delayMs}|${delayMs}[voice${i}]`
        );
      } else {
        // الأصوات الأخرى - lowpass خفيف + echo للبُعد
        filters.push(
          `[0:a]rubberband=pitch=${pitchFactor},atempo=${v.tempo},volume=${v.volume},lowpass=f=3500,aecho=0.8:0.6:${15 + i * 8}:0.25,adelay=${delayMs}|${delayMs}[voice${i}]`
        );
      }
      voiceOutputs.push(`[voice${i}]`);
    }

    // === التصفيق الإيقاعي المتكرر ===
    const numClaps = Math.floor(audioDuration / clapInterval);
    const MAX_INDIVIDUAL_CLAPS = 20;
    const effectiveClaps = Math.min(numClaps, MAX_INDIVIDUAL_CLAPS);

    if (effectiveClaps > 0) {
      const clapCycleDuration = clapInterval;
      const totalClapsDuration = audioDuration;
      const clapSampleRate = 44100;
      const clapCycleSamples = Math.round(clapCycleDuration * clapSampleRate);
      
      filters.push(
        `[1:a]apad=whole_dur=${clapCycleDuration},atrim=0:${clapCycleDuration},aloop=loop=${effectiveClaps - 1}:size=${clapCycleSamples},atrim=0:${totalClapsDuration},volume=${CLAP_VOLUME}[allclaps]`
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
    
    // خطة بديلة مبسطة
    try {
      return await generateSheelohaSimple(inputPath, outputPath, processedAudioBuffer);
    } catch (fallbackError) {
      console.error("[SheelohaGenerator] Fallback also failed:", fallbackError);
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
 * خطة بديلة مبسطة: الصوت مسرّع + echo + تصفيق ختامي فقط
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
    `-filter_complex "[0:a]atempo=${SHEELOHA_SPEED_FACTOR},volume=0.7,aecho=0.8:0.7:20:0.3[voice];[1:a]adelay=${endDelayMs}|${endDelayMs},volume=${END_CLAP_VOLUME}[endclap];[voice][endclap]amix=inputs=2:duration=longest:normalize=0[out]"`,
    `-map "[out]" -c:a aac -b:a 128k "${outputPath}"`,
  ].join(" ");
  
  await execAsync(command, { maxBuffer: 50 * 1024 * 1024 });
  return await fs.promises.readFile(outputPath);
}
