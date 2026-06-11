/**
 * KYC Document model — stores uploaded identity documents.
 *
 * Each document is linked to a User and tracks:
 *   • documentType (passport, national_id, driving_licence, etc.)
 *   • documentNumber (encrypted / hashed in a real deployment)
 *   • filePath to the uploaded scan
 *   • Verification status and reviewer notes
 *   • Timestamps
 */

const mongoose = require("mongoose");

const kycDocumentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
      index: true,
    },

    documentType: {
      type: String,
      required: [true, "Document type is required"],
      enum: [
        "passport",
        "national_id",
        "driving_licence",
        "voter_id",
        "utility_bill",
        "bank_statement",
        "other",
      ],
    },

    documentNumber: {
      type: String,
      required: [true, "Document number is required"],
      trim: true,
    },

    filePath: {
      type: String,
      required: [true, "Document file path is required"],
    },

    originalFileName: {
      type: String,
      default: null,
    },

    mimeType: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      default: null,
    },

    expiryDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── Compound index: one document type per user ──────────────
kycDocumentSchema.index({ user: 1, documentType: 1 });

module.exports = mongoose.model("KycDocument", kycDocumentSchema);
