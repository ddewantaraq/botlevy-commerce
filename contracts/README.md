# MockUSDC — Remix deploy (BSC Testnet)

Testnet only (chain **97**). **Never mainnet.**

Uses **OpenZeppelin v5.7.0** (`ERC20`, `Ownable`, `Pausable`). Remix compiles those imports; no Hardhat/Foundry project.

The wallet that deploys is **owner**. Only that wallet can `mint`, `burn`, `pause`, and `unpause`. Other wallets calling `mint` revert.

Pause freezes token movement on this contract. It does **not** custody anyone's MetaMask.

## Network (MetaMask)

| Field | Value |
|-------|--------|
| Network name | BNB Smart Chain Testnet |
| RPC URL | `https://data-seed-prebsc-1-s1.bnbchain.org:8545` |
| Chain ID | `97` |
| Currency | tBNB |
| Explorer | https://testnet.bscscan.com/ |

## Faucet

- Official: https://www.bnbchain.org/en/testnet-faucet  
- Fund the **owner** wallet (the one you deploy with) before deploy.

## Deploy steps

1. Open https://remix.ethereum.org/
2. Create file `MockUSDC.sol` and paste [`MockUSDC.sol`](./MockUSDC.sol).
3. Solidity Compiler:
   - Compiler: **0.8.37**
   - Enable optimization: **On**, runs **200**
   - EVM version: **default**
   - Leave **via IR** off
4. Compile. Remix must fetch OpenZeppelin from GitHub (`@openzeppelin/contracts@5.7.0/...`). If imports fail, allow GitHub/npm imports in Remix settings and compile again.
5. Deploy & Run → Environment **Injected Provider - MetaMask**.
6. Confirm MetaMask is on **BSC Testnet (97)** and the **owner** account.
7. Deploy (no constructor args) → confirm tx → copy contract address.
8. Put the address in repo root `.env` (do not commit secrets):

```env
MOCK_USDC_ADDRESS=0xYourNewContract
VITE_MOCK_USDC_ADDRESS=0xYourNewContract
```

Restart the API and Vite apps after changing `VITE_*`. Old MockUSDC addresses (open mint) are obsolete — pay/verify must use this new contract.

## Mint (owner only, 6 decimals)

In Remix, connected as **owner**, call `mint`:

- `to`: cooker (payer) wallet  
- `amount`: e.g. `100000000` = **100** mUSDC

Optional: mint a small balance to the merchant for tests.

Non-owner `mint` must revert.

In MetaMask → Import tokens → contract address → decimals **6**.

Verify the mint tx on https://testnet.bscscan.com/

## Burn and pause (owner only)

- `burn(from, amount)` destroys tokens (lowers that balance and `totalSupply`). Not used by cooker pay. There is no dollar reserve behind mUSDC.
- `pause` / `unpause` stop transfers until you unpause. Use only if you need an emergency stop on testnet.

## Pay path

Cooker still calls ERC-20 `transfer`. Backend verify is unchanged. After you set the new address in `.env`, pay → verify → fulfill should work with owner-minted balances.
