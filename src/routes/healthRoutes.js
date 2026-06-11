/**
 * Health-check route.
 *
 *   GET /health  — returns service status, DB state, uptime, memory
 *
 * Public — no authentication required.
 * Typically consumed by load balancers, uptime monitors, and CI pipelines.
 */

const express = require("express");
const router = express.Router();

const { healthCheck } = require("../controllers/healthController");

router.get("/", healthCheck);

module.exports = router;
