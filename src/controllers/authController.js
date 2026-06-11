/**
 * Auth controller — complete authentication lifecycle.
 *
 * Endpoints:
 *   POST /register        — create account, return access + refresh tokens
 *   POST /login           — authenticate, return access + refresh tokens
 *   POST /refresh-token   — exchange refresh token for new access token
 *   POST /logout          — invalidate refresh token
 *   GET  /me              — get current user's profile
 *   PUT  /update-profile  — update name, phone, email
 *   PUT  /change-password — change password (requires current password)
 */

const jwt = require("jsonwebtoken");
const User = require("../models/User");
const config = require("../config");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const catchAsync = require("../utils/catchAsync");

// ── Helper: generate both tokens and persist refresh token ──
const generateTokens = async (user) => {
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  // Store hashed refresh token in DB
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  return { accessToken, refreshToken };
};

// ── Helper: sanitise user for response ──────────────────────
const sanitiseUser = (user) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  kycStatus: user.kycStatus,
  isEmailVerified: user.isEmailVerified,
  lastLogin: user.lastLogin,
  createdAt: user.createdAt,
});

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user
 * @access  Public
 */
const register = catchAsync(async (req, res) => {
  const { fullName, email, password, phone } = req.body;

  // Check if the email is already taken
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw ApiError.conflict("A user with this email already exists");
  }

  // Create user (password is hashed via pre-save hook)
  const user = await User.create({ fullName, email, password, phone });

  // Generate token pair
  const { accessToken, refreshToken } = await generateTokens(user);

  ApiResponse.created(
    {
      user: sanitiseUser(user),
      accessToken,
      refreshToken,
    },
    "User registered successfully"
  ).send(res);
});

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user & return tokens
 * @access  Public
 */
const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  // Explicitly select password (excluded by default)
  const user = await User.findOne({ email }).select("+password");

  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  // Update last login timestamp
  user.lastLogin = new Date();

  // Generate token pair (also saves refreshToken + lastLogin)
  const { accessToken, refreshToken } = await generateTokens(user);

  ApiResponse.ok(
    {
      user: sanitiseUser(user),
      accessToken,
      refreshToken,
    },
    "Logged in successfully"
  ).send(res);
});

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Exchange a valid refresh token for a new access token
 * @access  Public (but requires valid refresh token)
 */
const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken: incomingToken } = req.body;

  if (!incomingToken) {
    throw ApiError.badRequest("Refresh token is required");
  }

  // Verify the refresh token signature
  let decoded;
  try {
    decoded = jwt.verify(incomingToken, config.jwtRefreshSecret);
  } catch (err) {
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  // Find user and verify stored refresh token matches
  const user = await User.findById(decoded.id).select("+refreshToken");
  if (!user || user.refreshToken !== incomingToken) {
    throw ApiError.unauthorized("Refresh token is invalid or has been revoked");
  }

  // Issue new token pair (rotate refresh token for security)
  const { accessToken, refreshToken: newRefreshToken } = await generateTokens(user);

  ApiResponse.ok(
    {
      accessToken,
      refreshToken: newRefreshToken,
    },
    "Tokens refreshed successfully"
  ).send(res);
});

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Invalidate the user's refresh token
 * @access  Private (requires JWT)
 */
const logout = catchAsync(async (req, res) => {
  // Clear the stored refresh token
  await User.findByIdAndUpdate(req.user._id, { refreshToken: null });

  ApiResponse.ok(null, "Logged out successfully").send(res);
});

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current authenticated user's profile
 * @access  Private (requires JWT)
 */
const getMe = catchAsync(async (req, res) => {
  // req.user is set by the protect middleware
  ApiResponse.ok(sanitiseUser(req.user), "User profile retrieved").send(res);
});

/**
 * @route   PUT /api/v1/auth/update-profile
 * @desc    Update the authenticated user's profile (name, phone, email)
 * @access  Private (requires JWT)
 */
const updateProfile = catchAsync(async (req, res) => {
  const { fullName, phone, email } = req.body;
  const updates = {};

  if (fullName !== undefined) updates.fullName = fullName;
  if (phone !== undefined) updates.phone = phone;

  // If changing email, check uniqueness
  if (email !== undefined && email !== req.user.email) {
    const emailTaken = await User.findOne({ email });
    if (emailTaken) {
      throw ApiError.conflict("This email is already in use");
    }
    updates.email = email;
    updates.isEmailVerified = false; // re-verification required
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  ApiResponse.ok(sanitiseUser(user), "Profile updated successfully").send(res);
});

/**
 * @route   PUT /api/v1/auth/change-password
 * @desc    Change password (requires current password confirmation)
 * @access  Private (requires JWT)
 */
const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Fetch user with password
  const user = await User.findById(req.user._id).select("+password");

  // Verify current password
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw ApiError.unauthorized("Current password is incorrect");
  }

  // Update password (pre-save hook will hash it)
  user.password = newPassword;
  // Invalidate existing refresh token (force re-login on other devices)
  user.refreshToken = null;
  await user.save();

  // Issue fresh tokens for the current session
  const { accessToken, refreshToken: newRefreshToken } = await generateTokens(user);

  ApiResponse.ok(
    {
      accessToken,
      refreshToken: newRefreshToken,
    },
    "Password changed successfully"
  ).send(res);
});

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  updateProfile,
  changePassword,
};
