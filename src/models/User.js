/**
 * User model — core identity entity in TrustVault.
 *
 * Fields:
 *   fullName, email, password, phone, role, kycStatus,
 *   isEmailVerified, refreshToken, lastLogin, createdAt, updatedAt.
 *
 * Hooks:
 *   • pre-save: hash password with bcrypt when modified.
 *
 * Instance methods:
 *   • comparePassword(candidate) → boolean
 *   • generateAccessToken() → signed JWT (short-lived)
 *   • generateRefreshToken() → signed JWT (long-lived, stored in DB)
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,                              // creates the index — no need for separate index()
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,                             // never returned by default in queries
    },

    phone: {
      type: String,
      trim: true,
      default: null,
    },

    role: {
      type: String,
      enum: ["user", "admin", "verifier"],
      default: "user",
    },

    kycStatus: {
      type: String,
      enum: ["not_started", "pending", "verified", "rejected"],
      default: "not_started",
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    refreshToken: {
      type: String,
      select: false,                             // only fetched explicitly
      default: null,
    },

    lastLogin: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,                            // createdAt + updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes (email index is already created by `unique: true`) ──
userSchema.index({ kycStatus: 1 });

// ── Hash password before save ───────────────────────────────
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Compare candidate password ──────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ── Generate short-lived Access Token ───────────────────────
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { id: this._id, role: this.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }            // e.g. "15m"
  );
};

// ── Generate long-lived Refresh Token ───────────────────────
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { id: this._id },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshExpiresIn }      // e.g. "7d"
  );
};

module.exports = mongoose.model("User", userSchema);
