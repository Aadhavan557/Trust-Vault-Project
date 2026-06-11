"use strict";

const kycCredentialService = require("../services/kycCredentialService");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const catchAsync = require("../utils/catchAsync");

/**
 * Generate or update a KYC credential.
 * POST /api/credentials/generate
 */
const generateCredential = catchAsync(async (req, res) => {
    // For demonstration, we allow passing raw data and status in the body.
    // In production, this would securely pull from verified KYC Documents and ML services.
    const { kycVerified = true, rawKycData = {} } = req.body;
    const userId = req.user._id;

    await kycCredentialService.createOrUpdateCredential(userId, kycVerified, rawKycData);
    
    // Return only the verified status and credential ID as per requirement
    const status = await kycCredentialService.getCredentialStatus(userId);
    
    ApiResponse.created(status, "KYC Credential generated successfully").send(res);
});

/**
 * Get credential status.
 * GET /api/credentials/status
 */
const getStatus = catchAsync(async (req, res) => {
    const userId = req.user._id;
    const status = await kycCredentialService.getCredentialStatus(userId);

    if (!status) {
        throw ApiError.notFound("No KYC credential found for this user");
    }

    ApiResponse.ok(status, "Credential status retrieved").send(res);
});

/**
 * Selectively disclose fields from the KYC credential.
 * POST /api/credentials/disclose
 */
const disclose = catchAsync(async (req, res) => {
    const { requestedFields } = req.body;
    const userId = req.user._id;

    if (!Array.isArray(requestedFields)) {
        throw ApiError.badRequest("requestedFields must be an array of strings");
    }

    try {
        const disclosedInfo = await kycCredentialService.discloseFields(userId, requestedFields);
        ApiResponse.ok(disclosedInfo, "Selective disclosure successful").send(res);
    } catch (error) {
        throw ApiError.notFound(error.message);
    }
});

module.exports = {
    generateCredential,
    getStatus,
    disclose
};
