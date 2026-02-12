/**
 * مولّد ملف الشيلوها المدمج على الخادم
 * 
 * يأخذ الصوت الأصلي (بدون تسريع) وينشئ ملف شيلوها واحد يحتوي:
 * 1. تسريع الصوت بنسبة 1.08x
 * 2. تأثير الصفوف: 7 نسخ من الصوت بدرجات مختلفة (محاكاة جمهور)
 * 3. تصفيق إيقاعي متكرر (بناءً على تحليل الإيقاع الحقيقي للصوت)
 * 4. تصفيق ختامي بعد انتهاء الغناء
 * 5. تأثير كورال مسرحي (chorus + hall echo + bass boost) كخطوة نهائية
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
// في التطوير: currentDir = server/ → server/sounds/
// في الإنتاج: currentDir = dist/ → نبحث في server/sounds/ (بجوار dist/)
function resolveSoundPath(filename: string): string {
  // المسار الأول: بجوار الملف الحالي (dev mode: server/sounds/)
  const localPath = path.join(currentDir, "sounds", filename);
  if (fs.existsSync(localPath)) return localPath;
  
  // المسار الثاني: مجلد server/sounds/ بجوار dist/ (production)
  const prodPath = path.join(currentDir, "..", "server", "sounds", filename);
  if (fs.existsSync(prodPath)) return prodPath;
  
  // المسار الثالث: مسار مطلق من جذر المشروع
  const rootPath = path.join(process.cwd(), "server", "sounds", filename);
  if (fs.existsSync(rootPath)) return rootPath;
  
  console.error(`[SheelohaGenerator] Sound file not found: ${filename}`);
  console.error(`[SheelohaGenerator] Searched paths:`);
  console.error(`  1. ${localPath}`);
  console.error(`  2. ${prodPath}`);
  console.error(`  3. ${rootPath}`);
  console.error(`[SheelohaGenerator] currentDir: ${currentDir}`);
  console.error(`[SheelohaGenerator] cwd: ${process.cwd()}`);
  
  // إرجاع المسار الأول كافتراضي (سيفشل لاحقاً مع رسالة واضحة)
  return localPath;
}

const SINGLE_CLAP_PATH = resolveSoundPath("single-clap-short.mp3");
const END_CLAPS_PATH = resolveSoundPath("sheeloha-claps.mp3");

console.log(`[SheelohaGenerator] Sound paths resolved:`);
console.log(`  Single clap: ${SINGLE_CLAP_PATH}`);
console.log(`  End claps: ${END_CLAPS_PATH}`);

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
  { delay: 0,    volume: 0.70, pitchFactor: 1.0   },  // صوت 1 - الأصلي (الأعلى)
  { delay: 0,    volume: 0.55, pitchFactor: 1.0   },  // صوت 2 - أصلي
  { delay: 0,    volume: 0.55, pitchFactor: 1.0   },  // صوت 3 - أصلي
  { delay: 0,    volume: 0.55, pitchFactor: 1.0   },  // صوت 4 - أصلي
  { delay: 0.02, volume: 0.45, pitchFactor: 1.06  },  // صوت 5 - أعلى قليلاً + تأخير 20ms
  { delay: 0.02, volume: 0.40, pitchFactor: 0.94  },  // صوت 6 - أخفض قليلاً + تأخير 20ms
  { delay: 0.03, volume: 0.35, pitchFactor: 1.04  },  // صوت 7 - أعلى بقليل + تأخير 30ms
];

const CLAP_VOLUME = 0.30;
const END_CLAP_VOLUME = 0.30;

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
 * 2. حساب التغير في الطاقة (energy delta) لكشف الارتفاعات المفاجئة
 * 3. كشف القمم بعتبة تكيفية (adaptive threshold)
 * 4. استخدام autocorrelation لإيجاد الفاصل الأكثر تكراراً
 * 
 * مصممة للعمل مع الأصوات الغنائية والمحاورة (بدون فترات صمت واضحة)
 */
