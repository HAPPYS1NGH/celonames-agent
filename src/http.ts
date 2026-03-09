import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "./mcp-tools.ts";
import { checkNameAvailability, validateLabel } from "./celonames/availability.ts";
import { getNameRegistrationPrice } from "./celonames/pricing.ts";
import { registerCeloName } from "./celonames/registration.ts";
import { isAddress, type Hex } from "viem";
import type { AgentConfig } from "./mcp-tools.ts";

// ─── Config ───────────────────────────────────────────────────────────────────

const rpcUrl = Deno.env.get("CELO_RPC_URL") ?? "https://forno.celo.org";
const agentWalletAddress = Deno.env.get("AGENT_WALLET_ADDRESS") ?? "";
const privateKey = Deno.env.get("PRIVATE_KEY") as Hex | undefined;
const port = parseInt(Deno.env.get("PORT") ?? "3000"); // ignored on Deno Deploy
const baseUrl = Deno.env.get("BASE_URL") ?? "";

if (!agentWalletAddress) {
  throw new Error("AGENT_WALLET_ADDRESS environment variable is required");
}
if (!privateKey) {
  throw new Error("PRIVATE_KEY environment variable is required");
}

// ─── Deno KV (replay prevention for payments) ─────────────────────────────────

const kv = await Deno.openKv();

const config: AgentConfig = { rpcUrl, agentWalletAddress, privateKey, kv };

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono();

// ─── ERC-8004 Agent Registration ──────────────────────────────────────────────

import agentRegistration from "../agent-registration.json" with { type: "json" };

app.get("/.well-known/agent-registration.json", (c) => c.json(agentRegistration));

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/api/health", (c) => c.json({ status: "ok", service: "celo-names-agent" }));

// ─── REST: Check availability ─────────────────────────────────────────────────

