import { hasInjectedProvider } from "@botlevy-commerce/shared";
import type { CookingSession } from "../types/chat";
import { LoginInfoButton } from "./LoginInfoButton";

type Props = {
  session: CookingSession | null;
  handsFree: boolean;
  pendingHandsFreeAsk: boolean;
  signedIn: boolean;
  walletBusy: boolean;
  buttonLabel: string;
  walletError: string | null | undefined;
  connectError: Error | null | undefined;
  address: string | undefined;
  wrongChain: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onSwitchChain: () => void;
  onOpenLoginHelp: () => void;
};

export function CookerHeader({
  session,
  handsFree,
  pendingHandsFreeAsk,
  signedIn,
  walletBusy,
  buttonLabel,
  walletError,
  connectError,
  address,
  wrongChain,
  onLogin,
  onLogout,
  onSwitchChain,
  onOpenLoginHelp,
}: Props) {
  const statusLine = session
    ? `Sesi: ${session.status} · ${session.dish}${
        session.status === "cooking" || session.status === "prep"
          ? handsFree
            ? " · Hands-free on"
            : pendingHandsFreeAsk
              ? " · Hands-free?"
              : ""
          : ""
      }`
    : "Chat · plan · pre-cook · cook-time";

  return (
    <header className="shrink-0 border-b border-[var(--line)] bg-[var(--canvas)]/90 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-[var(--ink)]">
              Botlevy Cooker
            </p>
            {!signedIn ? (
              <LoginInfoButton onClick={onOpenLoginHelp} />
            ) : null}
          </div>
          <p className="text-xs text-[var(--muted)]">{statusLine}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {!signedIn ? (
            <>
              <button
                type="button"
                disabled={walletBusy}
                onClick={onLogin}
                className="whitespace-nowrap rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 sm:px-4 sm:text-sm"
              >
                {buttonLabel}
              </button>
              {!hasInjectedProvider() ? (
                <span className="text-[10px] text-[var(--muted)]">
                  Opens MetaMask app on phone
                </span>
              ) : null}
              {walletError || connectError ? (
                <span className="max-w-[12rem] text-right text-[10px] text-red-600">
                  {walletError || connectError?.message || "Connect failed"}
                </span>
              ) : null}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="hidden font-mono text-[10px] sm:inline">
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </span>
              {wrongChain ? (
                <button
                  type="button"
                  onClick={onSwitchChain}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Switch 97
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs"
                >
                  Logout
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
