import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MakerOrder, MakerOrderWithSignature, TakerOrder } from "./order-types";
import { signMakerOrder } from "./signature-helper";
import { findPrivateKey } from "./hardhat-keys";

export interface HardhatMakerOrder extends MakerOrder {
  signerUser: SignerWithAddress;
  verifyingContract: string;
}

export interface SignedMakerOrder extends MakerOrder {
  verifyingContract: string;
  privateKey: string;
  chainId: number;
}

export async function createMakerOrder({
  isOrderAsk,
  maker,
  collection,
  price,
  tokenId,
  amount,
  strategy,
  currency,
  nonce,
  startTime,
  endTime,
  minPercentageToAsk,
  params,
  interceptor,
  interceptorExtra,
  signerUser,
  verifyingContract,
}: HardhatMakerOrder): Promise<MakerOrderWithSignature> {
  const makerOrder: MakerOrder = {
    isOrderAsk: isOrderAsk,
    maker: maker,
    collection: collection,
    price: price,
    tokenId: tokenId,
    amount: amount,
    strategy: strategy,
    currency: currency,
    nonce: nonce,
    startTime: startTime,
    endTime: endTime,
    minPercentageToAsk: minPercentageToAsk,
    params: params,
    interceptor,
    interceptorExtra,
  };

  const privateKey = findPrivateKey(signerUser.address);
  const chainId = 31337;
  const signedOrder = await signMakerOrder(chainId, privateKey, verifyingContract, makerOrder);

  // Extend makerOrder with proper signature
  const makerOrderExtended: MakerOrderWithSignature = {
    ...makerOrder,
    r: signedOrder.r,
    s: signedOrder.s,
    v: signedOrder.v,
  };

  return makerOrderExtended;
}

export async function createSignedMakerOrder({
  isOrderAsk,
  maker,
  collection,
  price,
  tokenId,
  amount,
  strategy,
  currency,
  nonce,
  startTime,
  endTime,
  minPercentageToAsk,
  params,
  interceptor,
  interceptorExtra,
  privateKey,
  chainId,
  verifyingContract,
}: SignedMakerOrder): Promise<MakerOrderWithSignature> {
  const makerOrder: MakerOrder = {
    isOrderAsk: isOrderAsk,
    maker: maker,
    collection: collection,
    price: price,
    tokenId: tokenId,
    amount: amount,
    strategy: strategy,
    currency: currency,
    nonce: nonce,
    startTime: startTime,
    endTime: endTime,
    minPercentageToAsk: minPercentageToAsk,
    params: params,
    interceptor,
    interceptorExtra,
  };
  const signedOrder = await signMakerOrder(chainId, privateKey, verifyingContract, makerOrder);

  // Extend makerOrder with proper signature
  const makerOrderExtended: MakerOrderWithSignature = {
    ...makerOrder,
    r: signedOrder.r,
    s: signedOrder.s,
    v: signedOrder.v,
  };

  return makerOrderExtended;
}

export function createTakerOrder({
  isOrderAsk,
  taker,
  price,
  tokenId,
  minPercentageToAsk,
  params,
  interceptor,
  interceptorExtra,
}: TakerOrder): TakerOrder {
  const takerOrder: TakerOrder = {
    isOrderAsk: isOrderAsk,
    taker: taker,
    price: price,
    tokenId: tokenId,
    minPercentageToAsk: minPercentageToAsk,
    params: params,
    interceptor,
    interceptorExtra,
  };

  return takerOrder;
}
