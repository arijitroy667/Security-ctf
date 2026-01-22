// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployableContract.sol";

contract Create2Factory {
    event ContractDeployed(address indexed deployedAddress, bytes32 indexed salt, address indexed deployer);
    
    function deploy(
        bytes32 salt,
        address _owner,
        string memory _message,
        uint256 _value
    ) external returns (address) {
        bytes memory bytecode = type(DeployableContract).creationCode;
        
        bytes memory initData = abi.encodePacked(
            bytecode,
            abi.encode(_owner, _message, _value)
        );
        
        address deployedAddress;
        assembly {
            deployedAddress := create2(0, add(initData, 0x20), mload(initData), salt)
        }
        
        require(deployedAddress != address(0), "Deployment failed");
        
        emit ContractDeployed(deployedAddress, salt, msg.sender);
        return deployedAddress;
    }
    
    function getDeploymentAddress(
        bytes32 salt,
        address _owner,
        string memory _message,
        uint256 _value
    ) external view returns (address) {
        bytes memory bytecode = type(DeployableContract).creationCode;
        bytes memory initData = abi.encodePacked(
            bytecode,
            abi.encode(_owner, _message, _value)
        );
        
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(initData)
            )
        );
        
        return address(uint160(uint256(hash)));
    }
}
