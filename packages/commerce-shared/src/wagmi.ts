import { createConfig, http } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const rpc =
  import.meta.env.VITE_BSC_RPC_URL ||
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545";

export const config = createConfig({
  chains: [bscTestnet],
  connectors: [injected()],
  transports: {
    [bscTestnet.id]: http(rpc),
  },
});

export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4100";

export const MOCK_USDC_ADDRESS = (import.meta.env.VITE_MOCK_USDC_ADDRESS ||
  "") as `0x${string}`;

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 97);
