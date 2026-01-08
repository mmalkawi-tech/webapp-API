const express = require("express");
const multer = require("multer");
const upload = multer();
const { Pool } = require("pg");
const promClient = require("prom-client");

const BACKEND = "backend-b";
const PORT = process.env.PORT || 8080;

// Prometheus metrics setup
const register = new promClient.Registry();

// Enable default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestsTotal = new promClient.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "path", "status"],
  registers: [register]
});

const httpRequestDuration = new promClient.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "path", "status"],
  registers: [register]
});

const dbConnectionsActive = new promClient.Gauge({
  name: "db_connections_active",
  help: "Number of active database connections",
  registers: [register]
});

const dbQueryDuration = new promClient.Histogram({
  name: "db_query_duration_seconds",
  help: "Duration of database queries in seconds",
  labelNames: ["query_type"],
  registers: [register]
});

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

// Track database connection pool metrics
pool.on("connect", () => {
  dbConnectionsActive.set(pool.totalCount);
});

pool.on("remove", () => {
  dbConnectionsActive.set(pool.totalCount);
});

const app = express();

/**
 * =========================
 * Prometheus Metrics Endpoint
 * =========================
 */
app.get("/metrics", async (req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.send(await register.metrics());
});

/**
 * =========================
 * Metrics Middleware
 * =========================
 */
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    const path = req.path === "/" ? "root" : req.path;

    httpRequestsTotal.inc({
      method: req.method,
      path: path,
      status: res.statusCode
    });

    httpRequestDuration.observe({
      method: req.method,
      path: path,
      status: res.statusCode
    }, duration);
  });

  next();
});

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
 * Ingress rewrites /api/b → /
 */
app.post("/", upload.single("image"), async (req, res) => {
  try {
    const image = req.file ? req.file.buffer : null;

    // Track INSERT query duration
    const insertStart = Date.now();
    await pool.query(
      `INSERT INTO requests (backend_name, meta, image)
       VALUES ($1, $2, $3)`,
      [BACKEND, { uploaded: !!image }, image]
    );
    dbQueryDuration.observe({ query_type: "insert" }, (Date.now() - insertStart) / 1000);

    // Track SELECT query duration
    const selectStart = Date.now();
    const rows = await pool.query(
      "SELECT id, backend_name, ts, meta FROM requests ORDER BY ts DESC LIMIT 5"
    );
    dbQueryDuration.observe({ query_type: "select" }, (Date.now() - selectStart) / 1000);

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

