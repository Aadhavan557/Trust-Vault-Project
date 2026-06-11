/**
 * Auth routes — complete authentication lifecycle.
 *
 * Public:
 *   POST /register       — create a new user account
 *   POST /login          — authenticate and receive token pair
 *   POST /refresh-token  — exchange refresh token for new access token
 *
 * Private (JWT required):
 *   POST /logout          — invalidate refresh token
 *   GET  /me              — get authenticated user's profile
 *   PUT  /update-profile  — update name, phone, email
 *   PUT  /change-password — change password
 */

const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const { protect } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const {
  registerRules,
  loginRules,
  refreshTokenRules,
  updateProfileRules,
  changePasswordRules,
} = require("../validators/authValidator");

// ── Public routes ───────────────────────────────────────────
router.post("/register", registerRules, validate, authController.register);
router.post("/login", loginRules, validate, authController.login);
router.post("/refresh-token", refreshTokenRules, validate, authController.refreshToken);

// ── Private routes (JWT required) ───────────────────────────
router.post("/logout", protect, authController.logout);
router.get("/me", protect, authController.getMe);
router.put("/update-profile", protect, updateProfileRules, validate, authController.updateProfile);
router.put("/change-password", protect, changePasswordRules, validate, authController.changePassword);

module.exports = router;
