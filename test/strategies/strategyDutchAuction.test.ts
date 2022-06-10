import { assert, expect } from "chai";
import { BigNumber, constants, utils } from "ethers";
import { ethers } from "hardhat";

import { MakerOrderWithSignature, TakerOrder } from "../helpers/order-types";
import { createMakerOrder, createTakerOrder } from "../helpers/order-helper";
import { computeOrderHash } from "../helpers/signature-helper";
import { Contracts, Env, makeSuite, Snapshots } from "../_setup";
import { increaseTo } from "../helpers/block-traveller";

const { defaultAbiCoder, parseEther } = utils;

makeSuite("Strategy - Dutch Auction", (contracts: Contracts, env: Env, snapshots: Snapshots) => {
  let startTimeOrder: BigNumber;
  let endTimeOrder: BigNumber;
  const emptyEncodedBytes = defaultAbiCoder.encode([], []);

  beforeEach(async () => {
    // Set up defaults startTime/endTime (for orders)
    startTimeOrder = BigNumber.from((await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp);
    endTimeOrder = startTimeOrder.add(BigNumber.from("1000"));
  });

  afterEach(async () => {
    await snapshots.revert("setup");
  });

  it("ERC721 - Buyer pays the exact auction price", async () => {
    const makerAskUser = env.accounts[1];
    const takerBidUser = env.accounts[2];

    endTimeOrder = startTimeOrder.add(BigNumber.from("1000"));

    const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
      isOrderAsk: true,
      maker: makerAskUser.address,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
      collection: contracts.mockERC721.address,
      price: parseEther("1"),
      tokenId: constants.Zero,
      amount: constants.One,
      strategy: contracts.strategyDutchAuction.address,
      currency: contracts.weth.address,
      nonce: constants.Zero,
      startTime: startTimeOrder,
      endTime: endTimeOrder,
      minPercentageToAsk: constants.Zero,
      params: defaultAbiCoder.encode(["uint256"], [parseEther("5")]),
      signerUser: makerAskUser,
      verifyingContract: contracts.bendExchange.address,
    });

    const takerBidOrder = createTakerOrder({
      isOrderAsk: false,
      taker: takerBidUser.address,
      tokenId: constants.Zero,
      price: BigNumber.from(parseEther("3").toString()),
      minPercentageToAsk: constants.Zero,
      params: emptyEncodedBytes,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
    });

    // User 2 cannot buy since the current auction price is not 3
    await expect(
      contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
        value: takerBidOrder.price,
      })
    ).to.be.revertedWith("Strategy: execution invalid");

    await expect(
      contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder)
    ).to.be.revertedWith("Strategy: execution invalid");

    // Advance time to half time of the auction (3 is between 5 and 1)
    const midTimeOrder = startTimeOrder.add("500");
    await increaseTo(midTimeOrder);

    const tx = await contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder);
    await expect(tx)
      .to.emit(contracts.bendExchange, "TakerBid")
      .withArgs(
        computeOrderHash(makerAskOrder),
        makerAskOrder.nonce,
        takerBidUser.address,
        makerAskUser.address,
        contracts.strategyDutchAuction.address,
        makerAskOrder.currency,
        makerAskOrder.collection,
        takerBidOrder.tokenId,
        makerAskOrder.amount,
        takerBidOrder.price
      );

    assert.equal(await contracts.mockERC721.ownerOf("0"), takerBidUser.address);
    assert.isTrue(
      await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerAskUser.address, makerAskOrder.nonce)
    );
  });

  it("ERC1155 - Buyer overpays", async () => {
    const makerAskUser = env.accounts[1];
    const takerBidUser = env.accounts[2];
    endTimeOrder = startTimeOrder.add("1000");

    const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
      isOrderAsk: true,
      maker: makerAskUser.address,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
      collection: contracts.mockERC1155.address,
      price: parseEther("1"),
      tokenId: constants.One,
      amount: constants.Two,
      strategy: contracts.strategyDutchAuction.address,
      currency: contracts.weth.address,
      nonce: constants.Zero,
      startTime: startTimeOrder,
      endTime: endTimeOrder,
      minPercentageToAsk: constants.Zero,
      params: defaultAbiCoder.encode(["uint256"], [parseEther("5")]),
      signerUser: makerAskUser,
      verifyingContract: contracts.bendExchange.address,
    });

    const takerBidOrder = createTakerOrder({
      isOrderAsk: false,
      taker: takerBidUser.address,
      tokenId: constants.One,
      price: BigNumber.from(parseEther("4.5").toString()),
      minPercentageToAsk: constants.Zero,
      params: emptyEncodedBytes,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
    });

    // Advance time to half time of the auction (3 is between 5 and 1)
    const midTimeOrder = startTimeOrder.add("500");
    await increaseTo(midTimeOrder);

    // User 2 buys with 4.5 WETH (when auction price was at 3 WETH)
    const tx = await contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder);
    await expect(tx)
      .to.emit(contracts.bendExchange, "TakerBid")
      .withArgs(
        computeOrderHash(makerAskOrder),
        makerAskOrder.nonce,
        takerBidUser.address,
        makerAskUser.address,
        contracts.strategyDutchAuction.address,
        makerAskOrder.currency,
        makerAskOrder.collection,
        takerBidOrder.tokenId,
        makerAskOrder.amount,
        takerBidOrder.price
      );

    // Verify amount transfered to the protocol fee (user1) is (protocolFee) * 4.5 WETH
    const protocolFee = await contracts.strategyDutchAuction.PROTOCOL_FEE();
    await expect(tx)
      .to.emit(contracts.weth, "Transfer")
      .withArgs(takerBidUser.address, env.feeRecipient.address, takerBidOrder.price.mul(protocolFee).div("10000"));

    // User 2 had minted 2 tokenId=1 so he has 4
    expect(await contracts.mockERC1155.balanceOf(takerBidUser.address, "1")).to.be.eq(BigNumber.from("4"));
  });

  it("Revert if start price is lower than end price", async () => {
    const makerAskUser = env.accounts[1];
    const takerBidUser = env.accounts[2];

    let makerAskOrder = await createMakerOrder({
      isOrderAsk: true,
      maker: makerAskUser.address,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
      collection: contracts.mockERC721.address,
      tokenId: constants.Zero,
      price: parseEther("3"),
      amount: constants.One,
      strategy: contracts.strategyDutchAuction.address,
      currency: contracts.weth.address,
      nonce: constants.Zero,
      startTime: startTimeOrder,
      endTime: endTimeOrder,
      minPercentageToAsk: constants.Zero,
      params: defaultAbiCoder.encode(["uint256", "uint256"], [parseEther("3"), parseEther("5")]), // startPrice/endPrice
      signerUser: makerAskUser,
      verifyingContract: contracts.bendExchange.address,
    });

    const takerBidOrder: TakerOrder = {
      isOrderAsk: false,
      taker: takerBidUser.address,
      tokenId: makerAskOrder.tokenId,
      price: makerAskOrder.price,
      minPercentageToAsk: constants.Zero,
      params: emptyEncodedBytes,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
    };

    await expect(
      contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder)
    ).to.be.revertedWith("Dutch Auction: start price must be greater than end price");

    // EndTimeOrder is 50 seconds after startTimeOrder
    endTimeOrder = startTimeOrder.add(BigNumber.from("50"));

    makerAskOrder = await createMakerOrder({
      isOrderAsk: true,
      maker: makerAskUser.address,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
      collection: contracts.mockERC721.address,
      tokenId: constants.Zero,
      price: parseEther("3"),
      amount: constants.One,
      strategy: contracts.strategyDutchAuction.address,
      currency: contracts.weth.address,
      nonce: constants.Zero,
      startTime: startTimeOrder,
      endTime: endTimeOrder,
      minPercentageToAsk: constants.Zero,
      params: defaultAbiCoder.encode(["uint256", "uint256"], [parseEther("5"), parseEther("3")]), // startPrice/endPrice
      signerUser: makerAskUser,
      verifyingContract: contracts.bendExchange.address,
    });

    await expect(
      contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder)
    ).to.be.revertedWith("Dutch Auction: length must be longer");
  });

  it("Cannot match if wrong side", async () => {
    const makerAskUser = env.accounts[1];
    const takerBidUser = env.accounts[2];

    const makerBidOrder = await createMakerOrder({
      isOrderAsk: false,
      maker: takerBidUser.address,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
      collection: contracts.mockERC721.address,
      tokenId: constants.Zero,
      price: parseEther("3"),
      amount: constants.One,
      strategy: contracts.strategyDutchAuction.address,
      currency: contracts.weth.address,
      nonce: constants.Zero,
      startTime: startTimeOrder,
      endTime: endTimeOrder,
      minPercentageToAsk: constants.Zero,
      params: defaultAbiCoder.encode(["uint256"], [parseEther("5")]), // startPrice
      signerUser: takerBidUser,
      verifyingContract: contracts.bendExchange.address,
    });

    const takerAskOrder: TakerOrder = {
      isOrderAsk: true,
      taker: makerAskUser.address,
      tokenId: makerBidOrder.tokenId,
      price: makerBidOrder.price,
      minPercentageToAsk: constants.Zero,
      params: emptyEncodedBytes,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
    };

    await expect(
      contracts.bendExchange.connect(makerAskUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder)
    ).to.be.revertedWith("Strategy: execution invalid");
  });

  it("Min Auction length creates revertion as expected", async () => {
    await expect(
      contracts.strategyDutchAuction.connect(env.admin).updateMinimumAuctionLength("899")
    ).to.be.revertedWith("Owner: auction length must be > 15 min");

    const StrategyDutchAuction = await ethers.getContractFactory("StrategyDutchAuction");
    await expect(StrategyDutchAuction.connect(env.admin).deploy("900", "899")).to.be.revertedWith(
      "Owner: auction length must be > 15 min"
    );
  });

  it("Owner functions work as expected", async () => {
    const tx = await contracts.strategyDutchAuction.connect(env.admin).updateMinimumAuctionLength("1000");
    await expect(tx).to.emit(contracts.strategyDutchAuction, "NewMinimumAuctionLengthInSeconds").withArgs("1000");
  });

  it("Owner functions are only callable by owner", async () => {
    const notAdminUser = env.accounts[3];

    await expect(
      contracts.strategyDutchAuction.connect(notAdminUser).updateMinimumAuctionLength("500")
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
});
