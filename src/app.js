/**
 * Express application factory
 * -  Middleware stack (helmet, cors, morgan, rate-limiter, JSON parser)
 * -  API route mounting
 * -  Global error handler (must be last)
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const config = require("./config");
const routes = require("./routes");
const { errorHandler, notFoundHandler } = require("./middlewares/errorHandler");

const app = express();

// ── Security headers ────────────────────────────────────────
app.use(helmet());

// ── CORS ────────────────────────────────────────────────────
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

// ── Rate limiting ───────────────────────────────────────────
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests — please try again later.",
  },
});
app.use("/api", limiter);

// ── Body parsers ────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── HTTP request logger ─────────────────────────────────────
if (config.env !== "test") {
  app.use(morgan("dev"));
}

// ── API Routes ──────────────────────────────────────────────
app.use("/api/v1", routes);

// ── 404 catch-all ───────────────────────────────────────────
app.use(notFoundHandler);

// ── Global error handler (must be last middleware) ──────────
app.use(errorHandler);

module.exports = app;
