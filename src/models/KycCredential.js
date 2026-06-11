const mongoose = require("mongoose");

const kycCredentialSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
      index: true,
    },
    credentialId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    kycVerified: {
      type: Boolean,
      default: false,
    },
    verificationData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      select: false, // Hidden by default for data minimization
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.__v;
        // Ensure sensitive fields are not returned by default
        delete ret.verificationData;
        delete ret.user;
        return ret;
      },
    },
  }
);

module.exports = mongoose.model("KycCredential", kycCredentialSchema);
