import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { initializeSocketIO } from "./socket";
import { startRoomCleanupService } from "./room-cleanup";



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

  // مسار صفحة الدعوة - يفتح التطبيق أو يعرض صفحة ويب
  app.get("/invite/:id", (req, res) => {
    const { id } = req.params;
    const inviter = req.query.inviter as string || '';
    const appScheme = 'manus20260120123613';
    const deepLink = `${appScheme}://invite/${id}?inviter=${encodeURIComponent(inviter)}`;
    const storeLink = 'https://play.google.com/store/apps/details?id=space.manus.sahaat.muhawara.t20260120123613';
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>دعوة - طواريق</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1c1208; color: #d4af37; font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #2d1f0e; border: 2px solid #c8860a; border-radius: 20px; padding: 32px 24px; max-width: 400px; width: 100%; text-align: center; }
    h1 { font-size: 28px; font-weight: 900; margin-bottom: 8px; }
    .sub { color: rgba(212,175,55,0.6); font-size: 14px; margin-bottom: 32px; }
    .inviter { font-size: 16px; margin-bottom: 24px; color: rgba(212,175,55,0.8); }
    .btn { display: block; background: #c8860a; color: #fff; font-size: 18px; font-weight: 900; padding: 16px; border-radius: 14px; text-decoration: none; margin-bottom: 16px; }
    .btn-outline { display: block; background: transparent; color: #d4af37; font-size: 14px; padding: 12px; border-radius: 14px; text-decoration: none; border: 2px solid #c8860a; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🎙️ طواريق</h1>
    <p class="sub">منصة تفاعلية للمحاورة الشعرية</p>
    ${inviter ? `<p class="inviter">دعاك <strong>${inviter}</strong> للانضمام</p>` : ''}
    <a href="${deepLink}" class="btn">افتح في التطبيق</a>
    <a href="${storeLink}" class="btn-outline">حمّل التطبيق من Google Play</a>
  </div>
  <script>
    // محاولة فتح التطبيق تلقائياً
    setTimeout(() => { window.location.href = '${deepLink}'; }, 500);
  </script>
</body>
</html>`);
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // Endpoint تشخيصي بسيط
  app.get("/api/debug/server", async (_req, res) => {
    res.json({
      ok: true,
      nodeEnv: process.env.NODE_ENV,
      timestamp: Date.now(),
    });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const port = parseInt(process.env.PORT || "8080");

  server.listen(port, '0.0.0.0', () => {
    console.log(`[api] server listening on port ${port}`);
    console.log(`[Socket.io] WebSocket server ready on port ${port}`);
    
    // بدء نظام تنظيف الساحات الفارغة
    startRoomCleanupService();
  });
}

startServer().catch(console.error);
