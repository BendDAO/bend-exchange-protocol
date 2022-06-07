export enum Network {
  rinkeby = "rinkeby",
  main = "main",
}

export interface Params<T> {
  [Network.rinkeby]: T;
  [Network.main]: T;
  [network: string]: T;
}

export const getParamPerNetwork = <T>({ rinkeby, main }: Params<T>, network: string): T => {
  network = Network[network as keyof typeof Network];
  switch (network) {
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
  [Network.rinkeby]: ALCHEMY_KEY
    ? `https://eth-rinkeby.alchemyapi.io/v2/${ALCHEMY_KEY}`
    : `https://rinkeby.infura.io/v3/${INFURA_KEY}`,
  [Network.main]: ALCHEMY_KEY
    ? `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY}`
    : `https://mainnet.infura.io/v3/${INFURA_KEY}`,
};

export const WETH: Params<string> = {
  [Network.rinkeby]: "0xb49dBe8e2A5a140b3b810c33ac2ba4907A3CA95e",
  [Network.main]: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
};

export const RoyaltyFeeLimit: Params<number> = {
  [Network.rinkeby]: 1000,
  [Network.main]: 1000,
};

export const FeeRecipient: Params<string> = {
  [Network.rinkeby]: "",
  [Network.main]: "",
};

export const ProtocolFee: Params<number> = {
  [Network.rinkeby]: 200,
  [Network.main]: 200,
};
