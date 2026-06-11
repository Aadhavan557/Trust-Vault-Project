/**
 * Verification controller — TrustVault
 * Proxies requests to the Python CV microservice and handles the results.
 */

"use strict";

const fs = require("fs");
const CvServiceClient = require("../utils/cvServiceClient");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const catchAsync = require("../utils/catchAsync");
const logger = require("../utils/logger");

/**
 * Safely delete a file if it exists.
 */
function safeUnlink(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            logger.warn(`Failed to clean up verification temp file: ${filePath}`);
        }
    }
}

// ─────────────────────────────────────────────────────────────
// POST /deepfake
// ─────────────────────────────────────────────────────────────
const checkDeepfake = catchAsync(async (req, res) => {
    if (!req.file) {
        throw ApiError.badRequest("No image provided for deepfake analysis");
    }

    try {
        const { threshold } = req.body;
        const result = await CvServiceClient.detectDeepfake(req.file, threshold);
        
        // In a real system, you might save this result to a Verification model in MongoDB here.
        
        ApiResponse.ok(result, "Deepfake analysis completed").send(res);
    } finally {
        safeUnlink(req.file.path);
    }
});

// ─────────────────────────────────────────────────────────────
// POST /liveness
// ─────────────────────────────────────────────────────────────
const checkLiveness = catchAsync(async (req, res) => {
    if (!req.file) {
        throw ApiError.badRequest("No video provided for liveness analysis");
    }

    try {
        const { challenges } = req.body;
        const result = await CvServiceClient.detectLiveness(req.file, challenges);
        
        ApiResponse.ok(result, "Liveness analysis completed").send(res);
    } finally {
        safeUnlink(req.file.path);
    }
});

// ─────────────────────────────────────────────────────────────
// POST /rppg
// ─────────────────────────────────────────────────────────────
const checkRppg = catchAsync(async (req, res) => {
    if (!req.file) {
        throw ApiError.badRequest("No video provided for rPPG analysis");
    }

    try {
        const { fps } = req.body;
        const result = await CvServiceClient.detectRppg(req.file, fps);
        
        ApiResponse.ok(result, "rPPG analysis completed").send(res);
    } finally {
        safeUnlink(req.file.path);
    }
});

// ─────────────────────────────────────────────────────────────
// POST /noise
// ─────────────────────────────────────────────────────────────
const checkNoise = catchAsync(async (req, res) => {
    if (!req.file) {
        throw ApiError.badRequest("No image provided for noise analysis");
    }

    try {
        const { threshold } = req.body;
        const result = await CvServiceClient.detectNoise(req.file, threshold);
        
        ApiResponse.ok(result, "Noise analysis completed").send(res);
    } finally {
        safeUnlink(req.file.path);
    }
});

module.exports = {
    checkDeepfake,
    checkLiveness,
    checkRppg,
    checkNoise
};
