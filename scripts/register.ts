/**
 * ERC-8004 Agent Registration Script for Celo mainnet
 *
 * Uses the Agent0 SDK (https://sdk.ag0.xyz/) to:
 *   1. Mint an agent NFT on the ERC-8004 Identity Registry (chainId 42220)
 *   2. Upload metadata to IPFS via Pinata
 *   3. Set the agent URI on-chain
 *
 * After running this script:
 *   - Copy the printed agentId into agent-registration.json → registrations[]
 *   - Update agent-registration.json → active: true
 *   - Re-run the on-chain URI update (see instructions printed below)
 *   - View your agent at https://www.8004scan.io/agents/celo/<agentId>
 *
 * Requirements:
 *   - PRIVATE_KEY in .env (wallet with CELO for gas on Celo mainnet)
 *   - PINATA_JWT in .env  (Pinata API JWT for IPFS uploads)
 *   - BASE_URL in .env    (public URL of your deployed agent)
 *   - CELO_RPC_URL in .env (optional, defaults to https://forno.celo.org)
 *
 * Run with: deno task register
 */

// @ts-ignore — agent0-sdk is a Node.js npm package; types may not be perfect under Deno
import { SDK } from "agent0-sdk";

const privateKey = Deno.env.get("PRIVATE_KEY");
if (!privateKey) throw new Error("PRIVATE_KEY not set in .env");

const pinataJwt = Deno.env.get("PINATA_JWT");
if (!pinataJwt) throw new Error("PINATA_JWT not set in .env");

const baseUrl = Deno.env.get("BASE_URL");
if (!baseUrl) throw new Error("BASE_URL not set in .env (e.g. https://celonames.example.com)");

const rpcUrl = Deno.env.get("CELO_RPC_URL") ?? "https://forno.celo.org";

// ─── SDK Init ─────────────────────────────────────────────────────────────────

console.log("Initializing Agent0 SDK for Celo mainnet (chainId 42220)...");

const sdk = new SDK({
  chainId: 42220,      // Celo mainnet
  rpcUrl,
  signer: privateKey,
  ipfs: "pinata",
  pinataJwt,
});

// ─── Agent Configuration ──────────────────────────────────────────────────────

const agent = sdk.createAgent(
  "Celo Names Agent",
  "Registers .celo.eth subnames for AI agents on Celo mainnet. Pay $1.50 USDC on Celo, get a 10+ character .celo.eth name with address record and optional ENSIP-25 identity linking.",
  `${baseUrl}/icon.png`
);

// MCP endpoint — the primary integration point
await agent.setMCP(`${baseUrl}/mcp`);

// Trust model: reputation only (no crypto-economic stake or TEE attestation)
agent.setTrust(
  true,   // reputation
  false,  // crypto-economic
  false   // tee-attestation
);

// Start inactive — set to true after you've verified everything works in production
agent.setActive(false);

// This agent does NOT use x402 (uses manual USDC payment verification instead)
agent.setX402Support(false);

// ─── Register on Celo mainnet ─────────────────────────────────────────────────

console.log("Registering agent on Celo mainnet...");
console.log("  1. Minting agent NFT on ERC-8004 registry");
console.log("  2. Uploading metadata to IPFS via Pinata");
console.log("  3. Setting agent URI on-chain");
console.log("");

// deno-lint-ignore no-explicit-any
let result: any;

try {
  result = await agent.registerIPFS();
} catch (err) {
  // agent0-sdk may not support Celo chainId out of the box.
  // If this fails, fall back to manual registration with cast:
  console.error("agent0-sdk registration failed:", err instanceof Error ? err.message : err);
  console.error("");
  console.error("── Manual fallback ──────────────────────────────────────────");
  console.error("Install Foundry (https://getfoundry.sh) and run:");
  console.error("");
  console.error('  URI="data:application/json;base64,$(jq -c . agent-registration.json | base64 -w 0)"');
  console.error("");
  console.error("  cast send 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 \\");
  console.error('    "registerAgent(string)" "$URI" \\');
  console.error("    --rpc-url https://forno.celo.org \\");
  console.error("    --private-key $PRIVATE_KEY");
  console.error("");
  console.error("Then check the emitted event for your agentId.");
  Deno.exit(1);
}

// ─── Output ───────────────────────────────────────────────────────────────────

const agentIdNum = result.agentId?.split(":")[1] ?? result.agentId ?? "unknown";

console.log("Agent registered successfully!");
console.log("");
console.log("Agent ID:  ", result.agentId);
console.log("Agent URI: ", result.agentURI);
console.log("");
console.log("View on 8004scan:");
console.log(`  https://www.8004scan.io/agents/celo/${agentIdNum}`);
console.log("");
console.log("── Next steps ───────────────────────────────────────────────────");
console.log("");
console.log("1. Update agent-registration.json:");
console.log(`     \"registrations\": [`);
console.log(`       {`);
console.log(`         \"agentId\": ${agentIdNum},`);
console.log(`         \"agentRegistry\": \"eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432\"`);
console.log(`       }`);
console.log(`     ]`);
console.log(`     \"active\": true`);
console.log("     (also replace celonames.example.com with your real domain)");
console.log("");
console.log("2. Push the updated URI on-chain:");
console.log("");
console.log('  source .env');
console.log('  URI="data:application/json;base64,$(jq -c . agent-registration.json | base64 -w 0)"');
console.log("");
console.log("  cast send 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 \\");
console.log(`    "setAgentURI(uint256,string)" ${agentIdNum} "$URI" \\`);
console.log("    --rpc-url https://forno.celo.org \\");
console.log("    --private-key $PRIVATE_KEY");
console.log("");
console.log("3. Redeploy so /.well-known/agent-registration.json serves the updated JSON.");
