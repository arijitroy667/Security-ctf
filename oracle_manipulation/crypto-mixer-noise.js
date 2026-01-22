const { ethers } = require("ethers");

async function generateCryptoMixerNoise() {
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const fundedWallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
    
    console.log("🔧 CryptoMixer Noise Generator");
    console.log(`📡 Funded wallet: ${fundedWallet.address}`);
    
    const balance = await provider.getBalance(fundedWallet.address);
    console.log(`💰 Initial balance: ${ethers.formatEther(balance)} ETH`);
    
    const numWallets = 6;
    const wallets = [];
    
    console.log("\n🔑 Creating temporary wallets...");
    for (let i = 0; i < numWallets; i++) {
        const wallet = ethers.Wallet.createRandom();
        wallets.push(new ethers.Wallet(wallet.privateKey, provider));
        console.log(`  Wallet ${i + 1}: ${wallets[i].address}`);
    }
    
    console.log("\n💸 Funding wallets...");
    const fundAmount = ethers.parseEther("0.5");
    const fundingTxs = [];
    
    for (let i = 0; i < numWallets; i++) {
        try {
            const tx = await fundedWallet.sendTransaction({
                to: wallets[i].address,
                value: fundAmount,
                gasLimit: 21000
            });
            fundingTxs.push(tx);
            console.log(`  Fund ${wallets[i].address}: ${tx.hash}`);
            await provider.waitForTransaction(tx.hash, 1);
        } catch (error) {
            console.log(`  ❌ Funding failed: ${error.message}`);
        }
    }
    
    console.log("\n🔄 Generating noise transactions...");
    const allTxs = [...fundingTxs];
    
    for (let round = 0; round < 4; round++) {
        console.log(`\n📍 Round ${round + 1}:`);
        
        for (let i = 0; i < numWallets; i++) {
            const senderIndex = Math.floor(Math.random() * numWallets);
            let receiverIndex = Math.floor(Math.random() * numWallets);
            
            while (receiverIndex === senderIndex) {
                receiverIndex = Math.floor(Math.random() * numWallets);
            }
            
            const sender = wallets[senderIndex];
            const receiver = wallets[receiverIndex];
            const amount = ethers.parseEther(
                (Math.random() * 0.19 + 0.01).toFixed(6)
            );
            
            try {
                const tx = await sender.sendTransaction({
                    to: receiver.address,
                    value: amount,
                    gasLimit: 21000
                });
                
                allTxs.push(tx);
                console.log(`  ${sender.address.slice(0, 8)}... → ${receiver.address.slice(0, 8)}... (${ethers.formatEther(amount)} ETH): ${tx.hash}`);
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                console.log(`  ❌ Failed: ${error.message}`);
            }
        }
        
        if (round < 3) {
            console.log("⏳ Waiting between rounds...");
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    console.log("\n🔀 Creating cross-wallet transactions...");
    for (let i = 0; i < 10; i++) {
        const senderIndex = Math.floor(Math.random() * numWallets);
        const receiverIndex = Math.floor(Math.random() * numWallets);
        
        while (receiverIndex === senderIndex) {
            receiverIndex = Math.floor(Math.random() * numWallets);
        }
        
        const sender = wallets[senderIndex];
        const receiver = wallets[receiverIndex];
        const amount = ethers.parseEther(
            (Math.random() * 0.15 + 0.005).toFixed(6)
        );
        
        try {
            const tx = await sender.sendTransaction({
                to: receiver.address,
                value: amount,
                gasLimit: 21000
            });
            
            allTxs.push(tx);
            console.log(`  Cross-tx ${sender.address.slice(0, 8)}... → ${receiver.address.slice(0, 8)}... (${ethers.formatEther(amount)} ETH): ${tx.hash}`);
            await new Promise(resolve => setTimeout(resolve, 300));
            
        } catch (error) {
            console.log(`  ❌ Cross-tx failed: ${error.message}`);
        }
    }
    
    console.log("\n🔄 Consolidating remaining ETH...");
    for (let i = 0; i < numWallets; i++) {
        const wallet = wallets[i];
        const balance = await provider.getBalance(wallet.address);
        
        if (balance > ethers.parseEther("0.02")) {
            try {
                const gasPrice = await provider.getFeeData();
                const gasLimit = 21000;
                const gasCost = gasPrice.gasPrice * gasLimit;
                const amountToSend = balance - gasCost;
                
                if (amountToSend > 0) {
                    const tx = await wallet.sendTransaction({
                        to: fundedWallet.address,
                        value: amountToSend,
                        gasLimit
                    });
                    allTxs.push(tx);
                    console.log(`  Return ${wallet.address.slice(0, 8)}... → funded: ${tx.hash}`);
                }
            } catch (error) {
                console.log(`  ❌ Return failed: ${error.message}`);
            }
        }
    }
    
    console.log("\n⏳ Waiting for all transactions to confirm...");
    for (const tx of allTxs) {
        try {
            await provider.waitForTransaction(tx.hash, 1);
        } catch (error) {
            console.log(`  ❌ Wait failed for ${tx.hash}: ${error.message}`);
        }
    }
    
    console.log("\n📊 SUMMARY");
    console.log(`✅ Total funding transactions: ${fundingTxs.length}`);
    console.log(`✅ Total noise transactions: ${allTxs.length - fundingTxs.length}`);
    console.log(`✅ Total transactions generated: ${allTxs.length}`);
    
    console.log("\n🔗 ALL TRANSACTION HASHES:");
    allTxs.forEach((tx, index) => {
        console.log(`${index + 1}. ${tx.hash}`);
    });
    
    console.log("\n📦 Recent block analysis:");
    const latestBlock = await provider.getBlock("latest");
    console.log(`Latest block: ${latestBlock.number}`);
    console.log(`Transactions in latest block: ${latestBlock.transactions.length}`);
    
    let totalTxsInBlocks = 0;
    for (let i = 0; i < 5; i++) {
        try {
            const block = await provider.getBlock(latestBlock.number - i);
            totalTxsInBlocks += block.transactions.length;
            console.log(`Block ${latestBlock.number - i}: ${block.transactions.length} transactions`);
        } catch (error) {
            break;
        }
    }
    
    console.log(`Average transactions per block (last 5): ${(totalTxsInBlocks / Math.min(5, latestBlock.number + 1)).toFixed(1)}`);
    
    if (totalTxsInBlocks > 5) {
        console.log("✅ Multiple transactions per block - mixer activity obscured!");
    } else {
        console.log("⚠️  Low transaction density - mixer may still be traceable");
    }
}

generateCryptoMixerNoise().catch(console.error);