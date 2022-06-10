import { BigNumber, utils, Wallet } from "ethers";
/* eslint-disable node/no-extraneous-import */
import { TypedDataDomain } from "@ethersproject/abstract-signer";
/* eslint-disable node/no-extraneous-import */
import { Signature } from "@ethersproject/bytes";
/* eslint-disable node/no-extraneous-import */
import { _TypedDataEncoder } from "@ethersproject/hash";
import { MakerOrder } from "./order-types";

const { defaultAbiCoder, keccak256, solidityPack } = utils;

const BEND_EXCHANGE_NAME = "BendExchange";
const BEND_EXCHANGE_VERSION = "1";

/**
 * Generate a signature used to generate v, r, s parameters
 * @param chainId chainId
 * @param privateKey privateKey
 * @param types solidity types of the value param
 * @param values params to be sent to the Solidity function
 * @param verifyingContract verifying contract address ("BendExchange")
 * @returns splitted signature
 * @see https://docs.ethers.io/v5/api/signer/#Signer-signTypedData
 */
const signTypedData = async (
  chainId: number,
  privateKey: string,
  types: string[],
  values: (string | boolean | BigNumber)[],
  verifyingContract: string
): Promise<Signature> => {
  const domain: TypedDataDomain = {
    name: BEND_EXCHANGE_NAME,
    version: BEND_EXCHANGE_VERSION,
    chainId,
    verifyingContract,
  };

  const domainSeparator = _TypedDataEncoder.hashDomain(domain);

  // https://docs.ethers.io/v5/api/utils/abi/coder/#AbiCoder--methods
  const hash = keccak256(defaultAbiCoder.encode(types, values));

  // Compute the digest
  const digest = keccak256(
    solidityPack(["bytes1", "bytes1", "bytes32", "bytes32"], ["0x19", "0x01", domainSeparator, hash])
  );

  const adjustedSigner = new Wallet(privateKey);
  return { ...adjustedSigner._signingKey().signDigest(digest) };
};

export const computeDomainSeparator = (chainId: number, verifyingContract: string): string => {
  const domain: TypedDataDomain = {
    name: BEND_EXCHANGE_NAME,
    version: BEND_EXCHANGE_VERSION,
    chainId,
    verifyingContract,
  };

  return _TypedDataEncoder.hashDomain(domain);
};
/**
 * Compute order hash for a maker order
 * @param order MakerOrder
 * @returns hash
 */
export const computeOrderHash = (order: MakerOrder): string => {
  const types = [
    "bytes32",
    "bool",
    "address",
    "address",
    "uint256",
    "uint256",
    "uint256",
    "address",
    "address",
    "uint256",
    "uint256",
    "uint256",
    "uint256",
    "bytes32",
    "address",
    "bytes32",
  ];

  const values = [
    "0xfd561ac528d7d2fc669c32105ec4867617451ed5ca6ccde2e4ed234a0a41010a", // maker order hash (from Solidity)
    order.isOrderAsk,
    order.maker,
    order.collection,
    order.price,
    order.tokenId,
    order.amount,
    order.strategy,
    order.currency,
    order.nonce,
    order.startTime,
    order.endTime,
    order.minPercentageToAsk,
    keccak256(order.params),
    order.interceptor,
    keccak256(order.interceptorExtra),
  ];

  return keccak256(defaultAbiCoder.encode(types, values));
};

/**
 * Create a signature for a maker order
 * @param chainId chainId
 * @param privateKey privateKey
 * @param verifyingContract verifying contract address
 * @param order see MakerOrder definition
 * @returns splitted signature
 */
export const signMakerOrder = (
  chainId: number,
  privateKey: string,
  verifyingContract: string,
  order: MakerOrder
): Promise<Signature> => {
  const types = [
    "bytes32",
    "bool",
    "address",
    "address",
    "uint256",
    "uint256",
    "uint256",
    "address",
    "address",
    "uint256",
    "uint256",
    "uint256",
    "uint256",
    "bytes32",
    "address",
    "bytes32",
  ];

  const values = [
    "0xfd561ac528d7d2fc669c32105ec4867617451ed5ca6ccde2e4ed234a0a41010a",
    order.isOrderAsk,
    order.maker,
    order.collection,
    order.price,
    order.tokenId,
    order.amount,
    order.strategy,
    order.currency,
    order.nonce,
    order.startTime,
    order.endTime,
    order.minPercentageToAsk,
    keccak256(order.params),
    order.interceptor,
    keccak256(order.interceptorExtra),
  ];

  return signTypedData(chainId, privateKey, types, values, verifyingContract);
};
