// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SchrodingerPool
 * @notice A time-fragmented AMM with temporal invariant tracking.
 * @dev VULNERABILITY: Temporal Arbitrage.
 * Swaps are validated against the snapshot of (e-1), while liquidity is added at (e).
 */
contract SchrodingerPool {
    // Packed storage to simulate "temporal leaks" mentioned in the prompt
    struct PoolState {
        uint128 reserve0;
        uint128 reserve1;
        uint64 lastTimestamp;
        uint32 currentEpoch;
    }

    PoolState public state;
    address public immutable token0;
    address public immutable token1;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    
    // Historical snapshots
    mapping(uint256 => uint256) public epochLiquidity; // L_e snapshot
    uint256 public constant EPOCH_DURATION = 12 seconds;
    uint256 public constant DECAY_FACTOR = 9950; // 0.5% decay
    uint256 public constant PRECISION = 10000;

    event Mint(address indexed to, uint256 amount0, uint256 amount1, uint256 liquidity);
    event Burn(address indexed to, uint256 amount0, uint256 amount1, uint256 liquidity);
    event Swap(address indexed to, uint256 in0, uint256 in1, uint256 out0, uint256 out1);

    constructor(address _t0, address _t1) {
        token0 = _t0;
        token1 = _t1;
        state.lastTimestamp = uint64(block.timestamp);
    }

    modifier updateEpoch() {
        uint32 newEpoch = uint32((block.timestamp - state.lastTimestamp) / EPOCH_DURATION);
        if (newEpoch > state.currentEpoch) {
            // Snapshot the liquidity of the epoch that just ended
            epochLiquidity[state.currentEpoch] = _sqrt(uint256(state.reserve0) * state.reserve1);
            state.currentEpoch = newEpoch;
        }
        _;
    }

    /**
     * @notice LP Minting (Uses Current Epoch e)
     */
    function mint(uint256 amount0, uint256 amount1) external updateEpoch returns (uint256 liquidity) {
        _transferFrom(token0, msg.sender, amount0);
        _transferFrom(token1, msg.sender, amount1);

        uint256 _totalSupply = totalSupply;
        if (_totalSupply == 0) {
            liquidity = _sqrt(amount0 * amount1);
        } else {
            liquidity = _min((amount0 * _totalSupply) / state.reserve0, (amount1 * _totalSupply) / state.reserve1);
        }

        balanceOf[msg.sender] += liquidity;
        totalSupply += liquidity;
        state.reserve0 += uint128(amount0);
        state.reserve1 += uint128(amount1);

        emit Mint(msg.sender, amount0, amount1, liquidity);
    }

    /**
     * @notice LP Burning (Uses Projected Next Epoch e+1)
     */
    function burn(uint256 liquidity) external updateEpoch returns (uint256 amount0, uint256 amount1) {
        require(balanceOf[msg.sender] >= liquidity, "Low balance");
        
        uint256 _totalSupply = totalSupply;
        
        // Projected value: Applying decay factor for the "future" claim
        amount0 = (liquidity * state.reserve0) / _totalSupply;
        amount1 = (liquidity * state.reserve1) / _totalSupply;
        
        // Temporal Adjustment: Payout is scaled by the decay of the projected epoch
        amount0 = (amount0 * DECAY_FACTOR) / PRECISION;
        amount1 = (amount1 * DECAY_FACTOR) / PRECISION;

        balanceOf[msg.sender] -= liquidity;
        totalSupply -= _totalSupply > liquidity ? liquidity : _totalSupply;
        state.reserve0 -= uint128(amount0);
        state.reserve1 -= uint128(amount1);

        _transfer(token0, msg.sender, amount0);
        _transfer(token1, msg.sender, amount1);
        
        emit Burn(msg.sender, amount0, amount1, liquidity);
    }

    /**
     * @notice Swap (Uses PREVIOUS Epoch e-1 for Invariant)
     */
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external updateEpoch {
        require(amount0Out < state.reserve0 && amount1Out < state.reserve1, "Insuff. Liquidity");

        // Optimistic transfers
        if (amount0Out > 0) _transfer(token0, to, amount0Out);
        if (amount1Out > 0) _transfer(token1, to, amount1Out);

        uint256 balance0 = _balance(token0);
        uint256 balance1 = _balance(token1);

        // THE CATCH: Check invariant against previous epoch's liquidity snapshot
        // If we are in epoch 0, we use current reserves as a fallback
        uint256 kRequired;
        if (state.currentEpoch > 0) {
            uint256 prevL = epochLiquidity[state.currentEpoch - 1];
            kRequired = prevL * prevL;
        } else {
            kRequired = uint256(state.reserve0) * state.reserve1;
        }

        // Standard 0.3% fee adjustment
        uint256 amount0In = balance0 > (state.reserve0 - amount0Out) ? balance0 - (state.reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > (state.reserve1 - amount1Out) ? balance1 - (state.reserve1 - amount1Out) : 0;
        
        uint256 balance0Adj = (balance0 * 1000) - (amount0In * 3);
        uint256 balance1Adj = (balance1 * 1000) - (amount1In * 3);

        require(balance0Adj * balance1Adj >= kRequired * 1000000, "K_TEMPORAL_FAIL");

        state.reserve0 = uint128(balance0);
        state.reserve1 = uint128(balance1);
        emit Swap(to, amount0In, amount1In, amount0Out, amount1Out);
    }

    // --- Helpers ---
    function _sqrt(uint y) internal pure returns (uint z) {
        if (y > 3) { z = y; uint x = y / 2 + 1; while (x < z) { z = x; x = (y / x + x) / 2; } } else if (y != 0) { z = 1; }
    }
    function _min(uint x, uint y) internal pure returns (uint) { return x < y ? x : y; }
    function _transfer(address t, address to, uint v) internal {
        (bool s,) = t.call(abi.encodeWithSignature("transfer(address,uint256)", to, v));
        require(s);
    }
    function _transferFrom(address t, address f, uint v) internal {
        (bool s,) = t.call(abi.encodeWithSignature("transferFrom(address,address,uint256)", f, address(this), v));
        require(s);
    }
    function _balance(address t) internal view returns (uint) {
        return IERC20(t).balanceOf(address(this));
    }
     function getReserves() external view returns (uint256, uint256, uint256) {
        return (reserve0, reserve1, currentEpoch);
    }

    function _sqrt(uint y) internal pure returns (uint z) {
        if (y > 3) { z = y; uint x = y / 2 + 1; while (x < z) { z = x; x = (y / x + x) / 2; } } else if (y != 0) { z = 1; }
    }
    function _min(uint x, uint y) internal pure returns (uint) { return x < y ? x : y; }

}

interface IERC20 { function balanceOf(address a) external view returns (uint); }