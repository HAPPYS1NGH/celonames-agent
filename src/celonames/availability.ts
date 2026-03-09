import { createCeloPublicClient } from "./client.ts";
import { CONTRACT_ADDRESSES, L2RegistrarABI } from "./contracts.ts";

const MIN_NAME_LENGTH = 10;

/**
 * Validate a .celo.eth label (the part before .celo.eth).
 * Strips trailing .celo.eth if present. Returns the clean label or throws.
 */
export function validateLabel(raw: string): string {
  const clean = raw
    .toLowerCase()
    .trim()
    .replace(/\.celo\.eth$/, "")
    .replace(/\.eth$/, "");

  if (clean.length < MIN_NAME_LENGTH) {
    throw new Error(
      `Name must be at least ${MIN_NAME_LENGTH} characters (got ${clean.length})`
    );
  }
  if (!/^[a-z0-9-]+$/.test(clean)) {
    throw new Error("Name may only contain lowercase letters, numbers, and hyphens");
  }
  if (clean.startsWith("-") || clean.endsWith("-")) {
    throw new Error("Name cannot start or end with a hyphen");
  }
  return clean;
}

/**
 * Check if a .celo.eth label is available for registration.
 */
export async function checkNameAvailability(label: string, rpcUrl?: string): Promise<boolean> {
  const validLabel = validateLabel(label);
  const client = createCeloPublicClient(rpcUrl);
  return client.readContract({
    address: CONTRACT_ADDRESSES.L2_REGISTRAR,
    abi: L2RegistrarABI,
    functionName: "available",
    args: [validLabel],
  });
}
