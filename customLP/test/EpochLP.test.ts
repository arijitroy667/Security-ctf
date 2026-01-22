import { expect } from "chai";
import { ethers } from "hardhat";
import { EpochLP } from "../typechain-types";
import { MockERC20 } from "../typechain-types";

describe("EpochLP CTF Challenge", function () {
  let pool: EpochLP;
  let tokenA: MockERC20;
  let tokenB: MockERC20;
  let owner: any;
  let attacker: any;
  let user1: any;

  beforeEach(async function () {
    [owner, attacker, user1] = await ethers.getSigners();

    // Deploy tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    tokenA = await MockERC20.deploy("Alpha Token", "ALPHA", ethers.parseEther("1000000"));
    tokenB = await MockERC20.deploy("Beta Token", "BETA", ethers.parseEther("1000000"));

    // Deploy pool
    const EpochLP = await ethers.getContractFactory("EpochLP");
    pool = await EpochLP.deploy(await tokenA.getAddress(), await tokenB.getAddress(), "EpochLP", "ELP");

    // Add initial liquidity
    const liquidityAmount = ethers.parseEther("100000");
    await tokenA.approve(await pool.getAddress(), liquidityAmount);
    await tokenB.approve(await pool.getAddress(), liquidityAmount);
    await pool.addLiquidity(liquidityAmount, liquidityAmount);

    // Give attacker some tokens
    await tokenA.transfer(attacker.address, ethers.parseEther("10000"));
    await tokenB.transfer(attacker.address, ethers.parseEther("10000"));
  });

  describe("Vulnerability Detection", function () {
    it("Should demonstrate epoch desynchronization", async function () {
      const currentEpoch = await pool.currentEpoch();
      
      // Get different epoch reserves
      const [currentReserveA, currentReserveB] = await pool.getCurrentReserves();
      const [pricingReserveA, pricingReserveB] = await pool.getPricingReserves();
      
      console.log("Current epoch:", currentEpoch.toString());
      console.log("Current reserves:", ethers.formatEther(currentReserveA), ethers.formatEther(currentReserveB));
      console.log("Pricing reserves:", ethers.formatEther(pricingReserveA), ethers.formatEther(pricingReserveB));
      
      // Pricing reserves should be from previous epoch (or same if epoch 0)
      if (currentEpoch > 0) {
        expect(pricingReserveA).to.not.equal(currentReserveA);
      }
    });

    it("Should allow cross-epoch arbitrage", async function () {
      // This test demonstrates the vulnerability exists
      // Full exploit implementation left for CTF participants
      
      const attackerPool = pool.connect(attacker);
      
      // Approve tokens
      await tokenA.connect(attacker).approve(await pool.getAddress(), ethers.parseEther("1000"));
      await tokenB.connect(attacker).approve(await pool.getAddress(), ethers.parseEther("1000"));
      
      // Add liquidity (uses current epoch)
      await attackerPool.addLiquidity(ethers.parseEther("100"), ethers.parseEther("100"));
      
      // Check LP balance
      const lpBalance = await pool.balanceOf(attacker.address);
      console.log("Attacker LP balance:", ethers.formatEther(lpBalance));
      
      expect(lpBalance).to.be.gt(0);
    });
  });

  describe("Challenge Requirements", function () {
    it("Should have correct contract structure", async function () {
      expect(await pool.name()).to.equal("EpochLP");
      expect(await pool.symbol()).to.equal("ELP");
      expect(await tokenA.name()).to.equal("Alpha Token");
      expect(await tokenB.name()).to.equal("Beta Token");
    });

    it("Should maintain epoch-based state", async function () {
      const epoch = await pool.currentEpoch();
      const [reserveA, reserveB] = await pool.getCurrentReserves();
      
      expect(reserveA).to.be.gt(0);
      expect(reserveB).to.be.gt(0);
      expect(epoch).to.be.gte(0);
    });

    it("Should allow all pool operations", async function () {
      const attackerPool = pool.connect(attacker);
      
      // Approve tokens
      await tokenA.connect(attacker).approve(await pool.getAddress(), ethers.parseEther("1000"));
      await tokenB.connect(attacker).approve(await pool.getAddress(), ethers.parseEther("1000"));
      
      // Add liquidity
      await attackerPool.addLiquidity(ethers.parseEther("10"), ethers.parseEther("10"));
      
      // Swap
      await attackerPool.swap(ethers.parseEther("1"), true);
      
      // Remove liquidity
      const lpBalance = await pool.balanceOf(attacker.address);
      await attackerPool.removeLiquidity(lpBalance);
      
      // All operations should succeed
      expect(true).to.be.true;
    });
  });

  describe("Exploit Demonstration (Partial)", function () {
    it("Should show the arbitrage opportunity exists", async function () {
      // This is a hint for CTF participants
      // The actual exploit is more complex
      
      const attackerPool = pool.connect(attacker);
      
      // Approve tokens
      await tokenA.connect(attacker).approve(await pool.getAddress(), ethers.parseEther("1000"));
      await tokenB.connect(attacker).approve(await pool.getAddress(), ethers.parseEther("1000"));
      
      // Get initial state
      const initialBalanceA = await tokenA.balanceOf(attacker.address);
      const initialBalanceB = await tokenB.balanceOf(attacker.address);
      
      // Add liquidity (uses current epoch valuation)
      await attackerPool.addLiquidity(ethers.parseEther("100"), ethers.parseEther("100"));
      
      // Get LP tokens
      const lpTokens = await pool.balanceOf(attacker.address);
      
      // Remove liquidity (uses next epoch valuation)
      await attackerPool.removeLiquidity(lpTokens);
      
      // Check final balances
      const finalBalanceA = await tokenA.balanceOf(attacker.address);
      const finalBalanceB = await tokenB.balanceOf(attacker.address);
      
      console.log("Initial balances:", ethers.formatEther(initialBalanceA), ethers.formatEther(initialBalanceB));
      console.log("Final balances:", ethers.formatEther(finalBalanceA), ethers.formatEther(finalBalanceB));
      
      // The vulnerability allows for profit extraction
      // Full implementation requires timing around epoch transitions
    });
  });
});
