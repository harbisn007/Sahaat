/**
 * Test getting signed URL from storage
 */

import { storageGet } from "./server/storage";

async function test() {
  console.log("🧪 Testing storageGet...\n");

  // استخدام relKey من URL موجود
  const relKey = "user_upload_by_module/session_file/310519663292181877/bXZOlcZxcTqODWQb.mp3";
  
  try {
    console.log(`Getting signed URL for: ${relKey}`);
    const { url } = await storageGet(relKey);
    console.log(`\n✅ SUCCESS!`);
    console.log(`Signed URL: ${url}`);
    
    // اختبار التحميل
    console.log(`\nTesting download...`);
    const response = await fetch(url);
    console.log(`Response status: ${response.status}`);
    console.log(`Content-Type: ${response.headers.get("content-type")}`);
    console.log(`Content-Length: ${response.headers.get("content-length")}`);
    
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
