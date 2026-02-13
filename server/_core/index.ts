import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { initializeSocketIO } from "./socket";
import { startRoomCleanupService } from "./room-cleanup";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // تهيئة Socket.io
  initializeSocketIO(server);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // Endpoint تشخيصي لفحص حالة ffmpeg وملفات التصفيق
  app.get("/api/debug/sheeloha", async (_req, res) => {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const execAsync = promisify(exec);
    
    const checks: Record<string, any> = {};
    
    // 1. فحص ffmpeg النظام
    try {
      const { stdout } = await execAsync("ffmpeg -version");
      checks.systemFfmpeg = { available: true, version: stdout.split('\n')[0] };
    } catch (e) {
      checks.systemFfmpeg = { available: false, error: String(e) };
    }
    
    // 1b. فحص ffmpeg-static (المضمّن)
    try {
      const { createRequire } = await import("module");
      const require = createRequire(import.meta.url);
      const ffmpegStaticPath = require("ffmpeg-static");
      const ffmpegExists = fs.existsSync(ffmpegStaticPath);
      if (ffmpegExists) {
        const { stdout } = await execAsync(`"${ffmpegStaticPath}" -version`);
        checks.ffmpegStatic = { available: true, path: ffmpegStaticPath, version: stdout.split('\n')[0] };
      } else {
        checks.ffmpegStatic = { available: false, path: ffmpegStaticPath, error: "Binary not found at path" };
      }
    } catch (e) {
      checks.ffmpegStatic = { available: false, error: String(e) };
    }
    
    // 2. فحص ffprobe
    try {
      const { stdout } = await execAsync("ffprobe -version");
      checks.systemFfprobe = { available: true, version: stdout.split('\n')[0] };
    } catch (e) {
      checks.systemFfprobe = { available: false, error: String(e) };
    }
    
    // 2b. فحص ffprobe-static
    try {
      const { createRequire } = await import("module");
      const require = createRequire(import.meta.url);
      const ffprobeStatic = require("ffprobe-static");
      const ffprobePath = ffprobeStatic.path || ffprobeStatic;
      const ffprobeExists = fs.existsSync(ffprobePath);
      if (ffprobeExists) {
        const { stdout } = await execAsync(`"${ffprobePath}" -version`);
        checks.ffprobeStatic = { available: true, path: ffprobePath, version: stdout.split('\n')[0] };
      } else {
        checks.ffprobeStatic = { available: false, path: ffprobePath, error: "Binary not found" };
      }
    } catch (e) {
      checks.ffprobeStatic = { available: false, error: String(e) };
    }
    
    // 3. فحص ملفات التصفيق
    const soundsDir = path.join(process.cwd(), "server", "sounds");
    const distSoundsDir = path.join(process.cwd(), "dist", "sounds");
    checks.soundFiles = {
      cwd: process.cwd(),
      serverSoundsDir: { exists: fs.existsSync(soundsDir), path: soundsDir },
      distSoundsDir: { exists: fs.existsSync(distSoundsDir), path: distSoundsDir },
      singleClap: {
        serverPath: fs.existsSync(path.join(soundsDir, "single-clap-short.mp3")),
        distPath: fs.existsSync(path.join(distSoundsDir, "single-clap-short.mp3")),
      },
      endClaps: {
        serverPath: fs.existsSync(path.join(soundsDir, "sheeloha-claps.mp3")),
        distPath: fs.existsSync(path.join(distSoundsDir, "sheeloha-claps.mp3")),
      },
    };
    
    // 4. فحص البيئة
    checks.env = {
      nodeEnv: process.env.NODE_ENV,
      cwd: process.cwd(),
      tmpdir: os.tmpdir(),
      tmpdirWritable: false,
    };
    
    // فحص الكتابة في tmpdir
    try {
      const testFile = path.join(os.tmpdir(), `sheeloha-test-${Date.now()}.txt`);
      fs.writeFileSync(testFile, "test");
      fs.unlinkSync(testFile);
      checks.env.tmpdirWritable = true;
    } catch (e) {
      checks.env.tmpdirWritable = false;
      checks.env.tmpdirError = String(e);
    }
    
    // 5. تحديد مسار ffmpeg المستخدم (مضمّن أو نظام)
    let ffmpegCmd = "ffmpeg";
    try {
      const { createRequire: cr } = await import("module");
      const req = cr(import.meta.url);
      const staticPath = req("ffmpeg-static");
      if (staticPath && fs.existsSync(staticPath)) ffmpegCmd = `"${staticPath}"`;
    } catch {}
    checks.ffmpegUsed = ffmpegCmd;
    
    // 5b. اختبار إنشاء ملف صوتي بسيط
    try {
      const testOutput = path.join(os.tmpdir(), `sheeloha-test-${Date.now()}.m4a`);
      await execAsync(`${ffmpegCmd} -y -f lavfi -i "sine=frequency=440:duration=1" -c:a aac -b:a 64k "${testOutput}"`, { timeout: 10000 });
      const stat = fs.statSync(testOutput);
      checks.ffmpegTest = { success: true, outputSize: stat.size };
      fs.unlinkSync(testOutput);
    } catch (e) {
      checks.ffmpegTest = { success: false, error: String(e) };
    }
    
    // 6. اختبار generateSheeloha مع ملف تجريبي
    try {
      const testAudioPath = path.join(os.tmpdir(), `sheeloha-test-input-${Date.now()}.m4a`);
      // إنشاء ملف صوتي تجريبي (2 ثواني)
      await execAsync(`${ffmpegCmd} -y -f lavfi -i "sine=frequency=300:duration=2" -c:a aac -b:a 64k "${testAudioPath}"`, { timeout: 10000 });
      const testBuffer = fs.readFileSync(testAudioPath);
      fs.unlinkSync(testAudioPath);
      
      const { generateSheeloha } = await import("../sheeloha-generator");
      const startTime = Date.now();
      const result = await generateSheeloha(testBuffer);
      const elapsed = Date.now() - startTime;
      
      checks.generateSheelohaTest = {
        success: true,
        inputSize: testBuffer.length,
        outputSize: result.length,
        elapsedMs: elapsed,
      };
    } catch (e) {
      checks.generateSheelohaTest = {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack?.split('\n').slice(0, 5) : undefined,
      };
    }
    
    res.json(checks);
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
    console.log(`[Socket.io] WebSocket server ready on port ${port}`);
    
    // بدء نظام تنظيف الساحات الفارغة
    startRoomCleanupService();
  });
}

startServer().catch(console.error);
