/**
 * Central route aggregator.
 *
 * Mounts all domain-specific route modules under a single router
 * which is then mounted at `/api/v1` in app.js.
 *
 * Route map:
 *   /api/v1/health     → healthRoutes     (public)
 *   /api/v1/auth       → authRoutes       (public + private)
 *   /api/v1/users      → userRoutes       (admin-only)
 *   /api/v1/documents  → documentRoutes   (authenticated, owner-gated)
 *   /api/v1/blockchain → blockchainRoutes (authenticated, document integrity)
 */

const express = require("express");
const router = express.Router();

const healthRoutes   = require("./healthRoutes");
const authRoutes     = require("./authRoutes");
const userRoutes     = require("./userRoutes");
const documentRoutes = require("./documentRoutes");
const verificationRoutes = require("./verificationRoutes");
const kycCredentialRoutes = require("./kycCredentialRoutes");
const qrRoutes = require("./qrRoutes");
const blockchainRoutes = require("./blockchainRoutes");

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/documents", documentRoutes);
router.use("/verification", verificationRoutes);
router.use("/credentials", kycCredentialRoutes);
router.use("/qr", qrRoutes);
router.use("/blockchain", blockchainRoutes);

module.exports = router;
