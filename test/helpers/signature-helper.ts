import { BigNumber, utils, Wallet } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
/* eslint-disable node/no-extraneous-import */
import { TypedDataDomain } from "@ethersproject/abstract-signer";
/* eslint-disable node/no-extraneous-import */
import { Signature } from "@ethersproject/bytes";
/* eslint-disable node/no-extraneous-import */
import { _TypedDataEncoder } from "@ethersproject/hash";
import { MakerOrder } from "./order-types";
import { findPrivateKey } from "./hardhat-keys";

const { defaultAbiCoder, keccak256, solidityPack } = utils;

/**
 * Generate a signature used to generate v, r, s parameters
 * @param signer signer
 * @param types solidity types of the value param
 * @param values params to be sent to the Solidity function
 * @param verifyingContract verifying contract address ("BendExchange")
 * @returns splitted signature
 * @see https://docs.ethers.io/v5/api/signer/#Signer-signTypedData
 */
const signTypedData = async (
  signer: SignerWithAddress,
  types: string[],
  values: (string | boolean | BigNumber)[],
  verifyingContract: string
): Promise<Signature> => {
  const domain: TypedDataDomain = {
    name: "BendExchange",
    version: "1",
    chainId: "31337", // HRE
    verifyingContract: verifyingContract,
  };

  const domainSeparator = _TypedDataEncoder.hashDomain(domain);

  // https://docs.ethers.io/v5/api/utils/abi/coder/#AbiCoder--methods
  const hash = keccak256(defaultAbiCoder.encode(types, values));

  // Compute the digest
  const digest = keccak256(
    solidityPack(["bytes1", "bytes1", "bytes32", "bytes32"], ["0x19", "0x01", domainSeparator, hash])
  );

  const adjustedSigner = new Wallet(findPrivateKey(signer.address));
  return { ...adjustedSigner._signingKey().signDigest(digest) };
};

export const computeDomainSeparator = (verifyingContract: string): string => {
  const domain: TypedDataDomain = {
    name: "BendExchange",
    version: "1",
    chainId: "31337", // HRE
    verifyingContract: verifyingContract,
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
 * @param signer signer for the order
 * @param verifyingContract verifying contract address
 * @param order see MakerOrder definition
 * @returns splitted signature
 */
export const signMakerOrder = (
  signer: SignerWithAddress,
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

  return signTypedData(signer, types, values, verifyingContract);
};
