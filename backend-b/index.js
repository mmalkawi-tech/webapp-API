const express = require("express");
const multer = require("multer");
const upload = multer();
const { Pool } = require("pg");

const BACKEND = "backend-b";
const PORT = process.env.PORT || 8080;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

const app = express();

// Enable CORS for local development
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", backend: BACKEND, port: PORT });
});

app.post("/api/b", upload.single("image"), async (req, res) => {
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
    res.status(500).json({ error: "Database not responding", details: err.message });
  }
});

app.listen(PORT, () => console.log(`${BACKEND} running on port ${PORT}`));

