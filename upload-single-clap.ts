import { readFileSync } from "fs";
import { storagePut } from "./server/storage";

async function uploadClap() {
  const fileBuffer = readFileSync("/home/ubuntu/single-clap.mp3");
  const result = await storagePut(
    "audio/clap-final.mp3",
    fileBuffer,
    "audio/mpeg"
  );

  console.log("✅ Uploaded clap sound:", result.url);
  console.log("✅ Key:", result.key);
}

uploadClap().catch(console.error);
