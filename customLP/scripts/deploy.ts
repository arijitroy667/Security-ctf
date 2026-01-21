import { ethers } from "hardhat";

/**
 * Schrodinger Pool CTF - Deployment Script
 * 
 * Deploys:
 * 1. MockERC20 (Token0 - ALPHA)
 * 2. MockERC20 (Token1 - BETA)
 * 3. SchrodingerPool - The vulnerable LP
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("═".repeat(60));
  console.log("      🐱 Schrodinger Pool CTF - Epoch K-Value Exploit");
  console.log("═".repeat(60));
  console.log("\n[INFO] Deploying with account:", deployer.address);
  console.log("[INFO] Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens each

  // Deploy Token0 (ALPHA)
  console.log("[1/3] Deploying Token0 (ALPHA)...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const token0 = await MockERC20.deploy("Alpha Token", "ALPHA", INITIAL_SUPPLY);
  await token0.waitForDeployment();
  const token0Address = await token0.getAddress();
  console.log("      ✅ ALPHA Token deployed to:", token0Address);

  // Deploy Token1 (BETA)
  console.log("\n[2/3] Deploying Token1 (BETA)...");
  const token1 = await MockERC20.deploy("Beta Token", "BETA", INITIAL_SUPPLY);
  await token1.waitForDeployment();
  const token1Address = await token1.getAddress();
  console.log("      ✅ BETA Token deployed to:", token1Address);

  // Deploy SchrodingerPool
  console.log("\n[3/3] Deploying SchrodingerPool...");
  const SchrodingerPool = await ethers.getContractFactory("SchrodingerPool");
  const pool = await SchrodingerPool.deploy(token0Address, token1Address);
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();
  console.log("      ✅ SchrodingerPool deployed to:", poolAddress);

  // Add initial liquidity
  console.log("\n[SETUP] Adding initial liquidity...");
  const liquidityAmount = ethers.parseEther("100000"); // 100k each
  
  await token0.approve(poolAddress, liquidityAmount);
  await token1.approve(poolAddress, liquidityAmount);
  await pool.mint(deployer.address, liquidityAmount, liquidityAmount);
  
  const [reserve0, reserve1, epoch] = await pool.getReserves();
  console.log("      ✅ Initial Reserves: ALPHA =", ethers.formatEther(reserve0), "| BETA =", ethers.formatEther(reserve1));
  console.log("      ✅ Current Epoch:", epoch.toString());

  // Deployment Summary
  console.log("\n" + "═".repeat(60));
  console.log("                    📋 DEPLOYMENT SUMMARY");
  console.log("═".repeat(60));
  console.log("\n  Contract Addresses:");
  console.log("  ─────────────────────────────────────────────────────");
  console.log("  ALPHA Token:       ", token0Address);
  console.log("  BETA Token:        ", token1Address);
  console.log("  SchrodingerPool:   ", poolAddress);
  
  console.log("\n  Pool State:");
  console.log("  ─────────────────────────────────────────────────────");
  console.log("  Reserve0 (ALPHA): ", ethers.formatEther(reserve0));
  console.log("  Reserve1 (BETA):  ", ethers.formatEther(reserve1));
  console.log("  Total Supply:     ", ethers.formatEther(await pool.totalSupply()));
  console.log("  LP Balance:       ", ethers.formatEther(await pool.balanceOf(deployer.address)));
  console.log("  Current Epoch:    ", epoch.toString());

  console.log("\n  🔥 VULNERABILITY:");
  console.log("  ─────────────────────────────────────────────────────");
  console.log("  1. Epoch-Based K Validation: Swaps validate against");
  console.log("     the PREVIOUS epoch's liquidity snapshot, not current");
  console.log("  2. Attackers can exploit the gap between epochs");
  console.log("  3. Additionally, a 0.5% decay on burns creates arbitrage");

  console.log("\n" + "═".repeat(60));
  console.log("               ✅ Deployment Complete!");
  console.log("═".repeat(60) + "\n");

  return { token0: token0Address, token1: token1Address, pool: poolAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
