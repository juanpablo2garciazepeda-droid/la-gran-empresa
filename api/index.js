require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// ─── Pool de conexión ────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: true },
  waitForConnections: true,
  connectionLimit: 5,
});

// ─── Inicializar tablas si no existen ────────────────────────────────────────
async function initDB() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS unidades_medida (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        abreviatura VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS conceptos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(150) NOT NULL,
        descripcion TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS destinos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(150) NOT NULL,
        direccion VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(150) NOT NULL,
        unidad_medida_id INT,
        precio DECIMAL(10,2) DEFAULT 0,
        stock INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (unidad_medida_id) REFERENCES unidades_medida(id) ON DELETE SET NULL
      )
    `);
    console.log("✅ Tablas listas");
  } finally {
    conn.release();
  }
}

// ─── Helper genérico ─────────────────────────────────────────────────────────
function catalog(table, fields) {
  const router = express.Router();

  // GET todos
  router.get("/", async (req, res) => {
    try {
      const [rows] = await pool.query(`SELECT * FROM ${table} ORDER BY id DESC`);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET uno
  router.get("/:id", async (req, res) => {
    try {
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: "No encontrado" });
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST crear
  router.post("/", async (req, res) => {
    try {
      const vals = fields.map((f) => req.body[f] ?? null);
      const cols = fields.join(", ");
      const placeholders = fields.map(() => "?").join(", ");
      const [result] = await pool.query(
        `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`,
        vals
      );
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [result.insertId]);
      res.status(201).json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT actualizar
  router.put("/:id", async (req, res) => {
    try {
      const sets = fields.map((f) => `${f} = ?`).join(", ");
      const vals = [...fields.map((f) => req.body[f] ?? null), req.params.id];
      await pool.query(`UPDATE ${table} SET ${sets} WHERE id = ?`, vals);
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE eliminar
  router.delete("/:id", async (req, res) => {
    try {
      await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
      res.json({ message: "Eliminado correctamente" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

// ─── Rutas de catálogos ──────────────────────────────────────────────────────
app.use("/api/conceptos",      catalog("conceptos",      ["nombre", "descripcion"]));
app.use("/api/destinos",       catalog("destinos",       ["nombre", "direccion"]));
app.use("/api/productos",      catalog("productos",      ["nombre", "unidad_medida_id", "precio", "stock"]));
app.use("/api/unidades_medida",catalog("unidades_medida",["nombre", "abreviatura"]));

// ─── Ruta de salud ───────────────────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "conectada" });
  } catch (err) {
    res.status(500).json({ status: "error", db: err.message });
  }
});

// ─── SPA fallback ────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ─── Arranque: local vs Vercel ───────────────────────────────────────────────
let dbReady = false;

// Middleware que inicializa la BD la primera vez
app.use(async (req, res, next) => {
  if (!dbReady) {
    try {
      await initDB();
      dbReady = true;
    } catch (err) {
      return res.status(500).json({ error: "No se pudo conectar a la BD: " + err.message });
    }
  }
  next();
});

// Para desarrollo local
if (process.env.NODE_ENV !== "production" && require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));
}

module.exports = app;