async function analyzeRhythm(audioPath: string): Promise<number> {
  try {
    const duration = await getAudioDuration(audioPath);
    if (duration <= 0) return 0.75;

    // استخراج مستويات الطاقة (RMS) لكل إطار 50ms
    const frameSize = 0.05; // 50ms per frame
    const rmsCmd = `ffmpeg -i "${audioPath}" -af "asplit[a][b];[a]aresample=8000,astats=metadata=1:reset=${Math.round(1/frameSize)},ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-[out0];[b]anullsink" -f null - 2>/dev/null`;
    
    let rmsOutput = "";
    try {
      const { stdout } = await execAsync(rmsCmd, { maxBuffer: 50 * 1024 * 1024 });
      rmsOutput = stdout;
    } catch (e: any) {
      if (e.stdout) rmsOutput = e.stdout;
    }

    // تحليل مستويات RMS
    const rmsLines = rmsOutput.split("\n").filter(l => l.includes("lavfi.astats.Overall.RMS_level"));
    const rmsValues: number[] = [];
    
    for (const line of rmsLines) {
      const match = line.match(/=(-?[\d.]+)/);
      if (match) {
        const val = parseFloat(match[1]);
        if (!isNaN(val) && val > -100) {
          rmsValues.push(val);
        }
      }
    }

    console.log(`[SheelohaGenerator] RMS analysis: ${rmsValues.length} frames extracted`);

    if (rmsValues.length < 10) {
      return estimateIntervalFromDuration(duration);
    }

    // === الطريقة 1: كشف النبضات بالتغير في الطاقة (energy delta) ===
    // بدلاً من البحث عن قمم مطلقة، نبحث عن ارتفاعات مفاجئة في الطاقة
    // هذا يعمل أفضل مع الأصوات الغنائية المستمرة
    const deltas: number[] = [0]; // الإطار الأول delta = 0
    for (let i = 1; i < rmsValues.length; i++) {
      // التغير الإيجابي فقط (ارتفاع الطاقة = بداية نبضة)
      deltas.push(Math.max(0, rmsValues[i] - rmsValues[i - 1]));
    }

    // عتبة تكيفية: متوسط التغيرات الإيجابية + انحراف معياري
    const posDeltas = deltas.filter(d => d > 0);
    if (posDeltas.length < 3) {
      console.log(`[SheelohaGenerator] Not enough energy changes, using duration-based estimate`);
      return estimateIntervalFromDuration(duration);
    }
    
    const avgDelta = posDeltas.reduce((a, b) => a + b, 0) / posDeltas.length;
    const stdDelta = Math.sqrt(posDeltas.reduce((sum, d) => sum + (d - avgDelta) ** 2, 0) / posDeltas.length);
    // عتبة منخفضة: المتوسط + 0.5 انحراف معياري (أكثر حساسية للأصوات الغنائية)
    const deltaThreshold = avgDelta + 0.5 * stdDelta;
    
    const onsetTimes: number[] = [];
    let lastOnsetFrame = -6;
    
    for (let i = 1; i < deltas.length; i++) {
      if (deltas[i] > deltaThreshold && (i - lastOnsetFrame) >= 4) {
        onsetTimes.push(i * frameSize);
        lastOnsetFrame = i;
      }
    }

    console.log(`[SheelohaGenerator] Energy-delta onsets: ${onsetTimes.length} in ${duration.toFixed(2)}s (threshold=${deltaThreshold.toFixed(2)})`);

    if (onsetTimes.length >= 4) {
      const intervals: number[] = [];
      for (let i = 1; i < onsetTimes.length; i++) {
        intervals.push(onsetTimes[i] - onsetTimes[i - 1]);
      }
      
      intervals.sort((a, b) => a - b);
      const medianInterval = intervals[Math.floor(intervals.length / 2)];
      
      let clapInterval = medianInterval;
      while (clapInterval < 0.4) clapInterval *= 2;
      while (clapInterval > 2.0) clapInterval /= 2;
      
      console.log(`[SheelohaGenerator] Energy-delta result: median=${medianInterval.toFixed(3)}s, clap=${clapInterval.toFixed(3)}s`);
      return clapInterval;
    }

    // === الطريقة 2: Autocorrelation على منحنى الطاقة ===
    // البحث عن الفاصل الزمني الأكثر تكراراً في نمط الطاقة
    console.log(`[SheelohaGenerator] Trying autocorrelation method...`);
    
    // تطبيع القيم إلى [0,1]
    const minRms = Math.min(...rmsValues);
    const maxRms = Math.max(...rmsValues);
    const range = maxRms - minRms;
    const normalized = range > 0 
      ? rmsValues.map(v => (v - minRms) / range)
      : rmsValues.map(() => 0.5);
    
    // autocorrelation لفواصل من 0.3s إلى 2.5s
    const minLag = Math.round(0.3 / frameSize);  // 6 frames
    const maxLag = Math.min(Math.round(2.5 / frameSize), Math.floor(normalized.length / 2)); // max 50 frames
    
    let bestLag = minLag;
    let bestCorr = -Infinity;
    
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      let count = 0;
      for (let i = 0; i < normalized.length - lag; i++) {
        corr += normalized[i] * normalized[i + lag];
        count++;
      }
      corr /= count;
      
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    
    const autoInterval = bestLag * frameSize;
    let clapInterval = autoInterval;
    while (clapInterval < 0.4) clapInterval *= 2;
    while (clapInterval > 2.0) clapInterval /= 2;
    
    console.log(`[SheelohaGenerator] Autocorrelation result: bestLag=${bestLag} (${autoInterval.toFixed(3)}s), corr=${bestCorr.toFixed(3)}, clap=${clapInterval.toFixed(3)}s`);
    return clapInterval;
    
  } catch (error) {
    console.error("[SheelohaGenerator] Rhythm analysis failed:", error);
    return 0.75;
  }
}

