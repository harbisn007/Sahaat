/**
 * مولّد ملف الشيلوها المدمج على الخادم
 * 
 * يأخذ الصوت الأصلي (بدون تسريع) وينشئ ملف شيلوها واحد يحتوي:
 * 1. تسريع الصوت بنسبة 1.08x
 * 2. تأثير الصفوف: 7 نسخ من الصوت بدرجات مختلفة (محاكاة جمهور)
 * 3. تصفيق إيقاعي متكرر (بناءً على تحليل الإيقاع الحقيقي للصوت)
 * 4. تصفيق ختامي بعد انتهاء الغناء
 * 5. تأثير صوت بعيد/مكتوم (lowpass + highpass + aecho خفيف)
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

// فحص توفر ffmpeg (كسول - يتم عند أول استخدام)
let ffmpegChecked = false;
let ffmpegAvailable = false;

async function ensureFfmpeg(): Promise<boolean> {
  if (ffmpegChecked) return ffmpegAvailable;
  ffmpegChecked = true;
  try {
    const { stdout } = await execAsync("ffmpeg -version");
    ffmpegAvailable = true;
    console.log(`[SheelohaGenerator] ffmpeg is available: ${stdout.split('\n')[0]}`);
  } catch (e) {
    ffmpegAvailable = false;
    console.error("[SheelohaGenerator] WARNING: ffmpeg is NOT available!");
  }
  return ffmpegAvailable;
}

// حساب __dirname بطريقة تعمل في ESM و CJS
function getCurrentDir(): string {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    // @ts-ignore - __dirname متاح في CJS
    return typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  }
}

// مسارات ملفات التصفيق (كسولة - تُحسب عند أول استخدام)
let _singleClapPath: string | null = null;
let _endClapsPath: string | null = null;

function resolveSoundPath(filename: string): string {
  const currentDir = getCurrentDir();
  
  // المسار 1: بجوار الملف الحالي (dev: server/sounds/)
  const localPath = path.join(currentDir, "sounds", filename);
  if (fs.existsSync(localPath)) return localPath;
  
  // المسار 2: server/sounds/ بجوار dist/ (production)
  const prodPath = path.join(currentDir, "..", "server", "sounds", filename);
  if (fs.existsSync(prodPath)) return prodPath;
  
  // المسار 3: من جذر المشروع
  const rootPath = path.join(process.cwd(), "server", "sounds", filename);
  if (fs.existsSync(rootPath)) return rootPath;
  
  console.error(`[SheelohaGenerator] Sound file not found: ${filename}`);
  console.error(`[SheelohaGenerator] Searched: ${localPath}, ${prodPath}, ${rootPath}`);
  return localPath;
}

function getSingleClapPath(): string {
  if (!_singleClapPath) {
    _singleClapPath = resolveSoundPath("single-clap-short.mp3");
    console.log(`[SheelohaGenerator] Single clap: ${_singleClapPath}`);
  }
  return _singleClapPath;
}

function getEndClapsPath(): string {
  if (!_endClapsPath) {
    _endClapsPath = resolveSoundPath("sheeloha-claps.mp3");
    console.log(`[SheelohaGenerator] End claps: ${_endClapsPath}`);
  }
  return _endClapsPath;
}

// تسريع الشيلوها
const SHEELOHA_SPEED_FACTOR = 1.08;

/**
 * إعدادات تأثير الصفوف (7 نسخ)
 * 
 * 4 أصوات بالـ pitch الأصلي + 3 بتنويعات pitch
 * 3 أصوات متأخرة قليلاً (20-30ms) لإحساس طبيعي
 */
