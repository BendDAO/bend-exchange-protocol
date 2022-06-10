import { BigNumber, constants } from "ethers";
import { defaultAbiCoder, parseEther } from "ethers/lib/utils";
import { task } from "hardhat/config";
import { createSignedMakerOrder, createTakerOrder } from "../test/helpers/order-helper";
import { MakerOrderWithSignature } from "../test/helpers/order-types";
import { getParamPerNetwork, WETH, BendAddressesProviders } from "./config";
import { getContractFromDB, getContractAddressFromDB, getChainId, getContract, waitForTx } from "./utils/helpers";

task("trade:BNFT", "test trade BNFT")
  .addParam("maker", "address of maker")
  .addParam("makerkey", "private key of maker")
  .addParam("taker", "address of taker")
  .addParam("takerkey", "private key of taker")
  .addParam("nft", "address of nft")
  .addParam("tokenid", "token id of nft")
  .setAction(async ({ maker, makerkey, taker, takerkey, nft, tokenid }, { ethers, network, run }) => {
    await run("set-DRE");
    const chainId = await getChainId();
    console.log(`chainId: ${chainId}`);
    console.log(`maker: ${maker}`);
    console.log(`taker: ${taker}`);
    console.log(`nft: ${nft}`);
    console.log(`tokenid: ${tokenid}`);

    const makerSigner = new ethers.Wallet(makerkey, ethers.provider);
    const takerSigner = new ethers.Wallet(takerkey, ethers.provider);
    const emptyEncodedBytes = defaultAbiCoder.encode([], []);
    const bendAddressesProviders = getParamPerNetwork(BendAddressesProviders, network.name);
    const price = parseEther("1");
    const weth = getParamPerNetwork(WETH, network.name);

    // check proxy
    const authManager = await getContractFromDB("AuthorizationManager");
    if ((await authManager.proxies(maker)) === constants.AddressZero) {
      console.log("register maker proxy");
      waitForTx(await authManager.connect(makerSigner).registerProxy());
    }
    if ((await authManager.proxies(taker)) === constants.AddressZero) {
      console.log("register taker proxy");
      waitForTx(await authManager.connect(takerSigner).registerProxy());
    }

    const makerProxy = await authManager.proxies(maker);
    const takerProxy = await authManager.proxies(taker);
    // check allowance
    const wethContract = await getContract("WETH", weth);
    const allowance = await wethContract.allowance(taker, takerProxy);
    if (allowance.lt(price)) {
      console.log("approve taker weth");
      waitForTx(await wethContract.connect(takerSigner).approve(takerProxy, constants.MaxUint256));
    }
    const nftContract = await getContract("ERC721", nft);
    const nftAllowance = await nftContract.isApprovedForAll(maker, makerProxy);
    if (!nftAllowance) {
      console.log("approve maker nft");
      waitForTx(await nftContract.connect(makerSigner).setApprovalForAll(makerProxy, true));
    }

    const startTimeNow = BigNumber.from(
      (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
    );
    const startTimeOrder = startTimeNow.sub(3600 * 24);
    const endTimeOrder = startTimeNow.add(3600 * 24);

    const bendExchange = await getContractFromDB("BendExchange");
    const interceptorAddress = await getContractAddressFromDB("RedeemNFT");
    const interceptorExtra = defaultAbiCoder.encode(["address"], [bendAddressesProviders]);

    const makerAskOrder: MakerOrderWithSignature = await createSignedMakerOrder({
      isOrderAsk: true,
      maker: maker,
      interceptor: interceptorAddress,
      interceptorExtra: interceptorExtra,
      collection: nft,
      price,
      tokenId: tokenid,
      amount: constants.One,
      strategy: await getContractAddressFromDB("StrategyStandardSaleForFixedPrice"),
      currency: weth,
      nonce: constants.Zero,
      startTime: startTimeOrder,
      endTime: endTimeOrder,
      minPercentageToAsk: BigNumber.from(9800),
      params: emptyEncodedBytes,
      privateKey: makerkey,
      chainId,
      verifyingContract: bendExchange.address,
    });
    const takerBidOrder = createTakerOrder({
      isOrderAsk: false,
      taker: taker,
      price,
      tokenId: tokenid,
      minPercentageToAsk: BigNumber.from(9800),
      params: emptyEncodedBytes,
      interceptor: constants.AddressZero,
      interceptorExtra: emptyEncodedBytes,
    });

    await bendExchange.connect(takerSigner).matchAskWithTakerBidUsingETHAndWETH(takerBidOrder, makerAskOrder, {
      value: price,
    });
  });
