/**
 * Health-check controller.
 *
 * Returns server status, uptime, environment, timestamp,
 * and MongoDB connection state — useful for load-balancers
 * and monitoring dashboards.
 */

const mongoose = require("mongoose");
const config = require("../config");
const ApiResponse = require("../utils/ApiResponse");

/**
 * @route   GET /api/v1/health
 * @desc    Server health check
 * @access  Public
 */
const healthCheck = (_req, res) => {
  const mongoStates = ["disconnected", "connected", "connecting", "disconnecting"];

  ApiResponse.ok(
    {
      service: "TrustVault API",
      version: "1.0.0",
      environment: config.env,
      uptime: `${Math.floor(process.uptime())}s`,
      timestamp: new Date().toISOString(),
      database: {
        status: mongoStates[mongoose.connection.readyState] || "unknown",
        name: mongoose.connection.name || null,
      },
      memory: {
        rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
      },
    },
    "Server is healthy 🟢"
  ).send(res);
};

module.exports = { healthCheck };
