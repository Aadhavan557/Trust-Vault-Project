/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  TrustVault — Reusable KYC & Digital Identity Platform  ║
 * ║  Entry point: loads env, connects DB, starts HTTP       ║
 * ╚══════════════════════════════════════════════════════════╝
 */

require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/db");
const config = require("./config");
const logger = require("./utils/logger");

// ── Unhandled rejection / exception safety net ──────────────
process.on("unhandledRejection", (reason) => {
  logger.error("UNHANDLED REJECTION 💥", reason);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  logger.error("UNCAUGHT EXCEPTION 💥", err);
  process.exit(1);
});

// ── Bootstrap ───────────────────────────────────────────────
const startServer = async () => {
  // 1. Connect to MongoDB
  await connectDB();

  // 2. Start Express
  const server = app.listen(config.port, () => {
    logger.info(
      `🚀  TrustVault server running in ${config.env} mode on port ${config.port}`
    );
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    logger.info(`${signal} received — shutting down gracefully…`);
    server.close(() => {
      logger.info("HTTP server closed.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

startServer();
