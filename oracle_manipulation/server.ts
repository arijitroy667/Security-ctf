import express from "express";
import { ethers } from "ethers";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY!;
const DEPLOYMENT_PORT = Number(process.env.DEPLOYMENT_PORT || 3000);
const DEPLOYMENT_FEE = process.env.DEPLOYMENT_FEE || "0.01";
const FIXED_SALT = process.env.FIXED_SALT || "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

if (!DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY missing");

const app = express();

/* ---------- middleware ---------- */
app.use(express.json());
app.use(express.static(__dirname)); // ✅ SERVE HTML + JS
app.use(helmet());

/* ---------- hardhat ---------- */
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);

/* ---------- anti-abuse ---------- */
const deployedContracts = new Map<string, any>(); // userAddress -> deployment info

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5
});

/* ---------- routes ---------- */
app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/verify-payment", limiter, async (req, res) => {
  const { userAddress, txHash } = req.body;

  if (!ethers.isAddress(userAddress) || !txHash) {
    return res.status(400).json({ 
      status: "error", 
      message: "Invalid address or transaction hash" 
    });
  }

  try {
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return res.status(400).json({ 
        status: "error", 
        message: "Transaction not found" 
      });
    }

    // Verify transaction details
    if (tx.to !== deployer.address) {
      return res.status(400).json({ 
        status: "error", 
        message: "Invalid recipient" 
      });
    }

    const expectedFee = ethers.parseEther(DEPLOYMENT_FEE);
    if (tx.value < expectedFee) {
      return res.status(400).json({ 
        status: "error", 
        message: `Insufficient fee. Expected: ${DEPLOYMENT_FEE} ETH` 
      });
    }

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status === 0) {
      return res.status(400).json({ 
        status: "error", 
        message: "Transaction failed" 
      });
    }

    return res.json({ 
      status: "success", 
      message: "Payment verified" 
    });

  } catch (err: any) {
    console.error("Payment verification error:", err);
    return res.status(500).json({ 
      status: "error", 
      message: "Verification failed" 
    });
  }
});

app.post("/deploy", limiter, async (req, res) => {
  const { userAddress, txHash } = req.body;

  if (!ethers.isAddress(userAddress) || !txHash) {
    return res.status(400).json({ 
      status: "error", 
      message: "Invalid address or transaction hash" 
    });
  }

  // Check if already deployed for this user
  if (deployedContracts.has(userAddress)) {
    return res.status(400).json({ 
      status: "error", 
      message: "Contract already deployed for this address" 
    });
  }

  try {
    // Verify payment first
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return res.status(400).json({ 
        status: "error", 
        message: "Payment transaction not found" 
      });
    }

    const expectedFee = ethers.parseEther(DEPLOYMENT_FEE);
    if (tx.value < expectedFee || tx.to !== deployer.address) {
      return res.status(400).json({ 
        status: "error", 
        message: "Invalid payment" 
      });
    }

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status === 0) {
      return res.status(400).json({ 
        status: "error", 
        message: "Payment transaction failed" 
      });
    }

    // Deploy Create2Factory if not already deployed
    const factoryArtifact = require("./artifacts/contracts/Create2Factory.sol/Create2Factory.json");
    const factoryContract = new ethers.ContractFactory(
      factoryArtifact.abi,
      factoryArtifact.bytecode,
      deployer
    );

    let factoryAddress;
    try {
      const factory = await factoryContract.deploy();
      await factory.waitForDeployment();
      factoryAddress = await factory.getAddress();
    } catch (error: any) {
      // Factory might already be deployed, try to get existing address
      console.log("Factory deployment failed, might already exist:", error.message);
      // For simplicity, we'll use a hardcoded address or implement factory discovery
      factoryAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Default hardhat address
    }

    // Deploy the target contract using CREATE2
    const deployableArtifact = require("./artifacts/contracts/DeployableContract.sol/DeployableContract.json");
    const salt = ethers.getBytes(FIXED_SALT);
    const message = `Deployed for ${userAddress}`;
    const value = Math.floor(Math.random() * 1000);

    const create2Factory = new ethers.Contract(factoryAddress, factoryArtifact.abi, deployer);
    
    // Calculate predicted address first
    const predictedAddress = await create2Factory.getDeploymentAddress(salt, userAddress, message, value);
    
    // Deploy via CREATE2
    const deployTx = await create2Factory.deploy(salt, userAddress, message, value);
    const deployReceipt = await deployTx.wait();

    const deploymentInfo = {
      deployedAddress: predictedAddress,
      transactionHash: deployTx.hash,
      factoryAddress,
      userAddress,
      message,
      value,
      salt: FIXED_SALT,
      paymentTxHash: txHash
    };

    deployedContracts.set(userAddress, deploymentInfo);

    console.log(`Contract deployed for ${userAddress}:`, deploymentInfo);

    return res.json({
      status: "success",
      deployedAddress: predictedAddress,
      transactionHash: deployTx.hash,
      factoryAddress
    });

  } catch (err: any) {
    console.error("Deployment error:", err);
    return res.status(500).json({ 
      status: "error", 
      message: "Deployment failed: " + err.message 
    });
  }
});

app.get("/deployment/:userAddress", (req, res) => {
  const { userAddress } = req.params;
  
  if (!ethers.isAddress(userAddress)) {
    return res.status(400).json({ 
      status: "error", 
      message: "Invalid address" 
    });
  }

  const deploymentInfo = deployedContracts.get(userAddress);
  
  if (!deploymentInfo) {
    return res.status(404).json({ 
      status: "error", 
      message: "No deployment found for this address" 
    });
  }

  return res.json({
    status: "success",
    ...deploymentInfo
  });
});

/* ---------- start ---------- */
app.listen(DEPLOYMENT_PORT, () => {
  console.log(`Deployment server running on http://localhost:${DEPLOYMENT_PORT}`);
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Deployment fee: ${DEPLOYMENT_FEE} ETH`);
});
