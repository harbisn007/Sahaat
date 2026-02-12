import { generateSheeloha } from "./server/sheeloha-generator";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function test() {
  // إنشاء ملف صوتي تجريبي بصيغة webm (كما يرسله المتصفح)
  const webmPath = "/tmp/test-input.webm";
  const m4aPath = "/tmp/test-input.m4a";
  
  // إنشاء ملف صوتي تجريبي
  await execAsync(`ffmpeg -y -f lavfi -i "sine=frequency=440:duration=3" -c:a libopus "${webmPath}"`);
  console.log("Created test webm file");
  
  // قراءة كـ buffer
  const webmBuffer = await fs.promises.readFile(webmPath);
  console.log(`WebM buffer size: ${webmBuffer.length} bytes`);
  
  try {
    const result = await generateSheeloha(webmBuffer);
    console.log(`Result size: ${result.length} bytes`);
    console.log(`Same as input? ${result.length === webmBuffer.length}`);
    
    // التحقق من أن المحتوى مختلف
    const isSame = Buffer.compare(result, webmBuffer) === 0;
    console.log(`Content identical? ${isSame}`);
    
    if (isSame) {
      console.log("ERROR: Sheeloha is identical to input - fallback returned original!");
    } else {
      console.log("SUCCESS: Sheeloha is different from input");
    }
  } catch (error) {
    console.error("generateSheeloha threw error:", error);
  }
  
  // الآن اختبار مع m4a
  await execAsync(`ffmpeg -y -f lavfi -i "sine=frequency=440:duration=3" -c:a aac "${m4aPath}"`);
  const m4aBuffer = await fs.promises.readFile(m4aPath);
  console.log(`\nM4A buffer size: ${m4aBuffer.length} bytes`);
  
  try {
    const result2 = await generateSheeloha(m4aBuffer);
    console.log(`M4A Result size: ${result2.length} bytes`);
    const isSame2 = Buffer.compare(result2, m4aBuffer) === 0;
    console.log(`M4A Content identical? ${isSame2}`);
  } catch (error) {
    console.error("M4A generateSheeloha threw error:", error);
  }
}

test().catch(console.error);
