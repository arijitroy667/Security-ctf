const { ethers } = require("ethers");

async function fundAccount() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  
  // The pre-funded Hardhat account
  const fundedAccount = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
  
  console.log("=== Account Funding Script ===");
  console.log(`Funded account: ${fundedAccount.address}`);
  
  const fundedBalance = await provider.getBalance(fundedAccount.address);
  console.log(`Funded account balance: ${ethers.formatEther(fundedBalance)} ETH`);
  
  // Please provide your MetaMask account address here
  const yourAddress = "YOUR_METAMASK_ADDRESS_HERE"; // Replace with your actual address
  
  if (yourAddress === "YOUR_METAMASK_ADDRESS_HERE") {
    console.log("\n⚠️  Please update the script with your MetaMask address:");
    console.log("1. Copy your MetaMask address");
    console.log("2. Replace 'YOUR_METAMASK_ADDRESS_HERE' in this script");
    console.log("3. Run the script again");
    return;
  }
  
  console.log(`\nFunding your account: ${yourAddress}`);
  
  // Check your current balance
  const yourBalance = await provider.getBalance(yourAddress);
  console.log(`Your current balance: ${ethers.formatEther(yourBalance)} ETH`);
  
  // Send 10 ETH to your account
  const tx = {
    to: yourAddress,
    value: ethers.parseEther("10.0")
  };
  
  console.log("Sending 10 ETH...");
  const transaction = await fundedAccount.sendTransaction(tx);
  console.log(`Transaction hash: ${transaction.hash}`);
  
  const receipt = await transaction.wait();
  console.log(`Transaction confirmed! Gas used: ${receipt.gasUsed.toString()}`);
  
  // Check new balance
  const newBalance = await provider.getBalance(yourAddress);
  console.log(`Your new balance: ${ethers.formatEther(newBalance)} ETH`);
  
  console.log("\n✅ Funding complete! You can now use the dApp.");
}

fundAccount().catch(console.error);
