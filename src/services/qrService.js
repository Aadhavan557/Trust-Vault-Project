"use strict";

const QrCode = require("../models/QrCode");
const crypto = require("crypto");
const qrcode = require("qrcode");

class QrService {
  /**
   * Generates a new QR code for a credential.
   * @param {string} credentialId - The ID of the KYC credential
   * @param {number} expiresInMinutes - Expiry time in minutes
   */
  async generateQr(credentialId, expiresInMinutes = 60) {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60000);

    const qrRecord = new QrCode({
      credentialId,
      token,
      expiresAt,
    });

    await qrRecord.save();

    // Generate Verification URL. 
    // Usually points to a frontend verification page, but here we point to the public API for the backend result.
    const baseUrl = process.env.BASE_URL || "https://trustvault.com";
    const verificationUrl = `${baseUrl}/api/v1/qr/verify/${token}`;

    // Generate Base64 Image
    const qrImage = await qrcode.toDataURL(verificationUrl);

    return {
      qrImage,
      verificationUrl,
      expiresAt,
    };
  }

  /**
   * Verifies a QR token.
   * @param {string} token - The unique token embedded in the QR
   */
  async verifyQrToken(token) {
    const qrRecord = await QrCode.findOne({ token });

    if (!qrRecord) {
      throw new Error("Invalid or expired QR code.");
    }

    if (!qrRecord.isActive) {
      throw new Error("This QR code has been revoked or is no longer active.");
    }

    if (new Date() > qrRecord.expiresAt) {
      throw new Error("This QR code has expired.");
    }

    // Since token is valid, fetch the underlying KYC Credential using credentialId
    const KycCredential = require("../models/KycCredential");
    const credential = await KycCredential.findOne({ credentialId: qrRecord.credentialId });

    if (!credential) {
      throw new Error("Associated KYC credential not found.");
    }

    // Return selective details for the scanner
    return {
      credentialId: credential.credentialId,
      kycVerified: credential.kycVerified,
      issuedAt: credential.issuedAt,
    };
  }
}

module.exports = new QrService();
