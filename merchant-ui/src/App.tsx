import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { config } from "@botlevy-commerce/shared";
import { MerchantPage } from "./pages/MerchantPage";

const queryClient = new QueryClient();

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen">
          <header className="border-b border-[#d5e0dd] bg-white/70 backdrop-blur">
            <div className="mx-auto max-w-3xl px-4 py-4">
              <p className="text-lg font-semibold text-[#14201e]">Botlevy Merchant</p>
              <p className="text-xs text-[#3d4a47]">Warung dashboard · BSC Testnet</p>
            </div>
          </header>
          <main className="mx-auto max-w-3xl px-4 py-8">
            <MerchantPage />
          </main>
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
