/**
 * Sheeloha Generator - إنشاء ملف الشيلوها على الخادم
 * 
 * يدمج:
 * 1. صوت الطاروق الأصلي
 * 2. نسخ متعددة بتأخيرات وطبقات مختلفة (تأثير chorus/ensemble)
 * 3. تصفيق متكرر (كل 0.96 ثانية)
 * 
 * الناتج: ملف MP3 واحد جاهز للبث بمستوى 35%
 */

import { exec } from "child_process";
import { promisify } from "util";
import { unlink } from "fs/promises";
import path from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);

const CLAP_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663292181877/bXZOlcZxcTqODWQb.mp3";
const CLAP_INTERVAL = 0.96; // seconds

export interface SheelohaOptions {
  taroukUrl: string;
  taroukDuration: number; // seconds
}

/**
 * إنشاء ملف الشيلوها بتأثير chorus حقيقي
 * @returns رابط الملف المرفوع على S3
 */
export async function generateSheeloha(options: SheelohaOptions): Promise<string> {
  const { taroukUrl, taroukDuration } = options;
  
  const tempDir = tmpdir();
  const taroukFile = path.join(tempDir, `tarouk-${Date.now()}.mp3`);
  const clapFile = path.join(tempDir, `clap-${Date.now()}.mp3`);
  const outputFile = path.join(tempDir, `sheeloha-${Date.now()}.mp3`);

  try {
    // 1. تحميل الطاروق
    await execAsync(`curl -s "${taroukUrl}" -o "${taroukFile}"`);
    
    // 2. تحميل التصفيق
    await execAsync(`curl -s "${CLAP_URL}" -o "${clapFile}"`);

    // 3. إنشاء ملف الشيلوها باستخدام ffmpeg
    // تأثير chorus: 3 نسخ بتأخيرات (0, 50, 120ms) وطبقات مختلفة (pitch shift)
    // - النسخة 1: الأصلية بدون تأخير
    // - النسخة 2: تأخير 50ms + pitch shift -5%
    // - النسخة 3: تأخير 120ms + pitch shift +7%
    const ffmpegCmd = `ffmpeg -i "${taroukFile}" -i "${clapFile}" \\
      -filter_complex "\\
        [0:a]asplit=3[v1][v2][v3];\\
        [v1]volume=0.35[voice1];\\
        [v2]adelay=50|50,asetrate=44100*0.95,aresample=44100,volume=0.30[voice2];\\
        [v3]adelay=120|120,asetrate=44100*1.07,aresample=44100,volume=0.28[voice3];\\
        [1:a]aloop=loop=-1:size=2e+09,volume=0.35[clap_loop];\\
        [voice1][voice2][voice3][clap_loop]amix=inputs=4:duration=first:dropout_transition=0[out]\\
      " \\
      -map "[out]" -t ${taroukDuration} -y "${outputFile}"`;

    await execAsync(ffmpegCmd);

    // 4. رفع الملف إلى S3
    const { stdout } = await execAsync(`manus-upload-file "${outputFile}"`);
    const sheelohaUrl = stdout.trim();

    // 5. حذف الملفات المؤقتة
    await Promise.all([
      unlink(taroukFile).catch(() => {}),
      unlink(clapFile).catch(() => {}),
      unlink(outputFile).catch(() => {}),
    ]);

    return sheelohaUrl;
  } catch (error) {
    // حذف الملفات المؤقتة في حالة الخطأ
    await Promise.all([
      unlink(taroukFile).catch(() => {}),
      unlink(clapFile).catch(() => {}),
      unlink(outputFile).catch(() => {}),
    ]);
    throw error;
  }
}
