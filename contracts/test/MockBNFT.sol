// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.9;

import {IBNFT, IERC721Receiver} from "../interceptors/interfaces/IBNFT.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721Enumerable, ERC721} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract MockBNFT is ERC721Enumerable, IBNFT {
    address private _underlyingAsset;

    constructor(
        string memory name_,
        string memory symbol_,
        address underlyingAsset_
    ) ERC721(name_, symbol_) {
        _underlyingAsset = underlyingAsset_;
    }

    function mint(address to, uint256 tokenId) external override {
        _mint(to, tokenId);
    }

    function burn(uint256 tokenId) external override {
        IERC721(_underlyingAsset).safeTransferFrom(address(this), _msgSender(), tokenId);
        _burn(tokenId);
    }

    function underlyingAsset() external view override returns (address) {
        return _underlyingAsset;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
