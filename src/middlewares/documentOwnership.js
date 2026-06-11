/**
 * Document ownership middleware — TrustVault
 *
 * Enforces that only the owner of a document can modify or delete it.
 * Admins bypass the ownership check by default.
 *
 * Usage:
 *   router.patch("/:id", protect, requireDocumentOwnership, controller.update);
 *
 * Behaviour:
 *   1. Fetches the document by :id from the database.
 *   2. If not found → 404.
 *   3. If requester is admin → skip ownership check (proceed).
 *   4. If requester is NOT the owner → 403.
 *   5. If owner → attaches `req.document` to avoid a second DB query in the controller.
 */

"use strict";

const { Document } = require("../models/Document");
const ApiError     = require("../utils/ApiError");
const catchAsync   = require("../utils/catchAsync");

/**
 * Middleware that loads req.document and verifies ownership.
 * Requires `protect` to have run first (sets req.user).
 */
const requireDocumentOwnership = catchAsync(async (req, _res, next) => {
  const documentId = req.params.id;

  const document = await Document.findById(documentId);

  if (!document) {
    throw ApiError.notFound("Document not found");
  }

  // Admins have full access
  if (req.user.role === "admin") {
    req.document = document;
    return next();
  }

  // Ownership check: compare ObjectId strings
  if (document.owner.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden("You are not authorised to modify this document");
  }

  // Attach to request so controllers don't re-fetch
  req.document = document;
  next();
});

module.exports = { requireDocumentOwnership };
