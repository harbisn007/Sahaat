/**
 * Upload clap sound to S3
 */

import { readFileSync } from "fs";
import { storagePut } from "./server/storage";

async function upload() {
  console.log("📤 Uploading clap sound...\n");

  try {
    const clapBuffer = readFileSync("/tmp/clap-sound.mp3");
    const { key, url } = await storagePut(
      "audio/clap-final.mp3",
      clapBuffer,
      "audio/mpeg"
    );

    console.log("✅ SUCCESS!");
    console.log(`Key: ${key}`);
    console.log(`URL: ${url}`);
    console.log(`\nUpdate CLAP_REL_KEY in sheeloha-generator.ts to: "${key}"`);
    
    return true;
  } catch (error: any) {
    console.error("❌ FAILED:", error.message);
    return false;
  }
}

upload().then((success) => {
  process.exit(success ? 0 : 1);
});
