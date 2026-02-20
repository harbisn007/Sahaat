/**
 * Test upload + generateSheeloha end-to-end
 */

import { readFileSync } from "fs";
import { storagePut, storageGet } from "./server/storage";
import { generateSheeloha } from "./server/sheeloha-generator";

async function test() {
  console.log("🧪 Testing upload + generateSheeloha...\n");

  try {
    // 1. رفع ملف صوتي
    console.log("1. Uploading test audio...");
    const audioBuffer = readFileSync("/tmp/test-tone.mp3");
    const { key, url } = await storagePut(
      `test/tarouk-${Date.now()}.mp3`,
      audioBuffer,
      "audio/mpeg"
    );
    console.log(`✅ Uploaded: ${url}`);
    console.log(`   Key: ${key}`);

    // 2. الحصول على signed URL
    console.log("\n2. Getting signed URL...");
    const { url: signedUrl } = await storageGet(key);
    console.log(`✅ Signed URL: ${signedUrl}`);

    // 3. اختبار التحميل
    console.log("\n3. Testing download...");
    const response = await fetch(signedUrl);
    console.log(`   Status: ${response.status}`);
    if (response.status !== 200) {
      throw new Error(`Download failed: ${response.status}`);
    }
    console.log(`✅ Download successful`);

    // 4. توليد الشيلوها
    console.log("\n4. Generating sheeloha...");
    const sheelohaUrl = await generateSheeloha({
      taroukUrl: signedUrl,
      taroukDuration: 3,
    });
    console.log(`✅ Sheeloha generated: ${sheelohaUrl}`);

    console.log("\n🎉 ALL TESTS PASSED!");
    return true;
  } catch (error: any) {
    console.error("\n❌ FAILED:", error.message);
    console.error("Stack:", error.stack);
    return false;
  }
}

test().then((success) => {
  process.exit(success ? 0 : 1);
});
