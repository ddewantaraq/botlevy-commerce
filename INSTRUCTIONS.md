# Botlevy Commerce — End-to-end demo instructions

Follow this checklist in order. You need **two wallets** on **BSC Testnet (chain ID 97)**.

> **Week 2 orchestration** (multi-intent API): [`INSTRUCTIONS-ORCHESTRATION.md`](./INSTRUCTIONS-ORCHESTRATION.md).  
> **Chat + pre-cook + cook-time (wife story):** [`INSTRUCTIONS-COOKING.md`](./INSTRUCTIONS-COOKING.md) — cooker `:5174`, merchant `:5175`.

| Role | Job |
|------|-----|
| **Merchant** | SIWE login, receives MockUSDC, fulfills orders |
| **Payer** | Runs the agent UI / pays the quote |

Never commit private keys. Put demo keys only in local `.env`.

---

## 0) What you will prove

1. CommerceAgent turns “cook ayam semur” into a quote (tool step trace).
2. Payer sends MockUSDC on BSC Testnet.
3. Backend verifies the tx on-chain.
4. Merchant sees a **paid** order and marks it **fulfilled**.

---

## 1) Add BSC Testnet to MetaMask

MetaMask → Networks → Add network → Add a network manually:

| Field | Value |
|-------|--------|
| Network name | BNB Smart Chain Testnet |
| New RPC URL | `https://data-seed-prebsc-1-s1.bnbchain.org:8545` |
| Chain ID | **97** |
| Currency symbol | tBNB |
| Block explorer | https://testnet.bscscan.com/ |

**Check:** MetaMask network selector shows BSC Testnet / chain **97**.

Create or unlock **two accounts** (Account 1 = merchant, Account 2 = payer).

---

## 2) Fund tBNB (gas) for both wallets

1. Open https://www.bnbchain.org/en/testnet-faucet  
2. Request tBNB for the **merchant** address.  
3. Request tBNB for the **payer** address.  
4. Confirm balances on https://testnet.bscscan.com/ (paste each address).

If the official faucet rate-limits you, use the alternate faucet from your Remix bootcamp Notion / Telegram bot.

---

## 3) Ollama Cloud (agent `plan_recipe`)

1. Create an API key: https://ollama.com/settings/keys  
2. In repo `.env`:

```env
OLLAMA_HOST=https://ollama.com
OLLAMA_API_KEY=your_key_here
OLLAMA_MODEL=qwen3.5
```

**Notes**

- Free plan has starter usage limits. If `qwen3.5` is blocked, try `OLLAMA_MODEL=gpt-oss:20b` or add credits.
- If the key is missing or the call fails, the agent still continues with a curated **ayam semur** recipe so the commerce loop works.

---

## 4) Deploy MockUSDC on Remix

1. Open https://remix.ethereum.org/  
2. Create `MockUSDC.sol` — copy from [`contracts/MockUSDC.sol`](./contracts/MockUSDC.sol).  
3. Solidity Compiler settings:
   - Compiler: **0.8.37** (exact — matches the contract pragma)
   - Enable optimization: **On**, runs **200**
   - EVM version: **default**
   - Leave **via IR** off  
   Then **Compile**.  
4. Deploy & Run → Environment **Injected Provider - MetaMask**.  
5. Switch MetaMask to **BSC Testnet (97)** and the wallet that pays gas for deploy (either is fine).  
6. Deploy → confirm → **copy contract address**.

Put the address in `.env`:

```env
MOCK_USDC_ADDRESS=0xYourContract
VITE_MOCK_USDC_ADDRESS=0xYourContract
```

### Mint to the payer (6 decimals)

In Remix → deployed contract → `mint`:

- `to` = **payer** address  
- `amount` = `100000000` → **100** mUSDC  

Optional: mint a little to merchant for testing.

**MetaMask:** Import tokens → paste contract → decimals **6**.

**Check:** Payer shows mUSDC balance; mint tx appears on https://testnet.bscscan.com/

More detail: [`contracts/README.md`](./contracts/README.md).

---

## 5) Install and run

