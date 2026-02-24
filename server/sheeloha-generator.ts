/**
 * Sheeloha Generator
 * - صوت الصفوف: 4 نسخ بتأخيرات (إحساس بالجمع)
 * - تصفيق كل 0.96 ثانية منتظم
 * - لوب مستمر مع 0.15s صمت بين كل تكرار
 * - يتوقف عند ضغط زر خلوها
 */

import { exec } from "child_process";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { unlink, readFile, writeFile, copyFile } from "fs/promises";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { storagePut } from "./storage";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execAsync = promisify(exec);

const CLAP_LOCAL_PATH = join(__dirname, "sounds", "single-clap-short.mp3");

// البحث عن ffmpeg وتثبيته إن لم يكن موجوداً
import { execSync } from "child_process";

function findOrInstallFFmpeg(): string {
  // البحث في المسارات الشائعة
  const paths = ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/bin/ffmpeg", "/nix/store"];
  
  // البحث في nix store
  try {
    const nixPath = execSync("find /nix/store -name 'ffmpeg' -type f 2>/dev/null | head -1").toString().trim();
    if (nixPath) {
      console.log("[sheeloha-generator] Found ffmpeg in nix:", nixPath);
      return nixPath;
    }
  } catch {}

  // البحث بـ which
  try {
    const whichPath = execSync("which ffmpeg 2>/dev/null").toString().trim();
    if (whichPath) {
      console.log("[sheeloha-generator] Found ffmpeg:", whichPath);
      return whichPath;
    }
  } catch {}

  // تثبيت عبر apt
  try {
    console.log("[sheeloha-generator] Installing ffmpeg via apt...");
    execSync("apt-get install -y ffmpeg 2>/dev/null || true", { timeout: 60000 });
    return "ffmpeg";
  } catch {}

  return "ffmpeg";
}

const FFMPEG = findOrInstallFFmpeg();
console.log("[sheeloha-generator] Using ffmpeg:", FFMPEG);

export interface SheelohaOptions {
  taroukBase64: string;
  taroukDuration: number;
}

export async function generateSheeloha(options: SheelohaOptions): Promise<string> {
  const { taroukBase64, taroukDuration } = options;
  const ts = Date.now();
  const tempDir = tmpdir();
  const taroukFile     = join(tempDir, `tarouk-${ts}.m4a`);
  const taroukLoopFile = join(tempDir, `tarouk-loop-${ts}.mp3`);
  const clapRaw        = join(tempDir, `clap-raw-${ts}.mp3`);
  const clapUnitFile   = join(tempDir, `clap-unit-${ts}.mp3`);
  const outputFile     = join(tempDir, `sheeloha-${ts}.mp3`);
  const scriptFile     = join(tempDir, `ffmpeg-${ts}.sh`);
  const LONG_DUR       = 120; // ثانية - يوقفه المستخدم بضغط خلوها

  console.log(`[generateSheeloha] START - ffmpeg: ${FFMPEG} - taroukDuration: ${taroukDuration}s`);

  try {
    // 1. حفظ الطاروق من base64
    await writeFile(taroukFile, Buffer.from(taroukBase64, "base64"));

    // 2. بناء وحدة تصفيق = 0.96s (صوت 0.34s + صمت 0.62s)
    await copyFile(CLAP_LOCAL_PATH, clapRaw);
    await execAsync(`"${FFMPEG}" -y -i "${clapRaw}" -filter_complex "[0:a]apad=pad_dur=0.62[out]" -map "[out]" -t 0.96 -ar 44100 -ac 2 "${clapUnitFile}"`, { maxBuffer: 10 * 1024 * 1024 });

    // 3. بناء وحدة الطاروق + 0.15s صمت للـ loop
    await execAsync(`"${FFMPEG}" -y -i "${taroukFile}" -filter_complex "[0:a]apad=pad_dur=0.15[out]" -map "[out]" "${taroukLoopFile}"`, { maxBuffer: 10 * 1024 * 1024 });

    // 4. الملف النهائي: loop مستمر 120s
    const scriptContent = `#!/bin/bash
set -e
export PATH="/usr/bin:/usr/local/bin:$PATH"
"${FFMPEG}" -y \\
  -stream_loop -1 -i "${taroukLoopFile}" \\
  -stream_loop -1 -i "${clapUnitFile}" \\
  -filter_complex "
    [0:a]asplit=4[s1][s2][s3][s4];
    [s1]volume=0.50[v1];
    [s2]adelay=40|40,volume=0.42[v2];
    [s3]adelay=90|90,volume=0.38[v3];
    [s4]adelay=150|150,volume=0.34[v4];
    [v1][v2][v3][v4]amix=inputs=4:duration=first:normalize=0[crowd];
    [1:a]atrim=end=${LONG_DUR},volume=0.35[clap];
    [crowd][clap]amix=inputs=2:duration=first:normalize=0[out]
  " \\
  -map "[out]" \\
  -t ${LONG_DUR} \\
  -ar 44100 -ac 2 -b:a 128k \\
  "${outputFile}"
`;
    await writeFile(scriptFile, scriptContent, { mode: 0o755 });
    await execAsync(`bash "${scriptFile}"`, { maxBuffer: 50 * 1024 * 1024 });
    console.log(`[generateSheeloha] ffmpeg done`);

    // 5. رفع الملف
    const fileBuffer = await readFile(outputFile);
    const { url: sheelohaUrl } = await storagePut(`audio/sheeloha-${ts}.mp3`, fileBuffer, "audio/mpeg");
    console.log(`[generateSheeloha] Uploaded: ${sheelohaUrl}`);

    await Promise.all([taroukFile, taroukLoopFile, clapRaw, clapUnitFile, outputFile, scriptFile].map(f => unlink(f).catch(() => {})));
    return sheelohaUrl;
  } catch (error) {
    await Promise.all([taroukFile, taroukLoopFile, clapRaw, clapUnitFile, outputFile, scriptFile].map(f => unlink(f).catch(() => {})));
    console.error(`[generateSheeloha] ERROR:`, error);
    throw error;
  }
}