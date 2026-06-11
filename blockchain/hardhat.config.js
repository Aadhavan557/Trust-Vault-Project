/**
 * Hardhat configuration — TrustVault Blockchain
 *
 * Networks:
 *   • hardhat  — in-process ephemeral chain (default for tests)
 *   • localhost — persistent local node (npx hardhat node)
 *   • sepolia  — Ethereum Sepolia testnet
 *   • mainnet  — Ethereum mainnet (use with extreme caution)
 */

require("dotenv").config({ path: "../.env" });
require("@nomicfoundation/hardhat-toolbox");

const PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY || "0x" + "0".repeat(64);
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || "";
const MAINNET_RPC = process.env.MAINNET_RPC_URL || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "paris",
    },
  },

  networks: {
    // Default in-process chain for `hardhat test`
    hardhat: {
      chainId: 31337,
    },

    // Local persistent node: start with `npx hardhat node`
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },

    // Sepolia testnet
    ...(SEPOLIA_RPC && {
      sepolia: {
        url: SEPOLIA_RPC,
        accounts: [PRIVATE_KEY],
        chainId: 11155111,
      },
    }),

    // Ethereum mainnet
    ...(MAINNET_RPC && {
      mainnet: {
        url: MAINNET_RPC,
        accounts: [PRIVATE_KEY],
        chainId: 1,
      },
    }),
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
