const express = require("express");
const path = require("path");
const cors = require("cors");
const { createClient } = require("@libsql/client");
const session = require("express-session");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);

// --- Переменные окружения ---
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const SESSION_SECRET = process.env.SESSION_SECRET;
const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!ADMIN_LOGIN || !ADMIN_PASSWORD_HASH || !SESSION_SECRET || !TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.error("❌ Не заданы переменные окружения: ADMIN_LOGIN, ADMIN_PASSWORD_HASH, SESSION_SECRET, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN");
  process.exit(1);
}

// --- Подключение к Turso ---
const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
});

// --- Инициализация схемы ---
async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_type TEXT NOT NULL,
      deadline TEXT NOT NULL,
      topic TEXT NOT NULL,
      pages INTEGER NOT NULL,
      originality INTEGER NOT NULL,
      contact TEXT NOT NULL,
      referred_by TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // Миграция: если колонки referred_by нет (для старых баз)
  try {
    await db.execute(`ALTER TABLE requests ADD COLUMN referred_by TEXT`);
  } catch (e) {
    // Колонка уже есть — нормально
  }

  console.log("✅ Схема базы данных готова");
}

// --- CORS ---
const allowedOrigins = [
  'https://akademika-9xwl.onrender.com',
  'http://localhost:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Заголовки безопасности ---
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// --- Лимитеры ---
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Слишком много заявок. Попробуйте через 15 минут.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Слишком много попыток входа. Попробуйте через 15 минут.' }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

// --- Сессии ---
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// --- Защита админки ---
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect("/admin-login.html");
}

app.get("/admin.html", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// --- Статика ---
app.use(express.static(path.join(__dirname, "public")));

// --- Валидация ---
function sanitizeString(value, maxLen = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function sanitizeNumber(value, min, max) {
  const n = Number(value);
  if (isNaN(n)) return min;
  return Math.min(Math.max(n, min), max);
}

// ==================== AUTH ====================

app.post("/api/auth/login", loginLimiter, async (req, res) => {
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

app.post("/api/requests", formLimiter, async (req, res) => {
  try {
    const workType = sanitizeString(req.body.workType, 50);
    const deadline = sanitizeString(req.body.deadline, 20);
    const topic = sanitizeString(req.body.topic, 300);
    const pages = sanitizeNumber(req.body.pages, 1, 1000);
    const originality = sanitizeNumber(req.body.originality, 1, 100);
    const contact = sanitizeString(req.body.contact, 100);
    const referredBy = sanitizeString(req.body.referredBy, 100);

    if (!workType || !deadline || !topic || !pages || !originality || !contact) {
      return res.status(400).json({
        success: false,
        message: "Заполните все поля формы"
      });
    }

    await db.execute({
      sql: `INSERT INTO requests 
            (work_type, deadline, topic, pages, originality, contact, referred_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        workType,
        deadline,
        topic,
        pages,
        originality,
        contact,
        referredBy || null,
        new Date().toISOString()
      ]
    });

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

app.get("/api/requests", apiLimiter, requireAdmin, async (req, res) => {
  try {
    const result = await db.execute(`SELECT * FROM requests ORDER BY id DESC`);
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Не удалось получить заявки"
    });
  }
});

app.delete("/api/requests/:id", apiLimiter, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.execute({
      sql: `DELETE FROM requests WHERE id = ?`,
      args: [id]
    });
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
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Akademika запущена: http://localhost:${PORT}`);
      console.log(`🔐 Админ-панель: http://localhost:${PORT}/admin.html`);
      console.log(`☁️  Turso подключён: ${TURSO_DATABASE_URL.split('//')[1].split('.')[0]}`);
    });
  })
  .catch((err) => {
    console.error("❌ Ошибка инициализации базы:", err);
    process.exit(1);
  });