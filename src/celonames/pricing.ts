import { createCeloPublicClient } from "./client.ts";
import {
  CONTRACT_ADDRESSES,
  L2RegistrarABI,
  ChainlinkAggregatorABI,
} from "./contracts.ts";
import { formatEther } from "viem";

export interface RegistrationPrice {
  priceUsd: number;
  priceCelo: string;
  priceWei: string;
  rentPriceWei: string;
  agentAddress: string;
}

/**
 * Get the registration price for a .celo.eth name.
 *
 * Returns:
 *   - priceUsd: the service fee ($1.50 USDC to the agent wallet)
 *   - priceCelo: live CELO equivalent of $1.50 (informational)
 *   - priceWei: raw wei value of the CELO equivalent
 *   - rentPriceWei: on-chain ENS rent price in CELO wei (paid by the agent during register)
 *   - agentAddress: where to send the $1.50 USDC payment
 */
export async function getNameRegistrationPrice(
  label: string,
  agentAddress: string,
  rpcUrl?: string
): Promise<RegistrationPrice> {
  const client = createCeloPublicClient(rpcUrl);

  // Get live CELO/USD price from Chainlink
  const [, answer] = await client.readContract({
    address: CONTRACT_ADDRESSES.CELO_USD_ORACLE,
    abi: ChainlinkAggregatorABI,
    functionName: "latestRoundData",
  });
  const decimals = await client.readContract({
    address: CONTRACT_ADDRESSES.CELO_USD_ORACLE,
    abi: ChainlinkAggregatorABI,
    functionName: "decimals",
  });

  if (answer <= 0n) throw new Error("Invalid CELO/USD price from oracle");

  const scaleFactor = 10n ** BigInt(decimals);
  // 1.50 USD in CELO wei
  const onePointFiveUsdInWei = (15n * 10n ** 17n * scaleFactor) / answer;

  const rentPrice = await client.readContract({
    address: CONTRACT_ADDRESSES.L2_REGISTRAR,
    abi: L2RegistrarABI,
    functionName: "rentPrice",
    args: [label.toLowerCase(), 1n],
  });

  return {
    priceUsd: 1.5,
    priceCelo: formatEther(onePointFiveUsdInWei),
    priceWei: onePointFiveUsdInWei.toString(),
    rentPriceWei: rentPrice.toString(),
    agentAddress,
  };
}
