/**
 * Custom API error class.
 * Extends native Error with `statusCode` and `isOperational` flag
 * so the global error handler can differentiate expected vs. unexpected errors.
 */

class ApiError extends Error {
  constructor(statusCode, message, errors = [], stack = "") {
    super(message);
    this.statusCode = statusCode;
    this.success = false;
    this.errors = errors;
    this.isOperational = true; // trusted, expected error

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  // ── Factory helpers ───────────────────────────────────
  static badRequest(msg = "Bad request", errors = []) {
    return new ApiError(400, msg, errors);
  }

  static unauthorized(msg = "Unauthorized") {
    return new ApiError(401, msg);
  }

  static forbidden(msg = "Forbidden") {
    return new ApiError(403, msg);
  }

  static notFound(msg = "Resource not found") {
    return new ApiError(404, msg);
  }

  static conflict(msg = "Conflict") {
    return new ApiError(409, msg);
  }

  static tooMany(msg = "Too many requests") {
    return new ApiError(429, msg);
  }

  static internal(msg = "Internal server error") {
    return new ApiError(500, msg);
  }
}

module.exports = ApiError;
