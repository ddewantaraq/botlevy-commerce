import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { bscTestnet } from "wagmi/chains";
import { API_URL, CHAIN_ID, MOCK_USDC_ADDRESS, config } from "../lib/wagmi";
import { MOCK_USDC_ABI, formatMusdc } from "../lib/token";
import { siweLogin, siweLogout } from "../lib/siwe";

type Step = {
  tool: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  at: string;
};

type Quote = {
  id: string;
  merchantId: string;
  merchantName: string;
  payTo: string;
  tokenAddress: string;
  chainId: number;
  total: number;
  lines: Array<{ name: string; qty: number; unitPrice: number; tag: string }>;
  substitutions: Array<{ fromTag: string; toTag: string; reason: string }>;
};

const PANTRY_OPTIONS = [
  "salt",
  "cooking_oil",
  "kecap_manis",
  "potato",
  "shallot",
  "nutmeg",
  "chicken",
];

export function AgentPage() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const [goal, setGoal] = useState("I want to cook ayam semur tonight");
  const [pantry, setPantry] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [plan, setPlan] = useState<{ dish: string; steps: string[]; ingredients: unknown[] } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [orderId, setOrderId] = useState("");
  const [explorerUrl, setExplorerUrl] = useState("");
  const [cookerAddress, setCookerAddress] = useState("");

  const [payTxHash, setPayTxHash] = useState<`0x${string}` | undefined>();
  const { writeContractAsync, isPending: paying } = useWriteContract();
  const [confirming, setConfirming] = useState(false);

  const wrongChain = isConnected && chainId !== CHAIN_ID;
  const signedIn =
    !!cookerAddress &&
    !!address &&
    cookerAddress.toLowerCase() === address.toLowerCase();

  const pantrySet = useMemo(() => new Set(pantry), [pantry]);

  const refreshSession = useCallback(async () => {
    const me = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
    if (!me.ok) {
      setCookerAddress("");
      return;
    }
    const data = await me.json();
    if (data.role === "cooker" && data.address) setCookerAddress(data.address);
    else setCookerAddress("");
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  async function login() {
    setBusy(true);
    setError("");
    try {
      if (wrongChain) await switchChain({ chainId: bscTestnet.id });
      if (!address) throw new Error("Connect wallet first");
      const data = await siweLogin({
        address,
        role: "cooker",
        statement: "Sign in to Botlevy Commerce as a cooker",
        signMessageAsync,
      });
      setCookerAddress(data.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await siweLogout();
    setCookerAddress("");
    disconnect();
  }

  async function runAgent() {
    if (!signedIn) {
      setError("Sign in as a cooker before running the agent");
      return;
    }
    setBusy(true);
    setError("");
    setOrderId("");
    setExplorerUrl("");
    try {
      const res = await fetch(`${API_URL}/agent/runs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, pantry }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || "Agent run failed");
      }
      setSteps(data.steps ?? []);
      setPlan(data.plan ?? null);
      setQuote(data.quote ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function payQuote() {
    if (!quote || !address || !signedIn) return;
    setError("");
    if (!MOCK_USDC_ADDRESS) {
      setError("Set VITE_MOCK_USDC_ADDRESS in .env (deploy MockUSDC first)");
      return;
    }
    if (wrongChain) {
      await switchChain({ chainId: bscTestnet.id });
    }
    try {
      const hash = await writeContractAsync({
        address: MOCK_USDC_ADDRESS,
        abi: MOCK_USDC_ABI,
        functionName: "transfer",
        args: [quote.payTo as `0x${string}`, BigInt(quote.total)],
        chainId: bscTestnet.id,
      });
      setPayTxHash(hash);

      setConfirming(true);
      await waitForTransactionReceipt(config, { hash });

      const res = await fetch(`${API_URL}/orders`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.id,
          txHash: hash,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || "Order create failed");
      }
      setOrderId(data.order.id);
      setExplorerUrl(data.explorerUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#e7e7e0] bg-white/60 p-5">
        <h1 className="text-2xl font-semibold text-[#1a1a17]">Commerce agent run</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed">
          Sign in with your cooker wallet, then submit a cooking goal. Payment goes to the
          matched merchant&apos;s real wallet. Use a different browser profile than the merchant.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!isConnected ? (
            <button
              type="button"
              disabled={connecting}
              onClick={() => connect({ connector: connectors[0] })}
              className="rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white"
            >
              Connect cooker wallet
            </button>
          ) : (
            <>
              <span className="font-mono text-xs text-[#4a4a44]">{address}</span>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-md border border-[#e7e7e0] px-3 py-1.5 text-sm"
              >
                Disconnect
              </button>
              {wrongChain ? (
                <button
                  type="button"
                  onClick={() => switchChain({ chainId: bscTestnet.id })}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white"
                >
                  Switch to BSC Testnet (97)
                </button>
              ) : signedIn ? (
                <span className="text-xs text-[#0f766e]">Signed in as cooker</span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void login()}
                  className="rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white"
                >
                  {busy ? "Signing…" : "SIWE login as cooker"}
                </button>
              )}
            </>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[#e7e7e0] bg-white/60 p-5 space-y-4">
        <label className="block text-sm font-medium text-[#1a1a17]">
          Goal
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-[#e7e7e0] bg-transparent px-3 py-2 text-sm"
          />
        </label>

        <div>
          <p className="text-sm font-medium text-[#1a1a17]">Optional pantry (what you already have)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PANTRY_OPTIONS.map((tag) => {
              const on = pantrySet.has(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setPantry((prev) =>
                      on ? prev.filter((t) => t !== tag) : [...prev, tag],
                    )
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    on
                      ? "border-[#bcded4] bg-[#e8f3ef] text-[#0f766e]"
                      : "border-[#e7e7e0] text-[#4a4a44]"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          disabled={busy || !goal.trim() || !signedIn}
          onClick={() => void runAgent()}
          className="rounded-md bg-[#0f766e] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Agent running…" : "Start agent run"}
        </button>
        {!signedIn ? (
          <p className="text-xs text-[#6f6f66]">Sign in as a cooker to run the agent.</p>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {steps.length > 0 ? (
        <section className="rounded-xl border border-[#e7e7e0] bg-white/60 p-5">
          <h2 className="text-lg font-semibold text-[#1a1a17]">Tool step trace</h2>
          <ol className="mt-3 space-y-2">
            {steps.map((s, i) => (
              <li
                key={`${s.tool}-${i}`}
                className="rounded-md border border-[#e7e7e0] px-3 py-2 text-sm"
              >
                <p className="font-mono text-[#0f766e]">{s.tool}</p>
                {s.error ? (
                  <p className="text-red-600">{s.error}</p>
                ) : (
                  <pre className="mt-1 overflow-x-auto text-xs text-[#4a4a44]">
                    {JSON.stringify(s.result, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {plan ? (
        <section className="rounded-xl border border-[#e7e7e0] bg-white/60 p-5">
          <h2 className="text-lg font-semibold text-[#1a1a17]">Plan · {plan.dish}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {plan.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {quote ? (
        <section className="rounded-xl border border-[#e7e7e0] bg-white/60 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-[#1a1a17]">Quote</h2>
          <p className="text-sm">
            Merchant: <strong>{quote.merchantName}</strong>
          </p>
          <p className="text-sm">
            Total: <strong>{formatMusdc(quote.total)} mUSDC</strong>
          </p>
          <p className="text-sm break-all">
            Pay to wallet: <span className="font-mono text-xs">{quote.payTo}</span>
          </p>
          <ul className="space-y-1 text-sm">
            {quote.lines.map((l) => (
              <li key={`${l.tag}-${l.name}`}>
                {l.name} × {l.qty} — {formatMusdc(l.unitPrice)} mUSDC each
              </li>
            ))}
          </ul>
          {quote.substitutions?.length ? (
            <div className="text-sm text-amber-800">
              Substitutions:{" "}
              {quote.substitutions.map((s) => `${s.fromTag}→${s.toTag}`).join(", ")}
            </div>
          ) : null}
          <button
            type="button"
            disabled={!signedIn || paying || confirming || !!orderId}
            onClick={() => void payQuote()}
            className="rounded-md bg-[#0f766e] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {paying || confirming ? "Paying / confirming…" : "Pay merchant wallet"}
          </button>
          {payTxHash ? (
            <p className="font-mono text-xs break-all">tx: {payTxHash}</p>
          ) : null}
          {orderId ? (
            <p className="text-sm text-[#0f766e]">
              Order <strong>{orderId}</strong> created.{" "}
              {explorerUrl ? (
                <a className="underline" href={explorerUrl} target="_blank" rel="noreferrer">
                  View on BscScan
                </a>
              ) : null}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
