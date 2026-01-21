import { expect } from "chai";
import { ethers, network } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * Crypto Mixer CTF - Timing Analysis Vulnerability Tests
 * 
 * This test suite demonstrates the timing analysis vulnerability
 * where isolated transactions can be traced through the mixer.
 */

describe("Crypto Mixer CTF - Timing Analysis", function () {
  
  async function deployMixerFixture() {
    const [owner, alice, bob, charlie, diana, attacker] = await ethers.getSigners();

    // Deploy mixer
    const TimingVulnerableMixer = await ethers.getContractFactory("TimingVulnerableMixer");
    const mixer = await TimingVulnerableMixer.deploy();

    // Deploy analyzer
    const TimingAnalyzer = await ethers.getContractFactory("TimingAnalyzer");
    const analyzer = await TimingAnalyzer.deploy(await mixer.getAddress());

    return { mixer, analyzer, owner, alice, bob, charlie, diana, attacker };
  }

  // Helper to generate deposit credentials
  function generateDeposit(): { secret: string; commitment: string } {
    const secret = ethers.hexlify(ethers.randomBytes(32));
    const commitment = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "uint256"], [secret, ethers.parseEther("1")])
    );
    return { secret, commitment };
  }

  // Helper to disable auto-mine, batch transactions, then mine a block
  async function disableAutoMine() {
    await network.provider.send("evm_setAutomine", [false]);
  }

  async function enableAutoMine() {
    await network.provider.send("evm_setAutomine", [true]);
  }

  async function mineBlock() {
    await network.provider.send("evm_mine");
  }

  describe("Contract Deployment", function () {
    it("Should deploy mixer with correct denomination", async function () {
      const { mixer } = await loadFixture(deployMixerFixture);
      expect(await mixer.DENOMINATION()).to.equal(ethers.parseEther("1"));
    });

    it("Should deploy analyzer linked to mixer", async function () {
      const { mixer, analyzer } = await loadFixture(deployMixerFixture);
      expect(await analyzer.mixer()).to.equal(await mixer.getAddress());
    });
  });

  describe("Basic Mixer Operations", function () {
    it("Should allow deposit with correct amount", async function () {
      const { mixer, alice } = await loadFixture(deployMixerFixture);
      const { commitment } = generateDeposit();

      await mixer.connect(alice).deposit(commitment, { value: ethers.parseEther("1") });
      
      expect(await mixer.mixerBalance()).to.equal(ethers.parseEther("1"));
      expect(await mixer.getDepositCount()).to.equal(1);
    });

    it("Should reject deposit with wrong amount", async function () {
      const { mixer, alice } = await loadFixture(deployMixerFixture);
      const { commitment } = generateDeposit();

      await expect(
        mixer.connect(alice).deposit(commitment, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Wrong denomination");
    });

    it("Should allow withdrawal with correct secret", async function () {
      const { mixer, alice, bob } = await loadFixture(deployMixerFixture);
      const { secret, commitment } = generateDeposit();

      await mixer.connect(alice).deposit(commitment, { value: ethers.parseEther("1") });
      
      const bobBalanceBefore = await ethers.provider.getBalance(bob.address);
      await mixer.connect(alice).withdraw(secret, bob.address);
      const bobBalanceAfter = await ethers.provider.getBalance(bob.address);

      expect(bobBalanceAfter - bobBalanceBefore).to.equal(ethers.parseEther("1"));
    });

    it("Should reject double withdrawal", async function () {
      const { mixer, alice, bob } = await loadFixture(deployMixerFixture);
      const { secret, commitment } = generateDeposit();

      await mixer.connect(alice).deposit(commitment, { value: ethers.parseEther("1") });
      await mixer.connect(alice).withdraw(secret, bob.address);

      await expect(
        mixer.connect(alice).withdraw(secret, bob.address)
      ).to.be.revertedWith("Already withdrawn");
    });
  });

  describe("Block Transaction Tracking", function () {
    it("Should track transaction count per block", async function () {
      const { mixer, alice, bob } = await loadFixture(deployMixerFixture);
      
      const deposit1 = generateDeposit();
      const deposit2 = generateDeposit();

      // Disable auto-mining to batch transactions
      await disableAutoMine();

      // Send two transactions (they will be pending)
      await mixer.connect(alice).deposit(deposit1.commitment, { value: ethers.parseEther("1") });
      await mixer.connect(bob).deposit(deposit2.commitment, { value: ethers.parseEther("1") });
      
      // Mine them together in one block
      await mineBlock();
      await enableAutoMine();

      const blockNum = await ethers.provider.getBlockNumber();
      expect(await mixer.getBlockTxCount(blockNum)).to.equal(2);
    });

    it("Should identify isolated blocks", async function () {
      const { mixer, alice } = await loadFixture(deployMixerFixture);
      const { commitment } = generateDeposit();

      // Single transaction = isolated block
      await mixer.connect(alice).deposit(commitment, { value: ethers.parseEther("1") });
      
      const blockNum = await ethers.provider.getBlockNumber();
      expect(await mixer.isIsolatedBlock(blockNum)).to.be.true;
    });

    it("Should NOT identify multi-tx blocks as isolated", async function () {
      const { mixer, alice, bob } = await loadFixture(deployMixerFixture);
      
      const deposit1 = generateDeposit();
      const deposit2 = generateDeposit();

      // Disable auto-mining
      await disableAutoMine();

      await mixer.connect(alice).deposit(deposit1.commitment, { value: ethers.parseEther("1") });
      await mixer.connect(bob).deposit(deposit2.commitment, { value: ethers.parseEther("1") });
      
      await mineBlock();
      await enableAutoMine();

      const blockNum = await ethers.provider.getBlockNumber();
      expect(await mixer.isIsolatedBlock(blockNum)).to.be.false;
    });
  });

  describe("🔥 Timing Analysis Exploit", function () {
    it("Should detect isolated withdrawal as privacy leak", async function () {
      const { mixer, analyzer, alice, bob, charlie, attacker } = await loadFixture(deployMixerFixture);

      // Create deposits
      const aliceDeposit = generateDeposit();
      const bobDeposit = generateDeposit();
      const charlieDeposit = generateDeposit();

      // All deposit together (batch)
      await disableAutoMine();
      await mixer.connect(alice).deposit(aliceDeposit.commitment, { value: ethers.parseEther("1") });
      await mixer.connect(bob).deposit(bobDeposit.commitment, { value: ethers.parseEther("1") });
      await mixer.connect(charlie).deposit(charlieDeposit.commitment, { value: ethers.parseEther("1") });
      await mineBlock();
      await enableAutoMine();

      // Alice and Bob withdraw together (good privacy)
      await disableAutoMine();
      await mixer.connect(alice).withdraw(aliceDeposit.secret, alice.address);
      await mixer.connect(bob).withdraw(bobDeposit.secret, bob.address);
      await mineBlock();
      await enableAutoMine();

      // Charlie withdraws ALONE (vulnerable!)
      await mixer.connect(charlie).withdraw(charlieDeposit.secret, charlie.address);

      // Attacker analyzes
      await analyzer.connect(attacker).analyzeAllWithdrawals();

      const tracedCount = await analyzer.getTracedCount();
      expect(tracedCount).to.equal(1); // Charlie's isolated tx

      const [, recipient, , isIsolated] = await analyzer.getTracedTransaction(0);
      expect(recipient).to.equal(charlie.address);
      expect(isIsolated).to.be.true;
    });

    it("Should trace all isolated transactions in complex scenario", async function () {
      const { mixer, analyzer, alice, bob, charlie, diana, attacker } = await loadFixture(deployMixerFixture);

      // Create deposits (batch them together)
      const deposits = [
        { user: alice, ...generateDeposit() },
        { user: bob, ...generateDeposit() },
        { user: charlie, ...generateDeposit() },
        { user: diana, ...generateDeposit() }
      ];

      await disableAutoMine();
      for (const d of deposits) {
        await mixer.connect(d.user).deposit(d.commitment, { value: ethers.parseEther("1") });
      }
      await mineBlock();
      await enableAutoMine();

      // Alice withdraws alone (traceable!)
      await mixer.connect(alice).withdraw(deposits[0].secret, alice.address);

      // Bob and Charlie withdraw together (safe)
      await disableAutoMine();
      await mixer.connect(bob).withdraw(deposits[1].secret, bob.address);
      await mixer.connect(charlie).withdraw(deposits[2].secret, charlie.address);
      await mineBlock();
      await enableAutoMine();

      // Diana withdraws alone (traceable!)
      await mixer.connect(diana).withdraw(deposits[3].secret, diana.address);

      // Analyze
      await analyzer.connect(attacker).analyzeAllWithdrawals();

      const tracedCount = await analyzer.getTracedCount();
      expect(tracedCount).to.equal(2); // Alice + Diana

      // Verify traced users
      const tracedRecipients: string[] = [];
      for (let i = 0; i < Number(tracedCount); i++) {
        const [, recipient] = await analyzer.getTracedTransaction(i);
        tracedRecipients.push(recipient);
      }

      expect(tracedRecipients).to.include(alice.address);
      expect(tracedRecipients).to.include(diana.address);
      expect(tracedRecipients).to.not.include(bob.address);
      expect(tracedRecipients).to.not.include(charlie.address);
    });

    it("Should calculate privacy breach rate", async function () {
      const { mixer, analyzer, alice, bob, charlie, diana, attacker } = await loadFixture(deployMixerFixture);

      // Create 4 deposits in a single block
      const deposits = [
        { user: alice, ...generateDeposit() },
        { user: bob, ...generateDeposit() },
        { user: charlie, ...generateDeposit() },
        { user: diana, ...generateDeposit() }
      ];

      await disableAutoMine();
      for (const d of deposits) {
        await mixer.connect(d.user).deposit(d.commitment, { value: ethers.parseEther("1") });
      }
      await mineBlock();
      await enableAutoMine();

      // 2 isolated withdrawals out of 4 = 50% breach rate

      // Alice alone (isolated)
      await mixer.connect(alice).withdraw(deposits[0].secret, alice.address);

      // Bob + Charlie together (not isolated)
      await disableAutoMine();
      await mixer.connect(bob).withdraw(deposits[1].secret, bob.address);
      await mixer.connect(charlie).withdraw(deposits[2].secret, charlie.address);
      await mineBlock();
      await enableAutoMine();

      // Diana alone (isolated)
      await mixer.connect(diana).withdraw(deposits[3].secret, diana.address);

      await analyzer.connect(attacker).analyzeAllWithdrawals();

      const totalWithdrawals = await mixer.getWithdrawalCount();
      const tracedCount = await analyzer.getTracedCount();

      const breachRate = (Number(tracedCount) / Number(totalWithdrawals)) * 100;
      expect(breachRate).to.equal(50); // 2 out of 4 = 50%
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero withdrawals in analysis", async function () {
      const { mixer, analyzer, alice, attacker } = await loadFixture(deployMixerFixture);

      const { commitment } = generateDeposit();
      await mixer.connect(alice).deposit(commitment, { value: ethers.parseEther("1") });

      // No withdrawals yet
      await analyzer.connect(attacker).analyzeAllWithdrawals();
      expect(await analyzer.getTracedCount()).to.equal(0);
    });

    it("Should correctly identify all safe transactions", async function () {
      const { mixer, analyzer, alice, bob, attacker } = await loadFixture(deployMixerFixture);

      // Create deposits
      const deposits = [
        { user: alice, ...generateDeposit() },
        { user: bob, ...generateDeposit() }
      ];

      await disableAutoMine();
      for (const d of deposits) {
        await mixer.connect(d.user).deposit(d.commitment, { value: ethers.parseEther("1") });
      }
      await mineBlock();
      await enableAutoMine();

      // Both withdraw together - should be safe
      await disableAutoMine();
      await mixer.connect(alice).withdraw(deposits[0].secret, alice.address);
      await mixer.connect(bob).withdraw(deposits[1].secret, bob.address);
      await mineBlock();
      await enableAutoMine();

      await analyzer.connect(attacker).analyzeAllWithdrawals();
      expect(await analyzer.getTracedCount()).to.equal(0); // No isolated tx!
    });
  });

  describe("Vulnerability Documentation", function () {
    it("Should document the timing analysis attack vector", function () {
      /**
       * TIMING ANALYSIS ATTACK VECTOR:
       * 
       * 1. Attacker monitors the blockchain for mixer transactions
       * 2. Identifies blocks with only ONE mixer transaction
       * 3. In isolated blocks, deposit→withdrawal links are trivial:
       *    - If block has 1 deposit: that's the depositor
       *    - If block has 1 withdrawal: that's linked to a deposit
       * 4. By correlating isolated deposit/withdrawal blocks, attacker
       *    can trace funds through the mixer
       * 
       * ROOT CAUSE: No enforcement of minimum anonymity set size
       */
      expect(true).to.be.true;
    });

    it("Should document mitigations", function () {
      const mitigations = [
        "Enforce minimum anonymity set size before withdrawal",
        "Use time-delayed withdrawals with random delays",
        "Require N other transactions in same timeframe",
        "Use relayer networks to bundle transactions",
        "Implement commitment pools with minimum size requirements"
      ];

      expect(mitigations.length).to.be.gte(5);
    });
  });
});
