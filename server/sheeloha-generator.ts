/**
 * Sheeloha Generator
 * 5 أصوات بطبقات مختلفة + تصفيق متكرر
 * الطاروق يصل كـ base64 من العميل
 * التصفيق من ملف محلي في server/sounds
 */

import { exec } from "child_process";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { promisify } from "util";
import { unlink, readFile, writeFile, copyFile } from "fs/promises";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { storagePut } from "./storage";

const execAsync = promisify(exec);

// ملف التصفيق موجود محلياً - يُنسخ لـ dist/sounds عند البناء
const CLAP_LOCAL_PATH = join(__dirname, "sounds", "single-clap-short.mp3");

export interface SheelohaOptions {
  taroukBase64: string;
  taroukDuration: number;
}

export async function generateSheeloha(options: SheelohaOptions): Promise<string> {
  const { taroukBase64, taroukDuration } = options;
  const ts = Date.now();
  const tempDir = tmpdir();
  const taroukFile = join(tempDir, `tarouk-${ts}.m4a`);
  const clapFile   = join(tempDir, `clap-${ts}.mp3`);
  const outputFile = join(tempDir, `sheeloha-${ts}.mp3`);
  const scriptFile = join(tempDir, `ffmpeg-${ts}.sh`);

  console.log(`[generateSheeloha] START - duration: ${taroukDuration}s`);

  try {
    // 1. حفظ الطاروق من base64
    const taroukBuffer = Buffer.from(taroukBase64, "base64");
    await writeFile(taroukFile, taroukBuffer);
    console.log(`[generateSheeloha] Tarouk saved: ${taroukBuffer.length} bytes`);

    // 2. نسخ التصفيق من الملف المحلي
    await copyFile(CLAP_LOCAL_PATH, clapFile);
    console.log(`[generateSheeloha] Clap copied from local`);

    // 3. ffmpeg: 5 أصوات بطبقات مختلفة + تصفيق
    const scriptContent = `#!/bin/bash
set -e
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
    const { stderr } = await execAsync(`bash "${scriptFile}"`, { maxBuffer: 10 * 1024 * 1024 });
    if (stderr) console.log(`[generateSheeloha] ffmpeg: ${stderr.slice(-200)}`);
    console.log(`[generateSheeloha] ffmpeg done`);

    // 4. رفع الملف
    const fileBuffer = await readFile(outputFile);
    const { url: sheelohaUrl } = await storagePut(`audio/sheeloha-${ts}.mp3`, fileBuffer, "audio/mpeg");
    console.log(`[generateSheeloha] Uploaded: ${sheelohaUrl}`);

    await Promise.all([taroukFile, clapFile, outputFile, scriptFile].map(f => unlink(f).catch(() => {})));
    return sheelohaUrl;
  } catch (error) {
    await Promise.all([taroukFile, clapFile, outputFile, scriptFile].map(f => unlink(f).catch(() => {})));
    console.error(`[generateSheeloha] ERROR:`, error);
    throw error;
  }
}
