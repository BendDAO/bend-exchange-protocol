/* eslint-disable @typescript-eslint/no-explicit-any */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, constants } from "ethers";
import { ethers } from "hardhat";
import { assert } from "chai";
import { defaultAbiCoder, parseEther } from "ethers/lib/utils";
import {
  AuthorizationManager,
  BendExchange,
  CurrencyManager,
  ExecutionManager,
  MockERC1155,
  MockERC20,
  MockERC721,
  MockERC721WithRoyalty,
  RoyaltyFeeManager,
  RoyaltyFeeRegistry,
  RoyaltyFeeSetter,
  StrategyAnyItemFromCollectionForFixedPrice,
  StrategyAnyItemInASetForFixedPrice,
  StrategyDutchAuction,
  StrategyPrivateSale,
  StrategyStandardSaleForFixedPrice,
  TransferERC1155,
  RedeemNFT,
  TransferERC721,
  TransferManager,
  InterceptorManager,
  TransferNonCompliantERC721,
  MockLendPoolAddressesProvider,
  WETH,
} from "../typechain";
import { computeDomainSeparator } from "./helpers/signature-helper";

export interface Contracts {
  initialized: boolean;
  weth: WETH;
  mockERC721: MockERC721;
  mockERC1155: MockERC1155;
  mockUSDT: MockERC20;
  mockERC721WithRoyalty: MockERC721WithRoyalty;
  currencyManager: CurrencyManager;
  executionManager: ExecutionManager;
  authorizationManager: AuthorizationManager;
  interceptorManager: InterceptorManager;
  transferManager: TransferManager;
  transferERC721: TransferERC721;
  transferNonCompliantERC721: TransferNonCompliantERC721;
  redeemNFT: RedeemNFT;
  transferERC1155: TransferERC1155;
  strategyStandardSaleForFixedPrice: StrategyStandardSaleForFixedPrice;
  strategyAnyItemFromCollectionForFixedPrice: StrategyAnyItemFromCollectionForFixedPrice;
  strategyDutchAuction: StrategyDutchAuction;
  strategyPrivateSale: StrategyPrivateSale;
  strategyAnyItemInASetForFixedPrice: StrategyAnyItemInASetForFixedPrice;
  royaltyFeeRegistry: RoyaltyFeeRegistry;
  royaltyFeeManager: RoyaltyFeeManager;
  royaltyFeeSetter: RoyaltyFeeSetter;
  bendExchange: BendExchange;
  mockLendPoolAddressesProvider: MockLendPoolAddressesProvider;
}

export async function tokenSetUp(users: SignerWithAddress[], contracts: Contracts): Promise<void> {
  for (const user of users) {
    // Each user gets 30 WETH
    await contracts.weth.connect(user).deposit({ value: parseEther("30") });

    // register proxy
    await contracts.authorizationManager.connect(user).registerProxy();
    const userProxy = await contracts.authorizationManager.proxies(user.address);

    // Set approval for WETH
    await contracts.weth.connect(user).approve(userProxy, constants.MaxUint256);

    // Each user mints 1 ERC721 NFT
    await contracts.mockERC721.connect(user).mint(user.address);

    // Set approval for all tokens in mock collection to user proxy for ERC721
    await contracts.mockERC721.connect(user).setApprovalForAll(userProxy, true);

    // Each user mints 1 ERC721WithRoyalty NFT
    await contracts.mockERC721WithRoyalty.connect(user).mint(user.address);

    // Set approval for all tokens in mock collection to user proxy for ERC721WithRoyalty
    await contracts.mockERC721WithRoyalty.connect(user).setApprovalForAll(userProxy, true);

    // Each user batch mints 2 ERC1155 for tokenIds 1, 2, 3
    await contracts.mockERC1155
      .connect(user)
      .mintBatch(user.address, ["1", "2", "3"], ["2", "2", "2"], defaultAbiCoder.encode([], []));

    // Set approval for all tokens in mock collection to transferManager contract for ERC1155
    await contracts.mockERC1155.connect(user).setApprovalForAll(userProxy, true);
  }
}

