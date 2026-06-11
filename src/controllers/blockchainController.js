/**
 * Blockchain controller — TrustVault
 *
 * Endpoints:
 *   POST  /register/:documentId  → registerOnChain  (hash & register)
 *   POST  /verify/:documentId    → verifyOnChain    (re-hash & compare)
 *   GET   /status/:documentId    → getStatus        (blockchain registration status)
 *   POST  /revoke/:documentId    → revokeOnChain    (revoke hash — admin only)
 *   GET   /health                → healthCheck      (service connectivity)
 *
 * Conventions:
 *   • `req.user` is set by the `protect` middleware.
 *   • Documents are fetched by ID and ownership is validated.
 *   • File paths are resolved from UPLOAD_BASE_DIR.
 */

"use strict";

const path = require("path");

const { Document }      = require("../models/Document");
const blockchainService = require("../services/blockchainService");
const ApiError          = require("../utils/ApiError");
const ApiResponse       = require("../utils/ApiResponse");
const catchAsync        = require("../utils/catchAsync");
const logger            = require("../utils/logger");
const { UPLOAD_BASE_DIR } = require("../config/multer");

// ── Helper: resolve the on-disk file path for a document ────

function resolveFilePath(document) {
  const filePath = path.resolve(UPLOAD_BASE_DIR, document.filePath);
  return filePath;
}

// ── Helper: fetch & validate document ownership ─────────────

async function fetchOwnedDocument(documentId, userId) {
  const document = await Document.findById(documentId);

  if (!document) {
    throw ApiError.notFound("Document not found");
  }

  if (document.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden("You do not own this document");
  }

  return document;
}

// ─────────────────────────────────────────────────────────────
// POST /register/:documentId  —  Hash & register on-chain
// ─────────────────────────────────────────────────────────────
const registerOnChain = catchAsync(async (req, res) => {
  const document = await fetchOwnedDocument(req.params.documentId, req.user._id);

  // Check if already registered
  if (document.blockchain && document.blockchain.txHash) {
    throw ApiError.conflict(
      "Document is already registered on the blockchain. " +
      "Use the verify endpoint to check integrity."
    );
  }

  const filePath = resolveFilePath(document);

  // Register on-chain
  const result = await blockchainService.registerDocumentHash(
    document._id.toString(),
    document.documentType,
    filePath
  );

  // Store blockchain metadata in MongoDB
  document.blockchain = {
    txHash:          result.txHash,
    blockNumber:     result.blockNumber,
    documentHash:    result.documentHash,
    network:         result.network,
    contractAddress: result.contractAddress,
    registeredAt:    result.registeredAt,
    verified:        true,
    verifiedAt:      new Date(),
    revoked:         false,
    revokedAt:       null,
  };

  await document.save();

  logger.info(
    `Document registered on blockchain: docId=${document._id} txHash=${result.txHash}`
  );

  ApiResponse.created(
    {
      documentId:   document._id,
      documentType: document.documentType,
      blockchain:   document.blockchain,
    },
    "Document hash registered on blockchain successfully"
  ).send(res);
});

// ─────────────────────────────────────────────────────────────
// POST /verify/:documentId  —  Re-hash & compare with on-chain
// ─────────────────────────────────────────────────────────────
const verifyOnChain = catchAsync(async (req, res) => {
  const document = await fetchOwnedDocument(req.params.documentId, req.user._id);

  if (!document.blockchain || !document.blockchain.documentHash) {
    throw ApiError.badRequest(
      "Document has not been registered on the blockchain yet. " +
      "Use the register endpoint first."
    );
  }

  const filePath = resolveFilePath(document);

  // Verify integrity
  const verification = await blockchainService.verifyDocumentIntegrity(
    filePath,
    document.blockchain.documentHash
  );

  // Update verification status in MongoDB
  document.blockchain.verified   = verification.verified;
  document.blockchain.verifiedAt = new Date();
  await document.save();

  logger.info(
    `Document verification: docId=${document._id} verified=${verification.verified}`
  );

  ApiResponse.ok(
    {
      documentId:   document._id,
      documentType: document.documentType,
      verification,
    },
    verification.verified
      ? "Document integrity verified — no tampering detected"
      : "Document integrity check failed"
  ).send(res);
});

