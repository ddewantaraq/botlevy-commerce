# MockUSDC — Remix deploy (BSC Testnet)

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
- Fund the wallet you use in Remix **before** deploy.

## Deploy steps

1. Open https://remix.ethereum.org/
2. Create file `MockUSDC.sol` and paste contents from this folder.
3. Solidity Compiler settings:
   - Compiler: **0.8.37** (exact — matches the contract pragma)
   - Enable optimization: **On**, runs **200**
   - EVM version: **default**
   - Leave **via IR** off
   Then **Compile**.
4. Deploy & Run → Environment **Injected Provider - MetaMask**.
5. Confirm MetaMask is on **BSC Testnet (97)**.
6. Deploy → confirm tx → copy contract address.
7. Put address in repo root `.env` as `MOCK_USDC_ADDRESS` and `VITE_MOCK_USDC_ADDRESS`.

## Mint (6 decimals)

In Remix, call `mint`:

- `to`: payer wallet address  
- `amount`: e.g. `100000000` = **100** mUSDC (6 decimals)

In MetaMask → Import tokens → paste contract address → decimals **6**.

Verify the mint tx on https://testnet.bscscan.com/
