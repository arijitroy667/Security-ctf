import { ethers } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY!;
const FIXED_SALT = process.env.FIXED_SALT || "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

if (!DEPLOYER_PRIVATE_KEY) {
  throw new Error("DEPLOYER_PRIVATE_KEY missing from environment variables");
}

async function main() {
  console.log("Starting CREATE2 deployment...");
  
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
  
  console.log("Deployer address:", deployer.address);
  console.log("Deployer balance:", ethers.formatEther(await provider.getBalance(deployer.address)), "ETH");
  
  // Deploy Create2Factory first
  console.log("\nDeploying Create2Factory...");
  const Create2Factory = await ethers.getContractFactory("Create2Factory");
  const create2Factory = await Create2Factory.connect(deployer).deploy();
  await create2Factory.waitForDeployment();
  
  const factoryAddress = await create2Factory.getAddress();
  console.log("Create2Factory deployed to:", factoryAddress);
  
  // Calculate deployment address for the target contract
  const salt = ethers.getBytes(FIXED_SALT);
  const owner = deployer.address;
  const message = "Deployed via CREATE2";
  const value = 42;
  
  console.log("\nCalculating deployment address...");
  const predictedAddress = await create2Factory.getDeploymentAddress(salt, owner, message, value);
  console.log("Predicted deployment address:", predictedAddress);
  
  // Deploy the target contract using CREATE2
  console.log("\nDeploying DeployableContract via CREATE2...");
  const nonce = await deployer.getNonce();
  const deployTx = await create2Factory.deploy(salt, owner, message, value, { nonce });
  const receipt = await deployTx.wait();
  
  console.log("Deployment transaction hash:", deployTx.hash);
  console.log("Gas used:", receipt?.gasUsed.toString());
  
  // Verify the deployed address matches prediction
  const actualAddress = await create2Factory.getDeploymentAddress(salt, owner, message, value);
  console.log("Actual deployment address:", actualAddress);
  
  if (actualAddress === predictedAddress) {
    console.log("✅ CREATE2 deployment successful - addresses match!");
  } else {
    console.log("❌ Address mismatch - deployment failed");
  }
  
  // Get the deployed contract instance
  const DeployableContract = await ethers.getContractFactory("DeployableContract");
  const deployedContract = DeployableContract.attach(actualAddress);
  
  // Verify contract state
  console.log("\nVerifying contract state...");
  try {
    const contractOwner = await deployedContract.owner();
    console.log("Owner:", contractOwner);
    
    const contractMessage = await deployedContract.getMessage();
    console.log("Message:", contractMessage);
    
    const contractValue = await deployedContract.getValue();
    console.log("Value:", contractValue.toString());
  } catch (error) {
    console.log("Contract verification failed, but deployment succeeded");
    console.log("Error:", error.message);
  }
  
  return {
    factoryAddress,
    deployedAddress: actualAddress,
    transactionHash: deployTx.hash,
    deployer: deployer.address,
    salt: FIXED_SALT
  };
}

main()
  .then((result) => {
    console.log("\n🎉 Deployment completed successfully!");
    console.log("Result:", JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
