/**
 * JWT authentication middleware.
 *
 * ── protect ──
 * Verifies the Bearer token from the Authorization header,
 * looks up the user in the database, and attaches `req.user`.
 * Rejects with 401 if the token is missing, invalid, or the user no longer exists.
 *
 * ── authorize ──
 * Role-based access control. Accepts one or more role strings
 * and returns 403 if `req.user.role` is not in the allowed list.
 */

const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");

// ── Protect route — require valid JWT ───────────────────────
const protect = catchAsync(async (req, _res, next) => {
  let token;

  // Accept: Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    throw ApiError.unauthorized("Not authenticated — no token provided");
  }

  // Verify token
  const decoded = jwt.verify(token, config.jwtSecret);

  // Ensure the user still exists
  const user = await User.findById(decoded.id).select("-password");
  if (!user) {
    throw ApiError.unauthorized("User belonging to this token no longer exists");
  }

  req.user = user;
  next();
});

// ── Authorize by role(s) ────────────────────────────────────
const authorize = (...roles) => {
  return (req, _res, next) => {
    if (!roles.includes(req.user.role)) {
      throw ApiError.forbidden(
        `Role '${req.user.role}' is not authorised to access this resource`
      );
    }
    next();
  };
};

module.exports = { protect, authorize };
