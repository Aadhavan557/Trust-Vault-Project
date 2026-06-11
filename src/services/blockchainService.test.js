/**
 * Integration tests for blockchainService
 *
 * Runs against the active local Hardhat node.
 * Make sure `npx hardhat node` is running and the contract is deployed.
 */

"use strict";

const fs   = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Load environment configuration
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const blockchainService = require("./blockchainService");

describe("blockchainService (Integration)", () => {
  let tempFilePath;
  let registeredHash;
  const testDocId = "60c72b2f9b1d8b2bad0a4321"; // Dummy MongoDB ObjectId

  beforeAll(() => {
    // Create a temporary file to test hashing and notarization
    tempFilePath = path.join(__dirname, "temp-test-doc.txt");
    fs.writeFileSync(tempFilePath, "This is a temporary test document for TrustVault blockchain notarization verification.");
  });

  afterAll(() => {
    // Clean up temporary file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  });

  test("should successfully verify connection to local blockchain node", async () => {
    const health = await blockchainService.healthCheck();
    expect(health.available).toBe(true);
    expect(health.network).toBe("localhost");
    expect(health.chainId).toBe(31337);
    expect(health.contractAddress).toBe("0x5FbDB2315678afecb367f032d93F642f64180aa3");
  });

  test("should successfully hash a file", () => {
    const hash = blockchainService.hashFile(tempFilePath);
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/i);
    registeredHash = hash;
  });

  test("should register file hash on-chain", async () => {
    const result = await blockchainService.registerDocumentHash(
      testDocId,
      "aadhaar",
      tempFilePath
    );

    expect(result.txHash).toMatch(/^0x[a-f0-9]{64}$/i);
    expect(result.blockNumber).toBeGreaterThan(0);
    expect(result.documentHash).toBe(registeredHash);
    expect(result.contractAddress).toBe("0x5FbDB2315678afecb367f032d93F642f64180aa3");
  });

  test("should verify integrity of an untampered file", async () => {
    const result = await blockchainService.verifyDocumentIntegrity(
      tempFilePath,
      registeredHash
    );

    expect(result.verified).toBe(true);
    expect(result.hashMatch).toBe(true);
    expect(result.onChain.exists).toBe(true);
    expect(result.onChain.revoked).toBe(false);
    expect(result.onChain.documentType).toBe("aadhaar");
    expect(result.onChain.documentId).toBe(testDocId);
  });

  test("should fail verification if file content is tampered", async () => {
    // Create a tampered copy of the file
    const tamperedPath = path.join(__dirname, "temp-test-doc-tampered.txt");
    fs.writeFileSync(tamperedPath, "This is a temporary TAMPERED test document.");

    try {
      const result = await blockchainService.verifyDocumentIntegrity(
        tamperedPath,
        registeredHash
      );

      expect(result.verified).toBe(false);
      expect(result.hashMatch).toBe(false);
      expect(result.onChain.exists).toBe(true);
      expect(result.reason).toContain("tampered with");
    } finally {
      if (fs.existsSync(tamperedPath)) {
        fs.unlinkSync(tamperedPath);
      }
    }
  });

  test("should successfully revoke a document hash", async () => {
    const result = await blockchainService.revokeDocumentHash(
      registeredHash,
      "Testing revocation functionality"
    );

    expect(result.txHash).toMatch(/^0x[a-f0-9]{64}$/i);
    expect(result.blockNumber).toBeGreaterThan(0);
  });

  test("should fail verification for revoked hash", async () => {
    const result = await blockchainService.verifyDocumentIntegrity(
      tempFilePath,
      registeredHash
    );

    expect(result.verified).toBe(false);
    expect(result.onChain.revoked).toBe(true);
    expect(result.reason).toContain("revoked");
  });
});
