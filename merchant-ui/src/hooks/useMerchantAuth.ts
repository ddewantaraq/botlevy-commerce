import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import {
  CHAIN_ID,
  siweLogout,
  useWalletSiweLogin,
} from "@botlevy-commerce/shared";
import type { Merchant } from "../types/merchant";

type Opts = {
  merchant: Merchant | null;
  refresh: () => Promise<void>;
  onLogoutClear: () => void;
};

export function useMerchantAuth({ merchant, refresh, onLogoutClear }: Opts) {
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const wrongChain = isConnected && chainId !== CHAIN_ID;
  const signedIn =
    !!merchant &&
    !!address &&
    merchant.payTo.toLowerCase() === address.toLowerCase();

  const {
    startLogin,
    busy: walletBusy,
    buttonLabel,
    error: walletError,
    connectError,
    clearIntent,
  } = useWalletSiweLogin({
    role: "merchant",
    statement: "Sign in to Botlevy Commerce merchant dashboard",
    signedIn,
    onSignedIn: async () => {
      await refresh();
    },
  });

  async function logout() {
    clearIntent();
    await siweLogout();
    onLogoutClear();
    disconnect();
  }

  return {
    address,
    signedIn,
    wrongChain,
    walletBusy,
    buttonLabel,
    walletError,
    connectError,
    startLogin,
    logout,
    switchToBsc: () => switchChain({ chainId: bscTestnet.id }),
  };
}
