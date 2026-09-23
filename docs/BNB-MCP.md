# BNB Chain MCP + skill (Week 3 — Track C)

Use Cursor to register/read **ERC-8004** agents and inspect BSC Testnet without leaving the IDE.

Official docs: https://docs.bnbchain.org/developer-kit/mcp/  
MCP package: https://github.com/bnb-chain/bnbchain-mcp  
Skills: https://github.com/bnb-chain/bnbchain-skills

## 1. Enable MCP in Cursor

1. Copy the committed template (never commit secrets):

   ```bash
   cp .cursor/mcp.json.example .cursor/mcp.json
   ```

2. Put a **testnet-only** private key in `.cursor/mcp.json` → `env.PRIVATE_KEY` (funded with a little [tBNB](https://www.bnbchain.org/en/testnet-faucet)). Leave empty for **read-only** tools.

3. Cursor → **Settings → MCP** → ensure `bnbchain-mcp` is enabled → reload if needed.

4. `.cursor/mcp.json` is **gitignored**. The committed file is only [`.cursor/mcp.json.example`](../.cursor/mcp.json.example):

```json
{
  "mcpServers": {
    "bnbchain-mcp": {
      "command": "npx",
      "args": ["-y", "@bnb-chain/mcp@latest"],
      "env": {
        "PRIVATE_KEY": "",
        "BNBCHAIN_MCP_SKIP_TRANSFER_CONFIRMATION": "false"
      }
    }
  }
}
```

## 2. Skills (installed in-repo)

Project install (already done for Track C):

```bash
npx skills add bnb-chain/bnbchain-skills -y
```

Skills live under:

- [`.agents/skills/bnbchain-mcp/`](../.agents/skills/bnbchain-mcp/) — connect + use every MCP tool (incl. ERC-8004)
- [`.agents/skills/bnbagent-studio/`](../.agents/skills/bnbagent-studio/) — agent studio guidance

When chatting in this repo, prefer these skills for BNB / ERC-8004 work.

## 3. Hard rule: testnet only (Week 3)

**Never default write ops to mainnet (`bsc`).** Always pass:

```text
network: "bsc-testnet"
```

for `register_erc8004_agent`, transfers, and other writes. Read tools should also target testnet when inspecting Botlevy state.

## 4. Useful MCP tools

| Tool | Notes |
|------|--------|
| `register_erc8004_agent` | **Write.** Requires `PRIVATE_KEY` + `network: bsc-testnet`. `agentURI` → metadata JSON. **Track D.** |
| `get_erc8004_agent` | Read owner + tokenURI |
| `get_erc8004_agent_wallet` | Payment wallet for x402 |
| `how_to_register_mcp_as_erc8004_agent` | Guidance |

## 5. Track C smoke (no Botlevy register yet)

After MCP is enabled:

1. Confirm tools appear in Cursor (e.g. `get_erc8004_agent`, `how_to_register_mcp_as_erc8004_agent`).
2. Optional read: call `how_to_register_mcp_as_erc8004_agent`, or `get_erc8004_agent` with a known testnet agent id + `network: bsc-testnet`.
3. Do **not** register Botlevy CommerceAgent here — that is **Track D**.

## 6. Track D — Register Botlevy agent (next)

1. Host metadata JSON (HTTPS or `data:` URI). Example: [`agent-metadata.example.json`](./agent-metadata.example.json).  
2. Point `services` URL at your **hosted** public API (after deploy), e.g. `https://api…/agent/public/runs`.  
3. Call MCP `register_erc8004_agent` with `agentURI` + `network: bsc-testnet`.  
4. Record in `.env` / README:

```env
ERC8004_AGENT_ID=
ERC8004_AGENT_URI=
ERC8004_TX_HASH=
```

5. Verify: https://testnet.8004scan.io/

## 7. SIWE vs 8004

| Path | Auth |
|------|------|
| Cooker / merchant UI | SIWE (free `/agent/runs`) |
| Public discoverable agent | ERC-8004 identity + x402 `/agent/public/runs` |
