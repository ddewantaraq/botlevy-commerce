# Deploy (Week 3 Track B)

Host **backend** on Railway and **cooker-ui** / **merchant-ui** on Vercel (HTTPS). Everyday deploys: **push or merge to `main`**. Path filters skip unrelated apps. Cursor already has Railway + Vercel MCP for bootstrap and ops — do not add Railway MCP to the repo.

## Architecture

| Service | Host | Notes |
|---------|------|-------|
| API (`backend`) | Railway | Node 22, `PORT`, listen `0.0.0.0`, [`railway.toml`](./railway.toml); region Singapore (`asia-southeast1`) via Railway dashboard/MCP — not in `railway.toml` |
| Cooker | Vercel | Root `cooker-ui/`, path ignore script |
| Merchant | Vercel | Root `merchant-ui/`, path ignore script |

## Auto-deploy on `main` (path filters)

| Changed paths | Railway | Vercel cooker | Vercel merchant |
|---------------|---------|---------------|-----------------|
| `backend/**`, `railway.toml` | deploy | skip | skip |
| `cooker-ui/**` and/or `packages/commerce-shared/**` | skip | deploy | skip unless shared |
| `merchant-ui/**` and/or `packages/commerce-shared/**` | skip | skip unless shared | deploy |
| Root `package.json` / `package-lock.json` | deploy | deploy | deploy |

- Railway: `build.watchPatterns` in [`railway.toml`](./railway.toml).
- Vercel Ignored Build Step (exit `0` = skip, `>=1` = build):
  - Cooker: `bash ../scripts/vercel-ignore-cooker.sh`
  - Merchant: `bash ../scripts/vercel-ignore-merchant.sh`

Do **not** add GitHub Actions that call `vercel deploy` / Railway CLI while Git integration is connected — that double-builds.

## Dummy CORS, then real origins

Before the two Vercel hosts exist, set Railway:

```env
COOKER_URL=https://botlevy-cooker.vercel.app
MERCHANT_URL=https://botlevy-merchant.vercel.app
```

After first real `*.vercel.app` (or custom) URLs: update those two vars on Railway and redeploy the API. Local `.env` stays `http://localhost:5174` / `5175`.

CORS uses `COOKER_URL` + `MERCHANT_URL` only. Cookie `Secure` + `SameSite=None` when those URLs are `https://`; localhost keeps `lax`.

## Backend env (production / Railway)

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
# agentURI (live metadata): https://botlevy-commerce-production.up.railway.app/agent/metadata.json
ERC8004_AGENT_ID=2464
ERC8004_AGENT_URI=https://botlevy-commerce-production.up.railway.app/agent/metadata.json
ERC8004_TX_HASH=0x350420cccafd878e289b6aa1e6dd83f97250e32fde38dc714a8b13d350fed758
# x402 public runs:
X402_ENABLED=true
X402_PAYTO=0x...
X402_PRICE=10000
```

Optional: attach a Railway volume at `backend/data` so `runtime.json` survives redeploys.

## Frontend env (each Vite app / Vercel)

```env
VITE_API_URL=https://<api-domain>
VITE_CHAIN_ID=97
VITE_MOCK_USDC_ADDRESS=0x...
VITE_BSC_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
```

## Vercel project settings (each UI)

| | Cooker | Merchant |
|--|--------|----------|
| Root Directory | `cooker-ui` | `merchant-ui` |
| Install | `cd .. && npm install` | same |
| Build | `npm run build` | `npm run build` |
| Output | `dist` | `dist` |
| Node | 22.x | 22.x |
| Ignored Build Step | `bash ../scripts/vercel-ignore-cooker.sh` | `bash ../scripts/vercel-ignore-merchant.sh` |
| Include files outside root | yes | yes |

Production branch: **`main`**.

## Cursor MCP (already connected)

Use existing **Railway** and **Vercel** MCP tools to list/create services, set variables, generate domains, inspect logs/status. Production path remains **Git push to `main`**. Do not commit Railway tokens or paste MCP config into [`.cursor/mcp.json.example`](./.cursor/mcp.json.example) (BNB MCP only there).

## Live bootstrap status (MCP)

| Resource | Status |
|----------|--------|
| Railway project `botlevy-commerce` | Linked to `ddewantaraq/botlevy-commerce@main` |
| Railway public URL | `https://botlevy-commerce-production.up.railway.app` |
| Railway CORS | `COOKER_URL=https://botlevy-cooker.vercel.app`, `MERCHANT_URL=https://botlevy-merchant.vercel.app` |
| Railway secrets set | `SESSION_SECRET`, `OLLAMA_API_KEY`, `MOCK_USDC_ADDRESS` (plus public chain/Ollama/PORT vars) |
| Railway build/start/watch | Applied via MCP `update-service` + [`railway.toml`](./railway.toml) on Git deploy |
| Railway region | Singapore `asia-southeast1-eqsg3a`, 1 replica (dashboard/MCP — not configurable in `railway.toml`) |
| Vercel `botlevy-cooker` | Live: https://botlevy-cooker.vercel.app (`prj_muoQTpfuSjievmWhR94QzMhi4seu`); Vite, Node 22, root `cooker-ui`; `VITE_*` set |
| Vercel `botlevy-merchant` | Live: https://botlevy-merchant.vercel.app (`prj_2sZqwbAJzeEcs6bwrzfjTOinjMHU`); Vite, Node 22, root `merchant-ui`; `VITE_*` set |
| Path ignore scripts | Enabled on both Vercel projects (`bash ../scripts/vercel-ignore-cooker.sh` / `vercel-ignore-merchant.sh`) |

## Smoke after deploy

1. `GET https://botlevy-commerce-production.up.railway.app/health` → `ok`, `corsOrigins` includes both UI URLs  
2. Cooker SIWE → chat → quote → pay MockUSDC  
3. Merchant SIWE → see order → fulfill  

Full human path: [`TRYOUT.md`](./TRYOUT.md).
