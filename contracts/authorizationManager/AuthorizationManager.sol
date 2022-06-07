// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.9;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAuthorizationManager, IAuthenticatedProxy} from "../interfaces/IAuthorizationManager.sol";

import {AuthenticatedProxy} from "./AuthenticatedProxy.sol";

contract AuthorizationManager is Ownable, IAuthorizationManager {
    mapping(address => address) public override proxies;
    address public immutable override authorizedAddress;
    bool public override revoked;
    address public immutable WETH;

    event Revoked();

    constructor(address _WETH, address _authorizedAddress) {
        WETH = _WETH;
        authorizedAddress = _authorizedAddress;
    }

    function revoke() external override onlyOwner {
        revoked = true;
        emit Revoked();
    }

    /**
     * Register a proxy contract with this registry
     *
     * @dev Must be called by the user which the proxy is for, creates a new AuthenticatedProxy
     * @return proxy New AuthenticatedProxy contract
     */
    function registerProxy() external override returns (address) {
        return _registerProxyFor(msg.sender);
    }

    function _registerProxyFor(address user) internal returns (address) {
        require(address(proxies[user]) == address(0), "Authorization: user already has a proxy");
        address proxy = address(new AuthenticatedProxy(user, address(this), WETH));
        proxies[user] = proxy;
        return proxy;
    }
}
