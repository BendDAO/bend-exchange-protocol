import { assert, expect } from "chai";
import { BigNumber, BytesLike, constants, utils } from "ethers";
import { ethers } from "hardhat";

import { MakerOrderWithSignature } from "./helpers/order-types";
import { createMakerOrder, createTakerOrder } from "./helpers/order-helper";
import { computeOrderHash } from "./helpers/signature-helper";
import { Contracts, Env, makeSuite, Snapshots } from "./_setup";
import { MockLendPool } from "../typechain";
import { gasCost } from "./helpers/gas-helper";

const { defaultAbiCoder, parseEther } = utils;

makeSuite("RedeemNFT", (contracts: Contracts, env: Env, snapshots: Snapshots) => {
  let startTimeOrder: BigNumber;
  let endTimeOrder: BigNumber;
  let encodedMockLendPool: BytesLike;
  let mockLendPool: MockLendPool;
  const emptyEncodedBytes = defaultAbiCoder.encode([], []);

  before(async () => {
    await contracts.weth.connect(env.admin).deposit({ value: parseEther("30") });
    const mockLendPoolAddress = await contracts.mockLendPoolAddressesProvider.getLendPool();
    await contracts.weth.connect(env.admin).transfer(mockLendPoolAddress, parseEther("30"));

    encodedMockLendPool = defaultAbiCoder.encode(["address"], [contracts.mockLendPoolAddressesProvider.address]);
    const mockLendPoolFactory = await ethers.getContractFactory("MockLendPool");
    mockLendPool = mockLendPoolFactory.attach(mockLendPoolAddress);
    await snapshots.capture("RedeemNFT");
  });

  beforeEach(async () => {
    // Set up defaults startTime/endTime (for orders)
    startTimeOrder = BigNumber.from((await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp);
    endTimeOrder = startTimeOrder.add(BigNumber.from("1000"));
  });

  afterEach(async () => {
    await snapshots.revert("RedeemNFT");
  });

  describe("#1 - Nft own hold", async () => {
    it("Order NFT/ETH - MakerAsk order is matched by TakerBid order", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];

      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: encodedMockLendPool,
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

      const expectedFeeBalanceInWETH = parseEther("3").mul(env.standardProtocolFee.toNumber()).div(10000);

      const expectedTakerBalanceInETH = (await ethers.provider.getBalance(takerBidUser.address)).sub(parseEther("3"));

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

      assert.equal(await contracts.mockERC721.ownerOf("0"), takerBidUser.address);

      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerAskUser.address, makerAskOrder.nonce)
      );

      assert.deepEqual(expectedFeeBalanceInWETH, await contracts.weth.balanceOf(env.feeRecipient.address));
      assert.deepEqual(expectedMakerBalanceInWETH, await contracts.weth.balanceOf(makerAskUser.address));
      assert.deepEqual(
        expectedTakerBalanceInETH.sub(await gasCost(tx)),
        await ethers.provider.getBalance(takerBidUser.address)
      );

      // Orders that have been executed cannot be matched again
      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        })
      ).to.be.revertedWith("Order: matching order expired");
    });
    it("Order NFT/WETH - MakerBid order is matched by TakerAsk order", async () => {
      const makerBidUser = env.accounts[2];
      const takerAskUser = env.accounts[1];
      const makerBidOrder = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
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
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
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
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: encodedMockLendPool,
      });

      const expectedMakerBalanceInWETH = (await contracts.weth.balanceOf(makerBidUser.address)).sub(parseEther("3"));

      const expectedFeeBalanceInWETH = parseEther("3").mul(env.standardProtocolFee.toNumber()).div(10000);

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
      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerBidUser.address, makerBidOrder.nonce)
      );
      assert.deepEqual(expectedTakerBalanceInWETH, await contracts.weth.balanceOf(takerAskUser.address));
      assert.deepEqual(expectedMakerBalanceInWETH, await contracts.weth.balanceOf(makerBidUser.address));
      assert.deepEqual(expectedFeeBalanceInWETH, await contracts.weth.balanceOf(env.feeRecipient.address));
    });
  });

  describe("#2 - Nft non auction", async () => {
    it("Order NFT/ETH - MakerAsk order is matched by TakerBid order", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];
      await contracts.mockERC721.connect(makerAskUser).setApprovalForAll(mockLendPool.address, true);
      await mockLendPool
        .connect(makerAskUser)
        .borrow(
          contracts.weth.address,
          parseEther("1"),
          contracts.mockERC721.address,
          constants.Zero,
          makerAskUser.address,
          0
        );
      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: encodedMockLendPool,
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

      const expectedFeeBalanceInWETH = parseEther("3").mul(env.standardProtocolFee.toNumber()).div(10000);

      const expectedTakerBalanceInETH = (await ethers.provider.getBalance(takerBidUser.address)).sub(parseEther("3"));

      const expectedMakerBalanceInWETH = (await contracts.weth.balanceOf(makerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH)
        .sub(parseEther("1"));

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

      assert.deepEqual(expectedFeeBalanceInWETH, await contracts.weth.balanceOf(env.feeRecipient.address));
      assert.deepEqual(expectedMakerBalanceInWETH, await contracts.weth.balanceOf(makerAskUser.address));
      assert.deepEqual(
        expectedTakerBalanceInETH.sub(await gasCost(tx)),
        await ethers.provider.getBalance(takerBidUser.address)
      );

      // Orders that have been executed cannot be matched again
      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        })
      ).to.be.revertedWith("Order: matching order expired");
    });

    it("Order NFT/(ETH + WETH) - MakerAsk order is matched by TakerBid order", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];
      await contracts.mockERC721.connect(makerAskUser).setApprovalForAll(mockLendPool.address, true);
      await mockLendPool
        .connect(makerAskUser)
        .borrow(
          contracts.weth.address,
          parseEther("1"),
          contracts.mockERC721.address,
          constants.Zero,
          makerAskUser.address,
          0
        );
      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
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
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: encodedMockLendPool,
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
      const expectedTakerBalanceInWETH = (await contracts.weth.balanceOf(takerBidUser.address)).sub(parseEther("1"));

      const expectedFeeBalanceInWETH = parseEther("3").mul(env.standardProtocolFee.toNumber()).div(10000);

      const expectedTakerBalanceInETH = (await ethers.provider.getBalance(takerBidUser.address)).sub(parseEther("2"));

      const expectedMakerBalanceInWETH = (await contracts.weth.balanceOf(makerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH)
        .sub(parseEther("1"));

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
      assert.deepEqual(expectedTakerBalanceInWETH, await contracts.weth.balanceOf(takerBidUser.address));
      assert.deepEqual(
        expectedTakerBalanceInETH.sub(await gasCost(tx)),
        await ethers.provider.getBalance(takerBidUser.address)
      );
      assert.deepEqual(expectedMakerBalanceInWETH, await contracts.weth.balanceOf(makerAskUser.address));
      assert.deepEqual(expectedFeeBalanceInWETH, await contracts.weth.balanceOf(env.feeRecipient.address));
    });

    it("Order NFT/WETH - MakerBid order is matched by TakerAsk order", async () => {
      const makerBidUser = env.accounts[2];
      const takerAskUser = env.accounts[1];
      await contracts.mockERC721.connect(takerAskUser).setApprovalForAll(mockLendPool.address, true);
      await mockLendPool
        .connect(takerAskUser)
        .borrow(
          contracts.weth.address,
          parseEther("1"),
          contracts.mockERC721.address,
          constants.Zero,
          takerAskUser.address,
          0
        );
      const makerBidOrder = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
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
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
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
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: encodedMockLendPool,
      });

      const expectedMakerBalanceInWETH = (await contracts.weth.balanceOf(makerBidUser.address)).sub(parseEther("3"));

      const expectedFeeBalanceInWETH = parseEther("3").mul(env.standardProtocolFee.toNumber()).div(10000);

      const expectedTakerBalanceInWETH = (await contracts.weth.balanceOf(takerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH)
        .sub(parseEther("1"));

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
      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerBidUser.address, makerBidOrder.nonce)
      );
      assert.deepEqual(expectedTakerBalanceInWETH, await contracts.weth.balanceOf(takerAskUser.address));
      assert.deepEqual(expectedMakerBalanceInWETH, await contracts.weth.balanceOf(makerBidUser.address));
      assert.deepEqual(expectedFeeBalanceInWETH, await contracts.weth.balanceOf(env.feeRecipient.address));
    });

    it("Order NFT/(ETH + WETH) - MakerAsk order is matched by TakerBid order, maker require ETH", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];
      await contracts.mockERC721.connect(makerAskUser).setApprovalForAll(mockLendPool.address, true);
      await mockLendPool
        .connect(makerAskUser)
        .borrow(
          contracts.weth.address,
          parseEther("1"),
          contracts.mockERC721.address,
          constants.Zero,
          makerAskUser.address,
          0
        );

      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
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
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: encodedMockLendPool,
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

      const expectedFeeBalanceInWETH = parseEther("3").mul(env.standardProtocolFee.toNumber()).div(10000);

      // Order is worth 3 ETH; taker user splits it as 2 ETH + 1 WETH
      const expectedTakerBalanceInWETH = (await contracts.weth.balanceOf(takerBidUser.address)).sub(parseEther("1"));
      const expectedTakerBalanceInETH = (await ethers.provider.getBalance(takerBidUser.address)).sub(parseEther("2"));

      const expectedMakerBalanceInETH = (await ethers.provider.getBalance(makerAskUser.address)).add(
        parseEther("3").sub(expectedFeeBalanceInWETH).sub(parseEther("1"))
      );

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

      // Check balance is same as expected
      assert.deepEqual(expectedTakerBalanceInWETH, await contracts.weth.balanceOf(takerBidUser.address));
      assert.deepEqual(
        expectedTakerBalanceInETH.sub(await gasCost(tx)),
        await ethers.provider.getBalance(takerBidUser.address)
      );
      assert.deepEqual(expectedMakerBalanceInETH, await ethers.provider.getBalance(makerAskUser.address));
      assert.deepEqual(expectedFeeBalanceInWETH, await contracts.weth.balanceOf(env.feeRecipient.address));
    });
  });
  describe("#3 - Nft in auction", async () => {
    it("Order NFT/ETH - MakerAsk order is matched by TakerBid order", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];
      await contracts.mockERC721.connect(makerAskUser).setApprovalForAll(mockLendPool.address, true);
      await mockLendPool
        .connect(makerAskUser)
        .borrow(
          contracts.weth.address,
          parseEther("1"),
          contracts.mockERC721.address,
          constants.Zero,
          makerAskUser.address,
          0
        );
      await mockLendPool.setMockInAuction(contracts.mockERC721.address, constants.Zero, parseEther("0.2"));
      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: encodedMockLendPool,
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

      const expectedFeeBalanceInWETH = parseEther("3").mul(env.standardProtocolFee.toNumber()).div(10000);

      const expectedTakerBalanceInETH = (await ethers.provider.getBalance(takerBidUser.address)).sub(parseEther("3"));

      const expectedMakerBalanceInWETH = (await contracts.weth.balanceOf(makerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH)
        .sub(parseEther("1.2"));

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

      assert.deepEqual(expectedFeeBalanceInWETH, await contracts.weth.balanceOf(env.feeRecipient.address));
      assert.deepEqual(expectedMakerBalanceInWETH, await contracts.weth.balanceOf(makerAskUser.address));
      assert.deepEqual(
        expectedTakerBalanceInETH.sub(await gasCost(tx)),
        await ethers.provider.getBalance(takerBidUser.address)
      );

      // Orders that have been executed cannot be matched again
      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        })
      ).to.be.revertedWith("Order: matching order expired");
    });

    it("Order NFT/(ETH + WETH) - MakerAsk order is matched by TakerBid order", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];
      await contracts.mockERC721.connect(makerAskUser).setApprovalForAll(mockLendPool.address, true);
      await mockLendPool
        .connect(makerAskUser)
        .borrow(
          contracts.weth.address,
          parseEther("1"),
          contracts.mockERC721.address,
          constants.Zero,
          makerAskUser.address,
          0
        );
      await mockLendPool.setMockInAuction(contracts.mockERC721.address, constants.Zero, parseEther("0.2"));
      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
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
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: encodedMockLendPool,
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
      const expectedTakerBalanceInWETH = (await contracts.weth.balanceOf(takerBidUser.address)).sub(parseEther("1"));

      const expectedFeeBalanceInWETH = parseEther("3").mul(env.standardProtocolFee.toNumber()).div(10000);

      const expectedTakerBalanceInETH = (await ethers.provider.getBalance(takerBidUser.address)).sub(parseEther("2"));

      const expectedMakerBalanceInWETH = (await contracts.weth.balanceOf(makerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH)
        .sub(parseEther("1.2"));

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
      assert.deepEqual(expectedTakerBalanceInWETH, await contracts.weth.balanceOf(takerBidUser.address));
      assert.deepEqual(
        expectedTakerBalanceInETH.sub(await gasCost(tx)),
        await ethers.provider.getBalance(takerBidUser.address)
      );
      assert.deepEqual(expectedMakerBalanceInWETH, await contracts.weth.balanceOf(makerAskUser.address));
      assert.deepEqual(expectedFeeBalanceInWETH, await contracts.weth.balanceOf(env.feeRecipient.address));
    });

    it("Order NFT/WETH - MakerBid order is matched by TakerAsk order", async () => {
      const makerBidUser = env.accounts[2];
      const takerAskUser = env.accounts[1];
      await contracts.mockERC721.connect(takerAskUser).setApprovalForAll(mockLendPool.address, true);
      await mockLendPool
        .connect(takerAskUser)
        .borrow(
          contracts.weth.address,
          parseEther("1"),
          contracts.mockERC721.address,
          constants.Zero,
          takerAskUser.address,
          0
        );
      await mockLendPool.setMockInAuction(contracts.mockERC721.address, constants.Zero, parseEther("0.2"));
      const makerBidOrder = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
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
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
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
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: encodedMockLendPool,
      });

      const expectedMakerBalanceInWETH = (await contracts.weth.balanceOf(makerBidUser.address)).sub(parseEther("3"));

      const expectedFeeBalanceInWETH = parseEther("3").mul(env.standardProtocolFee.toNumber()).div(10000);

      const expectedTakerBalanceInWETH = (await contracts.weth.balanceOf(takerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH)
        .sub(parseEther("1.2"));

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
      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerBidUser.address, makerBidOrder.nonce)
      );
      assert.deepEqual(expectedTakerBalanceInWETH, await contracts.weth.balanceOf(takerAskUser.address));
      assert.deepEqual(expectedMakerBalanceInWETH, await contracts.weth.balanceOf(makerBidUser.address));
      assert.deepEqual(expectedFeeBalanceInWETH, await contracts.weth.balanceOf(env.feeRecipient.address));
    });

    it("Order/BNFT/(ETH + WETH) - MakerAsk order with native ETH currency is matched by TakerBid order", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];
      await contracts.mockERC721.connect(makerAskUser).setApprovalForAll(mockLendPool.address, true);
      await mockLendPool
        .connect(makerAskUser)
        .borrow(
          contracts.weth.address,
          parseEther("1"),
          contracts.mockERC721.address,
          constants.Zero,
          makerAskUser.address,
          0
        );
      await mockLendPool.setMockInAuction(contracts.mockERC721.address, constants.Zero, parseEther("0.2"));
      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
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
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: encodedMockLendPool,
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

      const expectedFeeBalanceInWETH = parseEther("3").mul(env.standardProtocolFee.toNumber()).div(10000);

      // Order is worth 3 ETH; taker user splits it as 2 ETH + 1 WETH
      const expectedTakerBalanceInWETH = (await contracts.weth.balanceOf(takerBidUser.address)).sub(parseEther("1"));
      const expectedTakerBalanceInETH = (await ethers.provider.getBalance(takerBidUser.address)).sub(parseEther("2"));

      const expectedMakerBalanceInETH = (await ethers.provider.getBalance(makerAskUser.address))
        .add(parseEther("3"))
        .sub(expectedFeeBalanceInWETH)
        .sub(parseEther("1.2"));

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

      // Check balance is same as expected
      assert.deepEqual(expectedTakerBalanceInWETH, await contracts.weth.balanceOf(takerBidUser.address));
      assert.deepEqual(
        expectedTakerBalanceInETH.sub(await gasCost(tx)),
        await ethers.provider.getBalance(takerBidUser.address)
      );
      assert.deepEqual(expectedMakerBalanceInETH, await ethers.provider.getBalance(makerAskUser.address));
      assert.deepEqual(expectedFeeBalanceInWETH, await contracts.weth.balanceOf(env.feeRecipient.address));
    });
  });
  describe("#4 - Revertions", async () => {
    it("Cannot trade if no NFT ownership", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];
      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: encodedMockLendPool,
        collection: contracts.mockERC721.address,
        price: parseEther("3"),
        tokenId: BigNumber.from(3),
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
        tokenId: BigNumber.from(3),
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        })
      ).to.be.revertedWith("Interceptor: no BNFT");
    });
    it("Cannot trade if no BNFT ownership", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];
      const bendDAOUser = env.accounts[3];

      await contracts.mockERC721.connect(bendDAOUser).setApprovalForAll(mockLendPool.address, true);
      await mockLendPool
        .connect(bendDAOUser)
        .borrow(
          contracts.weth.address,
          parseEther("1"),
          contracts.mockERC721.address,
          constants.Two,
          bendDAOUser.address,
          0
        );

      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: encodedMockLendPool,
        collection: contracts.mockERC721.address,
        price: parseEther("3"),
        tokenId: constants.Two,
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
        tokenId: constants.Two,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
      });

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        })
      ).to.be.revertedWith("Interceptor: not BNFT owner");
    });
    it("Cannot trade if order price < tatal debt", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];
      await contracts.mockERC721.connect(makerAskUser).setApprovalForAll(mockLendPool.address, true);
      await mockLendPool
        .connect(makerAskUser)
        .borrow(
          contracts.weth.address,
          parseEther("3.1"),
          contracts.mockERC721.address,
          constants.Zero,
          makerAskUser.address,
          0
        );
      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: encodedMockLendPool,
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

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        })
      ).to.be.revertedWith("Interceptor: insufficent to repay debt");
    });

    it("Cannot trade if order price < (tatal debt + bid fine)", async () => {
      const makerAskUser = env.accounts[1];
      const takerBidUser = env.accounts[2];
      await contracts.mockERC721.connect(makerAskUser).setApprovalForAll(mockLendPool.address, true);
      await mockLendPool
        .connect(makerAskUser)
        .borrow(
          contracts.weth.address,
          parseEther("2.9"),
          contracts.mockERC721.address,
          constants.Zero,
          makerAskUser.address,
          0
        );
      await mockLendPool.setMockInAuction(contracts.mockERC721.address, constants.Zero, parseEther("0.2"));

      const makerAskOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: true,
        maker: makerAskUser.address,
        interceptor: contracts.redeemNFT.address,
        interceptorExtra: encodedMockLendPool,
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

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
          value: takerBidOrder.price,
        })
      ).to.be.revertedWith("Interceptor: insufficent to repay debt");
    });
  });
});
