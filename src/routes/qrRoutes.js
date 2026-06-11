"use strict";

const express = require("express");
const router = express.Router();
const qrController = require("../controllers/qrController");
const { protect } = require("../middlewares/auth");

// Public route for verifying a QR code (so third parties can scan it)
router.get("/verify/:token", qrController.verify);

// Protected routes (require user login)
router.use(protect);

// Generate a new QR code for a credential
router.post("/generate", qrController.generate);

module.exports = router;
