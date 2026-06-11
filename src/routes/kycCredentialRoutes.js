"use strict";

const express = require("express");
const router = express.Router();
const kycCredentialController = require("../controllers/kycCredentialController");
const { protect } = require("../middlewares/auth");

// All credential routes require an authenticated user
router.use(protect);

router.post("/generate", kycCredentialController.generateCredential);
router.get("/status", kycCredentialController.getStatus);
router.post("/disclose", kycCredentialController.disclose);

module.exports = router;
