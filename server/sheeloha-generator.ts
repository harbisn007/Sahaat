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

// صفّ متماسك من ٨ أشخاص يغنّون البيت معاً: نبرات متقاربة (وحدة لا نشاز) لكنها مختلفة (أشخاص)،
// إزاحات زمنية صغيرة (يغنّون معاً لا متفرّقين)، حضور أكثر (لا صخب ملعب بعيد).
const LEFT_VOICES = [
  { k: 0.95, delay: 0,  vol: 0.40 },
  { k: 1.06, delay: 14, vol: 0.36 },
  { k: 0.99, delay: 28, vol: 0.38 },
  { k: 1.03, delay: 40, vol: 0.36 },
];
const RIGHT_VOICES = [
  { k: 1.07, delay: 7,  vol: 0.36 },
  { k: 0.96, delay: 20, vol: 0.40 },
  { k: 1.01, delay: 33, vol: 0.38 },
  { k: 0.98, delay: 45, vol: 0.36 },
];

// تماسك خفيف: انعكاس واحد قصير جداً (يعطي إحساس "معاً في مكان" دون صخب ملعب)، + alimiter للأمان. بلا lowpass (حضور وصفاء).
const OPEN_AIR = "aecho=0.9:0.85:25:0.09,alimiter=limit=0.95";

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
    // rubberband: إزاحة طبقة/بصمة عالية الجودة بلا ارتعاش (pitch=k، tempo=1 فلا تغيّر وقت). transients=smooth أنعم للصوت المغنّى.
    g += `[s${i}]rubberband=pitch=${v.k}:tempo=1:transients=smooth,adelay=${v.delay}:all=1,volume=${v.vol}[a${i}];`;
  });
  // صفّ يسار = أصوات LEFT، صفّ يمين = أصوات RIGHT (نُحدّد mono صراحةً ليقبلهما amerge)
  const nL = LEFT_VOICES.length;
  const leftLabels = LEFT_VOICES.map((_, i) => `[a${i}]`).join("");
  const rightLabels = RIGHT_VOICES.map((_, i) => `[a${nL + i}]`).join("");
  g += `${leftLabels}amix=inputs=${LEFT_VOICES.length}:duration=longest:normalize=0,aformat=channel_layouts=mono[Lmix];`;
  g += `${rightLabels}amix=inputs=${RIGHT_VOICES.length}:duration=longest:normalize=0,aformat=channel_layouts=mono[Rmix];`;
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