app.get("/api/availability/:label", async (c) => {
  try {
    const label = validateLabel(c.req.param("label"));
    const available = await checkNameAvailability(label, rpcUrl);
    return c.json({ name: `${label}.celo.eth`, available });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});

// ─── REST: Get price ──────────────────────────────────────────────────────────

app.get("/api/price/:label", async (c) => {
  try {
    const label = validateLabel(c.req.param("label"));
    const price = await getNameRegistrationPrice(label, agentWalletAddress, rpcUrl);
    return c.json({ name: `${label}.celo.eth`, ...price });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});

// ─── REST: Register ───────────────────────────────────────────────────────────

app.post("/api/register", async (c) => {
  let body: { name?: string; ownerAddress?: string; paymentTxHash?: string; agentId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { name, ownerAddress, paymentTxHash, agentId } = body;

  if (!name)           return c.json({ error: "name is required" }, 400);
  if (!ownerAddress)   return c.json({ error: "ownerAddress is required" }, 400);
  if (!paymentTxHash)  return c.json({ error: "paymentTxHash is required" }, 400);
  if (!isAddress(ownerAddress)) {
    return c.json({ error: `Invalid ownerAddress: ${ownerAddress}` }, 400);
  }

  try {
    const label = validateLabel(name);
    const result = await registerCeloName({
      label,
      ownerAddress: ownerAddress as `0x${string}`,
      paymentTxHash,
      agentId,
      privateKey: config.privateKey,
      agentWalletAddress: config.agentWalletAddress,
      rpcUrl: config.rpcUrl,
      kv: config.kv,
    });
    return c.json(result);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// ─── MCP over Streamable HTTP ─────────────────────────────────────────────────

// Session store — persists for the lifetime of the Deno process
const mcpTransports = new Map<string, WebStandardStreamableHTTPServerTransport>();

app.all("/mcp", async (c) => {
  const sessionId = c.req.header("mcp-session-id");

  if (c.req.method === "GET" || c.req.method === "DELETE") {
    if (!sessionId || !mcpTransports.has(sessionId)) {
      return c.json(
        { jsonrpc: "2.0", error: { code: -32000, message: "Invalid or missing session ID" }, id: null },
        400
      );
    }
    return mcpTransports.get(sessionId)!.handleRequest(c.req.raw);
  }

  if (c.req.method === "POST") {
    if (sessionId && mcpTransports.has(sessionId)) {
      return mcpTransports.get(sessionId)!.handleRequest(c.req.raw);
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sid) => { mcpTransports.set(sid, transport); },
    });
    transport.onclose = () => {
      if (transport.sessionId) mcpTransports.delete(transport.sessionId);
    };

    const mcpServer = createMcpServer(config);
    await mcpServer.connect(transport);
    return transport.handleRequest(c.req.raw);
  }

  return c.text("Method not allowed", 405);
});

// ─── Frontend ─────────────────────────────────────────────────────────────────

app.get("/", (c) => c.html(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Celo Names Agent</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'JetBrains Mono',monospace;background:#000;color:#00ff41;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:40px 20px}
  .container{max-width:720px;width:100%}
  h1{font-size:2rem;text-align:center;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px}
  h2{font-size:1rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}
  .subtitle{text-align:center;color:#00cc33;font-size:.85rem;margin-bottom:40px}
  .section{border:2px solid #003300;padding:24px;margin-bottom:24px;background:#0a0a0a}
  .section:hover{border-color:#00ff41}
  pre{background:#111;border:1px solid #003300;padding:16px;overflow-x:auto;font-size:.8rem;line-height:1.6;color:#00cc33;margin:12px 0}
  code{font-family:'JetBrains Mono',monospace;background:#111;padding:2px 6px;border:1px solid #003300;font-size:.85rem}
  a{color:#00ff41;border-bottom:1px solid #00ff41;text-decoration:none}
  a:hover{color:#00ff99;border-color:#00ff99}
  .tag{display:inline-block;border:1px solid currentColor;padding:2px 8px;font-size:.7rem;text-transform:uppercase;margin-right:4px}
  .tag.free{color:#00cc33}
  .tag.paid{color:#ffaa00}
  .endpoint{margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #001a00}
  .endpoint:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0}
  .path{font-weight:700;color:#00ff41;font-size:.9rem;margin-bottom:4px}
  .desc{color:#00cc33;font-size:.8rem;margin-bottom:4px}
  .glow{text-shadow:0 0 10px rgba(0,255,65,.5)}
  .blink{animation:blink 1s step-end infinite}
  @keyframes blink{50%{opacity:0}}
</style>
</head>
<body>
<div class="container">
  <h1 class="glow">Celo Names Agent<span class="blink">_</span></h1>
  <p class="subtitle">
    Register <code>.celo.eth</code> names for AI agents &middot;
    <strong>$1.50 USDC</strong> on Celo mainnet &middot;
    ENSIP-25 identity linking
  </p>

  <!-- AGENT-READABLE DOCUMENTATION
    Service: Celo Names Agent
    Registers .celo.eth names on Celo mainnet (chainId 42220).
    Payment: $1.50 USDC to ${agentWalletAddress} on Celo mainnet.
    USDC contract: 0xcebA9300f2b948710d2653dD7B07f33A8B32118C
    Min name length: 10 characters (label only, excluding .celo.eth)

    Flow:
      1. GET /api/availability/:label  — check availability (free)
      2. GET /api/price/:label         — get payment instructions (free)
      3. Send $1.50 USDC on Celo to ${agentWalletAddress}
      4. POST /api/register            — register with payment tx hash
         Body: { name, ownerAddress, paymentTxHash, agentId? }

    MCP: Connect via Streamable HTTP at ${baseUrl}/mcp
  -->

  <div class="section">
    <h2>// What is this?</h2>
    <p style="font-size:.85rem;line-height:1.6">
      An autonomous name registration service for Celo. Send $1.50 USDC on Celo,
      get a <code>.celo.eth</code> subname registered on-chain — with your address record
      and optional <a href="https://docs.ens.domains/ensip/25" target="_blank">ENSIP-25</a>
      agent identity text record set in the same transaction.
    </p>
  </div>

  <div class="section">
    <h2>// REST API</h2>
    <div class="endpoint">
      <div class="path">GET /api/availability/:label <span class="tag free">Free</span></div>
      <div class="desc">Check if a name is available (10+ char label)</div>
      <pre>curl ${baseUrl}/api/availability/myagentname
# {"name":"myagentname.celo.eth","available":true}</pre>
    </div>
    <div class="endpoint">
      <div class="path">GET /api/price/:label <span class="tag free">Free</span></div>
      <div class="desc">Get payment instructions and live CELO equivalent</div>
      <pre>curl ${baseUrl}/api/price/myagentname</pre>
    </div>
    <div class="endpoint">
      <div class="path">POST /api/register <span class="tag paid">$1.50 USDC</span></div>
      <div class="desc">Register after paying $1.50 USDC on Celo</div>
      <pre>curl -X POST ${baseUrl}/api/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "myagentname",
    "ownerAddress": "0x...",
    "paymentTxHash": "0x...",
    "agentId": "42220:123"
  }'</pre>
    </div>
  </div>

  <div class="section">
    <h2>// MCP Server</h2>
    <p style="font-size:.8rem;color:#00cc33;margin-bottom:12px">
      Connect via Streamable HTTP at <code>${baseUrl}/mcp</code>
    </p>
    <div class="endpoint">
      <div class="path">checkAvailability <span class="tag free">Free</span></div>
      <div class="desc">Check if a .celo.eth label is available</div>
    </div>
    <div class="endpoint">
      <div class="path">getRegistrationPrice <span class="tag free">Free</span></div>
      <div class="desc">Get $1.50 USDC payment instructions</div>
    </div>
    <div class="endpoint">
      <div class="path">registerName <span class="tag paid">$1.50 USDC</span></div>
      <div class="desc">Register after on-chain payment. Supports ENSIP-25 agentId.</div>
    </div>
  </div>

  <div class="section">
    <h2>// Payment Flow</h2>
    <pre>1. Call getRegistrationPrice to get payment address
2. Send $1.50 USDC (1500000 raw) to ${agentWalletAddress}
   on Celo mainnet (chainId 42220)
   USDC: 0xcebA9300f2b948710d2653dD7B07f33A8B32118C
3. Call registerName with your paymentTxHash
4. Agent verifies payment on-chain and registers the name</pre>
  </div>

  <p style="text-align:center;font-size:.7rem;color:#003300;margin-top:32px">
    <a href="/.well-known/agent-registration.json">ERC-8004 Identity</a>
  </p>
</div>
</body>
</html>`));

// ─── Boot ─────────────────────────────────────────────────────────────────────

console.log(`Celo Names Agent running on http://localhost:${port}`);
console.log(`Agent wallet: ${agentWalletAddress}`);
console.log(`RPC: ${rpcUrl}`);

Deno.serve({ port }, (req) => {
  // Rewrite http:// → https:// for requests arriving behind a TLS proxy
  // (e.g. Docker + Traefik). Deno Deploy handles TLS natively so this is a no-op there.
  const proto = req.headers.get("x-forwarded-proto");
  if (proto === "https" && req.url.startsWith("http://")) {
    const url = new URL(req.url);
    url.protocol = "https:";
    req = new Request(url.toString(), req);
  }
  return app.fetch(req);
});
