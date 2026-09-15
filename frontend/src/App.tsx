import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { config } from "./lib/wagmi";
import { AgentPage } from "./pages/AgentPage";
import { MerchantPage } from "./pages/MerchantPage";

const queryClient = new QueryClient();

function Shell() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-[#e7e7e0] bg-[#f5f5ee]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-lg font-semibold text-[#1a1a17]">Botlevy Commerce</p>
            <p className="text-xs text-[#6f6f66]">Year 1 Active · BSC Testnet agent loop</p>
          </div>
          <nav className="flex gap-3 text-sm font-medium">
            <NavLink
              to="/"
              className={({ isActive }) =>
                isActive ? "text-[#0f766e]" : "text-[#4a4a44] hover:text-[#1a1a17]"
              }
            >
              Agent run
            </NavLink>
            <NavLink
              to="/merchant"
              className={({ isActive }) =>
                isActive ? "text-[#0f766e]" : "text-[#4a4a44] hover:text-[#1a1a17]"
              }
            >
              Merchant
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          <Route path="/" element={<AgentPage />} />
          <Route path="/merchant" element={<MerchantPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