// ─────────────────────────────────────────────────────────────
// GET /status/:documentId  —  Get blockchain registration status
// ─────────────────────────────────────────────────────────────
const getStatus = catchAsync(async (req, res) => {
  const document = await fetchOwnedDocument(req.params.documentId, req.user._id);

  const blockchainData = document.blockchain || {};
  const isRegistered = !!blockchainData.txHash;

  const status = {
    documentId:   document._id,
    documentType: document.documentType,
    registered:   isRegistered,
    blockchain:   isRegistered
      ? {
          txHash:          blockchainData.txHash,
          blockNumber:     blockchainData.blockNumber,
          documentHash:    blockchainData.documentHash,
          network:         blockchainData.network,
          contractAddress: blockchainData.contractAddress,
          registeredAt:    blockchainData.registeredAt,
          verified:        blockchainData.verified,
          verifiedAt:      blockchainData.verifiedAt,
          revoked:         blockchainData.revoked,
          revokedAt:       blockchainData.revokedAt,
        }
      : null,
  };

  // If registered, also fetch live on-chain record
  if (isRegistered) {
    try {
      const onChainRecord = await blockchainService.getOnChainRecord(
        blockchainData.documentHash
      );
      status.onChainRecord = onChainRecord;
    } catch (err) {
      logger.warn(`Could not fetch on-chain record: ${err.message}`);
      status.onChainRecord = null;
      status.onChainError  = "Could not reach blockchain node";
    }
  }

  ApiResponse.ok(
    status,
    isRegistered
      ? "Blockchain registration status retrieved"
      : "Document is not registered on the blockchain"
  ).send(res);
});

// ─────────────────────────────────────────────────────────────
// POST /revoke/:documentId  —  Revoke on-chain hash (admin only)
// ─────────────────────────────────────────────────────────────
const revokeOnChain = catchAsync(async (req, res) => {
  // Admin check (assumes req.user.role exists from auth middleware)
  if (req.user.role !== "admin") {
    throw ApiError.forbidden("Only administrators can revoke blockchain records");
  }

  const document = await Document.findById(req.params.documentId);

  if (!document) {
    throw ApiError.notFound("Document not found");
  }

  if (!document.blockchain || !document.blockchain.documentHash) {
    throw ApiError.badRequest("Document has not been registered on the blockchain");
  }

  if (document.blockchain.revoked) {
    throw ApiError.conflict("Document has already been revoked on the blockchain");
  }

  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    throw ApiError.badRequest("A revocation reason is required");
  }

  // Revoke on-chain
  const result = await blockchainService.revokeDocumentHash(
    document.blockchain.documentHash,
    reason.trim()
  );

  // Update MongoDB
  document.blockchain.revoked   = true;
  document.blockchain.revokedAt = result.revokedAt;
  await document.save();

  logger.info(
    `Document revoked on blockchain: docId=${document._id} txHash=${result.txHash} reason="${reason}"`
  );

  ApiResponse.ok(
    {
      documentId:   document._id,
      revocation: {
        txHash:      result.txHash,
        blockNumber: result.blockNumber,
        reason:      reason.trim(),
        revokedAt:   result.revokedAt,
      },
    },
    "Document hash revoked on blockchain"
  ).send(res);
});

// ─────────────────────────────────────────────────────────────
// GET /health  —  Blockchain service connectivity check
// ─────────────────────────────────────────────────────────────
const blockchainHealth = catchAsync(async (req, res) => {
  const health = await blockchainService.healthCheck();

  ApiResponse.ok(
    health,
    health.available
      ? "Blockchain service is connected"
      : "Blockchain service is unavailable"
  ).send(res);
});

// ── Exports ──────────────────────────────────────────────────

module.exports = {
  registerOnChain,
  verifyOnChain,
  getStatus,
  revokeOnChain,
  blockchainHealth,
};
