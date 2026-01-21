import { ethers } from "hardhat";

/**
 * Crypto Mixer CTF - Deployment Script
 * 
 * Deploys:
 * 1. TimingVulnerableMixer - The vulnerable mixer
 * 2. TimingAnalyzer - The exploit analyzer
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("═".repeat(60));
  console.log("   🔒 Crypto Mixer CTF - Timing Analysis Vulnerability");
  console.log("═".repeat(60));
  console.log("\n[INFO] Deploying with account:", deployer.address);
  console.log("[INFO] Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Deploy TimingVulnerableMixer
  console.log("[1/2] Deploying TimingVulnerableMixer...");
  const TimingVulnerableMixer = await ethers.getContractFactory("TimingVulnerableMixer");
  const mixer = await TimingVulnerableMixer.deploy();
  await mixer.waitForDeployment();
  const mixerAddress = await mixer.getAddress();
  console.log("      ✅ TimingVulnerableMixer deployed to:", mixerAddress);

  // Deploy TimingAnalyzer
  console.log("\n[2/2] Deploying TimingAnalyzer...");
  const TimingAnalyzer = await ethers.getContractFactory("TimingAnalyzer");
  const analyzer = await TimingAnalyzer.deploy(mixerAddress);
  await analyzer.waitForDeployment();
  const analyzerAddress = await analyzer.getAddress();
  console.log("      ✅ TimingAnalyzer deployed to:", analyzerAddress);

  // Deployment Summary
  console.log("\n" + "═".repeat(60));
  console.log("                    📋 DEPLOYMENT SUMMARY");
  console.log("═".repeat(60));
  console.log("\n  Contract Addresses:");
  console.log("  ─────────────────────────────────────────────────────");
  console.log("  TimingVulnerableMixer:", mixerAddress);
  console.log("  TimingAnalyzer:       ", analyzerAddress);
  
  console.log("\n  🔥 VULNERABILITY:");
  console.log("  ─────────────────────────────────────────────────────");
  console.log("  The mixer does not enforce minimum anonymity set size.");
  console.log("  When a withdrawal occurs in a block with only one tx,");
  console.log("  timing analysis can trace the depositor-to-withdrawer");
  console.log("  link, defeating the mixer's privacy guarantees.");

  console.log("\n" + "═".repeat(60));
  console.log("               ✅ Deployment Complete!");
  console.log("═".repeat(60) + "\n");

  return { mixer: mixerAddress, analyzer: analyzerAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