/**
 * تقدير فاصل التصفيق من المدة فقط (الخطة الأخيرة)
 */
function estimateIntervalFromDuration(duration: number): number {
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
      const delayMs = Math.round(v.delay * 1000);
      const delayFilter = delayMs > 0 ? `,adelay=${delayMs}|${delayMs}` : "";
      
      if (v.pitchFactor === 1.0) {
        // الصوت الأصلي - بدون تغيير pitch
        filters.push(
          `[vsrc${i}]volume=${v.volume}${delayFilter}[voice${i}]`
        );
      } else {
        // تغيير pitch باستخدام asetrate + aresample (متوافق مع كل ffmpeg)
        const newRate = Math.round(sampleRate * v.pitchFactor);
        const tempoCorrection = (1 / v.pitchFactor).toFixed(6);
        filters.push(
          `[vsrc${i}]asetrate=${newRate},atempo=${tempoCorrection},aresample=${sampleRate},volume=${v.volume}${delayFilter}[voice${i}]`
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

    // === الخطوة 1: دمج الأصوات السبعة معاً ===
    filters.push(
      `${voiceOutputs.join("")}amix=inputs=${voiceOutputs.length}:duration=longest:normalize=0[voices_raw]`
    );

    // === الخطوة 2: تأثير الكورال المسرحي (على الأصوات فقط - بدون التصفيق) ===
    // chorus: طبقات كورال لإحساس الجمهور
    // aecho: صدى مسرحي خفيف
    // bass: عمق مسرحي
    // acompressor + alimiter: منع التشويه
    // chorus: speeds منخفضة جداً (0.05-0.1) و depths صغيرة (0.3-0.5) لمنع التموج/vibrato
    // الهدف: سماكة صوتية بدون تموج مسموع
    filters.push(
      `[voices_raw]chorus=in_gain=0.75:out_gain=0.8:delays=20|30|40:decays=0.3|0.25|0.2:speeds=0.05|0.07|0.1:depths=0.3|0.4|0.5,aecho=in_gain=0.85:out_gain=0.4:delays=50|100:decays=0.2|0.12,bass=gain=2:frequency=110,acompressor=threshold=-18dB:ratio=3:attack=20:release=250,alimiter=limit=0.95:level=0[voices_fx]`
    );

    // === الخطوة 3: دمج الأصوات المعالجة + التصفيق النظيف ===
    const finalInputs = ["[voices_fx]"];
    if (effectiveClaps > 0) {
      finalInputs.push("[allclaps]");
    }
    finalInputs.push("[endclap]");
    
    filters.push(
      `${finalInputs.join("")}amix=inputs=${finalInputs.length}:duration=longest:normalize=0[out]`
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

    console.log(`[SheelohaGenerator] Generating sheeloha with ${VOICE_COPIES.length} voices, ${effectiveClaps} claps (interval=${clapInterval.toFixed(3)}s), end claps at ${audioDuration.toFixed(2)}s, chorus+hall effect applied`);
    
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
