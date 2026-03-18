require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

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
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 3,
  });
}

async function initDB() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS unidades_medida (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      abreviatura VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await conn.query(`CREATE TABLE IF NOT EXISTS conceptos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      descripcion TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await conn.query(`CREATE TABLE IF NOT EXISTS destinos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      direccion VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await conn.query(`CREATE TABLE IF NOT EXISTS productos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      unidad_medida_id INT,
      precio DECIMAL(10,2) DEFAULT 0,
      stock INT DEFAULT 0,
      categoria VARCHAR(100) DEFAULT 'General',
      codigo VARCHAR(50) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    // Agregar columnas si no existen (para tablas ya creadas)
    try { await conn.query(`ALTER TABLE productos ADD COLUMN categoria VARCHAR(100) DEFAULT 'General'`); } catch(e) {}
    try { await conn.query(`ALTER TABLE productos ADD COLUMN codigo VARCHAR(50) DEFAULT ''`); } catch(e) {}

    await conn.query(`CREATE TABLE IF NOT EXISTS ventas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      subtotal DECIMAL(10,2) NOT NULL,
      iva DECIMAL(10,2) NOT NULL,
      total DECIMAL(10,2) NOT NULL,
      monto_recibido DECIMAL(10,2) NOT NULL,
      cambio DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await conn.query(`CREATE TABLE IF NOT EXISTS venta_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      venta_id INT NOT NULL,
      producto_id INT,
      nombre VARCHAR(150) NOT NULL,
      precio DECIMAL(10,2) NOT NULL,
      cantidad INT NOT NULL,
      FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
    )`);
  } finally {
    conn.release();
  }
}

// ─── Health ──────────────────────────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    await initDB();
    res.json({ status: "ok", db: "conectada" });
  } catch (err) {
    res.status(500).json({ status: "error", db: err.message });
  }
});

// ─── Middleware initDB ────────────────────────────────────────────────────────
app.use(["/api/conceptos","/api/destinos","/api/productos","/api/unidades_medida","/api/ventas"], async (req, res, next) => {
  try { await initDB(); next(); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CRUD genérico ────────────────────────────────────────────────────────────
function catalog(table, fields) {
  const router = express.Router();
  router.get("/", async (req, res) => {
    try { const [rows] = await pool.query(`SELECT * FROM ${table} ORDER BY id DESC`); res.json(rows); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.get("/:id", async (req, res) => {
    try {
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: "No encontrado" });
      res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.post("/", async (req, res) => {
    try {
      const vals = fields.map(f => req.body[f] ?? null);
      const [result] = await pool.query(
        `INSERT INTO ${table} (${fields.join(",")}) VALUES (${fields.map(()=>"?").join(",")})`, vals
      );
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

// ─── Catálogos ───────────────────────────────────────────────────────────────
app.use("/api/conceptos",       catalog("conceptos",       ["nombre","descripcion"]));
app.use("/api/destinos",        catalog("destinos",        ["nombre","direccion"]));
app.use("/api/unidades_medida", catalog("unidades_medida", ["nombre","abreviatura"]));
app.use("/api/productos",       catalog("productos",       ["nombre","unidad_medida_id","precio","stock","categoria","codigo"]));

// ─── Stock rápido (PATCH) ─────────────────────────────────────────────────────
app.patch("/api/productos/:id/stock", async (req, res) => {
  try {
    const { stock } = req.body;
    await pool.query("UPDATE productos SET stock = ? WHERE id = ?", [stock, req.params.id]);
    const [rows] = await pool.query("SELECT * FROM productos WHERE id = ?", [req.params.id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Ventas ──────────────────────────────────────────────────────────────────
app.get("/api/ventas", async (req, res) => {
  try {
    const [ventas] = await pool.query("SELECT * FROM ventas ORDER BY created_at DESC LIMIT 100");
    const [items] = await pool.query("SELECT * FROM venta_items ORDER BY venta_id DESC");
    const result = ventas.map(v => ({
      ...v,
      items: items.filter(i => i.venta_id === v.id)
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/ventas", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { subtotal, iva, total, monto_recibido, cambio, items } = req.body;

    const [result] = await conn.query(
      "INSERT INTO ventas (subtotal, iva, total, monto_recibido, cambio) VALUES (?,?,?,?,?)",
      [subtotal, iva, total, monto_recibido, cambio]
    );
    const ventaId = result.insertId;

    for (const item of items) {
      await conn.query(
        "INSERT INTO venta_items (venta_id, producto_id, nombre, precio, cantidad) VALUES (?,?,?,?,?)",
        [ventaId, item.id, item.nombre, item.precio, item.cantidad]
      );
      // Descontar stock
      await conn.query(
        "UPDATE productos SET stock = GREATEST(0, stock - ?) WHERE id = ?",
        [item.cantidad, item.id]
      );
    }

    await conn.commit();
    const [venta] = await conn.query("SELECT * FROM ventas WHERE id = ?", [ventaId]);
    const [ventaItems] = await conn.query("SELECT * FROM venta_items WHERE venta_id = ?", [ventaId]);
    res.status(201).json({ ...venta[0], items: ventaItems });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

if (require.main === module) {
  app.listen(process.env.PORT || 3000, () => console.log("🚀 Listo"));
}

module.exports = app;
