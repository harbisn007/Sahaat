import { Router, Request, Response } from "express";
import { getDb } from "./db";
import { users, rooms, reports, adminBans } from "../drizzle/schema";
import { desc, count, eq, and, gte } from "drizzle-orm";
import * as db from "./db";
import { emitUserBanned, getActiveUserIds } from "./_core/socket";

const router = Router();

// كلمة مرور الإدارة — تُقرأ من متغير البيئة أو قيمة افتراضية
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Pa22w@rd_2026";
// مفتاح الجلسة البسيط (in-memory)
const activeSessions = new Set<string>();

function generateToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function isAuthenticated(req: Request): boolean {
  const token = req.cookies?.admin_token || req.headers["x-admin-token"];
  return typeof token === "string" && activeSessions.has(token);
}

// ── صفحة تسجيل الدخول ──────────────────────────────────────────────────────
router.get("/", (req: Request, res: Response) => {
  if (isAuthenticated(req)) {
    return res.redirect("/admin/dashboard");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(loginPage());
});

// ── معالجة تسجيل الدخول ────────────────────────────────────────────────────
router.post("/login", (req: Request, res: Response) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = generateToken();
    activeSessions.add(token);
    res.cookie("admin_token", token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }); // 8 ساعات
    return res.redirect("/admin/dashboard");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(loginPage("كلمة المرور غير صحيحة"));
});

// ── تسجيل الخروج ────────────────────────────────────────────────────────────
router.get("/logout", (req: Request, res: Response) => {
  const token = req.cookies?.admin_token;
  if (token) activeSessions.delete(token);
  res.clearCookie("admin_token");
  res.redirect("/admin");
});

// ── لوحة التحكم الرئيسية ────────────────────────────────────────────────────
router.get("/dashboard", async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) return res.redirect("/admin");

  try {
    const dbConn = await getDb();
    if (!dbConn) return res.status(503).send("<p style='color:red;padding:20px'>قاعدة البيانات غير متاحة</p>");

    // إحصائيات سريعة
    const [totalUsers] = await dbConn.select({ count: count() }).from(users);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [rooms24h] = await dbConn.select({ count: count() }).from(rooms).where(gte(rooms.createdAt, since24h));
    const [activeRooms] = await dbConn.select({ count: count() }).from(rooms).where(eq(rooms.isActive, "true"));
    const [totalReports] = await dbConn.select({ count: count() }).from(reports);

    // جلب جميع المستخدمين بدون حد مع رقم الجوال
    const allUsersRaw = await dbConn
      .select({ id: users.id, name: users.name, phoneNumber: users.phoneNumber, avatar: users.avatar, loginMethod: users.loginMethod, role: users.role, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn, appUserId: users.appUserId })
      .from(users)
      .orderBy(desc(users.lastSignedIn));
    // المتصلون حالياً (نشطون خلال 60 ثانية)
    const activeIds = getActiveUserIds();
    // ترتيب: المتصلون أولاً ثم الباقي
    const latestUsers = [
      ...allUsersRaw.filter(u => activeIds.has(u.appUserId || '')),
      ...allUsersRaw.filter(u => !activeIds.has(u.appUserId || '')),
    ];

    // آخر 50 ساحة
    const latestRooms = await dbConn
      .select({ id: rooms.id, name: rooms.name, creatorName: rooms.creatorName, isActive: rooms.isActive, hasGoldStar: rooms.hasGoldStar, createdAt: rooms.createdAt })
      .from(rooms)
      .orderBy(desc(rooms.createdAt))
      .limit(50);

    // آخر 100 بلاغ (مرتبة من الأحدث)
    const allReports = await dbConn
      .select()
      .from(reports)
      .orderBy(desc(reports.createdAt))
      .limit(100);

    // المحظورون النشطون
    const activeBans = await dbConn
      .select()
      .from(adminBans)
      .where(eq(adminBans.isActive, "true"))
      .orderBy(desc(adminBans.createdAt))
      .limit(200);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(dashboardPage({ totalUsers: totalUsers.count, rooms24h: rooms24h.count, activeRooms: activeRooms.count, totalReports: totalReports.count, latestUsers, latestRooms, allReports, activeBans, activeIds }));
  } catch (err) {
    res.status(500).send(`<pre>خطأ: ${err}</pre>`);
  }
});

