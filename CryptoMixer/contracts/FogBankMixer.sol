// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FogBankMixer {
    uint256 public constant DENOMINATION = 1 ether;

    // commitment => deposited?
    mapping(bytes32 => bool) public commitments;

    // nullifier => spent?
    mapping(bytes32 => bool) public nullifierSpent;

    event Deposit(bytes32 indexed commitment);
    event Withdraw(address indexed to, bytes32 indexed nullifier);

    // deposit fixed amount
    function deposit(bytes32 commitment) external payable {
        require(msg.value == DENOMINATION, "Wrong denomination");
        require(!commitments[commitment], "Commitment already used");

        commitments[commitment] = true;
        emit Deposit(commitment);
    }

    /*
        "Proof" here is simplified:
        - user provides secret (preimage)
        - nullifier = keccak256(secret)
        - commitment = keccak256(secret, 1 ether)

        Real mixers use zkSNARKs, but this is a CTF.
    */
    function withdraw(bytes32 secret, address payable to) external {
        bytes32 nullifier = keccak256(abi.encodePacked(secret));
        require(!nullifierSpent[nullifier], "Already withdrawn");

        bytes32 commitment = keccak256(abi.encodePacked(secret, DENOMINATION));
        require(commitments[commitment], "No such deposit");

        // ❌ BUG #1: Sends ETH before marking nullifier spent (reentrancy window)
        (bool ok,) = to.call{value: DENOMINATION}("");
        require(ok, "Transfer failed");

        // ❌ BUG #2: nullifier not bound to msg.sender OR to "to" in any safe way
        // Anyone seeing secret in mempool can withdraw to themselves.

        nullifierSpent[nullifier] = true;

        emit Withdraw(to, nullifier);
    }

    function mixerBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
