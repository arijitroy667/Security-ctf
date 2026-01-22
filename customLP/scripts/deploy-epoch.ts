import { ethers } from "hardhat";

/**
 * EpochLP CTF - Deployment Script
 * 
 * Deploys:
 * 1. MockERC20 (TokenA - ALPHA)
 * 2. MockERC20 (TokenB - BETA)  
 * 3. EpochLP - The vulnerable LP with epoch desynchronization
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("═".repeat(60));
  console.log("      🎯 EpochLP CTF - Epoch Desynchronization Exploit");
  console.log("═".repeat(60));
  console.log("\n[INFO] Deploying with account:", deployer.address);
  console.log("[INFO] Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens each

  // Deploy TokenA (ALPHA)
  console.log("[1/3] Deploying TokenA (ALPHA)...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const tokenA = await MockERC20.deploy("Alpha Token", "ALPHA", INITIAL_SUPPLY);
  await tokenA.waitForDeployment();
  const tokenAAddress = await tokenA.getAddress();
  console.log("      ✅ ALPHA Token deployed to:", tokenAAddress);

  // Deploy TokenB (BETA)
  console.log("\n[2/3] Deploying TokenB (BETA)...");
  const tokenB = await MockERC20.deploy("Beta Token", "BETA", INITIAL_SUPPLY);
  await tokenB.waitForDeployment();
  const tokenBAddress = await tokenB.getAddress();
  console.log("      ✅ BETA Token deployed to:", tokenBAddress);

  // Deploy EpochLP
  console.log("\n[3/3] Deploying EpochLP...");
  const EpochLP = await ethers.getContractFactory("EpochLP");
  const pool = await EpochLP.deploy(tokenAAddress, tokenBAddress, "EpochLP", "ELP");
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();
  console.log("      ✅ EpochLP deployed to:", poolAddress);

  // Add initial liquidity
  console.log("\n[SETUP] Adding initial liquidity...");
  const liquidityAmount = ethers.parseEther("100000"); // 100k each
  
  await tokenA.approve(poolAddress, liquidityAmount);
  await tokenB.approve(poolAddress, liquidityAmount);
  await pool.addLiquidity(liquidityAmount, liquidityAmount);
  
  const [reserveA, reserveB] = await pool.getCurrentReserves();
  const currentEpoch = await pool.currentEpoch();
  console.log("      ✅ Initial Reserves: ALPHA =", ethers.formatEther(reserveA), "| BETA =", ethers.formatEther(reserveB));
  console.log("      ✅ Current Epoch:", currentEpoch.toString());

  // Deployment Summary
  console.log("\n" + "═".repeat(60));
  console.log("                    📋 DEPLOYMENT SUMMARY");
  console.log("═".repeat(60));
  console.log("\n  Contract Addresses:");
  console.log("  ─────────────────────────────────────────────────────");
  console.log("  ALPHA Token:       ", tokenAAddress);
  console.log("  BETA Token:        ", tokenBAddress);
  console.log("  EpochLP:           ", poolAddress);
  
  console.log("\n  Pool State:");
  console.log("  ─────────────────────────────────────────────────────");
  console.log("  ReserveA (ALPHA): ", ethers.formatEther(reserveA));
  console.log("  ReserveB (BETA):  ", ethers.formatEther(reserveB));
  console.log("  Total Supply:     ", ethers.formatEther(await pool.totalSupply()));
  console.log("  LP Balance:       ", ethers.formatEther(await pool.balanceOf(deployer.address)));
  console.log("  Current Epoch:    ", currentEpoch.toString());

  console.log("\n  🔥 CRITICAL VULNERABILITY:");
  console.log("  ─────────────────────────────────────────────────────");
  console.log("  1. Epoch Desynchronization:");
  console.log("     - LP minting uses epoch e");
  console.log("     - LP burning uses epoch e + 1");
  console.log("     - Swap pricing uses epoch e - 1");
  console.log("  2. Creates temporal arbitrage through asymmetric valuation");
  console.log("  3. Exploitable via carefully timed epoch boundary attacks");

  console.log("\n  💡 EXPLOIT HINTS:");
  console.log("  ─────────────────────────────────────────────────────");
  console.log("  • 'Time is money' - temporal aspect");
  console.log("  • 'Look between the epochs' - cross-epoch analysis");
  console.log("  • 'Price is relative' - valuation asymmetry");
  console.log("  • 'State transitions matter' - epoch boundaries");

  console.log("\n" + "═".repeat(60));
  console.log("               ✅ Deployment Complete!");
  console.log("═".repeat(60) + "\n");

  return { tokenA: tokenAAddress, tokenB: tokenBAddress, pool: poolAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
