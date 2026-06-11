/**
 * Centralised config object.
 * Every env var is read once, validated, and exported from here
 * so the rest of the app never touches `process.env` directly.
 */

module.exports = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT, 10) || 5000,

  // MongoDB
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/trustvault",

  // JWT — Access Token
  jwtSecret: process.env.JWT_SECRET || "fallback_secret_do_not_use",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "15m",

  // JWT — Refresh Token
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "fallback_refresh_secret_do_not_use",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || "*",

  // Rate limiter
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 min
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,

  // CV Microservice
  cvServiceUrl: process.env.CV_SERVICE_URL || "http://localhost:8000/api/v1/detect",

  // Blockchain
  blockchainRpcUrl:       process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545",
  blockchainPrivateKey:   process.env.BLOCKCHAIN_PRIVATE_KEY || "",
  blockchainContractAddr: process.env.BLOCKCHAIN_CONTRACT_ADDRESS || "",
  blockchainNetworkName:  process.env.BLOCKCHAIN_NETWORK_NAME || "hardhat",
  blockchainEnabled:      process.env.BLOCKCHAIN_ENABLED === "true",
};
