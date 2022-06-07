// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {ITransfer, IERC721} from "../interfaces/ITransfer.sol";

/**
 * @title TransferNonCompliantERC721
 * @notice It allows the transfer of ERC721 tokens without safeTransferFrom.
 */
contract TransferNonCompliantERC721 is ITransfer {
    function transferNonFungibleToken(
        address token,
        address from,
        address to,
        uint256 tokenId,
        uint256
    ) external override returns (bool) {
        IERC721(token).transferFrom(from, to, tokenId);
        return true;
    }
}
