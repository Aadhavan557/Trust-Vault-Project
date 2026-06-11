"use strict";

const qrService = require("../services/qrService");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const catchAsync = require("../utils/catchAsync");

/**
 * Generate a new QR code for a specific credential.
 * POST /api/v1/qr/generate
 */
const generate = catchAsync(async (req, res) => {
    const { credentialId, expiresInMinutes } = req.body;

    if (!credentialId) {
        throw ApiError.badRequest("credentialId is required.");
    }

    // Generate the QR data including the image and verification URL
    const qrData = await qrService.generateQr(credentialId, expiresInMinutes);

    ApiResponse.created(qrData, "QR Code generated successfully").send(res);
});

/**
 * Verify a QR code token.
 * GET /api/v1/qr/verify/:token
 */
const verify = catchAsync(async (req, res) => {
    const { token } = req.params;

    if (!token) {
        throw ApiError.badRequest("Token is required.");
    }

    try {
        const result = await qrService.verifyQrToken(token);
        ApiResponse.ok(result, "QR Code verified successfully").send(res);
    } catch (error) {
        throw ApiError.badRequest(error.message);
    }
});

module.exports = {
    generate,
    verify
};
