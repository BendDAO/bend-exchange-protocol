import { assert, expect } from "chai";
import { BigNumber, constants, utils } from "ethers";
import { ethers } from "hardhat";

import { increaseTo } from "./helpers/block-traveller";
import { MakerOrderWithSignature, TakerOrder } from "./helpers/order-types";
import { createMakerOrder, createTakerOrder } from "./helpers/order-helper";
import { computeOrderHash } from "./helpers/signature-helper";
import { Contracts, Env, makeSuite, Snapshots } from "./_setup";
import { gasCost } from "./helpers/gas-helper";
const { defaultAbiCoder, parseEther } = utils;

makeSuite("BendDAO Exchange", (contracts: Contracts, env: Env, snapshots: Snapshots) => {
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

  describe("#1 - Regular sales", async () => {
    it("Standard Order ERC721/ETH  - MakerAsk order is matched by TakerBid order, maker require ETH", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: constants.AddressZero,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerBidOrder = createTakerOrder({
        isOrderAsk: false,
        taker: takerBidUser.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });
      const expectedFeeBalanceInWETH = (await contracts.weth.balanceOf(env.feeRecipient.address)).add(
        parseEther("3").mul(env.standardProtocolFee).div(10000)
      );
      const expectedTakerBalanceInETH = (await ethers.provider.getBalance(takerBidUser.address)).sub(parseEther("3"));
      const expectedMakerBalanceInETH = (await ethers.provider.getBalance(makerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH);

      const tx = await contracts.bendExchange
        .connect(takerBidUser)
        .matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        });

      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(makerAskOrder),
          makerAskOrder.nonce,
          takerBidUser.address,
          makerAskUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerAskOrder.currency,
          makerAskOrder.collection,
          makerAskOrder.tokenId,
          makerAskOrder.amount,
          takerBidOrder.price
        );

      assert.equal(await contracts.mockERC721.ownerOf("0"), takerBidUser.address);

      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerAskUser.address, makerAskOrder.nonce)
      );

      expect(expectedFeeBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(env.feeRecipient.address));
      expect(expectedMakerBalanceInETH).to.be.eq(await ethers.provider.getBalance(makerAskUser.address));
      expect(expectedTakerBalanceInETH.sub(await gasCost(tx))).to.be.eq(
        await ethers.provider.getBalance(takerBidUser.address)
      );

      // Orders that have been executed cannot be matched again
      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        })
      ).to.be.revertedWith("Order: matching order expired");
    });

    it("Standard Order ERC721/ETH  - MakerAsk order is matched by TakerBid order, maker require WETH", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerBidOrder = createTakerOrder({
        isOrderAsk: false,
        taker: takerBidUser.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      const expectedFeeBalanceInWETH = (await contracts.weth.balanceOf(env.feeRecipient.address)).add(
        parseEther("3").mul(env.standardProtocolFee).div(10000)
      );
      const expectedMakerBalanceInWETH = (await contracts.weth.balanceOf(makerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH);
      const expectedTakerBalanceInETH = (await ethers.provider.getBalance(takerBidUser.address)).sub(parseEther("3"));

      const tx = await contracts.bendExchange
        .connect(takerBidUser)
        .matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        });

      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(makerAskOrder),
          makerAskOrder.nonce,
          takerBidUser.address,
          makerAskUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerAskOrder.currency,
          makerAskOrder.collection,
          makerAskOrder.tokenId,
          makerAskOrder.amount,
          takerBidOrder.price
        );

      assert.equal(await contracts.mockERC721.ownerOf("0"), takerBidUser.address);

      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerAskUser.address, makerAskOrder.nonce)
      );

      expect(expectedFeeBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(env.feeRecipient.address));
      expect(expectedMakerBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(makerAskUser.address));
      expect(expectedTakerBalanceInETH.sub(await gasCost(tx))).to.be.eq(
        await ethers.provider.getBalance(takerBidUser.address)
      );

      // Orders that have been executed cannot be matched again
      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        })
      ).to.be.revertedWith("Order: matching order expired");
    });

    it("Standard Order ERC721/(ETH + WETH) - MakerAsk order is matched by TakerBid order, maker require ETH", async () => {
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
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: constants.AddressZero,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerBidOrder = createTakerOrder({
        isOrderAsk: false,
        taker: takerBidUser.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      // Order is worth 3 ETH; taker user splits it as 2 ETH + 1 WETH
      const expectedTakerBalanceInETH = (await ethers.provider.getBalance(takerBidUser.address)).sub(parseEther("2"));
      const expectedTakerBalanceInWETH = (await contracts.weth.balanceOf(takerBidUser.address)).sub(parseEther("1"));
      const expectedFeeBalanceInWETH = (await contracts.weth.balanceOf(env.feeRecipient.address)).add(
        parseEther("3").mul(env.standardProtocolFee).div(10000)
      );
      const expectedMakerBalanceInETH = (await ethers.provider.getBalance(makerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH);

      const tx = await contracts.bendExchange
        .connect(takerBidUser)

        .matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: parseEther("2"),
        });

      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(makerAskOrder),
          makerAskOrder.nonce,
          takerBidUser.address,
          makerAskUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerAskOrder.currency,
          makerAskOrder.collection,
          makerAskOrder.tokenId,
          makerAskOrder.amount,
          takerBidOrder.price
        );

      assert.equal(await contracts.mockERC721.ownerOf("0"), takerBidUser.address);
      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerAskUser.address, makerAskOrder.nonce)
      );

      // Check balance of WETH is same as expected
      expect(expectedTakerBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(takerBidUser.address));
      expect(expectedTakerBalanceInETH.sub(await gasCost(tx))).to.be.eq(
        await ethers.provider.getBalance(takerBidUser.address)
      );
      expect(expectedMakerBalanceInETH).to.be.eq(await ethers.provider.getBalance(makerAskUser.address));
      expect(expectedFeeBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(env.feeRecipient.address));
    });

    it("Standard Order ERC721/(ETH + WETH) - MakerAsk order is matched by TakerBid order, maker require WETH", async () => {
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
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerBidOrder = createTakerOrder({
        isOrderAsk: false,
        taker: takerBidUser.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      // Order is worth 3 ETH; taker user splits it as 2 ETH + 1 WETH
      const expectedTakerBalanceInETH = (await ethers.provider.getBalance(takerBidUser.address)).sub(parseEther("2"));
      const expectedTakerBalanceInWETH = (await contracts.weth.balanceOf(takerBidUser.address)).sub(parseEther("1"));

      const expectedFeeBalanceInWETH = (await contracts.weth.balanceOf(env.feeRecipient.address)).add(
        parseEther("3").mul(env.standardProtocolFee).div(10000)
      );

      const expectedMakerBalanceInWETH = (await contracts.weth.balanceOf(makerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH);

      const tx = await contracts.bendExchange
        .connect(takerBidUser)

        .matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: parseEther("2"),
        });

      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(makerAskOrder),
          makerAskOrder.nonce,
          takerBidUser.address,
          makerAskUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerAskOrder.currency,
          makerAskOrder.collection,
          makerAskOrder.tokenId,
          makerAskOrder.amount,
          takerBidOrder.price
        );

      assert.equal(await contracts.mockERC721.ownerOf("0"), takerBidUser.address);
      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerAskUser.address, makerAskOrder.nonce)
      );

      // Check balance of WETH is same as expected
      expect(expectedTakerBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(takerBidUser.address));
      expect(expectedTakerBalanceInETH.sub(await gasCost(tx))).to.be.eq(
        await ethers.provider.getBalance(takerBidUser.address)
      );
      expect(expectedMakerBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(makerAskUser.address));
      expect(expectedFeeBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(env.feeRecipient.address));
    });

    it("Standard Order ERC1155/ETH  - MakerAsk order is matched by TakerBid order, maker require ETH", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC1155.address,
        tokenId: constants.One,
        price: parseEther("3"),
        amount: constants.Two,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: constants.AddressZero,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerBidOrder = createTakerOrder({
        isOrderAsk: false,
        taker: takerBidUser.address,
        tokenId: constants.One,
        price: parseEther("3"),
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      const expectedTakerBalanceInETH = (await ethers.provider.getBalance(takerBidUser.address)).sub(parseEther("3"));

      const expectedFeeBalanceInWETH = (await contracts.weth.balanceOf(env.feeRecipient.address)).add(
        parseEther("3").mul(env.standardProtocolFee).div(10000)
      );

      const expectedMakerBalanceInETH = (await ethers.provider.getBalance(makerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH);

      const tx = await contracts.bendExchange
        .connect(takerBidUser)
        .matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        });

      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(makerAskOrder),
          makerAskOrder.nonce,
          takerBidUser.address,
          makerAskUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerAskOrder.currency,
          makerAskOrder.collection,
          makerAskOrder.tokenId,
          makerAskOrder.amount,
          takerBidOrder.price
        );

      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerAskUser.address, makerAskOrder.nonce)
      );

      expect(expectedTakerBalanceInETH.sub(await gasCost(tx))).to.be.eq(
        await ethers.provider.getBalance(takerBidUser.address)
      );
      expect(expectedMakerBalanceInETH).to.be.eq(await ethers.provider.getBalance(makerAskUser.address));
      expect(expectedFeeBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(env.feeRecipient.address));

      // User 2 had minted 2 tokenId=1 so he has 4
      assert.equal((await contracts.mockERC1155.balanceOf(takerBidUser.address, "1")).toString(), "4");
    });

    it("Standard Order ERC1155/ETH  - MakerAsk order is matched by TakerBid order, maker require WETH", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC1155.address,
        tokenId: constants.One,
        price: parseEther("3"),
        amount: constants.Two,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerBidOrder = createTakerOrder({
        isOrderAsk: false,
        taker: takerBidUser.address,
        tokenId: constants.One,
        price: parseEther("3"),
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      const expectedTakerBalanceInETH = (await ethers.provider.getBalance(takerBidUser.address)).sub(parseEther("3"));

      const expectedFeeBalanceInWETH = (await contracts.weth.balanceOf(env.feeRecipient.address)).add(
        parseEther("3").mul(env.standardProtocolFee).div(10000)
      );

      const expectedMakerBalanceInWETH = (await contracts.weth.balanceOf(makerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH);

      const tx = await contracts.bendExchange
        .connect(takerBidUser)
        .matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        });

      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(makerAskOrder),
          makerAskOrder.nonce,
          takerBidUser.address,
          makerAskUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerAskOrder.currency,
          makerAskOrder.collection,
          makerAskOrder.tokenId,
          makerAskOrder.amount,
          takerBidOrder.price
        );

      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerAskUser.address, makerAskOrder.nonce)
      );

      expect(expectedTakerBalanceInETH.sub(await gasCost(tx))).to.be.eq(
        await ethers.provider.getBalance(takerBidUser.address)
      );
      expect(expectedMakerBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(makerAskUser.address));
      expect(expectedFeeBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(env.feeRecipient.address));
      // User 2 had minted 2 tokenId=1 so he has 4
      assert.equal((await contracts.mockERC1155.balanceOf(takerBidUser.address, "1")).toString(), "4");
    });

    it("Standard Order ERC721/WETH  - MakerBid order is matched by TakerAsk order, maker bid with ETH", async () => {
      const makerBidUser = env.accounts[2];
      const takerAskUser = env.accounts[1];

      const makerBidOrder = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: constants.AddressZero,
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
        tokenId: constants.Zero,
        price: makerBidOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      const expectedFeeBalanceInWETH = (await contracts.weth.balanceOf(env.feeRecipient.address)).add(
        parseEther("3").mul(env.standardProtocolFee).div(10000)
      );

      const expectedMakerBalanceInWETH = (await contracts.weth.balanceOf(makerBidUser.address)).sub(parseEther("3"));

      const expectedTakerBalanceInETH = (await ethers.provider.getBalance(takerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH);

      const tx = await contracts.bendExchange.connect(takerAskUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder);
      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerAsk")
        .withArgs(
          computeOrderHash(makerBidOrder),
          makerBidOrder.nonce,
          takerAskUser.address,
          makerBidUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerBidOrder.currency,
          makerBidOrder.collection,
          takerAskOrder.tokenId,
          makerBidOrder.amount,
          makerBidOrder.price
        );

      assert.equal(await contracts.mockERC721.ownerOf("0"), makerBidUser.address);

      expect(expectedMakerBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(makerBidUser.address));
      expect(expectedFeeBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(env.feeRecipient.address));
      expect(expectedTakerBalanceInETH.sub(await gasCost(tx))).to.be.eq(
        await ethers.provider.getBalance(takerAskUser.address)
      );

      expect(expectedTakerBalanceInETH).to.be.gte(await ethers.provider.getBalance(takerAskUser.address));

      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerBidUser.address, makerBidOrder.nonce)
      );
    });

    it("Standard Order ERC721/WETH  - MakerBid order is matched by TakerAsk order, maker bid with WETH", async () => {
      const makerBidUser = env.accounts[2];
      const takerAskUser = env.accounts[1];

      const makerBidOrder = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
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
        tokenId: constants.Zero,
        price: makerBidOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      const expectedFeeBalanceInWETH = (await contracts.weth.balanceOf(env.feeRecipient.address)).add(
        parseEther("3").mul(env.standardProtocolFee).div(10000)
      );

      const expectedMakerBalanceInWETH = (await contracts.weth.balanceOf(makerBidUser.address)).sub(parseEther("3"));

      const expectedTakerBalanceInWETH = (await contracts.weth.balanceOf(takerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH);

      const tx = await contracts.bendExchange.connect(takerAskUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder);
      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerAsk")
        .withArgs(
          computeOrderHash(makerBidOrder),
          makerBidOrder.nonce,
          takerAskUser.address,
          makerBidUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerBidOrder.currency,
          makerBidOrder.collection,
          takerAskOrder.tokenId,
          makerBidOrder.amount,
          makerBidOrder.price
        );

      assert.equal(await contracts.mockERC721.ownerOf("0"), makerBidUser.address);

      expect(expectedMakerBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(makerBidUser.address));
      expect(expectedTakerBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(takerAskUser.address));
      expect(expectedFeeBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(env.feeRecipient.address));

      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerBidUser.address, makerBidOrder.nonce)
      );
    });

    it("Standard Order ERC1155/WETH - MakerBid order is matched by TakerAsk order, maker bid with ETH", async () => {
      const makerBidUser = env.accounts[1];
      const takerAskUser = env.accounts[2];

      const makerBidOrder = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC1155.address,
        tokenId: BigNumber.from("3"),
        price: parseEther("3"),
        amount: constants.Two,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: constants.AddressZero,
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
        tokenId: BigNumber.from("3"),
        price: makerBidOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      const expectedFeeBalanceInWETH = (await contracts.weth.balanceOf(env.feeRecipient.address)).add(
        parseEther("3").mul(env.standardProtocolFee).div(10000)
      );

      const expectedMakerBalanceInWETH = (await contracts.weth.balanceOf(makerBidUser.address)).sub(parseEther("3"));

      const expectedTakerBalanceInETH = (await ethers.provider.getBalance(takerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH);

      const tx = await contracts.bendExchange.connect(takerAskUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder);
      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerAsk")
        .withArgs(
          computeOrderHash(makerBidOrder),
          makerBidOrder.nonce,
          takerAskUser.address,
          makerBidUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerBidOrder.currency,
          makerBidOrder.collection,
          takerAskOrder.tokenId,
          makerBidOrder.amount,
          makerBidOrder.price
        );

      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerBidUser.address, makerBidOrder.nonce)
      );

      expect(expectedMakerBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(makerBidUser.address));
      expect(expectedTakerBalanceInETH.sub(await gasCost(tx))).to.be.eq(
        await ethers.provider.getBalance(takerAskUser.address)
      );
      expect(expectedFeeBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(env.feeRecipient.address));
    });

    it("Standard Order ERC1155/WETH - MakerBid order is matched by TakerAsk order, maker bid with WETH", async () => {
      const makerBidUser = env.accounts[1];
      const takerAskUser = env.accounts[2];

      const makerBidOrder = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC1155.address,
        tokenId: BigNumber.from("3"),
        price: parseEther("3"),
        amount: constants.Two,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
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
        tokenId: BigNumber.from("3"),
        price: makerBidOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      const expectedFeeBalanceInWETH = (await contracts.weth.balanceOf(env.feeRecipient.address)).add(
        parseEther("3").mul(env.standardProtocolFee).div(10000)
      );

      const expectedMakerBalanceInWETH = (await contracts.weth.balanceOf(makerBidUser.address)).sub(parseEther("3"));

      const expectedTakerBalanceInWETH = (await contracts.weth.balanceOf(takerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH);

      const tx = await contracts.bendExchange.connect(takerAskUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder);
      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerAsk")
        .withArgs(
          computeOrderHash(makerBidOrder),
          makerBidOrder.nonce,
          takerAskUser.address,
          makerBidUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerBidOrder.currency,
          makerBidOrder.collection,
          takerAskOrder.tokenId,
          makerBidOrder.amount,
          makerBidOrder.price
        );

      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerBidUser.address, makerBidOrder.nonce)
      );

      expect(expectedMakerBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(makerBidUser.address));
      expect(expectedTakerBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(takerAskUser.address));
      expect(expectedFeeBalanceInWETH).to.be.eq(await contracts.weth.balanceOf(env.feeRecipient.address));
    });
  });

  describe("#2 - Non-standard orders", async () => {
    it("ERC1271/Contract Signature - MakerBid order is matched by TakerAsk order", async () => {
      const userSigningThroughContract = env.accounts[1];
      const takerAskUser = env.accounts[2];

      const MockSignerContract = await ethers.getContractFactory("MockSignerContract");
      const mockSignerContract = await MockSignerContract.connect(userSigningThroughContract).deploy();
      await mockSignerContract.deployed();

      await contracts.weth.connect(userSigningThroughContract).transfer(mockSignerContract.address, parseEther("1"));

      await mockSignerContract
        .connect(userSigningThroughContract)
        .registerProxy(contracts.authorizationManager.address);

      await mockSignerContract
        .connect(userSigningThroughContract)
        .approveERC20ToBeSpent(
          contracts.weth.address,
          await contracts.authorizationManager.proxies(mockSignerContract.address)
        );

      const makerBidOrder = await createMakerOrder({
        isOrderAsk: false,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        maker: mockSignerContract.address,
        collection: contracts.mockERC721.address,
        tokenId: constants.One,
        price: parseEther("1"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: userSigningThroughContract,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerAskOrder = createTakerOrder({
        isOrderAsk: true,
        taker: takerAskUser.address,
        tokenId: makerBidOrder.tokenId,
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
          mockSignerContract.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerBidOrder.currency,
          makerBidOrder.collection,
          takerAskOrder.tokenId,
          makerBidOrder.amount,
          makerBidOrder.price
        );

      // Verify funds/tokens were transferred
      assert.equal(await contracts.mockERC721.ownerOf("1"), mockSignerContract.address);
      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(
          mockSignerContract.address,
          makerBidOrder.nonce
        )
      );

      // Withdraw it back
      await mockSignerContract.connect(userSigningThroughContract).withdrawERC721NFT(contracts.mockERC721.address, "1");
      assert.equal(await contracts.mockERC721.ownerOf("1"), userSigningThroughContract.address);
    });

    it("ERC1271/Contract Signature - MakerAsk order is matched by TakerBid order", async () => {
      const userSigningThroughContract = env.accounts[1];
      const takerBidUser = env.accounts[2];
      const MockSignerContract = await ethers.getContractFactory("MockSignerContract");
      const mockSignerContract = await MockSignerContract.connect(userSigningThroughContract).deploy();
      await mockSignerContract.deployed();

      await contracts.mockERC721
        .connect(userSigningThroughContract)
        .transferFrom(userSigningThroughContract.address, mockSignerContract.address, "0");

      await mockSignerContract
        .connect(userSigningThroughContract)
        .registerProxy(contracts.authorizationManager.address);

      await mockSignerContract
        .connect(userSigningThroughContract)
        .approveERC721NFT(
          contracts.mockERC721.address,
          await contracts.authorizationManager.proxies(mockSignerContract.address)
        );

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: mockSignerContract.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("1"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: userSigningThroughContract,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerBidOrder = createTakerOrder({
        isOrderAsk: false,
        taker: takerBidUser.address,
        tokenId: makerAskOrder.tokenId,
        price: makerAskOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      const tx = await contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder);
      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(makerAskOrder),
          makerAskOrder.nonce,
          takerBidUser.address,
          mockSignerContract.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerAskOrder.currency,
          makerAskOrder.collection,
          takerBidOrder.tokenId,
          makerAskOrder.amount,
          makerAskOrder.price
        );

      // Verify funds/tokens were transferred
      assert.equal(await contracts.mockERC721.ownerOf("1"), takerBidUser.address);
      expect(await contracts.weth.balanceOf(mockSignerContract.address)).to.be.eq(
        takerBidOrder.price.mul("9800").div("10000")
      );

      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(
          mockSignerContract.address,
          makerAskOrder.nonce
        )
      );

      // Withdraw WETH back
      await mockSignerContract.connect(userSigningThroughContract).withdrawERC20(contracts.weth.address);
      expect(await contracts.weth.balanceOf(mockSignerContract.address)).to.be.eq(constants.Zero);
    });
  });

  describe("#3 - Royalty fee system", async () => {
    it("Fee/Royalty - Payment with ERC2981 works for non-ETH orders", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      assert.equal(await contracts.mockERC721WithRoyalty.RECEIVER(), env.royaltyCollector.address);
      assert.isTrue(await contracts.mockERC721WithRoyalty.supportsInterface("0x2a55205a"));

      // Verify balance of env.royaltyCollector is 0
      expect(await contracts.weth.balanceOf(env.royaltyCollector.address)).to.be.eq(constants.Zero);

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721WithRoyalty.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
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
        price: makerAskOrder.price,
        tokenId: makerAskOrder.tokenId,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      };

      const tx = await contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder);
      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(makerAskOrder),
          makerAskOrder.nonce,
          takerBidUser.address,
          makerAskUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerAskOrder.currency,
          makerAskOrder.collection,
          takerBidOrder.tokenId,
          makerAskOrder.amount,
          makerAskOrder.price
        );

      const expectedRoyaltyAmount = BigNumber.from(takerBidOrder.price).mul("200").div("10000");

      await expect(tx)
        .to.emit(contracts.bendExchange, "RoyaltyPayment")
        .withArgs(
          makerAskOrder.collection,
          takerBidOrder.tokenId,
          env.royaltyCollector.address,
          makerAskOrder.currency,
          expectedRoyaltyAmount
        );

      assert.equal(await contracts.mockERC721WithRoyalty.ownerOf("0"), takerBidUser.address);
      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerAskUser.address, makerAskOrder.nonce)
      );

      // Verify WETH balance of royalty collector has increased
      expect(await contracts.weth.balanceOf(env.royaltyCollector.address)).to.be.eq(expectedRoyaltyAmount);
    });

    it("Fee/Royalty - Payment with ERC2981 works for ETH orders", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      assert.equal(await contracts.mockERC721WithRoyalty.RECEIVER(), env.royaltyCollector.address);
      assert.isTrue(await contracts.mockERC721WithRoyalty.supportsInterface("0x2a55205a"));

      // Verify balance of env.royaltyCollector is 0
      expect(await contracts.weth.balanceOf(env.royaltyCollector.address)).to.be.eq(constants.Zero);

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721WithRoyalty.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
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
        price: makerAskOrder.price,
        tokenId: makerAskOrder.tokenId,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      };

      const tx = await contracts.bendExchange
        .connect(takerBidUser)
        .matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: parseEther("3"),
        });

      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(makerAskOrder),
          makerAskOrder.nonce,
          takerBidUser.address,
          makerAskUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerAskOrder.currency,
          makerAskOrder.collection,
          takerBidOrder.tokenId,
          makerAskOrder.amount,
          makerAskOrder.price
        );

      const expectedRoyaltyAmount = BigNumber.from(takerBidOrder.price).mul("200").div("10000");

      await expect(tx)
        .to.emit(contracts.bendExchange, "RoyaltyPayment")
        .withArgs(
          makerAskOrder.collection,
          takerBidOrder.tokenId,
          env.royaltyCollector.address,
          makerAskOrder.currency,
          expectedRoyaltyAmount
        );
      assert.equal(await contracts.mockERC721WithRoyalty.ownerOf("0"), takerBidUser.address);
      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerAskUser.address, makerAskOrder.nonce)
      );

      // Verify WETH balance of royalty collector has increased
      expect(await contracts.weth.balanceOf(env.royaltyCollector.address)).to.be.eq(expectedRoyaltyAmount);
    });

    it("Fee/Royalty - Payment for custom integration works", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      // Set 3% for royalties
      const fee = "300";
      let tx = await contracts.royaltyFeeSetter
        .connect(env.admin)
        .updateRoyaltyInfoForCollection(
          contracts.mockERC721.address,
          env.admin.address,
          env.royaltyCollector.address,
          fee
        );

      await expect(tx)
        .to.emit(contracts.royaltyFeeRegistry, "RoyaltyFeeUpdate")
        .withArgs(contracts.mockERC721.address, env.admin.address, env.royaltyCollector.address, fee);

      const result = await contracts.royaltyFeeRegistry.royaltyFeeInfoCollection(contracts.mockERC721.address);
      assert.equal(result[0], env.admin.address);
      assert.equal(result[1], env.royaltyCollector.address);
      assert.equal(result[2].toString(), fee);

      // Verify balance of env.royaltyCollector is 0
      expect(await contracts.weth.balanceOf(env.royaltyCollector.address)).to.be.eq(constants.Zero);

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
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
        tokenId: constants.Zero,
        price: parseEther("3"),
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      };

      tx = await contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder);

      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(makerAskOrder),
          makerAskOrder.nonce,
          takerBidUser.address,
          makerAskUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerAskOrder.currency,
          makerAskOrder.collection,
          takerBidOrder.tokenId,
          makerAskOrder.amount,
          makerAskOrder.price
        );

      const expectedRoyaltyAmount = BigNumber.from(takerBidOrder.price).mul(fee).div("10000");

      await expect(tx)
        .to.emit(contracts.bendExchange, "RoyaltyPayment")
        .withArgs(
          makerAskOrder.collection,
          takerBidOrder.tokenId,
          env.royaltyCollector.address,
          makerAskOrder.currency,
          expectedRoyaltyAmount
        );

      assert.equal(await contracts.mockERC721.ownerOf("0"), takerBidUser.address);
      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerAskUser.address, makerAskOrder.nonce)
      );

      // Verify WETH balance of royalty collector has increased
      expect(await contracts.weth.balanceOf(env.royaltyCollector.address)).to.be.eq(expectedRoyaltyAmount);
    });

    it("Fee/Royalty - Slippage protection works for MakerAsk", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      // Set 3% for royalties
      const fee = "300";
      await contracts.royaltyFeeSetter
        .connect(env.admin)
        .updateRoyaltyInfoForCollection(
          contracts.mockERC721.address,
          env.admin.address,
          env.royaltyCollector.address,
          fee
        );

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: BigNumber.from("9500"), // ProtocolFee: 2%, RoyaltyFee: 3%
        params: emptyEncodedBytes,
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      // Update to 3.01% for royalties
      await contracts.royaltyFeeSetter
        .connect(env.admin)
        .updateRoyaltyInfoForCollection(
          contracts.mockERC721.address,
          env.admin.address,
          env.royaltyCollector.address,
          "301"
        );

      const takerBidOrder: TakerOrder = {
        isOrderAsk: false,
        taker: takerBidUser.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      };

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: parseEther("3"),
        })
      ).to.be.revertedWith("Fees: higher than expected");

      // Update back to 3.00% for royalties
      await contracts.royaltyFeeSetter
        .connect(env.admin)
        .updateRoyaltyInfoForCollection(
          contracts.mockERC721.address,
          env.admin.address,
          env.royaltyCollector.address,
          fee
        );

      // Trade is executed
      const tx = await contracts.bendExchange
        .connect(takerBidUser)
        .matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: parseEther("3"),
        });

      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(makerAskOrder),
          makerAskOrder.nonce,
          takerBidUser.address,
          makerAskUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerAskOrder.currency,
          makerAskOrder.collection,
          takerBidOrder.tokenId,
          makerAskOrder.amount,
          makerAskOrder.price
        );
    });

    it("Fee/Royalty - Slippage protection works for TakerAsk", async () => {
      const makerBidUser = env.accounts[2];
      const takerAskUser = env.accounts[1];

      const makerBidOrder = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
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
        tokenId: constants.Zero,
        price: parseEther("3"),
        minPercentageToAsk: BigNumber.from("9500"), // ProtocolFee: 2%, RoyaltyFee: 3%
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      // Update to 3.01% for royalties
      await contracts.royaltyFeeSetter
        .connect(env.admin)
        .updateRoyaltyInfoForCollection(
          contracts.mockERC721.address,
          env.admin.address,
          env.royaltyCollector.address,
          "301"
        );

      await expect(
        contracts.bendExchange.connect(takerAskUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder)
      ).to.be.revertedWith("Fees: higher than expected");

      // Update back to 3.00% for royalties
      await contracts.royaltyFeeSetter
        .connect(env.admin)
        .updateRoyaltyInfoForCollection(
          contracts.mockERC721.address,
          env.admin.address,
          env.royaltyCollector.address,
          "300"
        );

      const tx = await contracts.bendExchange.connect(takerAskUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder);
      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerAsk")
        .withArgs(
          computeOrderHash(makerBidOrder),
          makerBidOrder.nonce,
          takerAskUser.address,
          makerBidUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerBidOrder.currency,
          makerBidOrder.collection,
          takerAskOrder.tokenId,
          makerBidOrder.amount,
          makerBidOrder.price
        );
    });

    it("Fee/Royalty/Private Sale - Royalty fee is collected but no platform fee", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      // Verify balance of env.royaltyCollector is 0
      expect(await contracts.weth.balanceOf(env.royaltyCollector.address)).to.be.eq(constants.Zero);

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721WithRoyalty.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        amount: constants.One,
        strategy: contracts.strategyPrivateSale.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: defaultAbiCoder.encode(["address"], [takerBidUser.address]), // target user
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerBidOrder: TakerOrder = {
        isOrderAsk: false,
        taker: takerBidUser.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      };

      const tx = await contracts.bendExchange
        .connect(takerBidUser)
        .matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: parseEther("3"),
        });

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

      assert.equal(await contracts.mockERC721WithRoyalty.ownerOf("0"), takerBidUser.address);
      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerAskUser.address, makerAskOrder.nonce)
      );

      // Verify WETH balance of royalty collector has increased
      expect(await contracts.weth.balanceOf(env.royaltyCollector.address)).to.be.eq(
        takerBidOrder.price.mul("200").div("10000")
      );

      // Verify balance of env.admin (aka treasury) is 0
      expect(await contracts.weth.balanceOf(env.admin.address)).to.be.eq(constants.Zero);
    });
  });

  describe("#4 - Standard logic revertions", async () => {
    it("One Cancel Other - Initial order is not executable anymore", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      const initialMakerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const adjustedMakerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        price: parseEther("2.5"),
        tokenId: constants.Zero,
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerBidOrder = createTakerOrder({
        isOrderAsk: false,
        taker: takerBidUser.address,
        price: parseEther("2.5"),
        tokenId: constants.Zero,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      const tx = await contracts.bendExchange
        .connect(takerBidUser)
        .matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, adjustedMakerAskOrder, {
          value: takerBidOrder.price,
        });

      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(adjustedMakerAskOrder),
          adjustedMakerAskOrder.nonce,
          takerBidUser.address,
          makerAskUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          adjustedMakerAskOrder.currency,
          adjustedMakerAskOrder.collection,
          takerBidOrder.tokenId,
          adjustedMakerAskOrder.amount,
          adjustedMakerAskOrder.price
        );

      assert.equal(await contracts.mockERC721.ownerOf("0"), takerBidUser.address);
      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(
          makerAskUser.address,
          adjustedMakerAskOrder.nonce
        )
      );

      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(
          makerAskUser.address,
          initialMakerAskOrder.nonce
        )
      );

      // Initial order is not executable anymore
      await expect(
        contracts.bendExchange
          .connect(takerBidUser)
          .matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, initialMakerAskOrder, {
            value: takerBidOrder.price,
          })
      ).to.be.revertedWith("Order: matching order expired");
    });

    it("Cancel - Cannot match if order was cancelled", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerBidOrder = createTakerOrder({
        isOrderAsk: false,
        taker: takerBidUser.address,
        tokenId: makerAskOrder.tokenId,
        price: makerAskOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      const tx = await contracts.bendExchange.connect(makerAskUser).cancelMultipleMakerOrders([makerAskOrder.nonce]);
      // Event params are not tested because of array issue with BN
      await expect(tx).to.emit(contracts.bendExchange, "CancelMultipleOrders");

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        })
      ).to.be.revertedWith("Order: matching order expired");
    });

    it("Cancel - Cannot match if on a different checkpoint than current on-chain maker's checkpoint", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[3];

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        maker: makerAskUser.address,
        collection: contracts.mockERC721.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerBidOrder = createTakerOrder({
        isOrderAsk: false,
        taker: takerBidUser.address,
        tokenId: makerAskOrder.tokenId,
        price: makerAskOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      const tx = await contracts.bendExchange.connect(makerAskUser).cancelAllOrdersForSender("1");
      await expect(tx).to.emit(contracts.bendExchange, "CancelAllOrders").withArgs(makerAskUser.address, "1");

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        })
      ).to.be.revertedWith("Order: matching order expired");
    });

    it("Order - Cannot match if price is too high", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[3];

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        maker: makerAskUser.address,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3000"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
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
        price: makerAskOrder.price,
        tokenId: makerAskOrder.tokenId,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      };

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: parseEther("3"),
        })
      ).to.be.revertedWith("Order: price too High and insufficient WETH");
    });

    it("Order - Cannot match is amount is 0", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[3];

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.Zero,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
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
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder, {})
      ).to.be.revertedWith("Order: amount cannot be 0");
    });

    it("Order - Cannot match 2 ask orders, 2 bid orders, or taker not the sender", async () => {
      const makerAskUser = env.accounts[2];
      const fakeTakerUser = env.accounts[3];
      const takerBidUser = env.accounts[4];

      // 1. MATCH ASK WITH TAKER BID
      // 1.1 Signer is not the actual maker
      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
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
        contracts.bendExchange.connect(fakeTakerUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder, {})
      ).to.be.revertedWith("Order: taker must be the sender");

      await expect(
        contracts.bendExchange
          .connect(fakeTakerUser)
          .matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
            value: takerBidOrder.price,
          })
      ).to.be.revertedWith("Order: taker must be the sender");

      // 1.2 wrong sides
      takerBidOrder.isOrderAsk = true;

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder, {})
      ).to.be.revertedWith("Order: wrong sides");

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        })
      ).to.be.revertedWith("Order: wrong sides");

      makerAskOrder.isOrderAsk = false;

      // No need to duplicate tests again
      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder, {})
      ).to.be.revertedWith("Order: wrong sides");

      takerBidOrder.isOrderAsk = false;

      // No need to duplicate tests again
      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder)
      ).to.be.revertedWith("Order: wrong sides");

      // 2. MATCH ASK WITH TAKER BID
      // 2.1 Signer is not the actual maker
      const takerAskUser = env.accounts[1];
      const makerBidUser = env.accounts[2];

      const makerBidOrder = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
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
        tokenId: makerAskOrder.tokenId,
        price: makerAskOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      await expect(
        contracts.bendExchange.connect(fakeTakerUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder)
      ).to.be.revertedWith("Order: taker must be the sender");

      // 2.2 wrong sides
      takerAskOrder.isOrderAsk = false;

      await expect(
        contracts.bendExchange.connect(makerAskUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder)
      ).to.be.revertedWith("Order: wrong sides");

      makerBidOrder.isOrderAsk = true;

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder)
      ).to.be.revertedWith("Order: wrong sides");

      takerAskOrder.isOrderAsk = true;

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder, {})
      ).to.be.revertedWith("Order: wrong sides");
    });

    it("Cancel - Cannot cancel all at an nonce equal or lower than existing one", async () => {
      await expect(contracts.bendExchange.connect(env.accounts[1]).cancelAllOrdersForSender("0")).to.be.revertedWith(
        "Cancel: order nonce lower than current"
      );

      await expect(
        contracts.bendExchange.connect(env.accounts[1]).cancelAllOrdersForSender("500000")
      ).to.be.revertedWith("Cancel: can not cancel more orders");

      // Change the minimum nonce for user to 2
      await contracts.bendExchange.connect(env.accounts[1]).cancelAllOrdersForSender("2");

      await expect(contracts.bendExchange.connect(env.accounts[1]).cancelAllOrdersForSender("1")).to.be.revertedWith(
        "Cancel: order nonce lower than current"
      );

      await expect(contracts.bendExchange.connect(env.accounts[1]).cancelAllOrdersForSender("2")).to.be.revertedWith(
        "Cancel: order nonce lower than current"
      );
    });

    it("Cancel - Cannot cancel all at an nonce equal than existing one", async () => {
      // Change the minimum nonce for user to 2
      await contracts.bendExchange.connect(env.accounts[1]).cancelAllOrdersForSender("2");

      await expect(contracts.bendExchange.connect(env.accounts[1]).cancelMultipleMakerOrders(["0"])).to.be.revertedWith(
        "Cancel: order nonce lower than current"
      );

      await expect(
        contracts.bendExchange.connect(env.accounts[1]).cancelMultipleMakerOrders(["3", "1"])
      ).to.be.revertedWith("Cancel: order nonce lower than current");

      // Can cancel at the same nonce that minimum one
      await contracts.bendExchange.connect(env.accounts[1]).cancelMultipleMakerOrders(["2"]);
    });

    it("Order - Cannot trade before startTime", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      startTimeOrder = BigNumber.from(
        (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
      ).add("5000");
      endTimeOrder = startTimeOrder.add(BigNumber.from("10000"));

      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerBidOrder = createTakerOrder({
        isOrderAsk: false,
        taker: takerBidUser.address,
        tokenId: makerAskOrder.tokenId,
        price: makerAskOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });
      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder)
      ).to.be.revertedWith("Strategy: execution invalid");

      await increaseTo(startTimeOrder);
      await contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder);
    });

    it("Order - Cannot trade after endTime", async () => {
      const makerBidUser = env.accounts[2];
      const takerAskUser = env.accounts[1];

      endTimeOrder = startTimeOrder.add(BigNumber.from("5000"));

      const makerBidOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
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
        tokenId: makerBidOrder.tokenId,
        price: makerBidOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      await increaseTo(endTimeOrder.add(1));

      await expect(
        contracts.bendExchange.connect(takerAskUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder)
      ).to.be.revertedWith("Strategy: execution invalid");
    });

    it("Currency - Cannot match if currency is removed", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];
      const tx = await contracts.currencyManager.connect(env.admin).removeCurrency(contracts.weth.address);
      await expect(tx).to.emit(contracts.currencyManager, "CurrencyRemoved").withArgs(contracts.weth.address);

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
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
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        })
      ).to.be.revertedWith("Currency: not whitelisted");

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder, {})
      ).to.be.revertedWith("Currency: not whitelisted");
    });

    it("Currency - Cannot use function to match MakerAsk with native asset if maker currency not WETH", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.mockUSDT.address,
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
        tokenId: makerAskOrder.price,
        price: makerAskOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      };

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        })
      ).to.be.revertedWith("Order: currency must be WETH");
    });

    it("Currency - Cannot match until currency is whitelisted", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      // Each users mints 1M USDT
      await contracts.mockUSDT.connect(takerBidUser).mint(takerBidUser.address, parseEther("1000000"));

      // Set approval for USDT
      await contracts.mockUSDT
        .connect(takerBidUser)
        .approve(await contracts.authorizationManager.proxies(takerBidUser.address), constants.MaxUint256);

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.mockUSDT.address,
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
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder, {})
      ).to.be.revertedWith("Currency: not whitelisted");

      let tx = await contracts.currencyManager.connect(env.admin).addCurrency(contracts.mockUSDT.address);
      await expect(tx).to.emit(contracts.currencyManager, "CurrencyWhitelisted").withArgs(contracts.mockUSDT.address);
      tx = await contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder);
      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(makerAskOrder),
          makerAskOrder.nonce,
          takerBidUser.address,
          makerAskUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerAskOrder.currency,
          makerAskOrder.collection,
          takerBidOrder.tokenId,
          makerAskOrder.amount,
          makerAskOrder.price
        );
    });

    it("Strategy - Cannot match if strategy not whitelisted", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
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

      let tx = await contracts.executionManager
        .connect(env.admin)
        .removeStrategy(contracts.strategyStandardSaleForFixedPrice.address);
      await expect(tx)
        .to.emit(contracts.executionManager, "StrategyRemoved")
        .withArgs(contracts.strategyStandardSaleForFixedPrice.address);

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder)
      ).to.be.revertedWith("Strategy: not whitelisted");

      tx = await contracts.executionManager
        .connect(env.admin)
        .addStrategy(contracts.strategyStandardSaleForFixedPrice.address);
      await expect(tx)
        .to.emit(contracts.executionManager, "StrategyWhitelisted")
        .withArgs(contracts.strategyStandardSaleForFixedPrice.address);

      tx = await contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder);

      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(makerAskOrder),
          makerAskOrder.nonce,
          takerBidUser.address,
          makerAskUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerAskOrder.currency,
          makerAskOrder.collection,
          takerBidOrder.tokenId,
          makerAskOrder.amount,
          makerAskOrder.price
        );
    });

    it("Transfer - Cannot match if no transfer", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      const MockNonCompliantERC721 = await ethers.getContractFactory("MockNonCompliantERC721");
      const mockNonCompliantERC721 = await MockNonCompliantERC721.deploy("Mock Bad ERC721", "MBERC721");
      await mockNonCompliantERC721.deployed();

      // User1 mints tokenId=0
      await mockNonCompliantERC721.connect(makerAskUser).mint(makerAskUser.address);

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: mockNonCompliantERC721.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
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
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder, {})
      ).to.be.revertedWith("Transfer: no NFT transfer available");

      let tx = await contracts.transferManager
        .connect(env.admin)
        .addCollectionTransfer(mockNonCompliantERC721.address, contracts.transferNonCompliantERC721.address);

      await expect(tx)
        .to.emit(contracts.transferManager, "CollectionTransferAdded")
        .withArgs(mockNonCompliantERC721.address, contracts.transferNonCompliantERC721.address);

      assert.equal(
        await contracts.transferManager.transfers(mockNonCompliantERC721.address),
        contracts.transferNonCompliantERC721.address
      );

      // User approves custom transfer manager contract
      const userProxy = await contracts.authorizationManager.proxies(makerAskUser.address);
      await mockNonCompliantERC721.connect(makerAskUser).setApprovalForAll(userProxy, true);

      tx = await contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder);

      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(makerAskOrder),
          makerAskOrder.nonce,
          takerBidUser.address,
          makerAskUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerAskOrder.currency,
          makerAskOrder.collection,
          takerBidOrder.tokenId,
          makerAskOrder.amount,
          makerAskOrder.price
        );

      tx = await contracts.transferManager.removeCollectionTransfer(mockNonCompliantERC721.address);

      await expect(tx)
        .to.emit(contracts.transferManager, "CollectionTransferRemoved")
        .withArgs(mockNonCompliantERC721.address);

      assert.equal(await contracts.transferManager.transfers(mockNonCompliantERC721.address), constants.AddressZero);
    });

    it("Interceptor - Cannot match if interceptor is removed", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];
      const makerBidUser = takerBidUser;
      const takerAskUser = makerAskUser;

      const tx = await contracts.interceptorManager
        .connect(env.admin)
        .removeCollectionInterceptor(contracts.redeemNFT.address);
      await expect(tx)
        .to.emit(contracts.interceptorManager, "CollectionInterceptorRemoved")
        .withArgs(contracts.redeemNFT.address);

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
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
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        })
      ).to.be.revertedWith("Interceptor: maker interceptor not whitelisted");

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder, {})
      ).to.be.revertedWith("Interceptor: maker interceptor not whitelisted");

      const makerBidOrder = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerBidUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerAskOrder: TakerOrder = {
        isOrderAsk: true,
        taker: takerAskUser.address,
        tokenId: makerAskOrder.tokenId,
        price: makerAskOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: emptyEncodedBytes,
      };

      await expect(
        contracts.bendExchange.connect(takerAskUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder, {})
      ).to.be.revertedWith("Interceptor: taker interceptor not whitelisted");
    });
    it("Interceptor - TakerBid cannot match until interceptor is whitelisted", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      const MockInterceptor = await ethers.getContractFactory("MockInterceptor");
      const mockInterceptor = await MockInterceptor.deploy();
      await mockInterceptor.deployed();

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        collection: contracts.mockERC721.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: mockInterceptor.address,
        interceptorExtra: emptyEncodedBytes,
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
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder, {})
      ).to.be.revertedWith("Interceptor: maker interceptor not whitelisted");

      let tx = await contracts.interceptorManager.connect(env.admin).addCollectionInterceptor(mockInterceptor.address);

      await expect(tx)
        .to.emit(contracts.interceptorManager, "CollectionInterceptorWhitelisted")
        .withArgs(mockInterceptor.address);

      tx = await contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder);

      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerBid")
        .withArgs(
          computeOrderHash(makerAskOrder),
          makerAskOrder.nonce,
          takerBidUser.address,
          makerAskUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerAskOrder.currency,
          makerAskOrder.collection,
          takerBidOrder.tokenId,
          makerAskOrder.amount,
          makerAskOrder.price
        );
    });
    it("Interceptor - TakerAsk cannot match until interceptor is whitelisted", async () => {
      const makerBidUser = env.accounts[2];
      const takerAskUser = env.accounts[1];

      const MockInterceptor = await ethers.getContractFactory("MockInterceptor");
      const mockInterceptor = await MockInterceptor.deploy();
      await mockInterceptor.deployed();

      const makerBidOrder = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
        collection: contracts.mockERC721.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        signerUser: makerBidUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerAskOrder: TakerOrder = {
        isOrderAsk: true,
        taker: takerAskUser.address,
        tokenId: makerBidOrder.tokenId,
        price: makerBidOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: mockInterceptor.address,
        interceptorExtra: emptyEncodedBytes,
      };

      await expect(
        contracts.bendExchange.connect(takerAskUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder, {})
      ).to.be.revertedWith("Interceptor: taker interceptor not whitelisted");

      let tx = await contracts.interceptorManager.connect(env.admin).addCollectionInterceptor(mockInterceptor.address);

      await expect(tx)
        .to.emit(contracts.interceptorManager, "CollectionInterceptorWhitelisted")
        .withArgs(mockInterceptor.address);

      tx = await contracts.bendExchange.connect(takerAskUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder);

      await expect(tx)
        .to.emit(contracts.bendExchange, "TakerAsk")
        .withArgs(
          computeOrderHash(makerBidOrder),
          makerBidOrder.nonce,
          takerAskUser.address,
          makerBidUser.address,
          contracts.strategyStandardSaleForFixedPrice.address,
          makerBidOrder.currency,
          makerBidOrder.collection,
          takerAskOrder.tokenId,
          makerBidOrder.amount,
          makerBidOrder.price
        );
    });

    it("Authorization -  no delegate proxy 1", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[11];

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        collection: contracts.mockERC721.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
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
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder, {})
      ).to.be.revertedWith("Authorization: no delegate proxy");
    });
    it("Authorization -  no delegate proxy 2", async () => {
      const makerAskUser = env.accounts[11];
      const takerBidUser = env.accounts[1];

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        collection: contracts.mockERC721.address,
        price: parseEther("3"),
        tokenId: constants.Zero,
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
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
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder, {})
      ).to.be.revertedWith("Authorization: no delegate proxy");
    });
  });

  describe("#5 - Unusual logic revertions", async () => {
    it("SignatureChecker - Cannot match if v parameters is not 27 or 28", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      makerAskOrder.v = 29;

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
      ).to.be.revertedWith("Signature: invalid v parameter");
    });

    it("SignatureChecker - Cannot match if invalid s parameter", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      // The s value is picked randomly to make the condition be rejected
      makerAskOrder.s = "0x9ca0e65dda4b504989e1db8fc30095f24489ee7226465e9545c32fc7853fe985";

      const takerBidOrder: TakerOrder = {
        isOrderAsk: false,
        taker: takerBidUser.address,
        price: makerAskOrder.price,
        tokenId: makerAskOrder.tokenId,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      };

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder)
      ).to.be.revertedWith("Signature: invalid s parameter");
    });

    it("Order - Cannot cancel if no order", async () => {
      await expect(contracts.bendExchange.connect(env.accounts[1]).cancelMultipleMakerOrders([])).to.be.revertedWith(
        "Cancel: can not be empty"
      );

      await expect(contracts.bendExchange.connect(env.accounts[2]).cancelMultipleMakerOrders([])).to.be.revertedWith(
        "Cancel: can not be empty"
      );
    });

    it("Order - Cannot execute if maker is null address", async () => {
      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: constants.AddressZero,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: env.accounts[3],
        verifyingContract: contracts.bendExchange.address,
      });

      const takerBidOrder: TakerOrder = {
        isOrderAsk: false,
        taker: env.accounts[2].address,
        tokenId: makerAskOrder.tokenId,
        price: makerAskOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      };

      await expect(
        contracts.bendExchange.connect(env.accounts[2]).matchAskWithTakerBid(takerBidOrder, makerAskOrder)
      ).to.be.revertedWith("Order: invalid maker");
    });

    it("Order - Cannot execute if wrong maker", async () => {
      const makerAskOrder = await createMakerOrder({
        isOrderAsk: true,
        maker: env.accounts[1].address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyStandardSaleForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        signerUser: env.accounts[3],
        verifyingContract: contracts.bendExchange.address,
      });

      const takerBidOrder: TakerOrder = {
        isOrderAsk: false,
        taker: env.accounts[2].address,
        tokenId: makerAskOrder.tokenId,
        price: makerAskOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      };

      await expect(
        contracts.bendExchange.connect(env.accounts[2]).matchAskWithTakerBid(takerBidOrder, makerAskOrder)
      ).to.be.revertedWith("Signature: Invalid");
    });
  });

  describe("#6 - Owner functions and access rights", async () => {
    it("Null address in owner functions", async () => {
      await expect(
        contracts.bendExchange.connect(env.admin).updateCurrencyManager(constants.AddressZero)
      ).to.be.revertedWith("Owner: can not be null address");

      await expect(
        contracts.bendExchange.connect(env.admin).updateExecutionManager(constants.AddressZero)
      ).to.be.revertedWith("Owner: can not be null address");

      await expect(
        contracts.bendExchange.connect(env.admin).updateRoyaltyFeeManager(constants.AddressZero)
      ).to.be.revertedWith("Owner: can not be null address");

      await expect(
        contracts.bendExchange.connect(env.admin).updateTransferManager(constants.AddressZero)
      ).to.be.revertedWith("Owner: can not be null address");

      await expect(
        contracts.bendExchange.connect(env.admin).updateAuthorizationManager(constants.AddressZero)
      ).to.be.revertedWith("Owner: can not be null address");

      await expect(
        contracts.bendExchange.connect(env.admin).updateInterceptorManager(constants.AddressZero)
      ).to.be.revertedWith("Owner: can not be null address");
    });

    it("Owner functions work as expected", async () => {
      let tx = await contracts.bendExchange.connect(env.admin).updateCurrencyManager(contracts.currencyManager.address);
      await expect(tx)
        .to.emit(contracts.bendExchange, "NewCurrencyManager")
        .withArgs(contracts.currencyManager.address);

      tx = await contracts.bendExchange.connect(env.admin).updateExecutionManager(contracts.executionManager.address);
      await expect(tx)
        .to.emit(contracts.bendExchange, "NewExecutionManager")
        .withArgs(contracts.executionManager.address);

      tx = await contracts.bendExchange.connect(env.admin).updateRoyaltyFeeManager(contracts.royaltyFeeManager.address);
      await expect(tx)
        .to.emit(contracts.bendExchange, "NewRoyaltyFeeManager")
        .withArgs(contracts.royaltyFeeManager.address);

      tx = await contracts.bendExchange.connect(env.admin).updateTransferManager(contracts.transferManager.address);
      await expect(tx)
        .to.emit(contracts.bendExchange, "NewTransferManager")
        .withArgs(contracts.transferManager.address);

      tx = await contracts.bendExchange
        .connect(env.admin)
        .updateAuthorizationManager(contracts.authorizationManager.address);
      await expect(tx)
        .to.emit(contracts.bendExchange, "NewAuthorizationManager")
        .withArgs(contracts.authorizationManager.address);

      tx = await contracts.bendExchange
        .connect(env.admin)
        .updateInterceptorManager(contracts.interceptorManager.address);
      await expect(tx)
        .to.emit(contracts.bendExchange, "NewInterceptorManager")
        .withArgs(contracts.interceptorManager.address);

      tx = await contracts.bendExchange.connect(env.admin).updateProtocolFeeRecipient(env.admin.address);
      await expect(tx).to.emit(contracts.bendExchange, "NewProtocolFeeRecipient").withArgs(env.admin.address);
    });

    it("Owner functions are only callable by owner", async () => {
      const notAdminUser = env.accounts[3];

      await expect(
        contracts.bendExchange.connect(notAdminUser).updateCurrencyManager(contracts.currencyManager.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        contracts.bendExchange.connect(notAdminUser).updateExecutionManager(contracts.executionManager.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        contracts.bendExchange.connect(notAdminUser).updateProtocolFeeRecipient(notAdminUser.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        contracts.bendExchange.connect(notAdminUser).updateRoyaltyFeeManager(contracts.royaltyFeeManager.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        contracts.bendExchange.connect(notAdminUser).updateTransferManager(contracts.transferManager.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        contracts.bendExchange.connect(notAdminUser).updateAuthorizationManager(contracts.authorizationManager.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(
        contracts.bendExchange.connect(notAdminUser).updateInterceptorManager(contracts.interceptorManager.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
