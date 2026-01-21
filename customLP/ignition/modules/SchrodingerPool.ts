import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Schrodinger Pool CTF - Ignition Deployment Module
 * 
 * Deploys:
 * 1. MockERC20 (Token0 - ALPHA) with 1M initial supply
 * 2. MockERC20 (Token1 - BETA) with 1M initial supply  
 * 3. SchrodingerPool - The vulnerable epoch-based LP
 */
const SchrodingerPoolModule = buildModule("SchrodingerPool", (m) => {
  const initialSupply = m.getParameter("initialSupply", "1000000000000000000000000"); // 1M tokens

  // Deploy tokens
  const token0 = m.contract("MockERC20", ["Alpha Token", "ALPHA", initialSupply], { id: "Token0" });
  const token1 = m.contract("MockERC20", ["Beta Token", "BETA", initialSupply], { id: "Token1" });

  // Deploy pool
  const pool = m.contract("SchrodingerPool", [token0, token1], { id: "SchrodingerPool" });

  return { token0, token1, pool };
});

export default SchrodingerPoolModule;
