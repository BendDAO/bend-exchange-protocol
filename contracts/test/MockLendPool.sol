// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.9;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";

import {ILendPool} from "../interceptors/interfaces/ILendPool.sol";
import {IBNFT, IERC721Receiver} from "../interceptors/interfaces/IBNFT.sol";

import {MockBNFT} from "./MockBNFT.sol";

contract MockLendPool is ILendPool, IERC721Receiver {
    struct LoanData {
        address borrower;
        address reserveAsset;
        uint256 amount;
    }
    using SafeERC20 for IERC20;
    mapping(address => IBNFT) private _mockedBnfts;

    using Counters for Counters.Counter;
    Counters.Counter private _loanIdTracker;

    mapping(address => mapping(uint256 => uint256)) private _nftToLoanIds;

    mapping(address => mapping(uint256 => uint256)) private _mockBidFine;
    mapping(uint256 => LoanData) private _loans;

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external pure override returns (bytes4) {
        operator;
        from;
        tokenId;
        data;
        return IERC721Receiver.onERC721Received.selector;
    }

    function setMockInAuction(
        address nftAsset,
        uint256 nftTokenId,
        uint256 bidFine
    ) external {
        _mockBidFine[nftAsset][nftTokenId] = bidFine;
    }

    function borrow(
        address reserveAsset,
        uint256 amount,
        address nftAsset,
        uint256 nftTokenId,
        address onBehalfOf,
        uint16
    ) external {
        uint256 loanId = _nftToLoanIds[nftAsset][nftTokenId];
        if (loanId > 0) {
            require(_loans[loanId].amount == 0, "MockLendPool: can not borrow more at mock version");
        } else {
            _loanIdTracker.increment();
            loanId = _loanIdTracker.current();
            _nftToLoanIds[nftAsset][nftTokenId] = loanId;
        }
        IBNFT bnft = _mockedBnfts[nftAsset];
        if (address(bnft) == address(0)) {
            bnft = new MockBNFT("BNFT", "BNFT", nftAsset);
            _mockedBnfts[nftAsset] = bnft;
        }
        IERC20(reserveAsset).safeTransfer(msg.sender, amount);
        IERC721(nftAsset).safeTransferFrom(msg.sender, address(bnft), nftTokenId);
        bnft.mint(onBehalfOf, nftTokenId);
        LoanData storage loan = _loans[loanId];
        loan.borrower = onBehalfOf;
        loan.reserveAsset = reserveAsset;
        loan.amount = amount;
    }

    function repay(
        address nftAsset,
        uint256 nftTokenId,
        uint256 amount
    ) external returns (uint256, bool) {
        uint256 loanId = _nftToLoanIds[nftAsset][nftTokenId];
        IBNFT bnft = _mockedBnfts[nftAsset];
        LoanData storage loan = _loans[loanId];
        uint256 repayAmount = loan.amount;
        if (amount < repayAmount) {
            repayAmount = amount;
        }
        if (repayAmount == loan.amount) {
            loan.amount = 0;
            IERC20(loan.reserveAsset).safeTransferFrom(msg.sender, address(this), repayAmount);
            bnft.burn(nftTokenId);
            IERC721(nftAsset).safeTransferFrom(address(this), loan.borrower, nftTokenId);
            return (repayAmount, true);
        } else {
            loan.amount -= repayAmount;
            IERC20(loan.reserveAsset).safeTransferFrom(msg.sender, address(this), repayAmount);
            return (repayAmount, false);
        }
    }

    function redeem(
        address nftAsset,
        uint256 nftTokenId,
        uint256 amount,
        uint256 bidFine
    ) external returns (uint256) {
        uint256 loanId = _nftToLoanIds[nftAsset][nftTokenId];
        LoanData storage loan = _loans[loanId];
        IERC20(loan.reserveAsset).safeTransferFrom(msg.sender, address(this), amount + bidFine);
        loan.amount -= amount;
        require(_mockBidFine[nftAsset][nftTokenId] == bidFine);
        return 0;
    }

    function getNftData(address asset) external view returns (NftData memory) {
        NftData memory _nftData;
        _nftData.bNftAddress = address(_mockedBnfts[asset]);
        return _nftData;
    }

    function getNftDebtData(address nftAsset, uint256 nftTokenId)
        external
        view
        returns (
            uint256 loanId,
            address reserveAsset,
            uint256 totalCollateral,
            uint256 totalDebt,
            uint256 availableBorrows,
            uint256 healthFactor
        )
    {
        loanId = _nftToLoanIds[nftAsset][nftTokenId];
        LoanData memory loan = _loans[loanId];
        return (loanId, loan.reserveAsset, 0, loan.amount, 0, 0);
    }

    function getNftAuctionData(address nftAsset, uint256 nftTokenId)
        external
        view
        returns (
            uint256 loanId,
            address bidderAddress,
            uint256 bidPrice,
            uint256 bidBorrowAmount,
            uint256 bidFine
        )
    {
        uint256 _loanId = _nftToLoanIds[nftAsset][nftTokenId];
        return (_loanId, address(0), 0, 0, _mockBidFine[nftAsset][nftTokenId]);
    }
}
