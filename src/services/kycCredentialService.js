"use strict";

const KycCredential = require("../models/KycCredential");
const crypto = require("crypto");

class KycCredentialService {
  /**
   * Generates a unique credential ID, e.g. TV-2026-ABCD1234
   */
  generateCredentialId() {
    const year = new Date().getFullYear();
    const randomStr = crypto.randomBytes(4).toString("hex").toUpperCase();
    return `TV-${year}-${randomStr}`;
  }

  /**
   * Creates or updates a KYC credential for a user.
   * @param {string} userId - User ID
   * @param {boolean} kycVerified - Overall verification status
   * @param {Object} rawKycData - The raw KYC data for selective disclosure
   */
  async createOrUpdateCredential(userId, kycVerified, rawKycData = {}) {
    let credential = await KycCredential.findOne({ user: userId });

    if (!credential) {
      credential = new KycCredential({
        user: userId,
        credentialId: this.generateCredentialId(),
        kycVerified,
        verificationData: rawKycData,
        issuedAt: new Date(),
        expiresAt: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // 1 year validity by default
      });
    } else {
      credential.kycVerified = kycVerified;
      credential.verificationData = rawKycData;
      credential.issuedAt = new Date();
      credential.expiresAt = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
    }

    await credential.save();
    return credential;
  }

  /**
   * Gets only the credential status.
   * @param {string} userId - User ID
   */
  async getCredentialStatus(userId) {
    const credential = await KycCredential.findOne({ user: userId });
    if (!credential) {
      return null;
    }
    // Only return the requested JSON format
    return {
      kycVerified: credential.kycVerified,
      credentialId: credential.credentialId,
    };
  }

  /**
   * Discloses selected fields from verificationData.
   * @param {string} userId - User ID
   * @param {Array<string>} requestedFields - List of fields to disclose
   */
  async discloseFields(userId, requestedFields) {
    // We must select verificationData explicitly since it's select: false in schema
    const credential = await KycCredential.findOne({ user: userId }).select("+verificationData");
    if (!credential) {
      throw new Error("Credential not found");
    }

    const disclosedData = {};
    if (credential.verificationData && Array.isArray(requestedFields)) {
      for (const field of requestedFields) {
        if (credential.verificationData[field] !== undefined) {
          disclosedData[field] = credential.verificationData[field];
        }
      }
    }

    return {
      kycVerified: credential.kycVerified,
      credentialId: credential.credentialId,
      disclosedData,
    };
  }
}

module.exports = new KycCredentialService();