const VOICE_COPIES = [
  { delay: 0,    volume: 0.70, pitchFactor: 1.0   },  // صوت 1 - الأعلى
  { delay: 0,    volume: 0.55, pitchFactor: 1.0   },  // صوت 2 - أصلي
  { delay: 0,    volume: 0.55, pitchFactor: 1.0   },  // صوت 3 - أصلي
  { delay: 0,    volume: 0.55, pitchFactor: 1.0   },  // صوت 4 - أصلي
  { delay: 0.02, volume: 0.45, pitchFactor: 1.06  },  // صوت 5 - أعلى + تأخير 20ms
  { delay: 0.02, volume: 0.40, pitchFactor: 0.94  },  // صوت 6 - أخفض + تأخير 20ms
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
 * تحليل الإيقاع الحقيقي للصوت
 * 
 * الطريقة: استخراج مستوى الصوت (RMS) لكل فريم صغير (50ms)
 * ثم كشف النبضات (beats) عبر ارتفاعات الطاقة المفاجئة
 * وحساب الفاصل الزمني بين النبضات
 */
async function analyzeRhythm(audioPath: string): Promise<number> {
  try {
    const duration = await getAudioDuration(audioPath);
    if (duration <= 0) return 0.75;

    // استخراج RMS لكل 50ms frame
    // astats يعطينا RMS level لكل frame
    const frameSize = 0.05; // 50ms per frame
    const rmsCmd = `ffmpeg -i "${audioPath}" -af "asetnsamples=n=2205,astats=metadata=1:reset=1" -f null - 2>&1`;
    
    let rmsOutput = "";
    try {
      const result = await execAsync(rmsCmd, { maxBuffer: 50 * 1024 * 1024 });
      rmsOutput = result.stderr || result.stdout || "";
    } catch (e: any) {
      rmsOutput = e.stderr || e.stdout || "";
    }

    // استخراج قيم RMS من المخرجات
    // astats يخرج: [Parsed_astats_1 @ ...] RMS level dB: -XX.XX
    const rmsRegex = /RMS level dB:\s*(-?[\d.]+)/g;
    const rmsValues: number[] = [];
    let match;
    while ((match = rmsRegex.exec(rmsOutput)) !== null) {
      const val = parseFloat(match[1]);
      if (!isNaN(val) && val > -100) {
        rmsValues.push(val);
      }
    }

    console.log(`[SheelohaGenerator] RMS analysis: ${rmsValues.length} frames from ${duration.toFixed(2)}s audio`);

    if (rmsValues.length >= 10) {
      // تحويل dB إلى طاقة خطية
      const energies = rmsValues.map(db => Math.pow(10, db / 20));
      
      // حساب المتوسط المتحرك (3 frames)
      const smoothed: number[] = [];
      for (let i = 0; i < energies.length; i++) {
        const start = Math.max(0, i - 1);
        const end = Math.min(energies.length, i + 2);
        const slice = energies.slice(start, end);
        smoothed.push(slice.reduce((a, b) => a + b, 0) / slice.length);
      }
      
      // كشف النبضات: نقاط ترتفع فيها الطاقة بشكل ملحوظ عن الإطار السابق
      const avgEnergy = smoothed.reduce((a, b) => a + b, 0) / smoothed.length;
      const threshold = avgEnergy * 0.3; // عتبة تكيفية: 30% من المتوسط
      
      const beats: number[] = [];
      let lastBeatFrame = -10; // منع النبضات المتقاربة جداً
      
      for (let i = 1; i < smoothed.length; i++) {
        const delta = smoothed[i] - smoothed[i - 1];
        if (delta > threshold && (i - lastBeatFrame) > 3) { // 3 frames = 150ms minimum
          beats.push(i * frameSize);
          lastBeatFrame = i;
        }
      }
      
      console.log(`[SheelohaGenerator] Detected ${beats.length} beats`);
      
      if (beats.length >= 3) {
        // حساب الفواصل بين النبضات
        const intervals: number[] = [];
        for (let i = 1; i < beats.length; i++) {
          const gap = beats[i] - beats[i - 1];
          if (gap > 0.15 && gap < 5.0) {
            intervals.push(gap);
          }
        }
        
        if (intervals.length >= 2) {
          intervals.sort((a, b) => a - b);
          const medianInterval = intervals[Math.floor(intervals.length / 2)];
          
          // تعديل ليكون ضمن النطاق
          let clapInterval = medianInterval;
          while (clapInterval < 0.4) clapInterval *= 2;
          while (clapInterval > 2.0) clapInterval /= 2;
          
          console.log(`[SheelohaGenerator] Beat analysis: ${intervals.length} intervals, median=${medianInterval.toFixed(3)}s, clap=${clapInterval.toFixed(3)}s`);
          return clapInterval;
        }
      }
    }

    // === الطريقة 2: silencedetect ===
    console.log(`[SheelohaGenerator] Beat detection insufficient, trying silencedetect...`);
    
    const silenceCmd = `ffmpeg -i "${audioPath}" -af "silencedetect=noise=-28dB:d=0.06" -f null - 2>&1`;
    let silenceOutput = "";
    try {
      const result = await execAsync(silenceCmd, { maxBuffer: 50 * 1024 * 1024 });
      silenceOutput = result.stderr || result.stdout || "";
    } catch (e: any) {
      silenceOutput = e.stderr || e.stdout || "";
    }

    const silenceEndRegex = /silence_end:\s*([\d.]+)/g;
    const onsetTimes: number[] = [0];
    while ((match = silenceEndRegex.exec(silenceOutput)) !== null) {
      onsetTimes.push(parseFloat(match[1]));
    }

    console.log(`[SheelohaGenerator] Silence-detect: ${onsetTimes.length} onsets`);

    if (onsetTimes.length >= 4) {
      const intervals: number[] = [];
      for (let i = 1; i < onsetTimes.length; i++) {
        const gap = onsetTimes[i] - onsetTimes[i - 1];
        if (gap > 0.15 && gap < 5.0) {
          intervals.push(gap);
        }
      }
      
      if (intervals.length >= 3) {
        intervals.sort((a, b) => a - b);
        const medianInterval = intervals[Math.floor(intervals.length / 2)];
        
        let clapInterval = medianInterval;
        while (clapInterval < 0.4) clapInterval *= 2;
        while (clapInterval > 2.0) clapInterval /= 2;
        
        console.log(`[SheelohaGenerator] Silence-detect result: median=${medianInterval.toFixed(3)}s, clap=${clapInterval.toFixed(3)}s`);
        return clapInterval;
      }
    }

    // === الطريقة 3: تقدير من المدة ===
    console.log(`[SheelohaGenerator] All methods failed, using duration estimate`);
    return estimateIntervalFromDuration(duration);
    
  } catch (error) {
    console.error("[SheelohaGenerator] Rhythm analysis failed:", error);
    return 0.75;
  }
}

/**
 * تقدير فاصل التصفيق من المدة فقط (الخطة الأخيرة)
 */
function estimateIntervalFromDuration(duration: number): number {
  if (duration <= 3) return 0.60;
  if (duration <= 5) return 0.70;
  if (duration <= 8) return 0.80;
  return 0.90;
}

/**
 * إنشاء ملف الشيلوها المدمج
 */
export async function generateSheeloha(originalAudioBuffer: Buffer): Promise<Buffer> {
  // فحص ffmpeg (كسول)
  const hasFfmpeg = await ensureFfmpeg();
  if (!hasFfmpeg) {
    throw new Error("ffmpeg is not available on this server");
  }
  
  // حل مسارات التصفيق
  const SINGLE_CLAP_PATH = getSingleClapPath();
  const END_CLAPS_PATH = getEndClapsPath();
  
  if (!fs.existsSync(SINGLE_CLAP_PATH)) {
    throw new Error(`Single clap file not found: ${SINGLE_CLAP_PATH}`);
  }
  if (!fs.existsSync(END_CLAPS_PATH)) {
    throw new Error(`End claps file not found: ${END_CLAPS_PATH}`);
  }
  
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
    console.log(`[SheelohaGenerator] Input saved: ${originalAudioBuffer.length} bytes`);
    
    // === الخطوة 0: تسريع الصوت ===
    console.log(`[SheelohaGenerator] Step 0: Speed up by ${SHEELOHA_SPEED_FACTOR}x`);
    const speedCmd = `ffmpeg -y -i "${inputPath}" -filter:a "atempo=${SHEELOHA_SPEED_FACTOR}" -vn "${speedPath}"`;
    await execAsync(speedCmd, { maxBuffer: 50 * 1024 * 1024 });
    
    // 1. تحليل الإيقاع
    const clapInterval = await analyzeRhythm(speedPath);
    console.log(`[SheelohaGenerator] Final clap interval: ${clapInterval.toFixed(3)}s`);
    
    // 2. مدة الصوت المسرّع
    const audioDuration = await getAudioDuration(speedPath);
    console.log(`[SheelohaGenerator] Audio duration (after speed): ${audioDuration.toFixed(2)}s`);
    
    // 3. sample rate
    let sampleRate = 44100;
    try {
      const srCmd = `ffprobe -i "${speedPath}" -show_entries stream=sample_rate -v quiet -of csv="p=0"`;
      const { stdout: srOut } = await execAsync(srCmd);
      const sr = parseInt(srOut.trim());
      if (sr > 0) sampleRate = sr;
    } catch {}
    
    // 4. بناء أمر ffmpeg
    const inputs = [
      `-i "${speedPath}"`,
      `-i "${SINGLE_CLAP_PATH}"`,
      `-i "${END_CLAPS_PATH}"`,
    ];

    const filters: string[] = [];
    const voiceOutputs: string[] = [];

    // === تأثير الصفوف: 7 نسخ ===
    const voiceSrcLabels = VOICE_COPIES.map((_, i) => `vsrc${i}`);
    filters.push(
      `[0:a]asplit=${VOICE_COPIES.length}${voiceSrcLabels.map(l => `[${l}]`).join("")}`
    );

    for (let i = 0; i < VOICE_COPIES.length; i++) {
      const v = VOICE_COPIES[i];
      const delayMs = Math.round(v.delay * 1000);
      const delayFilter = delayMs > 0 ? `,adelay=${delayMs}|${delayMs}` : "";
      
      if (v.pitchFactor === 1.0) {
        filters.push(
          `[vsrc${i}]volume=${v.volume}${delayFilter}[voice${i}]`
        );
      } else {
        const newRate = Math.round(sampleRate * v.pitchFactor);
        const tempoCorrection = (1 / v.pitchFactor).toFixed(6);
        filters.push(
          `[vsrc${i}]asetrate=${newRate},atempo=${tempoCorrection},aresample=${sampleRate},volume=${v.volume}${delayFilter}[voice${i}]`
        );
      }
      voiceOutputs.push(`[voice${i}]`);
    }

    // === التصفيق الإيقاعي ===
    const numClaps = Math.floor(audioDuration / clapInterval);
    const effectiveClaps = Math.max(1, Math.min(numClaps, 15));
    
    if (effectiveClaps > 1) {
      const splitLabels = Array.from({ length: effectiveClaps }, (_, i) => `csrc${i}`);
      filters.push(
        `[1:a]asplit=${effectiveClaps}${splitLabels.map(l => `[${l}]`).join("")}`
      );
      
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
      
      filters.push(
        `${clapOutputs.join("")}amix=inputs=${clapOutputs.length}:duration=longest:normalize=0[allclaps]`
      );
    } else {
      filters.push(`[1:a]volume=${CLAP_VOLUME}[allclaps]`);
    }

    // === التصفيق الختامي ===
    const endClapDelayMs = Math.round(audioDuration * 1000);
    filters.push(
      `[2:a]adelay=${endClapDelayMs}|${endClapDelayMs},volume=${END_CLAP_VOLUME}[endclap]`
    );

    // === دمج الأصوات السبعة ===
    filters.push(
      `${voiceOutputs.join("")}amix=inputs=${voiceOutputs.length}:duration=longest:normalize=0[voices_raw]`
    );

    // === تأثير صوت بعيد/مكتوم + صدى خفيف (على الأصوات فقط) ===
    // lowpass=3500: قطع الترددات العالية (صوت بعيد يفقد الحدة)
    // highpass=150: إزالة الترددات المنخفضة جداً
    // aecho: صدى خفيف جداً لإحساس المسافة (40ms و 80ms)
    // acompressor + alimiter: منع التشويه
    filters.push(
      `[voices_raw]highpass=f=150,lowpass=f=3500,aecho=in_gain=0.9:out_gain=0.25:delays=40|80:decays=0.12|0.06,acompressor=threshold=-18dB:ratio=3:attack=20:release=250,alimiter=limit=0.95:level=0[voices_fx]`
    );

    // === دمج الأصوات المعالجة + التصفيق النظيف ===
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

    console.log(`[SheelohaGenerator] Generating: ${VOICE_COPIES.length} voices, ${effectiveClaps} claps (interval=${clapInterval.toFixed(3)}s), end claps at ${audioDuration.toFixed(2)}s`);
    
    await execAsync(command, { maxBuffer: 50 * 1024 * 1024 });

    const outputBuffer = await fs.promises.readFile(outputPath);
    console.log(`[SheelohaGenerator] SUCCESS: ${outputBuffer.length} bytes`);
    
    return outputBuffer;
  } catch (error) {
    console.error("[SheelohaGenerator] MAIN FAILED:", error);
    
    // خطة بديلة مبسطة
    try {
      return await generateSheelohaSimple(inputPath, outputPath, originalAudioBuffer);
    } catch (fallbackError) {
      console.error("[SheelohaGenerator] FALLBACK ALSO FAILED:", fallbackError);
      throw new Error("Failed to generate sheeloha: both main and fallback methods failed");
    }
  } finally {
    for (const f of tempFiles) {
      try { await fs.promises.unlink(f).catch(() => {}); } catch {}
    }
  }
}

/**
 * خطة بديلة مبسطة: الصوت مسرّع + تصفيق ختامي فقط
 */
async function generateSheelohaSimple(
  inputPath: string,
  outputPath: string,
  originalBuffer: Buffer
): Promise<Buffer> {
  console.log("[SheelohaGenerator] Using simplified fallback");
  
  const END_CLAPS = getEndClapsPath();
  
  await fs.promises.writeFile(inputPath, originalBuffer);
  const duration = await getAudioDuration(inputPath);
  const endDelayMs = Math.round(duration * 1000);
  
  const command = [
    `ffmpeg -y -i "${inputPath}" -i "${END_CLAPS}"`,
    `-filter_complex "[0:a]atempo=${SHEELOHA_SPEED_FACTOR},volume=0.80[voice];[1:a]adelay=${endDelayMs}|${endDelayMs},volume=${END_CLAP_VOLUME}[endclap];[voice][endclap]amix=inputs=2:duration=longest:normalize=0[out]"`,
    `-map "[out]" -c:a aac -b:a 128k "${outputPath}"`,
  ].join(" ");
  
  await execAsync(command, { maxBuffer: 50 * 1024 * 1024 });
  return await fs.promises.readFile(outputPath);
}
