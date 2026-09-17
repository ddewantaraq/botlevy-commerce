/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_CHAIN_ID: string;
  readonly VITE_MOCK_USDC_ADDRESS: string;
  readonly VITE_BSC_RPC_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
