import { Router, Request, Response } from "express";
import { getDb } from "./db";
import { users, rooms } from "../drizzle/schema";
import { desc, count, eq } from "drizzle-orm";

const router = Router();

// كلمة مرور الإدارة — تُقرأ من متغير البيئة أو قيمة افتراضية
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "tawari9_admin_2026";
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
    const db = await getDb();
    if (!db) return res.status(503).send("<p style='color:red;padding:20px'>قاعدة البيانات غير متاحة</p>");

    // إحصائيات سريعة
    const [totalUsers] = await db.select({ count: count() }).from(users);
    const [totalRooms] = await db.select({ count: count() }).from(rooms);
    const [activeRooms] = await db.select({ count: count() }).from(rooms).where(eq(rooms.isActive, "true"));

    // آخر 50 مستخدم
    const latestUsers = await db
      .select({ id: users.id, name: users.name, email: users.email, avatar: users.avatar, loginMethod: users.loginMethod, role: users.role, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(50);

    // آخر 50 ساحة
    const latestRooms = await db
      .select({ id: rooms.id, name: rooms.name, creatorName: rooms.creatorName, isActive: rooms.isActive, hasGoldStar: rooms.hasGoldStar, createdAt: rooms.createdAt })
      .from(rooms)
      .orderBy(desc(rooms.createdAt))
      .limit(50);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(dashboardPage({ totalUsers: totalUsers.count, totalRooms: totalRooms.count, activeRooms: activeRooms.count, latestUsers, latestRooms }));
  } catch (err) {
    res.status(500).send(`<pre>خطأ: ${err}</pre>`);
  }
});

// ── API: بيانات JSON للمستخدمين ─────────────────────────────────────────────
router.get("/api/users", async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: "Unauthorized" });
  const db = await getDb();
  if (!db) return res.status(503).json({ error: "DB unavailable" });
  const data = await db.select().from(users).orderBy(desc(users.createdAt)).limit(200);
  res.json(data);
});

