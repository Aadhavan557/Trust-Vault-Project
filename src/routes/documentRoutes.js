/**
 * Document management routes — TrustVault
 *
 * All routes are mounted at: /api/v1/documents
 * All routes require authentication (protect middleware).
 *
 * Route map:
 *   POST   /              Upload a new document         (owner)
 *   GET    /              List my documents              (owner)
 *   GET    /:id           Get a single document          (owner / admin)
 *   PATCH  /:id           Update (re-upload) a document  (owner only)
 *   DELETE /:id           Soft-delete a document         (owner / admin)
 *   GET    /:id/history   Version history                (owner / admin)
 *
 * Middleware stack per route:
 *   1. protect                     — JWT authentication
 *   2. documentUpload.single()     — Multer file parsing (upload/update only)
 *   3. handleMulterError           — Normalize multer errors
 *   4. validationRules + validate  — express-validator
 *   5. requireDocumentOwnership    — Ownership gate (param routes)
 *   6. controller                  — Business logic
 */

"use strict";

const express = require("express");
const router  = express.Router();

// ── Middleware ────────────────────────────────────────────────
const { protect }                    = require("../middlewares/auth");
const { requireDocumentOwnership }   = require("../middlewares/documentOwnership");
const validate                       = require("../middlewares/validate");
const { documentUpload, handleMulterError } = require("../config/multer");

// ── Validators ───────────────────────────────────────────────
const {
  uploadRules,
  updateRules,
  deleteRules,
  getByIdRules,
  listRules,
  historyRules,
} = require("../validators/documentValidator");

// ── Controller ───────────────────────────────────────────────
const documentController = require("../controllers/documentController");

// ─────────────────────────────────────────────────────────────
// POST /  —  Upload a new document
// ─────────────────────────────────────────────────────────────
router.post(
  "/",
  protect,
  documentUpload.single("document"),
  handleMulterError,
  uploadRules,
  validate,
  documentController.upload
);

// ─────────────────────────────────────────────────────────────
// GET /  —  List my documents
// ─────────────────────────────────────────────────────────────
router.get(
  "/",
  protect,
  listRules,
  validate,
  documentController.getMyDocuments
);

// ─────────────────────────────────────────────────────────────
// GET /:id  —  Get single document
// ─────────────────────────────────────────────────────────────
router.get(
  "/:id",
  protect,
  getByIdRules,
  validate,
  requireDocumentOwnership,
  documentController.getById
);

// ─────────────────────────────────────────────────────────────
// PATCH /:id  —  Update (re-upload) document
// ─────────────────────────────────────────────────────────────
router.patch(
  "/:id",
  protect,
  documentUpload.single("document"),
  handleMulterError,
  updateRules,
  validate,
  requireDocumentOwnership,
  documentController.update
);

// ─────────────────────────────────────────────────────────────
// DELETE /:id  —  Soft-delete document
// ─────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  protect,
  deleteRules,
  validate,
  requireDocumentOwnership,
  documentController.remove
);

// ─────────────────────────────────────────────────────────────
// GET /:id/history  —  Version history
// ─────────────────────────────────────────────────────────────
router.get(
  "/:id/history",
  protect,
  historyRules,
  validate,
  requireDocumentOwnership,
  documentController.getHistory
);

module.exports = router;
