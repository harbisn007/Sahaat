/**
 * Sheeloha Generator - server side
 * يمزج "صفّ" المجموعة (٥ طبقات من صوت الطاروق نفسه بفروق سرعة/حجم) في ملفّ صوتي واحد
 * عبر ffmpeg، فيُشغّله الجميع كملفّ واحد متطابق يُكرَّر — بلا عدم اتساق بين الأصوات الخمسة،
 * ولا يمكن أن يتدهور إلى "الطاروق الأصلي وحده".
 */

// @ts-ignore - ffmpeg-static لا يأتي بملفّ تعريفات أنواع
import ffmpegPath from "ffmpeg-static";
import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { storagePut } from "./storage";

const execFileAsync = promisify(execFile);

const SR = 44100;

// لجعل كل صوت "شخصاً مختلفاً": نُزيح الطبقة + بصمة الحنجرة (formant) بمقدار k مختلف لكل صوت
// عبر asetrate (يرفع الطبقة+البصمة+السرعة) ثم atempo=1/k (يعيد السرعة فقط) → تبقى الطبقة والبصمة مُزاحتين.
// k<1 = صوت أعمق/أكبر، k>1 = صوت أحدّ/أصغر. نوّعنا الستة (عميقون وحادّون) ليبدوا صفّاً من أناس مختلفين.
// vibF/vibD: تذبذب خفيف مستقلّ (حركة طبيعية) | delay: إزاحة زمنية | vol: حجم.
const LEFT_VOICES = [
  { k: 0.90, vibF: 0.32, vibD: 0.22, delay: 0,  vol: 0.37 },
  { k: 1.08, vibF: 0.45, vibD: 0.20, delay: 45, vol: 0.33 },
  { k: 0.96, vibF: 0.38, vibD: 0.25, delay: 82, vol: 0.35 },
];
const RIGHT_VOICES = [
  { k: 1.12, vibF: 0.35, vibD: 0.20, delay: 22,  vol: 0.33 },
  { k: 0.93, vibF: 0.43, vibD: 0.24, delay: 60,  vol: 0.37 },
  { k: 1.04, vibF: 0.40, vibD: 0.22, delay: 100, vol: 0.35 },
];

// هواء طلق + بُعد عن المايك: صدى مكان أوضح قليلاً، ثم lowpass يقصّ الترددات العالية (الصوت البعيد يفقد حدّته)، + alimiter.
const OPEN_AIR = "aecho=0.85:0.8:55|95:0.22|0.15,lowpass=f=6200,alimiter=limit=0.95";

export interface SheelohaOptions {
  taroukBase64: string;
  taroukDuration: number;
}

/**
 * يبني فلتر ffmpeg: يوحّد الدخل أحادياً، يصنع ٦ نسخ مُعالَجة بالكامل (لا نسخة نظيفة)،
 * يجمع كل ٣ في صفّ (يسار/يمين)، ثم يدمجهما ستيريو عريضاً مع إحساس الهواء الطلق.
 */
function buildFilter(): string {
  const all = [...LEFT_VOICES, ...RIGHT_VOICES];
  let g = `[0:a]aformat=channel_layouts=mono,aresample=${SR},asplit=${all.length}`;
  all.forEach((_, i) => { g += `[s${i}]`; });
  g += `;`;
  all.forEach((v, i) => {
    const target = Math.round(SR * v.k);
    const tempo = (1 / v.k).toFixed(4);
    // asetrate يرفع الطبقة+البصمة+السرعة بمقدار k، ثم atempo=1/k يعيد السرعة الأصلية فتبقى الطبقة والبصمة مُزاحتين (شخص مختلف)
    g += `[s${i}]asetrate=${target},aresample=${SR},atempo=${tempo},vibrato=f=${v.vibF}:d=${v.vibD},adelay=${v.delay}:all=1,volume=${v.vol}[a${i}];`;
  });
  // صفّ يسار = أول ٣، صفّ يمين = آخر ٣
  g += `[a0][a1][a2]amix=inputs=3:duration=longest:normalize=0[Lmix];`;
  g += `[a3][a4][a5]amix=inputs=3:duration=longest:normalize=0[Rmix];`;
  g += `[Lmix][Rmix]amerge=inputs=2,aformat=channel_layouts=stereo,${OPEN_AIR}[out]`;
  return g;
}

/**
 * الطريق المعتمد: يولّد ملف الصفّ من رابط الطاروق المخزَّن على S3، ويعيد رابط الملف الممزوج.
 */
export async function generateSheelohaFromUrl(
  taroukUrl: string,
  _taroukDuration: number
): Promise<string> {
  if (!ffmpegPath) throw new Error("ffmpeg-static path not found");

  const tmp = os.tmpdir();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputPath = path.join(tmp, `tarouk-${id}`);
  const outputPath = path.join(tmp, `sheeloha-${id}.mp3`);

  try {
    // 1) تنزيل ملف الطاروق إلى ملف مؤقت
    const res = await fetch(taroukUrl);
    if (!res.ok) throw new Error(`فشل تنزيل الطاروق: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error("ملف الطاروق فارغ");
    await fs.writeFile(inputPath, buf);

    // 2) مزج الطبقات الخمس + إخراج mp3
    await execFileAsync(
      ffmpegPath as unknown as string,
      [
        "-y",
        "-i", inputPath,
        "-filter_complex", buildFilter(),
        "-map", "[out]",
        "-c:a", "libmp3lame",
        "-q:a", "4",
        outputPath,
      ],
      { maxBuffer: 1024 * 1024 * 64 }
    );

    // 3) رفع الملف الممزوج على التخزين وإرجاع رابطه
    const outBuf = await fs.readFile(outputPath);
    if (outBuf.length === 0) throw new Error("فشل توليد ملف الشيلوها (ناتج فارغ)");
    const fileKey = `sheeloha/${id}.mp3`;
    const { url } = await storagePut(fileKey, outBuf, "audio/mpeg");
    console.log(`[sheeloha-generator] Generated crowd file: ${url}`);
    return url;
  } finally {
    fs.unlink(inputPath).catch(() => {});
    fs.unlink(outputPath).catch(() => {});
  }
}

/**
 * توقيع قديم (متوافقية فقط) — المسار المعتمد هو generateSheelohaFromUrl باستخدام رابط الطاروق المخزَّن.
 */
export async function generateSheeloha(_options: SheelohaOptions): Promise<string> {
  throw new Error("Use generateSheelohaFromUrl with the stored tarouk URL");
}
