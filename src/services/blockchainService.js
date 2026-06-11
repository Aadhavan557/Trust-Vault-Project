/**
 * Blockchain integration service — TrustVault
 *
 * Bridges the Express application and the on-chain DocumentRegistry contract.
 * Handles:
 *   • SHA-256 hashing of document files
 *   • Registering hashes on-chain via ethers.js
 *   • Verifying document integrity against on-chain records
 *   • Revoking document hashes
 *   • Graceful degradation when the blockchain node is unreachable
 *
 * All blockchain interactions are wrapped in try/catch so the main
 * application never crashes due to chain connectivity issues.
 */

"use strict";

const { ethers } = require("ethers");
const crypto     = require("crypto");
const fs         = require("fs");
const path       = require("path");

const config = require("../config");
const logger = require("../utils/logger");

// ── ABI ─────────────────────────────────────────────────────
// Minimal ABI containing only the functions we call.
// This avoids depending on Hardhat's artifact directory at runtime.
const DOCUMENT_REGISTRY_ABI = [
  // Write functions
  "function registerDocument(bytes32 _documentHash, string _documentType, string _documentId) external",
  "function revokeDocument(bytes32 _documentHash, string _reason) external",

  // View functions
  "function verifyDocument(bytes32 _documentHash) external view returns (bool exists, uint256 registeredAt, address registeredBy, bool revoked, string documentType, string documentId)",
  "function getDocumentRecord(bytes32 _documentHash) external view returns (tuple(bytes32 documentHash, string documentType, string documentId, address registeredBy, uint256 registeredAt, bool exists, bool revoked, string revocationReason, uint256 revokedAt))",
  "function totalDocuments() external view returns (uint256)",
  "function owner() external view returns (address)",

  // Events
  "event DocumentRegistered(bytes32 indexed documentHash, string documentType, string documentId, address indexed registeredBy, uint256 registeredAt)",
  "event DocumentRevoked(bytes32 indexed documentHash, string reason, address indexed revokedBy, uint256 revokedAt)",
];

// ── Singleton instances ─────────────────────────────────────
let _provider = null;
let _signer   = null;
let _contract = null;
let _initialized = false;

/**
 * Lazily initialise provider, signer, and contract.
 * Fails gracefully — logs a warning and returns false if configuration is missing.
 */
function _init() {
  if (_initialized) return true;

  if (!config.blockchainEnabled) {
    logger.warn("Blockchain integration is disabled (BLOCKCHAIN_ENABLED != true)");
    return false;
  }

  if (!config.blockchainContractAddr) {
    logger.warn("Blockchain contract address is not configured (BLOCKCHAIN_CONTRACT_ADDRESS)");
    return false;
  }

  if (!config.blockchainPrivateKey) {
    logger.warn("Blockchain private key is not configured (BLOCKCHAIN_PRIVATE_KEY)");
    return false;
  }

  try {
    _provider = new ethers.JsonRpcProvider(config.blockchainRpcUrl);
    _signer   = new ethers.Wallet(config.blockchainPrivateKey, _provider);
    _contract = new ethers.Contract(
      config.blockchainContractAddr,
      DOCUMENT_REGISTRY_ABI,
      _signer
    );
    _initialized = true;
    logger.info(
      `Blockchain service initialised — network=${config.blockchainNetworkName} contract=${config.blockchainContractAddr}`
    );
    return true;
  } catch (err) {
    logger.error("Failed to initialise blockchain service", { error: err.message });
    return false;
  }
}

// ── Helper: ensure service is ready ─────────────────────────

function _ensureReady() {
  if (!_init()) {
    throw new Error("Blockchain service is not available. Check configuration and ensure BLOCKCHAIN_ENABLED=true.");
  }
}

// ═════════════════════════════════════════════════════════════
// Public API
// ═════════════════════════════════════════════════════════════

/**
 * Compute the SHA-256 hash of a file and return it as a 0x-prefixed hex string
 * suitable for use as a Solidity `bytes32`.
 *
 * @param  {string} filePath — absolute or relative path to the file
 * @return {string} 0x-prefixed 32-byte hex hash
 */
function hashFile(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const fileBuffer = fs.readFileSync(absolutePath);
  const sha256     = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  // ethers.js requires a 0x-prefixed 32-byte hex string for bytes32
  return "0x" + sha256;
}

/**
 * Register a document's SHA-256 hash on the blockchain.
 *
 * @param  {string} documentId   — MongoDB document _id
 * @param  {string} documentType — e.g. "aadhaar", "pan"
 * @param  {string} filePath     — path to the document file on disk
 * @return {Object} { txHash, blockNumber, documentHash, network, contractAddress, registeredAt }
 */
