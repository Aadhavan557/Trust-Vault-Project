/**
 * Global error-handling middlewares.
 *
 * ── notFoundHandler ──
 * Catches any request that didn't match a route and forwards a 404 ApiError.
 *
 * ── errorHandler ──
 * Express error middleware (4-arg signature). Differentiates between:
 *   • Operational errors (ApiError) → send structured JSON
 *   • Mongoose validation / cast / duplicate-key errors → normalise to 400/409
 *   • Unknown errors → generic 500 in production, full stack in development
 */

const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");
const config = require("../config");

// ── 404 catch-all ───────────────────────────────────────────
const notFoundHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

// ── Central error handler ───────────────────────────────────
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  let error = { ...err, message: err.message, stack: err.stack };

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    error = ApiError.badRequest(`Invalid ${err.path}: ${err.value}`);
  }

  // Mongoose duplicate key (unique index)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue).join(", ");
    error = ApiError.conflict(`Duplicate value for field(s): ${field}`);
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    error = ApiError.badRequest("Validation failed", messages);
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    error = ApiError.unauthorized("Invalid token");
  }
  if (err.name === "TokenExpiredError") {
    error = ApiError.unauthorized("Token has expired");
  }

  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational || false;

  // Log unexpected (programmer) errors with full stack
  if (!isOperational) {
    logger.error("💥 UNEXPECTED ERROR:", err);
  }

  res.status(statusCode).json({
    success: false,
    statusCode,
    message: error.message || "Internal server error",
    errors: error.errors || [],
    ...(config.env === "development" && { stack: err.stack }),
  });
};

module.exports = { notFoundHandler, errorHandler };
