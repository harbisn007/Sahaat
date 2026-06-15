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

// محاكاة المشهد: صفّان متقابلان يردّدان. كل صفّ = فلتر chorus (جوقة ناعمة كثيفة بـ٥ أصوات متذبذبة)،
// بإعدادات مختلفة قليلاً للصفّين لفكّ الترابط بينهما، ثم دمجهما ستيريو (صفّ يسار + صفّ يمين) = عرض المشهد.
// in_gain منخفض قليلاً (0.5) كي لا يطغى الصوت الأصلي — فالصفوف مجموعة لا قائد منفرد.
const LEFT_ROW =
  "chorus=0.5:0.85:45|62|80|100|118:0.5|0.46|0.42|0.38|0.34:0.35|0.5|0.4|0.3|0.45:0.4|0.5|0.45|0.5|0.4";
const RIGHT_ROW =
  "chorus=0.5:0.85:52|70|88|108|126:0.5|0.46|0.42|0.38|0.34:0.45|0.3|0.5|0.35|0.4:0.5|0.45|0.55|0.4|0.5";

// هواء طلق: صدى قصير خفيف (لا قاعة/كهف) + lowpass خفيف يُبعِد الجوقة قليلاً عن قُرب المايك، + alimiter لمنع التشبّع.
const OPEN_AIR = "aecho=0.85:0.82:45|75:0.13|0.09,lowpass=f=9000,alimiter=limit=0.95";

export interface SheelohaOptions {
  taroukBase64: string;
  taroukDuration: number;
}

/**
 * يبني فلتر ffmpeg: يوحّد الدخل أحادياً، ينسخه لصفّين (يسار/يمين) كلٌّ بجوقته، يدمجهما ستيريو عريضاً،
 * ثم يضيف إحساس الهواء الطلق. النتيجة: جوقة عريضة على الجانبين تحاكي الصفّين المتقابلين.
 */
function buildFilter(): string {
  return (
    `[0:a]aformat=channel_layouts=mono,asplit=2[L][R];` +
    `[L]${LEFT_ROW}[lc];` +
    `[R]${RIGHT_ROW}[rc];` +
    `[lc][rc]amerge=inputs=2,aformat=channel_layouts=stereo,${OPEN_AIR}[out]`
  );
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
