import { createConfig, http } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";
import type { Connector } from "wagmi";

const rpc =
  import.meta.env.VITE_BSC_RPC_URL ||
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545";

export const config = createConfig({
  chains: [bscTestnet],
  connectors: [
    injected({ shimDisconnect: true }),
    // Deeplink to MetaMask Android/iOS when no injected provider (Chrome / PWA).
    metaMask({
      dappMetadata: {
        name: "Botlevy Commerce",
        url: "https://botlevy-cooker.vercel.app",
      },
    }),
  ],
  transports: {
    [bscTestnet.id]: http(rpc),
  },
});

export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4100";

export const MOCK_USDC_ADDRESS = (import.meta.env.VITE_MOCK_USDC_ADDRESS ||
  "") as `0x${string}`;

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 97);

/** True when a browser extension / in-app browser exposes ethereum. */
export function hasInjectedProvider(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as Window & { ethereum?: unknown }).ethereum)
  );
}

/**
 * Prefer injected when available (desktop / MetaMask in-app browser).
 * Otherwise MetaMask connector (mobile Chrome / installed PWA deeplink).
 */
export function getPreferredConnector(
  connectors: readonly Connector[],
): Connector | undefined {
  const byId = (id: string) => connectors.find((c) => c.id === id);
  if (hasInjectedProvider()) {
    return byId("injected") ?? connectors[0];
  }
  return byId("metaMaskSDK") ?? byId("metaMask") ?? connectors[0];
}
