require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// ─── Pool: usa DATABASE_URL si existe, si no usa variables individuales ───────
let pool;
if (process.env.DATABASE_URL) {
  pool = mysql.createPool(process.env.DATABASE_URL);
} else {
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 4000,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 3,
  });
}

async function initDB() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS unidades_medida (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100) NOT NULL, abreviatura VARCHAR(20) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await conn.query(`CREATE TABLE IF NOT EXISTS conceptos (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(150) NOT NULL, descripcion TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await conn.query(`CREATE TABLE IF NOT EXISTS destinos (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(150) NOT NULL, direccion VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await conn.query(`CREATE TABLE IF NOT EXISTS productos (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(150) NOT NULL, unidad_medida_id INT, precio DECIMAL(10,2) DEFAULT 0, stock INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  } finally {
    conn.release();
  }
}

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    await initDB();
    res.json({ status: "ok", db: "conectada" });
  } catch (err) {
    res.status(500).json({ status: "error", db: err.message });
  }
});

function catalog(table, fields) {
  const router = express.Router();
  router.get("/", async (req, res) => {
    try { const [rows] = await pool.query(`SELECT * FROM ${table} ORDER BY id DESC`); res.json(rows); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.get("/:id", async (req, res) => {
    try { const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]); if (!rows.length) return res.status(404).json({ error: "No encontrado" }); res.json(rows[0]); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.post("/", async (req, res) => {
    try {
      const vals = fields.map(f => req.body[f] ?? null);
      const [result] = await pool.query(`INSERT INTO ${table} (${fields.join(",")}) VALUES (${fields.map(()=>"?").join(",")})`, vals);
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [result.insertId]);
      res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.put("/:id", async (req, res) => {
    try {
      const sets = fields.map(f => `${f} = ?`).join(", ");
      await pool.query(`UPDATE ${table} SET ${sets} WHERE id = ?`, [...fields.map(f => req.body[f] ?? null), req.params.id]);
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.delete("/:id", async (req, res) => {
    try { await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]); res.json({ message: "Eliminado" }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  return router;
}

app.use(["/api/conceptos","/api/destinos","/api/productos","/api/unidades_medida"], async (req, res, next) => {
  try { await initDB(); next(); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.use("/api/conceptos",       catalog("conceptos",       ["nombre","descripcion"]));
app.use("/api/destinos",        catalog("destinos",        ["nombre","direccion"]));
app.use("/api/productos",       catalog("productos",       ["nombre","unidad_medida_id","precio","stock"]));
app.use("/api/unidades_medida", catalog("unidades_medida", ["nombre","abreviatura"]));

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "../public/index.html")));

if (require.main === module) {
  app.listen(process.env.PORT || 3000, () => console.log("🚀 Listo"));
}

module.exports = app;
