# 🎯 EpochLP CTF Challenge

## 📖 Challenge Overview

**EpochLP** is an advanced Web3 CTF challenge featuring a liquidity pool with intentional epoch desynchronization. The vulnerability is subtle and requires deep understanding of DeFi mechanics, temporal state management, and cross-epoch valuation asymmetry.

## 🔍 The Critical Vulnerability

### **Epoch Desynchronization**
The contract uses different epochs for different operations:
- **LP minting**: epoch `e` (current)
- **LP burning**: epoch `e + 1` (future)  
- **Swap pricing**: epoch `e - 1` (previous)

This creates **temporal arbitrage opportunities** through asymmetric valuation.

### **Broken Invariant**
> **Expected**: LP token value = Proportional share of current pool reserves
> 
> **Reality**: LP token value = Proportional share of epoch-specific reserves (varies by operation)

## 🎯 Challenge Objectives

1. **Identify the epoch desynchronization vulnerability**
2. **Exploit the temporal arbitrage opportunity**
3. **Extract maximum value from the pool**
4. **Leave the pool functional for other users**

## 🚀 Getting Started

### 1. Deploy the Challenge
```bash
npm install
npx hardhat run scripts/deploy-epoch.ts --network localhost
```

### 2. Start Local Node
```bash
npx hardhat node
```

### 3. Open Frontend
Open `index.html` in your browser and connect MetaMask to `localhost:8545`.

### 4. Load Contract
Enter the deployed EpochLP contract address in the frontend.

## 💡 CTF Hints

### 🕰️ **"Time is money"**
- Consider the temporal aspect of operations
- Epoch transitions create windows of opportunity

### 🔀 **"Look between the epochs"**
- Cross-epoch analysis reveals inconsistencies
- Compare reserves across different epochs

### 💰 **"Price is relative"**
- Valuation asymmetry creates opportunities
- Different operations use different price references

### ⚡ **"State transitions matter"**
- Epoch boundaries are critical moments
- Timing attacks around epoch changes

## 🔧 Technical Details

### Contract Structure
```solidity
contract EpochLP {
    mapping(uint256 => uint256) public reserveA; // epoch -> reserve
    mapping(uint256 => uint256) public reserveB;
    mapping(uint256 => uint256) public totalLiquidity;
    
    function addLiquidity(uint256, uint256) // Uses epoch e
    function removeLiquidity(uint256)      // Uses epoch e + 1
    function swap(uint256, bool)           // Uses epoch e - 1
}
```

### Attack Vector
1. **Wait for epoch transition**
2. **Swap using stale pricing (e-1)**
3. **Add liquidity using current reserves (e)**
4. **Reverse swap using still-stale pricing**
5. **Remove liquidity using future valuation (e+1)**

## 🎯 Success Criteria

- **Extract >50%** of pool value
- **Complete within limited transactions**
- **No obvious attack traces** in logs
- **Pool remains functional** for others

## 🧠 Why This Is Advanced

### **Automated Tools Miss It**
- No obvious reentrancy or integer overflow
- Individual functions appear correct
- Epoch logic looks intentional
- No direct permission bypasses

### **Human Auditors Miss It**
- Focus on individual function correctness
- Don't trace epoch state across operations
- Assume epoch logic is architectural choice
- Miss cross-epoch valuation inconsistencies

### **Multi-Dimensional Complexity**
- Temporal reasoning across epochs
- State synchronization issues
- Economic incentive misalignment
- Concurrent user interactions

## 🏆 Difficulty Classification

- **🟢 Juniors**: Fail - miss temporal aspect
- **🟡 Seniors**: Pause - need deep analysis
- **🔴 Auditors**: Annoyed - subtle design flaw

## 📚 Learning Objectives

After solving this challenge, you'll understand:
- **Temporal state management** in DeFi protocols
- **Cross-epoch valuation attacks**
- **Liquidity pool mechanics** beyond basics
- **Economic incentive alignment**
- **Protocol design vulnerabilities**

## 🔗 Additional Resources

- [Uniswap V2 Whitepaper](https://uniswap.org/whitepaper.pdf)
- [Epoch-based Systems](https://ethereum.org/en/developers/docs/consensus-mechanisms/pos/)
- [DeFi Security Best Practices](https://consensys.github.io/smart-contract-best-practices/)

---

**⚠️ Educational Purpose Only**: This challenge is designed for educational CTF purposes to demonstrate advanced DeFi vulnerability patterns.
