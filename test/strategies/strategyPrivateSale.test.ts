import { assert, expect } from "chai";
import { BigNumber, constants, utils } from "ethers";
import { ethers } from "hardhat";

import { MakerOrderWithSignature, TakerOrder } from "../helpers/order-types";
import { createMakerOrder, createTakerOrder } from "../helpers/order-helper";
import { computeOrderHash } from "../helpers/signature-helper";
import { Contracts, Env, makeSuite, Snapshots } from "../_setup";

const { defaultAbiCoder, parseEther } = utils;

makeSuite("Strategy - PrivateSale", (contracts: Contracts, env: Env, snapshots: Snapshots) => {
  // Other global variables
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

  it("ERC721 -  No platform fee, only target can buy", async () => {
    const makerAskUser = env.accounts[1];
    const takerBidUser = env.accounts[2];
    const wrongUser = env.accounts[3];

    const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
      isOrderAsk: true,
      maker: makerAskUser.address,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
      collection: contracts.mockERC721.address,
      tokenId: constants.Zero,
      price: parseEther("5"),
      amount: constants.One,
      strategy: contracts.strategyPrivateSale.address,
      currency: contracts.weth.address,
      nonce: constants.Zero,
      startTime: startTimeOrder,
      endTime: endTimeOrder,
      minPercentageToAsk: constants.Zero,
      params: defaultAbiCoder.encode(["address"], [takerBidUser.address]),
      signerUser: makerAskUser,
      verifyingContract: contracts.bendExchange.address,
    });

    let takerBidOrder = createTakerOrder({
      isOrderAsk: false,
      taker: wrongUser.address,
      tokenId: constants.Zero,
      price: makerAskOrder.price,
      minPercentageToAsk: constants.Zero,
      params: emptyEncodedBytes,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
    });

    // User 3 cannot buy since the order target is only taker user
    await expect(
      contracts.bendExchange.connect(wrongUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
        value: takerBidOrder.price,
      })
    ).to.be.revertedWith("Strategy: execution invalid");

    await expect(
      contracts.bendExchange.connect(wrongUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder)
    ).to.be.revertedWith("Strategy: execution invalid");

    takerBidOrder = createTakerOrder({
      isOrderAsk: false,
      taker: takerBidUser.address,
      price: makerAskOrder.price,
      tokenId: constants.Zero,
      minPercentageToAsk: constants.Zero,
      params: emptyEncodedBytes,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
    });

    assert.deepEqual(await contracts.weth.balanceOf(env.feeRecipient.address), constants.Zero);

    const tx = await contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder);
    await expect(tx)
      .to.emit(contracts.bendExchange, "TakerBid")
      .withArgs(
        computeOrderHash(makerAskOrder),
        makerAskOrder.nonce,
        takerBidUser.address,
        makerAskUser.address,
        contracts.strategyPrivateSale.address,
        makerAskOrder.currency,
        makerAskOrder.collection,
        takerBidOrder.tokenId,
        makerAskOrder.amount,
        makerAskOrder.price
      );

    assert.equal(await contracts.mockERC721.ownerOf(constants.Zero), takerBidUser.address);
    assert.isTrue(
      await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerAskUser.address, makerAskOrder.nonce)
    );
    // Verify balance of treasury (aka env.feeRecipient) is 0
    assert.deepEqual(await contracts.weth.balanceOf(env.feeRecipient.address), constants.Zero);
  });

  it("ERC721 -  No platform fee, only target can buy", async () => {
    const makerAskUser = env.accounts[1];
    const takerBidUser = env.accounts[2];
    const wrongUser = env.accounts[3];

    const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
      isOrderAsk: true,
      maker: makerAskUser.address,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
      collection: contracts.mockERC721.address,
      tokenId: constants.Zero,
      price: parseEther("5"),
      amount: constants.One,
      strategy: contracts.strategyPrivateSale.address,
      currency: contracts.weth.address,
      nonce: constants.Zero,
      startTime: startTimeOrder,
      endTime: endTimeOrder,
      minPercentageToAsk: constants.Zero,
      params: defaultAbiCoder.encode(["address"], [takerBidUser.address]),
      signerUser: makerAskUser,
      verifyingContract: contracts.bendExchange.address,
    });

    let takerBidOrder = createTakerOrder({
      isOrderAsk: false,
      taker: wrongUser.address,
      tokenId: constants.Zero,
      price: makerAskOrder.price,
      minPercentageToAsk: constants.Zero,
      params: emptyEncodedBytes,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
    });

    // User 3 cannot buy since the order target is only taker user
    await expect(
      contracts.bendExchange.connect(wrongUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
        value: takerBidOrder.price,
      })
    ).to.be.revertedWith("Strategy: execution invalid");

    await expect(
      contracts.bendExchange.connect(wrongUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder)
    ).to.be.revertedWith("Strategy: execution invalid");

    takerBidOrder = createTakerOrder({
      isOrderAsk: false,
      taker: takerBidUser.address,
      price: makerAskOrder.price,
      tokenId: constants.Zero,
      minPercentageToAsk: constants.Zero,
      params: emptyEncodedBytes,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
    });

    assert.deepEqual(await contracts.weth.balanceOf(env.feeRecipient.address), constants.Zero);

    const tx = await contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder);
    await expect(tx)
      .to.emit(contracts.bendExchange, "TakerBid")
      .withArgs(
        computeOrderHash(makerAskOrder),
        makerAskOrder.nonce,
        takerBidUser.address,
        makerAskUser.address,
        contracts.strategyPrivateSale.address,
        makerAskOrder.currency,
        makerAskOrder.collection,
        takerBidOrder.tokenId,
        makerAskOrder.amount,
        makerAskOrder.price
      );

    assert.equal(await contracts.mockERC721.ownerOf(constants.Zero), takerBidUser.address);
    assert.isTrue(
      await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerAskUser.address, makerAskOrder.nonce)
    );
    // Verify balance of treasury (aka env.feeRecipient) is 0
    assert.deepEqual(await contracts.weth.balanceOf(env.feeRecipient.address), constants.Zero);
  });

  it("Cannot match if wrong side", async () => {
    const makerAskUser = env.accounts[1];
    const takerBidUser = env.accounts[2];

    const makerBidOrder: MakerOrderWithSignature = await createMakerOrder({
      isOrderAsk: false,
      maker: takerBidUser.address,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
      collection: contracts.mockERC721.address,
      tokenId: constants.Zero,
      amount: constants.One,
      price: parseEther("3"),
      strategy: contracts.strategyPrivateSale.address,
      currency: contracts.weth.address,
      nonce: constants.Zero,
      startTime: startTimeOrder,
      endTime: endTimeOrder,
      minPercentageToAsk: constants.Zero,
      params: emptyEncodedBytes,
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
});
