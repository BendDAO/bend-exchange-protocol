import type { HardhatUserConfig } from "hardhat/types";
import { task } from "hardhat/config";
import fs from "fs";
import path from "path";

import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-abi-exporter";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "dotenv/config";

import { Network, NETWORKS_RPC_URL } from "./tasks/config";

const GWEI = 1000 * 1000 * 1000;

const ETHERSCAN_KEY = process.env.ETHERSCAN_KEY || "";
const MNEMONIC_PATH = "m/44'/60'/0'/0";
const MNEMONIC = process.env.MNEMONIC || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const REPORT_GAS = !!process.env.REPORT_GAS;

const tasksPath = path.join(__dirname, "tasks");
fs.readdirSync(tasksPath)
  .filter((pth) => pth.includes(".ts"))
  .forEach((task) => {
    require(`${tasksPath}/${task}`);
  });

task("accounts", "Prints the list of accounts", async (_args, hre) => {
  const accounts = await hre.ethers.getSigners();
  accounts.forEach(async (account) => console.info(account.address));
});

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
    },
    sepolia: {
      gasPrice: 35 * GWEI,
      url: NETWORKS_RPC_URL[Network.sepolia],
      accounts: PRIVATE_KEY
        ? [PRIVATE_KEY]
        : {
            mnemonic: MNEMONIC,
            path: MNEMONIC_PATH,
            initialIndex: 0,
            count: 20,
          },
    },
    goerli: {
      url: NETWORKS_RPC_URL[Network.goerli],
      accounts: PRIVATE_KEY
        ? [PRIVATE_KEY]
        : {
            mnemonic: MNEMONIC,
            path: MNEMONIC_PATH,
            initialIndex: 0,
            count: 20,
          },
    },
    rinkeby: {
      url: NETWORKS_RPC_URL[Network.rinkeby],
      accounts: PRIVATE_KEY
        ? [PRIVATE_KEY]
        : {
            mnemonic: MNEMONIC,
            path: MNEMONIC_PATH,
            initialIndex: 0,
            count: 20,
          },
    },
    main: {
      gasPrice: 35 * GWEI,
      url: NETWORKS_RPC_URL[Network.main],
      accounts: PRIVATE_KEY
        ? [PRIVATE_KEY]
        : {
            mnemonic: MNEMONIC,
            path: MNEMONIC_PATH,
            initialIndex: 0,
            count: 20,
          },
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_KEY,
  },
  solidity: {
    compilers: [
      {
        version: "0.8.9",
        settings: { optimizer: { enabled: true, runs: 888888 } },
      },
      {
        version: "0.4.18",
        settings: { optimizer: { enabled: true, runs: 999 } },
      },
    ],
  },
  paths: {
    sources: "./contracts/",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  abiExporter: {
    path: "./abis",
    runOnCompile: true,
    clear: true,
    flat: true,
    pretty: false,
    except: ["test*", "@openzeppelin*", "uniswap*"],
  },
  gasReporter: {
    enabled: REPORT_GAS,
    excludeContracts: ["test*", "@openzeppelin*"],
  },
};

export default config;
