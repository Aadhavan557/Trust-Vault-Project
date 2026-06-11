/**
 * Document model — secure identity document storage for TrustVault.
 *
 * Supports:
 *   • Four document types: aadhaar, pan, passport, driving_license
 *   • Immutable version history via embedded `versions[]` sub-documents
 *   • Owner-only modification enforced at route/controller level
 *   • Soft-delete flag (`isDeleted`) to allow safe recovery
 *   • Compound unique index: one active document per type per user
 *
 * Version control strategy:
 *   When a document is updated, the previous file's path and metadata are
 *   pushed into the `versions[]` array before the root fields are overwritten.
 *   The root document always holds the LATEST version.
 */

"use strict";

const mongoose = require("mongoose");

// ── Document type constants ──────────────────────────────────
const DOCUMENT_TYPES = Object.freeze({
  AADHAAR:         "aadhaar",
  PAN:             "pan",
  PASSPORT:        "passport",
  DRIVING_LICENSE: "driving_license",
});

const DOCUMENT_TYPE_VALUES = Object.values(DOCUMENT_TYPES);

// ── Verification status constants ────────────────────────────
const DOCUMENT_STATUS = Object.freeze({
  PENDING:  "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});

// ── Version sub-schema ───────────────────────────────────────
/**
 * Each entry in `versions[]` is a snapshot of the document at the time
 * it was superseded by a new upload. Fields mirror the root document.
 */
const versionSchema = new mongoose.Schema(
  {
    versionNumber: {
      type:     Number,
      required: true,
    },

    filePath: {
      type:     String,
      required: true,
    },

    fileName: {
      type:    String,
      default: null,
    },

    mimeType: {
      type:    String,
      default: null,
    },

    fileSize: {
      type:    Number,  // bytes
      default: null,
    },

    documentNumber: {
      type: String,
      default: null,
    },

    expiryDate: {
      type:    Date,
      default: null,
    },

    status: {
      type: String,
      enum: Object.values(DOCUMENT_STATUS),
    },

    /** ISO string of when this version became the active document */
    activatedAt: {
      type:    Date,
      default: null,
    },

    /** ISO string of when this version was superseded */
    supersededAt: {
      type:    Date,
      default: Date.now,
    },

    /** Free-text reason supplied by the owner when re-uploading */
    changeReason: {
      type:    String,
      trim:    true,
      default: null,
    },
  },
  { _id: true }
);

// ── Root document schema ─────────────────────────────────────
const documentSchema = new mongoose.Schema(
  {
    // ── Ownership ──────────────────────────────────────────
    owner: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: [true, "Document owner is required"],
      index:    true,
    },

    // ── Document classification ────────────────────────────
    documentType: {
      type:     String,
      required: [true, "Document type is required"],
      enum:     {
        values:  DOCUMENT_TYPE_VALUES,
        message: `documentType must be one of: ${DOCUMENT_TYPE_VALUES.join(", ")}`,
      },
    },

    /** Human-readable ID on the physical document (Aadhaar #, PAN #, etc.) */
    documentNumber: {
      type:     String,
      required: [true, "Document number is required"],
      trim:     true,
      uppercase: true,
    },

    // ── File storage ───────────────────────────────────────
    filePath: {
      type:     String,
      required: [true, "File path is required"],
    },

    fileName: {
      type:    String,
      default: null,
    },

    mimeType: {
      type:    String,
      default: null,
    },

    fileSize: {
      type:    Number,  // bytes
      default: null,
    },

    // ── Document metadata ──────────────────────────────────
    expiryDate: {
      type:    Date,
      default: null,
    },

    // ── Verification workflow ──────────────────────────────
    status: {
      type:    String,
      enum:    Object.values(DOCUMENT_STATUS),
      default: DOCUMENT_STATUS.PENDING,
    },

    reviewedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },

    reviewedAt: {
      type:    Date,
      default: null,
    },

    rejectionReason: {
      type:    String,
      trim:    true,
      default: null,
    },

    // ── Version control ────────────────────────────────────
    /** Monotonically increasing counter; starts at 1 on first upload */
    currentVersion: {
      type:    Number,
      default: 1,
      min:     1,
    },

    /**
     * Full history of superseded versions.
     * The current (latest) file lives in root fields above.
     * When a user re-uploads, the current root snapshot is pushed here
     * and root fields are updated.
     */
    versions: {
      type:    [versionSchema],
      default: [],
    },

    // ── Soft delete ────────────────────────────────────────
    isDeleted: {
      type:    Boolean,
      default: false,
      index:   true,
    },

    deletedAt: {
      type:    Date,
      default: null,
    },

    // ── Blockchain notarization ───────────────────────────
    blockchain: {
      txHash:          { type: String, default: null },
      blockNumber:     { type: Number, default: null },
      documentHash:    { type: String, default: null },
      network:         { type: String, default: null },
      contractAddress: { type: String, default: null },
      registeredAt:    { type: Date,   default: null },
      verified:        { type: Boolean, default: false },
      verifiedAt:      { type: Date,   default: null },
      revoked:         { type: Boolean, default: false },
      revokedAt:       { type: Date,   default: null },
    },
  },
  {
    timestamps: true,                          // createdAt + updatedAt
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Indexes ──────────────────────────────────────────────────
/**
 * Partial unique index: one active (non-deleted) document per type per user.
 * Deleted documents are excluded so the same type can be re-uploaded after deletion.
 */
documentSchema.index(
  { owner: 1, documentType: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

documentSchema.index({ documentType: 1, status: 1 });
documentSchema.index({ createdAt: -1 });

// ── Virtual: total revisions ─────────────────────────────────
documentSchema.virtual("totalVersions").get(function () {
  return this.currentVersion;
});

// ── Instance method: snapshot current root into versions[] ───
/**
 * Captures the current root document into the versions array before an update.
 * Must be called (and the document saved) BEFORE overwriting root fields.
 *
 * @param {string|null} changeReason - Optional reason for the update
 * @param {Date} supersededAt        - Timestamp when this version was replaced
 */
documentSchema.methods.archiveCurrentVersion = function (
  changeReason = null,
  supersededAt = new Date()
) {
  this.versions.push({
    versionNumber:  this.currentVersion,
    filePath:       this.filePath,
    fileName:       this.fileName,
    mimeType:       this.mimeType,
    fileSize:       this.fileSize,
    documentNumber: this.documentNumber,
    expiryDate:     this.expiryDate,
    status:         this.status,
    activatedAt:    this.createdAt || this.updatedAt,
    supersededAt,
    changeReason,
  });
  this.currentVersion += 1;
};

// ── Pre-find: exclude soft-deleted by default ─────────────────
documentSchema.pre(/^find/, function (next) {
  // Allow callers to opt-in to seeing deleted docs by passing { includeDeleted: true }
  if (!this.getOptions().includeDeleted) {
    this.where({ isDeleted: false });
  }
  next();
});

// ── Export ───────────────────────────────────────────────────
module.exports = {
  Document: mongoose.model("Document", documentSchema),
  DOCUMENT_TYPES,
  DOCUMENT_STATUS,
};
