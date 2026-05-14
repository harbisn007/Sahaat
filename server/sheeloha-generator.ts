/**
 * Sheeloha Generator - server side
 * يأخذ URL الطاروق → يدمج 5 نسخ بسرعات مختلفة → يرفع ملف واحد على R2
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { storagePut } from "./storage";

const CROWD_FIXED = [
  { volume: 0.40, rate: 1.07 },
  { volume: 0.30, rate: 1.06 },
  { volume: 0.38, rate: 1.08 },
  { volume: 0.38, rate: 1.05 },
  { volume: 0.48, rate: 1.09 },
];

export interface SheelohaOptions {
  taroukUrl: string;
  taroukDuration: number;
}

export async function generateSheeloha(options: SheelohaOptions): Promise<string> {
  const { taroukUrl } = options;

  console.log("[SheelohaGen] Downloading tarouk:", taroukUrl);
  const response = await fetch(taroukUrl);
  if (!response.ok) throw new Error(`Failed to download tarouk: ${response.status}`);
  const taroukBuffer = Buffer.from(await response.arrayBuffer());

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sheeloha-"));
  const inputPath = path.join(tmpDir, "tarouk.m4a");
  const outputPath = path.join(tmpDir, "sheeloha.m4a");

  try {
    fs.writeFileSync(inputPath, taroukBuffer);
    await runFfmpegMix(inputPath, outputPath, CROWD_FIXED);
    const outputBuffer = fs.readFileSync(outputPath);
    const fileKey = `sheeloha/${Date.now()}-mixed.m4a`;
    const { url } = await storagePut(fileKey, outputBuffer, "audio/mp4");
    console.log("[SheelohaGen] Uploaded:", url);
    return url;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
  }
}

function runFfmpegMix(
  inputPath: string,
  outputPath: string,
  tracks: { volume: number; rate: number }[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
    const ffmpeg = require("fluent-ffmpeg");
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);

    const cmd = ffmpeg();
    for (let i = 0; i < tracks.length; i++) {
      cmd.input(inputPath);
    }

    const filterParts: string[] = [];
    const labels: string[] = [];
    tracks.forEach(({ volume, rate }, i) => {
      const label = `t${i}`;
      filterParts.push(`[${i}:a]atempo=${rate},volume=${volume}[${label}]`);
      labels.push(`[${label}]`);
    });
    filterParts.push(`${labels.join("")}amix=inputs=${tracks.length}:normalize=0[out]`);

    cmd
      .complexFilter(filterParts.join(";"), "out")
      .audioCodec("aac")
      .audioBitrate("128k")
      .output(outputPath)
      .on("end", () => { console.log("[SheelohaGen] ffmpeg done"); resolve(); })
      .on("error", (err: Error) => { console.error("[SheelohaGen] ffmpeg error:", err.message); reject(err); })
      .run();
  });
}
