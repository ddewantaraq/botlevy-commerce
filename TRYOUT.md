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
| Cooker | `https://botlevy-cooker.vercel.app` |
| Merchant | `https://botlevy-merchant.vercel.app` |
| API health | `https://botlevy-commerce-production.up.railway.app/health` |

## One-time setup

1. MetaMask → BSC Testnet (97). RPC: `https://data-seed-prebsc-1-s1.bnbchain.org:8545`.
2. Faucet tBNB: https://www.bnbchain.org/en/testnet-faucet  
3. Deploy hardened MockUSDC (OpenZeppelin, owner-only mint) — see [`contracts/README.md`](./contracts/README.md). Do not reuse an old open-mint address.  
4. **Owner** (deployer wallet) mints to cooker, e.g. `100000000` = 100 mUSDC (6 decimals). Other wallets cannot mint.  
5. Cooker + merchant: Import token = MockUSDC address, decimals **6**.

## First launch (onboarding)

On first open (browser or **installed PWA**), cooker and merchant show a short onboarding carousel (BSC Testnet **97**, one-button login, how to use the app).

- **Lanjut** / **Mulai** or **Lewati** — both persist via `localStorage` so the carousel does not show again (including after MetaMask remount).  
- After that, use **Masuk dengan MetaMask**. Tap **ⓘ** for login help (network + PWA return from MetaMask).  
- Clearing site data resets onboarding.

## Android (PWA + MetaMask)

Cooker and merchant are **installable PWAs** (Add to Home Screen). No offline mode — network required.

1. Chrome on Android → open cooker or merchant URL → **Install app** / Add to Home Screen.  
2. First launch: complete or skip onboarding (persists on device).  
3. **Masuk dengan MetaMask** (one button: connect + SIWE). With no injected wallet, this deeplinks via `@metamask/connect-evm`; after you approve and **return to the installed app**, SIWE resumes automatically. Use **ⓘ** if you need BSC Testnet / login steps.  
4. Use BSC Testnet (**97**) and test mUSDC as on desktop.  
5. If the home-screen icon looks outdated after a cooker deploy, remove the PWA and reinstall (or clear site data) — icons are cached by the install.

**Cook-time voice:** Prefer **Chrome or the installed PWA** for agent TTS + hands-free mic. Allow the microphone **once** when turning Hands-free on — the app holds that permission for the prep/cook phase so Android should not re-prompt on every mic restart.

**MetaMask in-app browser:** One-button login works (injected provider). Agent TTS is often silent there, and some WebViews still struggle with speech — use Chrome/PWA for hands-free cook-time when possible.

If MetaMask shows a phishing warning on `*.vercel.app`, use a test wallet only; custom domains reduce false positives later.

## Merchant path

1. Open merchant URL → onboarding (first time) → **Masuk dengan MetaMask** (ⓘ for network help).  
2. Set shop name + `payTo` (real receiving wallet).  
3. Add products with tags the agent knows (`chicken`, `beef`, `salt`, …). Use **Suggest tags** if available.  
4. Leave dashboard open to fulfill later.

## Cooker path

1. Open cooker URL → onboarding (first time) → **Masuk dengan MetaMask** (ⓘ for network help).  
2. Chat in Bahasa or English, e.g. “cuma punya daging sapi, enak masak apa ya?”  
3. Pick a dish → confirm bahan → **cek harga** / ya → pay MockUSDC.  
4. Pre-cook / cook-time if offered.  
5. Merchant: refresh orders → **Fulfill**.

## Sample goals

- `Saya mau masak ayam semur`  
- `cuma punya daging dan bawang, enak masak apa ya?`  
- After quote fail: `belanja sendiri` then `mulai masak`

## Public x402 agent

Unauthenticated paid runs: see [`docs/X402.md`](./docs/X402.md).  
SIWE `/agent/runs` stays free for the cooker app.

```bash
# Local or hosted (needs DEMO_PAYER_PRIVATE_KEY + mUSDC in .env)
API_URL=https://botlevy-commerce-production.up.railway.app npm run demo:x402
```

Expect console: **402** → agent-fee tx → **quoted** warung lines → replay **409**.

## ERC-8004

Discoverable **integrator** identity on BSC Testnet (not required for SIWE cooker/merchant tryout).

1. Passport JSON: `https://botlevy-commerce-production.up.railway.app/agent/metadata.json?v=2` (registration-v1 profile)  
2. On-chain id **2464** — https://testnet.8004scan.io/agents/bsc-testnet/2464 (and [`docs/BNB-MCP.md`](./docs/BNB-MCP.md)).  
3. Integrators call `services` → `web` → `POST /agent/public/runs` (x402-gated; unpaid → **402**).  
4. Cooker users keep using SIWE + free `/agent/runs` — **no 8004 needed**.

Value prop for buyers: structured commerce JSON (pantry → dish → warung quote), not a free-form recipe chatbot.

## Known limits

- Testnet faucets run dry — wait or share tBNB between wallets.  
- LLM (Ollama) optional — fallbacks may yield simpler recipes.  
- File store (`runtime.json`) is fine for small tryouts; not multi-region HA.  
- PWA is install-only (no offline). Chrome/PWA uses MetaMask app deeplink; MetaMask in-app browser uses injected wallet. Agent TTS + hands-free cook-time work best in Chrome/PWA.
