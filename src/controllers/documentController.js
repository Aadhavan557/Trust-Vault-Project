/**
 * Document controller — TrustVault secure document management.
 *
 * Endpoints:
 *   POST   /              → upload       (create new document)
 *   PATCH  /:id           → update       (re-upload with version history)
 *   DELETE /:id           → remove       (soft-delete)
 *   GET    /:id           → getById      (single document + current file info)
 *   GET    /              → getMyDocuments(all documents for the logged-in user)
 *   GET    /:id/history   → getHistory   (version history for a document)
 *
 * Conventions:
 *   • `req.user`     is set by the `protect` middleware.
 *   • `req.document` is set by the `requireDocumentOwnership` middleware
 *     for /:id routes (avoids double-fetching).
 *   • Files are stored locally; paths saved relative to UPLOAD_BASE_DIR.
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const { Document, DOCUMENT_STATUS } = require("../models/Document");
const ApiError    = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const catchAsync  = require("../utils/catchAsync");
const logger      = require("../utils/logger");
const { toRelativePath, UPLOAD_BASE_DIR } = require("../config/multer");

// ─────────────────────────────────────────────────────────────
// POST /  —  Upload a new document
// ─────────────────────────────────────────────────────────────
const upload = catchAsync(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest("No document file was uploaded");
  }

  const { documentType, documentNumber, expiryDate, changeReason } = req.body;

  // Check for an existing active document of the same type for this user
  const existing = await Document.findOne({
    owner:        req.user._id,
    documentType,
    isDeleted:    false,
  });

  if (existing) {
    // Clean up the just-uploaded file since we're rejecting the request
    safeUnlink(req.file.path);
    throw ApiError.conflict(
      `You already have an active ${documentType} document. Use the update endpoint (PATCH /:id) to upload a new version.`
    );
  }

  const relativePath = toRelativePath(req.file.path);

  const document = await Document.create({
    owner:          req.user._id,
    documentType,
    documentNumber: documentNumber.trim().toUpperCase(),
    filePath:       relativePath,
    fileName:       req.file.originalname,
    mimeType:       req.file.mimetype,
    fileSize:       req.file.size,
    expiryDate:     expiryDate || null,
    currentVersion: 1,
    versions:       [],
  });

  logger.info(
    `Document uploaded: type=${documentType} owner=${req.user._id} docId=${document._id}`
  );

  ApiResponse.created(
    sanitiseDocument(document),
    "Document uploaded successfully"
  ).send(res);
});

// ─────────────────────────────────────────────────────────────
// PATCH /:id  —  Update (re-upload) an existing document
// ─────────────────────────────────────────────────────────────
/**
 * Version control flow:
 *   1. Snapshot the current root fields → push into versions[]
 *   2. Overwrite root fields with new file + metadata
 *   3. Increment currentVersion
 *   4. Reset verification status to "pending"
 *   5. Persist
 */
const update = catchAsync(async (req, res) => {
  const document = req.document; // set by requireDocumentOwnership

  const { documentNumber, expiryDate, changeReason } = req.body;

  // ── Archive current version ──────────────────────────────
  document.archiveCurrentVersion(changeReason || null);

  // ── Apply new file if provided ───────────────────────────
  if (req.file) {
    const relativePath = toRelativePath(req.file.path);
    document.filePath  = relativePath;
    document.fileName  = req.file.originalname;
    document.mimeType  = req.file.mimetype;
    document.fileSize  = req.file.size;
  }

  // ── Apply metadata updates ───────────────────────────────
  if (documentNumber) {
    document.documentNumber = documentNumber.trim().toUpperCase();
  }
  if (expiryDate !== undefined) {
    document.expiryDate = expiryDate || null;
  }

  // Re-uploading always resets verification
  document.status          = DOCUMENT_STATUS.PENDING;
  document.reviewedBy      = null;
  document.reviewedAt      = null;
  document.rejectionReason = null;

  await document.save();

  logger.info(
    `Document updated: docId=${document._id} version=${document.currentVersion} owner=${req.user._id}`
  );

  ApiResponse.ok(
    sanitiseDocument(document),
    "Document updated successfully — verification reset to pending"
  ).send(res);
});

// ─────────────────────────────────────────────────────────────
// DELETE /:id  —  Soft-delete a document
// ─────────────────────────────────────────────────────────────
const remove = catchAsync(async (req, res) => {
  const document = req.document; // set by requireDocumentOwnership

  document.isDeleted = true;
  document.deletedAt = new Date();
  await document.save();

  logger.info(
    `Document soft-deleted: docId=${document._id} owner=${req.user._id}`
  );

  ApiResponse.ok(
    { id: document._id, isDeleted: true },
    "Document deleted successfully"
  ).send(res);
});

