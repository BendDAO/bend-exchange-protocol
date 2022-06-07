import { assert, expect } from "chai";
import { BigNumber, constants, utils } from "ethers";
import { ethers } from "hardhat";

import { MakerOrderWithSignature, TakerOrder } from "../helpers/order-types";
import { createMakerOrder, createTakerOrder } from "../helpers/order-helper";
import { computeOrderHash } from "../helpers/signature-helper";
import { Contracts, Env, makeSuite, Snapshots } from "../_setup";

const { defaultAbiCoder, parseEther } = utils;

makeSuite(
  "Strategy - AnyItemFromCollectionForFixedPrice ('Collection orders')",
  (contracts: Contracts, env: Env, snapshots: Snapshots) => {
    // Other global variables
    let startTimeOrder: BigNumber;
    let endTimeOrder: BigNumber;
    const emptyEncodedBytes = defaultAbiCoder.encode([], []);

    beforeEach(async () => {
      // Set up defaults startTime/endTime (for orders)
      startTimeOrder = BigNumber.from(
        (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
      );
      endTimeOrder = startTimeOrder.add(BigNumber.from("1000"));
    });

    afterEach(async () => {
      await snapshots.revert("setup");
    });

    it("ERC721 - MakerBid order is matched by TakerAsk order", async () => {
      const makerBidUser = env.accounts[1];
      const takerAskUser = env.accounts[5];

      const makerBidOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero, // Not used
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyAnyItemFromCollectionForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerBidUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerAskOrder = createTakerOrder({
        isOrderAsk: true,
        taker: takerAskUser.address,
        tokenId: BigNumber.from("4"),
        price: makerBidOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      const tx = await contracts.bendExchange.connect(takerAskUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder);
      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerAsk")
        .withArgs(
          computeOrderHash(makerBidOrder),
          makerBidOrder.nonce,
          takerAskUser.address,
          makerBidUser.address,
          contracts.strategyAnyItemFromCollectionForFixedPrice.address,
          makerBidOrder.currency,
          makerBidOrder.collection,
          takerAskOrder.tokenId,
          makerBidOrder.amount,
          makerBidOrder.price
        );

      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerBidUser.address, makerBidOrder.nonce)
      );
    });

    it("ERC1155 - MakerBid order is matched by TakerAsk order", async () => {
      const makerBidUser = env.accounts[1];
      const takerAskUser = env.accounts[2];

      const makerBidOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC1155.address,
        tokenId: constants.Zero, // not used
        price: parseEther("3"),
        amount: constants.Two,
        strategy: contracts.strategyAnyItemFromCollectionForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerBidUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerAskOrder = createTakerOrder({
        isOrderAsk: true,
        taker: takerAskUser.address,
        price: makerBidOrder.price,
        tokenId: BigNumber.from("2"),
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      const tx = await contracts.bendExchange.connect(takerAskUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder);
      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerAsk")
        .withArgs(
          computeOrderHash(makerBidOrder),
          makerBidOrder.nonce,
          takerAskUser.address,
          makerBidUser.address,
          contracts.strategyAnyItemFromCollectionForFixedPrice.address,
          makerBidOrder.currency,
          makerBidOrder.collection,
          takerAskOrder.tokenId,
          makerBidOrder.amount,
          makerBidOrder.price
        );

      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerBidUser.address, makerBidOrder.nonce)
      );
    });

    it("Cannot match if wrong side", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyAnyItemFromCollectionForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
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
      ).to.be.revertedWith("Strategy: execution invalid");
    });
  }
);
