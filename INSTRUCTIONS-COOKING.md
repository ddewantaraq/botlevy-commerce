# Botlevy Commerce — Wife-story cooking chat

ChatGPT-style cooker UI with plan → shop → **pre-cook** → **cook-time** (voice mic or type). Merchant is a separate app.

| App | URL | Role |
|-----|-----|------|
| **Cooker** | http://localhost:5174 | Chat, pay, prep, cook |
| **Merchant** | http://localhost:5175 | Catalog, Suggest tags, fulfill |
| **API** | http://localhost:4100 | Backend |

Prerequisites: same as [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) §§1–6 (wallets, MockUSDC, Ollama, merchant SIWE with real `payTo`).

---

## 0) What you will prove

1. Chat thread (not “Start agent run” form) for Path B suggestions → pick dish.  
2. Quote + pay **inside** an agent bubble.  
3. **Pre-cook** checklist in chat.  
4. **Cook-time** large step + TTS; advance with **mic** or typed `lanjut`.  
5. Mid-cook **ganti menu** → confirm → back to planning.  
6. Merchant on port **5175**.

---

## 1) Start

```bash
cd botlevy-commerce
npm install
npm run dev:backend     # :4100
npm run dev:cooker      # :5174
npm run dev:merchant    # :5175
```

```env
COOKER_URL=http://localhost:5174
MERCHANT_URL=http://localhost:5175
```

**Check:** `curl -s http://localhost:4100/health | jq .corsOrigins`

---

## 2) Merchant (5175)

1. Open http://localhost:5175  
2. Connect merchant wallet → SIWE.  
3. Add product → **Suggest tags** → save.  
4. Keep tab for fulfill later.

---

## 3) Cooker chat — Path B → dish → quote/cookable

1. Open http://localhost:5174  
2. Connect **cooker** wallet → SIWE.  
3. Type: `Saya cuma punya daging sapi dan bawang, enak apa ya?` → Send (or 🎤).  
4. **Check:** agent suggestions; tap a dish.  
5. **Check:** `quoted` (Pay button) or `cookable` (Siapkan bahan).

---

## 4) Pre-cook

1. From **cookable**: click **Siapkan bahan**, **or** after Pay the flow starts prep.  
2. Toggle checklist and/or type `semua siap`.  
3. Type `mulai masak`.

**Check:** large step bubble + TTS (if browser allows).

---

## 5) Cook-time (voice or chat)

1. Type or speak: `lanjut` → next step.  
2. `ulang` → TTS again.  
3. `balik` → previous.  
4. `selesai` → done; optional save menu.  
5. Mid-cook type `ganti menu` → confirm `ya` → planning again.

**Check:** No Next/Prev buttons — only composer + mic.

---

## 6) Troubleshooting

| Issue | Fix |
|-------|-----|
| CORS | Set `COOKER_URL` + `MERCHANT_URL`, restart API |
| Mic missing | Chrome/Edge; otherwise type commands |
| TTS silent | Unmute tab; click once in page (autoplay policies) |
| no_merchant | Merchant SIWE + matching tags |
| Old frontend | Use cooker-ui / merchant-ui — see `frontend/DEPRECATED.md` |

---

## API (cooker)

| Method | Path | Notes |
|--------|------|-------|
| GET/PUT | `/cooker/pantry` | Persistent pantry |
| GET/POST/DELETE | `/cooker/menus` | Saved menus |
| POST | `/cooker/sessions` | `{ runId }` → prep |
| POST | `/cooker/sessions/:id/message` | Cook/prep commands + escape |
| GET | `/cooker/sessions/active` | Resume |

Also: orchestration demos in [`INSTRUCTIONS-ORCHESTRATION.md`](./INSTRUCTIONS-ORCHESTRATION.md).
