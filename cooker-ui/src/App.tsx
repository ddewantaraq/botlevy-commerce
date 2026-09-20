import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { config } from "@botlevy-commerce/shared";
import { CookerChatPage } from "./pages/CookerChatPage";

const queryClient = new QueryClient();

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <CookerChatPage />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
