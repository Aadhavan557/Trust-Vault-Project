/**
 * Verification routes — TrustVault
 * Proxies media to the Python CV microservice.
 */

"use strict";

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { protect } = require("../middlewares/auth");
const verificationController = require("../controllers/verificationController");
const ApiError = require("../utils/ApiError");

// Configure a temporary multer storage for verification files
// These files are deleted immediately after the CV service processes them
const TEMP_UPLOAD_DIR = path.resolve(process.cwd(), "uploads/temp_verification");
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
    fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}

const tempStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, TEMP_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const verificationUpload = multer({
    storage: tempStorage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit for verification videos
    }
});

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

router.post(
    "/deepfake",
    protect,
    verificationUpload.single("image"),
    verificationController.checkDeepfake
);

router.post(
    "/liveness",
    protect,
    verificationUpload.single("video"),
    verificationController.checkLiveness
);

router.post(
    "/rppg",
    protect,
    verificationUpload.single("video"),
    verificationController.checkRppg
);

router.post(
    "/noise",
    protect,
    verificationUpload.single("image"),
    verificationController.checkNoise
);

module.exports = router;