export async function setUp(
  admin: SignerWithAddress,
  feeRecipient: SignerWithAddress,
  royaltyCollector: SignerWithAddress,
  standardProtocolFee: BigNumber,
  royaltyFeeLimit: BigNumber
): Promise<Contracts> {
  /** 1. Deploy WETH, Mock ERC721, Mock ERC1155, Mock USDT, MockERC721WithRoyalty
   */
  const WETH = await ethers.getContractFactory("WETH");
  const weth = await WETH.deploy();
  await weth.deployed();
  const MockERC721 = await ethers.getContractFactory("MockERC721");
  const mockERC721 = await MockERC721.deploy("Mock ERC721", "MERC721");
  await mockERC721.deployed();
  const MockERC1155 = await ethers.getContractFactory("MockERC1155");
  const mockERC1155 = await MockERC1155.deploy("uri/");
  await mockERC1155.deployed();
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockUSDT = await MockERC20.deploy("USD Tether", "USDT");
  await mockUSDT.deployed();
  const MockERC721WithRoyalty = await ethers.getContractFactory("MockERC721WithRoyalty");
  const mockERC721WithRoyalty = await MockERC721WithRoyalty.connect(royaltyCollector).deploy(
    "Mock Royalty ERC721",
    "MRC721",
    "200" // 2% royalty fee
  );
  await mockERC721WithRoyalty.deployed();

  /** 2. Deploy CurrencyManager contract and add WETH to whitelisted currencies
   */
  const CurrencyManager = await ethers.getContractFactory("CurrencyManager");
  const currencyManager = await CurrencyManager.deploy();
  await currencyManager.deployed();
  await currencyManager.connect(admin).addCurrency(weth.address);

  /** 3. Deploy ExecutionManager contract
   */
  const ExecutionManager = await ethers.getContractFactory("ExecutionManager");
  const executionManager = await ExecutionManager.deploy();
  await executionManager.deployed();

  /** 4. Deploy execution strategy contracts for trade execution
   */
  const StrategyAnyItemFromCollectionForFixedPrice = await ethers.getContractFactory(
    "StrategyAnyItemFromCollectionForFixedPrice"
  );
  const strategyAnyItemFromCollectionForFixedPrice = await StrategyAnyItemFromCollectionForFixedPrice.deploy(200);
  await strategyAnyItemFromCollectionForFixedPrice.deployed();
  const StrategyAnyItemInASetForFixedPrice = await ethers.getContractFactory("StrategyAnyItemInASetForFixedPrice");
  const strategyAnyItemInASetForFixedPrice = await StrategyAnyItemInASetForFixedPrice.deploy(standardProtocolFee);
  await strategyAnyItemInASetForFixedPrice.deployed();
  const StrategyDutchAuction = await ethers.getContractFactory("StrategyDutchAuction");
  const strategyDutchAuction = await StrategyDutchAuction.deploy(
    standardProtocolFee,
    BigNumber.from("900") // 15 minutes
  );
  await strategyDutchAuction.deployed();
  const StrategyPrivateSale = await ethers.getContractFactory("StrategyPrivateSale");
  const strategyPrivateSale = await StrategyPrivateSale.deploy(constants.Zero);
  await strategyPrivateSale.deployed();
  const StrategyStandardSaleForFixedPrice = await ethers.getContractFactory("StrategyStandardSaleForFixedPrice");
  const strategyStandardSaleForFixedPrice = await StrategyStandardSaleForFixedPrice.deploy(standardProtocolFee);
  await strategyStandardSaleForFixedPrice.deployed();

  // Whitelist these five strategies
  await executionManager.connect(admin).addStrategy(strategyStandardSaleForFixedPrice.address);
  await executionManager.connect(admin).addStrategy(strategyAnyItemFromCollectionForFixedPrice.address);
  await executionManager.connect(admin).addStrategy(strategyAnyItemInASetForFixedPrice.address);
  await executionManager.connect(admin).addStrategy(strategyDutchAuction.address);
  await executionManager.connect(admin).addStrategy(strategyPrivateSale.address);

  /** 5. Deploy RoyaltyFee Registry/Setter/Manager
   */
  const RoyaltyFeeRegistry = await ethers.getContractFactory("RoyaltyFeeRegistry");
  const royaltyFeeRegistry = await RoyaltyFeeRegistry.deploy(royaltyFeeLimit);
  await royaltyFeeRegistry.deployed();
  const RoyaltyFeeSetter = await ethers.getContractFactory("RoyaltyFeeSetter");
  const royaltyFeeSetter = await RoyaltyFeeSetter.deploy(royaltyFeeRegistry.address);
  await royaltyFeeSetter.deployed();
  const RoyaltyFeeManager = await ethers.getContractFactory("RoyaltyFeeManager");
  const royaltyFeeManager = await RoyaltyFeeManager.deploy(royaltyFeeRegistry.address);
  await royaltyFeeSetter.deployed();
  // Transfer ownership of RoyaltyFeeRegistry to RoyaltyFeeSetter
  await royaltyFeeRegistry.connect(admin).transferOwnership(royaltyFeeSetter.address);

  /** 6. Deploy TransferManager and transfers
   */

  const TransferERC721 = await ethers.getContractFactory("TransferERC721");
  const transferERC721 = await TransferERC721.deploy();
  await transferERC721.deployed();

  const TransferERC1155 = await ethers.getContractFactory("TransferERC1155");
  const transferERC1155 = await TransferERC1155.deploy();
  await transferERC1155.deployed();

  const TransferNonCompliantERC721 = await ethers.getContractFactory("TransferNonCompliantERC721");
  const transferNonCompliantERC721 = await TransferNonCompliantERC721.deploy();
  await transferNonCompliantERC721.deployed();

  const TransferManager = await ethers.getContractFactory("TransferManager");
  const transferManager = await TransferManager.deploy(transferERC721.address, transferERC1155.address);
  await transferManager.deployed();

  const InterceptorManager = await ethers.getContractFactory("InterceptorManager");
  const interceptorManager = await InterceptorManager.deploy();
  await interceptorManager.deployed();

  const RedeemNFT = await ethers.getContractFactory("RedeemNFT");
  const redeemNFT = await RedeemNFT.deploy();
  await redeemNFT.deployed();

  // Whitelist before transfers
  await interceptorManager.connect(admin).addCollectionInterceptor(redeemNFT.address);

  /** 7. Deploy BendExchange contract
   */
  const BendExchange = await ethers.getContractFactory("BendExchange");
  const bendExchange = await BendExchange.deploy(
    interceptorManager.address,
    transferManager.address,
    currencyManager.address,
    executionManager.address,
    royaltyFeeManager.address,
    weth.address,
    feeRecipient.address
  );
  await bendExchange.deployed();

  /** 8. Deploy AuthorizationManager contract
   */

  const AuthorizationManager = await ethers.getContractFactory("AuthorizationManager");
  const authorizationManager = await AuthorizationManager.deploy(weth.address, bendExchange.address);
  await authorizationManager.deployed();
  await bendExchange.updateAuthorizationManager(authorizationManager.address);

  /** 9. Deploy MockLendPool contract
   */

  const MockLendPoolAddressesProvider = await ethers.getContractFactory("MockLendPoolAddressesProvider");
  const mockLendPoolAddressesProvider = await MockLendPoolAddressesProvider.deploy();
  await mockLendPoolAddressesProvider.deployed();

  /** Return contracts
   */
  return {
    initialized: true,
    weth,
    mockLendPoolAddressesProvider,
    mockERC721,
    mockERC1155,
    mockUSDT,
    mockERC721WithRoyalty,
    currencyManager,
    executionManager,
    authorizationManager,
    interceptorManager,
    transferManager,
    transferERC721,
    transferNonCompliantERC721,
    redeemNFT,
    transferERC1155,
    strategyStandardSaleForFixedPrice,
    strategyAnyItemFromCollectionForFixedPrice,
    strategyDutchAuction,
    strategyPrivateSale,
    strategyAnyItemInASetForFixedPrice,
    royaltyFeeRegistry,
    royaltyFeeManager,
    royaltyFeeSetter,
    bendExchange,
  } as Contracts;
}

