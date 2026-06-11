/**
 * MongoDB connection using Mongoose.
 * - Retries on failure with back-off
 * - Logs lifecycle events (connected, disconnected, error)
 */

const mongoose = require("mongoose");
const config = require("./index");
const logger = require("../utils/logger");

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

const connectDB = async (retries = MAX_RETRIES) => {
  try {
    const conn = await mongoose.connect(config.mongoUri, {
      // Mongoose 8 uses the new driver defaults; these are explicit for clarity
      autoIndex: config.env !== "production", // disable auto-index in prod
    });

    logger.info(`✅  MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    logger.error(`❌  MongoDB connection error: ${err.message}`);

    if (retries > 0) {
      logger.info(
        `🔄  Retrying in ${RETRY_DELAY_MS / 1000}s… (${retries} attempts left)`
      );
      await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
      return connectDB(retries - 1);
    }

    logger.error("💀  All MongoDB connection retries exhausted — exiting.");
    process.exit(1);
  }
};

// ── Lifecycle logging ─────────────────────────────────────
mongoose.connection.on("disconnected", () =>
  logger.warn("⚠️  MongoDB disconnected")
);
mongoose.connection.on("reconnected", () =>
  logger.info("♻️  MongoDB reconnected")
);

module.exports = connectDB;
