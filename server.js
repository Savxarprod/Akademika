const express = require("express");
const path = require("path");
const cors = require("cors");
const Database = require("better-sqlite3");

const app = express();
const PORT = 3000;

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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

app.post("/api/requests", (req, res) => {
  try {
    const {
      workType,
      deadline,
      topic,
      pages,
      originality,
      contact
    } = req.body;

    if (!workType || !deadline || !topic || !pages || !originality || !contact) {
      return res.status(400).json({
        success: false,
        message: "Заполните все поля формы"
      });
    }

    const stmt = db.prepare(`
      INSERT INTO requests 
      (work_type, deadline, topic, pages, originality, contact, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      workType,
      deadline,
      topic,
      Number(pages),
      Number(originality),
      contact,
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

app.get("/api/requests", (req, res) => {
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

app.delete("/api/requests/:id", (req, res) => {
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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Savxar запущен: http://localhost:${PORT}`);
  console.log(`Админ-панель: http://localhost:${PORT}/admin.html`);
});