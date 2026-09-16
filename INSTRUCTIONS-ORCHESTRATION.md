# Botlevy Commerce — Agent orchestration demo

Multi-intent CommerceAgent (Week 2). Same style as [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

| Role | Job |
|------|-----|
| **Merchant** | SIWE login, catalog (+ Suggest tags), receive MockUSDC |
| **Cooker / Payer** | SIWE login, run orchestrator, pay quotes |

Never commit private keys. Put demo keys only in local `.env`.

For wallet setup, faucet, MockUSDC, Ollama, and install, follow **INSTRUCTIONS.md §§1–6** first (merchant claimed with real `payTo`).

---

## 0) What you will prove

1. Orchestrator **classifies intent** and runs sub-agents (not one fixed recipe-only pipeline).
2. **Path A** — known dish → `status: quoted` + pay (optional).
3. **Path B** — pantry-first → `status: suggestions`.
4. **Path C** — pantry-first + `selectedDish` → quote or cookable.
5. **Path D** — pantry covers recipe → `status: cookable` (HTTP 200, not an error).
6. **Path E** — merchant **Suggest tags** from product name.

---

## 1) Prerequisites

Complete [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) through **§6 Merchant path** so:

- Backend `http://localhost:4100` and frontend `http://localhost:5174` run
- Merchant SIWE done; `payTo` = merchant wallet
- Catalog has products the agent can match (or use seed after claim)
- Cooker wallet has tBNB + mUSDC if you will pay

**Check:**

```bash
curl -s http://localhost:4100/health | jq
curl -s http://localhost:4100/merchants | jq
```

---

## 2) Start servers (if not already)

```bash
cd botlevy-commerce
npm run dev:backend    # :4100
npm run dev:frontend   # :5174
```

---

## 3) Path A — Known dish → quoted

1. Open http://localhost:5174/  
2. MetaMask → **cooker** wallet → Connect → **SIWE login as cooker**.  
3. Goal: `I want to cook ayam semur tonight` (or `mau masak ayam semur`).  
4. Optional pantry: tick `salt`.  
5. Leave **Selected dish** empty.  
6. **Start agent run**.

**Check — status `quoted`, intent `known_dish` (or `open_goal`), steps roughly:**

`classify_intent` → `plan_recipe` → `diff_pantry` → `match_catalog` → `apply_substitutions` → `create_quote`

7. Optional: **Pay merchant wallet** → fulfill on `/merchant` (same as INSTRUCTIONS §§7–8).

### Curl (needs cooker session cookie)

```bash
# After SIWE in browser, copy Cookie from DevTools → Network, or use the UI.
curl -s -X POST http://localhost:4100/agent/runs \
  -H 'Content-Type: application/json' \
  -H 'Cookie: YOUR_SESSION_COOKIE' \
  -d '{"goal":"I want to cook ayam semur tonight","pantry":["salt"]}' | jq
```

**Check:** `"status":"quoted"`, `"quote"` present, `"ok":true`.

---

## 4) Path B — Pantry-first → suggestions

1. Same cooker SIWE session.  
2. Goal (Bahasa OK): `Saya cuma punya daging sapi, bawang, enak apa ya?`  
3. Pantry chips optional (e.g. leave empty — agent extracts from text).  
4. Selected dish empty.  
5. **Start agent run**.

**Check:**

- `status` = `suggestions`
- `suggestions` array length ≥ 1
- Steps include `classify_intent` → `pantry_normalize` → `menu_suggest`
- No quote required

```bash
curl -s -X POST http://localhost:4100/agent/runs \
  -H 'Content-Type: application/json' \
  -H 'Cookie: YOUR_SESSION_COOKIE' \
  -d '{"goal":"Saya cuma punya daging sapi dan bawang, enak apa ya?","pantry":["beef","onion"]}' | jq '.status,.intent,.suggestions'
```

---

## 5) Path C — Pantry-first + selectedDish → quote

1. From Path B, click a suggestion (fills Selected dish) **or** type e.g. `Tumis daging sapi bawang`.  
2. Keep the same pantry-first style goal (or keep previous goal).  
3. **Start agent run** again.

**Check:** `status` is `quoted` or `cookable`; steps include `plan_recipe` → `diff_pantry` (and quote tools if missing ingredients).

```bash
curl -s -X POST http://localhost:4100/agent/runs \
  -H 'Content-Type: application/json' \
  -H 'Cookie: YOUR_SESSION_COOKIE' \
  -d '{"goal":"Saya cuma punya beef, enak apa?","pantry":["beef","garlic","onion","salt","cooking_oil"],"selectedDish":"Tumis daging sapi bawang"}' | jq '.status,.plan.dish,.quote.id'
```

---

## 6) Path D — Cookable (nothing to buy)

1. Goal: `I want to cook ayam semur tonight`  
2. Tick pantry chips covering the plan (or after a run, note ingredient tags and select all of them). For fallback ayam semur:  
   `chicken`, `shallot`, `kecap_manis`, `nutmeg`, `potato`, `cooking_oil`, `salt`  
3. **Start agent run**.

**Check:** HTTP 200, `status: cookable`, `plan` present, no quote, **not** a 400 “Nothing to buy”.

---

## 7) Path E — CatalogAssist (Suggest tags)

1. Open http://localhost:5174/merchant → merchant SIWE.  
2. Add product: Name = `Daging Sapi Fresh`.  
3. Click **Suggest tags**.  
4. Tags field fills with snake_case tags (e.g. `beef`).  
5. Set price/stock → **Add to catalog**.

```bash
curl -s -X POST http://localhost:4100/merchants/suggest-tags \
  -H 'Content-Type: application/json' \
  -H 'Cookie: YOUR_MERCHANT_SESSION_COOKIE' \
  -d '{"name":"Daging Sapi Fresh"}' | jq
```

**Check:** `"ok":true`, `"tags"` non-empty.

---

## 8) Optional: scripted demo

Same as INSTRUCTIONS §9 — expects **`status: quoted`**:

```bash
# DEMO_PAYER_PRIVATE_KEY + MOCK_USDC_ADDRESS in .env
npm run demo:agent
```

**Expected stdout:** `status: quoted` → txHash → orderId → BscScan URL.

---

## 9) Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| Always `open_goal` / ayam semur | Ollama key/quota; classify still works via rules for “enak apa” / “cuma punya” |
| `suggestions` empty | Should not happen — fallback dishes apply; check server logs |
| `no_merchant` / 400 | Merchant must SIWE with real `payTo` and matching product tags |
| Old “Nothing to buy” 400 | Restart backend — cookable is success now |
| Suggest tags empty | Enter a name first; without Ollama, heuristics still return at least one tag |
| SIWE / chain / mUSDC errors | See INSTRUCTIONS.md §10 |

---

## 10) API cheat sheet

| Method | Path | Auth | Body / notes |
|--------|------|------|----------------|
| POST | `/agent/runs` | Cooker SIWE | `{ goal, pantry?, selectedDish? }` → `status`, `intent`, `steps`, `suggestions?`, `plan?`, `quote?` |
| GET | `/agent/runs/:id` | Public | Full saved run |
| POST | `/merchants/suggest-tags` | Merchant SIWE | `{ name, notes? }` → `{ tags, source }` |

**Run statuses:** `suggestions` \| `cookable` \| `quoted` \| `no_merchant` \| `failed`
