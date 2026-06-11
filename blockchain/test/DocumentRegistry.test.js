/**
 * DocumentRegistry — Unit tests
 *
 * Covers:
 *   • Registration of document hashes
 *   • Verification (view) calls
 *   • Duplicate prevention
 *   • Revocation flow
 *   • Access control (onlyOwner, onlyAuthorized)
 *   • Edge cases (zero hash, non-existent records)
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DocumentRegistry", function () {
  let registry;
  let owner, authorized, unauthorized;

  // A deterministic test hash (SHA-256 of "test-document")
  const TEST_HASH = ethers.keccak256(ethers.toUtf8Bytes("test-document"));
  const TEST_HASH_2 = ethers.keccak256(ethers.toUtf8Bytes("test-document-2"));
  const ZERO_HASH = ethers.ZeroHash;

  beforeEach(async function () {
    [owner, authorized, unauthorized] = await ethers.getSigners();

    const DocumentRegistry = await ethers.getContractFactory("DocumentRegistry");
    registry = await DocumentRegistry.deploy();
    await registry.waitForDeployment();

    // Add `authorized` as an authorized caller
    await registry.addAuthorizedCaller(authorized.address);
  });

  // ── Deployment ─────────────────────────────────────────────

  describe("Deployment", function () {
    it("should set the deployer as owner", async function () {
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("should authorize the deployer on construction", async function () {
      expect(await registry.authorizedCallers(owner.address)).to.be.true;
    });

    it("should start with zero documents", async function () {
      expect(await registry.totalDocuments()).to.equal(0);
    });
  });

  // ── Registration ───────────────────────────────────────────

  describe("registerDocument", function () {
    it("should register a document hash (owner)", async function () {
      const tx = await registry.registerDocument(TEST_HASH, "aadhaar", "doc123");
      await tx.wait();

      const [exists, , registeredBy, revoked, docType, docId] =
        await registry.verifyDocument(TEST_HASH);

      expect(exists).to.be.true;
      expect(registeredBy).to.equal(owner.address);
      expect(revoked).to.be.false;
      expect(docType).to.equal("aadhaar");
      expect(docId).to.equal("doc123");
    });

    it("should register a document hash (authorized caller)", async function () {
      const tx = await registry
        .connect(authorized)
        .registerDocument(TEST_HASH, "pan", "doc456");
      await tx.wait();

      const [exists, , registeredBy] = await registry.verifyDocument(TEST_HASH);
      expect(exists).to.be.true;
      expect(registeredBy).to.equal(authorized.address);
    });

    it("should emit DocumentRegistered event", async function () {
      await expect(
        registry.registerDocument(TEST_HASH, "passport", "doc789")
      )
        .to.emit(registry, "DocumentRegistered")
        .withArgs(
          TEST_HASH,
          "passport",
          "doc789",
          owner.address,
          (ts) => ts > 0 // any positive timestamp
        );
    });

    it("should increment totalDocuments", async function () {
      await registry.registerDocument(TEST_HASH, "aadhaar", "doc1");
      await registry.registerDocument(TEST_HASH_2, "pan", "doc2");
      expect(await registry.totalDocuments()).to.equal(2);
    });

    it("should reject duplicate hash registration", async function () {
      await registry.registerDocument(TEST_HASH, "aadhaar", "doc1");

      await expect(
        registry.registerDocument(TEST_HASH, "aadhaar", "doc1-dup")
      ).to.be.revertedWithCustomError(registry, "DocumentAlreadyRegistered");
    });

    it("should reject zero hash", async function () {
      await expect(
        registry.registerDocument(ZERO_HASH, "aadhaar", "doc1")
      ).to.be.revertedWithCustomError(registry, "InvalidHash");
    });

    it("should reject unauthorized caller", async function () {
      await expect(
        registry
          .connect(unauthorized)
          .registerDocument(TEST_HASH, "aadhaar", "doc1")
      ).to.be.revertedWithCustomError(registry, "OnlyAuthorized");
    });
  });

  // ── Verification ───────────────────────────────────────────

  describe("verifyDocument", function () {
    it("should return exists=false for unregistered hash", async function () {
      const [exists] = await registry.verifyDocument(TEST_HASH);
      expect(exists).to.be.false;
    });

    it("should return full details for registered hash", async function () {
      await registry.registerDocument(TEST_HASH, "driving_license", "dl001");

      const [exists, registeredAt, registeredBy, revoked, docType, docId] =
        await registry.verifyDocument(TEST_HASH);

      expect(exists).to.be.true;
      expect(registeredAt).to.be.greaterThan(0);
      expect(registeredBy).to.equal(owner.address);
      expect(revoked).to.be.false;
      expect(docType).to.equal("driving_license");
      expect(docId).to.equal("dl001");
    });

    it("should be callable by anyone (no access control)", async function () {
      await registry.registerDocument(TEST_HASH, "aadhaar", "doc1");

      // Unauthorized user can still verify (view function)
      const [exists] = await registry
        .connect(unauthorized)
        .verifyDocument(TEST_HASH);
      expect(exists).to.be.true;
    });
  });

  // ── Get Full Record ────────────────────────────────────────

  describe("getDocumentRecord", function () {
    it("should revert for non-existent hash", async function () {
      await expect(
        registry.getDocumentRecord(TEST_HASH)
      ).to.be.revertedWithCustomError(registry, "DocumentNotFound");
    });

    it("should return the full record struct", async function () {
      await registry.registerDocument(TEST_HASH, "passport", "pass001");

      const record = await registry.getDocumentRecord(TEST_HASH);
      expect(record.documentHash).to.equal(TEST_HASH);
      expect(record.documentType).to.equal("passport");
      expect(record.documentId).to.equal("pass001");
      expect(record.exists).to.be.true;
      expect(record.revoked).to.be.false;
    });
  });

  // ── Revocation ─────────────────────────────────────────────

  describe("revokeDocument", function () {
    beforeEach(async function () {
      await registry.registerDocument(TEST_HASH, "aadhaar", "doc1");
    });

    it("should revoke a registered document", async function () {
      await registry.revokeDocument(TEST_HASH, "Fraudulent document");

      const [exists, , , revoked] = await registry.verifyDocument(TEST_HASH);
      expect(exists).to.be.true;
      expect(revoked).to.be.true;
    });

    it("should emit DocumentRevoked event", async function () {
      await expect(
        registry.revokeDocument(TEST_HASH, "Tampered")
      )
        .to.emit(registry, "DocumentRevoked")
        .withArgs(TEST_HASH, "Tampered", owner.address, (ts) => ts > 0);
    });

    it("should store revocation reason", async function () {
      await registry.revokeDocument(TEST_HASH, "Failed audit");

      const record = await registry.getDocumentRecord(TEST_HASH);
      expect(record.revocationReason).to.equal("Failed audit");
      expect(record.revokedAt).to.be.greaterThan(0);
    });

    it("should reject revocation of non-existent document", async function () {
      await expect(
        registry.revokeDocument(TEST_HASH_2, "Does not exist")
      ).to.be.revertedWithCustomError(registry, "DocumentNotFound");
    });

    it("should reject double revocation", async function () {
      await registry.revokeDocument(TEST_HASH, "First revocation");

      await expect(
        registry.revokeDocument(TEST_HASH, "Second revocation")
      ).to.be.revertedWithCustomError(registry, "DocumentAlreadyRevoked");
    });

    it("should reject revocation by non-owner", async function () {
      await expect(
        registry
          .connect(authorized)
          .revokeDocument(TEST_HASH, "Unauthorized revoke")
      ).to.be.revertedWithCustomError(registry, "OnlyOwner");
    });
  });

  // ── Access Control ─────────────────────────────────────────

  describe("Access Control", function () {
    it("should add an authorized caller", async function () {
      const [, , , newCaller] = await ethers.getSigners();
      await registry.addAuthorizedCaller(newCaller.address);
      expect(await registry.authorizedCallers(newCaller.address)).to.be.true;
    });

    it("should remove an authorized caller", async function () {
      await registry.removeAuthorizedCaller(authorized.address);
      expect(await registry.authorizedCallers(authorized.address)).to.be.false;
    });

    it("should emit events on add/remove", async function () {
      const [, , , newCaller] = await ethers.getSigners();

      await expect(registry.addAuthorizedCaller(newCaller.address))
        .to.emit(registry, "AuthorizedCallerAdded")
        .withArgs(newCaller.address);

      await expect(registry.removeAuthorizedCaller(newCaller.address))
        .to.emit(registry, "AuthorizedCallerRemoved")
        .withArgs(newCaller.address);
    });

    it("should reject add/remove by non-owner", async function () {
      const [, , , newCaller] = await ethers.getSigners();

      await expect(
        registry.connect(authorized).addAuthorizedCaller(newCaller.address)
      ).to.be.revertedWithCustomError(registry, "OnlyOwner");

      await expect(
        registry.connect(authorized).removeAuthorizedCaller(owner.address)
      ).to.be.revertedWithCustomError(registry, "OnlyOwner");
    });
  });

  // ── Ownership Transfer ─────────────────────────────────────

  describe("transferOwnership", function () {
    it("should transfer ownership", async function () {
      await registry.transferOwnership(authorized.address);
      expect(await registry.owner()).to.equal(authorized.address);
    });

    it("should emit OwnershipTransferred event", async function () {
      await expect(registry.transferOwnership(authorized.address))
        .to.emit(registry, "OwnershipTransferred")
        .withArgs(owner.address, authorized.address);
    });

    it("should reject transfer to zero address", async function () {
      await expect(
        registry.transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWith("New owner cannot be zero address");
    });

    it("should reject transfer by non-owner", async function () {
      await expect(
        registry.connect(unauthorized).transferOwnership(unauthorized.address)
      ).to.be.revertedWithCustomError(registry, "OnlyOwner");
    });
  });
});
