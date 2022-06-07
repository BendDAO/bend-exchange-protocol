import { assert, expect } from "chai";
import { BigNumber, constants, utils } from "ethers";
import { ethers } from "hardhat";
import { MerkleTree } from "merkletreejs";
/* eslint-disable node/no-extraneous-import */
import { keccak256 } from "js-sha3";

import { MakerOrderWithSignature } from "../helpers/order-types";
import { createMakerOrder, createTakerOrder } from "../helpers/order-helper";
import { computeOrderHash } from "../helpers/signature-helper";
import { Contracts, Env, makeSuite, Snapshots } from "../_setup";

const { defaultAbiCoder, parseEther } = utils;

makeSuite(
  "Strategy - AnyItemInASetForFixedPrice ('Trait orders')",
  (contracts: Contracts, env: Env, snapshots: Snapshots) => {
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

    it("ERC721 - MakerAsk order is matched by TakerBid order", async () => {
      const takerAskUser = env.accounts[3]; // has tokenId=2
      const makerBidUser = env.accounts[1];

      // User wishes to buy either tokenId = 0, 2, 3, or 12
      const eligibleTokenIds = ["0", "2", "3", "12"];

      // Compute the leaves using Solidity keccak256 (Equivalent of keccak256 with abi.encodePacked) and converts to hex
      const leaves = eligibleTokenIds.map((x) => "0x" + utils.solidityKeccak256(["uint256"], [x]).substr(2));

      // Compute MerkleTree based on the computed leaves
      const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

      // Compute the proof for index=1 (aka tokenId=2)
      const hexProof = tree.getHexProof(leaves[1], 1);

      // Compute the root of the tree
      const hexRoot = tree.getHexRoot();

      // Verify leaf is matched in the tree with the computed root
      assert.isTrue(tree.verify(hexProof, leaves[1], hexRoot));

      const makerBidOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero,
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyAnyItemInASetForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: defaultAbiCoder.encode(["bytes32"], [hexRoot]),
        signerUser: makerBidUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerAskOrder = createTakerOrder({
        isOrderAsk: true,
        taker: takerAskUser.address,
        tokenId: BigNumber.from("2"),
        price: makerBidOrder.price,
        minPercentageToAsk: constants.Zero,
        params: defaultAbiCoder.encode(["bytes32[]"], [hexProof]),
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
          contracts.strategyAnyItemInASetForFixedPrice.address,
          makerBidOrder.currency,
          makerBidOrder.collection,
          takerAskOrder.tokenId,
          makerBidOrder.amount,
          makerBidOrder.price
        );

      assert.equal(await contracts.mockERC721.ownerOf("2"), makerBidUser.address);
      assert.isTrue(
        await contracts.bendExchange.isUserOrderNonceExecutedOrCancelled(makerBidUser.address, makerBidOrder.nonce)
      );
    });

    it("ERC721 - TokenIds not in the set cannot be sold", async () => {
      const takerAskUser = env.accounts[3]; // has tokenId=2
      const makerBidUser = env.accounts[1];

      // User wishes to buy either tokenId = 1, 2, 3, 4, or 12
      const eligibleTokenIds = ["1", "2", "3", "4", "12"];

      // Compute the leaves using Solidity keccak256 (Equivalent of keccak256 with abi.encodePacked) and converts to hex
      const leaves = eligibleTokenIds.map((x) => "0x" + utils.solidityKeccak256(["uint256"], [x]).substr(2));

      // Compute MerkleTree based on the computed leaves
      const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

      // Compute the proof for index=1 (aka tokenId=2)
      const hexProof = tree.getHexProof(leaves[1], 1);

      // Compute the root of the tree
      const hexRoot = tree.getHexRoot();

      // Verify leaf is matched in the tree with the computed root
      assert.isTrue(tree.verify(hexProof, leaves[1], hexRoot));

      const makerBidOrder: MakerOrderWithSignature = await createMakerOrder({
        isOrderAsk: false,
        maker: makerBidUser.address,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        collection: contracts.mockERC721.address,
        tokenId: constants.Zero, // not used
        price: parseEther("3"),
        amount: constants.One,
        strategy: contracts.strategyAnyItemInASetForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: defaultAbiCoder.encode(["bytes32"], [hexRoot]),
        signerUser: makerBidUser,
        verifyingContract: contracts.bendExchange.address,
      });

      for (const tokenId of Array.from(Array(9).keys())) {
        // If the tokenId is not included, it skips
        if (!eligibleTokenIds.includes(tokenId.toString())) {
          const takerAskOrder = createTakerOrder({
            isOrderAsk: true,
            taker: takerAskUser.address,
            tokenId: BigNumber.from(tokenId),
            price: parseEther("3"),
            minPercentageToAsk: constants.Zero,
            params: defaultAbiCoder.encode(["bytes32[]"], [hexProof]),
            interceptor: constants.AddressZero,
            interceptorExtra: emptyEncodedBytes,
          });

          await expect(
            contracts.bendExchange.connect(takerAskUser).matchBidWithTakerAsk(takerAskOrder, makerBidOrder)
          ).to.be.revertedWith("Strategy: execution invalid");
        }
      }
    });

    it("Cannot match if wrong side", async () => {
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
        strategy: contracts.strategyAnyItemInASetForFixedPrice.address,
        currency: contracts.weth.address,
        nonce: constants.Zero,
        startTime: startTimeOrder,
        endTime: endTimeOrder,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes, // these parameters are used after it reverts
        signerUser: makerAskUser,
        verifyingContract: contracts.bendExchange.address,
      });

      const takerBidOrder = {
        isOrderAsk: false,
        isTakerFirst: false,
        interceptor: constants.AddressZero,
        interceptorExtra: emptyEncodedBytes,
        taker: takerBidUser.address,
        tokenId: makerAskOrder.tokenId,
        price: makerAskOrder.price,
        minPercentageToAsk: constants.Zero,
        params: emptyEncodedBytes,
      };

      await expect(
        contracts.bendExchange.connect(takerBidUser).matchAskWithTakerBid(takerBidOrder, makerAskOrder)
      ).to.be.revertedWith("Strategy: execution invalid");
    });
  }
);
