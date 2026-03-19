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
    try { await conn.query(`ALTER TABLE productos ADD COLUMN categoria VARCHAR(100) DEFAULT 'General'`); } catch(e) {}
    try { await conn.query(`ALTER TABLE productos ADD COLUMN codigo VARCHAR(50) DEFAULT ''`); } catch(e) {}

    await conn.query(`CREATE TABLE IF NOT EXISTS proveedores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      razon_social VARCHAR(200) NOT NULL,
      rfc VARCHAR(13) NOT NULL,
      contacto VARCHAR(150),
      telefono VARCHAR(20),
      email VARCHAR(150),
      direccion VARCHAR(255),
      ciudad VARCHAR(100),
      estado VARCHAR(100),
      cp VARCHAR(10),
      notas TEXT,
      activo TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await conn.query(`CREATE TABLE IF NOT EXISTS entradas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      folio VARCHAR(50),
      proveedor_id INT,
      concepto_id INT,
      destino_id INT,
      fecha DATE NOT NULL,
      descripcion TEXT,
      total DECIMAL(12,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await conn.query(`CREATE TABLE IF NOT EXISTS entrada_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      entrada_id INT NOT NULL,
      producto_id INT,
      nombre VARCHAR(150) NOT NULL,
      cantidad INT DEFAULT 0,
      precio_unitario DECIMAL(10,2) DEFAULT 0,
      subtotal DECIMAL(12,2) DEFAULT 0,
      FOREIGN KEY (entrada_id) REFERENCES entradas(id) ON DELETE CASCADE
    )`);

    await conn.query(`CREATE TABLE IF NOT EXISTS salidas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      folio VARCHAR(50),
      destino_id INT,
      concepto_id INT,
      fecha DATE NOT NULL,
      descripcion TEXT,
      total DECIMAL(12,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await conn.query(`CREATE TABLE IF NOT EXISTS salida_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      salida_id INT NOT NULL,
      producto_id INT,
      nombre VARCHAR(150) NOT NULL,
      cantidad INT DEFAULT 0,
      precio_unitario DECIMAL(10,2) DEFAULT 0,
      subtotal DECIMAL(12,2) DEFAULT 0,
      FOREIGN KEY (salida_id) REFERENCES salidas(id) ON DELETE CASCADE
    )`);

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

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    await initDB();
    res.json({ status: "ok", db: "conectada" });
  } catch (err) {
    res.status(500).json({ status: "error", db: err.message });
  }
});

// ── Middleware initDB ─────────────────────────────────────────────────────────
app.use("/api", async (req, res, next) => {
  try { await initDB(); next(); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CRUD genérico ─────────────────────────────────────────────────────────────
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
        `INSERT INTO ${table} (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})`, vals
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

// ── Catálogos ─────────────────────────────────────────────────────────────────
app.use("/api/conceptos",       catalog("conceptos",       ["nombre","descripcion"]));
app.use("/api/destinos",        catalog("destinos",        ["nombre","direccion"]));
app.use("/api/unidades_medida", catalog("unidades_medida", ["nombre","abreviatura"]));
app.use("/api/productos",       catalog("productos",       ["nombre","unidad_medida_id","precio","stock","categoria","codigo"]));
app.use("/api/proveedores",     catalog("proveedores",     ["razon_social","rfc","contacto","telefono","email","direccion","ciudad","estado","cp","notas","activo"]));

// ── Stock rápido ──────────────────────────────────────────────────────────────
app.patch("/api/productos/:id/stock", async (req, res) => {
  try {
    await pool.query("UPDATE productos SET stock = ? WHERE id = ?", [req.body.stock, req.params.id]);
    const [rows] = await pool.query("SELECT * FROM productos WHERE id = ?", [req.params.id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Entradas ──────────────────────────────────────────────────────────────────
app.get("/api/entradas", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT e.*, p.razon_social as proveedor
      FROM entradas e
      LEFT JOIN proveedores p ON e.proveedor_id = p.id
      ORDER BY e.id DESC`);
    res.json(rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/entradas", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { folio, proveedor_id, concepto_id, destino_id, fecha, descripcion, total, items } = req.body;
    const [result] = await conn.query(
      "INSERT INTO entradas (folio,proveedor_id,concepto_id,destino_id,fecha,descripcion,total) VALUES (?,?,?,?,?,?,?)",
      [folio||null, proveedor_id||null, concepto_id||null, destino_id||null, fecha, descripcion||null, total||0]
    );
    for (const item of (items||[])) {
      await conn.query(
        "INSERT INTO entrada_items (entrada_id,producto_id,nombre,cantidad,precio_unitario,subtotal) VALUES (?,?,?,?,?,?)",
        [result.insertId, item.producto_id||null, item.nombre, item.cantidad, item.precio_unitario, item.subtotal]
      );
    }
    await conn.commit();
    const [rows] = await conn.query("SELECT * FROM entradas WHERE id=?", [result.insertId]);
    res.status(201).json(rows[0]);
  } catch(err) { await conn.rollback(); res.status(500).json({ error: err.message }); }
  finally { conn.release(); }
});

