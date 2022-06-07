// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ITransfer} from "../interfaces/ITransfer.sol";
import {IInterceptor} from "../interfaces/IInterceptor.sol";
import {IAuthenticatedProxy} from "../interfaces/IAuthenticatedProxy.sol";
import {OrderTypes} from "../libraries/OrderTypes.sol";

library SafeProxy {
    function safeTransferNonFungibleTokenFrom(
        IAuthenticatedProxy proxy,
        address transfer,
        address interceptor,
        address token,
        address from,
        address to,
        uint256 tokenId,
        uint256 amount,
        bytes memory extra
    ) internal {
        if (interceptor != address(0)) {
            safeDelegateCall(
                proxy,
                interceptor,
                abi.encodeWithSelector(
                    IInterceptor(interceptor).beforeCollectionTransfer.selector,
                    token,
                    from,
                    to,
                    tokenId,
                    amount,
                    extra
                ),
                "SafeProxy: before transfer did not succeed"
            );
        }
        safeDelegateCall(
            proxy,
            transfer,
            abi.encodeWithSelector(
                ITransfer(transfer).transferNonFungibleToken.selector,
                token,
                from,
                to,
                tokenId,
                amount
            ),
            "SafeProxy: transfer did not succeed"
        );
    }

    function safeDelegateCall(
        IAuthenticatedProxy proxy,
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal {
        (bool success, bytes memory returndata) = proxy.delegatecall(target, data);
        _verifyCallResult(success, returndata, "SafeProxy: low-level delegate call failed");

        if (returndata.length > 0) {
            // Return data is optional
            require(abi.decode(returndata, (bool)), errorMessage);
        }
    }

    function _verifyCallResult(
        bool success,
        bytes memory returndata,
        string memory errorMessage
    ) internal pure returns (bytes memory) {
        if (success) {
            return returndata;
        } else {
            // Look for revert reason and bubble it up if present
            if (returndata.length > 0) {
                // The easiest way to bubble the revert reason is using memory via assembly
                assembly {
                    let returndata_size := mload(returndata)
                    revert(add(32, returndata), returndata_size)
                }
            } else {
                revert(errorMessage);
            }
        }
    }
}
