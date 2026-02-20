/**
 * Test generateSheeloha using tRPC client
 */

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "./server/routers";

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "http://127.0.0.1:3000/api/trpc",
      transformer: superjson,
    }),
  ],
});

async function testGenerateSheeloha() {
  console.log("🧪 Testing generateSheeloha with tRPC client...\n");

  try {
    const result = await client.audio.generateSheeloha.mutate({
      taroukUrl: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663292181877/bXZOlcZxcTqODWQb.mp3",
      taroukDuration: 3,
      roomId: 1,
    });

    console.log("✅ SUCCESS!");
    console.log("Result:", result);
    return true;
  } catch (error: any) {
    console.error("❌ FAILED:", error.message);
    console.error("Details:", error);
    return false;
  }
}

testGenerateSheeloha().then((success) => {
  process.exit(success ? 0 : 1);
});
