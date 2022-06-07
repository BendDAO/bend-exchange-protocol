// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.9;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILendPool} from "../interceptors/interfaces/ILendPool.sol";
import {MockLendPool} from "./MockLendPool.sol";
import {ILendPoolAddressesProvider} from "../interceptors/interfaces/ILendPoolAddressesProvider.sol";

contract MockLendPoolAddressesProvider is ILendPoolAddressesProvider {
    ILendPool public pool;

    constructor() {
        pool = new MockLendPool();
    }

    function getLendPool() external view returns (address) {
        return address(pool);
    }
}
