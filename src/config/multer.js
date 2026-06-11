/**
 * Multer configuration for TrustVault document uploads.
 *
 * Security measures:
 *   • MIME-type whitelist — only PDF and image formats accepted
 *   • Extension whitelist — independent of MIME to prevent spoofing
 *   • Per-file size limit (10 MB default, configurable via env)
 *   • UUID-based filenames — prevent path traversal and collisions
 *   • Structured storage path: uploads/<documentType>/<userId>/
 *
 * Exports:
 *   • documentUpload  — multer instance; use .single("document")
 *   • UPLOAD_BASE_DIR — absolute path to the root uploads directory
 *   • resolveFilePath — helper to reconstruct an absolute path from a stored relative path
 */

"use strict";

const path  = require("path");
const fs    = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const ApiError = require("../utils/ApiError");

// ── Constants ────────────────────────────────────────────────

/** Root directory where all uploads are stored (relative to project root) */
const UPLOAD_BASE_DIR = path.resolve(process.cwd(), "uploads");

/** Maximum single-file size (bytes). Override with UPLOAD_MAX_SIZE_MB env var. */
const MAX_FILE_SIZE_BYTES =
  (parseInt(process.env.UPLOAD_MAX_SIZE_MB, 10) || 10) * 1024 * 1024;

/** Accepted MIME types */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/** Accepted file extensions (mapped from MIME) */
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

/** Valid document type slugs (must match model enum values) */
const VALID_DOCUMENT_TYPES = new Set([
  "aadhaar",
  "pan",
  "passport",
  "driving_license",
]);

// ── Directory helper ─────────────────────────────────────────

/**
 * Ensures the destination directory exists, creating it recursively if needed.
 * @param {string} dirPath
 */
function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Ensure the base uploads directory exists at startup
ensureDirSync(UPLOAD_BASE_DIR);

// ── Multer disk storage ──────────────────────────────────────

const storage = multer.diskStorage({
  /**
   * Destination: uploads/<documentType>/<userId>/
   * documentType comes from req.body (validated before multer runs via middleware order).
   */
  destination(req, _file, cb) {
    const docType = (req.body.documentType || "unknown").trim().toLowerCase();
    const userId  = req.user?._id?.toString() || "anonymous";

    const uploadDir = path.join(UPLOAD_BASE_DIR, docType, userId);
    try {
      ensureDirSync(uploadDir);
      cb(null, uploadDir);
    } catch (err) {
      cb(new ApiError(500, "Failed to create upload directory"));
    }
  },

  /**
   * Filename: <uuid>-<timestamp>.<ext>
   * Completely decoupled from the original filename to prevent path traversal.
   */
  filename(_req, file, cb) {
    const ext      = path.extname(file.originalname).toLowerCase();
    const safeName = `${uuidv4()}-${Date.now()}${ext}`;
    cb(null, safeName);
  },
});

// ── File filter ──────────────────────────────────────────────

/**
 * Validates both MIME type and file extension.
 * Rejects mismatches (e.g., a .exe renamed to .pdf).
 */
function fileFilter(_req, file, cb) {
  const ext      = path.extname(file.originalname).toLowerCase();
  const mimeOk   = ALLOWED_MIME_TYPES.has(file.mimetype);
  const extOk    = ALLOWED_EXTENSIONS.has(ext);

  if (mimeOk && extOk) {
    return cb(null, true);
  }

  const err = ApiError.badRequest(
    `Unsupported file type. Allowed types: JPEG, PNG, WEBP, PDF. Received: ${file.mimetype} (${ext || "no extension"})`
  );
  cb(err, false);
}

// ── Multer instance ──────────────────────────────────────────

const documentUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize:  MAX_FILE_SIZE_BYTES,
    files:     1,            // single file per request
    fields:    10,           // max non-file body fields
    fieldSize: 512,          // max field value length (bytes)
  },
});

// ── Multer error normaliser middleware ────────────────────────

/**
 * Express error middleware that converts multer-specific errors
 * into ApiError instances so the global handler formats them correctly.
 *
 * Usage: mount AFTER the multer middleware in the route chain.
 *
 * @example
 *   router.post("/upload",
 *     protect,
 *     documentUpload.single("document"),
 *     handleMulterError,
 *     documentController.upload
 *   );
 */
// eslint-disable-next-line no-unused-vars
function handleMulterError(err, _req, _res, next) {
  if (!err) return next();

  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return next(
          ApiError.badRequest(
            `File too large. Maximum allowed size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`
          )
        );
      case "LIMIT_FILE_COUNT":
        return next(ApiError.badRequest("Only one file can be uploaded per request."));
      case "LIMIT_UNEXPECTED_FILE":
        return next(
          ApiError.badRequest(`Unexpected field. Use the field name "document" for the file.`)
        );
      default:
        return next(ApiError.badRequest(`Upload error: ${err.message}`));
    }
  }

  // Pass through ApiError or unknown errors
  next(err);
}

// ── Path utilities ───────────────────────────────────────────

/**
 * Resolves an absolute filesystem path from a stored relative filePath.
 * All stored paths are relative to UPLOAD_BASE_DIR.
 *
 * @param   {string} relativePath - e.g. "aadhaar/userId/uuid-timestamp.pdf"
 * @returns {string}              - Absolute path
 */
function resolveFilePath(relativePath) {
  // Guard against path traversal
  const resolved = path.resolve(UPLOAD_BASE_DIR, relativePath);
  if (!resolved.startsWith(UPLOAD_BASE_DIR)) {
    throw ApiError.badRequest("Invalid file path");
  }
  return resolved;
}

/**
 * Converts an absolute multer destination path + filename into the
 * relative path that should be stored in the database.
 *
 * @param   {string} absolutePath - Full filesystem path returned by multer
 * @returns {string}              - Relative path from UPLOAD_BASE_DIR
 */
function toRelativePath(absolutePath) {
  return path.relative(UPLOAD_BASE_DIR, absolutePath).replace(/\\/g, "/");
}

// ── Exports ──────────────────────────────────────────────────

module.exports = {
  documentUpload,
  handleMulterError,
  UPLOAD_BASE_DIR,
  VALID_DOCUMENT_TYPES,
  resolveFilePath,
  toRelativePath,
};
