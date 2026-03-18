# 🏢 La Gran Empresa – Sistema de Almacén

Aplicación full-stack (Node.js + Express + MySQL) desplegable en Vercel.

---

## 📁 Estructura del Proyecto

```
la-gran-empresa/
├── api/
│   └── index.js        ← Servidor Express (backend)
├── public/
│   └── index.html      ← SPA Frontend
├── vercel.json         ← Configuración de Vercel
├── package.json
├── .env.example        ← Variables de entorno (ejemplo)
└── README.md
```

---

## 🗄️ Base de Datos en la Nube (TiDB Cloud – Gratis)

1. Ir a [tidbcloud.com](https://tidbcloud.com) → crear cuenta gratuita
2. Crear un cluster **Serverless** (gratis)
3. En la consola → **Connect** → copiar `HOST`, `USER`, `PASSWORD`
4. El sistema **crea las tablas automáticamente** al arrancar

---

## 🔧 Variables de Entorno

Renombrar `.env.example` a `.env` para desarrollo local:

```env
DB_HOST=gateway01.us-west-2.prod.aws.tidbcloud.com
DB_PORT=4000
DB_USER=tu_usuario
DB_PASSWORD=tu_contraseña
DB_NAME=la_gran_empresa
PORT=3000
```

---

## 🚀 Despliegue en Vercel

### Paso 1 – Subir a GitHub
```bash
git init
git add .
git commit -m "Sistema de Almacén v1"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/la-gran-empresa.git
git push -u origin main
```

### Paso 2 – Conectar con Vercel
1. Ir a [vercel.com](https://vercel.com) → **New Project**
2. Importar el repositorio de GitHub
3. En **Environment Variables** agregar:
   - `DB_HOST` → valor de TiDB
   - `DB_PORT` → `4000`
   - `DB_USER` → usuario de TiDB
   - `DB_PASSWORD` → contraseña de TiDB
   - `DB_NAME` → `la_gran_empresa`
4. Click en **Deploy** ✅

---

## 💻 Desarrollo Local

```bash
npm install
cp .env.example .env   # llenar con datos reales
node api/index.js
# Abrir http://localhost:3000
```

---

## 🗂️ Endpoints del API

| Método | Ruta                        | Descripción         |
|--------|-----------------------------|---------------------|
| GET    | /api/conceptos              | Listar conceptos    |
| POST   | /api/conceptos              | Crear concepto      |
| PUT    | /api/conceptos/:id          | Actualizar concepto |
| DELETE | /api/conceptos/:id          | Eliminar concepto   |
| GET    | /api/destinos               | Listar destinos     |
| POST   | /api/destinos               | Crear destino       |
| GET    | /api/productos              | Listar productos    |
| POST   | /api/productos              | Crear producto      |
| GET    | /api/unidades_medida        | Listar unidades     |
| POST   | /api/unidades_medida        | Crear unidad        |
| GET    | /api/health                 | Estado de la BD     |

---

## ✅ Criterios de Evaluación

| Criterio        | Implementado |
|-----------------|-------------|
| Navbar completo | ✅ Catálogos + Documentos (SPA) |
| CRUD 4 catálogos| ✅ Conceptos, Destinos, Productos, Unidades |
| Conexión a BD   | ✅ MySQL via TiDB Cloud |
| Despliegue Vercel| ✅ vercel.json configurado |
| Código organizado| ✅ Variables de entorno, Express modular |