app.delete("/api/entradas/:id", async (req, res) => {
  try { await pool.query("DELETE FROM entradas WHERE id=?", [req.params.id]); res.json({ message: "Eliminado" }); }
  catch(err) { res.status(500).json({ error: err.message }); }
});

// ── Salidas ───────────────────────────────────────────────────────────────────
app.get("/api/salidas", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.*, d.nombre as destino
      FROM salidas s
      LEFT JOIN destinos d ON s.destino_id = d.id
      ORDER BY s.id DESC`);
    res.json(rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/salidas", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { folio, destino_id, concepto_id, fecha, descripcion, total, items } = req.body;
    const [result] = await conn.query(
      "INSERT INTO salidas (folio,destino_id,concepto_id,fecha,descripcion,total) VALUES (?,?,?,?,?,?)",
      [folio||null, destino_id||null, concepto_id||null, fecha, descripcion||null, total||0]
    );
    for (const item of (items||[])) {
      await conn.query(
        "INSERT INTO salida_items (salida_id,producto_id,nombre,cantidad,precio_unitario,subtotal) VALUES (?,?,?,?,?,?)",
        [result.insertId, item.producto_id||null, item.nombre, item.cantidad, item.precio_unitario, item.subtotal]
      );
    }
    await conn.commit();
    const [rows] = await conn.query("SELECT * FROM salidas WHERE id=?", [result.insertId]);
    res.status(201).json(rows[0]);
  } catch(err) { await conn.rollback(); res.status(500).json({ error: err.message }); }
  finally { conn.release(); }
});

app.delete("/api/salidas/:id", async (req, res) => {
  try { await pool.query("DELETE FROM salidas WHERE id=?", [req.params.id]); res.json({ message: "Eliminado" }); }
  catch(err) { res.status(500).json({ error: err.message }); }
});

// ── Ventas ────────────────────────────────────────────────────────────────────
app.get("/api/ventas", async (req, res) => {
  try {
    const [ventas] = await pool.query("SELECT * FROM ventas ORDER BY created_at DESC LIMIT 100");
    const [items] = await pool.query("SELECT * FROM venta_items ORDER BY venta_id DESC");
    res.json(ventas.map(v => ({ ...v, items: items.filter(i => i.venta_id === v.id) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/ventas", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { subtotal, iva, total, monto_recibido, cambio, items } = req.body;
    const [result] = await conn.query(
      "INSERT INTO ventas (subtotal,iva,total,monto_recibido,cambio) VALUES (?,?,?,?,?)",
      [subtotal, iva, total, monto_recibido, cambio]
    );
    for (const item of items) {
      await conn.query("INSERT INTO venta_items (venta_id,producto_id,nombre,precio,cantidad) VALUES (?,?,?,?,?)",
        [result.insertId, item.id, item.nombre, item.precio, item.cantidad]);
      await conn.query("UPDATE productos SET stock=GREATEST(0,stock-?) WHERE id=?", [item.cantidad, item.id]);
    }
    await conn.commit();
    const [venta] = await conn.query("SELECT * FROM ventas WHERE id=?", [result.insertId]);
    const [ventaItems] = await conn.query("SELECT * FROM venta_items WHERE venta_id=?", [result.insertId]);
    res.status(201).json({ ...venta[0], items: ventaItems });
  } catch (err) { await conn.rollback(); res.status(500).json({ error: err.message }); }
  finally { conn.release(); }
});

// ── Reportes ──────────────────────────────────────────────────────────────────
app.get("/api/reportes/catalogos", async (req, res) => {
  try {
    const counts = {};
    for (const t of ["conceptos","destinos","productos","unidades_medida","proveedores"]) {
      try {
        const [[row]] = await pool.query(`SELECT COUNT(*) as c FROM \`${t}\``);
        counts[t] = Number(row.c) || 0;
      } catch { counts[t] = 0; }
    }
    let stock_total = 0;
    try {
      const [[sr]] = await pool.query("SELECT COALESCE(SUM(stock),0) as total FROM productos");
      stock_total = Number(sr.total) || 0;
    } catch {}
    res.json({ counts, stock_total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/reportes/movimientos", async (req, res) => {
  try {
    const [[eRow]] = await pool.query("SELECT COUNT(*) as total, COALESCE(SUM(total),0) as monto FROM entradas");
    const [[sRow]] = await pool.query("SELECT COUNT(*) as total, COALESCE(SUM(total),0) as monto FROM salidas");
    const [[vRow]] = await pool.query("SELECT COUNT(*) as total, COALESCE(SUM(total),0) as monto FROM ventas");
    const [recientes_e] = await pool.query("SELECT e.*, p.razon_social as proveedor FROM entradas e LEFT JOIN proveedores p ON e.proveedor_id=p.id ORDER BY e.created_at DESC LIMIT 10");
    const [recientes_s] = await pool.query("SELECT s.*, d.nombre as destino_nombre FROM salidas s LEFT JOIN destinos d ON s.destino_id=d.id ORDER BY s.created_at DESC LIMIT 10");
    res.json({ entradas: eRow, salidas: sRow, ventas: vRow, recientes_entradas: recientes_e, recientes_salidas: recientes_s });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "../public/index.html")));

if (require.main === module) {
  app.listen(process.env.PORT || 3000, () => console.log("🚀 Listo"));
}
module.exports = app;
