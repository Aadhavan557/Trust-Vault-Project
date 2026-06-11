/**
 * Blockchain routes — TrustVault
 *
 * Route map (all prefixed with /api/v1/blockchain):
 *   POST  /register/:documentId  → Register document hash on-chain
 *   POST  /verify/:documentId    → Verify document integrity
 *   GET   /status/:documentId    → Get blockchain registration status
 *   POST  /revoke/:documentId    → Revoke document hash (admin only)
 *   GET   /health                → Blockchain service health check
 *
 * All routes require authentication except /health.
 */

"use strict";

const express = require("express");
const router  = express.Router();

const { protect } = require("../middlewares/auth");

const {
  registerOnChain,
  verifyOnChain,
  getStatus,
  revokeOnChain,
  blockchainHealth,
} = require("../controllers/blockchainController");

// ── Public ──────────────────────────────────────────────────
router.get("/health", blockchainHealth);

// ── Authenticated ───────────────────────────────────────────
router.post("/register/:documentId", protect, registerOnChain);
router.post("/verify/:documentId",   protect, verifyOnChain);
router.get("/status/:documentId",    protect, getStatus);
router.post("/revoke/:documentId",   protect, revokeOnChain);

module.exports = router;
