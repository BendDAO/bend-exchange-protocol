// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockNonTransferERC20 is ERC20 {
    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {
        //
    }

    function transfer(address, uint256) public pure override returns (bool) {
        return false;
    }

    function transferFrom(
        address,
        address,
        uint256
    ) public pure override returns (bool) {
        return false;
    }
}
