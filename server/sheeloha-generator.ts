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

// ٥ طبقات تحاكي صفّاً حقيقياً: إزاحة زمنية مختلفة لكل طبقة (تفكّ تزامن الأطوار فتزيل الطابع الروبوتي/المعدني)،
// وتوزيع طبقة الصوت حول الأصل (بعضها أخفض وبعضها أعلى) بدل رفعها كلها للأعلى — فيبدو طبيعياً كمجموعة لا كنسخة مكرّرة.
const CROWD_LAYERS = [
  { delay: 0,   rate: 1.00,  volume: 0.42 },
  { delay: 50,  rate: 0.985, volume: 0.34 },
  { delay: 90,  rate: 1.015, volume: 0.36 },
  { delay: 125, rate: 0.99,  volume: 0.32 },
  { delay: 155, rate: 1.025, volume: 0.30 },
];

const SR = 44100; // معدّل العيّنات الموحّد للمزج

export interface SheelohaOptions {
  taroukBase64: string;
  taroukDuration: number;
}

/**
 * يبني فلتر ffmpeg الذي يقسّم الدخل إلى ٥ نسخ، يطبّق على كلٍّ asetrate (سرعة+طبقة) + volume، ثم يمزجها.
 */
function buildFilter(): string {
  const splitLabels = CROWD_LAYERS.map((_, i) => `[a${i}]`).join("");
  let filter = `[0:a]asplit=${CROWD_LAYERS.length}${splitLabels};`;
  CROWD_LAYERS.forEach((layer, i) => {
    const target = Math.round(SR * layer.rate);
    // aresample=SR لتوحيد المعدّل، asetrate لتغيير الطبقة/السرعة، aresample=SR للمزج،
    // adelay لإزاحة الطبقة زمنياً (يفكّ تزامن الأطوار → يزيل الطابع الروبوتي)، ثم volume
    filter += `[a${i}]aresample=${SR},asetrate=${target},aresample=${SR},adelay=${layer.delay}:all=1,volume=${layer.volume}[v${i}];`;
  });
  const mixInputs = CROWD_LAYERS.map((_, i) => `[v${i}]`).join("");
  // normalize=0 يمنع amix من قسمة الحجم على عدد المدخلات (نتحكّم بالحجم يدوياً)
  filter += `${mixInputs}amix=inputs=${CROWD_LAYERS.length}:duration=longest:normalize=0[out]`;
  return filter;
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
