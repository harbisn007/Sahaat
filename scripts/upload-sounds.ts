/**
 * Upload clap sound files to S3 storage
 * Run with: npx tsx scripts/upload-sounds.ts
 */
import fs from "fs";
import path from "path";
import { storagePut } from "../server/storage";

async function main() {
  const soundsDir = path.join(__dirname, "../server/sounds");
  
  const files = [
    { name: "single-clap-short.mp3", key: "sounds/single-clap-short.mp3" },
    { name: "sheeloha-claps.mp3", key: "sounds/sheeloha-claps.mp3" },
  ];
  
  for (const file of files) {
    const filePath = path.join(soundsDir, file.name);
    const buffer = fs.readFileSync(filePath);
    console.log(`Uploading ${file.name} (${buffer.length} bytes)...`);
    const result = await storagePut(file.key, buffer, "audio/mpeg");
    console.log(`  → ${result.url}`);
  }
  
  console.log("\nDone! Use these URLs in the client.");
}

main().catch(console.error);
