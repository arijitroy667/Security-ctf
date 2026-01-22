// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract DeployableContract {
    address public owner;
    string public message;
    uint256 public value;
    
    event MessageUpdated(string newMessage, address updatedBy);
    event ValueUpdated(uint256 newValue, address updatedBy);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    
    modifier onlyOwner {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    constructor(address _owner, string memory _message, uint256 _value) {
        owner = _owner;
        message = _message;
        value = _value;
    }
    
    function updateMessage(string memory _newMessage) external onlyOwner {
        message = _newMessage;
        emit MessageUpdated(_newMessage, msg.sender);
    }
    
    function updateValue(uint256 _newValue) external onlyOwner {
        value = _newValue;
        emit ValueUpdated(_newValue, msg.sender);
    }
    
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "New owner cannot be zero address");
        emit OwnershipTransferred(owner, _newOwner);
        owner = _newOwner;
    }
    
    function getMessage() external view returns (string memory) {
        return message;
    }
    
    function getValue() external view returns (uint256) {
        return value;
    }
}
