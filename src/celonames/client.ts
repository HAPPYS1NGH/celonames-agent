import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
} from "viem";
import { celo } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const DEFAULT_RPC = "https://forno.celo.org";

/**
 * Create a public viem client for Celo mainnet.
 */
export function createCeloPublicClient(rpcUrl?: string) {
  return createPublicClient({
    chain: celo,
    transport: http(rpcUrl ?? DEFAULT_RPC),
  });
}

/**
 * Create a wallet viem client for Celo mainnet.
 */
export function createCeloWalletClient(privateKey: Hex, rpcUrl?: string) {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: celo,
    transport: http(rpcUrl ?? DEFAULT_RPC),
  });
}
