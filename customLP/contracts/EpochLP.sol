// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title EpochLP - Advanced Liquidity Pool with Epoch Desynchronization
 * 
 * CRITICAL VULNERABILITY: Epoch-based state desynchronization
 * - LP minting uses epoch e
 * - LP burning uses epoch e + 1  
 * - Swap pricing uses epoch e - 1
 * 
 * This creates temporal arbitrage opportunities through asymmetric valuation.
 */
contract EpochLP is ERC20, Ownable {
    // ERC20 tokens for the pool
    IERC20 public tokenA;
    IERC20 public tokenB;
    
    // Epoch management
    uint256 public currentEpoch;
    uint256 public epochDuration = 100; // ~30 minutes (in blocks)
    
    // Epoch-specific reserves (the vulnerability source)
    mapping(uint256 => uint256) public reserveA; // epoch -> reserve
    mapping(uint256 => uint256) public reserveB;
    
    // Total liquidity per epoch
    mapping(uint256 => uint256) public totalLiquidity;
    
    // Events
    event EpochChanged(uint256 newEpoch, uint256 timestamp);
    event LiquidityAdded(address indexed user, uint256 amountA, uint256 amountB, uint256 liquidity, uint256 epoch);
    event LiquidityRemoved(address indexed user, uint256 amountA, uint256 amountB, uint256 liquidity, uint256 epoch);
    event Swap(address indexed user, uint256 amountIn, uint256 amountOut, bool aForB, uint256 epoch);
    
    constructor(
        address _tokenA,
        address _tokenB,
        string memory _name,
        string memory _symbol
    ) ERC20(_name, _symbol) Ownable(msg.sender) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        currentEpoch = block.number / epochDuration;
        
        // Initialize reserves for epoch 0
        reserveA[0] = 1000 * 10**18;
        reserveB[0] = 1000 * 10**18;
        totalLiquidity[0] = 1000 * 10**18;
    }
    
    /**
     * @notice Update epoch if needed
     */
    modifier updateEpoch() {
        uint256 newEpoch = block.number / epochDuration;
        if (newEpoch > currentEpoch) {
            currentEpoch = newEpoch;
            // Carry forward reserves to new epoch
            reserveA[currentEpoch] = reserveA[currentEpoch - 1];
            reserveB[currentEpoch] = reserveB[currentEpoch - 1];
            totalLiquidity[currentEpoch] = totalLiquidity[currentEpoch - 1];
            emit EpochChanged(currentEpoch, block.timestamp);
        }
        _;
    }
    
    /**
     * @notice Add liquidity to the pool
     * VULNERABILITY: Uses current epoch e for valuation
     */
    function addLiquidity(uint256 amountA, uint256 amountB) 
        external 
        updateEpoch 
        returns (uint256 liquidity) 
    {
        require(amountA > 0 && amountB > 0, "Zero amount");
        
        // Calculate optimal amount based on current epoch reserves
        uint256 epochReserveA = reserveA[currentEpoch];
        uint256 epochReserveB = reserveB[currentEpoch];
        
        uint256 amountBOptimal = (amountA * epochReserveB) / epochReserveA;
        
        if (amountB < amountBOptimal) {
            uint256 amountAOptimal = (amountB * epochReserveA) / epochReserveB;
            require(amountA >= amountAOptimal * 995 / 1000, "Insufficient A");
            amountA = amountAOptimal;
        } else {
            amountB = amountBOptimal;
        }
        
        // Calculate liquidity based on current epoch
        uint256 _totalLiquidity = totalLiquidity[currentEpoch];
        if (_totalLiquidity == 0) {
            liquidity = Math.sqrt(amountA * amountB);
        } else {
            liquidity = Math.min(
                (amountA * _totalLiquidity) / epochReserveA,
                (amountB * _totalLiquidity) / epochReserveB
            );
        }
        
        require(liquidity > 0, "Zero liquidity");
        
        // Update reserves for current epoch
        reserveA[currentEpoch] += amountA;
        reserveB[currentEpoch] += amountB;
        totalLiquidity[currentEpoch] += liquidity;
        
        // Transfer tokens
        tokenA.transferFrom(msg.sender, address(this), amountA);
        tokenB.transferFrom(msg.sender, address(this), amountB);
        
        // Mint LP tokens
        _mint(msg.sender, liquidity);
        
        emit LiquidityAdded(msg.sender, amountA, amountB, liquidity, currentEpoch);
    }
    
    /**
     * @notice Remove liquidity from the pool
     * VULNERABILITY: Uses epoch e + 1 for valuation
     */
    function removeLiquidity(uint256 liquidity) 
        external 
        updateEpoch 
        returns (uint256 amountA, uint256 amountB) 
    {
        require(liquidity > 0, "Zero liquidity");
        
        uint256 nextEpoch = currentEpoch + 1;
        
        // Calculate amounts based on NEXT epoch reserves
        uint256 epochReserveA = reserveA[nextEpoch];
        uint256 epochReserveB = reserveB[nextEpoch];
        uint256 _totalLiquidity = totalLiquidity[nextEpoch];
        
        amountA = (liquidity * epochReserveA) / _totalLiquidity;
        amountB = (liquidity * epochReserveB) / _totalLiquidity;
        
        require(amountA > 0 && amountB > 0, "Insufficient liquidity");
        
        // Update reserves for next epoch
        reserveA[nextEpoch] -= amountA;
        reserveB[nextEpoch] -= amountB;
        totalLiquidity[nextEpoch] -= liquidity;
        
        // Burn LP tokens
        _burn(msg.sender, liquidity);
        
        // Transfer tokens
        tokenA.transfer(msg.sender, amountA);
        tokenB.transfer(msg.sender, amountB);
        
        emit LiquidityRemoved(msg.sender, amountA, amountB, liquidity, nextEpoch);
    }
    
    /**
     * @notice Swap tokens
     * VULNERABILITY: Uses epoch e - 1 for pricing
     */
    function swap(uint256 amountIn, bool aForB) 
        external 
        updateEpoch 
        returns (uint256 amountOut) 
    {
        require(amountIn > 0, "Zero amount");
        
        uint256 pricingEpoch = currentEpoch > 0 ? currentEpoch - 1 : 0;
        
        // Use PREVIOUS epoch reserves for pricing
        uint256 epochReserveA = reserveA[pricingEpoch];
        uint256 epochReserveB = reserveB[pricingEpoch];
        
        if (aForB) {
            // Swap A for B - use extremely conservative limits
            require(amountIn <= 1000000000000000000, "Amount too large for swap"); // 1 token max
            
            // Use division first to prevent overflow
            amountOut = (epochReserveB / epochReserveA) * amountIn;
            amountOut = (amountOut * 997) / 1000; // Apply 0.3% fee
            
            // Update CURRENT epoch reserves
            reserveA[currentEpoch] += amountIn;
            reserveB[currentEpoch] -= amountOut;
        } else {
            // Swap B for A - use extremely conservative limits
            require(amountIn <= 1000000000000000000, "Amount too large for swap"); // 1 token max
            
            // Use division first to prevent overflow
            amountOut = (epochReserveA / epochReserveB) * amountIn;
            amountOut = (amountOut * 997) / 1000; // Apply 0.3% fee
            
            // Update CURRENT epoch reserves
            reserveB[currentEpoch] += amountIn;
            reserveA[currentEpoch] -= amountOut;
        }
        
        require(amountOut > 0, "Insufficient output");
        
        // Transfer tokens
        if (aForB) {
            tokenA.transferFrom(msg.sender, address(this), amountIn);
            tokenB.transfer(msg.sender, amountOut);
        } else {
            tokenB.transferFrom(msg.sender, address(this), amountIn);
            tokenA.transfer(msg.sender, amountOut);
        }
        
        emit Swap(msg.sender, amountIn, amountOut, aForB, pricingEpoch);
    }
    
    /**
     * @notice Get current reserves for display
     */
    function getCurrentReserves() external view returns (uint256 _reserveA, uint256 _reserveB) {
        return (reserveA[currentEpoch], reserveB[currentEpoch]);
    }
    
    /**
     * @notice Get pricing reserves (what swaps actually use)
     */
    function getPricingReserves() external view returns (uint256 _reserveA, uint256 _reserveB) {
        uint256 pricingEpoch = currentEpoch > 0 ? currentEpoch - 1 : 0;
        return (reserveA[pricingEpoch], reserveB[pricingEpoch]);
    }
    
    /**
     * @notice Get all epoch data for analysis
     */
    function getEpochData(uint256 epoch) external view returns (
        uint256 _reserveA,
        uint256 _reserveB,
        uint256 _liquidity
    ) {
        return (reserveA[epoch], reserveB[epoch], totalLiquidity[epoch]);
    }
}
