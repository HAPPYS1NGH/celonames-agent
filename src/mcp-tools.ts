import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { checkNameAvailability, validateLabel } from "./celonames/availability.ts";
import { getNameRegistrationPrice } from "./celonames/pricing.ts";
import { registerCeloName } from "./celonames/registration.ts";
import { isAddress, type Hex } from "viem";

export interface AgentConfig {
  rpcUrl: string;
  agentWalletAddress: string;
  privateKey: Hex;
  kv: Deno.Kv;
}

export function createMcpServer(config: AgentConfig): McpServer {
  const server = new McpServer({
    name: "celo-names-agent",
    version: "0.1.0",
  });

  // ─── checkAvailability ──────────────────────────────────────────────────────

  server.tool(
    "checkAvailability",
    "Check if a .celo.eth name is available for registration. Names must be at least 10 characters (label only, not including .celo.eth).",
    {
      name: z.string().describe(
        "The label to check — just the name part, e.g. 'myagentname' (not 'myagentname.celo.eth')"
      ),
    },
    async ({ name }) => {
      try {
        const label = validateLabel(name);
        const available = await checkNameAvailability(label, config.rpcUrl);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ name: `${label}.celo.eth`, available }),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
          }],
          isError: true,
        };
      }
    }
  );

  // ─── getRegistrationPrice ───────────────────────────────────────────────────

  server.tool(
    "getRegistrationPrice",
    "Get the registration price and payment instructions for a .celo.eth name. " +
    "Returns the service fee ($1.50 USDC) and the agent wallet address to send it to.",
    {
      name: z.string().describe("The label to price (e.g. 'myagentname')"),
    },
    async ({ name }) => {
      try {
        const label = validateLabel(name);
        const price = await getNameRegistrationPrice(label, config.agentWalletAddress, config.rpcUrl);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              name: `${label}.celo.eth`,
              ...price,
              paymentInstructions:
                `Send exactly $1.50 USDC (1500000 raw units, 6 decimals) to ${config.agentWalletAddress} ` +
                `on Celo mainnet (chainId 42220). ` +
                `USDC contract: 0xcebA9300f2b948710d2653dD7B07f33A8B32118C. ` +
                `Save the transaction hash and pass it to registerName as paymentTxHash.`,
            }),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
          }],
          isError: true,
        };
      }
    }
  );

  // ─── registerName ───────────────────────────────────────────────────────────

  server.tool(
    "registerName",
    "Register a .celo.eth name. Requires a verified $1.50 USDC payment on Celo mainnet (chainId 42220). " +
    "Sets the ETH address record to ownerAddress. " +
    "If agentId is provided, also sets an ENSIP-25 text record linking the name to your ERC-8004 agent identity.",
    {
      name: z.string().describe(
        "The label to register (10+ characters, e.g. 'myagentname')"
      ),
      ownerAddress: z.string().describe(
        "Ethereum address (0x...) that will own the name"
      ),
      paymentTxHash: z.string().describe(
        "Transaction hash of the $1.50 USDC payment to the agent wallet on Celo mainnet"
      ),
      agentId: z.string().optional().describe(
        "Optional: your ERC-8004 agent ID on Celo mainnet. " +
        "If provided, sets the ENSIP-25 text record to link this ENS name to your agent identity."
      ),
    },
    async ({ name, ownerAddress, paymentTxHash, agentId }) => {
      try {
        if (!isAddress(ownerAddress)) {
          throw new Error(`Invalid owner address: ${ownerAddress}`);
        }

        const result = await registerCeloName({
          label: name,
          ownerAddress: ownerAddress as `0x${string}`,
          paymentTxHash,
          agentId,
          privateKey: config.privateKey,
          agentWalletAddress: config.agentWalletAddress,
          rpcUrl: config.rpcUrl,
          kv: config.kv,
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
          }],
          isError: true,
        };
      }
    }
  );

  return server;
}
