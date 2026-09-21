# Hosted tryout guide (Week 3)

Use this after deploy ([`DEPLOY.md`](./DEPLOY.md)). Testnet only (BSC **97**).

## What you need

| Role | Wallet | Needs |
|------|--------|--------|
| **Owner** | Deployer of MockUSDC | tBNB (gas), owns `mint` |
| **Cooker** | Second MetaMask account | tBNB + mUSDC (owner mints) |
| **Merchant** | Third (or same as owner for solo) | tBNB; set `payTo` to receiving address |

## URLs (fill after deploy)

| App | URL |
|-----|-----|
| Cooker | `https://________________` |
| Merchant | `https://________________` |
| API health | `https://________________/health` |

## One-time setup

1. MetaMask → BSC Testnet (97). RPC: `https://data-seed-prebsc-1-s1.bnbchain.org:8545`.
2. Faucet tBNB: https://www.bnbchain.org/en/testnet-faucet  
3. Deploy hardened MockUSDC (OpenZeppelin, owner-only mint) — see [`contracts/README.md`](./contracts/README.md). Do not reuse an old open-mint address.  
4. **Owner** (deployer wallet) mints to cooker, e.g. `100000000` = 100 mUSDC (6 decimals). Other wallets cannot mint.  
5. Cooker + merchant: Import token = MockUSDC address, decimals **6**.

## Merchant path

1. Open merchant URL → Connect → SIWE as merchant.  
2. Set shop name + `payTo` (real receiving wallet).  
3. Add products with tags the agent knows (`chicken`, `beef`, `salt`, …). Use **Suggest tags** if available.  
4. Leave dashboard open to fulfill later.

## Cooker path

1. Open cooker URL → Connect → SIWE as cooker.  
2. Chat in Bahasa or English, e.g. “cuma punya daging sapi, enak masak apa ya?”  
3. Pick a dish → confirm bahan → **cek harga** / ya → pay MockUSDC.  
4. Pre-cook / cook-time if offered.  
5. Merchant: refresh orders → **Fulfill**.

## Sample goals

- `Saya mau masak ayam semur`  
- `cuma punya daging dan bawang, enak masak apa ya?`  
- After quote fail: `belanja sendiri` then `mulai masak`

## Public x402 agent (optional)

Unauthenticated paid runs: see [`docs/X402.md`](./docs/X402.md).  
SIWE `/agent/runs` stays free for the cooker app.

## ERC-8004

Discoverable agent identity (not required for SIWE tryout): [`docs/BNB-MCP.md`](./docs/BNB-MCP.md), https://testnet.8004scan.io/

## Known limits

- Testnet faucets run dry — wait or share tBNB between wallets.  
- LLM (Ollama) optional — fallbacks may yield simpler recipes.  
- File store (`runtime.json`) is fine for small tryouts; not multi-region HA.  
- No PWA / WalletConnect in Week 3 — desktop MetaMask (or MetaMask in-app browser) for SIWE.
