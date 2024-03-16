export enum Network {
  rinkeby = "rinkeby",
  main = "main",
  goerli = "goerli",
  sepolia = "sepolia",
}

export interface Params<T> {
  [Network.rinkeby]: T;
  [Network.main]: T;
  [Network.goerli]: T;
  [Network.sepolia]: T;
  [network: string]: T;
}

export const getParamPerNetwork = <T>({ sepolia, goerli, rinkeby, main }: Params<T>, network: string): T => {
  network = Network[network as keyof typeof Network];
  switch (network) {
    case Network.sepolia:
      return sepolia;
    case Network.goerli:
      return goerli;
    case Network.rinkeby:
      return rinkeby;
    case Network.main:
      return main;
    default:
      return main;
  }
};

const INFURA_KEY = process.env.INFURA_KEY || "";
const ALCHEMY_KEY = process.env.ALCHEMY_KEY || "";

export const NETWORKS_RPC_URL: Params<string> = {
  [Network.sepolia]: ALCHEMY_KEY
    ? `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`
    : `https://sepolia.infura.io/v3/${INFURA_KEY}`,
  [Network.goerli]: ALCHEMY_KEY
    ? `https://eth-goerli.g.alchemy.com/v2/${ALCHEMY_KEY}`
    : `https://goerli.infura.io/v3/${INFURA_KEY}`,
  [Network.rinkeby]: ALCHEMY_KEY
    ? `https://eth-rinkeby.g.alchemy.com/v2/${ALCHEMY_KEY}`
    : `https://rinkeby.infura.io/v3/${INFURA_KEY}`,
  [Network.main]: ALCHEMY_KEY
    ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
    : `https://mainnet.infura.io/v3/${INFURA_KEY}`,
};

export const WETH: Params<string> = {
  [Network.sepolia]: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  [Network.goerli]: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
  [Network.rinkeby]: "0xc778417e063141139fce010982780140aa0cd5ab",
  [Network.main]: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
};

export const RoyaltyFeeLimit: Params<number> = {
  [Network.sepolia]: 1000,
  [Network.goerli]: 1000,
  [Network.rinkeby]: 1000,
  [Network.main]: 1000,
};

export const FeeRecipient: Params<string> = {
  [Network.sepolia]: "0x337035aFA98B3B552e714B04347f51968486706B",
  [Network.goerli]: "0x3C9f44Dac66d56DcD8dFb4bC361AA4b72aCA8C08",
  [Network.rinkeby]: "0xab576dAab2F1eB5417E1064EaBDe801af934D0e7",
  [Network.main]: "0x1d53bB3dABf03C60B6f17D8316C3FFD505c7eff1",
};

export const ProtocolFee: Params<number> = {
  [Network.sepolia]: 100,
  [Network.goerli]: 200,
  [Network.rinkeby]: 200,
  [Network.main]: 200,
};

export const BendAddressesProviders: Params<string> = {
  [Network.sepolia]: "0x95e84AED75EB9A545D817c391A0011E0B34EAf5C",
  [Network.goerli]: "0x1cba0A3e18be7f210713c9AC9FE17955359cC99B",
  [Network.rinkeby]: "0xE55870eBB007a50B0dfAbAdB1a21e4bFcee5299b",
  [Network.main]: "0x24451f47caf13b24f4b5034e1df6c0e401ec0e46",
};