```bash
cd botlevy-commerce
cp .env.example .env   # if you have not already
# edit .env — SESSION_SECRET, MOCK_USDC_*, OLLAMA_*, COOKER_URL, MERCHANT_URL, VITE_*

npm install
npm run dev:backend    # http://localhost:4100
npm run dev:cooker     # http://localhost:5174
npm run dev:merchant   # http://localhost:5175
```

**Check API:**

```bash
curl -s http://localhost:4100/health | jq
curl -s http://localhost:4100/merchants | jq
```

You should see seeded merchant `m_warung_sehat` and several products (shallots stock **0** so substitution to onion can demo).

---

## 6) Merchant path

1. Open http://localhost:5175  
2. MetaMask → select **merchant** account on chain **97**.  
3. Connect wallet → **SIWE login**.  
4. First SIWE on an empty owner claims seed warung `m_warung_sehat` and sets `payTo` to your merchant address.  
5. Confirm products list and `payTo`.  
6. Keep this tab for fulfillment later.

**Check:** Merchant dashboard shows catalog; `payTo` equals merchant wallet.

---

## 7) Cook / agent path (happy path)

1. Open http://localhost:5174/ (Cooker chat).  
2. MetaMask → switch to **payer** account (chain 97).  
3. Connect payer wallet → **SIWE**.  
4. Goal (chat): `I want to cook ayam semur tonight`.  
5. Optional: pantry is managed in chat / cook flow.  
6. Send the message / run until you get a quote.  

**Check — tool step trace** (expandable in chat), roughly:

`classify_intent` → `plan_recipe` → `diff_pantry` → `match_catalog` → `apply_substitutions` → `create_quote`

You should see shallot → onion substitution when shallots are OOS.

7. Review quote total (mUSDC) and `payTo` (merchant).  
8. Click **Pay with MockUSDC** in the agent bubble → approve in MetaMask.  
9. Wait for confirmation.

**Check:** Order id + BscScan link; tx shows MockUSDC Transfer to merchant.

---

## 8) Fulfillment

1. Back to http://localhost:5175 (merchant wallet).  
2. Orders list shows status **paid**.  
3. Click **Mark fulfilled**.

**Check:** Status becomes **fulfilled**.
---

## 9) Optional: scripted demo

In `.env` set the **payer** private key only:

```env
DEMO_PAYER_PRIVATE_KEY=0x...
```

Ensure merchant `payTo` is already claimed (step 6) and payer has mUSDC + tBNB.

```bash
npm run demo:agent
```

**Expected stdout:** runId → tool names → txHash → orderId → BscScan URL.

---

## 10) Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| SIWE “Wrong chain” | MetaMask → BSC Testnet, chain ID **97** |
| Pay tx fails / no gas | Fund payer with tBNB faucet |
| “MOCK_USDC_ADDRESS is not configured” | Set both `MOCK_USDC_*` and `VITE_MOCK_USDC_*`, restart Vite |
| “Insufficient mUSDC” / transfer revert | Remix `mint` to **payer**, decimals 6 |
| “No MockUSDC Transfer…” | Wrong token address, wrong `payTo`, or tx not mined yet |
| Agent plan always ayam semur | Missing/invalid `OLLAMA_API_KEY`, Free quota, or model not allowed — commerce tools still run |
| Merchant products empty | SIWE with a fresh wallet before seed claim; or delete `backend/data/runtime.json` and restart API so seed reloads, then SIWE again |
| CORS / cookies | `COOKER_URL=http://localhost:5174`, `MERCHANT_URL=http://localhost:5175`, API on 4100 |
| Shallot still in cart | Seed shallots stock is 0 — expect onion substitution in trace |

---

## API cheat sheet

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Status |
| GET | `/merchants` | List merchants |
| POST | `/agent/runs` | `{ goal, pantry?, selectedDish? }` → `status`, `intent`, `steps`, quote/suggestions |
| POST | `/merchants/suggest-tags` | Merchant: `{ name }` → suggested tags |
| POST | `/orders` | `{ quoteId, txHash, payer }` |
| GET | `/auth/nonce` | SIWE nonce |
| POST | `/auth/verify` | SIWE session cookie |
| POST | `/orders/:id/fulfill` | Merchant fulfill (session) |
