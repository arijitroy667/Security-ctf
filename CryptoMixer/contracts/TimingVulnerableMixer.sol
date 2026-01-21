// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TimingVulnerableMixer
 * @notice A simplified crypto mixer vulnerable to timing analysis attacks
 * 
 * VULNERABILITY: This mixer doesn't enforce minimum anonymity sets.
 * When a withdrawal occurs in a block with only one transaction,
 * the depositor-to-withdrawer link is trivially traceable.
 * 
 * CTF GOAL: Demonstrate how timing analysis can break mixer privacy
 * by identifying blocks with isolated transactions.
 */
contract TimingVulnerableMixer {
    uint256 public constant DENOMINATION = 1 ether;
    
    // Deposit tracking
    struct DepositInfo {
        bytes32 commitment;
        uint256 depositBlock;
        uint256 depositTimestamp;
        bool withdrawn;
    }
    
    // Withdrawal tracking for analysis
    struct WithdrawalInfo {
        address recipient;
        uint256 withdrawBlock;
        uint256 withdrawTimestamp;
        bytes32 nullifier;
    }
    
    // commitment => DepositInfo
    mapping(bytes32 => DepositInfo) public deposits;
    
    // nullifier => spent?
    mapping(bytes32 => bool) public nullifierSpent;
    
    // Block number => transaction count (for timing analysis)
    mapping(uint256 => uint256) public blockTransactionCount;
    
    // All commitments for enumeration
    bytes32[] public allCommitments;
    
    // All withdrawals for enumeration
    WithdrawalInfo[] public allWithdrawals;
    
    // Events for blockchain analysis
    event Deposit(
        bytes32 indexed commitment, 
        uint256 indexed blockNumber,
        uint256 timestamp,
        uint256 depositIndex
    );
    
    event Withdraw(
        address indexed recipient, 
        bytes32 indexed nullifier,
        uint256 indexed blockNumber,
        uint256 timestamp,
        uint256 withdrawIndex
    );
    
    /**
     * @notice Deposit ETH into the mixer
     * @param commitment Hash commitment (keccak256(secret, DENOMINATION))
     */
    function deposit(bytes32 commitment) external payable {
        require(msg.value == DENOMINATION, "Wrong denomination");
        require(deposits[commitment].depositBlock == 0, "Commitment already used");
        
        deposits[commitment] = DepositInfo({
            commitment: commitment,
            depositBlock: block.number,
            depositTimestamp: block.timestamp,
            withdrawn: false
        });
        
        allCommitments.push(commitment);
        blockTransactionCount[block.number]++;
        
        emit Deposit(commitment, block.number, block.timestamp, allCommitments.length - 1);
    }
    
    /**
     * @notice Withdraw ETH from the mixer
     * @param secret The secret preimage
     * @param recipient The withdrawal destination
     * 
     * ⚠️ VULNERABILITY: No check for minimum anonymity set size!
     * If this is the only transaction in the block, timing analysis
     * can link the deposit to this withdrawal.
     */
    function withdraw(bytes32 secret, address payable recipient) external {
        bytes32 nullifier = keccak256(abi.encodePacked(secret));
        require(!nullifierSpent[nullifier], "Already withdrawn");
        
        bytes32 commitment = keccak256(abi.encodePacked(secret, DENOMINATION));
        require(deposits[commitment].depositBlock > 0, "No such deposit");
        require(!deposits[commitment].withdrawn, "Already withdrawn");
        
        // Mark as spent
        nullifierSpent[nullifier] = true;
        deposits[commitment].withdrawn = true;
        
        // Track withdrawal info for analysis
        allWithdrawals.push(WithdrawalInfo({
            recipient: recipient,
            withdrawBlock: block.number,
            withdrawTimestamp: block.timestamp,
            nullifier: nullifier
        }));
        
        blockTransactionCount[block.number]++;
        
        emit Withdraw(
            recipient, 
            nullifier, 
            block.number, 
            block.timestamp, 
            allWithdrawals.length - 1
        );
        
        // Transfer ETH
        (bool ok,) = recipient.call{value: DENOMINATION}("");
        require(ok, "Transfer failed");
    }
    
    // ============ VIEW FUNCTIONS FOR ANALYSIS ============
    
    function getDepositCount() external view returns (uint256) {
        return allCommitments.length;
    }
    
    function getWithdrawalCount() external view returns (uint256) {
        return allWithdrawals.length;
    }
    
    function getWithdrawal(uint256 index) external view returns (
        address recipient,
        uint256 withdrawBlock,
        uint256 withdrawTimestamp,
        bytes32 nullifier
    ) {
        WithdrawalInfo memory w = allWithdrawals[index];
        return (w.recipient, w.withdrawBlock, w.withdrawTimestamp, w.nullifier);
    }
    
    function getBlockTxCount(uint256 blockNum) external view returns (uint256) {
        return blockTransactionCount[blockNum];
    }
    
    function mixerBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /**
     * @notice Check if a block has an isolated transaction (privacy leak!)
     * @param blockNum The block number to check
     * @return true if only one mixer transaction occurred in this block
     */
    function isIsolatedBlock(uint256 blockNum) external view returns (bool) {
        return blockTransactionCount[blockNum] == 1;
    }
}
