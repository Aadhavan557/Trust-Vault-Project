/**
 * Request validation middleware using express-validator.
 *
 * Usage:
 *   router.post("/register", registerRules, validate, authController.register);
 *
 * If any validation errors exist, a 400 ApiError is thrown
 * with the array of field-level error messages.
 */

const { validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

const validate = (req, _res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const extracted = errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
    }));
    throw ApiError.badRequest("Validation failed", extracted);
  }

  next();
};

module.exports = validate;
