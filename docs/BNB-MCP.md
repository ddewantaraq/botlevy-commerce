# BNB Chain MCP + skill (Week 3)

Use Cursor to register/read **ERC-8004** agents and inspect BSC Testnet without leaving the IDE.

## 1. Add MCP server (Cursor)

Settings → MCP → Add server, or project [`.cursor/mcp.json.example`](../.cursor/mcp.json.example):

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

- Set `PRIVATE_KEY` only in local/private config (testnet key with a little tBNB). **Never commit real keys.**  
- Docs: https://docs.bnbchain.org/developer-kit/mcp/  
- Package: https://github.com/bnb-chain/bnbchain-mcp  

## 2. Install skill

```bash
npx skills add bnb-chain/bnbchain-skills
# or globally:
npx skills add bnb-chain/bnbchain-skills -g
```

Skill repo: https://github.com/bnb-chain/bnbchain-skills  

## 3. Useful tools

| Tool | Notes |
|------|--------|
| `register_erc8004_agent` | **Write.** Requires `network` (use `bsc-testnet`). `agentURI` → metadata JSON. |
| `get_erc8004_agent` | Read owner + tokenURI |
| `get_erc8004_agent_wallet` | Payment wallet for x402 |
| `how_to_register_mcp_as_erc8004_agent` | Guidance |

**Never default write ops to mainnet (`bsc`).** Always pass `network: "bsc-testnet"` for Week 3.

## 4. Register Botlevy agent (checklist)

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

## 5. SIWE vs 8004

| Path | Auth |
|------|------|
| Cooker / merchant UI | SIWE (free `/agent/runs`) |
| Public discoverable agent | ERC-8004 identity + x402 `/agent/public/runs` |
