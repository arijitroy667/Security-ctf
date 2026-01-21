import { ethers } from "hardhat";

/**
 * Oracle Manipulation CTF - Deployment Script
 * 
 * This script deploys:
 * 1. ERC20Mock (TOKEN) - The vulnerable token used as collateral
 * 2. ERC20Mock (USDC) - The stablecoin for borrowing
 * 3. SimpleAMM - The DEX that serves as a vulnerable price oracle
 * 4. LendingPool - The lending pool vulnerable to oracle manipulation
 * 
 * After deployment, it also:
 * - Sets up initial liquidity in the AMM (10,000 TOKEN : 10,000 USDC)
 * - Funds the LendingPool with 100,000 USDC for borrowing
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("═".repeat(60));
  console.log("      🎯 Oracle Manipulation CTF - Deployment Script");
  console.log("═".repeat(60));
  console.log("\n[INFO] Deploying contracts with account:", deployer.address);
  console.log("[INFO] Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Configuration
  const INITIAL_LIQUIDITY = ethers.parseEther("10000");  // 10,000 tokens each
  const LENDING_POOL_USDC = ethers.parseEther("100000"); // 100,000 USDC

  // ============ Deploy ERC20Mock Tokens ============
  console.log("[1/4] Deploying ERC20 Tokens...");
  
  const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
  
  const token = await ERC20Mock.deploy("Vulnerable Token", "VULN");
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("      ✅ TOKEN (VULN) deployed to:", tokenAddress);
  
  const usdc = await ERC20Mock.deploy("USD Coin", "USDC");
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("      ✅ USDC deployed to:", usdcAddress);

  // ============ Deploy SimpleAMM (DEX) ============
  console.log("\n[2/4] Deploying SimpleAMM (DEX)...");
  
  const SimpleAMM = await ethers.getContractFactory("SimpleAMM");
  const simpleAMM = await SimpleAMM.deploy(tokenAddress, usdcAddress);
  await simpleAMM.waitForDeployment();
  const ammAddress = await simpleAMM.getAddress();
  console.log("      ✅ SimpleAMM deployed to:", ammAddress);
  console.log("      ⚠️  This AMM will be used as the price oracle (VULNERABLE!)");

  // ============ Deploy LendingPool ============
  console.log("\n[3/4] Deploying LendingPool...");
  
  const LendingPool = await ethers.getContractFactory("LendingPool");
  const lendingPool = await LendingPool.deploy(tokenAddress, usdcAddress, ammAddress);
  await lendingPool.waitForDeployment();
  const lendingPoolAddress = await lendingPool.getAddress();
  console.log("      ✅ LendingPool deployed to:", lendingPoolAddress);
  console.log("      ⚠️  Using AMM spot price as oracle - exploitable!");

  // ============ Setup Initial State ============
  console.log("\n[4/4] Setting up initial state...");

  // Mint tokens to deployer for liquidity
  await token.mint(deployer.address, INITIAL_LIQUIDITY);
  await usdc.mint(deployer.address, INITIAL_LIQUIDITY);
  console.log("      ✅ Minted", ethers.formatEther(INITIAL_LIQUIDITY), "TOKEN to deployer");
  console.log("      ✅ Minted", ethers.formatEther(INITIAL_LIQUIDITY), "USDC to deployer");

  // Approve and add liquidity to AMM
  await token.approve(ammAddress, INITIAL_LIQUIDITY);
  await usdc.approve(ammAddress, INITIAL_LIQUIDITY);
  await simpleAMM.addLiquidity(INITIAL_LIQUIDITY, INITIAL_LIQUIDITY);
  console.log("      ✅ Added liquidity to AMM:", ethers.formatEther(INITIAL_LIQUIDITY), "TOKEN +", ethers.formatEther(INITIAL_LIQUIDITY), "USDC");

  // Fund the lending pool with USDC
  await usdc.mint(lendingPoolAddress, LENDING_POOL_USDC);
  console.log("      ✅ Funded LendingPool with", ethers.formatEther(LENDING_POOL_USDC), "USDC");

  // Verify setup
  const spotPrice = await simpleAMM.getSpotPrice();
  const poolBalance = await usdc.balanceOf(lendingPoolAddress);

  // ============ Deployment Summary ============
  console.log("\n" + "═".repeat(60));
  console.log("                   📋 DEPLOYMENT SUMMARY");
  console.log("═".repeat(60));
  console.log("\n  Contract Addresses:");
  console.log("  ─────────────────────────────────────────────────────");
  console.log("  TOKEN (VULN):    ", tokenAddress);
  console.log("  USDC:            ", usdcAddress);
  console.log("  SimpleAMM:       ", ammAddress);
  console.log("  LendingPool:     ", lendingPoolAddress);
  
  console.log("\n  Initial State:");
  console.log("  ─────────────────────────────────────────────────────");
  console.log("  AMM TOKEN Reserve:", ethers.formatEther(await simpleAMM.reserveToken()));
  console.log("  AMM USDC Reserve: ", ethers.formatEther(await simpleAMM.reserveUSDC()));
  console.log("  Spot Price:       ", ethers.formatEther(spotPrice), "USDC/TOKEN");
  console.log("  LendingPool USDC: ", ethers.formatEther(poolBalance));
  console.log("  LTV Ratio:        80%");

  console.log("\n  🔥 VULNERABILITY:");
  console.log("  ─────────────────────────────────────────────────────");
  console.log("  The LendingPool uses SimpleAMM.getSpotPrice() as its");
  console.log("  price oracle. This spot price can be manipulated by");
  console.log("  performing large swaps on the AMM, allowing attackers");
  console.log("  to borrow more than their collateral is truly worth.");

  console.log("\n" + "═".repeat(60));
  console.log("               ✅ Deployment Complete!");
  console.log("═".repeat(60) + "\n");

  // Return addresses for programmatic use
  return {
    token: tokenAddress,
    usdc: usdcAddress,
    simpleAMM: ammAddress,
    lendingPool: lendingPoolAddress
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
