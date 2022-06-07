// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {IInterceptor, IERC721, OrderTypes} from "../interfaces/IInterceptor.sol";

contract MockInterceptor is IInterceptor {
    function beforeCollectionTransfer(
        address,
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) external pure override returns (bool) {
        return true;
    }
}
