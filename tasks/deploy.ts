import { constants } from "ethers";
import { task } from "hardhat/config";
import { getParamPerNetwork, RoyaltyFeeLimit, WETH, ProtocolFee, FeeRecipient } from "./config";
import { deployContract, getContractFromDB, getDeploySigner } from "./utils/helpers";

task("deploy:full", "Deploy all contracts").setAction(async (_, { network, run }) => {
  await run("set-DRE");
  await run("compile");

  const deployer = await getDeploySigner();

  // configs
  const weth = getParamPerNetwork(WETH, network.name);
  const royaltyFeeLimit = getParamPerNetwork(RoyaltyFeeLimit, network.name);
  const feeRecipient = getParamPerNetwork(FeeRecipient, network.name);

  const currencyManager = await deployContract("CurrencyManager");

  const executionManager = await deployContract("ExecutionManager");

  const royaltyFeeRegistry = await deployContract("RoyaltyFeeRegistry", [royaltyFeeLimit]);
  const royaltyFeeSetter = await deployContract("RoyaltyFeeSetter", [royaltyFeeRegistry.address]);
  const royaltyFeeManager = await deployContract("RoyaltyFeeManager", [royaltyFeeRegistry.address]);

  const transferERC721 = await deployContract("TransferERC721");
  const transferERC1155 = await deployContract("TransferERC1155");
  const transferManager = await deployContract("TransferManager", [transferERC721.address, transferERC1155.address]);

  const interceptorManager = await deployContract("InterceptorManager");

  const bendExchange = await deployContract("BendExchange", [
    interceptorManager.address,
    transferManager.address,
    currencyManager.address,
    executionManager.address,
    royaltyFeeManager.address,
    weth,
    feeRecipient,
  ]);

  const authorizationManager = await deployContract("AuthorizationManager", [weth, bendExchange.address]);

  // config contracts
  await bendExchange.connect(deployer).updateAuthorizationManager(authorizationManager.address);
  await royaltyFeeRegistry.connect(deployer).transferOwnership(royaltyFeeSetter.address);

  await currencyManager.connect(deployer).addCurrency(weth);
  await currencyManager.connect(deployer).addCurrency(constants.AddressZero);

  await run("deploy:Strategy");
  await run("deploy:RedeemNFT");
});

task("deploy:Strategy", "Deploy Strategy").setAction(async (_, { network, run }) => {
  await run("set-DRE");
  await run("compile");
  const protocolFee = getParamPerNetwork(ProtocolFee, network.name);
  const strategyStandardSaleForFixedPrice = await deployContract("StrategyStandardSaleForFixedPrice", [protocolFee]);
  const executionManager = await getContractFromDB("ExecutionManager");
  await executionManager.connect(await getDeploySigner()).addStrategy(strategyStandardSaleForFixedPrice.address);
});

task("deploy:RedeemNFT", "Deploy RedeemNFT").setAction(async (_, { run }) => {
  await run("set-DRE");
  await run("compile");
  const redeemNFT = await deployContract("RedeemNFT");
  const interceptorManager = await getContractFromDB("InterceptorManager");
  await interceptorManager.connect(await getDeploySigner()).addCollectionInterceptor(redeemNFT.address);
});
