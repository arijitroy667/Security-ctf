// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SchrodingerPool {
    // 1. Explicit State Variables
    address public immutable token0;
    address public immutable token1;

    uint256 public reserve0;
    uint256 public reserve1;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;

    uint256 public currentEpoch;
    uint256 public constant EPOCH_DURATION = 12; // 12 seconds
    uint256 public epochStartTime;

    mapping(uint256 => uint256) public epochLiquidity;

    uint256 public constant DECAY_FACTOR = 9950;
    uint256 public constant DECAY_DENOMINATOR = 10000;

    // 2. Constructor
    constructor(address _token0, address _token1) {
        require(_token0 != address(0) && _token1 != address(0), "Zero address");
        token0 = _token0;
        token1 = _token1;
        epochStartTime = block.timestamp;
    }

    // 3. Modifier
    modifier updateEpoch() {
        uint256 elapsed = block.timestamp - epochStartTime;
        uint256 newEpoch = elapsed / EPOCH_DURATION;
        if (newEpoch > currentEpoch) {
            // This line uses the global reserve0 and reserve1
            epochLiquidity[currentEpoch] = uint256(sqrt(reserve0 * reserve1));
            currentEpoch = newEpoch;
        }
        _;
    }

    // 4. Core Functions
    function mint(
        address to,
        uint256 amount0,
        uint256 amount1
    ) external updateEpoch returns (uint256 liquidity) {
        IERC20(token0).transferFrom(msg.sender, address(this), amount0);
        IERC20(token1).transferFrom(msg.sender, address(this), amount1);

        uint256 _totalSupply = totalSupply;
        if (_totalSupply == 0) {
            liquidity = sqrt(amount0 * amount1);
        } else {
            // Accessing reserve0 and reserve1 directly
            uint256 l0 = (amount0 * _totalSupply) / reserve0;
            uint256 l1 = (amount1 * _totalSupply) / reserve1;
            liquidity = l0 < l1 ? l0 : l1;
        }

        balanceOf[to] += liquidity;
        totalSupply = _totalSupply + liquidity;
        reserve0 += amount0;
        reserve1 += amount1;
    }

    function burn(
        address to,
        uint256 liquidity
    ) external updateEpoch returns (uint256 amount0, uint256 amount1) {
        require(balanceOf[msg.sender] >= liquidity, "Low LP balance");
        uint256 _totalSupply = totalSupply;

        amount0 = (liquidity * reserve0) / _totalSupply;
        amount1 = (liquidity * reserve1) / _totalSupply;

        // Decay logic
        amount0 = (amount0 * DECAY_FACTOR) / DECAY_DENOMINATOR;
        amount1 = (amount1 * DECAY_FACTOR) / DECAY_DENOMINATOR;

        balanceOf[msg.sender] -= liquidity;
        totalSupply = _totalSupply - liquidity;
        reserve0 -= amount0;
        reserve1 -= amount1;

        IERC20(token0).transfer(to, amount0);
        IERC20(token1).transfer(to, amount1);
    }

    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to
    ) external updateEpoch {
        require(amount0Out < reserve0 && amount1Out < reserve1, "Low reserves");

        if (amount0Out > 0) IERC20(token0).transfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).transfer(to, amount1Out);

        uint256 b0 = IERC20(token0).balanceOf(address(this));
        uint256 b1 = IERC20(token1).balanceOf(address(this));

        uint256 kReq;
        if (currentEpoch > 0 && epochLiquidity[currentEpoch - 1] > 0) {
            kReq =
                epochLiquidity[currentEpoch - 1] *
                epochLiquidity[currentEpoch - 1];
        } else {
            kReq = reserve0 * reserve1;
        }

        require(b0 * b1 >= kReq, "K_FAIL");

        reserve0 = b0;
        reserve1 = b1;
    }

    // 5. Getter (Flattened returns to avoid naming collisions)
    function getReserves() external view returns (uint256, uint256, uint256) {
        return (reserve0, reserve1, currentEpoch);
    }

    // 6. Math Helpers
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
