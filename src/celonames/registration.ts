import {
  encodeFunctionData,
  namehash,
  type Hex,
  type Address,
} from "viem";
import { createCeloPublicClient, createCeloWalletClient } from "./client.ts";
import {
  CONTRACT_ADDRESSES,
  L2RegistrarABI,
  L2RegistryABI,
  buildEnsip25TextKey,
  PARENT_DOMAIN,
} from "./contracts.ts";
import { verifyUsdcPayment } from "./payment.ts";
import { validateLabel } from "./availability.ts";

export interface RegistrationParams {
  label: string;
  ownerAddress: Address;
  paymentTxHash: string;
  agentId?: string;
  // Injected from server config
  privateKey: Hex;
  agentWalletAddress: string;
  rpcUrl?: string;
  kv: Deno.Kv;
}

export interface RegistrationResult {
  success: boolean;
  name: string;
  owner: Address;
  txHash: Hex;
}

/**
 * Build the resolver multicall data for the registration transaction.
 * Always sets the ETH address record (cointype 60).
 * If agentId is provided, also sets the ENSIP-25 text record.
 */
function buildResolverData(
  label: string,
  ownerAddress: Address,
  agentId?: string
): Hex[] {
  const node = namehash(`${label}.${PARENT_DOMAIN}`);
  const resolverData: Hex[] = [];

  // Set ETH address (cointype 60)
  resolverData.push(
    encodeFunctionData({
      abi: L2RegistryABI,
      functionName: "setAddr",
      args: [node, 60n, ownerAddress],
    })
  );

  // ENSIP-25: set agent-registration text record if agentId is provided
  if (agentId) {
    const textKey = buildEnsip25TextKey(agentId);
    resolverData.push(
      encodeFunctionData({
        abi: L2RegistryABI,
        functionName: "setText",
        args: [node, textKey, "1"],
      })
    );
  }

  return resolverData;
}

/**
 * Register a .celo.eth name.
 *
 * Flow:
 *   1. Validate label and owner address
 *   2. Verify $1.50 USDC payment (with replay prevention via Deno KV)
 *   3. Fetch current on-chain rent price
 *   4. Simulate contract call (catches reverts before spending gas)
 *   5. Write contract + wait for receipt
 */
export async function registerCeloName(
  params: RegistrationParams
): Promise<RegistrationResult> {
  const { paymentTxHash, agentId, privateKey, agentWalletAddress, rpcUrl, kv } = params;
  const ownerAddress = params.ownerAddress.toLowerCase() as Address;
  const label = validateLabel(params.label);

  // 1. Verify USDC payment — this also prevents replay attacks via KV
  const paymentResult = await verifyUsdcPayment(
    paymentTxHash,
    agentWalletAddress,
    kv,
    rpcUrl
  );
  if (!paymentResult.valid) {
    throw new Error(`Payment verification failed: ${paymentResult.error}`);
  }

  const publicClient = createCeloPublicClient(rpcUrl);
  const walletClient = createCeloWalletClient(privateKey, rpcUrl);

  // 2. Fetch current rent price (paid by the agent in CELO)
  const rentPrice = await publicClient.readContract({
    address: CONTRACT_ADDRESSES.L2_REGISTRAR,
    abi: L2RegistrarABI,
    functionName: "rentPrice",
    args: [label, 1n],
  });

  // 3. Build resolver data (address record + optional ENSIP-25 text record)
  const resolverData = buildResolverData(label, ownerAddress, agentId);

  // 4. Simulate first to surface any revert reasons cheaply
  const { request } = await publicClient.simulateContract({
    address: CONTRACT_ADDRESSES.L2_REGISTRAR,
    abi: L2RegistrarABI,
    functionName: "register",
    args: [label, 1n, ownerAddress, resolverData],
    value: rentPrice,
    account: walletClient.account,
  });

  // 5. Execute
  const txHash = await walletClient.writeContract(request);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`Registration transaction failed: ${txHash}`);
  }

  return {
    success: true,
    name: `${label}.${PARENT_DOMAIN}`,
    owner: ownerAddress,
    txHash,
  };
}
