// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from,address to,uint256 amount) external returns (bool);
    function balanceOf(address user) external view returns (uint256);
}

interface IOracle {
    function getSpotPrice() external view returns (uint256);
}

contract LendingPool {
    IERC20 public token;
    IERC20 public usdc;
    IOracle public oracle;

    mapping(address => uint256) public collateral;
    mapping(address => uint256) public debt;

    uint256 public constant LTV = 80; // 80%

    constructor(address _token, address _usdc, address _oracle) {
        token = IERC20(_token);
        usdc = IERC20(_usdc);
        oracle = IOracle(_oracle);
    }

    function depositCollateral(uint256 amount) external {
        token.transferFrom(msg.sender, address(this), amount);
        collateral[msg.sender] += amount;
    }

    function borrow(uint256 usdcAmount) external {
        uint256 tokenPrice = oracle.getSpotPrice(); // 💀 spot price oracle
        uint256 collateralValueUSDC = (collateral[msg.sender] * tokenPrice) / 1e18;

        uint256 maxBorrow = (collateralValueUSDC * LTV) / 100;
        require(debt[msg.sender] + usdcAmount <= maxBorrow, "Too much borrow");

        debt[msg.sender] += usdcAmount;
        usdc.transfer(msg.sender, usdcAmount);
    }
}
