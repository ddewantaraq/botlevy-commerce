# Botlevy Commerce

Year 1 **Active** agent commerce MVP: cooking goal → CommerceAgent tools → merchant catalog → MockUSDC payment on **BNB Smart Chain Testnet (97)** → merchant fulfillment.

This is an **agent** (tool step trace + payable quote), not a chatbot.

## Prerequisites

- **Node.js 22+**
- MetaMask (two accounts recommended: merchant + payer)
- tBNB from [BNB testnet faucet](https://www.bnbchain.org/en/testnet-faucet)
- [Remix IDE](https://remix.ethereum.org/) to deploy `contracts/MockUSDC.sol`
- [Ollama Cloud API key](https://ollama.com/settings/keys) (optional for demos — curated ayam semur fallback if missing)

## Quick start

```bash
cd botlevy-commerce
cp .env.example .env
# fill MOCK_USDC_ADDRESS, VITE_MOCK_USDC_ADDRESS, OLLAMA_API_KEY, etc.

npm install
npm run dev:backend    # http://localhost:4100
npm run dev:frontend   # http://localhost:5174
```

Health check: `curl http://localhost:4100/health`

**Full wallet + Remix + demo walkthrough:** see [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Environment

| Variable | Purpose |
|----------|---------|
| `PORT` | API port (default `4100`) |
| `FRONTEND_URL` | CORS + cookies (`http://localhost:5174`) |
| `SESSION_SECRET` | Cookie signing (≥16 chars) |
| `CHAIN_ID` | `97` |
| `BSC_RPC_URL` | BSC Testnet RPC |
| `MOCK_USDC_ADDRESS` | Deployed MockUSDC address |
| `OLLAMA_HOST` | `https://ollama.com` |
| `OLLAMA_API_KEY` | Cloud API key |
| `OLLAMA_MODEL` | Default `qwen3.5` (or Free-friendly override) |
| `DEMO_PAYER_PRIVATE_KEY` | Optional scripted payer |
| `VITE_API_URL` | Frontend → API |
| `VITE_MOCK_USDC_ADDRESS` | Same as `MOCK_USDC_ADDRESS` |
| `VITE_CHAIN_ID` | `97` |
| `VITE_BSC_RPC_URL` | Same RPC for wagmi |

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
