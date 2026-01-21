import { ethers, network } from "hardhat";

/**
 * Crypto Mixer CTF - Transaction Simulation Script
 * 
 * This script simulates realistic mixer usage to demonstrate the
 * timing analysis vulnerability. It creates:
 * 
 * 1. Blocks with MULTIPLE transactions (good privacy)
 * 2. Blocks with SINGLE transactions (vulnerable - traceable!)
 * 
 * The attacker can analyze the blockchain and identify isolated
 * transactions to trace funds through the mixer.
 */

interface UserDeposit {
  secret: string;
  commitment: string;
  depositBlock: number;
}

async function main() {
  console.log("═".repeat(70));
  console.log("       🎯 Crypto Mixer CTF - Timing Analysis Simulation");
  console.log("═".repeat(70));

  // Get signers - simulate multiple users
  const signers = await ethers.getSigners();
  const [deployer, alice, bob, charlie, diana, eve, attacker] = signers;

  console.log("\n[USERS]");
  console.log("  Alice (victim):", alice.address);
  console.log("  Bob:           ", bob.address);
  console.log("  Charlie:       ", charlie.address);
  console.log("  Diana:         ", diana.address);
  console.log("  Eve:           ", eve.address);
  console.log("  Attacker:      ", attacker.address);

  // Deploy contracts
  console.log("\n[1/5] Deploying contracts...");
  const TimingVulnerableMixer = await ethers.getContractFactory("TimingVulnerableMixer");
  const mixer = await TimingVulnerableMixer.deploy();
  await mixer.waitForDeployment();
  const mixerAddress = await mixer.getAddress();
  console.log("  ✅ Mixer deployed to:", mixerAddress);

  const TimingAnalyzer = await ethers.getContractFactory("TimingAnalyzer");
  const analyzer = await TimingAnalyzer.deploy(mixerAddress);
  await analyzer.waitForDeployment();
  console.log("  ✅ Analyzer deployed");

  // Helper function to generate secrets and commitments
  function generateDeposit(): { secret: string; commitment: string } {
    const secret = ethers.hexlify(ethers.randomBytes(32));
    const commitment = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "uint256"], [secret, ethers.parseEther("1")])
    );
    return { secret, commitment };
  }

  // Helper to mine a block manually
  async function mineBlock() {
    await network.provider.send("evm_mine");
  }

  // Store all deposits for later withdrawals
  const deposits: Map<string, UserDeposit> = new Map();

  console.log("\n[2/5] Creating deposits with varying anonymity...\n");
  console.log("  Block | Transactions | Privacy Level");
  console.log("  ─".repeat(25));

  // ========== BLOCK 1: Multiple deposits (GOOD privacy) ==========
  const block1Deposits = [
    { user: alice, name: "Alice" },
    { user: bob, name: "Bob" },
    { user: charlie, name: "Charlie" },
  ];

  for (const { user, name } of block1Deposits) {
    const { secret, commitment } = generateDeposit();
    await mixer.connect(user).deposit(commitment, { value: ethers.parseEther("1") });
    const currentBlock = await ethers.provider.getBlockNumber();
    deposits.set(name, { secret, commitment, depositBlock: currentBlock });
  }
  await mineBlock();
  let blockNum = await ethers.provider.getBlockNumber();
  console.log(`  ${blockNum.toString().padStart(5)} |      3       | ✅ HIGH (anonymity set = 3)`);

  // ========== BLOCK 2: Single deposit (VULNERABLE!) ==========
  const dianaDeposit = generateDeposit();
  await mixer.connect(diana).deposit(dianaDeposit.commitment, { value: ethers.parseEther("1") });
  await mineBlock();
  blockNum = await ethers.provider.getBlockNumber();
  deposits.set("Diana", { ...dianaDeposit, depositBlock: blockNum });
  console.log(`  ${blockNum.toString().padStart(5)} |      1       | ⚠️ LOW (isolated transaction!)`);

  // ========== BLOCK 3: Multiple deposits (GOOD privacy) ==========
  const block3Deposits = [
    { user: eve, name: "Eve" },
    { user: deployer, name: "Deployer" },
  ];

  for (const { user, name } of block3Deposits) {
    const { secret, commitment } = generateDeposit();
    await mixer.connect(user).deposit(commitment, { value: ethers.parseEther("1") });
    const currentBlock = await ethers.provider.getBlockNumber();
    deposits.set(name, { secret, commitment, depositBlock: currentBlock });
  }
  await mineBlock();
  blockNum = await ethers.provider.getBlockNumber();
  console.log(`  ${blockNum.toString().padStart(5)} |      2       | ✅ MEDIUM (anonymity set = 2)`);

  console.log("\n[3/5] Simulating withdrawals...\n");
  console.log("  Block | Transactions | Privacy Level | User");
  console.log("  ─".repeat(32));

  // ========== WITHDRAWAL BLOCK 1: Multiple withdrawals (GOOD) ==========
  const withdrawal1Users = ["Alice", "Bob"];
  for (const name of withdrawal1Users) {
    const deposit = deposits.get(name)!;
    await mixer.connect(signers[1]).withdraw(deposit.secret, alice.address);
  }
  await mineBlock();
  blockNum = await ethers.provider.getBlockNumber();
  console.log(`  ${blockNum.toString().padStart(5)} |      2       | ✅ MEDIUM         | Alice, Bob`);

  // ========== WITHDRAWAL BLOCK 2: Single withdrawal (VULNERABLE!) ==========
  // Diana's withdrawal in isolation - TRACEABLE!
  const dianaRecord = deposits.get("Diana")!;
  await mixer.connect(diana).withdraw(dianaRecord.secret, diana.address);
  await mineBlock();
  blockNum = await ethers.provider.getBlockNumber();
  console.log(`  ${blockNum.toString().padStart(5)} |      1       | ⚠️ TRACEABLE!     | Diana`);

  // ========== WITHDRAWAL BLOCK 3: Multiple withdrawals (GOOD) ==========
  const withdrawal3Users = ["Charlie", "Eve"];
  for (const name of withdrawal3Users) {
    const deposit = deposits.get(name)!;
    const recipient = name === "Charlie" ? charlie.address : eve.address;
    await mixer.connect(signers[1]).withdraw(deposit.secret, recipient);
  }
  await mineBlock();
  blockNum = await ethers.provider.getBlockNumber();
  console.log(`  ${blockNum.toString().padStart(5)} |      2       | ✅ MEDIUM         | Charlie, Eve`);

  console.log("\n[4/5] 🔍 Running Timing Analysis Attack...\n");
  
  // Attacker runs the analyzer
  await analyzer.connect(attacker).analyzeAllWithdrawals();
  
  const tracedCount = await analyzer.getTracedCount();
  console.log(`  Isolated transactions found: ${tracedCount}`);
  
  if (tracedCount > 0n) {
    console.log("\n  🚨 PRIVACY LEAKS DETECTED:");
    console.log("  ─".repeat(25));
    
    for (let i = 0n; i < tracedCount; i++) {
      const [withdrawIndex, recipient, withdrawBlock, isIsolated] = 
        await analyzer.getTracedTransaction(i);
      
      console.log(`  Withdrawal #${withdrawIndex}:`);
      console.log(`    Recipient: ${recipient}`);
      console.log(`    Block:     ${withdrawBlock}`);
      console.log(`    Isolated:  ${isIsolated ? "YES - TRACEABLE!" : "No"}`);
      
      // Cross-reference with known addresses
      if (recipient === diana.address) {
        console.log(`    Identified: Diana's withdrawal!`);
      }
    }
  }

  console.log("\n[5/5] 📊 Attack Summary\n");
  console.log("  ═".repeat(30));
  console.log("  TIMING ANALYSIS ATTACK RESULTS");
  console.log("  ═".repeat(30));
  
  const totalWithdrawals = await mixer.getWithdrawalCount();
  const traceablePercent = (Number(tracedCount) / Number(totalWithdrawals)) * 100;
  
  console.log(`\n  Total Withdrawals:     ${totalWithdrawals}`);
  console.log(`  Traceable Withdrawals: ${tracedCount}`);
  console.log(`  Privacy Breach Rate:   ${traceablePercent.toFixed(1)}%`);
  
  console.log("\n  💀 ATTACK EXPLANATION:");
  console.log("  ─".repeat(30));
  console.log("  The attacker identified blocks with only one mixer");
  console.log("  transaction. In these blocks, the depositor can be");
  console.log("  directly linked to the withdrawer, breaking privacy.");
  console.log("\n  Diana's transaction was isolated, making it trivial");
  console.log("  to trace her deposit -> withdrawal path!");

  console.log("\n  🛡️ MITIGATION:");
  console.log("  ─".repeat(30));
  console.log("  1. Enforce minimum anonymity set size before withdrawal");
  console.log("  2. Use time-delayed withdrawals");
  console.log("  3. Require N other transactions in the same timeframe");
  console.log("  4. Use relayer networks to bundle transactions");

  console.log("\n" + "═".repeat(70));
  console.log("              ✅ Simulation Complete!");
  console.log("═".repeat(70) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