export class Snapshots {
  ids = new Map<string, string>();

  async capture(tag: string): Promise<void> {
    this.ids.set(tag, await this.evmSnapshot());
  }

  async revert(tag: string): Promise<void> {
    await this.evmRevert(this.ids.get(tag) || "1");
    await this.capture(tag);
  }

  async evmSnapshot(): Promise<any> {
    return await ethers.provider.send("evm_snapshot", []);
  }

  async evmRevert(id: string): Promise<any> {
    return await ethers.provider.send("evm_revert", [id]);
  }
}
export interface Env {
  initialized: boolean;
  accounts: SignerWithAddress[];
  admin: SignerWithAddress;
  feeRecipient: SignerWithAddress;
  royaltyCollector: SignerWithAddress;
  standardProtocolFee: BigNumber;
  royaltyFeeLimit: BigNumber; // 95%
}

const contracts: Contracts = { initialized: false } as Contracts;
const env: Env = { initialized: false } as Env;
const snapshots = new Snapshots();
export function makeSuite(name: string, tests: (contracts: Contracts, env: Env, snapshots: Snapshots) => void): void {
  describe(name, () => {
    let _id: any;
    before(async () => {
      if (!env.initialized && !contracts.initialized) {
        env.accounts = await ethers.getSigners();
        env.admin = env.accounts[0];
        env.feeRecipient = env.accounts[19];
        env.royaltyCollector = env.accounts[15];
        env.standardProtocolFee = BigNumber.from("200");
        env.royaltyFeeLimit = BigNumber.from("9500"); // 95%

        Object.assign(
          contracts,
          await setUp(env.admin, env.feeRecipient, env.royaltyCollector, env.standardProtocolFee, env.royaltyFeeLimit)
        );
        await tokenSetUp(env.accounts.slice(1, 10), contracts);
        env.initialized = true;
        contracts.initialized = true;
        // Verify the domain separator is properly computed
        assert.equal(
          await contracts.bendExchange.DOMAIN_SEPARATOR(),
          computeDomainSeparator(contracts.bendExchange.address)
        );
        snapshots.capture("setup");
      }
      _id = await snapshots.evmSnapshot();
    });
    tests(contracts, env, snapshots);
    after(async () => {
      await snapshots.evmRevert(_id);
    });
  });
}
