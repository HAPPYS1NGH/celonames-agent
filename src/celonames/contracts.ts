import type { Address } from "viem";

// ─── Contract Addresses (Celo Mainnet) ───────────────────────────────────────

export const CONTRACT_ADDRESSES = {
  L2_REGISTRY:   "0x4d7912779679AFdC592CBd4674b32Fcb189395F7" as Address,
  L2_REGISTRAR:  "0x9Eb22700eFa1558eb2e0E522eB1DECC8025C3127" as Address,
  // CELO/USD Chainlink price feed on Celo mainnet
  CELO_USD_ORACLE: "0x0568fD19986748cEfF3301e55c0eb1E729E0Ab7e" as Address,
  // USDC on Celo mainnet (6 decimals)
  USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as Address,
} as const;

export const PARENT_DOMAIN = "celo.eth";

// ─── ABIs ─────────────────────────────────────────────────────────────────────

export const L2RegistrarABI = [
  {
    inputs: [{ internalType: "string", name: "label", type: "string" }],
    name: "available",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "label", type: "string" },
      { internalType: "uint64", name: "durationInYears", type: "uint64" },
    ],
    name: "rentPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "label", type: "string" },
      { internalType: "uint64", name: "durationInYears", type: "uint64" },
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "bytes[]", name: "resolverData", type: "bytes[]" },
    ],
    name: "register",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

export const L2RegistryABI = [
  {
    inputs: [
      { internalType: "bytes32", name: "node", type: "bytes32" },
      { internalType: "uint256", name: "coinType", type: "uint256" },
      { internalType: "bytes", name: "a", type: "bytes" },
    ],
    name: "setAddr",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "node", type: "bytes32" },
      { internalType: "string", name: "key", type: "string" },
      { internalType: "string", name: "value", type: "string" },
    ],
    name: "setText",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const ChainlinkAggregatorABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { internalType: "uint80",  name: "roundId",         type: "uint80"  },
      { internalType: "int256",  name: "answer",          type: "int256"  },
      { internalType: "uint256", name: "startedAt",       type: "uint256" },
      { internalType: "uint256", name: "updatedAt",       type: "uint256" },
      { internalType: "uint80",  name: "answeredInRound", type: "uint80"  },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ERC20 Transfer event — used to verify USDC payment receipts
export const ERC20TransferABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: "address", name: "from",  type: "address" },
      { indexed: true,  internalType: "address", name: "to",    type: "address" },
      { indexed: false, internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
] as const;

// ─── ENSIP-25 ─────────────────────────────────────────────────────────────────

// ERC-8004 Identity Registry on Celo mainnet (chainId 42220)
// ERC-7930 encoded: type(0001) + chainId(00a4ec = 42220) + addrType(01) + len(14=20) + addr
export const CELO_IDENTITY_REGISTRY_ERC7930 =
  "0x000100a4ec01148004a169fb4a3325136eb29fa0ceb6d2e539a432";

/**
 * Build the ENSIP-25 text record key for a given agent ID.
 * Format: agent-registration[<erc7930-registry-address>][<agentId>]
 */
export function buildEnsip25TextKey(agentId: string): string {
  return `agent-registration[${CELO_IDENTITY_REGISTRY_ERC7930}][${agentId}]`;
}
