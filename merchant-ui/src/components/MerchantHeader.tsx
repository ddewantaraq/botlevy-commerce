import { hasInjectedProvider } from "@botlevy-commerce/shared";
import { LoginInfoButton } from "./LoginInfoButton";

type Props = {
  signedIn: boolean;
  walletBusy: boolean;
  buttonLabel: string;
  walletError: string | null | undefined;
  connectError: Error | null | undefined;
  address: string | undefined;
  wrongChain: boolean;
  error: string;
  onLogin: () => void;
  onLogout: () => void;
  onSwitchChain: () => void;
  onOpenLoginHelp: () => void;
};

export function MerchantHeader({
  signedIn,
  walletBusy,
  buttonLabel,
  walletError,
  connectError,
  address,
  wrongChain,
  error,
  onLogin,
  onLogout,
  onSwitchChain,
  onOpenLoginHelp,
}: Props) {
  return (
    <section className="rounded-xl border border-[var(--line)] bg-white/60 p-5">
      <h1 className="text-2xl font-semibold text-[var(--ink)]">Warung dashboard</h1>
      <p className="mt-2 text-sm">
        Catalog, AI tag suggestions, and orders on BSC Testnet (97). Separate from
        the cooker chat app.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {!signedIn ? (
          <div className="flex items-start gap-2">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                disabled={walletBusy}
                onClick={onLogin}
                className="min-h-11 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {buttonLabel}
              </button>
              {!hasInjectedProvider() ? (
                <span className="text-[10px] text-[var(--muted)]">
                  Opens MetaMask app on phone
                </span>
              ) : null}
              {walletError || connectError ? (
                <span className="text-[10px] text-red-700">
                  {walletError || connectError?.message || "Connect failed"}
                </span>
              ) : null}
            </div>
            <LoginInfoButton onClick={onOpenLoginHelp} />
          </div>
        ) : (
          <>
            <span className="font-mono text-xs">{address}</span>
            {wrongChain ? (
              <button
                type="button"
                onClick={onSwitchChain}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Switch to BSC Testnet
              </button>
            ) : (
              <button
                type="button"
                onClick={onLogout}
                className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
              >
                Logout
              </button>
            )}
            <span className="text-xs text-[var(--accent)]">Signed in as merchant</span>
          </>
        )}
      </div>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
