import { createCeloPublicClient } from "./client.ts";
import { CONTRACT_ADDRESSES, ERC20TransferABI } from "./contracts.ts";
import { parseEventLogs, type Hex } from "viem";

// $1.50 USDC = 1_500_000 raw units (USDC has 6 decimals)
const MIN_USDC_AMOUNT = 1_500_000n;

export interface PaymentVerificationResult {
  valid: boolean;
  amountUsdc?: string;
  error?: string;
}

/**
 * Verify that a given tx hash represents a valid $1.50 USDC payment
 * to the agent's wallet address on Celo mainnet.
 *
 * Uses Deno KV to prevent replay attacks — each tx hash can only be used once.
 */
export async function verifyUsdcPayment(
  txHashRaw: string,
  agentAddress: string,
  kv: Deno.Kv,
  rpcUrl?: string
): Promise<PaymentVerificationResult> {
  const txHash = txHashRaw.toLowerCase() as Hex;
  const agentAddr = agentAddress.toLowerCase();

  // Replay prevention — check KV before touching the chain
  const entry = await kv.get<string>(["used_payments", txHash]);
  if (entry.value !== null) {
    return { valid: false, error: "Payment tx hash has already been used" };
  }

  const client = createCeloPublicClient(rpcUrl);

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch {
    return { valid: false, error: "Transaction not found on Celo mainnet" };
  }

  if (receipt.status !== "success") {
    return { valid: false, error: "Transaction failed (status != success)" };
  }

  // Parse ERC20 Transfer logs from the USDC contract
  const transferLogs = parseEventLogs({
    abi: ERC20TransferABI,
    logs: receipt.logs,
    eventName: "Transfer",
    strict: false,
  }).filter(
    (log) => log.address.toLowerCase() === CONTRACT_ADDRESSES.USDC.toLowerCase()
  );

  const matchingTransfer = transferLogs.find(
    (log) =>
      log.args.to?.toLowerCase() === agentAddr &&
      (log.args.value ?? 0n) >= MIN_USDC_AMOUNT
  );

  if (!matchingTransfer) {
    return {
      valid: false,
      error: `No USDC transfer of >= $1.50 (${MIN_USDC_AMOUNT} raw units) to agent wallet found in tx`,
    };
  }

  // Mark as used — 30-day expiry as a safety net
  await kv.set(["used_payments", txHash], "1", {
    expireIn: 1000 * 60 * 60 * 24 * 30,
  });

  const amountUsdc = (Number(matchingTransfer.args.value) / 1_000_000).toFixed(6);
  return { valid: true, amountUsdc };
}
