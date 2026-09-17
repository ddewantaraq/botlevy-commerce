# Botlevy Commerce

Year 1 **Active** agent commerce MVP: ChatGPT-style cooker chat (plan → pay → pre-cook → cook-time) + merchant warung app → MockUSDC on **BSC Testnet (97)**.

## Prerequisites

- **Node.js 22+**
- MetaMask (two accounts recommended: merchant + cooker)
- tBNB from [BNB testnet faucet](https://www.bnbchain.org/en/testnet-faucet)
- [Remix IDE](https://remix.ethereum.org/) to deploy `contracts/MockUSDC.sol`
- [Ollama Cloud API key](https://ollama.com/settings/keys) (optional — fallbacks apply)

## Quick start

```bash
cd botlevy-commerce
cp .env.example .env
# fill MOCK_USDC_ADDRESS, VITE_MOCK_USDC_ADDRESS, OLLAMA_API_KEY, etc.

npm install
npm run dev:backend     # http://localhost:4100
npm run dev:cooker      # http://localhost:5174  ChatGPT-style cooker
npm run dev:merchant    # http://localhost:5175  Warung dashboard
```

Health check: `curl http://localhost:4100/health`

**Docs**

- Week 1 pay loop: [`INSTRUCTIONS.md`](./INSTRUCTIONS.md)
- Orchestration API paths: [`INSTRUCTIONS-ORCHESTRATION.md`](./INSTRUCTIONS-ORCHESTRATION.md)
- Wife-story chat / pre-cook / cook-time: [`INSTRUCTIONS-COOKING.md`](./INSTRUCTIONS-COOKING.md)

## Environment

| Variable | Purpose |
|----------|---------|
| `PORT` | API port (default `4100`) |
| `COOKER_URL` | Cooker UI origin for CORS/cookies (default `http://localhost:5174`) |
| `MERCHANT_URL` | Merchant UI origin for CORS/cookies (default `http://localhost:5175`) |
| `SESSION_SECRET` | Cookie signing (≥16 chars) |
| `CHAIN_ID` | `97` |
| `BSC_RPC_URL` | BSC Testnet RPC |
| `MOCK_USDC_ADDRESS` | Deployed MockUSDC address |
| `OLLAMA_HOST` | `https://ollama.com` |
| `OLLAMA_API_KEY` | Cloud API key |
| `OLLAMA_MODEL` | Default `qwen3.5` |
| `DEMO_PAYER_PRIVATE_KEY` | Optional scripted payer |
| `VITE_API_URL` | UIs → API |
| `VITE_MOCK_USDC_ADDRESS` | Same as `MOCK_USDC_ADDRESS` |
| `VITE_CHAIN_ID` | `97` |
| `VITE_BSC_RPC_URL` | Same RPC for wagmi |

## Workspaces

- `backend` — Express API + orchestrator + cooking sessions
- `cooker-ui` — Chat cooker (port 5174)
- `merchant-ui` — Merchant dashboard (port 5175)
- `packages/commerce-shared` — wagmi / SIWE / speech helpers
- `frontend/` — **deprecated** (see `frontend/DEPRECATED.md`)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:backend` | Express API + CommerceAgent |
| `npm run dev:frontend` | Vite UI (agent run + merchant) |
| `npm run demo:agent` | Scripted intent → pay → order |

## Architecture (short)

- `POST /agent/runs` — CommerceAgent tools: `plan_recipe` → `diff_pantry` → `match_catalog` → `apply_substitutions` → `create_quote`
- Wallet pays MockUSDC on chain 97
- `POST /orders` verifies Transfer logs, opens merchant order
- Merchant SIWE claims seed warung `m_warung_sehat` on first login

## Contracts

See [`contracts/README.md`](./contracts/README.md).
