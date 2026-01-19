// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./FogBankMixer.sol";

contract MixerChallenge {
    FogBankMixer public mixer;

    constructor() payable {
        mixer = new FogBankMixer();
    }

    // fund mixer with some deposits (simulates honest users)
    function seedMixer(bytes32[] calldata commitments) external payable {
        require(msg.value == commitments.length * 1 ether, "Bad value");

        for (uint256 i = 0; i < commitments.length; i++) {
            mixer.deposit{value: 1 ether}(commitments[i]);
        }
    }

    function isSolved() external view returns (bool) {
        return address(mixer).balance == 0;
    }
}
