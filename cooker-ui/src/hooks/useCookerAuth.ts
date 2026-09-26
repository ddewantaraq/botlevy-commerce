import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import {
  API_URL,
  CHAIN_ID,
  siweLogout,
  useWalletSiweLogin,
} from "@botlevy-commerce/shared";
import type { CookingSession } from "../types/chat";
import {
  isActiveCookStatus,
  type CookerChatRefs,
} from "./useCookerChatRefs";

type Opts = {
  refs: CookerChatRefs;
  setSession: (session: CookingSession | null) => void;
  setPantry: (pantry: string[]) => void;
  onLogoutClear: () => void;
};

export function useCookerAuth({
  refs,
  setSession,
  setPantry,
  onLogoutClear,
}: Opts) {
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [cookerAddress, setCookerAddress] = useState("");

  // Keep setters in refs so refreshSession stays stable (avoids /auth/me loops).
  const setSessionRef = useRef(setSession);
  const setPantryRef = useRef(setPantry);
  const onLogoutClearRef = useRef(onLogoutClear);
  setSessionRef.current = setSession;
  setPantryRef.current = setPantry;
  onLogoutClearRef.current = onLogoutClear;

  const wrongChain = isConnected && chainId !== CHAIN_ID;
  const signedIn =
    !!cookerAddress &&
    !!address &&
    cookerAddress.toLowerCase() === address.toLowerCase();

  const { sessionRef, sessionStatusRef } = refs;

  const refreshSession = useCallback(async () => {
    try {
      const me = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
      // Only clear session on auth failure — not on 429/5xx (would wipe a just-completed SIWE).
      if (me.status === 401) {
        setCookerAddress("");
        return;
      }
      if (!me.ok) {
        console.warn("[cooker] /auth/me failed:", me.status);
        return;
      }
      const data = (await me.json()) as {
        role?: string;
        address?: string;
      };
      if (data.role === "cooker" && data.address) {
        setCookerAddress(data.address);
        const [p, s] = await Promise.all([
          fetch(`${API_URL}/cooker/pantry`, { credentials: "include" }),
          fetch(`${API_URL}/cooker/sessions/active`, {
            credentials: "include",
          }),
        ]);
        if (p.ok) {
          const pj = await p.json();
          setPantryRef.current(pj.pantry ?? []);
        }
        if (s.ok) {
          const sj = await s.json();
          const remote = sj.session ?? null;
          if (
            !remote &&
            sessionRef.current &&
            isActiveCookStatus(sessionRef.current.status)
          ) {
            return;
          }
          if (remote) {
            sessionRef.current = remote;
            sessionStatusRef.current = remote.status;
            setSessionRef.current(remote);
          } else if (
            !sessionRef.current ||
            !isActiveCookStatus(sessionRef.current.status)
          ) {
            sessionRef.current = null;
            sessionStatusRef.current = null;
            setSessionRef.current(null);
          }
        }
      } else {
        setCookerAddress("");
      }
    } catch (err) {
      console.warn("[cooker] refreshSession error:", err);
    }
  }, [sessionRef, sessionStatusRef]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const {
    startLogin,
    busy: walletBusy,
    buttonLabel,
    error: walletError,
    connectError,
    clearIntent,
  } = useWalletSiweLogin({
    role: "cooker",
    statement: "Sign in to Botlevy Cooker",
    signedIn,
    onSignedIn: async (data) => {
      setCookerAddress(data.address);
      await refreshSession();
    },
  });

  async function logout() {
    clearIntent();
    await siweLogout();
    setCookerAddress("");
    onLogoutClearRef.current();
    disconnect();
  }

  return {
    address,
    cookerAddress,
    signedIn,
    wrongChain,
    walletBusy,
    buttonLabel,
    walletError,
    connectError,
    startLogin,
    logout,
    refreshSession,
    switchToBsc: () => switchChain({ chainId: bscTestnet.id }),
  };
}
