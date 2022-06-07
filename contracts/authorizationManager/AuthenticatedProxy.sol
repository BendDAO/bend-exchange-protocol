// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.9;

import {IAuthenticatedProxy} from "../interfaces/IAuthenticatedProxy.sol";
import {IAuthorizationManager} from "../interfaces/IAuthorizationManager.sol";
import {IWETH} from "../interfaces/IWETH.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AuthenticatedProxy is IAuthenticatedProxy {
    address public immutable owner;
    IAuthorizationManager public immutable authorizationManager;
    address public immutable WETH;
    bool public revoked;

    event Revoked(bool revoked);

    modifier onlyOwnerOrAuthed() {
        require(
            msg.sender == owner ||
                (!revoked && !authorizationManager.revoked() && msg.sender == authorizationManager.authorizedAddress()),
            "Proxy: permission denied"
        );
        _;
    }

    constructor(
        address _owner,
        address _authorizationManager,
        address _WETH
    ) {
        owner = _owner;
        authorizationManager = IAuthorizationManager(_authorizationManager);
        WETH = _WETH;
    }

    function setRevoke(bool revoke) external override {
        require(msg.sender == owner, "Proxy: permission denied");
        revoked = revoke;
        emit Revoked(revoke);
    }

    function safeTransfer(
        address token,
        address to,
        uint256 amount
    ) external override onlyOwnerOrAuthed {
        require(IERC20(token).transferFrom(owner, to, amount), "Proxy: transfer failed");
    }

    function withdrawETH() external override onlyOwnerOrAuthed {
        uint256 amount = IWETH(WETH).balanceOf(address(this));
        IWETH(WETH).withdraw(amount);
        (bool success, ) = owner.call{value: amount}("");
        require(success, "Proxy: withdraw ETH failed");
    }

    function withdrawToken(address token) external override onlyOwnerOrAuthed {
        uint256 amount = IERC20(token).balanceOf(address(this));
        require(IERC20(token).transfer(owner, amount), "Proxy: withdraw token failed");
    }

    function delegatecall(address dest, bytes memory data)
        external
        override
        onlyOwnerOrAuthed
        returns (bool success, bytes memory returndata)
    {
        (success, returndata) = dest.delegatecall(data);
    }

    receive() external payable {
        require(msg.sender == address(WETH), "Receive not allowed");
    }
}
