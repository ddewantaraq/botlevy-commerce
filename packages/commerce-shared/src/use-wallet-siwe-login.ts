import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAccount,
  useConnect,
  useSignMessage,
  useSwitchChain,
} from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { getPreferredConnector } from "./wagmi";
import {
  clearSiweLoginIntent,
  hasSiweLoginIntent,
  setSiweLoginIntent,
} from "./siwe-intent";
import { siweLogin, type SessionRole } from "./siwe";

export type WalletSiwePhase = "idle" | "connecting" | "signing";

export type SiweLoginResult = Awaited<ReturnType<typeof siweLogin>>;

/**
 * One-button wallet + SIWE login with PWA-safe resume after MetaMask deeplink.
 * Set intent in sessionStorage, connect, then run SIWE when connected
 * (survives SPA remount when returning from the MetaMask app).
 */
export function useWalletSiweLogin(opts: {
  role: SessionRole;
  statement: string;
  signedIn: boolean;
  onSignedIn: (data: SiweLoginResult) => void | Promise<void>;
}) {
  const { address, isConnected, chainId } = useAccount();
  const { connectAsync, connectors, error: connectError, isPending: connecting } =
    useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();

  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<WalletSiwePhase>("idle");
  const [error, setError] = useState("");
  const signingRef = useRef(false);
  const onSignedInRef = useRef(opts.onSignedIn);
  onSignedInRef.current = opts.onSignedIn;

  const runSiwe = useCallback(async () => {
    if (!address || opts.signedIn || signingRef.current) return;
    if (!hasSiweLoginIntent(opts.role)) return;

    signingRef.current = true;
    setBusy(true);
    setPhase("signing");
    setError("");
    try {
      if (chainId !== bscTestnet.id) {
        await switchChainAsync({ chainId: bscTestnet.id });
      }
      const data = await siweLogin({
        address,
        role: opts.role,
        statement: opts.statement,
        signMessageAsync,
      });
      clearSiweLoginIntent();
      await onSignedInRef.current(data);
    } catch (err) {
      clearSiweLoginIntent();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      signingRef.current = false;
      setBusy(false);
      setPhase("idle");
    }
  }, [
    address,
    chainId,
    opts.role,
    opts.signedIn,
    opts.statement,
    signMessageAsync,
    switchChainAsync,
  ]);

  // Resume SIWE after connect (incl. PWA remount returning from MetaMask).
  useEffect(() => {
    if (opts.signedIn && hasSiweLoginIntent(opts.role)) {
      clearSiweLoginIntent();
      setBusy(false);
      setPhase("idle");
      return;
    }
    if (
      isConnected &&
      address &&
      !opts.signedIn &&
      hasSiweLoginIntent(opts.role) &&
      !signingRef.current
    ) {
      void runSiwe();
    }
  }, [isConnected, address, opts.signedIn, opts.role, runSiwe]);

  const startLogin = useCallback(async () => {
    setError("");
    setSiweLoginIntent(opts.role);

    if (isConnected && address) {
      await runSiwe();
      return;
    }

    setPhase("connecting");
    setBusy(true);
    try {
      const connector = getPreferredConnector(connectors);
      if (!connector) throw new Error("No wallet connector available");
      await connectAsync({ connector });
      // SIWE runs via effect once isConnected (also covers remount after deeplink).
    } catch (err) {
      clearSiweLoginIntent();
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      setPhase("idle");
    }
  }, [
    address,
    connectAsync,
    connectors,
    isConnected,
    opts.role,
    runSiwe,
  ]);

  const buttonLabel =
    phase === "connecting" || connecting
      ? "Connecting…"
      : phase === "signing"
        ? "Signing…"
        : "Masuk dengan MetaMask";

  return {
    startLogin,
    busy: busy || connecting,
    phase: connecting && phase === "idle" ? ("connecting" as const) : phase,
    error,
    connectError,
    buttonLabel,
    clearError: () => setError(""),
    clearIntent: clearSiweLoginIntent,
  };
}
