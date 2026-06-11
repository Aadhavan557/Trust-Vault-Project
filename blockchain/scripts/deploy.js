/**
 * Deployment script — TrustVault DocumentRegistry
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network localhost
 *   npx hardhat run scripts/deploy.js --network sepolia
 *
 * Outputs:
 *   • Console log of deployed address
 *   • JSON file in deployments/<networkName>.json for the integration service
 */

const { ethers, network } = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  TrustVault — DocumentRegistry Deployment");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Network:  ${network.name}`);
  console.log(`  Chain ID: ${network.config.chainId || "auto"}`);
  console.log("");

  // ── Get deployer ──────────────────────────────────────────
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Balance:  ${ethers.formatEther(balance)} ETH`);
  console.log("");

  // ── Deploy contract ───────────────────────────────────────
  console.log("  Deploying DocumentRegistry...");
  const DocumentRegistry = await ethers.getContractFactory("DocumentRegistry");
  const registry = await DocumentRegistry.deploy();
  await registry.waitForDeployment();

  const contractAddress = await registry.getAddress();
  console.log(`  ✓ Deployed at: ${contractAddress}`);
  console.log("");

  // ── Verify deployer is authorised ─────────────────────────
  const isAuthorized = await registry.authorizedCallers(deployer.address);
  console.log(`  Deployer authorized: ${isAuthorized}`);

  // ── Save deployment info ──────────────────────────────────
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentInfo = {
    network:         network.name,
    chainId:         network.config.chainId || 31337,
    contractAddress: contractAddress,
    deployer:        deployer.address,
    deployedAt:      new Date().toISOString(),
    blockNumber:     await ethers.provider.getBlockNumber(),
    transactionHash: registry.deploymentTransaction()?.hash || null,
  };

  const outPath = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`  ✓ Deployment info saved to: ${outPath}`);

  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Deployment complete!");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
  console.log("  Next steps:");
  console.log(`  1. Set BLOCKCHAIN_CONTRACT_ADDRESS=${contractAddress} in .env`);
  console.log("  2. Set BLOCKCHAIN_ENABLED=true in .env");
  console.log("  3. Restart the TrustVault backend");
  console.log("");

  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
