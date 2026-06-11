/**
 * Winston logger — structured, levelled logging.
 *
 * - Console transport with colour in dev
 * - File transports for error + combined logs in production
 */

const { createLogger, format, transports } = require("winston");
const path = require("path");

const config = require("../config");

const logDir = path.join(__dirname, "../../logs");

const logger = createLogger({
  level: config.env === "development" ? "debug" : "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: "trustvault" },
  transports: [
    // ── Always write errors to error.log ────────────────
    new transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5 MB
      maxFiles: 5,
    }),
    // ── Combined log ────────────────────────────────────
    new transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// ── Pretty console output in development ────────────────────
if (config.env !== "production") {
  logger.add(
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
    })
  );
}

module.exports = logger;
