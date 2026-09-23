const express = require("express");
const path = require("path");
const cors = require("cors");
const Database = require("better-sqlite3");
const session = require("express-session");
const bcrypt = require("bcrypt");

const app = express();
const PORT = process.env.PORT || 3000;

// --- Читаем секреты из переменных окружения ---
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!ADMIN_LOGIN || !ADMIN_PASSWORD_HASH || !SESSION_SECRET) {
  console.error("❌ Не заданы переменные окружения ADMIN_LOGIN, ADMIN_PASSWORD_HASH, SESSION_SECRET");
  process.exit(1);
}

// --- База данных ---
const db = new Database("savxar.db");

db.prepare(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_type TEXT NOT NULL,
    deadline TEXT NOT NULL,
    topic TEXT NOT NULL,
    pages INTEGER NOT NULL,
    originality INTEGER NOT NULL,
    contact TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`).run();

// Миграция: добавляем колонку referred_by, если её нет
try {
  db.prepare(`ALTER TABLE requests ADD COLUMN referred_by TEXT`).run();
} catch (e) {
  // Колонка уже существует — это нормально
}

// --- Базовые middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Сессии ---
app.set('trust proxy', 1);

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // на Render — true (HTTPS)
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000 // 24 часа
  }
}));

// --- Middleware для защиты ---
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect("/admin-login.html");
}

// --- Защита админки (до express.static!) ---
app.get("/admin.html", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// --- Статика ---
app.use(express.static(path.join(__dirname, "public")));

// ==================== AUTH ====================

app.post("/api/auth/login", async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ success: false, message: "Введите логин и пароль" });
    }

    if (login !== ADMIN_LOGIN) {
      return res.status(401).json({ success: false, message: "Неверный логин или пароль" });
    }

    const ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    if (!ok) {
      return res.status(401).json({ success: false, message: "Неверный логин или пароль" });
    }

    req.session.isAdmin = true;
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Ошибка сервера" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get("/api/auth/check", (req, res) => {
  res.json({
    success: true,
    loggedIn: !!(req.session && req.session.isAdmin)
  });
});

// ==================== ЗАЯВКИ ====================

// POST — ОТКРЫТ для всех (клиенты отправляют заявки)
app.post("/api/requests", (req, res) => {
  try {
    const {
      workType,
      deadline,
      topic,
      pages,
      originality,
      contact,
      referredBy
    } = req.body;

    if (!workType || !deadline || !topic || !pages || !originality || !contact) {
      return res.status(400).json({
        success: false,
        message: "Заполните все поля формы"
      });
    }

    const stmt = db.prepare(`
      INSERT INTO requests 
      (work_type, deadline, topic, pages, originality, contact, referred_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        workType,
        deadline,
        topic,
        Number(pages),
        Number(originality),
        contact,
        referredBy || null,
        new Date().toISOString()
      );

    res.json({
      success: true,
      message: "Заявка успешно отправлена"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Ошибка сервера"
    });
  }
});

// GET — ТОЛЬКО для админа
app.get("/api/requests", requireAdmin, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM requests
      ORDER BY id DESC
    `).all();

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Не удалось получить заявки"
    });
  }
});

// DELETE — ТОЛЬКО для админа
app.delete("/api/requests/:id", requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);

    db.prepare(`
      DELETE FROM requests
      WHERE id = ?
    `).run(id);

    res.json({
      success: true,
      message: "Заявка удалена"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Не удалось удалить заявку"
    });
  }
});

// --- Главная ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Запуск ---
app.listen(PORT, () => {
  console.log(`✅ Akademika запущена: http://localhost:${PORT}`);
  console.log(`🔐 Админ-панель: http://localhost:${PORT}/admin.html`);
});