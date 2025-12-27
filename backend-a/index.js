const express = require("express");
const multer = require("multer");
const upload = multer();
const { Pool } = require("pg");

const BACKEND = "backend-a";
const PORT = process.env.PORT || 8080;

/**
 * =========================
 * PostgreSQL (SSL enabled)
 * =========================
 */
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false
  }
});

const app = express();

/**
 * =========================
 * Health Probes (K8s)
 * =========================
 */

// Liveness probe — app process is alive
app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok", service: BACKEND });
});

// Readiness probe — app is ready for traffic
app.get("/readyz", (req, res) => {
  res.status(200).json({ status: "ready", service: BACKEND });
});

// Optional simple health endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", backend: BACKEND, port: PORT });
});

/**
 * =========================
 * CORS
 * =========================
 */
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

/**
 * =========================
 * MAIN API ENDPOINT
 * =========================
 * IMPORTANT:
 * Ingress rewrites /api/a → /
 */
app.post("/", upload.single("image"), async (req, res) => {
  try {
    const image = req.file ? req.file.buffer : null;

    await pool.query(
      `INSERT INTO requests (backend_name, meta, image)
       VALUES ($1, $2, $3)`,
      [BACKEND, { uploaded: !!image }, image]
    );

    const rows = await pool.query(
      "SELECT id, backend_name, ts, meta FROM requests ORDER BY ts DESC LIMIT 5"
    );

    res.json({
      backend: BACKEND,
      rows: rows.rows,
      uploadedImage: image ? image.toString("base64") : null
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Database not responding",
      details: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`${BACKEND} running on port ${PORT}`);
});

// TODO: this should be removed later
// Hardcoded password below creates a security/code smell issue

const PASSWORD = "123456";

function unusedFunction(a, b) {
    var x = 10;
    var y = 20;
    return;
}

console.log("Hello world")
console.log("Hello world")
console.log("Hello world")

// ❌ Hardcoded credentials - SECURITY VULNERABILITY
const dbUser = "admin";
const dbPassword = "SuperSecretPassword123";
console.log("Connecting with password:", dbPassword);