async function registerDocumentHash(documentId, documentType, filePath) {
  _ensureReady();

  const documentHash = hashFile(filePath);

  logger.info(
    `Registering document hash on-chain: docId=${documentId} type=${documentType} hash=${documentHash}`
  );

  // Estimate gas first to catch potential reverts early
  const gasEstimate = await _contract.registerDocument.estimateGas(
    documentHash,
    documentType,
    documentId
  );

  logger.debug(`Gas estimate for registerDocument: ${gasEstimate.toString()}`);

  // Send transaction
  const tx = await _contract.registerDocument(
    documentHash,
    documentType,
    documentId,
    { gasLimit: gasEstimate * 120n / 100n } // 20% buffer
  );

  logger.info(`Transaction sent: ${tx.hash} — waiting for confirmation...`);

  // Wait for 1 confirmation
  const receipt = await tx.wait(1);

  const result = {
    txHash:          receipt.hash,
    blockNumber:     receipt.blockNumber,
    documentHash:    documentHash,
    network:         config.blockchainNetworkName,
    contractAddress: config.blockchainContractAddr,
    registeredAt:    new Date(),
    gasUsed:         receipt.gasUsed.toString(),
  };

  logger.info(
    `Document hash registered on-chain: txHash=${result.txHash} block=${result.blockNumber}`
  );

  return result;
}

/**
 * Verify a document's integrity by comparing its current SHA-256 hash
 * with the hash stored on-chain.
 *
 * @param  {string} filePath      — path to the document file on disk
 * @param  {string} storedHash    — the hash that was originally registered (0x-prefixed)
 * @return {Object} verification result
 */
async function verifyDocumentIntegrity(filePath, storedHash) {
  _ensureReady();

  // 1. Re-hash the current file
  const currentHash = hashFile(filePath);

  // 2. Check on-chain record
  const [exists, registeredAt, registeredBy, revoked, documentType, documentId] =
    await _contract.verifyDocument(storedHash);

  // 3. Compare hashes
  const hashMatch = currentHash.toLowerCase() === storedHash.toLowerCase();

  const result = {
    verified:       exists && hashMatch && !revoked,
    hashMatch:      hashMatch,
    currentHash:    currentHash,
    storedHash:     storedHash,
    onChain: {
      exists:       exists,
      registeredAt: exists ? new Date(Number(registeredAt) * 1000).toISOString() : null,
      registeredBy: exists ? registeredBy : null,
      revoked:      revoked,
      documentType: documentType || null,
      documentId:   documentId || null,
    },
    verifiedAt: new Date(),
  };

  if (!exists) {
    result.reason = "Document hash not found on blockchain";
  } else if (revoked) {
    result.reason = "Document has been revoked on blockchain";
  } else if (!hashMatch) {
    result.reason = "Document has been tampered with — hash mismatch";
  } else {
    result.reason = "Document integrity verified successfully";
  }

  logger.info(
    `Document verification: verified=${result.verified} hashMatch=${hashMatch} onChain=${exists} revoked=${revoked}`
  );

  return result;
}

/**
 * Revoke a document's on-chain hash.
 *
 * @param  {string} documentHash — 0x-prefixed bytes32 hash
 * @param  {string} reason       — human-readable revocation reason
 * @return {Object} { txHash, blockNumber, revokedAt }
 */
async function revokeDocumentHash(documentHash, reason) {
  _ensureReady();

  logger.info(`Revoking document hash: ${documentHash} reason="${reason}"`);

  const tx = await _contract.revokeDocument(documentHash, reason);
  const receipt = await tx.wait(1);

  const result = {
    txHash:      receipt.hash,
    blockNumber: receipt.blockNumber,
    revokedAt:   new Date(),
    gasUsed:     receipt.gasUsed.toString(),
  };

  logger.info(`Document hash revoked: txHash=${result.txHash}`);

  return result;
}

/**
 * Read an on-chain record without modifying state (free call).
 *
 * @param  {string} documentHash — 0x-prefixed bytes32 hash
 * @return {Object|null} on-chain record or null if not found
 */
async function getOnChainRecord(documentHash) {
  _ensureReady();

  const [exists, registeredAt, registeredBy, revoked, documentType, documentId] =
    await _contract.verifyDocument(documentHash);

  if (!exists) return null;

  return {
    documentHash,
    documentType,
    documentId,
    registeredBy,
    registeredAt: new Date(Number(registeredAt) * 1000).toISOString(),
    revoked,
  };
}

/**
 * Check if the blockchain service is available and connected.
 *
 * @return {Object} { available, network, blockNumber, contractAddress, signerAddress }
 */
async function healthCheck() {
  if (!config.blockchainEnabled) {
    return { available: false, reason: "Blockchain integration is disabled" };
  }

  try {
    _ensureReady();
    const network     = await _provider.getNetwork();
    const blockNumber = await _provider.getBlockNumber();
    const totalDocs   = await _contract.totalDocuments();

    return {
      available:       true,
      network:         config.blockchainNetworkName,
      chainId:         Number(network.chainId),
      blockNumber:     blockNumber,
      contractAddress: config.blockchainContractAddr,
      signerAddress:   _signer.address,
      totalDocuments:  Number(totalDocs),
    };
  } catch (err) {
    return {
      available: false,
      reason:    err.message,
    };
  }
}

// ── Exports ─────────────────────────────────────────────────

module.exports = {
  hashFile,
  registerDocumentHash,
  verifyDocumentIntegrity,
  revokeDocumentHash,
  getOnChainRecord,
  healthCheck,
};