// ── API: حذف بلاغ ───────────────────────────────────────────────────────────
router.delete("/api/reports/:id", async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    await db.deleteReport(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── API: حظر مستخدم ─────────────────────────────────────────────────────────
router.post("/api/ban", async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { userId, username, banType } = req.body;
    if (!userId || !banType) return res.status(400).json({ error: "Missing fields" });
    const ban = await db.banUser(userId, username || userId, banType);
    emitUserBanned(userId, banType);
    res.json({ success: true, ban });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── API: إلغاء حظر مستخدم ──────────────────────────────────────────────────
router.post("/api/unban", async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    await db.liftBan(userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── API: بيانات JSON للمستخدمين ─────────────────────────────────────────────
router.get("/api/users", async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: "Unauthorized" });
  const dbConn = await getDb();
  if (!dbConn) return res.status(503).json({ error: "DB unavailable" });
  const data = await dbConn.select().from(users).orderBy(desc(users.createdAt)).limit(200);
  res.json(data);
});

// ── API: بيانات JSON للساحات ────────────────────────────────────────────────
router.get("/api/rooms", async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: "Unauthorized" });
  const dbConn = await getDb();
  if (!dbConn) return res.status(503).json({ error: "DB unavailable" });
  const data = await dbConn.select().from(rooms).orderBy(desc(rooms.createdAt)).limit(200);
  res.json(data);
});

export { router as adminRouter };

// ════════════════════════════════════════════════════════════════════════════
// HTML Templates
// ════════════════════════════════════════════════════════════════════════════

