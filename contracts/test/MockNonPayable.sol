// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.9;
import {IAuthorizationManager} from "../interfaces/IAuthorizationManager.sol";

contract MockNonPayable {
    receive() external payable {
        revert("Non payable");
    }

    function registerProxy(IAuthorizationManager manager) external returns (address) {
        return address(manager.registerProxy());
    }
}
