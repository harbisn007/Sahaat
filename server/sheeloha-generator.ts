/**
 * Sheeloha Generator
 * 5 أصوات بطبقات مختلفة + تصفيق متكرر
 */

import { exec } from "child_process";
import { promisify } from "util";
import { unlink, readFile, writeFile } from "fs/promises";
import path from "path";
import { tmpdir } from "os";
import { storagePut, storageDownload } from "./storage";

const execAsync = promisify(exec);

const CLAP_REL_KEY = "user_upload_by_module/session_file/310519663292181877/bXZOlcZxcTqODWQb.mp3";

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
  const scriptFile = path.join(tempDir, `ffmpeg-${ts}.sh`);

  console.log(`[generateSheeloha] START - duration: ${taroukDuration}s`);

  try {
    // 1. تحميل الملفين مباشرة عبر storage proxy (بدون CloudFront)
    const taroukRelKey = new URL(taroukUrl).pathname.replace(/^\//, "");
    const taroukBuffer = await storageDownload(taroukRelKey);
    await writeFile(taroukFile, taroukBuffer);
    console.log(`[generateSheeloha] Tarouk downloaded: ${taroukBuffer.length} bytes`);

    const clapBuffer = await storageDownload(CLAP_REL_KEY);
    await writeFile(clapFile, clapBuffer);
    console.log(`[generateSheeloha] Clap downloaded: ${clapBuffer.length} bytes`);

    // 2. ffmpeg: 5 أصوات بطبقات مختلفة + تصفيق
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

    // 3. رفع الملف
    const fileBuffer = await readFile(outputFile);
    const { url: sheelohaUrl } = await storagePut(`audio/sheeloha-${ts}.mp3`, fileBuffer, "audio/mpeg");
    console.log(`[generateSheeloha] Uploaded: ${sheelohaUrl}`);

    // 4. تنظيف
    await Promise.all([taroukFile, clapFile, outputFile, scriptFile].map(f => unlink(f).catch(() => {})));

    return sheelohaUrl;
  } catch (error) {
    await Promise.all([taroukFile, clapFile, outputFile, scriptFile].map(f => unlink(f).catch(() => {})));
    console.error(`[generateSheeloha] ERROR:`, error);
    throw error;
  }
}