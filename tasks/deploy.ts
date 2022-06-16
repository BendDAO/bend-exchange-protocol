import { task } from "hardhat/config";
import { getParamPerNetwork, RoyaltyFeeLimit, WETH, ProtocolFee } from "./config";
import { deployContract, getDeploySigner } from "./utils/helpers";

task("deploy:full", "Deploy all contracts").setAction(async (_, { network, run }) => {
  await run("set-DRE");
  await run("compile");

  const deployer = await getDeploySigner();

  // config
  const weth = getParamPerNetwork(WETH, network.name);
  const royaltyFeeLimit = getParamPerNetwork(RoyaltyFeeLimit, network.name);
  const protocolFee = getParamPerNetwork(ProtocolFee, network.name);

  const currencyManager = await deployContract("CurrencyManager", [], true);

  await currencyManager.connect(deployer).addCurrency(weth);

  const executionManager = await deployContract("ExecutionManager", [], true);
  const strategyStandardSaleForFixedPrice = await deployContract(
    "StrategyStandardSaleForFixedPrice",
    [protocolFee],
    true
  );
  await executionManager.connect(deployer).addStrategy(strategyStandardSaleForFixedPrice.address);

  const royaltyFeeRegistry = await deployContract("RoyaltyFeeRegistry", [royaltyFeeLimit], true);
  const royaltyFeeSetter = await deployContract("RoyaltyFeeSetter", [royaltyFeeRegistry.address], true);
  await royaltyFeeRegistry.connect(deployer).transferOwnership(royaltyFeeSetter.address);
  const royaltyFeeManager = await deployContract("RoyaltyFeeManager", [royaltyFeeRegistry.address], true);

  const transferERC721 = await deployContract("TransferERC721", [], true);
  const transferERC1155 = await deployContract("TransferERC1155", [], true);
  const transferManager = await deployContract(
    "TransferManager",
    [transferERC721.address, transferERC1155.address],
    true
  );

  const redeemNFT = await deployContract("RedeemNFT", [], true);
  const interceptorManager = await deployContract("InterceptorManager", [], true);
  await interceptorManager.connect(deployer).addCollectionInterceptor(redeemNFT.address);

  const bendExchange = await deployContract(
    "BendExchange",
    [
      interceptorManager.address,
      transferManager.address,
      currencyManager.address,
      executionManager.address,
      royaltyFeeManager.address,
      weth,
      await deployer.getAddress(),
    ],
    true
  );

  const authorizationManager = await deployContract("AuthorizationManager", [weth, bendExchange.address], true);

  await bendExchange.connect(deployer).updateAuthorizationManager(authorizationManager.address);
});