function loginPage(error?: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>لوحة الإدارة — طواريق</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f0a04; color: #d4af37; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1c1208; border: 2px solid #c8860a; border-radius: 16px; padding: 40px 32px; width: 100%; max-width: 380px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.6); }
    h1 { font-size: 26px; font-weight: 900; margin-bottom: 6px; }
    .sub { color: rgba(212,175,55,0.5); font-size: 13px; margin-bottom: 32px; }
    .field { margin-bottom: 16px; text-align: right; }
    label { display: block; font-size: 13px; color: rgba(212,175,55,0.7); margin-bottom: 6px; }
    input[type=password] { width: 100%; padding: 12px 14px; background: #2d1f0e; border: 1.5px solid #c8860a55; border-radius: 10px; color: #fff; font-size: 15px; outline: none; transition: border-color 0.2s; }
    input[type=password]:focus { border-color: #c8860a; }
    button { width: 100%; padding: 13px; background: #c8860a; color: #fff; font-size: 16px; font-weight: 700; border: none; border-radius: 10px; cursor: pointer; transition: opacity 0.2s; margin-top: 8px; }
    button:hover { opacity: 0.85; }
    .error { background: #3d1a1a; border: 1px solid #EF444466; color: #EF4444; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🎙️ طواريق</h1>
    <p class="sub">لوحة الإدارة</p>
    ${error ? `<div class="error">${error}</div>` : ""}
    <form method="POST" action="/admin/login">
      <div class="field">
        <label>كلمة المرور</label>
        <input type="password" name="password" placeholder="أدخل كلمة المرور" autofocus required />
      </div>
      <button type="submit">دخول</button>
    </form>
  </div>
</body>
</html>`;
}

function dashboardPage(data: {
  totalUsers: number;
  rooms24h: number;
  activeRooms: number;
  totalReports: number;
  latestUsers: any[];
  latestRooms: any[];
  allReports: any[];
  activeBans: any[];
  activeIds: Set<string>;
}): string {
  const { totalUsers, rooms24h, activeRooms, totalReports, latestUsers, latestRooms, allReports, activeBans, activeIds } = data;

  const usersRows = latestUsers.map(u => {
    const isOnline = activeIds.has(u.appUserId || '');
    return `
    <tr style="${isOnline ? 'background:#1a2d1a22;' : ''}">
      <td>${u.id}</td>
      <td>${isOnline ? '<span style="display:inline-block;width:8px;height:8px;background:#22C55E;border-radius:50%;margin-left:6px"></span>' : ''}<span style="${isOnline ? 'color:#22C55E;font-weight:700' : ''}">${u.name || '—'}</span></td>
      <td>${u.phoneNumber || '—'}</td>
      <td>${u.loginMethod || 'ضيف'}</td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}">${u.role === 'admin' ? 'مدير' : 'مستخدم'}</span></td>
      <td>${formatDate(u.lastSignedIn)}</td>
      <td>${formatDate(u.createdAt)}</td>
    </tr>`;
  }).join("");

  const roomsRows = latestRooms.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${r.name}</td>
      <td>${r.creatorName}</td>
      <td><span class="badge ${r.isActive === "true" ? "badge-active" : "badge-inactive"}">${r.isActive === "true" ? "نشطة" : "مغلقة"}</span></td>
      <td>${r.hasGoldStar === "true" ? "⭐" : "—"}</td>
      <td>${formatDate(r.createdAt)}</td>
    </tr>`).join("");

  const reasonLabel = (r: string) => r === "offensive_content" ? "محتوى مسيء" : "سلوك سيء";
  const typeLabel = (t: string) => t === "tarouk" ? "طاروق" : "تعليق";

  const reportsRows = allReports.map(r => `
    <tr id="report-row-${r.id}">
      <td>${formatDate(r.createdAt)}</td>
      <td>
        <audio controls style="height:28px;max-width:160px;vertical-align:middle">
          <source src="${r.audioUrl}" type="audio/mpeg">
        </audio>
        <span style="font-size:11px;color:#c8860a;margin-right:4px">${typeLabel(r.messageType)}</span>
      </td>
      <td><span class="badge badge-reason">${reasonLabel(r.reason)}</span></td>
      <td>
        <span class="clickable-name" onclick="showBanMenu('${r.reporterUserId}', '${(r.reporterName || '').replace(/'/g, "\\'")}', this)" style="cursor:pointer;color:#d4af37;text-decoration:underline dotted">${r.reporterName || r.reporterUserId}</span>
      </td>
      <td>
        <span class="clickable-name" onclick="showBanMenu('${r.reportedUserId}', '${(r.reportedName || '').replace(/'/g, "\\'")}', this)" style="cursor:pointer;color:#EF4444;text-decoration:underline dotted">${r.reportedName || r.reportedUserId}</span>
      </td>
      <td>
        <button class="del-btn" onclick="deleteReport(${r.id})" title="حذف البلاغ">🗑️</button>
      </td>
    </tr>`).join("");

  const banTypeLabel = (t: string) => {
    if (t === "1h") return '<span class="badge badge-ban-temp">ساعة واحدة</span>';
    if (t === "24h") return '<span class="badge badge-ban-temp">24 ساعة</span>';
    return '<span class="badge badge-ban-perm">دائم</span>';
  };

  const bansRows = activeBans.map(b => `
    <tr id="ban-row-${b.id}">
      <td>${b.username || b.userId}</td>
      <td>${banTypeLabel(b.banType)}</td>
      <td>${formatDate(b.bannedAt)}</td>
      <td>${b.expiresAt ? formatDate(b.expiresAt) : '<span style="color:#EF4444">دائم</span>'}</td>
      <td>
        <button class="unban-btn" onclick="unbanUser('${b.userId}', '${(b.username || b.userId).replace(/'/g, "\\'")}', ${b.id})">رفع الحظر</button>
      </td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>لوحة الإدارة — طواريق</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f0a04; color: #d4af37; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; min-height: 100vh; }
    header { background: #1c1208; border-bottom: 2px solid #c8860a; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
    header h1 { font-size: 20px; font-weight: 900; }
    header a { color: rgba(212,175,55,0.6); font-size: 13px; text-decoration: none; padding: 6px 14px; border: 1px solid #c8860a44; border-radius: 8px; transition: all 0.2s; }
    header a:hover { color: #d4af37; border-color: #c8860a; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .stat-card { background: #1c1208; border: 1.5px solid #c8860a44; border-radius: 14px; padding: 20px; text-align: center; }
    .stat-card .num { font-size: 36px; font-weight: 900; color: #c8860a; }
    .stat-card .lbl { font-size: 13px; color: rgba(212,175,55,0.6); margin-top: 4px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1.5px solid #c8860a33; padding-bottom: 0; flex-wrap: wrap; }
    .tab { padding: 10px 20px; cursor: pointer; font-size: 14px; font-weight: 600; color: rgba(212,175,55,0.5); border-bottom: 2.5px solid transparent; margin-bottom: -1.5px; transition: all 0.2s; background: none; border-top: none; border-left: none; border-right: none; }
    .tab.active { color: #c8860a; border-bottom-color: #c8860a; }
    .tab:hover { color: #d4af37; }
    .panel { display: none; }
    .panel.active { display: block; }
    .search-bar { width: 100%; padding: 10px 14px; background: #1c1208; border: 1.5px solid #c8860a44; border-radius: 10px; color: #d4af37; font-size: 14px; outline: none; margin-bottom: 16px; }
    .search-bar:focus { border-color: #c8860a; }
    .table-wrap { overflow-x: auto; border-radius: 12px; border: 1.5px solid #c8860a33; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead { background: #2d1f0e; }
    th { padding: 12px 14px; text-align: right; color: rgba(212,175,55,0.7); font-weight: 600; white-space: nowrap; }
    td { padding: 11px 14px; border-top: 1px solid #c8860a15; color: #ECEDEE; white-space: nowrap; }
    tr:hover td { background: #1c1208; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .badge-user { background: #2d1f0e; color: #c8860a; border: 1px solid #c8860a44; }
    .badge-admin { background: #1a2d1a; color: #22C55E; border: 1px solid #22C55E44; }
    .badge-active { background: #1a2d1a; color: #22C55E; border: 1px solid #22C55E44; }
    .badge-inactive { background: #2d1a1a; color: #EF4444; border: 1px solid #EF444444; }
    .badge-reason { background: #2d1a1a; color: #F59E0B; border: 1px solid #F59E0B44; }
    .badge-ban-temp { background: #2d1f0e; color: #F59E0B; border: 1px solid #F59E0B44; }
    .badge-ban-perm { background: #3d1a1a; color: #EF4444; border: 1px solid #EF444444; }
    .refresh-btn { background: #2d1f0e; color: #c8860a; border: 1.5px solid #c8860a55; border-radius: 8px; padding: 7px 16px; font-size: 13px; cursor: pointer; transition: all 0.2s; }
    .refresh-btn:hover { background: #c8860a; color: #fff; }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .section-header h2 { font-size: 15px; color: rgba(212,175,55,0.7); }
    .del-btn { background: none; border: none; cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 6px; transition: background 0.2s; }
    .del-btn:hover { background: #3d1a1a; }
    .unban-btn { background: #1a2d1a; color: #22C55E; border: 1.5px solid #22C55E44; border-radius: 8px; padding: 5px 14px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
    .unban-btn:hover { background: #22C55E; color: #fff; border-color: #22C55E; }
    .empty-state { text-align:center; padding:60px 20px; color:rgba(212,175,55,0.4); }
    .empty-state .icon { font-size:48px; margin-bottom:12px; }
    /* Ban Menu Popup */
    #ban-menu { display:none; position:fixed; background:#1c1208; border:2px solid #c8860a; border-radius:14px; padding:16px; z-index:999; min-width:200px; box-shadow:0 8px 32px rgba(0,0,0,0.7); }
    #ban-menu h3 { font-size:13px; color:rgba(212,175,55,0.7); margin-bottom:12px; }
    #ban-menu .ban-name { font-size:14px; font-weight:700; color:#d4af37; margin-bottom:12px; }
    .ban-option { display:block; width:100%; padding:9px 14px; margin-bottom:6px; background:#2d1f0e; color:#d4af37; border:1.5px solid #c8860a33; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; text-align:right; transition:all 0.2s; }
    .ban-option:hover { background:#c8860a; color:#fff; border-color:#c8860a; }
    .ban-option.permanent { background:#3d1a1a; color:#EF4444; border-color:#EF444444; }
    .ban-option.permanent:hover { background:#EF4444; color:#fff; }
    .ban-cancel { display:block; width:100%; padding:7px; background:none; border:none; color:rgba(212,175,55,0.4); cursor:pointer; font-size:12px; margin-top:4px; }
    .ban-cancel:hover { color:#d4af37; }
    #ban-overlay { display:none; position:fixed; inset:0; z-index:998; }
  </style>
</head>
<body>
  <header>
    <h1>🎙️ لوحة إدارة طواريق</h1>
    <a href="/admin/logout">تسجيل الخروج</a>
  </header>

  <!-- Ban Menu -->
  <div id="ban-overlay" onclick="closeBanMenu()"></div>
  <div id="ban-menu">
    <h3>حظر المستخدم</h3>
    <div class="ban-name" id="ban-target-name"></div>
    <button class="ban-option" onclick="executeBan('1h')">⏱️ حظر ساعة واحدة</button>
    <button class="ban-option" onclick="executeBan('24h')">🕐 حظر 24 ساعة</button>
    <button class="ban-option permanent" onclick="executeBan('permanent')">🚫 حظر دائم</button>
    <button class="ban-option" onclick="executeUnban()" style="background:#1a2d1a;color:#22C55E;border-color:#22C55E44">✅ إلغاء الحظر</button>
    <button class="ban-cancel" onclick="closeBanMenu()">إلغاء</button>
  </div>

  <div class="container">
    <!-- إحصائيات -->
    <div class="stats">
      <div class="stat-card">
        <div class="num">${totalUsers}</div>
        <div class="lbl">إجمالي المستخدمين</div>
      </div>
      <div class="stat-card">
        <div class="num">${rooms24h}</div>
        <div class="lbl">ساحات خلال 24ساعة</div>
      </div>
      <div class="stat-card">
        <div class="num" style="color:#22C55E">${activeRooms}</div>
        <div class="lbl">الساحات النشطة</div>
      </div>
      <div class="stat-card">
        <div class="num" style="color:#EF4444">${totalReports}</div>
        <div class="lbl">البلاغات</div>
      </div>
      <div class="stat-card">
        <div class="num" style="color:#F59E0B">${activeBans.length}</div>
        <div class="lbl">المحظورون</div>
      </div>
    </div>

    <!-- تبويبات -->
    <div class="tabs">
      <button class="tab active" onclick="switchTab('users', this)">المستخدمون</button>
      <button class="tab" onclick="switchTab('rooms', this)">الساحات</button>
      <button class="tab" onclick="switchTab('reports', this)">البلاغات <span id="reports-count" style="background:#EF4444;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;margin-right:4px">${totalReports}</span></button>
      <button class="tab" onclick="switchTab('bans', this)">المحظورون <span id="bans-count" style="background:#F59E0B;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;margin-right:4px">${activeBans.length}</span></button>
    </div>

    <!-- تبويب المستخدمين -->
    <div class="panel active" id="panel-users">
      <div class="section-header">
        <h2>${latestUsers.length} مستخدم • <span style="color:#22C55E">${activeIds.size} متصل</span></h2>
        <button class="refresh-btn" onclick="location.reload()">تحديث</button>
      </div>
      <input class="search-bar" type="text" placeholder="بحث بالاسم أو رقم الجوال..." oninput="filterTable('users-table', this.value)" />
      <div class="table-wrap">
        <table id="users-table">
          <thead>
            <tr>
              <th>#</th>
              <th>الاسم</th>
              <th>رقم الجوال</th>
              <th>طريقة الدخول</th>
              <th>الدور</th>
              <th>آخر دخول</th>
              <th>تاريخ التسجيل</th>
            </tr>
          </thead>
          <tbody>${usersRows}</tbody>
        </table>
      </div>
    </div>

    <!-- تبويب الساحات -->
    <div class="panel" id="panel-rooms">
      <div class="section-header">
        <h2>آخر ${latestRooms.length} ساحة</h2>
        <button class="refresh-btn" onclick="location.reload()">تحديث</button>
      </div>
      <input class="search-bar" type="text" placeholder="بحث باسم الساحة أو المنشئ..." oninput="filterTable('rooms-table', this.value)" />
      <div class="table-wrap">
        <table id="rooms-table">
          <thead>
            <tr>
              <th>#</th>
              <th>اسم الساحة</th>
              <th>المنشئ</th>
              <th>الحالة</th>
              <th>نجمة ذهبية</th>
              <th>تاريخ الإنشاء</th>
            </tr>
          </thead>
          <tbody>${roomsRows}</tbody>
        </table>
      </div>
    </div>

    <!-- تبويب البلاغات -->
    <div class="panel" id="panel-reports">
      <div class="section-header">
        <h2>${allReports.length} بلاغ</h2>
        <button class="refresh-btn" onclick="location.reload()">تحديث</button>
      </div>
      ${allReports.length === 0 ? `<div class="empty-state"><div class="icon">🚩</div><p>لا توجد بلاغات حتى الآن</p></div>` : `
      <div class="table-wrap">
        <table id="reports-table">
          <thead>
            <tr>
              <th>الوقت</th>
              <th>الرسالة الصوتية</th>
              <th>السبب</th>
              <th>بلاغ من</th>
              <th>بلاغ ضد</th>
              <th>حذف</th>
            </tr>
          </thead>
          <tbody>${reportsRows}</tbody>
        </table>
      </div>`}
    </div>

    <!-- تبويب المحظورين -->
    <div class="panel" id="panel-bans">
      <div class="section-header">
        <h2>${activeBans.length} محظور نشط</h2>
        <button class="refresh-btn" onclick="location.reload()">تحديث</button>
      </div>
      ${activeBans.length === 0 ? `<div class="empty-state"><div class="icon">🔓</div><p>لا يوجد محظورون حالياً</p></div>` : `
      <input class="search-bar" type="text" placeholder="بحث بالاسم..." oninput="filterTable('bans-table', this.value)" />
      <div class="table-wrap">
        <table id="bans-table">
          <thead>
            <tr>
              <th>المستخدم</th>
              <th>نوع الحظر</th>
              <th>تاريخ الحظر</th>
              <th>ينتهي في</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>${bansRows}</tbody>
        </table>
      </div>`}
    </div>
  </div>

  <script>
    function switchTab(name, btn) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + name).classList.add('active');
    }

    function filterTable(tableId, query) {
      const q = query.trim().toLowerCase();
      const rows = document.querySelectorAll('#' + tableId + ' tbody tr');
      rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }

    // ── حذف بلاغ ──
    async function deleteReport(id) {
      if (!confirm('هل تريد حذف هذا البلاغ نهائياً؟')) return;
      try {
        const res = await fetch('/admin/api/reports/' + id, { method: 'DELETE' });
        if (res.ok) {
          const row = document.getElementById('report-row-' + id);
          if (row) row.remove();
          const cnt = document.querySelectorAll('#reports-table tbody tr').length;
          const badge = document.getElementById('reports-count');
          if (badge) badge.textContent = cnt;
        } else {
          alert('فشل حذف البلاغ');
        }
      } catch(e) { alert('خطأ: ' + e); }
    }

    // ── رفع الحظر مباشرة من تبويب المحظورين ──
    async function unbanUser(userId, username, rowId) {
      if (!confirm('هل تريد رفع الحظر عن ' + username + '؟')) return;
      try {
        const res = await fetch('/admin/api/unban', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });
        if (res.ok) {
          const row = document.getElementById('ban-row-' + rowId);
          if (row) row.remove();
          // تحديث العداد
          const cnt = document.querySelectorAll('#bans-table tbody tr').length;
          const badge = document.getElementById('bans-count');
          if (badge) badge.textContent = cnt;
          alert('تم رفع الحظر عن ' + username + ' بنجاح');
        } else {
          const err = await res.json();
          alert('فشل رفع الحظر: ' + (err.error || 'خطأ غير معروف'));
        }
      } catch(e) { alert('خطأ: ' + e); }
    }

    // ── قائمة الحظر (من تبويب البلاغات) ──
    let _banUserId = '', _banUsername = '';
    function showBanMenu(userId, username, el) {
      _banUserId = userId;
      _banUsername = username;
      document.getElementById('ban-target-name').textContent = username || userId;
      const menu = document.getElementById('ban-menu');
      const overlay = document.getElementById('ban-overlay');
      const rect = el.getBoundingClientRect();
      // عرض مؤقت لحساب الارتفاع
      menu.style.visibility = 'hidden';
      menu.style.display = 'block';
      const menuH = menu.offsetHeight;
      menu.style.display = 'none';
      menu.style.visibility = '';
      const spaceBelow = window.innerHeight - rect.bottom;
      let topPos;
      if (spaceBelow < menuH + 20) {
        // لا توجد مساحة كافية أسفل → اعرض فوق العنصر
        topPos = Math.max(window.scrollY + 8, rect.top + window.scrollY - menuH - 6);
      } else {
        topPos = rect.bottom + window.scrollY + 6;
      }
      menu.style.top = topPos + 'px';
      menu.style.right = (window.innerWidth - rect.right) + 'px';
      menu.style.left = 'auto';
      menu.style.display = 'block';
      overlay.style.display = 'block';
    }
    function closeBanMenu() {
      document.getElementById('ban-menu').style.display = 'none';
      document.getElementById('ban-overlay').style.display = 'none';
    }
    async function executeBan(banType) {
      const labels = { '1h': 'ساعة واحدة', '24h': '24 ساعة', 'permanent': 'دائم' };
      if (!confirm('هل تريد حظر ' + _banUsername + ' لمدة ' + labels[banType] + '؟')) return;
      try {
        const res = await fetch('/admin/api/ban', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: _banUserId, username: _banUsername, banType })
        });
        if (res.ok) {
          closeBanMenu();
          alert('تم حظر ' + _banUsername + ' بنجاح');
          location.reload();
        } else {
          const err = await res.json();
          alert('فشل الحظر: ' + (err.error || 'خطأ غير معروف'));
        }
      } catch(e) { alert('خطأ: ' + e); }
    }
    async function executeUnban() {
      if (!confirm('هل تريد إلغاء حظر ' + _banUsername + '؟')) return;
      try {
        const res = await fetch('/admin/api/unban', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: _banUserId })
        });
        if (res.ok) {
          closeBanMenu();
          alert('تم إلغاء حظر ' + _banUsername + ' بنجاح');
          location.reload();
        } else {
          const err = await res.json();
          alert('فشل إلغاء الحظر: ' + (err.error || 'خطأ غير معروف'));
        }
      } catch(e) { alert('خطأ: ' + e); }
    }
  </script>
</body>
</html>`;
}

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
