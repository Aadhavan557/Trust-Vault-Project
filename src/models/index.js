/**
 * Models barrel export.
 * Import all models from a single path:
 *   const { User, KycDocument, Document } = require("../models");
 */

const User = require("./User");
const KycDocument = require("./KycDocument");
const { Document, DOCUMENT_TYPES, DOCUMENT_STATUS } = require("./Document");

module.exports = { User, KycDocument, Document, DOCUMENT_TYPES, DOCUMENT_STATUS };

