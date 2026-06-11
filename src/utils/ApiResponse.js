/**
 * Standardised API response wrapper.
 * Every successful response goes through this class
 * so the client always receives a predictable shape:
 *
 *  { success: true, statusCode, message, data }
 */

class ApiResponse {
  constructor(statusCode, message = "Success", data = null) {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }

  // Convenience: send directly on an Express `res`
  send(res) {
    return res.status(this.statusCode).json({
      success: this.success,
      statusCode: this.statusCode,
      message: this.message,
      data: this.data,
    });
  }

  // ── Factory helpers ───────────────────────────────────
  static ok(data, message = "Success") {
    return new ApiResponse(200, message, data);
  }

  static created(data, message = "Created") {
    return new ApiResponse(201, message, data);
  }

  static noContent(message = "No content") {
    return new ApiResponse(204, message);
  }
}

module.exports = ApiResponse;
