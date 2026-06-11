/**
 * Validation rules for document management endpoints.
 * Uses express-validator chain syntax.
 *
 * Pair each ruleset with the `validate` middleware in routes:
 *   router.post("/", uploadRules, validate, controller.upload);
 *
 * NOTE: File-level validation (size, MIME type) is handled by multer config.
 *       These rules validate the non-file body fields and URL params.
 */

"use strict";

const { body, param, query } = require("express-validator");

const VALID_DOCUMENT_TYPES = ["aadhaar", "pan", "passport", "driving_license"];
const VALID_STATUSES       = ["pending", "approved", "rejected"];

// ── Document number format patterns ─────────────────────────

const DOC_NUMBER_PATTERNS = {
  aadhaar: {
    // 12 digits, optionally separated by spaces (e.g. "1234 5678 9012")
    pattern: /^\d{4}\s?\d{4}\s?\d{4}$/,
    message: "Aadhaar number must be 12 digits",
  },
  pan: {
    // 5 letters + 4 digits + 1 letter (e.g. "ABCDE1234F")
    pattern: /^[A-Z]{5}\d{4}[A-Z]$/,
    message: "PAN must follow the format: ABCDE1234F (5 letters, 4 digits, 1 letter)",
  },
  passport: {
    // Indian passport: 1 letter + 7 digits (e.g. "A1234567")
    // Also allows other formats with 6-9 alphanumeric chars
    pattern: /^[A-Z]\d{7}$|^[A-Z0-9]{6,9}$/,
    message: "Passport number format is invalid",
  },
  driving_license: {
    // Indian DL: 2 letters + 2 digits + optional space + 4 digits + 7 digits
    // Also allows generic alphanumeric 8-16 chars for flexibility
    pattern: /^[A-Z]{2}\d{2}\s?\d{4}\d{7}$|^[A-Z0-9\s-]{8,20}$/,
    message: "Driving license number format is invalid",
  },
};

// ─────────────────────────────────────────────────────────────
// POST /  —  Upload a new document
// ─────────────────────────────────────────────────────────────
const uploadRules = [
  body("documentType")
    .trim()
    .notEmpty()
    .withMessage("Document type is required")
    .isIn(VALID_DOCUMENT_TYPES)
    .withMessage(
      `Document type must be one of: ${VALID_DOCUMENT_TYPES.join(", ")}`
    ),

  body("documentNumber")
    .trim()
    .notEmpty()
    .withMessage("Document number is required")
    .isLength({ min: 4, max: 30 })
    .withMessage("Document number must be 4-30 characters")
    .customSanitizer((value) => value.toUpperCase())
    .custom((value, { req }) => {
      const docType = req.body.documentType;
      const rule    = DOC_NUMBER_PATTERNS[docType];

      if (rule && !rule.pattern.test(value)) {
        throw new Error(rule.message);
      }
      return true;
    }),

  body("expiryDate")
    .optional({ values: "falsy" })
    .isISO8601()
    .withMessage("Expiry date must be a valid ISO 8601 date")
    .toDate()
    .custom((value) => {
      if (value && value < new Date()) {
        throw new Error("Expiry date must be in the future");
      }
      return true;
    }),
];

// ─────────────────────────────────────────────────────────────
// PATCH /:id  —  Update (re-upload) document
// ─────────────────────────────────────────────────────────────
const updateRules = [
  param("id")
    .isMongoId()
    .withMessage("Invalid document ID format"),

  body("documentNumber")
    .optional()
    .trim()
    .isLength({ min: 4, max: 30 })
    .withMessage("Document number must be 4-30 characters")
    .customSanitizer((value) => value.toUpperCase()),

  body("expiryDate")
    .optional({ values: "falsy" })
    .isISO8601()
    .withMessage("Expiry date must be a valid ISO 8601 date")
    .toDate(),

  body("changeReason")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Change reason cannot exceed 500 characters"),
];

// ─────────────────────────────────────────────────────────────
// DELETE /:id  —  Delete document
// ─────────────────────────────────────────────────────────────
const deleteRules = [
  param("id")
    .isMongoId()
    .withMessage("Invalid document ID format"),
];

// ─────────────────────────────────────────────────────────────
// GET /:id  —  Get single document
// ─────────────────────────────────────────────────────────────
const getByIdRules = [
  param("id")
    .isMongoId()
    .withMessage("Invalid document ID format"),
];

// ─────────────────────────────────────────────────────────────
// GET /  —  List my documents (query params)
// ─────────────────────────────────────────────────────────────
const listRules = [
  query("documentType")
    .optional()
    .isIn(VALID_DOCUMENT_TYPES)
    .withMessage(
      `documentType filter must be one of: ${VALID_DOCUMENT_TYPES.join(", ")}`
    ),

  query("status")
    .optional()
    .isIn(VALID_STATUSES)
    .withMessage(`status filter must be one of: ${VALID_STATUSES.join(", ")}`),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("limit must be between 1 and 50"),

  query("sortBy")
    .optional()
    .isIn(["createdAt", "updatedAt", "documentType", "status"])
    .withMessage("sortBy must be one of: createdAt, updatedAt, documentType, status"),

  query("order")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("order must be 'asc' or 'desc'"),
];

// ─────────────────────────────────────────────────────────────
// GET /:id/history  —  Version history
// ─────────────────────────────────────────────────────────────
const historyRules = [
  param("id")
    .isMongoId()
    .withMessage("Invalid document ID format"),
];

// ── Exports ──────────────────────────────────────────────────

module.exports = {
  uploadRules,
  updateRules,
  deleteRules,
  getByIdRules,
  listRules,
  historyRules,
};
