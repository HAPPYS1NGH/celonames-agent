# Celo Names Agent (Deno)

## Stack

- **Runtime**: Deno 2.x
- **HTTP framework**: Hono 4
- **Chain client**: viem 2 (Celo mainnet, chainId 42220)
- **MCP**: @modelcontextprotocol/sdk v1 — Streamable HTTP at `/mcp`
- **Replay prevention**: Deno KV (built-in, no extra infra)
- **ERC-8004 registration**: `agent0-sdk` (see `scripts/register.ts`)
- **Testing**: `deno task test`
- **HTTP server**: `deno task http` (port 3000)

## Commands

```bash
deno task http       # Start HTTP + MCP server
deno task test       # Run tests
deno task register   # Register agent on Celo ERC-8004 registry (run once after deploying)
deno task inspector  # Open MCP inspector against localhost:3000/mcp
cast --version       # Ethereum/Celo CLI (Foundry) — used for manual on-chain updates
```

## Key Contracts (Celo Mainnet)

| Contract | Address |
|---|---|
| L2Registrar (.celo.eth) | `0x9Eb22700eFa1558eb2e0E522eB1DECC8025C3127` |
| L2Registry (resolver) | `0x4d7912779679AFdC592CBd4674b32Fcb189395F7` |
| USDC on Celo | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` |
| CELO/USD Chainlink | `0x0568fD19986748cEfF3301e55c0eb1E729E0Ab7e` |
| ERC-8004 Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (same all chains) |

## Payment

- **Amount**: $1.50 USDC = `1_500_000` raw units (6 decimals)
- **Chain**: Celo mainnet (chainId 42220)
- **Recipient**: `AGENT_WALLET_ADDRESS` env var
- **Verification**: `src/celonames/payment.ts` — parses ERC20 Transfer logs from receipt
- **Replay prevention**: Deno KV key `["used_payments", txHash]` — 30-day TTL

## ENSIP-25 Text Record

If `agentId` is provided to `registerName`, the registration tx also calls `setText` on the resolver:

- **Key format**: `agent-registration[<erc7930-registry-addr>][<agentId>]`
- **Value**: `"1"`
- **ERC-7930 registry addr (Celo)**: `0x000100a4ec01148004a169fb4a3325136eb29fa0ceb6d2e539a432`
- **Built by**: `buildEnsip25TextKey()` in `src/celonames/contracts.ts`

## ERC-8004 Agent Identity

After deploying, run `deno task register` once to mint the agent NFT on-chain.

- **Registry**: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (Celo mainnet)
- **Registration JSON**: `agent-registration.json` (root), served at `/.well-known/agent-registration.json`
- **8004scan**: `https://www.8004scan.io/agents/celo/<agentId>`

### Updating the on-chain URI (after editing agent-registration.json)

```bash
source .env
URI="data:application/json;base64,$(jq -c . agent-registration.json | base64 -w 0)"

cast send 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 \
  "setAgentURI(uint256,string)" YOUR_AGENT_ID "$URI" \
  --rpc-url https://forno.celo.org \
  --private-key $PRIVATE_KEY
```

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `PRIVATE_KEY` | Hex private key, pays gas on Celo | Always |
| `AGENT_WALLET_ADDRESS` | Public address clients send USDC to | Always |
| `CELO_RPC_URL` | Celo RPC (default: forno.celo.org) | Optional |
| `PORT` | HTTP port (default: 3000) | Optional |
| `BASE_URL` | Public URL e.g. https://celonames.example.com | For register script |
| `PINATA_JWT` | Pinata API JWT for IPFS uploads | For register script |

## Deployment

Build and run with Docker:

```bash
docker build -t celo-names-agent .
docker run -p 3000:3000 --env-file .env celo-names-agent
```

For persistence of Deno KV across restarts, mount a volume:

```yaml
# docker-compose.yml
services:
  celo-names-agent:
    build: .
    ports: ["3000:3000"]
    env_file: .env
    volumes:
      - deno-kv:/app/.deno-kv
volumes:
  deno-kv:
```

Deploy behind a TLS proxy (Traefik/Caddy/nginx). The server auto-rewrites
`x-forwarded-proto: https` so all embedded URLs use `https://`.

## Conventions

- TDD: write failing test → make it pass → refactor
- Small atomic commits: feat/fix/test/chore/refactor prefixes
- All service functions in `src/celonames/` are pure and independently testable
- `src/http.ts` is the only file that reads from `Deno.env` and `Deno.openKv()`