// ─────────────────────────────────────────────────────────────
// GET /:id  —  Get a single document by ID
// ─────────────────────────────────────────────────────────────
const getById = catchAsync(async (req, res) => {
  const document = req.document; // set by requireDocumentOwnership

  ApiResponse.ok(
    sanitiseDocument(document),
    "Document retrieved successfully"
  ).send(res);
});

// ─────────────────────────────────────────────────────────────
// GET /  —  List all documents for the logged-in user
// ─────────────────────────────────────────────────────────────
const getMyDocuments = catchAsync(async (req, res) => {
  const {
    documentType,
    status,
    page  = 1,
    limit = 20,
    sortBy = "createdAt",
    order  = "desc",
  } = req.query;

  // ── Build filter ─────────────────────────────────────────
  const filter = { owner: req.user._id };

  if (documentType) {
    filter.documentType = documentType;
  }
  if (status) {
    filter.status = status;
  }

  // ── Pagination ───────────────────────────────────────────
  const pageNum    = Math.max(1, parseInt(page, 10) || 1);
  const limitNum   = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip       = (pageNum - 1) * limitNum;
  const sortOrder  = order === "asc" ? 1 : -1;

  const [documents, totalCount] = await Promise.all([
    Document.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limitNum)
      .select("-versions")          // exclude bulky version array from list view
      .lean(),
    Document.countDocuments(filter),
  ]);

  ApiResponse.ok(
    {
      documents: documents.map(sanitiseDocumentLean),
      pagination: {
        total:       totalCount,
        page:        pageNum,
        limit:       limitNum,
        totalPages:  Math.ceil(totalCount / limitNum),
        hasNextPage: pageNum * limitNum < totalCount,
      },
    },
    "Documents retrieved successfully"
  ).send(res);
});

// ─────────────────────────────────────────────────────────────
// GET /:id/history  —  Full version history for a document
// ─────────────────────────────────────────────────────────────
const getHistory = catchAsync(async (req, res) => {
  const document = req.document; // set by requireDocumentOwnership

  // Build a unified timeline: previous versions + current
  const history = [
    // Past versions (oldest first)
    ...document.versions
      .map((v) => ({
        versionNumber:  v.versionNumber,
        fileName:       v.fileName,
        mimeType:       v.mimeType,
        fileSize:       v.fileSize,
        documentNumber: v.documentNumber,
        expiryDate:     v.expiryDate,
        status:         v.status,
        activatedAt:    v.activatedAt,
        supersededAt:   v.supersededAt,
        changeReason:   v.changeReason,
        isCurrent:      false,
      }))
      .sort((a, b) => a.versionNumber - b.versionNumber),

    // Current version
    {
      versionNumber:  document.currentVersion,
      fileName:       document.fileName,
      mimeType:       document.mimeType,
      fileSize:       document.fileSize,
      documentNumber: document.documentNumber,
      expiryDate:     document.expiryDate,
      status:         document.status,
      activatedAt:    document.updatedAt,
      supersededAt:   null,
      changeReason:   null,
      isCurrent:      true,
    },
  ];

  ApiResponse.ok(
    {
      documentId:     document._id,
      documentType:   document.documentType,
      currentVersion: document.currentVersion,
      totalVersions:  document.currentVersion,
      history,
    },
    "Document history retrieved successfully"
  ).send(res);
});

// ─────────────────────────────────────────────────────────────
// Helpers (private)
// ─────────────────────────────────────────────────────────────

/**
 * Strips internal fields from a Mongoose document before sending to client.
 * Works with Mongoose document instances (uses .toObject()).
 */
function sanitiseDocument(doc) {
  const obj = doc.toObject({ virtuals: true });
  delete obj.__v;
  // Don't expose raw file system paths to the client
  delete obj.filePath;
  if (obj.versions) {
    obj.versions = obj.versions.map(({ filePath, ...rest }) => rest);
  }
  return obj;
}

/**
 * Sanitise a lean (plain object) document from .lean() queries.
 */
function sanitiseDocumentLean(obj) {
  const { __v, filePath, ...rest } = obj;
  return rest;
}

/**
 * Safely delete a file without throwing if it doesn't exist.
 */
function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    logger.warn(`Failed to clean up file: ${filePath} — ${err.message}`);
  }
}

// ── Exports ──────────────────────────────────────────────────

module.exports = {
  upload,
  update,
  remove,
  getById,
  getMyDocuments,
  getHistory,
};
