import { speedUpAudio } from "./server/audio-processor";
import { generateSheeloha } from "./server/sheeloha-generator";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function test() {
  // محاكاة ما يحدث في uploadAudio بالضبط
  
  // 1. إنشاء ملف webm (كما يرسله المتصفح)
  await execAsync(`ffmpeg -y -f lavfi -i "sine=frequency=440:duration=3" -c:a libopus /tmp/test-pipeline.webm`);
  const originalBuffer = await fs.promises.readFile("/tmp/test-pipeline.webm");
  console.log(`1. Original buffer (webm): ${originalBuffer.length} bytes`);
  
  // 2. تسريع الصوت (speedUpAudio) - كما في uploadAudio
  console.log("\n2. Running speedUpAudio (processAudio)...");
  const processedBuffer = await speedUpAudio(originalBuffer, 1.15);
  console.log(`   Processed buffer: ${processedBuffer.length} bytes`);
  console.log(`   Same as original? ${Buffer.compare(processedBuffer, originalBuffer) === 0}`);
  
  // 3. إنشاء الشيلوها من الملف المعالج - كما في uploadAudio
  console.log("\n3. Running generateSheeloha on processed buffer...");
  try {
    const sheelohaBuffer = await generateSheeloha(processedBuffer);
    console.log(`   Sheeloha buffer: ${sheelohaBuffer.length} bytes`);
    console.log(`   Same as processed? ${Buffer.compare(sheelohaBuffer, processedBuffer) === 0}`);
    console.log(`   Same as original? ${Buffer.compare(sheelohaBuffer, originalBuffer) === 0}`);
    
    if (Buffer.compare(sheelohaBuffer, processedBuffer) === 0) {
      console.log("\n   *** ERROR: SHEELOHA IS SAME AS PROCESSED TAROUK! ***");
    } else {
      console.log("\n   *** SUCCESS: SHEELOHA IS DIFFERENT ***");
    }
  } catch (error) {
    console.error("   generateSheeloha error:", error);
  }
}

test().catch(console.error);
