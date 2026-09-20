# Deploy (Week 3)

Host **backend** + **cooker-ui** + **merchant-ui** on HTTPS. Defaults below; swap hosts if needed.

## Architecture

| Service | Suggested host | Notes |
|---------|----------------|-------|
| API (`backend`) | Railway or Fly.io | Node 22, `PORT`, listen `0.0.0.0` |
| Cooker | Vercel | Root `cooker-ui/`, env `VITE_*` |
| Merchant | Vercel | Root `merchant-ui/`, env `VITE_*` |

## Backend env (production)

Copy from [`.env.example`](./.env.example) and set at least:

```env
PORT=4100
SESSION_SECRET=<long-random>
COOKER_URL=https://<cooker-domain>
MERCHANT_URL=https://<merchant-domain>
CHAIN_ID=97
BSC_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
MOCK_USDC_ADDRESS=0x...
OLLAMA_HOST=https://ollama.com
OLLAMA_API_KEY=...
OLLAMA_MODEL=qwen3.5
# After ERC-8004 register:
ERC8004_AGENT_ID=
ERC8004_AGENT_URI=
ERC8004_TX_HASH=
# x402 public runs:
X402_ENABLED=true
X402_PAYTO=0x...
X402_PRICE=10000
```

CORS uses `COOKER_URL` + `MERCHANT_URL` only. Cookie `Secure` turns on when those URLs are `https://`.

## Frontend env (each Vite app)

```env
VITE_API_URL=https://<api-domain>
VITE_CHAIN_ID=97
VITE_MOCK_USDC_ADDRESS=0x...
VITE_BSC_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
```

## Backend build

```bash
cd backend
npm install
npm run build
npm start   # node dist/index.js
```

## Smoke after deploy

1. `GET https://<api>/health` → `ok`, `corsOrigins` includes both UI URLs  
2. Cooker SIWE → chat → quote → pay MockUSDC  
3. Merchant SIWE → see order → fulfill  

Full human path: [`TRYOUT.md`](./TRYOUT.md).
