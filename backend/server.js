// backend/server.js
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Health check simple
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Si tenías endpoints relacionados a Stripe, elimínalos o coméntalos aquí.

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