// ── API: بيانات JSON للساحات ────────────────────────────────────────────────
router.get("/api/rooms", async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: "Unauthorized" });
  const db = await getDb();
  if (!db) return res.status(503).json({ error: "DB unavailable" });
  const data = await db.select().from(rooms).orderBy(desc(rooms.createdAt)).limit(200);
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
  totalRooms: number;
  activeRooms: number;
  latestUsers: any[];
  latestRooms: any[];
}): string {
  const { totalUsers, totalRooms, activeRooms, latestUsers, latestRooms } = data;

  const usersRows = latestUsers.map(u => `
    <tr>
      <td>${u.id}</td>
      <td>${u.name || "—"}</td>
      <td>${u.email || "—"}</td>
      <td>${u.loginMethod || "ضيف"}</td>
      <td><span class="badge ${u.role === "admin" ? "badge-admin" : "badge-user"}">${u.role === "admin" ? "مدير" : "مستخدم"}</span></td>
      <td>${formatDate(u.lastSignedIn)}</td>
      <td>${formatDate(u.createdAt)}</td>
    </tr>`).join("");

  const roomsRows = latestRooms.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${r.name}</td>
      <td>${r.creatorName}</td>
      <td><span class="badge ${r.isActive === "true" ? "badge-active" : "badge-inactive"}">${r.isActive === "true" ? "نشطة" : "مغلقة"}</span></td>
      <td>${r.hasGoldStar === "true" ? "⭐" : "—"}</td>
      <td>${formatDate(r.createdAt)}</td>
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
    /* ── Header ── */
    header { background: #1c1208; border-bottom: 2px solid #c8860a; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
    header h1 { font-size: 20px; font-weight: 900; }
    header a { color: rgba(212,175,55,0.6); font-size: 13px; text-decoration: none; padding: 6px 14px; border: 1px solid #c8860a44; border-radius: 8px; transition: all 0.2s; }
    header a:hover { color: #d4af37; border-color: #c8860a; }
    /* ── Layout ── */
    .container { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
    /* ── Stats ── */
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .stat-card { background: #1c1208; border: 1.5px solid #c8860a44; border-radius: 14px; padding: 20px; text-align: center; }
    .stat-card .num { font-size: 36px; font-weight: 900; color: #c8860a; }
    .stat-card .lbl { font-size: 13px; color: rgba(212,175,55,0.6); margin-top: 4px; }
    /* ── Tabs ── */
    .tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1.5px solid #c8860a33; padding-bottom: 0; }
    .tab { padding: 10px 20px; cursor: pointer; font-size: 14px; font-weight: 600; color: rgba(212,175,55,0.5); border-bottom: 2.5px solid transparent; margin-bottom: -1.5px; transition: all 0.2s; background: none; border-top: none; border-left: none; border-right: none; }
    .tab.active { color: #c8860a; border-bottom-color: #c8860a; }
    .tab:hover { color: #d4af37; }
    /* ── Table ── */
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
    /* ── Badges ── */
    .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .badge-user { background: #2d1f0e; color: #c8860a; border: 1px solid #c8860a44; }
    .badge-admin { background: #1a2d1a; color: #22C55E; border: 1px solid #22C55E44; }
    .badge-active { background: #1a2d1a; color: #22C55E; border: 1px solid #22C55E44; }
    .badge-inactive { background: #2d1a1a; color: #EF4444; border: 1px solid #EF444444; }
    /* ── Reports placeholder ── */
    .placeholder { text-align: center; padding: 60px 20px; color: rgba(212,175,55,0.4); }
    .placeholder .icon { font-size: 48px; margin-bottom: 12px; }
    .placeholder p { font-size: 15px; }
    /* ── Refresh ── */
    .refresh-btn { background: #2d1f0e; color: #c8860a; border: 1.5px solid #c8860a55; border-radius: 8px; padding: 7px 16px; font-size: 13px; cursor: pointer; transition: all 0.2s; }
    .refresh-btn:hover { background: #c8860a; color: #fff; }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .section-header h2 { font-size: 15px; color: rgba(212,175,55,0.7); }
  </style>
</head>
<body>
  <header>
    <h1>🎙️ لوحة إدارة طواريق</h1>
    <a href="/admin/logout">تسجيل الخروج</a>
  </header>

  <div class="container">
    <!-- إحصائيات -->
    <div class="stats">
      <div class="stat-card">
        <div class="num">${totalUsers}</div>
        <div class="lbl">إجمالي المستخدمين</div>
      </div>
      <div class="stat-card">
        <div class="num">${totalRooms}</div>
        <div class="lbl">إجمالي الساحات</div>
      </div>
      <div class="stat-card">
        <div class="num" style="color:#22C55E">${activeRooms}</div>
        <div class="lbl">الساحات النشطة</div>
      </div>
    </div>

    <!-- تبويبات -->
    <div class="tabs">
      <button class="tab active" onclick="switchTab('users', this)">المستخدمون</button>
      <button class="tab" onclick="switchTab('rooms', this)">الساحات</button>
      <button class="tab" onclick="switchTab('reports', this)">البلاغات</button>
    </div>

    <!-- تبويب المستخدمين -->
    <div class="panel active" id="panel-users">
      <div class="section-header">
        <h2>آخر ${latestUsers.length} مستخدم</h2>
        <button class="refresh-btn" onclick="location.reload()">تحديث</button>
      </div>
      <input class="search-bar" type="text" placeholder="بحث بالاسم أو الإيميل..." oninput="filterTable('users-table', this.value)" />
      <div class="table-wrap">
        <table id="users-table">
          <thead>
            <tr>
              <th>#</th>
              <th>الاسم</th>
              <th>الإيميل</th>
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
      <div class="placeholder">
        <div class="icon">🚩</div>
        <p>سيتم إضافة نظام البلاغات لاحقاً</p>
      </div>
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
  </script>
</body>
</html>`;
}

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
