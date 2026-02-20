/**
 * Test generateSheeloha manually with a real audio file
 */

import { generateSheeloha } from "./server/sheeloha-generator";

async function test() {
  console.log("🧪 Testing generateSheeloha manually...\n");

  // استخدام ملف صوتي عام (example.com)
  const testUrl = "https://www2.cs.uic.edu/~i101/SoundFiles/BabyElephantWalk60.wav";
  
  try {
    console.log(`Testing with: ${testUrl}`);
    const result = await generateSheeloha({
      taroukUrl: testUrl,
      taroukDuration: 3,
    });

    console.log("\n✅ SUCCESS!");
    console.log(`Sheeloha URL: ${result}`);
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
