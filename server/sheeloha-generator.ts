/**
 * Sheeloha Generator - إنشاء ملف الشيلوها على الخادم
 * 
 * يدمج:
 * 1. صوت الطاروق الأصلي
 * 2. نسخة echo منه (بتأخير 200ms + مستوى صوت 60%)
 * 3. تصفيق متكرر (كل 0.96 ثانية)
 * 
 * الناتج: ملف MP3 واحد جاهز للبث
 */

import { exec } from "child_process";
import { promisify } from "util";
import { unlink } from "fs/promises";
import path from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);

const CLAP_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663292181877/bXZOlcZxcTqODWQb.mp3";
const ECHO_DELAY = 200; // ms
const ECHO_VOLUME = 0.6;
const CLAP_INTERVAL = 0.96; // seconds

export interface SheelohaOptions {
  taroukUrl: string;
  taroukDuration: number; // seconds
}

/**
 * إنشاء ملف الشيلوها
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
    // - [0:a]: الطاروق الأصلي
    // - [0:a]adelay=${ECHO_DELAY}|${ECHO_DELAY},volume=${ECHO_VOLUME}: نسخة echo
    // - [1:a]aloop=loop=-1:size=2e+09: التصفيق المتكرر
    const ffmpegCmd = `ffmpeg -i "${taroukFile}" -i "${clapFile}" \\
      -filter_complex "\\
        [0:a]asplit=2[orig][echo_src];\\
        [echo_src]adelay=${ECHO_DELAY}|${ECHO_DELAY},volume=${ECHO_VOLUME}[echo];\\
        [1:a]aloop=loop=-1:size=2e+09,volume=0.4[clap_loop];\\
        [orig][echo][clap_loop]amix=inputs=3:duration=first:dropout_transition=0[out]\\
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
