const { ethers } = require("ethers");

async function generateCryptoMixerNoise() {
    console.log("🔧 CryptoMixer Noise Generator - Working Version");
    
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const fundedWallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
    
    console.log(`📡 Funded wallet: ${fundedWallet.address}`);
    
    const balance = await provider.getBalance(fundedWallet.address);
    console.log(`💰 Initial balance: ${ethers.formatEther(balance)} ETH`);
    
    // Create 4 temporary wallets
    const wallets = [];
    console.log("\n🔑 Creating temporary wallets...");
    for (let i = 0; i < 4; i++) {
        const wallet = ethers.Wallet.createRandom();
        wallets.push(new ethers.Wallet(wallet.privateKey, provider));
        console.log(`  Wallet ${i + 1}: ${wallets[i].address}`);
    }
    
    // Fund wallets
    console.log("\n💸 Funding wallets...");
    const fundAmount = ethers.parseEther("0.5");
    const allTxs = [];
    
    for (let i = 0; i < 4; i++) {
        const tx = await fundedWallet.sendTransaction({
            to: wallets[i].address,
            value: fundAmount,
            gasLimit: 21000
        });
        allTxs.push(tx);
        console.log(`  Fund ${wallets[i].address}: ${tx.hash}`);
        await provider.waitForTransaction(tx.hash, 1);
    }
    
    // Generate noise transactions
    console.log("\n🔄 Generating noise transactions...");
    
    for (let round = 0; round < 3; round++) {
        console.log(`\n📍 Round ${round + 1}:`);
        
        for (let i = 0; i < 4; i++) {
            const senderIdx = Math.floor(Math.random() * 4);
            let receiverIdx = Math.floor(Math.random() * 4);
            
            while (receiverIdx === senderIdx) {
                receiverIdx = Math.floor(Math.random() * 4);
            }
            
            const sender = wallets[senderIdx];
            const receiver = wallets[receiverIdx];
            const amount = ethers.parseEther((Math.random() * 0.1 + 0.01).toFixed(6));
            
            try {
                const tx = await sender.sendTransaction({
                    to: receiver.address,
                    value: amount,
                    gasLimit: 21000
                });
                
                allTxs.push(tx);
                console.log(`  ${sender.address.slice(0, 8)}... → ${receiver.address.slice(0, 8)}... (${ethers.formatEther(amount)} ETH): ${tx.hash}`);
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.log(`  ❌ Failed: ${error.message}`);
            }
        }
        
        if (round < 2) {
            console.log("⏳ Waiting between rounds...");
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // Additional transactions
    console.log("\n🔀 Creating additional transactions...");
    for (let i = 0; i < 6; i++) {
        const senderIdx = Math.floor(Math.random() * 4);
        let receiverIdx = Math.floor(Math.random() * 4);
        
        while (receiverIdx === senderIdx) {
            receiverIdx = Math.floor(Math.random() * 4);
        }
        
        const sender = wallets[senderIdx];
        const receiver = wallets[receiverIdx];
        const amount = ethers.parseEther((Math.random() * 0.08 + 0.005).toFixed(6));
        
        try {
            const tx = await sender.sendTransaction({
                to: receiver.address,
                value: amount,
                gasLimit: 21000
            });
            
            allTxs.push(tx);
            console.log(`  Extra ${sender.address.slice(0, 8)}... → ${receiver.address.slice(0, 8)}... (${ethers.formatEther(amount)} ETH): ${tx.hash}`);
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.log(`  ❌ Extra failed: ${error.message}`);
        }
    }
    
    // Summary
    console.log("\n📊 SUMMARY");
    console.log(`✅ Total transactions generated: ${allTxs.length}`);
    
    console.log("\n🔗 ALL TRANSACTION HASHES:");
    allTxs.forEach((tx, index) => {
        console.log(`${index + 1}. ${tx.hash}`);
    });
    
    // Block analysis
    console.log("\n📦 Block analysis:");
    const latestBlock = await provider.getBlock("latest");
    console.log(`Latest block: ${latestBlock.number}`);
    console.log(`Transactions in latest block: ${latestBlock.transactions.length}`);
    
    let totalTxs = 0;
    for (let i = 0; i < 3; i++) {
        try {
            const block = await provider.getBlock(latestBlock.number - i);
            totalTxs += block.transactions.length;
            console.log(`Block ${latestBlock.number - i}: ${block.transactions.length} transactions`);
        } catch (error) {
            break;
        }
    }
    
    console.log(`Average transactions per block (last 3): ${(totalTxs / Math.min(3, latestBlock.number + 1)).toFixed(1)}`);
    
    if (totalTxs > 3) {
        console.log("✅ Multiple transactions per block - mixer activity obscured!");
    } else {
        console.log("⚠️  Low transaction density - consider running again");
    }
    
    console.log("\n🎯 CTF Objective Complete: Transaction noise generated successfully!");
}

generateCryptoMixerNoise().catch(console.error);