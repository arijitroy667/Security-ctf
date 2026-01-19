// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from,address to,uint256 amount) external returns (bool);
    function balanceOf(address user) external view returns (uint256);
}

contract SimpleAMM {
    IERC20 public token;
    IERC20 public usdc;

    uint256 public reserveToken;
    uint256 public reserveUSDC;

    constructor(address _token, address _usdc) {
        token = IERC20(_token);
        usdc = IERC20(_usdc);
    }

    function addLiquidity(uint256 tokenAmount, uint256 usdcAmount) external {
        token.transferFrom(msg.sender, address(this), tokenAmount);
        usdc.transferFrom(msg.sender, address(this), usdcAmount);

        reserveToken += tokenAmount;
        reserveUSDC += usdcAmount;
    }

    // price = reserveUSDC / reserveToken
    function getSpotPrice() public view returns (uint256) {
        require(reserveToken > 0, "No liquidity");
        return (reserveUSDC * 1e18) / reserveToken;
    }

    // buy TOKEN with USDC
    function swapUSDCForToken(uint256 usdcIn) external {
        usdc.transferFrom(msg.sender, address(this), usdcIn);

        // x*y=k
        uint256 k = reserveToken * reserveUSDC;
        uint256 newReserveUSDC = reserveUSDC + usdcIn;
        uint256 newReserveToken = k / newReserveUSDC;

        uint256 tokenOut = reserveToken - newReserveToken;
        require(tokenOut > 0, "No output");

        reserveUSDC = newReserveUSDC;
        reserveToken = newReserveToken;

        token.transfer(msg.sender, tokenOut);
    }

    function swapTokenForUSDC(uint256 TokenIn) external {
        token.transferFrom(msg.sender, address(this), TokenIn);

        // x*y=k
        uint256 k = reserveToken * reserveUSDC;
        uint256 newReserveToken = reserveToken + TokenIn;
        uint256 newReserveUSDC = k / newReserveToken;

        uint256 USDCOut = reserveUSDC - newReserveUSDC;
        require(USDCOut > 0, "No output");

        reserveToken = newReserveToken;
        reserveUSDC = newReserveUSDC;

        usdc.transfer(msg.sender, USDCOut);
    }
}
