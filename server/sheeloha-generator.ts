/**
 * Sheeloha Generator - إنشاء ملف الشيلوها على الخادم
 *
 * يدمج:
 * 1. صوت الطاروق بتأثير chorus (3 نسخ بتأخيرات وطبقات مختلفة)
 * 2. تصفيق متكرر كل 0.96 ثانية
 *
 * الناتج: ملف MP3 جاهز للبث مع loop في العميل
 */

import { exec } from "child_process";
import { promisify } from "util";
import { unlink } from "fs/promises";
import path from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);

// رابط مباشر لصوت التصفيق على CDN (موثّق في العميل أيضاً)
const CLAP_CDN_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663292181877/bXZOlcZxcTqODWQb.mp3";

export interface SheelohaOptions {
  taroukUrl: string;
  taroukDuration: number; // seconds
}

export async function generateSheeloha(options: SheelohaOptions): Promise<string> {
  const { taroukUrl, taroukDuration } = options;
  const ts = Date.now();
  const tempDir = tmpdir();
  const taroukFile = path.join(tempDir, `tarouk-${ts}.mp3`);
  const clapFile   = path.join(tempDir, `clap-${ts}.mp3`);
  const outputFile = path.join(tempDir, `sheeloha-${ts}.mp3`);

  console.log(`[generateSheeloha] START - duration: ${taroukDuration}s`);

  try {
    // 2. تحميل الملفات
    await execAsync(`curl -sL "${taroukUrl}" -o "${taroukFile}"`);
    await execAsync(`curl -sL "${CLAP_CDN_URL}" -o "${clapFile}"`);
    console.log(`[generateSheeloha] Files downloaded`);

    // 3. توليد الشيلوها بـ ffmpeg:
    //    - تأثير chorus: 3 نسخ (الأصل + تأخير 50ms pitch -5% + تأخير 120ms pitch +7%)
    //    - تصفيق يتكرر كل 0.96 ثانية طوال مدة الطاروق
    //    - مستوى الصوت 35%
    const ffmpegCmd = [
      `ffmpeg -y`,
      `-i "${taroukFile}"`,
      `-i "${clapFile}"`,
      `-filter_complex "`,
        `[0:a]asplit=3[v1][v2][v3];`,
        `[v1]volume=0.35[voice1];`,
        `[v2]adelay=50|50,asetrate=44100*0.95,aresample=44100,volume=0.30[voice2];`,
        `[v3]adelay=120|120,asetrate=44100*1.07,aresample=44100,volume=0.28[voice3];`,
        `[1:a]aloop=loop=-1:size=2147483647,atrim=end=${taroukDuration},volume=0.35[clap_loop];`,
        `[voice1][voice2][voice3][clap_loop]amix=inputs=4:duration=first:dropout_transition=0[out]`,
      `"`,
      `-map "[out]"`,
      `-t ${taroukDuration}`,
      `-ar 44100 -ac 2 -b:a 128k`,
      `"${outputFile}"`,
    ].join(" ");

    console.log(`[generateSheeloha] Running ffmpeg...`);
    await execAsync(ffmpegCmd);
    console.log(`[generateSheeloha] ffmpeg done`);

    // 4. رفع على S3
    const { stdout } = await execAsync(`manus-upload-file "${outputFile}"`);
    const sheelohaUrl = stdout.trim();
    console.log(`[generateSheeloha] Uploaded: ${sheelohaUrl}`);

    // 5. تنظيف
    await Promise.all([
      unlink(taroukFile).catch(() => {}),
      unlink(clapFile).catch(() => {}),
      unlink(outputFile).catch(() => {}),
    ]);

    return sheelohaUrl;
  } catch (error) {
    await Promise.all([
      unlink(taroukFile).catch(() => {}),
      unlink(clapFile).catch(() => {}),
      unlink(outputFile).catch(() => {}),
    ]);
    console.error(`[generateSheeloha] ERROR:`, error);
    throw error;
  }
}