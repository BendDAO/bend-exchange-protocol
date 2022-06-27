// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.9;

import {IAuthenticatedProxy} from "../interfaces/IAuthenticatedProxy.sol";
import {IAuthorizationManager} from "../interfaces/IAuthorizationManager.sol";
import {IWETH} from "../interfaces/IWETH.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

contract AuthenticatedProxy is IAuthenticatedProxy, Initializable {
    using SafeERC20 for IERC20;
    address public owner;
    IAuthorizationManager public authorizationManager;
    address public WETH;
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

    function initialize(
        address _owner,
        address _authorizationManager,
        address _WETH
    ) external initializer {
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
        IERC20(token).safeTransferFrom(owner, to, amount);
    }

    function withdrawETH() external override onlyOwnerOrAuthed {
        uint256 amount = IWETH(WETH).balanceOf(address(this));
        IWETH(WETH).withdraw(amount);
        Address.sendValue(payable(owner), amount);
    }

    function withdrawToken(address token) external override onlyOwnerOrAuthed {
        uint256 amount = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(owner, amount);
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
