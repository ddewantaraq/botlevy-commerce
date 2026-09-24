# BNB Chain MCP + skill (Week 3 — Track C / D)

Use Cursor to register/read **ERC-8004** agents and inspect BSC Testnet without leaving the IDE.

Official docs: https://docs.bnbchain.org/developer-kit/mcp/  
MCP package: https://github.com/bnb-chain/bnbchain-mcp  
Skills: https://github.com/bnb-chain/bnbchain-skills

## 1. Enable MCP in Cursor

1. Copy the committed template (never commit secrets):

   ```bash
   cp .cursor/mcp.json.example .cursor/mcp.json
   ```

2. Put a **dedicated testnet-only** private key in `.cursor/mcp.json` → `env.PRIVATE_KEY` (funded with ~0.05–0.1 [tBNB](https://www.bnbchain.org/en/testnet-faucet)). Prefer a throwaway wallet—not the cooker/merchant MetaMask key. Leave empty for **read-only** tools.

3. Cursor → **Settings → MCP** → ensure `bnbchain-mcp` is enabled → reload if needed.

4. `.cursor/mcp.json` is **gitignored**. The committed file is only [`.cursor/mcp.json.example`](../.cursor/mcp.json.example).

## 2. Skills (installed in-repo)

```bash
npx skills add bnb-chain/bnbchain-skills -y
```

- [`.agents/skills/bnbchain-mcp/`](../.agents/skills/bnbchain-mcp/)
- [`.agents/skills/bnbagent-studio/`](../.agents/skills/bnbagent-studio/)

## 3. Hard rule: testnet only (Week 3)

**Never default write ops to mainnet (`bsc`).** Always pass `network: "bsc-testnet"`.

## 4. Useful MCP tools

| Tool | Notes |
|------|--------|
| `register_erc8004_agent` | **Write.** `agentURI` + `network: bsc-testnet` |
| `get_erc8004_agent` | Read owner + tokenURI |
| `get_erc8004_agent_wallet` | Payment wallet for x402 |
| `how_to_register_mcp_as_erc8004_agent` | Guidance |

## 5. Live agentURI (Track D)

Public metadata (integrator passport):

`https://botlevy-commerce-production.up.railway.app/agent/metadata.json`

Source of truth in repo: [`agent-metadata.example.json`](./agent-metadata.example.json) / [`backend/src/agent/erc8004-metadata.ts`](../backend/src/agent/erc8004-metadata.ts).

**Positioning:** embeddable cooking-commerce API for third-party apps (pantry → dish → catalog match → MockUSDC quote). Cooker UI is the free SIWE reference client. `services.endpoint` points at `POST /agent/public/runs` (x402 in Track E; may 404 until then).

### Register (once metadata returns 200 on Railway)

In Cursor with MCP enabled:

1. `register_erc8004_agent` with  
   - `agentURI`: `https://botlevy-commerce-production.up.railway.app/agent/metadata.json`  
   - `network`: `bsc-testnet`
2. Save `agentId`, `txHash` into `.env` / Railway: `ERC8004_AGENT_ID`, `ERC8004_AGENT_URI`, `ERC8004_TX_HASH`.
3. Verify: MCP `get_erc8004_agent` + https://testnet.8004scan.io/

## 6. SIWE vs 8004

| Path | Auth |
|------|------|
| Cooker / merchant UI | SIWE (free `/agent/runs`) — **no 8004 required** |
| Public discoverable agent | ERC-8004 identity + x402 `/agent/public/runs` (integrators) |
