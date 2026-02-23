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
import { unlink, readFile } from "fs/promises";
import path from "path";
import { tmpdir } from "os";
import { storagePut } from "./storage";

const execAsync = promisify(exec);

// رابط مباشر لصوت التصفيق على CDN
const CLAP_CDN_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663292181877/bXZOlcZxcTqODWQb.mp3";

export interface SheelohaOptions {
  taroukUrl: string;
  taroukDuration: number;
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
    // 1. تحميل الملفات
    await execAsync(`curl -sL "${taroukUrl}" -o "${taroukFile}"`);
    await execAsync(`curl -sL "${CLAP_CDN_URL}" -o "${clapFile}"`);
    console.log(`[generateSheeloha] Files downloaded`);

    // 2. توليد الشيلوها بـ ffmpeg
    // 5 أصوات بطبقات مختلفة (88%-112%) وتأخيرات مختلفة = إحساس بأشخاص مختلفين
    // + تصفيق متكرر 35%
    const scriptFile = path.join(tempDir, `ffmpeg-${ts}.sh`);
    const { writeFile } = await import("fs/promises");

    const scriptContent = `#!/bin/bash
ffmpeg -y \\
  -i "${taroukFile}" \\
  -stream_loop -1 -i "${clapFile}" \\
  -filter_complex "
    [0:a]asplit=5[s1][s2][s3][s4][s5];
    [s1]volume=0.45[v1];
    [s2]asetrate=44100*0.88,aresample=44100,adelay=25|25,volume=0.40[v2];
    [s3]asetrate=44100*1.12,aresample=44100,adelay=60|60,volume=0.38[v3];
    [s4]asetrate=44100*0.94,aresample=44100,adelay=110|110,volume=0.35[v4];
    [s5]asetrate=44100*1.06,aresample=44100,adelay=160|160,volume=0.32[v5];
    [v1][v2][v3][v4][v5]amix=inputs=5:duration=first:normalize=0[crowd];
    [1:a]atrim=end=${taroukDuration},volume=0.35[clap];
    [crowd][clap]amix=inputs=2:duration=first:normalize=0[out]
  " \\
  -map "[out]" \\
  -t ${taroukDuration} \\
  -ar 44100 -ac 2 -b:a 128k \\
  "${outputFile}"
`;

    await writeFile(scriptFile, scriptContent, { mode: 0o755 });
    console.log(`[generateSheeloha] Running ffmpeg...`);
    await execAsync(`bash "${scriptFile}"`, { maxBuffer: 10 * 1024 * 1024 });
    await unlink(scriptFile).catch(() => {});
    console.log(`[generateSheeloha] ffmpeg done`);

    // 3. رفع الملف باستخدام storagePut
    const fileBuffer = await readFile(outputFile);
    const relKey = `audio/sheeloha-${ts}.mp3`;
    const { url: sheelohaUrl } = await storagePut(relKey, fileBuffer, "audio/mpeg");
    console.log(`[generateSheeloha] Uploaded: ${sheelohaUrl}`);

    // 4. تنظيف
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