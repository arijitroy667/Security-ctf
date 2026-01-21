import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "hardhat";

/**
 * Oracle Manipulation CTF Deployment Module
 * 
 * This module deploys:
 * 1. ERC20Mock (TOKEN) - The vulnerable token used as collateral
 * 2. ERC20Mock (USDC) - The stablecoin for borrowing
 * 3. SimpleAMM - The DEX that serves as a vulnerable price oracle
 * 4. LendingPool - The lending pool vulnerable to oracle manipulation
 * 
 * Initial Setup:
 * - AMM is funded with 10,000 TOKEN and 10,000 USDC (1:1 ratio)
 * - LendingPool is funded with 100,000 USDC for borrowing
 */
const OracleManipulationModule = buildModule("OracleManipulation", (m) => {
  // Deploy ERC20 Mock tokens
  const token = m.contract("ERC20Mock", ["Vulnerable Token", "VULN"], { id: "Token" });
  const usdc = m.contract("ERC20Mock", ["USD Coin", "USDC"], { id: "USDC" });

  // Deploy SimpleAMM (DEX) - Uses token and usdc addresses
  const simpleAMM = m.contract("SimpleAMM", [token, usdc], { id: "SimpleAMM" });

  // Deploy LendingPool - Uses AMM as the oracle (vulnerable!)
  const lendingPool = m.contract("LendingPool", [token, usdc, simpleAMM], { id: "LendingPool" });

  return { token, usdc, simpleAMM, lendingPool };
});

export default OracleManipulationModule;
